"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  CheckCircle2,
  GitCompare,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AccessBoundary } from "@/components/identity/access-control";
import { useIdentity } from "@/components/identity/identity-provider";
import { resolveMockRepositoryScope } from "@/lib/identity/mock-repository-scope";
import { useShellDrawer } from "@/components/layout/shell-drawer";
import { OfferDrawerContent } from "./offer-drawer-content";
import { offerRepository } from "@/lib/offers/mock-repository";
import {
  normalizeOfferDeepLink,
  offerDeepLinkHref,
  parseOfferDeepLink,
} from "@/lib/offers/deep-link";
import { withDevelopmentIdentity } from "@/lib/identity/development-state";
import { PRODUCTION_ROUTES } from "@/lib/navigation/production-routes";
import type {
  OfferComparison,
  OfferDeepLinkState,
  OfferDrawerRecord,
  OfferFocus,
  OfferSummary,
  OfferTrendMeasure,
  OfferTrendRange,
  OfferWorkspaceSnapshot,
} from "@/lib/offers/types";

const cash = (value: number, decimals = 0) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: decimals,
  }).format(value);
const measureLabels: Record<OfferTrendMeasure, string> = {
  profit: "Profit",
  revenue: "Revenue",
  spend: "Spend",
  orders: "Orders",
  customers: "Customers",
  roas: "ROAS",
  cpa: "CPA",
};
const formats = {
  currency: (v: number | string) => (typeof v === "number" ? cash(v, 2) : v),
  number: (v: number | string) =>
    typeof v === "number" ? v.toLocaleString() : v,
  percent: (v: number | string) => `${v}%`,
  multiple: (v: number | string) => `${v}×`,
  duration: (v: number | string) => `${v}h`,
};

function Mark({ offer }: { offer: OfferSummary }) {
  return (
    <span
      aria-hidden
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-slate-900 bg-white text-[10px] font-black text-slate-950"
    >
      {offer.mark}
    </span>
  );
}
function IntelligenceNote({
  text,
  onClick,
}: {
  text: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2 text-left text-[10px] leading-4 focus:outline-none focus:ring-2 focus:ring-violet-600 dark:border-violet-400/30 dark:bg-violet-400/10"
    >
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        <strong>TraceKit Intelligence</strong> · {text}
      </span>
    </button>
  );
}

export function OfferWorkspace() {
  return (
    <AccessBoundary permission="offers.view" variants={["client", "agency"]}>
      <OfferWorkspaceContent />
    </AccessBoundary>
  );
}

function OfferWorkspaceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const drawer = useShellDrawer();
  const {
    session,
    businessContexts,
    setActiveBusinessContext,
    setActiveOrganization,
  } = useIdentity();
  const scope = React.useMemo(() => resolveMockRepositoryScope(session), [session]);
  const requested = React.useMemo(
    () => parseOfferDeepLink(searchParams),
    [searchParams],
  );
  const [offers, setOffers] = React.useState<OfferSummary[]>([]);
  const [snapshot, setSnapshot] = React.useState<OfferWorkspaceSnapshot | null>(
    null,
  );
  const [comparison, setComparison] = React.useState<OfferComparison | null>(
    null,
  );
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [comparePicker, setComparePicker] = React.useState(false);
  const [range, setRange] = React.useState<OfferTrendRange>(7);
  const [measure, setMeasure] = React.useState<OfferTrendMeasure>("profit");
  const [focusedEvent, setFocusedEvent] = React.useState<string | null>(null);
  const summaryRef = React.useRef<HTMLElement>(null);
  const trendRef = React.useRef<HTMLElement>(null);
  const trafficRef = React.useRef<HTMLElement>(null);
  const driversRef = React.useRef<HTMLElement>(null);
  const qualityRef = React.useRef<HTMLElement>(null);
  const eventsRef = React.useRef<HTMLElement>(null);
  const refs = React.useMemo(
    () => ({
      summary: summaryRef,
      trend: trendRef,
      "traffic-sources": trafficRef,
      "profit-drivers": driversRef,
      "customer-quality": qualityRef,
      "significant-events": eventsRef,
    }),
    [],
  );
  const effectiveRequest = React.useMemo(
    () => ({
      ...requested,
      offerId: requested.offerId || session.activeBusinessContextId,
    }),
    [requested, session.activeBusinessContextId],
  );
  const normalized = React.useMemo(
    () => normalizeOfferDeepLink(effectiveRequest, offers, snapshot),
    [effectiveRequest, offers, snapshot],
  );

  React.useEffect(() => {
    if (
      !requested.offerId ||
      offers.some((offer) => offer.id === requested.offerId)
    )
      return;
    let active = true;
    offerRepository
      .resolveOffer(scope, requested.offerId)
      .then((result) => {
        if (
          active &&
          result &&
          session.developmentOnly &&
          result.organizationId !== scope.mockOrganizationId
        )
          setActiveOrganization(result.organizationId);
      });
    return () => {
      active = false;
    };
  }, [
    offers,
    requested.offerId,
    scope,
    scope.mockOrganizationId,
    session.developmentOnly,
    setActiveOrganization,
  ]);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    offerRepository
      .listOffers(scope)
      .then((items) => {
        if (active) setOffers(items);
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Offer repository unavailable",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [scope]);
  React.useEffect(() => {
    if (!normalized.offerId) {
      setSnapshot(null);
      return;
    }
    let active = true;
    setLoading(true);
    offerRepository
      .loadWorkspace(scope, normalized.offerId)
      .then((value) => {
        if (active) setSnapshot(value);
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Offer could not be loaded",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [normalized.offerId, scope]);
  React.useEffect(() => {
    if (
      normalized.offerId &&
      normalized.offerId !== session.activeBusinessContextId &&
      businessContexts.some((item) => item.id === normalized.offerId)
    )
      setActiveBusinessContext(normalized.offerId);
  }, [
    businessContexts,
    normalized.offerId,
    session.activeBusinessContextId,
    setActiveBusinessContext,
  ]);
  React.useEffect(() => {
    if (!normalized.compare) {
      setComparison(null);
      return;
    }
    let active = true;
    offerRepository
      .loadComparison(scope, normalized.comparisonOfferIds)
      .then((value) => {
        if (active) setComparison(value);
      });
    return () => {
      active = false;
    };
  }, [normalized.compare, normalized.comparisonOfferIds, scope]);
  React.useEffect(() => {
    if (!normalized.focus) return;
    refs[normalized.focus].current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [normalized.focus, refs]);
  React.useEffect(() => {
    const drawerId =
      normalized.drawerId ||
      (normalized.trafficSourceId
        ? `traffic:${normalized.trafficSourceId}`
        : normalized.driverId
          ? `driver:${normalized.driverId}`
          : normalized.eventId
            ? `event:${normalized.eventId}`
            : null);
    if (!snapshot || !drawerId) return;
    let active = true;
    offerRepository
      .loadDrawer(scope, snapshot.offer.id, drawerId)
      .then((record) => {
        if (active && record)
          drawer.openDrawer(
            <OfferDrawerContent record={record} />,
            record.title,
            { onDismiss: () => router.push(withDevelopmentIdentity(offerDeepLinkHref({ ...normalized, drawer: null, drawerId: null, trafficSourceId: null, driverId: null, eventId: null }), session.identity.id), { scroll: false }) },
          );
      });
    return () => {
      active = false;
    };
  }, [
    drawer,
    normalized.drawerId,
    normalized.driverId,
    normalized.eventId,
    normalized.trafficSourceId,
    normalized,
    router,
    session.identity.id,
    scope,
    snapshot,
  ]);

  const go = React.useCallback(
    (next: Partial<OfferDeepLinkState>) =>
      router.push(
        withDevelopmentIdentity(
          offerDeepLinkHref({ ...normalized, ...next }),
          session.identity.id,
        ),
        { scroll: false },
      ),
    [normalized, router, session.identity.id],
  );
  const inspect = React.useCallback(
    async (drawerId: string) => {
      if (!snapshot) return;
      const record = await offerRepository.loadDrawer(
        scope,
        snapshot.offer.id,
        drawerId,
      );
      if (record)
        drawer.openDrawer(<OfferDrawerContent record={record} />, record.title);
    },
    [drawer, scope, snapshot],
  );
  if (loading && !snapshot)
    return (
      <div className="rounded-xl border bg-white p-8 text-sm text-slate-500 dark:border-white/10 dark:bg-ink">
        Loading Offer Workspace…
      </div>
    );
  if (error)
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-300 bg-red-50 p-6"
      >
        <h2 className="font-semibold">Offer Workspace unavailable</h2>
        <p className="mt-2 text-sm">{error}</p>
      </div>
    );
  if (!offers.length)
    return (
      <div className="rounded-xl border bg-white p-8 dark:border-white/10 dark:bg-ink">
        <h2 className="font-semibold">No accessible Offers</h2>
        <p className="mt-2 text-sm text-slate-500">
          The active Organization has no Offers available to this identity.
        </p>
      </div>
    );
  if (!snapshot)
    return (
      <div className="rounded-xl border bg-white p-8 dark:border-white/10 dark:bg-ink">
        <h2 className="font-semibold">Offer not found</h2>
        <p className="mt-2 text-sm text-slate-500">
          Choose an accessible Business Context.
        </p>
      </div>
    );
  if (normalized.compare && comparison)
    return (
      <CompareMode
        comparison={comparison}
        currentOfferId={snapshot.offer.id}
        close={() => go({ compare: false, comparisonOfferIds: [] })}
        inspect={(record) =>
          drawer.openDrawer(
            <OfferDrawerContent record={record} />,
            record.title,
          )
        }
      />
    );

  const profitIntel = snapshot.intelligence.find(
    (item) => item.placement === "profit",
  );
  const trendIntel = snapshot.intelligence.find(
    (item) => item.placement === "trend",
  );
  return (
    <div className="space-y-5">
      <section className="rounded-xl border bg-white shadow-sm dark:border-white/10 dark:bg-ink">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4 dark:border-white/10">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[.14em] text-slate-400">
              Business Context · Permanent Context
            </div>
            <h2 className="mt-1 text-sm font-semibold">
              Enter an Offer · not a report filter
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setComparePicker(true)}
            disabled={offers.length < 2}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40 dark:border-white/10"
          >
            <GitCompare className="h-3.5 w-3.5" />
            Compare
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto p-3">
          {offers.map((offer) => (
            <button
              disabled={!snapshot.customerQuality.customerIds[0]}
              type="button"
              key={offer.id}
              onClick={() =>
                go({
                  offerId: offer.id,
                  focus: "summary",
                  compare: false,
                  comparisonOfferIds: [],
                  drawerId: null,
                  trafficSourceId: null,
                  driverId: null,
                  eventId: null,
                })
              }
              aria-pressed={offer.id === snapshot.offer.id}
              className={`flex min-w-[210px] items-center gap-3 rounded-xl border p-3 text-left focus:outline-none focus:ring-2 focus:ring-slate-400 ${offer.id === snapshot.offer.id ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900 dark:border-white dark:bg-white/10 dark:ring-white" : "dark:border-white/10"}`}
            >
              <Mark offer={offer} />
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-xs">{offer.name}</strong>
                <span className="mt-1 block text-sm font-semibold">
                  {cash(offer.profit)}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                  {offer.trend >= 0 ? (
                    <ArrowUp className="h-3 w-3" />
                  ) : (
                    <ArrowDown className="h-3 w-3" />
                  )}
                  {Math.abs(offer.trend)}% ·{" "}
                  {offer.id === snapshot.offer.id ? "Selected" : "Open"}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>
      <section
        ref={refs.summary}
        className="scroll-mt-24 rounded-xl border-2 border-slate-900 bg-white p-5 shadow-sm dark:border-white dark:bg-ink"
      >
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="flex items-center gap-3">
              <Mark offer={snapshot.offer} />
              <div>
                <div className="text-[10px] uppercase tracking-[.12em] text-slate-500">
                  {snapshot.offer.status} · {snapshot.offer.trackingHealth}{" "}
                  Tracking
                </div>
                <h1 className="text-2xl font-semibold">
                  {snapshot.offer.name}
                </h1>
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-500">
              Should I spend more money on this Offer?
            </p>
          </div>
          <div className="min-w-[240px]">
            <div className="text-[9px] font-semibold uppercase tracking-[.12em] text-slate-400">
              Profit
            </div>
            <div className="mt-1 text-4xl font-semibold tabular-nums">
              {cash(snapshot.offer.profit)}
            </div>
            <div className="mt-2 inline-flex items-center gap-2 rounded-full border px-2 py-1 text-[10px] font-semibold">
              <CheckCircle2 className="h-3 w-3" />
              {snapshot.offer.status}
            </div>
            <p className="mt-2 text-xs text-slate-500">{snapshot.trendLabel}</p>
          </div>
        </div>
        {profitIntel ? (
          <div className="mt-4">
            <IntelligenceNote
              text={profitIntel.fact}
              onClick={() => inspect(`intelligence:${profitIntel.id}`)}
            />
          </div>
        ) : null}
        <div className="mt-6 grid gap-4 border-t pt-5 sm:grid-cols-3 lg:grid-cols-6 dark:border-white/10">
          {[
            ["Revenue", cash(snapshot.revenue)],
            ["Spend", cash(snapshot.spend)],
            ["Profit Margin", `${snapshot.profitMargin}%`],
            ["ROAS", `${snapshot.roas}×`],
            ["CPA", cash(snapshot.cpa, 2)],
            ["Orders", snapshot.orders.toLocaleString()],
            ["Customers", snapshot.customers.toLocaleString()],
            ["AOV", cash(snapshot.averageOrderValue)],
            ["Refund Rate", `${snapshot.refundRate}%`],
            ["Chargeback Rate", `${snapshot.chargebackRate}%`],
            ["Tracking Health", snapshot.offer.trackingHealth],
            ["Attention", snapshot.attention],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="text-[9px] font-semibold uppercase text-slate-400">
                {label}
              </div>
              <div className="mt-1 text-sm font-semibold">{value}</div>
            </div>
          ))}
        </div>
        {snapshot.incompleteFinancialData?.length ? (
          <div className="mt-5 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
            <AlertTriangle className="h-4 w-4" />
            <span>
              <strong>Estimated financial data.</strong> Waiting on{" "}
              {snapshot.incompleteFinancialData.join(", ")}.
            </span>
          </div>
        ) : null}
      </section>
      <section
        ref={refs.trend}
        className="scroll-mt-24 rounded-xl border bg-white shadow-sm dark:border-white/10 dark:bg-ink"
      >
        <div className="flex flex-wrap justify-between gap-3 border-b p-5 dark:border-white/10">
          <div>
            <h2 className="text-sm font-semibold">Profit &amp; Performance</h2>
            <p className="mt-1 text-[11px] text-slate-500">
              One continuous trend across the selected period.
            </p>
          </div>
          <div className="flex gap-1">
            {([7, 14, 30] as OfferTrendRange[]).map((value) => (
              <button
                key={value}
                onClick={() => setRange(value)}
                className={`rounded-md border px-2.5 py-1.5 text-[10px] font-semibold ${range === value ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950" : "dark:border-white/10"}`}
              >
                {value} days
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 px-5 pt-4">
          {(Object.keys(measureLabels) as OfferTrendMeasure[]).map((value) => (
            <button
              key={value}
              onClick={() => setMeasure(value)}
              className={`rounded-full border px-3 py-1 text-[10px] font-semibold ${measure === value ? "border-slate-900 bg-slate-100 dark:border-white dark:bg-white/10" : "text-slate-500 dark:border-white/10"}`}
            >
              {measure === value ? "●" : "○"} {measureLabels[value]}
            </button>
          ))}
        </div>
        <div className="h-[310px] px-2 py-4 sm:px-5">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={snapshot.trends[range]}>
              <CartesianGrid strokeDasharray="2 5" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip
                formatter={(value) => [
                  measure === "roas"
                    ? `${value}×`
                    : measure === "orders" || measure === "customers"
                      ? Number(value).toLocaleString()
                      : cash(Number(value), measure === "cpa" ? 2 : 0),
                  measureLabels[measure],
                ]}
              />
              {snapshot.significantEvents.map((event) =>
                snapshot.trends[range].find((point) =>
                  point.eventIds.includes(event.id),
                ) ? (
                  <ReferenceLine
                    key={event.id}
                    x={
                      snapshot.trends[range].find((point) =>
                        point.eventIds.includes(event.id),
                      )?.date
                    }
                    stroke={focusedEvent === event.id ? "#0f172a" : "#94a3b8"}
                    strokeDasharray="3 3"
                    label={{ value: `◆ ${event.title}`, fontSize: 9 }}
                    onClick={() => {
                      setFocusedEvent(event.id);
                      go({
                        focus: "significant-events",
                        eventId: event.id,
                        drawerId: `event:${event.id}`,
                      });
                    }}
                  />
                ) : null,
              )}
              <Line
                type="monotone"
                dataKey={measure}
                stroke="currentColor"
                strokeWidth={3}
                dot={{ r: 4, fill: "white", strokeWidth: 2 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="border-t p-4 dark:border-white/10">
          {trendIntel ? (
            <IntelligenceNote
              text={trendIntel.fact}
              onClick={() => inspect(`intelligence:${trendIntel.id}`)}
            />
          ) : null}
        </div>
      </section>
      <section
        ref={refs["traffic-sources"]}
        className="scroll-mt-24 rounded-xl border bg-white shadow-sm dark:border-white/10 dark:bg-ink"
      >
        <SectionHeader
          title="Traffic Sources"
          detail="Tactical contribution beneath the strategic Offer."
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="bg-slate-50 text-[9px] uppercase text-slate-500 dark:bg-white/5">
              <tr>
                {[
                  "Source",
                  "Spend",
                  "Revenue",
                  "Profit",
                  "ROAS",
                  "CPA",
                  "Orders",
                  "Refunds",
                  "LTV",
                  "Tracking",
                ].map((item) => (
                  <th key={item} className="px-4 py-3">
                    {item}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshot.trafficSources.map((source) => (
                <tr key={source.id} className="border-t dark:border-white/10">
                  <td className="px-4 py-3">
                    <button
                      onClick={() =>
                        go({
                          focus: "traffic-sources",
                          trafficSourceId: source.id,
                          drawerId: `traffic:${source.id}`,
                        })
                      }
                      className="font-semibold underline-offset-2 hover:underline"
                    >
                      {source.name}
                    </button>
                    {source.intelligenceId ? (
                      <button
                        onClick={() =>
                          inspect(`intelligence:${source.intelligenceId}`)
                        }
                        aria-label={`Open Intelligence for ${source.name}`}
                        className="ml-2"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{cash(source.spend)}</td>
                  <td className="px-4 py-3">{cash(source.revenue)}</td>
                  <td className="px-4 py-3 font-semibold">
                    {cash(source.profit)}
                  </td>
                  <td className="px-4 py-3">{source.roas}×</td>
                  <td className="px-4 py-3">{cash(source.cpa, 2)}</td>
                  <td className="px-4 py-3">{source.orders}</td>
                  <td className="px-4 py-3">{source.refundRate}%</td>
                  <td className="px-4 py-3">{cash(source.customerLtv)}</td>
                  <td className="px-4 py-3">
                    <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
                    {source.trackingHealth}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="grid gap-5 xl:grid-cols-2">
        <section
          ref={refs["profit-drivers"]}
          className="scroll-mt-24 rounded-xl border bg-white shadow-sm dark:border-white/10 dark:bg-ink"
        >
          <SectionHeader
            title="Profit Drivers"
            detail="Material factors ordered by business impact."
          />
          <div className="divide-y dark:divide-white/10">
            {snapshot.profitDrivers.map((driver) => (
              <button
                key={driver.id}
                onClick={() =>
                  go({
                    focus: "profit-drivers",
                    driverId: driver.id,
                    drawerId: `driver:${driver.id}`,
                  })
                }
                className="grid w-full grid-cols-[1fr_auto] gap-3 px-5 py-3 text-left hover:bg-slate-50 dark:hover:bg-white/5"
              >
                <span>
                  <strong className="text-xs">{driver.label}</strong>
                  <span className="block text-[10px] text-slate-500">
                    {driver.impact}
                  </span>
                </span>
                <span className="text-xs font-semibold tabular-nums">
                  {driver.amount > 0 ? "+" : ""}
                  {cash(driver.amount)}
                </span>
              </button>
            ))}
          </div>
        </section>
        <section
          ref={refs["customer-quality"]}
          className="scroll-mt-24 rounded-xl border bg-white shadow-sm dark:border-white/10 dark:bg-ink"
        >
          <SectionHeader
            title="Customer Quality"
            detail="Durability and value beyond conversion."
          />
          <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3">
            {[
              ["New Customers", snapshot.customerQuality.newCustomers],
              ["Returning", snapshot.customerQuality.returningCustomers],
              ["Average LTV", cash(snapshot.customerQuality.lifetimeValue)],
              ["Refund Rate", `${snapshot.customerQuality.refundRate}%`],
              [
                "Chargeback Rate",
                `${snapshot.customerQuality.chargebackRate}%`,
              ],
              [
                "Repeat Purchase",
                `${snapshot.customerQuality.repeatPurchaseRate}%`,
              ],
              [
                "Click → Purchase",
                `${snapshot.customerQuality.clickToPurchaseHours}h`,
              ],
              ["Tracking Quality", snapshot.customerQuality.trackingQuality],
              [
                "High-value contribution",
                `${snapshot.customerQuality.highValueContribution}%`,
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="text-[9px] uppercase text-slate-400">
                  {label}
                </div>
                <div className="mt-1 text-sm font-semibold">{value}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 border-t p-4 dark:border-white/10">
            <button
              onClick={() =>
                router.push(
                  withDevelopmentIdentity(PRODUCTION_ROUTES.customers({ customerId: snapshot.customerQuality.customerIds[0] || null, offerId: snapshot.offer.id, focus: "journey" }), session.identity.id),
                )
              }
              className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40 dark:border-white/10"
            >
              Open related Customer
            </button>
            <button
              disabled={!snapshot.customerQuality.orderIds[0]}
              onClick={() =>
                router.push(
                  withDevelopmentIdentity(PRODUCTION_ROUTES.orders({ orderId: snapshot.customerQuality.orderIds[0] || null, offerId: snapshot.offer.id, focus: "ledger" }), session.identity.id),
                )
              }
              className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40 dark:border-white/10"
            >
              Open related Order
            </button>
            {snapshot.customerQuality.intelligenceId ? (
              <IntelligenceNote
                text={`Repeat Purchase Rate is ${snapshot.customerQuality.repeatPurchaseRate}%.`}
                onClick={() =>
                  inspect(
                    `intelligence:${snapshot.customerQuality.intelligenceId}`,
                  )
                }
              />
            ) : null}
          </div>
        </section>
      </div>
      <section
        ref={refs["significant-events"]}
        className="scroll-mt-24 rounded-xl border bg-white shadow-sm dark:border-white/10 dark:bg-ink"
      >
        <SectionHeader
          title="Significant Events"
          detail="Meaningful business changes connected to performance movement."
        />
        <div className="divide-y dark:divide-white/10">
          {snapshot.significantEvents.map((event) => (
            <button
              key={event.id}
              onClick={() => {
                setFocusedEvent(event.id);
                go({
                  focus: "significant-events",
                  eventId: event.id,
                  drawerId: `event:${event.id}`,
                });
              }}
              className={`grid w-full gap-3 px-5 py-4 text-left hover:bg-slate-50 md:grid-cols-[80px_1fr_1fr_auto] dark:hover:bg-white/5 ${focusedEvent === event.id ? "ring-2 ring-inset ring-slate-900 dark:ring-white" : ""}`}
            >
              <strong className="text-xs">{event.date}</strong>
              <span>
                <strong className="block text-xs">{event.title}</strong>
                <span className="text-[10px] text-slate-500">
                  {event.change}
                </span>
              </span>
              <span>
                <span className="block text-xs">{event.outcome}</span>
                <span className="text-[10px] text-slate-500">
                  {event.relationship} · {event.relatedObject}
                </span>
              </span>
              <ArrowRight className="h-4 w-4" />
            </button>
          ))}
        </div>
      </section>
      {comparePicker ? (
        <ComparePicker
          offers={offers}
          current={snapshot.offer.id}
          close={() => setComparePicker(false)}
          done={(ids) => {
            setComparePicker(false);
            go({ compare: true, comparisonOfferIds: ids });
          }}
        />
      ) : null}
    </div>
  );
}

function SectionHeader({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="border-b px-5 py-4 dark:border-white/10">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-[11px] text-slate-500">{detail}</p>
    </div>
  );
}
function ComparePicker({
  offers,
  current,
  close,
  done,
}: {
  offers: OfferSummary[];
  current: string;
  close: () => void;
  done: (ids: string[]) => void;
}) {
  const [ids, setIds] = React.useState<string[]>(() => [
    current,
    ...offers
      .filter((o) => o.id !== current)
      .slice(0, 1)
      .map((o) => o.id),
  ]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
      <button
        className="absolute inset-0"
        onClick={close}
        aria-label="Close Compare selection"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-2xl rounded-xl border bg-white shadow-2xl dark:border-white/10 dark:bg-ink"
      >
        <div className="flex justify-between border-b p-5 dark:border-white/10">
          <div>
            <h2 className="font-semibold">Choose Business Contexts</h2>
            <p className="text-xs text-slate-500">
              Select two to four accessible Offers
            </p>
          </div>
          <button onClick={close}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-2 p-4 sm:grid-cols-2">
          {offers.map((offer) => {
            const selected = ids.includes(offer.id);
            return (
              <button
                key={offer.id}
                disabled={!selected && ids.length === 4}
                onClick={() =>
                  setIds((values) =>
                    selected
                      ? values.length > 2
                        ? values.filter((id) => id !== offer.id)
                        : values
                      : [...values, offer.id],
                  )
                }
                className={`flex items-center gap-3 rounded-xl border p-3 text-left disabled:opacity-40 ${selected ? "ring-2 ring-slate-900 dark:ring-white" : ""}`}
              >
                <Mark offer={offer} />
                <span className="flex-1 text-xs font-semibold">
                  {offer.name}
                </span>
                {selected ? <Check className="h-4 w-4" /> : null}
              </button>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 border-t p-4 dark:border-white/10">
          <button
            onClick={close}
            className="rounded-lg border px-4 py-2 text-xs"
          >
            Cancel
          </button>
          <button
            disabled={ids.length < 2}
            onClick={() => done(ids)}
            className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-slate-950"
          >
            Compare {ids.length}
          </button>
        </div>
      </div>
    </div>
  );
}
function CompareMode({
  comparison,
  currentOfferId,
  close,
  inspect,
}: {
  comparison: OfferComparison;
  currentOfferId: string;
  close: () => void;
  inspect: (record: OfferDrawerRecord) => void;
}) {
  const offerName = (id: string) =>
    comparison.offers.find((o) => o.id === id)?.name || id;
  const strongest = comparison.trafficSources.find(
    (s) => s.sourceId === comparison.conclusion.strongest.sourceId,
  );
  const weakest = comparison.trafficSources.find(
    (s) => s.sourceId === comparison.conclusion.weakest.sourceId,
  );
  const record: OfferDrawerRecord = {
    id: "compare",
    kind: "compare-conclusion",
    title: "Compare conclusion",
    question: "Why is one Business Context outperforming another?",
    summary: comparison.conclusion.recommendation,
    facts: comparison.conclusion.drivers.map((value, index) => ({
      label: `Driver ${index + 1}`,
      value,
    })),
    evidence: comparison.conclusion.evidence,
    relatedObjects: comparison.offers.map((o) => ({
      type: "Evidence" as const,
      id: o.id,
      label: o.name,
    })),
  };
  return (
    <div className="space-y-5">
      <section className="rounded-xl border bg-white shadow-sm dark:border-white/10 dark:bg-ink">
        <div className="flex justify-between border-b p-5 dark:border-white/10">
          <div>
            <h1 className="font-semibold">Compare Business Contexts</h1>
            <p className="text-xs text-slate-500">
              Decision mode · two to four Offers · Core capability
            </p>
          </div>
          <button
            onClick={close}
            className="rounded-lg border px-3 py-2 text-xs"
          >
            Done
          </button>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            {comparison.metrics.map((metric) => (
              <div
                key={metric.id}
                className="grid border-b last:border-0 dark:border-white/10"
                style={{
                  gridTemplateColumns: `170px repeat(${comparison.offers.length},minmax(150px,1fr))`,
                }}
              >
                <div className="p-3 text-xs text-slate-500">{metric.label}</div>
                {comparison.offers.map((offer) => (
                  <div
                    key={offer.id}
                    className="border-l p-3 text-xs font-semibold dark:border-white/10"
                  >
                    {formats[metric.format](metric.values[offer.id])}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="rounded-xl border bg-white p-5 dark:border-white/10 dark:bg-ink">
        <h2 className="text-sm font-semibold">Why? · Performance Drivers</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {comparison.conclusion.drivers.map((driver) => (
            <div
              key={driver}
              className="border-b pb-3 text-xs dark:border-white/10"
            >
              {driver}
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-xl border bg-white dark:border-white/10 dark:bg-ink">
        <SectionHeader
          title="Traffic Source Comparison"
          detail="Profit and acquisition efficiency by selected Offer."
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-xs">
            <thead>
              <tr>
                <th className="p-3 text-left">Source</th>
                {comparison.offers.map((o) => (
                  <th key={o.id} className="p-3 text-left">
                    {o.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.trafficSources.map((source) => (
                <tr
                  key={source.sourceId}
                  className="border-t dark:border-white/10"
                >
                  <td className="p-3 font-semibold">{source.sourceName}</td>
                  {comparison.offers.map((o) => {
                    const v = source.offerValues[o.id];
                    return (
                      <td key={o.id} className="p-3">
                        <strong>{cash(v.profit)} Profit</strong>
                        <div className="text-[10px] text-slate-500">
                          {v.roas}× ROAS · {cash(v.cpa, 2)} CPA ·{" "}
                          {cash(v.customerLtv)} LTV
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-xl border-2 border-slate-900 bg-white p-5 dark:border-white dark:bg-ink">
        <div className="flex gap-3">
          <Sparkles className="h-4 w-4" />
          <div>
            <div className="text-[9px] uppercase tracking-[.12em] text-slate-500">
              TraceKit Intelligence · future add-on
            </div>
            <h2 className="mt-1 text-sm font-semibold">
              Evidence-backed Decision Summary
            </h2>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <div className="text-[9px] uppercase text-slate-400">
              Best Offer
            </div>
            <strong>{offerName(comparison.conclusion.bestOfferId)}</strong>
          </div>
          <div>
            <div className="text-[9px] uppercase text-slate-400">
              Strongest source
            </div>
            <strong>
              {offerName(comparison.conclusion.strongest.offerId)} ·{" "}
              {strongest?.sourceName}
            </strong>
          </div>
          <div>
            <div className="text-[9px] uppercase text-slate-400">
              Source to review
            </div>
            <strong>
              {offerName(comparison.conclusion.weakest.offerId)} ·{" "}
              {weakest?.sourceName}
            </strong>
          </div>
        </div>
        <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs dark:bg-white/5">
          <strong>Recommendation:</strong>{" "}
          {comparison.conclusion.recommendation}
        </p>
        <button
          onClick={() => inspect(record)}
          className="mt-4 rounded-lg border px-3 py-2 text-xs font-semibold"
        >
          Explain · Evidence
        </button>
      </section>
      <span className="sr-only">
        Current Offer before Compare: {currentOfferId}
      </span>
    </div>
  );
}
