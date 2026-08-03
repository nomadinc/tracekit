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
  Sparkles,
  X,
} from "lucide-react";
import { AccessBoundary } from "@/components/identity/access-control";
import { useIdentity } from "@/components/identity/identity-provider";
import { resolveMockRepositoryScope } from "@/lib/identity/mock-repository-scope";
import { useShellDrawer } from "@/components/layout/shell-drawer";
import { withDevelopmentIdentity } from "@/lib/identity/development-state";
import { PRODUCTION_ROUTES } from "@/lib/navigation/production-routes";
import {
  normalizeOrderDeepLink,
  orderDeepLinkHref,
  parseOrderDeepLink,
} from "@/lib/orders/deep-link";
import { orderRepository } from "@/lib/orders/mock-repository";
import type {
  OrderDeepLinkState,
  OrderListFilter,
  OrderSummary,
  OrderWorkspaceSnapshot,
} from "@/lib/orders/types";
import { OrderDrawerContent } from "./order-drawer-content";
const cash = (v: number) => `${v >= 0 ? "+" : "-"}$${Math.abs(v).toFixed(2)}`;
export function OrderWorkspace() {
  return (
    <AccessBoundary permission="orders.view" variants={["client", "agency"]}>
      <OrderWorkspaceContent />
    </AccessBoundary>
  );
}
function OrderWorkspaceContent() {
  const router = useRouter(),
    params = useSearchParams(),
    drawer = useShellDrawer();
  const { session, setActiveOrganization, setActiveBusinessContext } =
    useIdentity();
  const scope = React.useMemo(() => resolveMockRepositoryScope(session), [session]);
  const requested = React.useMemo(() => parseOrderDeepLink(params), [params]);
  const [orders, setOrders] = React.useState<OrderSummary[]>([]),
    [snap, setSnap] = React.useState<OrderWorkspaceSnapshot | null>(null),
    [filter, setFilter] = React.useState<OrderListFilter>({ state: "all" }),
    [loading, setLoading] = React.useState(true),
    [listOpen, setListOpen] = React.useState(false),
    [replaying, setReplaying] = React.useState(false),
    [replayIndex, setReplayIndex] = React.useState(0);
  const normalized = React.useMemo(
    () => normalizeOrderDeepLink(requested, orders, snap),
    [requested, orders, snap],
  );
  const go = React.useCallback(
    (next: Partial<OrderDeepLinkState>) =>
      router.push(
        withDevelopmentIdentity(orderDeepLinkHref({ ...normalized, ...next }), session.identity.id),
        { scroll: false },
      ),
    [normalized, router, session.identity.id],
  );
  React.useEffect(() => {
    let on = true;
    setLoading(true);
    orderRepository
      .listOrders(scope, {
        ...filter,
        offerId: requested.offerId,
        customerId: requested.customerId,
      })
      .then((v) => on && setOrders(v))
      .finally(() => on && setLoading(false));
    return () => {
      on = false;
    };
  }, [filter, requested.customerId, requested.offerId, scope]);
  React.useEffect(() => {
    if (!requested.orderId || orders.some((o) => o.id === requested.orderId))
      return;
    let on = true;
    orderRepository
      .resolveOrder(scope, requested.orderId)
      .then((r) => {
        if (!on || !r) return;
        if (session.developmentOnly && r.organizationId !== scope.mockOrganizationId)
          setActiveOrganization(r.organizationId);
        setActiveBusinessContext(r.businessContextId);
      });
    return () => {
      on = false;
    };
  }, [
    orders,
    requested.orderId,
    scope,
    scope.mockOrganizationId,
    session.developmentOnly,
    setActiveBusinessContext,
    setActiveOrganization,
  ]);
  React.useEffect(() => {
    if (!normalized.orderId) {
      setSnap(null);
      return;
    }
    let on = true;
    orderRepository
      .loadWorkspace(scope, normalized.orderId)
      .then((v) => on && setSnap(v));
    return () => {
      on = false;
    };
  }, [normalized.orderId, scope]);
  React.useEffect(() => {
    setReplaying(false);
    setReplayIndex(0);
    drawer.closeDrawer();
  }, [normalized.orderId, drawer]);
  React.useEffect(() => {
    const id =
      normalized.drawerId ||
      (normalized.lineId
        ? `financial:${normalized.lineId}`
        : normalized.eventId
          ? `event:${normalized.eventId}`
          : null);
    if (!id || !snap) return;
    let on = true;
    orderRepository.loadDrawer(scope, snap.order.id, id).then((r) => {
      if (on && r)
        drawer.openDrawer(<OrderDrawerContent record={r} />, r.title, { onDismiss: () => router.push(withDevelopmentIdentity(orderDeepLinkHref({ ...normalized, drawer: null, drawerId: null, lineId: null, eventId: null, identifierRef: null }), session.identity.id), { scroll: false }) });
    });
    return () => {
      on = false;
    };
  }, [
    drawer,
    normalized.drawerId,
    normalized.eventId,
    normalized.lineId,
    normalized,
    router,
    session.identity.id,
    scope,
    snap,
  ]);
  React.useEffect(() => {
    if (!replaying || !snap) return;
    const t = window.setInterval(
      () =>
        setReplayIndex((i) =>
          i >= snap.timeline.length - 1 ? (setReplaying(false), i) : i + 1,
        ),
      1100,
    );
    return () => clearInterval(t);
  }, [replaying, snap]);
  const inspect = async (id: string) => {
    if (!snap) return;
    const r = await orderRepository.loadDrawer(scope, snap.order.id, id);
    if (r) drawer.openDrawer(<OrderDrawerContent record={r} />, r.title);
  };
  if (loading && !snap) return <State text="Loading Order Workspace…" />;
  if (!orders.length) return <State text="No accessible Orders" />;
  if (!snap) return <State text="Order not found" />;
  const active = snap.timeline[replayIndex];
  return (
    <div className="flex min-h-[calc(100dvh-8rem)] overflow-hidden rounded-xl border bg-white dark:border-white/10 dark:bg-ink">
      <OrderList
        orders={orders}
        selected={snap.order.id}
        filter={filter}
        setFilter={setFilter}
        select={(id) => {
          go({
            orderId: id,
            lineId: null,
            eventId: null,
            identifier: null,
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
          <div className="flex justify-between gap-4">
            <div className="flex gap-3">
              <button
                onClick={() => setListOpen(true)}
                className="rounded-lg border p-2 lg:hidden"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div>
                <p className="text-[9px] uppercase tracking-[.14em] text-slate-400">
                  Order · Permanent Context
                </p>
                <h1 className="text-2xl font-semibold">
                  Order {snap.order.number}
                </h1>
                <p className="text-xs text-slate-500">
                  {snap.order.customerName} · {snap.order.status} ·{" "}
                  {snap.order.trackingHealth}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[9px] uppercase text-slate-400">Net Profit</p>
              <strong className="text-3xl">
                {snap.order.profit === null
                  ? "Restricted"
                  : cash(snap.order.profit)}
              </strong>
              <p className="text-[10px] font-semibold">
                ✓ {snap.order.profitStatus}
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-4 border-t pt-4 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Revenue", `$${snap.order.revenue.toFixed(2)}`],
              [
                "Customer",
                snap.order.sensitiveMasked
                  ? `${snap.order.customerName} · masked`
                  : snap.order.customerEmail,
              ],
              ["Tracking Health", snap.order.trackingHealth],
              ["Traffic Source", snap.attribution.trafficSource],
              ["Offer URL", snap.attribution.offerUrl],
              ["Click → Purchase", snap.attribution.clickPurchaseDelta],
            ].map(([l, v]) => (
              <div key={l}>
                <p className="text-[9px] uppercase text-slate-400">{l}</p>
                <strong className="break-all text-xs">{v}</strong>
              </div>
            ))}
          </div>
        </header>
        {!snap.ledger.length ? (
          <section className="m-5 rounded-xl border p-6">
            <h2 className="font-semibold">Financial details restricted</h2>
            <p className="mt-2 text-sm text-slate-500">
              This identity can inspect the Order Story but cannot view
              financial line detail.
            </p>
          </section>
        ) : (
          <section className="m-5 overflow-hidden rounded-xl border-2 border-slate-900 dark:border-white">
            <div className="border-b p-5">
              <h2 className="text-lg font-semibold">Profit Ledger</h2>
              <p className="text-xs text-slate-500">
                What the Customer paid, where every dollar went, and what
                remained.
              </p>
            </div>
            {[
              "Revenue",
              "Commercial composition",
              "Costs",
              "Shipping",
              "Taxes",
              "Result",
            ].map((group) => (
              <div key={group}>
                <h3 className="bg-slate-50 px-5 py-2 text-[9px] font-semibold uppercase tracking-[.14em] dark:bg-white/5">
                  {group}
                </h3>
                {snap.ledger
                  .filter((l) => l.group === group)
                  .map((l) => (
                    <button
                      key={l.id}
                      onClick={() =>
                        go({
                          focus: "ledger",
                          lineId: l.id,
                          drawerId: l.drawerId,
                        })
                      }
                      className={`grid w-full grid-cols-[1fr_auto] gap-4 border-t px-5 py-3 text-left ${l.id === "net-profit" ? "text-base font-bold" : "text-xs"}`}
                    >
                      <span>
                        <strong>{l.label}</strong>
                        <span className="ml-2 text-[10px] font-normal text-slate-500">
                          {l.source}
                        </span>
                      </span>
                      <span className="tabular-nums">{cash(l.amount)}</span>
                    </button>
                  ))}
              </div>
            ))}
          </section>
        )}
        <div className="grid gap-5 p-5 xl:grid-cols-2">
          <section className="rounded-xl border">
            <Title text="What Was Sold" />
            <div className="p-5 text-xs">
              <p>
                <strong>Main Product:</strong> {snap.commercial.mainProduct}
              </p>
              <p className="mt-2">
                <strong>Order Bumps:</strong>{" "}
                {snap.commercial.orderBumps.join(", ")}
              </p>
              <p className="mt-2">
                <strong>Upsells:</strong> {snap.commercial.upsells.join(", ")}
              </p>
              <p className="mt-2">
                Quantity {snap.commercial.quantity} · Discounts $
                {snap.commercial.discounts.toFixed(2)} · Tax collected $
                {snap.commercial.taxCollected.toFixed(2)}
              </p>
            </div>
          </section>
          <section className="rounded-xl border">
            <Title text="Shipping" />
            <button
              onClick={() => inspect("financial:net-shipping")}
              className="grid w-full grid-cols-2 gap-3 p-5 text-left text-xs"
            >
              <span>Shipping Charged</span>
              <strong className="text-right">
                {cash(snap.shipping.charged)}
              </strong>
              <span>Actual Shipping Cost</span>
              <strong className="text-right">
                {cash(-snap.shipping.actual)}
              </strong>
              <span>Packaging</span>
              <strong className="text-right">
                {cash(-snap.shipping.packaging)}
              </strong>
              <span className="border-t pt-2">Net Shipping Margin</span>
              <strong className="border-t pt-2 text-right">
                {cash(snap.shipping.margin)}
              </strong>
            </button>
          </section>
        </div>
        <section className="mx-5 mb-5 rounded-xl border">
          <Title text="Attribution" />
          <div className="grid gap-3 p-5 sm:grid-cols-3">
            {Object.entries(snap.attribution).map(([k, v]) => (
              <button
                key={k}
                onClick={() => inspect(`event:${snap.timeline[0].id}`)}
                className="rounded-lg border p-3 text-left"
              >
                <span className="block text-[9px] uppercase text-slate-400">
                  {k.replace(/([A-Z])/g, " $1")}
                </span>
                <strong className="break-all text-xs">{v}</strong>
              </button>
            ))}
          </div>
          <div className="flex gap-2 border-t p-4">
            <button
              onClick={() =>
                router.push(
                  withDevelopmentIdentity(PRODUCTION_ROUTES.customers({ customerId: snap.relatedCustomer.id, offerId: snap.relatedOffer.id, focus: "journey" }), session.identity.id),
                )
              }
              className="rounded-lg border px-3 py-2 text-xs font-semibold"
            >
              Customer · {snap.relatedCustomer.name}
            </button>
            <button
              onClick={() =>
                router.push(
                  withDevelopmentIdentity(PRODUCTION_ROUTES.offers({ offerId: snap.relatedOffer.id, focus: "summary" }), session.identity.id),
                )
              }
              className="rounded-lg border px-3 py-2 text-xs font-semibold"
            >
              Offer · {snap.relatedOffer.name}
            </button>
          </div>
        </section>
        <section className="m-5 rounded-xl border">
          <div className="flex justify-between border-b p-5">
            <div>
              <h2 className="font-semibold">Order Timeline</h2>
              <p className="text-xs text-slate-500">
                Attribution, commerce, payment, and financial outcome.
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
                    Math.min(snap.timeline.length - 1, i + 1),
                  )
                }
                className="rounded-lg border p-2"
              >
                <SkipForward className="h-4 w-4" />
              </button>
              <button
                onClick={() => inspect(`event:${active.id}`)}
                className="rounded-lg border px-3 text-xs"
              >
                Inspect active
              </button>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto p-5">
            {snap.timeline.map((e, i) => (
              <button
                key={e.id}
                title={`${e.timestamp} · ${e.status} · ${e.confidence}`}
                onFocus={() => setReplayIndex(i)}
                onClick={() =>
                  go({
                    focus: "timeline",
                    eventId: e.id,
                    drawerId: `event:${e.id}`,
                  })
                }
                className={`min-w-[145px] rounded-xl border p-3 text-left ${e.id === normalized.eventId || (i === replayIndex && replaying) ? "border-2 border-slate-950 bg-slate-50 dark:border-white dark:bg-white/10" : ""}`}
              >
                <span className="text-[9px] uppercase">
                  {i + 1} · {e.status}
                </span>
                <strong className="mt-1 block text-xs">{e.label}</strong>
                <span className="mt-2 block text-[10px] text-slate-500">
                  {e.timestamp}
                </span>
              </button>
            ))}
          </div>
        </section>
        <section className="m-5 grid gap-3 lg:grid-cols-2">
          {snap.intelligence.map((i) => (
            <button
              key={i.id}
              onClick={() => inspect(`intelligence:${i.id}`)}
              className="flex gap-3 rounded-xl border border-violet-200 bg-violet-50/50 p-4 text-left dark:border-violet-400/30 dark:bg-violet-400/10"
            >
              <Sparkles className="h-4 w-4" />
              <span>
                <strong className="block text-xs">
                  TraceKit Intelligence · future add-on
                </strong>
                <span className="text-[10px]">{i.fact}</span>
              </span>
            </button>
          ))}
        </section>
        {snap.waitingOn.length ? (
          <p className="m-5 flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs">
            <AlertTriangle className="h-4 w-4" />
            Estimated · Waiting on {snap.waitingOn.join(", ")}
          </p>
        ) : null}
      </main>
    </div>
  );
}
function OrderList({
  orders,
  selected,
  filter,
  setFilter,
  select,
  mobile,
  close,
}: {
  orders: OrderSummary[];
  selected: string;
  filter: OrderListFilter;
  setFilter: (f: OrderListFilter) => void;
  select: (id: string) => void;
  mobile: boolean;
  close: () => void;
}) {
  const options = [
    "all",
    "profitable",
    "low-margin",
    "shipping-loss",
    "refunded",
    "chargeback",
    "tracking",
    "estimated",
    "reconciled",
  ] as const;
  return (
    <aside
      className={`${mobile ? "fixed inset-0 z-40 flex w-full" : "hidden w-[280px] lg:flex"} shrink-0 flex-col border-r bg-white dark:bg-ink`}
    >
      <div className="flex justify-between border-b p-4">
        <div>
          <h2 className="font-semibold">Orders</h2>
          <p className="text-[10px] text-slate-500">
            {orders.length} accessible
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
            placeholder="Search Orders"
            className="min-w-0 flex-1 bg-transparent text-xs outline-none"
          />
        </label>
        <div className="mt-2 flex gap-1 overflow-x-auto">
          {options.map((s) => (
            <button
              key={s}
              onClick={() => setFilter({ ...filter, state: s })}
              className="shrink-0 rounded-full border px-2 py-1 text-[9px] capitalize"
            >
              {s.replace("-", " ")}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-y-auto">
        {orders.map((o) => (
          <button
            key={o.id}
            onClick={() => select(o.id)}
            aria-pressed={o.id === selected}
            className={`w-full border-b p-4 text-left ${o.id === selected ? "border-l-4 border-l-slate-950 bg-slate-50 dark:border-l-white dark:bg-white/10" : ""}`}
          >
            <span className="flex justify-between">
              <strong className="text-xs">{o.number}</strong>
              <strong className="text-xs">
                {o.profit === null ? "Restricted" : cash(o.profit)}
              </strong>
            </span>
            <p className="mt-1 text-[10px] text-slate-500">
              {o.customerName} · {o.date}
            </p>
            <p className="mt-1 text-[10px]">
              {o.scenario} · {o.profitStatus}
            </p>
            <p className="mt-1 flex gap-1 text-[9px]">
              <ShieldCheck className="h-3 w-3" />
              {o.trackingHealth}
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
const State = ({ text }: { text: string }) => (
  <div className="rounded-xl border p-8">
    <h2 className="font-semibold">{text}</h2>
  </div>
);
