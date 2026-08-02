"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useIdentity } from "@/components/identity/identity-provider";
import { useShellDrawer } from "@/components/layout/shell-drawer";
import { withDevelopmentIdentity } from "@/lib/identity/development-state";
import type {
  BusinessMeasure,
  BusinessRange,
  MissionControlSnapshot,
  MissionItem,
} from "@/lib/mission-control/types";
import { offerDeepLinkHref } from "@/lib/offers/deep-link";
import { customerDeepLinkHref } from "@/lib/customers/deep-link";
import { orderDeepLinkHref } from "@/lib/orders/deep-link";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
const measureNames: Record<BusinessMeasure, string> = {
  profit: "Profit",
  revenue: "Revenue",
  spend: "Spend",
  orders: "Orders",
  customers: "Customers",
  roas: "ROAS",
  cpa: "CPA",
};
const destinationRoutes = {
  offer: "/offers",
  customer: "/customers",
  order: "/orders",
} as const;

function Mark({ value }: { value: string }) {
  return (
    <span
      aria-hidden
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-slate-900 bg-white text-[10px] font-black text-slate-950"
    >
      {value}
    </span>
  );
}

function DecisionDrawer({
  item,
  navigate,
}: {
  item: MissionItem;
  navigate: (
    destination: MissionItem["destination"],
    businessContextId?: string,
  ) => void;
}) {
  const drawer = useShellDrawer();
  return (
    <div className="space-y-5">
      <section>
        <div className="text-[10px] font-semibold uppercase tracking-[.12em] text-slate-500">
          Why should I investigate this?
        </div>
        <div className="mt-2 rounded-xl border bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-sm font-semibold">{item.question}</div>
          <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
            {item.explanation}
          </p>
        </div>
      </section>
      {item.intelligence ? (
        <section className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 dark:border-violet-400/30 dark:bg-violet-400/10">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Sparkles className="h-4 w-4" />
            TraceKit Intelligence · proactive observation
          </div>
          <dl className="mt-3 space-y-3 text-xs">
            <div>
              <dt className="text-[9px] uppercase text-slate-500">Fact</dt>
              <dd className="mt-1">{item.intelligence.comparison}</dd>
            </div>
            <div>
              <dt className="text-[9px] uppercase text-slate-500">
                Recommendation
              </dt>
              <dd className="mt-1">{item.intelligence.recommendation}</dd>
            </div>
            <div>
              <dt className="text-[9px] uppercase text-slate-500">
                Evidence strength
              </dt>
              <dd className="mt-1 font-semibold">
                {item.intelligence.confidence}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}
      <section>
        <div className="text-[10px] font-semibold uppercase tracking-[.12em] text-slate-500">
          Supporting Evidence
        </div>
        <ul className="mt-2 space-y-2">
          {item.evidence.map((evidence) => (
            <li
              key={evidence}
              className="flex items-start gap-2 rounded-lg border p-3 text-xs dark:border-white/10"
            >
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {evidence}
              <ExternalLink className="ml-auto h-3.5 w-3.5 text-slate-400" />
            </li>
          ))}
        </ul>
      </section>
      <section>
        <div className="text-[10px] font-semibold uppercase tracking-[.12em] text-slate-500">
          Explain
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
          This summary helps decide whether to continue. Full explanation and
          investigation remain in the destination Workspace.
        </p>
      </section>
      <button
        type="button"
        onClick={() => {
          drawer.closeDrawer();
          navigate(item.destination, item.businessContextId);
        }}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-xs font-semibold text-white dark:bg-white dark:text-slate-950"
      >
        {item.action} Workspace
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function BusinessTrend({
  trends,
}: {
  trends: MissionControlSnapshot["trends"];
}) {
  const [range, setRange] = React.useState<BusinessRange>("7 Days");
  const [measure, setMeasure] = React.useState<BusinessMeasure>("profit");
  const data = trends[range];
  const current = data[data.length - 1][measure];
  const previous = data[0][measure];
  const delta = ((current - previous) / Math.max(previous, 0.01)) * 100;
  const display =
    measure === "roas"
      ? `${current.toFixed(2)}×`
      : measure === "orders" || measure === "customers"
        ? current.toLocaleString()
        : money(current);
  return (
    <section className="overflow-hidden rounded-xl border bg-white shadow-sm dark:border-white/10 dark:bg-ink">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b px-5 py-4 dark:border-white/10">
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[.14em] text-slate-400">
            Entire business
          </div>
          <h2 className="mt-1 text-sm font-semibold">Overall Business Trend</h2>
          <div className="mt-2 flex items-end gap-3">
            <strong className="text-2xl tabular-nums">{display}</strong>
            <span className="mb-1 inline-flex items-center gap-1 text-xs font-semibold">
              {delta >= 0 ? (
                <ArrowUp className="h-3.5 w-3.5" />
              ) : (
                <ArrowDown className="h-3.5 w-3.5" />
              )}
              {Math.abs(delta).toFixed(1)}% · {range}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {(
            [
              "7 Days",
              "14 Days",
              "30 Days",
              "90 Days",
              "Year",
            ] as BusinessRange[]
          ).map((value) => (
            <button
              type="button"
              key={value}
              onClick={() => setRange(value)}
              className={`rounded-md border px-2.5 py-1.5 text-[10px] font-semibold focus:outline-none focus:ring-2 focus:ring-slate-400 ${range === value ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950" : "bg-white dark:border-white/10 dark:bg-ink"}`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 px-5 pt-4">
        {(Object.keys(measureNames) as BusinessMeasure[]).map((value) => (
          <button
            type="button"
            key={value}
            onClick={() => setMeasure(value)}
            className={`rounded-full border px-3 py-1 text-[10px] font-semibold focus:outline-none focus:ring-2 focus:ring-slate-400 ${measure === value ? "border-slate-900 bg-slate-100 dark:border-white dark:bg-white/10" : "text-slate-500 dark:border-white/10"}`}
          >
            {measure === value ? "●" : "○"} {measureNames[value]}
          </button>
        ))}
      </div>
      <div className="h-[300px] min-w-0 px-2 pb-3 pt-4 sm:px-5">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 16, left: 4, bottom: 6 }}
          >
            <CartesianGrid strokeDasharray="2 5" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9 }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 9 }}
              tickFormatter={(value) =>
                measure === "roas"
                  ? `${value}×`
                  : measure === "orders" || measure === "customers"
                    ? String(value)
                    : `$${Math.round(value / 1000)}k`
              }
            />
            <Tooltip
              contentStyle={{ fontSize: 11 }}
              formatter={(value) => [
                measure === "roas"
                  ? `${Number(value).toFixed(2)}×`
                  : measure === "orders" || measure === "customers"
                    ? Number(value).toLocaleString()
                    : money(Number(value)),
                measureNames[measure],
              ]}
            />
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
    </section>
  );
}

export function MissionControl({
  snapshot,
}: {
  snapshot: MissionControlSnapshot;
}) {
  const router = useRouter();
  const drawer = useShellDrawer();
  const { session, businessContexts, setActiveBusinessContext } = useIdentity();

  const navigate = React.useCallback(
    (
      destination: MissionItem["destination"],
      businessContextId?: string,
      deepLink?: MissionItem["offerDeepLink"],
      customerDeepLink?: MissionItem["customerDeepLink"],
      orderDeepLink?: MissionItem["orderDeepLink"],
    ) => {
      if (
        businessContextId &&
        businessContexts.some((context) => context.id === businessContextId)
      )
        setActiveBusinessContext(businessContextId);
      if (destination === "offer") {
        router.push(
          withDevelopmentIdentity(
            offerDeepLinkHref({
              offerId: businessContextId || null,
              focus: deepLink?.focus,
              trafficSourceId: deepLink?.trafficSourceId || null,
              driverId: deepLink?.driverId || null,
              eventId: deepLink?.eventId || null,
              drawer: deepLink?.drawer || null,
              searchRef: deepLink?.searchRef || null,
              compare: Boolean(deepLink?.compareOfferIds?.length),
              comparisonOfferIds: deepLink?.compareOfferIds || [],
            }),
            session.identity.id,
          ),
        );
        return;
      }
      if (destination === "customer") {
        router.push(
          withDevelopmentIdentity(
            customerDeepLinkHref(customerDeepLink || {}),
            session.identity.id,
          ),
        );
        return;
      }
      if (destination === "order") {
        router.push(
          withDevelopmentIdentity(
            orderDeepLinkHref(orderDeepLink || {}),
            session.identity.id,
          ),
        );
        return;
      }
      router.push(
        withDevelopmentIdentity(
          destinationRoutes[destination],
          session.identity.id,
        ),
      );
    },
    [businessContexts, router, session.identity.id, setActiveBusinessContext],
  );

  function inspect(item: MissionItem) {
    drawer.openDrawer(
      <DecisionDrawer
        item={item}
        navigate={(destination, businessContextId) =>
          navigate(destination, businessContextId, item.offerDeepLink)
        }
      />,
      `${item.business} · ${item.title}`,
    );
  }

  const briefingItem: MissionItem = {
    id: "briefing",
    business: "Entire business",
    mark: "TK",
    title: "Today's Briefing",
    detail: snapshot.briefing.observation,
    tone: "Information",
    action: "Open Offer",
    destination: "offer",
    question: "Why should I investigate today?",
    explanation: snapshot.briefing.reason,
    evidence: snapshot.briefing.evidence,
    intelligence: {
      comparison: snapshot.briefing.observation,
      recommendation: snapshot.briefing.recommendation,
      confidence: "Strong evidence",
    },
  };

  return (
    <div className="space-y-5">
      <section className="flex flex-col justify-between gap-4 border-b border-slate-300 pb-5 sm:flex-row sm:items-end dark:border-white/10">
        <div>
          <p className="text-sm text-slate-500">Good morning.</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            How is my business doing today?
          </h1>
        </div>
        <span className="inline-flex items-center gap-1 self-start rounded-full border bg-white px-3 py-1.5 text-xs font-semibold dark:border-white/10 dark:bg-ink">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Business Health: {snapshot.businessHealth.label}
        </span>
      </section>
      <BusinessTrend trends={snapshot.trends} />
      <section className="rounded-xl border bg-white shadow-sm dark:border-white/10 dark:bg-ink">
        <div className="border-b px-5 py-3 dark:border-white/10">
          <h2 className="text-xs font-semibold">Business Contexts</h2>
          <p className="mt-1 text-[10px] text-slate-500">
            Launch an Offer Workspace. Mission Control remains the
            entire-business view.
          </p>
        </div>
        <div className="flex gap-2 overflow-x-auto p-3">
          {snapshot.businesses.map((business) => (
            <button
              type="button"
              key={business.id}
              onClick={() => navigate("offer", business.businessContextId)}
              className="flex min-w-[220px] items-center gap-3 rounded-xl border p-3 text-left hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-white/10 dark:hover:bg-white/5"
            >
              <Mark value={business.mark} />
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-xs">
                  {business.name}
                </strong>
                <span className="mt-1 block text-[10px]">
                  Today&apos;s Profit <strong>{money(business.profit)}</strong>
                </span>
                <span className="mt-1 inline-flex items-center gap-1 text-[9px] text-slate-500">
                  {business.trend >= 0 ? (
                    <ArrowUp className="h-3 w-3" />
                  ) : (
                    <ArrowDown className="h-3 w-3" />
                  )}
                  {Math.abs(business.trend)}% ·{" "}
                  <ShieldCheck className="ml-1 h-3 w-3" />
                  {business.tracking}
                </span>
              </span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      </section>
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-xl border bg-white shadow-sm dark:border-white/10 dark:bg-ink">
          <div className="flex items-center justify-between border-b px-5 py-4 dark:border-white/10">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[.14em] text-slate-400">
                Continue where you left off
              </div>
              <h2 className="mt-1 text-sm font-semibold">
                {snapshot.continuation.business} ·{" "}
                {snapshot.continuation.subject}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {snapshot.continuation.detail}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                navigate(
                  "offer",
                  snapshot.continuation.businessContextId,
                  snapshot.continuation.offerDeepLink,
                )
              }
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-white/10"
            >
              Resume
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => inspect(briefingItem)}
          className="rounded-xl border bg-white p-4 text-left shadow-sm hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-white/10 dark:bg-ink"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            <strong className="text-sm">Today&apos;s Briefing</strong>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold">
            <span className="rounded-full border px-2 py-1 dark:border-white/10">
              {snapshot.briefing.opportunities} Opportunities
            </span>
            <span className="rounded-full border px-2 py-1 dark:border-white/10">
              {snapshot.briefing.warnings} Warning
            </span>
            <span className="rounded-full border px-2 py-1 dark:border-white/10">
              {snapshot.briefing.recommendations} Recommendation
            </span>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Open the concise daily briefing →
          </p>
        </button>
      </section>
      <section className="overflow-hidden rounded-xl border-2 border-slate-900 bg-white shadow-sm dark:border-white dark:bg-ink">
        <div className="flex items-end justify-between border-b px-5 py-4 dark:border-white/10">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[.14em] text-slate-400">
              Executive launch point
            </div>
            <h2 className="mt-1 text-xl font-semibold">Attention Required</h2>
            <p className="mt-1 text-xs text-slate-500">
              Should I investigate this?
            </p>
          </div>
          <span className="text-[10px] font-semibold">
            {snapshot.attention.length} routed decisions
          </span>
        </div>
        {snapshot.attention.map((item) => (
          <article
            key={item.id}
            className="grid gap-4 border-b px-5 py-5 last:border-0 md:grid-cols-[auto_1fr_auto] md:items-center dark:border-white/10"
          >
            <Mark value={item.mark} />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-sm">{item.business}</strong>
                <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase dark:border-white/10">
                  {item.tone === "Opportunity" ? (
                    <Sparkles className="h-3 w-3" />
                  ) : (
                    <AlertTriangle className="h-3 w-3" />
                  )}
                  {item.tone}
                </span>
              </div>
              <h3 className="mt-1 text-lg font-semibold">{item.title}</h3>
              <p className="mt-1 text-xs text-slate-500">
                <strong>Business impact:</strong> {item.detail}
              </p>
              <p className="mt-1 text-[10px] text-slate-400">
                Destination:{" "}
                {item.destination === "offer"
                  ? "Offer"
                  : item.destination === "customer"
                    ? "Customer"
                    : "Order"}{" "}
                Workspace
              </p>
            </div>
            <div className="flex gap-2 md:flex-col">
              <button
                type="button"
                onClick={() => inspect(item)}
                className="rounded-lg border px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-white/10"
              >
                Explain · Evidence
              </button>
              <button
                type="button"
                onClick={() =>
                  navigate(
                    item.destination,
                    item.businessContextId,
                    item.offerDeepLink,
                  )
                }
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-slate-400 dark:bg-white dark:text-slate-950"
              >
                {item.action}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </article>
        ))}
      </section>
      <section className="rounded-xl border bg-white shadow-sm dark:border-white/10 dark:bg-ink">
        <div className="border-b px-5 py-4 dark:border-white/10">
          <h2 className="text-sm font-semibold">Today&apos;s Winners</h2>
          <p className="mt-1 text-[11px] text-slate-500">
            Concise leaders across the entire business.
          </p>
        </div>
        <div className="divide-y dark:divide-white/10">
          {snapshot.winners.map((winner, index) => (
            <div
              key={winner.label}
              className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 px-5 py-3"
            >
              <span className="text-[10px] font-bold">#{index + 1}</span>
              <span>
                <span className="block text-[9px] font-semibold uppercase text-slate-400">
                  {winner.label}
                </span>
                <strong className="text-xs">{winner.value}</strong>
              </span>
              <span className="text-xs tabular-nums text-slate-600 dark:text-slate-300">
                {winner.detail}
              </span>
            </div>
          ))}
        </div>
      </section>
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border bg-white shadow-sm dark:border-white/10 dark:bg-ink">
          <div className="border-b px-5 py-4 dark:border-white/10">
            <h2 className="text-sm font-semibold">Recent Activity</h2>
          </div>
          <div className="divide-y dark:divide-white/10">
            {snapshot.recentActivity.map((activity) => (
              <button
                type="button"
                key={activity.id}
                onClick={() =>
                  navigate(
                    activity.destination,
                    activity.businessContextId,
                    activity.offerDeepLink,
                    activity.customerDeepLink,
                    activity.orderDeepLink,
                  )
                }
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-slate-400 dark:hover:bg-white/5"
              >
                <span className="rounded border px-2 py-1 text-[9px] font-semibold uppercase dark:border-white/10">
                  {activity.type}
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-xs">
                    {activity.title}
                  </strong>
                  <span className="block truncate text-[10px] text-slate-500">
                    {activity.detail}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4" />
              </button>
            ))}
          </div>
        </section>
        <section className="rounded-xl border bg-white shadow-sm dark:border-white/10 dark:bg-ink">
          <div className="border-b px-5 py-4 dark:border-white/10">
            <h2 className="text-sm font-semibold">Recent Searches</h2>
          </div>
          <div className="divide-y dark:divide-white/10">
            {snapshot.recentSearches.map((search) => (
              <button
                type="button"
                key={search.id}
                onClick={() =>
                  navigate(
                    search.destination,
                    search.businessContextId,
                    search.offerDeepLink,
                    search.customerDeepLink,
                    search.orderDeepLink,
                  )
                }
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-slate-400 dark:hover:bg-white/5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[9px] font-semibold uppercase text-slate-400">
                    {search.type}
                  </span>
                  <code className="block truncate text-xs">{search.value}</code>
                </span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
