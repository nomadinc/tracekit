"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Menu,
  Pause,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  SkipForward,
  UserRound,
  X,
} from "lucide-react";
import { AccessBoundary } from "@/components/identity/access-control";
import { useIdentity } from "@/components/identity/identity-provider";
import { mockOrganizationIdForBusinessContext } from "@/lib/identity/mock";
import { useShellDrawer } from "@/components/layout/shell-drawer";
import { customerRepository } from "@/lib/customers/mock-repository";
import {
  customerDeepLinkHref,
  normalizeCustomerDeepLink,
  parseCustomerDeepLink,
} from "@/lib/customers/deep-link";
import { withDevelopmentIdentity } from "@/lib/identity/development-state";
import { PRODUCTION_ROUTES } from "@/lib/navigation/production-routes";
import type {
  CustomerDeepLinkState,
  CustomerListFilter,
  CustomerSummary,
  CustomerWorkspaceSnapshot,
} from "@/lib/customers/types";
import { CustomerDrawerContent } from "./customer-drawer-content";
const money = (v: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);
export function CustomerWorkspace() {
  return (
    <AccessBoundary permission="customers.view" variants={["client", "agency"]}>
      <CustomerWorkspaceContent />
    </AccessBoundary>
  );
}
function CustomerWorkspaceContent() {
  const router = useRouter(),
    params = useSearchParams(),
    drawer = useShellDrawer();
  const { session, setActiveOrganization, setActiveBusinessContext } =
    useIdentity();
  const scope = React.useMemo(
    () => ({
      authenticated: session.authenticated,
      identity: session.identity,
      organizationId:
        mockOrganizationIdForBusinessContext(
          session.activeBusinessContextId,
        ) || session.activeOrganizationId,
      businessContextId: session.activeBusinessContextId,
    }),
    [session],
  );
  const requested = React.useMemo(
    () => parseCustomerDeepLink(params),
    [params],
  );
  const [customers, setCustomers] = React.useState<CustomerSummary[]>([]),
    [snapshot, setSnapshot] = React.useState<CustomerWorkspaceSnapshot | null>(
      null,
    ),
    [filter, setFilter] = React.useState<CustomerListFilter>({ state: "all" }),
    [loading, setLoading] = React.useState(true),
    [error, setError] = React.useState<string | null>(null),
    [listOpen, setListOpen] = React.useState(false),
    [replaying, setReplaying] = React.useState(false),
    [replayIndex, setReplayIndex] = React.useState(0);
  const normalized = React.useMemo(
    () => normalizeCustomerDeepLink(requested, customers, snapshot),
    [requested, customers, snapshot],
  );
  const go = React.useCallback(
    (next: Partial<CustomerDeepLinkState>) =>
      router.push(
        withDevelopmentIdentity(
          customerDeepLinkHref({ ...normalized, ...next }),
          session.identity.id,
        ),
        { scroll: false },
      ),
    [normalized, router, session.identity.id],
  );
  React.useEffect(() => {
    let on = true;
    setLoading(true);
    customerRepository
      .listCustomers(scope, { ...filter, offerId: requested.offerId })
      .then((v) => on && setCustomers(v))
      .catch(
        (e) =>
          on &&
          setError(e instanceof Error ? e.message : "Repository unavailable"),
      )
      .finally(() => on && setLoading(false));
    return () => {
      on = false;
    };
  }, [filter, requested.offerId, scope]);
  React.useEffect(() => {
    if (
      !requested.customerId ||
      customers.some((c) => c.id === requested.customerId)
    )
      return;
    let on = true;
    customerRepository
      .resolveCustomer(
        { ...scope, organizationId: null, businessContextId: null },
        requested.customerId,
      )
      .then((r) => {
        if (!on || !r) return;
        if (r.organizationId !== scope.organizationId)
          setActiveOrganization(r.organizationId);
        if (r.businessContextId) setActiveBusinessContext(r.businessContextId);
      });
    return () => {
      on = false;
    };
  }, [
    customers,
    requested.customerId,
    scope,
    scope.organizationId,
    setActiveBusinessContext,
    setActiveOrganization,
  ]);
  React.useEffect(() => {
    if (!normalized.customerId) {
      setSnapshot(null);
      return;
    }
    let on = true;
    customerRepository
      .loadWorkspace(scope, normalized.customerId)
      .then((v) => on && setSnapshot(v));
    return () => {
      on = false;
    };
  }, [normalized.customerId, scope]);
  React.useEffect(() => {
    setReplaying(false);
    setReplayIndex(0);
    drawer.closeDrawer();
  }, [normalized.customerId, drawer]);
  React.useEffect(() => {
    const id =
      normalized.drawerId ||
      (normalized.eventId
        ? `event:${normalized.eventId}`
        : normalized.orderId
          ? `order:${normalized.orderId}`
          : null);
    if (!id || !snapshot) return;
    let on = true;
    customerRepository.loadDrawer(scope, snapshot.customer.id, id).then((r) => {
      if (on && r)
        drawer.openDrawer(<CustomerDrawerContent record={r} />, r.title, { onDismiss: () => router.push(withDevelopmentIdentity(customerDeepLinkHref({ ...normalized, drawer: null, drawerId: null, eventId: null, identifierRef: null, orderId: null }), session.identity.id), { scroll: false }) });
    });
    return () => {
      on = false;
    };
  }, [
    drawer,
    normalized.drawerId,
    normalized.eventId,
    normalized.orderId,
    normalized,
    router,
    session.identity.id,
    scope,
    snapshot,
  ]);
  React.useEffect(() => {
    if (!replaying || !snapshot) return;
    const t = window.setInterval(
      () =>
        setReplayIndex((i) =>
          i >= snapshot.journey.length - 1 ? (setReplaying(false), i) : i + 1,
        ),
      1100,
    );
    return () => window.clearInterval(t);
  }, [replaying, snapshot]);
  const inspect = async (id: string) => {
    if (!snapshot) return;
    const r = await customerRepository.loadDrawer(
      scope,
      snapshot.customer.id,
      id,
    );
    if (r) drawer.openDrawer(<CustomerDrawerContent record={r} />, r.title);
  };
  if (loading && !snapshot)
    return <State title="Loading Customer Workspace…" />;
  if (error)
    return <State title="Customer Workspace unavailable" detail={error} />;
  if (!customers.length)
    return (
      <State
        title="No accessible Customers"
        detail="No Customers match the active scope and filters."
      />
    );
  if (!snapshot) return <State title="Customer not found" />;
  const active = snapshot.journey[replayIndex];
  return (
    <div className="flex min-h-[calc(100dvh-8rem)] overflow-hidden rounded-xl border bg-white shadow-sm dark:border-white/10 dark:bg-ink">
      <CustomerList
        customers={customers}
        selected={snapshot.customer.id}
        filter={filter}
        setFilter={setFilter}
        select={(id) => {
          go({
            customerId: id,
            eventId: null,
            identifier: null,
            orderId: null,
            drawerId: null,
            replay: false,
          });
          setListOpen(false);
        }}
        mobile={listOpen}
        close={() => setListOpen(false)}
      />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <header className="border-b p-5 dark:border-white/10">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-3">
              <button
                onClick={() => setListOpen(true)}
                className="rounded-lg border p-2 lg:hidden"
              >
                <Menu className="h-4 w-4" />
              </button>
              <span className="flex h-10 w-10 items-center justify-center rounded-full border">
                <UserRound className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[9px] uppercase tracking-[.14em] text-slate-400">
                  Customer · Permanent Context
                </p>
                <h1 className="text-2xl font-semibold">
                  {snapshot.customer.name}
                </h1>
                <p className="text-xs text-slate-500">
                  {snapshot.customer.status} ·{" "}
                  {snapshot.customer.sensitiveMasked
                    ? "Sensitive details masked"
                    : snapshot.customer.email}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[9px] uppercase text-slate-400">Profit</p>
              <strong className="text-3xl">
                {money(snapshot.customer.profit)}
              </strong>
              <p className="text-[10px] font-semibold">
                ✓ {snapshot.customer.profitStatus}
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-4 border-t pt-4 sm:grid-cols-3 lg:grid-cols-6 dark:border-white/10">
            {[
              ["Lifetime revenue", money(snapshot.lifetimeRevenue)],
              ["Customer since", snapshot.customerSince],
              ["First touch", snapshot.firstTouch],
              ["Last purchase", snapshot.lastPurchase],
              ["Tracking Health", snapshot.customer.trackingHealth],
              ["Journey ID", snapshot.journeyId],
            ].map(([l, v]) => (
              <div key={l}>
                <p className="text-[9px] uppercase text-slate-400">{l}</p>
                <strong className="text-xs">{v}</strong>
              </div>
            ))}
          </div>
        </header>
        <section className="border-b p-5 dark:border-white/10">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Customer Story</h2>
              <p className="text-[11px] text-slate-500">
                Discovery, attribution, commerce, and financial outcome.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setReplaying((v) => !v)}
                className="rounded-lg border p-2"
              >
                {replaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </button>
              <button
                onClick={() => {
                  setReplaying(false);
                  setReplayIndex(0);
                }}
                className="rounded-lg border p-2"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                onClick={() =>
                  setReplayIndex((i) =>
                    Math.min(snapshot.journey.length - 1, i + 1),
                  )
                }
                className="rounded-lg border p-2"
              >
                <SkipForward className="h-4 w-4" />
              </button>
              <button
                onClick={() => inspect(`event:${active.id}`)}
                className="rounded-lg border px-3 text-xs font-semibold"
              >
                Inspect active
              </button>
            </div>
          </div>
          <div className="mt-5 flex gap-2 overflow-x-auto pb-3">
            {snapshot.journey.map((e, i) => (
              <button
                key={e.id}
                title={`${e.timestamp} · ${e.domain} · ${e.trackingStatus}`}
                onFocus={() => setReplayIndex(i)}
                onClick={() =>
                  go({
                    focus: "journey",
                    eventId: e.id,
                    drawerId: `event:${e.id}`,
                  })
                }
                className={`min-w-[150px] rounded-xl border p-3 text-left focus:ring-2 ${e.id === normalized.eventId || (i === replayIndex && replaying) ? "border-2 border-slate-950 bg-slate-50 dark:border-white dark:bg-white/10" : "dark:border-white/10"}`}
              >
                <span className="text-[9px] uppercase text-slate-400">
                  {i + 1} · {e.role}
                </span>
                <strong className="mt-1 block text-xs">{e.name}</strong>
                <span className="mt-2 block text-[10px] text-slate-500">
                  {e.timestamp}
                </span>
                <span className="mt-1 block text-[10px] font-semibold">
                  {e.status} · {e.confidence}
                </span>
              </button>
            ))}
          </div>
        </section>
        <div className="grid gap-5 p-5 xl:grid-cols-2">
          <section className="rounded-xl border dark:border-white/10">
            <Title text="Tracking Health" />
            <button
              onClick={() => inspect("tracking")}
              className="w-full p-5 text-left"
            >
              <strong className="flex gap-2">
                <ShieldCheck className="h-5 w-5" />
                {snapshot.customer.trackingHealth}
              </strong>
              <p className="mt-2 text-xs text-slate-500">
                {snapshot.trackingExplanation}
              </p>
              <span className="mt-3 block text-xs font-semibold">
                Explain · Evidence →
              </span>
            </button>
            {snapshot.privacySignals.map((p) => (
              <button
                key={p.id}
                onClick={() => inspect(`privacy:${p.id}`)}
                className="flex w-full gap-3 border-t p-4 text-left dark:border-white/10"
              >
                <AlertTriangle className="h-4 w-4" />
                <span>
                  <strong className="block text-xs">{p.label}</strong>
                  <span className="text-[10px] text-slate-500">
                    {p.state} · {p.explanation}
                  </span>
                </span>
              </button>
            ))}
          </section>
          <section className="rounded-xl border dark:border-white/10">
            <Title text="Related Orders" />
            {snapshot.orders.map((o) => (
              <button
                key={o.id}
                onClick={() =>
                  go({
                    focus: "orders",
                    orderId: o.id,
                    drawerId: `order:${o.id}`,
                  })
                }
                className="grid w-full grid-cols-[1fr_auto] border-b p-4 text-left dark:border-white/10"
              >
                <span>
                  <strong className="text-xs">{o.number}</strong>
                  <span className="block text-[10px] text-slate-500">
                    {o.date} · {o.status} · {o.offerName}
                  </span>
                </span>
                <span className="text-right text-xs">
                  <strong>{money(o.amount)}</strong>
                  <span className="block">
                    {o.profit === null ? "Profit restricted" : money(o.profit)}
                  </span>
                </span>
              </button>
            ))}
            <button
              onClick={() =>
                router.push(
                  withDevelopmentIdentity(PRODUCTION_ROUTES.orders({ orderId: snapshot.orders[0]?.id || null, customerId: snapshot.customer.id, focus: "timeline" }), session.identity.id),
                )
              }
              className="p-4 text-xs font-semibold"
            >
              Open production Orders →
            </button>
          </section>
        </div>
        <section className="mx-5 mb-5 rounded-xl border p-4 dark:border-white/10">
          <Title text="Related Offers" />
          {snapshot.offers.map((o) => (
            <button
              key={o.id}
              onClick={() =>
                router.push(
                  withDevelopmentIdentity(PRODUCTION_ROUTES.offers({ offerId: o.id, focus: "summary" }), session.identity.id),
                )
              }
              className="m-2 rounded-lg border px-3 py-2 text-xs font-semibold"
            >
              {o.name} · {o.firstTouch}
            </button>
          ))}
        </section>
      </main>
    </div>
  );
}
function CustomerList({
  customers,
  selected,
  filter,
  setFilter,
  select,
  mobile,
  close,
}: {
  customers: CustomerSummary[];
  selected: string;
  filter: CustomerListFilter;
  setFilter: (f: CustomerListFilter) => void;
  select: (id: string) => void;
  mobile: boolean;
  close: () => void;
}) {
  return (
    <aside
      className={`${mobile ? "fixed inset-0 z-40 flex w-full" : "hidden w-[280px] lg:flex"} shrink-0 flex-col border-r bg-white dark:border-white/10 dark:bg-ink`}
    >
      <div className="flex justify-between border-b p-4">
        <div>
          <h2 className="font-semibold">Customers</h2>
          <p className="text-[10px] text-slate-500">
            {customers.length} accessible
          </p>
        </div>
        {mobile ? (
          <button onClick={close}>
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <div className="border-b p-3">
        <label className="flex gap-2 rounded-lg border px-3 py-2">
          <Search className="h-3.5 w-3.5" />
          <input
            value={filter.query || ""}
            onChange={(e) => setFilter({ ...filter, query: e.target.value })}
            placeholder="Search Customers"
            className="min-w-0 flex-1 bg-transparent text-xs outline-none"
          />
        </label>
        <div className="mt-2 flex gap-1">
          {[
            ["All", "all"],
            ["Repeat", "repeat"],
            ["Refunded", "refunded"],
            ["Interference", "interference"],
          ].map(([l, s]) => (
            <button
              key={l}
              onClick={() =>
                setFilter({
                  ...filter,
                  state: s as CustomerListFilter["state"],
                })
              }
              className="rounded-full border px-2 py-1 text-[9px]"
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-y-auto">
        {customers.map((c) => (
          <button
            key={c.id}
            onClick={() => select(c.id)}
            aria-pressed={selected === c.id}
            className={`w-full border-b p-4 text-left ${selected === c.id ? "border-l-4 border-l-slate-950 bg-slate-50 dark:border-l-white dark:bg-white/10" : ""}`}
          >
            <span className="flex justify-between">
              <strong className="text-xs">{c.name}</strong>
              <strong className="text-xs">{money(c.profit)}</strong>
            </span>
            <p className="mt-1 text-[10px] text-slate-500">{c.lastActivity}</p>
            <p className="mt-1 text-[10px]">
              {c.status} · {c.trackingHealth}
            </p>
            <p className="mt-1 truncate text-[9px] text-slate-400">
              {c.journeyPreview}
            </p>
          </button>
        ))}
      </div>
    </aside>
  );
}
const Title = ({ text }: { text: string }) => (
  <h2 className="border-b px-5 py-4 text-sm font-semibold">{text}</h2>
);
const State = ({ title, detail }: { title: string; detail?: string }) => (
  <div className="rounded-xl border bg-white p-8">
    <h2 className="font-semibold">{title}</h2>
    {detail ? <p className="mt-2 text-sm text-slate-500">{detail}</p> : null}
  </div>
);
