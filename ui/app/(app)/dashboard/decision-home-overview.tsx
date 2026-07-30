"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CircleDollarSign,
  ClipboardList,
  FileSearch,
  HeartPulse,
  ReceiptText,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { apiGetJson } from "@/lib/api";
import { sameOriginGetJson } from "@/lib/same-origin-api";
import {
  deriveFinancialHealth,
  type FinancialHealthSummary,
  type FinancialReconciliationResponse,
} from "@/lib/financial-reconciliation";
import {
  deriveFinancialImportHealth,
  type FinancialImportHealthSummary,
  type FinancialImportMonitorResponse,
} from "@/lib/financial-import-monitor";
import type { OperationsSummaryResponse } from "@/lib/work-items";
import type {
  ExecutivePerformanceResponse,
  ExecutiveRankingRow,
  ExecutiveTrendPoint,
  ProfitSummaryResponse,
} from "@/lib/profit-types";

type PeriodKey = "today" | "7d" | "30d" | "custom";
type TrendMetric =
  | "net_profit"
  | "gross_revenue"
  | "sales_count"
  | "affiliate_commission"
  | "after_affiliate_commission"
  | "refunds"
  | "chargebacks";

const PERIODS: Array<{ key: PeriodKey; label: string; days: number }> = [
  { key: "today", label: "Today", days: 1 },
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
];

const TREND_METRICS: Array<{ key: TrendMetric; label: string; color: string; money: boolean }> = [
  { key: "net_profit", label: "Net Profit", color: "#2563eb", money: true },
  { key: "gross_revenue", label: "Gross Revenue", color: "#0f766e", money: true },
  { key: "sales_count", label: "Sales", color: "#7c3aed", money: false },
  { key: "affiliate_commission", label: "Affiliate Commission", color: "#d97706", money: true },
  { key: "after_affiliate_commission", label: "After Commission", color: "#0891b2", money: true },
  { key: "refunds", label: "Refunds", color: "#ea580c", money: true },
  { key: "chargebacks", label: "Chargebacks", color: "#dc2626", money: true },
];

function isoDateLocal(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function money(value: unknown, currency = "USD", digits = 0) {
  const n = Number(value ?? 0);
  return n.toLocaleString("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function compactMoney(value: unknown, currency = "USD") {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: Math.abs(n) >= 100000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(n) >= 100000 ? 1 : 0,
  }).format(n);
}

function number(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function percent(value: unknown, digits = 1) {
  const n = number(value);
  if (!Number.isFinite(n)) return "-";
  return `${(n * 100).toFixed(digits)}%`;
}

function deltaLabel(value: unknown, moneyValue: boolean, currency = "USD") {
  const n = number(value);
  if (n === 0) return "flat";
  const sign = n > 0 ? "+" : "";
  return moneyValue ? `${sign}${compactMoney(n, currency)}` : `${sign}${Math.round(n).toLocaleString("en-US")}`;
}

function trendValue(point: ExecutiveTrendPoint, key: TrendMetric) {
  return number((point as Record<string, unknown>)[key]);
}

function useDashboardPeriod(): { period: PeriodKey; from: string; to: string } {
  const searchParams = useSearchParams();
  return React.useMemo(() => {
    const today = new Date();
    const requestedPeriod = (searchParams.get("period") || "today") as PeriodKey;
    const fromQ = searchParams.get("from");
    const toQ = searchParams.get("to");
    const preset = PERIODS.find((period) => period.key === requestedPeriod);

    if (fromQ || toQ) {
      const to = toQ || fromQ || isoDateLocal(today);
      const from = fromQ || to;
      return { period: requestedPeriod || "custom", from, to };
    }

    if (preset?.key === "today") {
      const day = isoDateLocal(today);
      return { period: "today" as PeriodKey, from: day, to: day };
    }

    const days = preset?.days || 1;
    return {
      period: preset?.key || "today",
      from: isoDateLocal(addDays(today, -(days - 1))),
      to: isoDateLocal(today),
    };
  }, [searchParams]);
}

function rangeQuery(range: { from: string; to: string }) {
  return new URLSearchParams({ from: range.from, to: range.to }).toString();
}

function periodHref(period: PeriodKey) {
  const today = new Date();
  const preset = PERIODS.find((item) => item.key === period);
  const dayCount = preset?.days || 1;
  const from = period === "today" ? isoDateLocal(today) : isoDateLocal(addDays(today, -(dayCount - 1)));
  const to = isoDateLocal(today);
  return `/dashboard?period=${period}&from=${from}&to=${to}`;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-44 items-center justify-center rounded-lg border border-dashed p-5 text-center text-sm text-slate-500 dark:border-slate-800">
      {children}
    </div>
  );
}

function financialHealthTone(state: FinancialHealthSummary["state"] | undefined): "neutral" | "good" | "warn" | "bad" {
  if (state === "healthy") return "good";
  if (state === "critical") return "bad";
  if (state === "review_needed" || state === "partial") return "warn";
  return "neutral";
}

function importHealthTone(state: FinancialImportHealthSummary["state"] | undefined): "neutral" | "good" | "warn" | "bad" {
  if (state === "Healthy") return "good";
  if (state === "Critical") return "bad";
  if (state === "Review needed" || state === "Partial data" || state === "No imports configured") return "warn";
  return "neutral";
}

function MetricCard({
  label,
  value,
  detail,
  href,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  href?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/60 dark:bg-emerald-950/20"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/20"
        : tone === "bad"
          ? "border-red-200 bg-red-50/80 dark:border-red-900/60 dark:bg-red-950/20"
          : "border-slate-200 bg-white dark:border-slate-800 dark:bg-ink/60";
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
        {href ? <ArrowUpRight className="h-4 w-4 text-slate-400" aria-hidden="true" /> : null}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">{value}</div>
      <div className="mt-1 text-sm text-slate-500">{detail}</div>
    </>
  );

  if (!href) {
    return <div className={`rounded-xl border p-4 ${toneClass}`}>{body}</div>;
  }

  return (
    <Link
      href={href}
      className={`block rounded-xl border p-4 transition hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${toneClass}`}
    >
      {body}
    </Link>
  );
}

function StoryHeader({
  performance,
  range,
  financialHealth,
  importHealth,
}: {
  performance: ExecutivePerformanceResponse | null;
  range: { period: PeriodKey; from: string; to: string };
  financialHealth: FinancialHealthSummary | null;
  importHealth: FinancialImportHealthSummary | null;
}) {
  const headline = performance?.headline;
  const profit = number(headline?.net_profit);
  const currency = performance?.currency || "USD";
  const sales = number(headline?.sales_count);
  const commission = number(headline?.affiliate_commission?.commission_amount);
  const commissionAvailable = Boolean(headline?.affiliate_commission?.available);
  const afterCommission = headline?.after_affiliate_commission == null ? null : number(headline.after_affiliate_commission);
  const aov = headline?.aov == null ? null : number(headline.aov);
  const periodLabel = range.period === "today" ? "today" : "period";
  const profitTone = profit >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300";

  return (
    <section className="rounded-2xl border bg-white p-5 dark:border-slate-800 dark:bg-ink/70" aria-label="Executive Performance Summary">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Executive Performance</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
            {range.period === "today" ? "How are we doing today?" : "How did the business perform?"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Net profit is <span className={`font-semibold ${profitTone}`}>{money(profit, currency)}</span> from{" "}
            <span className="font-semibold text-slate-950 dark:text-slate-50">{sales.toLocaleString("en-US")}</span>{" "}
            canonical sales. Affiliate commission is{" "}
            <span className="font-semibold text-slate-950 dark:text-slate-50">
              {commissionAvailable ? money(commission, currency) : "unavailable"}
            </span>{" "}
            from the payout ledger.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((period) => {
            const active = period.key === range.period;
            return (
              <Link
                key={period.key}
                href={periodHref(period.key)}
                className={`rounded-full border px-3 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                  active
                    ? "border-teal-600 bg-teal-600 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                }`}
              >
                {period.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
        <MetricCard
          label={`Revenue ${periodLabel}`}
          value={performance ? money(headline?.gross_revenue, currency) : "-"}
          detail={`${deltaLabel(headline?.deltas?.gross_revenue?.amount, true, currency)} vs comparison window`}
        />
        <MetricCard
          label={`Sales ${periodLabel}`}
          value={performance ? sales.toLocaleString("en-US") : "-"}
          detail={`${deltaLabel(headline?.deltas?.sales_count?.amount, false)} vs comparison window`}
          href={`/orders?${rangeQuery(range)}`}
        />
        <MetricCard
          label="Affiliate Commission"
          value={performance ? (commissionAvailable ? money(commission, currency) : "Unavailable") : "-"}
          detail={commissionAvailable ? "Generated payout-engine commission" : "No commission rows for this period"}
          tone={commissionAvailable ? "neutral" : "warn"}
          href="/dashboard/financial-reconciliation"
        />
        <MetricCard
          label="After affiliate commission"
          value={performance ? (afterCommission == null ? "Unavailable" : money(afterCommission, currency)) : "-"}
          detail="Sales revenue minus generated commission"
          tone={afterCommission == null ? "warn" : afterCommission >= 0 ? "good" : "bad"}
        />
        <MetricCard
          label="Average order value"
          value={performance ? (aov == null ? "Not available" : money(aov, currency)) : "-"}
          detail="Revenue divided by canonical sales"
        />
        <MetricCard
          label="Financial Health"
          value={financialHealth?.label || "Unavailable"}
          detail={financialHealth?.issue_label || "Open reconciliation health"}
          tone={financialHealthTone(financialHealth?.state)}
          href="/dashboard/financial-reconciliation"
        />
        <MetricCard
          label="Import Health"
          value={importHealth?.label || "Unavailable"}
          detail={
            importHealth
              ? `${importHealth.running_imports} running, ${importHealth.failed_imports} failed`
              : "Open financial imports"
          }
          tone={importHealthTone(importHealth?.state)}
          href="/dashboard/financial-import-monitor"
        />
      </div>
    </section>
  );
}

function TrendModule({
  performance,
  metric,
  setMetric,
}: {
  performance: ExecutivePerformanceResponse | null;
  metric: TrendMetric;
  setMetric: (metric: TrendMetric) => void;
}) {
  const selected = TREND_METRICS.find((item) => item.key === metric) || TREND_METRICS[0];
  const data = (performance?.trend || []).map((point) => ({
    date: String(point.date || ""),
    value: trendValue(point, metric),
  }));
  const currency = performance?.currency || "USD";

  return (
    <Card
      title="Why did performance move?"
      right={<span className="text-xs text-slate-500">Selectable operating trend</span>}
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {TREND_METRICS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setMetric(item.key)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-teal-500 ${
              item.key === metric
                ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {data.length ? (
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 18, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} minTickGap={24} />
              <YAxis
                width={86}
                tickFormatter={(value) => selected.money ? compactMoney(value, currency) : Number(value || 0).toLocaleString("en-US")}
              />
              <Tooltip
                formatter={(value) => selected.money ? money(value, currency) : Number(value || 0).toLocaleString("en-US")}
                labelFormatter={(label) => String(label)}
              />
              <Line type="monotone" dataKey="value" name={selected.label} dot={false} stroke={selected.color} strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState>No trend points exist for this period yet.</EmptyState>
      )}
    </Card>
  );
}

function CostModule({ performance }: { performance: ExecutivePerformanceResponse | null }) {
  const rows = performance?.cost_breakdown || [];
  const currency = performance?.currency || "USD";

  return (
    <Card title="Where did the money go?" right={<span className="text-xs text-slate-500">Mapped operating costs</span>}>
      {rows.length ? (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.key || row.label} className="grid gap-2 rounded-lg border p-3 dark:border-slate-800 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <div className="font-medium">{row.label}</div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900">
                  <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.max(4, Math.min(100, number(row.share) * 100))}%` }} />
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono font-semibold">{money(row.amount, currency)}</div>
                <div className="text-xs text-slate-500">{percent(row.share)} of mapped costs</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState>Operating cost rows are not mapped for this period.</EmptyState>
      )}
    </Card>
  );
}

function LeakageModule({ performance, range }: { performance: ExecutivePerformanceResponse | null; range: { from: string; to: string } }) {
  const currency = performance?.currency || "USD";
  const rows = performance?.leakage || [];

  return (
    <Card title="Where are we losing revenue?" right={<span className="text-xs text-slate-500">Refunds and chargebacks</span>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <MetricCard
            key={row.key || row.label}
            label={row.label || "Revenue leakage"}
            value={money(row.amount, currency)}
            detail={`${percent(row.rate)} of gross revenue`}
            tone={number(row.amount) > 0 ? "warn" : "good"}
            href={row.href ? `${row.href}?${rangeQuery(range)}` : undefined}
          />
        ))}
      </div>
    </Card>
  );
}

function RankingTable({
  title,
  rows,
  labelKey,
  empty,
  currency,
}: {
  title: string;
  rows: ExecutiveRankingRow[];
  labelKey: "affiliate_id" | "source";
  empty: string;
  currency: string;
}) {
  return (
    <Card title={title}>
      {rows.length ? (
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/70">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-right">Attributed Revenue</th>
                <th className="px-3 py-2 text-right">Commission</th>
                <th className="px-3 py-2 text-right">After Commission</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row[labelKey] || "unknown"}-${index}`} className="border-t dark:border-slate-800">
                  <td className="px-3 py-3 font-medium">{row[labelKey] || "Unknown"}</td>
                  <td className="px-3 py-3 text-right font-mono">{money(row.attributed_revenue, currency)}</td>
                  <td className="px-3 py-3 text-right font-mono">{money(row.commission_amount, currency)}</td>
                  <td className="px-3 py-3 text-right font-mono">{money(row.net_after_commission, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState>{empty}</EmptyState>
      )}
    </Card>
  );
}

function OperationalHealthModule({
  warnings,
  financialHealth,
  importHealth,
  operations,
}: {
  warnings: string[];
  financialHealth: FinancialHealthSummary | null;
  importHealth: FinancialImportHealthSummary | null;
  operations: OperationsSummaryResponse | null;
}) {
  const cards = [
    {
      title: "Financial Health",
      detail: financialHealth?.description || "Review unmatched ledger events and reconciliation status.",
      status: financialHealth?.label || "Unavailable",
      href: "/dashboard/financial-reconciliation",
      icon: ShieldCheck,
      tone: financialHealthTone(financialHealth?.state),
    },
    {
      title: "Financial Imports",
      detail: importHealth
        ? `${importHealth.running_imports} running, ${importHealth.failed_imports} failed, ${importHealth.accounts_needing_attention} need attention.`
        : "Check connector freshness, retries, and pipeline health.",
      status: importHealth?.label || "Unavailable",
      href: "/dashboard/financial-import-monitor",
      icon: FileSearch,
      tone: importHealthTone(importHealth?.state),
    },
    {
      title: "Work Items",
      detail: operations
        ? `${operations.metrics.open} open, ${operations.metrics.urgent} urgent, ${operations.metrics.high} high priority.`
        : "Open operational tasks that need attention.",
      status: operations ? "Queue summary" : "Unavailable",
      href: "/operations",
      icon: ClipboardList,
      tone: operations && operations.metrics.urgent > 0 ? "bad" as const : operations && operations.metrics.open > 0 ? "warn" as const : "neutral" as const,
    },
  ];

  return (
    <Card title="What needs attention now?" right={<span className="text-xs text-slate-500">Uses existing operational surfaces</span>}>
      <div className="grid gap-3 md:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          const toneClass =
            card.tone === "good"
              ? "border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/60 dark:bg-emerald-950/20"
              : card.tone === "warn"
                ? "border-amber-200 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/20"
                : card.tone === "bad"
                  ? "border-red-200 bg-red-50/80 dark:border-red-900/60 dark:bg-red-950/20"
                  : "border-slate-200 dark:border-slate-800";
          return (
            <Link
              key={card.title}
              href={card.href}
              className={`rounded-xl border p-4 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:hover:bg-slate-900 ${toneClass}`}
            >
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-slate-100 p-2 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <div className="font-medium">{card.title}</div>
                  <div className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">{card.status}</div>
                  <div className="mt-1 text-sm text-slate-500">{card.detail}</div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {warnings.length ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Data confidence notes
          </div>
          <ul className="mt-2 space-y-1">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

function FunnelPlaceholder() {
  const stages = [
    { label: "Visited", value: 100 },
    { label: "Identified", value: 64 },
    { label: "Checkout", value: 29 },
    { label: "Purchased", value: 12 },
  ];
  return (
    <Card title="Where are customers dropping off?" right={<span className="text-xs text-slate-500">Funnel placeholder</span>}>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={stages} layout="vertical" margin={{ top: 8, right: 20, left: 8, bottom: 8 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="label" width={84} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value) => `${value}%`} />
            <Bar dataKey="value" radius={[0, 8, 8, 0]}>
              {stages.map((stage, index) => (
                <Cell key={stage.label} fill={["#0f766e", "#2563eb", "#d97706", "#7c3aed"][index]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-sm text-slate-500">Product-stage mapping is not connected yet, so this uses a placeholder shape only.</p>
    </Card>
  );
}

export function DecisionHomeOverview() {
  const range = useDashboardPeriod();
  const [summary, setSummary] = React.useState<ProfitSummaryResponse | null>(null);
  const [financialHealth, setFinancialHealth] = React.useState<FinancialHealthSummary | null>(null);
  const [importHealth, setImportHealth] = React.useState<FinancialImportHealthSummary | null>(null);
  const [operations, setOperations] = React.useState<OperationsSummaryResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [metric, setMetric] = React.useState<TrendMetric>("gross_revenue");

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const params = new URLSearchParams({
          workspace_id: "default",
          from: range.from,
          to: range.to,
          period: range.period,
          timezone,
          include_executive_performance: "1",
        });
        const localQuery = new URLSearchParams({
          workspace_id: "default",
          from: range.from,
          to: range.to,
        });

        const [performanceResult, reconciliationResult, importResult, operationsResult] = await Promise.allSettled([
          apiGetJson<ProfitSummaryResponse>(`/v1/profit/summary?${params.toString()}`),
          sameOriginGetJson<FinancialReconciliationResponse>(`/api/financial-reconciliation?${localQuery.toString()}`),
          sameOriginGetJson<FinancialImportMonitorResponse>(`/api/financial-import-monitor?${localQuery.toString()}`),
          sameOriginGetJson<OperationsSummaryResponse>("/api/operations/summary?workspace_id=default"),
        ]);

        if (performanceResult.status === "rejected") throw performanceResult.reason;

        if (!cancelled) {
          setSummary(performanceResult.value);
          setFinancialHealth(
            reconciliationResult.status === "fulfilled" && reconciliationResult.value?.ok
              ? deriveFinancialHealth(reconciliationResult.value)
              : null,
          );
          setImportHealth(
            importResult.status === "fulfilled" && importResult.value?.ok
              ? deriveFinancialImportHealth(importResult.value)
              : null,
          );
          setOperations(
            operationsResult.status === "fulfilled" && operationsResult.value?.ok
              ? operationsResult.value
              : null,
          );
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Executive dashboard data is unavailable.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, range.period]);

  const performance = summary?.executive_performance || null;
  const currency = performance?.currency || "USD";
  const warnings = performance?.diagnostics?.warnings || [];
  const profit = performance?.profit;
  const sales = number(performance?.headline?.sales_count);
  const netProfit = number(performance?.headline?.net_profit);

  if (loading && !summary) {
    return (
      <div className="space-y-6">
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" />
        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
          <div className="h-80 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" />
          <div className="h-80 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StoryHeader
        performance={performance}
        range={range}
        financialHealth={financialHealth}
        importHealth={importHealth}
      />

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
        <TrendModule performance={performance} metric={metric} setMetric={setMetric} />
        <Card title="Did we make money?" right={<CircleDollarSign className="h-5 w-5 text-slate-400" aria-hidden="true" />}>
          <div className="grid gap-3">
            <MetricCard
              label="Net Profit"
              value={money(netProfit, currency)}
              detail={`${percent(profit?.profit_margin_pct ? number(profit.profit_margin_pct) / 100 : null)} margin`}
              tone={netProfit >= 0 ? "good" : "bad"}
            />
            <MetricCard
              label="Net Revenue"
              value={money(profit?.net_revenue, currency)}
              detail="After refunds and chargebacks"
            />
            <MetricCard
              label="Orders"
              value={sales.toLocaleString("en-US")}
              detail={`AOV ${profit?.aov == null ? "-" : money(profit.aov, currency)}`}
            />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <CostModule performance={performance} />
        <LeakageModule performance={performance} range={range} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <RankingTable
          title="Which affiliates are profitable?"
          rows={performance?.affiliates || []}
          labelKey="affiliate_id"
          empty="No affiliate commission rows exist for this period."
          currency={currency}
        />
        <RankingTable
          title="Which sources are creating profitable customers?"
          rows={performance?.sources || []}
          labelKey="source"
          empty="No source-level commission evidence exists for this period."
          currency={currency}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <FunnelPlaceholder />
        <Card title="Can we trust the attribution?" right={<HeartPulse className="h-5 w-5 text-slate-400" aria-hidden="true" />}>
          <div className="grid gap-3 md:grid-cols-2">
            <MetricCard
              label="Canonical Sales"
              value={sales.toLocaleString("en-US")}
              detail="Direct ledger sale count, deduped by order or transaction"
              tone="good"
            />
            <MetricCard
              label="Commission Source"
              value={performance?.headline?.affiliate_commission?.available ? "Available" : "Unavailable"}
              detail="Payout Engine affiliate_commissions ledger"
              tone={performance?.headline?.affiliate_commission?.available ? "good" : "warn"}
            />
          </div>
          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-900/70 dark:text-slate-300">
            <div className="flex items-center gap-2 font-medium text-slate-900 dark:text-white">
              <BarChart3 className="h-4 w-4" aria-hidden="true" />
              Data lineage
            </div>
            <p className="mt-2">
              {performance?.diagnostics?.canonical_sales_definition || "Sales definition is unavailable."}
            </p>
            <p className="mt-2">
              {performance?.diagnostics?.commission_source || "Commission source is unavailable."}
            </p>
          </div>
        </Card>
      </div>

      <OperationalHealthModule
        warnings={warnings}
        financialHealth={financialHealth}
        importHealth={importHealth}
        operations={operations}
      />

      <Card title="Dashboard model" right={<ReceiptText className="h-5 w-5 text-slate-400" aria-hidden="true" />}>
        <div className="grid gap-3 text-sm md:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-900/70">
            <div className="font-medium">Today is workspace-local</div>
            <div className="mt-1 text-slate-500">
              Timezone: {performance?.timezone || "UTC"} ({performance?.timezone_source || "fallback"})
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-900/70">
            <div className="font-medium">Currency</div>
            <div className="mt-1 text-slate-500">
              {performance?.currencies?.length ? performance.currencies.join(", ") : currency}
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-900/70">
            <div className="font-medium">Rows scanned</div>
            <div className="mt-1 text-slate-500">
              {number(performance?.diagnostics?.conversion_rows_scanned).toLocaleString("en-US")} ledger rows,{" "}
              {number(performance?.diagnostics?.commission_rows_scanned).toLocaleString("en-US")} commission rows
            </div>
          </div>
        </div>
      </Card>

      <div className="sr-only" aria-live="polite">
        <TrendingUp aria-hidden="true" />
        Executive dashboard loaded.
      </div>
    </div>
  );
}
