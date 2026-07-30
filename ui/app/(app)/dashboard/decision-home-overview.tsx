"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card } from "@/components/ui/card";
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
  ExecutiveDashboardCurrencyAmount,
  ExecutiveDashboardRankingRow,
  ExecutiveDashboardResponse,
  ExecutiveDashboardTrendPoint,
} from "@/lib/profit-types";

type PeriodKey = "today" | "7d" | "30d" | "custom";
type TrendMetric =
  | "gross_revenue"
  | "order_revenue"
  | "orders"
  | "units_sold"
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
  { key: "gross_revenue", label: "Sales Revenue", color: "#0f766e", money: true },
  { key: "order_revenue", label: "Order Revenue", color: "#2563eb", money: true },
  { key: "orders", label: "Orders", color: "#7c3aed", money: false },
  { key: "units_sold", label: "Units Sold", color: "#0891b2", money: false },
  { key: "affiliate_commission", label: "Accrued Commission", color: "#d97706", money: true },
  { key: "after_affiliate_commission", label: "After Commission", color: "#16a34a", money: true },
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

function number(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
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
  const n = number(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: Math.abs(n) >= 100000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(n) >= 100000 ? 1 : 0,
  }).format(n);
}

function percent(value: unknown, digits = 1) {
  const n = Number(value);
  return Number.isFinite(n) ? `${(n * 100).toFixed(digits)}%` : "Unavailable";
}

function formatTimestamp(value?: string | null) {
  if (!value) return "unavailable";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "unavailable";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function customerFacingReason(value?: string | null) {
  return String(value || "")
    .replace(/diagnostic[-_]only/gi, "Snapshot Mode")
    .replace(/reporting_readiness/gi, "Profit Status");
}

function readinessTone(status?: string | null): "neutral" | "good" | "warn" | "bad" {
  if (status === "live") return "good";
  if (status === "unavailable") return "bad";
  if (status === "snapshot_mode" || status === "stale" || status === "limited") return "warn";
  return "neutral";
}

function amountForCurrency(rows: ExecutiveDashboardCurrencyAmount[] | undefined, currency = "USD") {
  if (!rows?.length) return null;
  const match = rows.find((row) => row.currency === currency);
  if (match) return number(match.amount);
  return rows.length === 1 ? number(rows[0].amount) : null;
}

function amountLabel(rows: ExecutiveDashboardCurrencyAmount[] | undefined, currency = "USD") {
  const amount = amountForCurrency(rows, currency);
  if (amount != null) return money(amount, currency);
  if (!rows?.length) return "Unavailable";
  return rows.map((row) => money(row.amount, row.currency)).join(" + ");
}

function deltaLabel(value: unknown, moneyValue: boolean, currency = "USD") {
  const n = number(value);
  if (n === 0) return "flat";
  const sign = n > 0 ? "+" : "";
  return moneyValue ? `${sign}${compactMoney(n, currency)}` : `${sign}${Math.round(n).toLocaleString("en-US")}`;
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
      return { period: "today", from: day, to: day };
    }

    const days = preset?.days || 1;
    return {
      period: preset?.key || "today",
      from: isoDateLocal(addDays(today, -(days - 1))),
      to: isoDateLocal(today),
    };
  }, [searchParams]);
}

function rangeQuery(range: { from: string; to: string }, extras: Record<string, string | null | undefined> = {}) {
  const params = new URLSearchParams({ from: range.from, to: range.to });
  Object.entries(extras).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

function periodHref(period: PeriodKey, brand?: string | null) {
  const today = new Date();
  const preset = PERIODS.find((item) => item.key === period);
  const dayCount = preset?.days || 1;
  const from = period === "today" ? isoDateLocal(today) : isoDateLocal(addDays(today, -(dayCount - 1)));
  const to = isoDateLocal(today);
  const params = new URLSearchParams({ period, from, to });
  if (brand) params.set("brand", brand);
  return `/dashboard?${params.toString()}`;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed p-5 text-center text-sm text-slate-500 dark:border-slate-800">
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
  qualified,
}: {
  label: string;
  value: string;
  detail: string;
  href?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
  qualified?: boolean;
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
      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
        {qualified ? "Incomplete" : value}
      </div>
      <div className="mt-1 text-sm text-slate-500">{qualified ? `${value} observed; ${detail}` : detail}</div>
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

function ProfitStatusCard({
  dashboard,
  range,
}: {
  dashboard: ExecutiveDashboardResponse | null;
  range: { from: string; to: string };
}) {
  const currency = dashboard?.filters?.currency || "USD";
  const readiness = dashboard?.reporting_readiness;
  const operationalProfitRows = dashboard?.operational_profit_by_currency;
  const hasOperationalProfit = Boolean(operationalProfitRows?.length && readiness?.profit_reporting_ready);
  const statusLabel = readiness?.status_label || "Profit Unavailable";
  const reliableThrough = readiness?.reliable_through || dashboard?.filters?.coverage?.commerce_latest_order_at || null;
  const reasons = (readiness?.incomplete_reasons || dashboard?.partial_reasons || [])
    .map((reason) => customerFacingReason(reason.message || reason.code || ""))
    .filter(Boolean)
    .slice(0, 4);

  const snapshotAccounts = (readiness?.accounts || [])
    .filter((account) => account.diagnostic_only || account.financial_mapping_complete === false)
    .map((account) => account.account_key || account.connector)
    .filter(Boolean);

  return (
    <div className={`mt-5 rounded-2xl border p-4 ${
      readinessTone(readiness?.status) === "good"
        ? "border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/60 dark:bg-emerald-950/20"
        : readinessTone(readiness?.status) === "bad"
          ? "border-red-200 bg-red-50/80 dark:border-red-900/60 dark:bg-red-950/20"
          : "border-amber-200 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/20"
    }`}>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Operational Profit</div>
          <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
            {hasOperationalProfit ? amountLabel(operationalProfitRows, currency) : "Unavailable"}
          </div>
          <div className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            Profit Status: {customerFacingReason(statusLabel)}
          </div>
          <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Reliable Through: {formatTimestamp(reliableThrough)}
          </div>
        </div>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-white/70 p-3 dark:bg-slate-950/30">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Last successful commerce sync</div>
            <div className="mt-1 font-medium text-slate-950 dark:text-slate-50">{formatTimestamp(dashboard?.filters?.coverage?.commerce_latest_order_at)}</div>
          </div>
          <div className="rounded-xl bg-white/70 p-3 dark:bg-slate-950/30">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Last successful financial sync</div>
            <div className="mt-1 font-medium text-slate-950 dark:text-slate-50">{formatTimestamp(readiness?.last_successful_financial_sync_at)}</div>
          </div>
          <div className="rounded-xl bg-white/70 p-3 dark:bg-slate-950/30">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Last reconciled month</div>
            <div className="mt-1 font-medium text-slate-950 dark:text-slate-50">{readiness?.period_reconciled ? "Closed period available" : "No closed period in this view"}</div>
          </div>
          <div className="rounded-xl bg-white/70 p-3 dark:bg-slate-950/30">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Actions</div>
            <div className="mt-1 flex flex-wrap gap-2">
              <Link href={`/dashboard/financial-reconciliation?${rangeQuery(range)}`} className="font-medium text-teal-700 hover:underline dark:text-teal-300">Financial Health</Link>
              <Link href={`/dashboard/financial-import-monitor?${rangeQuery(range)}`} className="font-medium text-teal-700 hover:underline dark:text-teal-300">Financial Imports</Link>
            </div>
          </div>
        </div>
      </div>

      {reasons.length || snapshotAccounts.length ? (
        <div className="mt-4 rounded-xl bg-white/70 p-3 text-sm text-slate-700 dark:bg-slate-950/30 dark:text-slate-200">
          <div className="font-medium">Incomplete reasons</div>
          <ul className="mt-2 space-y-1">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
            {snapshotAccounts.length ? (
              <li>Snapshot Mode sources: {snapshotAccounts.join(", ")}</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function StoryHeader({
  dashboard,
  range,
  financialHealth,
  importHealth,
  brand,
}: {
  dashboard: ExecutiveDashboardResponse | null;
  range: { period: PeriodKey; from: string; to: string };
  financialHealth: FinancialHealthSummary | null;
  importHealth: FinancialImportHealthSummary | null;
  brand?: string | null;
}) {
  const currency = dashboard?.filters?.currency || "USD";
  const business = dashboard?.business;
  const financial = dashboard?.financial;
  const partial = Boolean(dashboard?.partial);
  const grossRevenue = amountLabel(business?.gross_revenue_by_currency, currency);
  const orderRevenue = amountLabel(business?.total_order_revenue_by_currency, currency);
  const aov = amountLabel(business?.average_order_value_by_currency, currency);
  const refunds = amountLabel(financial?.refunds?.amount_by_currency, currency);
  const chargebacks = amountLabel(financial?.chargebacks?.amount_by_currency, currency);
  const commission = amountLabel(financial?.accrued_affiliate_commission?.amount_by_currency, currency);
  const afterCommission = amountLabel(financial?.after_affiliate_commission_by_currency, currency);
  const periodLabel = range.period === "today" ? "today" : "period";

  return (
    <section className="rounded-2xl border bg-white p-5 dark:border-slate-800 dark:bg-ink/70" aria-label="Business Performance Summary">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Executive Dashboard v2</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
            Business Performance
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Sales revenue is{" "}
            <span className="font-semibold text-slate-950 dark:text-slate-50">{grossRevenue}</span> from{" "}
            <span className="font-semibold text-slate-950 dark:text-slate-50">
              {(business?.sales_count || 0).toLocaleString("en-US")}
            </span>{" "}
            regular-order sales. Total orders are{" "}
            <span className="font-semibold text-slate-950 dark:text-slate-50">
              {(business?.order_count || 0).toLocaleString("en-US")}
            </span>{" "}
            after excluding non-commerce, refunded, chargeback, cancelled, voided, failed, declined, abandoned, and test rows.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((period) => {
            const active = period.key === range.period;
            return (
              <Link
                key={period.key}
                href={periodHref(period.key, brand)}
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

      {partial ? (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Profit Status is limited for this view.
          </div>
          <p className="mt-1">
            Reliable Through: {formatTimestamp(dashboard?.reporting_readiness?.reliable_through || dashboard?.filters?.coverage?.commerce_latest_order_at)}.
            {" "}Commerce metrics may remain visible, but complete Operational Profit requires current and mapped financial sources.
          </p>
        </div>
      ) : null}

      <ProfitStatusCard dashboard={dashboard} range={range} />

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
        <MetricCard label={`Sales Revenue ${periodLabel}`} value={grossRevenue} detail="Regular Order only" qualified={partial} />
        <MetricCard label="Total Order Revenue" value={orderRevenue} detail="Regular, upsell, and mini upsell orders" qualified={partial} />
        <MetricCard label="Orders" value={(business?.order_count || 0).toLocaleString("en-US")} detail="Valid commerce order rows" qualified={partial} href={`/orders?${rangeQuery(range, { brand })}`} />
        <MetricCard label="Units Sold" value={(business?.units_sold || 0).toLocaleString("en-US")} detail="Order Quantity (Units Sold)" qualified={partial} />
        <MetricCard label="AOV" value={aov} detail="Total order revenue divided by orders" qualified={partial} />
        <MetricCard label="Refund Events" value={refunds} detail={`${financial?.refunds?.event_count || 0} refund events`} tone="warn" href={`/dashboard/refunds?${rangeQuery(range, { brand })}`} />
        <MetricCard label="Chargeback Events" value={chargebacks} detail={`${financial?.chargebacks?.event_count || 0} chargeback events`} tone="warn" href={`/dashboard/chargebacks?${rangeQuery(range, { brand })}`} />
        <MetricCard
          label="After Affiliate Commission"
          value={financial?.accrued_affiliate_commission?.available ? afterCommission : "Unavailable"}
          detail={financial?.accrued_affiliate_commission?.available ? `Accrued commission ${commission}` : "Commission is missing, not zero"}
          tone={financial?.accrued_affiliate_commission?.available ? "neutral" : "warn"}
        />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <MetricCard
          label="Financial Health"
          value={financialHealth?.label || "Unavailable"}
          detail={financialHealth?.issue_label || "Open reconciliation health"}
          tone={financialHealthTone(financialHealth?.state)}
          href="/dashboard/financial-reconciliation"
        />
        <MetricCard
          label="Financial Imports"
          value={importHealth?.label || "Unavailable"}
          detail={importHealth ? `${importHealth.running_imports} running, ${importHealth.failed_imports} failed` : "Open financial imports"}
          tone={importHealthTone(importHealth?.state)}
          href="/dashboard/financial-import-monitor"
        />
        <MetricCard
          label="Customer Count"
          value={business?.customer_count == null ? "Unavailable" : business.customer_count.toLocaleString("en-US")}
          detail={business?.customer_count_unavailable_reason || "Distinct person_id only"}
          tone="warn"
        />
      </div>
    </section>
  );
}

function TrendModule({
  dashboard,
  metric,
  setMetric,
}: {
  dashboard: ExecutiveDashboardResponse | null;
  metric: TrendMetric;
  setMetric: (metric: TrendMetric) => void;
}) {
  const selected = TREND_METRICS.find((item) => item.key === metric) || TREND_METRICS[0];
  const currency = dashboard?.filters?.currency || "USD";
  const data = (dashboard?.business?.trend || []).map((point) => ({
    date: point.date,
    value: trendValue(point, metric, currency),
  }));

  return (
    <Card title="Why did performance move?" right={<span className="text-xs text-slate-500">Commerce, finance, and commission trends</span>}>
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

function trendValue(point: ExecutiveDashboardTrendPoint, key: TrendMetric, currency: string) {
  switch (key) {
    case "gross_revenue":
      return number(amountForCurrency(point.gross_revenue_by_currency, currency));
    case "order_revenue":
      return number(amountForCurrency(point.order_revenue_by_currency, currency));
    case "orders":
      return number(point.order_count);
    case "units_sold":
      return number(point.units_sold);
    case "affiliate_commission":
      return number(amountForCurrency(point.affiliate_commission_by_currency, currency));
    case "after_affiliate_commission":
      return number(amountForCurrency(point.after_affiliate_commission_by_currency, currency));
    case "refunds":
      return number(amountForCurrency(point.refund_amount_by_currency, currency));
    case "chargebacks":
      return number(amountForCurrency(point.chargeback_amount_by_currency, currency));
    default:
      return 0;
  }
}

function BrandPerformanceModule({ dashboard }: { dashboard: ExecutiveDashboardResponse | null }) {
  const rows = dashboard?.brands?.available || [];
  const currency = dashboard?.filters?.currency || "USD";

  return (
    <Card title="Which brands are performing?" right={<span className="text-xs text-slate-500">Exact raw Brand only</span>}>
      {rows.length ? (
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/70">
              <tr>
                <th className="px-3 py-2 text-left">Brand</th>
                <th className="px-3 py-2 text-right">Sales</th>
                <th className="px-3 py-2 text-right">Orders</th>
                <th className="px-3 py-2 text-right">Order Revenue</th>
                <th className="px-3 py-2 text-right">AOV</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 10).map((row) => (
                <tr key={row.brand} className="border-t dark:border-slate-800">
                  <td className="px-3 py-3 font-medium">{row.brand}</td>
                  <td className="px-3 py-3 text-right">{row.sales_count.toLocaleString("en-US")}</td>
                  <td className="px-3 py-3 text-right">{row.order_count.toLocaleString("en-US")}</td>
                  <td className="px-3 py-3 text-right font-mono">{amountLabel(row.total_order_revenue_by_currency, currency)}</td>
                  <td className="px-3 py-3 text-right font-mono">{amountLabel(row.average_order_value_by_currency, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState>No brand evidence exists for this period.</EmptyState>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Brand is resolved only from an exact `raw_json.Brand` value. Unknown brand remains explicit until a durable brand dimension is added.
      </p>
    </Card>
  );
}

function LeakageModule({ dashboard, range }: { dashboard: ExecutiveDashboardResponse | null; range: { from: string; to: string } }) {
  const currency = dashboard?.filters?.currency || "USD";
  const brand = dashboard?.filters?.brand || null;
  const rows = [
    {
      key: "refunds",
      label: "Refunds",
      metric: dashboard?.financial?.refunds,
      href: "/dashboard/refunds",
    },
    {
      key: "chargebacks",
      label: "Chargebacks",
      metric: dashboard?.financial?.chargebacks,
      href: "/dashboard/chargebacks",
    },
  ];

  return (
    <Card title="Where are we losing revenue?" right={<span className="text-xs text-slate-500">Financial ledger events</span>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <MetricCard
            key={row.key}
            label={row.label}
            value={amountLabel(row.metric?.amount_by_currency, currency)}
            detail={`${row.metric?.event_count || 0} events; ${percent(row.metric?.rate_by_orders)} of orders`}
            tone={number(amountForCurrency(row.metric?.amount_by_currency, currency)) > 0 ? "warn" : "good"}
            href={`${row.href}?${rangeQuery(range, { brand })}`}
          />
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Refunds and chargebacks are event-ledger facts filtered by event timestamp, not gross commerce rows.
      </p>
    </Card>
  );
}

function RankingTable({
  title,
  rows,
  empty,
  currency,
  partial,
}: {
  title: string;
  rows: ExecutiveDashboardRankingRow[];
  empty: string;
  currency: string;
  partial?: boolean;
}) {
  return (
    <Card title={title} right={partial ? <span className="text-xs text-amber-600">Incomplete commerce coverage</span> : null}>
      {rows.length ? (
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/70">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-right">Sales</th>
                <th className="px-3 py-2 text-right">Orders</th>
                <th className="px-3 py-2 text-right">Units</th>
                <th className="px-3 py-2 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.key || row.label}-${index}`} className="border-t dark:border-slate-800">
                  <td className="px-3 py-3 font-medium">{row.label || "Unknown"}</td>
                  <td className="px-3 py-3 text-right">{row.sales_count.toLocaleString("en-US")}</td>
                  <td className="px-3 py-3 text-right">{row.order_count.toLocaleString("en-US")}</td>
                  <td className="px-3 py-3 text-right">{row.units_sold.toLocaleString("en-US")}</td>
                  <td className="px-3 py-3 text-right font-mono">{amountLabel(row.revenue_by_currency, currency)}</td>
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
    <Card title="What needs attention now?" right={<span className="text-xs text-slate-500">Workspace operational signals</span>}>
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedBrand = searchParams.get("brand") || "";
  const [dashboard, setDashboard] = React.useState<ExecutiveDashboardResponse | null>(null);
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
        });
        if (selectedBrand) params.set("brand", selectedBrand);

        const localQuery = new URLSearchParams({
          workspace_id: "default",
          from: range.from,
          to: range.to,
        });

        const [dashboardResult, reconciliationResult, importResult, operationsResult] = await Promise.allSettled([
          sameOriginGetJson<ExecutiveDashboardResponse>(`/api/executive-dashboard?${params.toString()}`),
          sameOriginGetJson<FinancialReconciliationResponse>(`/api/financial-reconciliation?${localQuery.toString()}`),
          sameOriginGetJson<FinancialImportMonitorResponse>(`/api/financial-import-monitor?${localQuery.toString()}`),
          sameOriginGetJson<OperationsSummaryResponse>("/api/operations/summary?workspace_id=default"),
        ]);

        if (dashboardResult.status === "rejected") throw dashboardResult.reason;

        if (!cancelled) {
          setDashboard(dashboardResult.value);
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
  }, [range.from, range.to, range.period, selectedBrand]);

  const currency = dashboard?.filters?.currency || "USD";
  const warnings = (dashboard?.partial_reasons || [])
    .map((reason) => customerFacingReason(reason.message || reason.code || ""))
    .filter(Boolean);
  const partial = Boolean(dashboard?.partial);
  const brands = dashboard?.brands?.available || [];

  function changeBrand(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("brand", value);
    else params.delete("brand");
    router.push(`/dashboard?${params.toString()}`);
  }

  if (loading && !dashboard) {
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
        dashboard={dashboard}
        range={range}
        financialHealth={financialHealth}
        importHealth={importHealth}
        brand={selectedBrand}
      />

      <div className="flex flex-col gap-3 rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-ink/70 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-950 dark:text-slate-50">Brand view</div>
          <div className="mt-1 text-sm text-slate-500">Exact `raw_json.Brand` matching only; no fuzzy aliases yet.</div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Brand</span>
          <select
            value={selectedBrand}
            onChange={(event) => changeBrand(event.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="">All brands</option>
            {brands.map((row) => (
              <option key={row.brand} value={row.brand}>
                {row.brand}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
        <TrendModule dashboard={dashboard} metric={metric} setMetric={setMetric} />
        <Card title="Did we make money?" right={<CircleDollarSign className="h-5 w-5 text-slate-400" aria-hidden="true" />}>
          <div className="grid gap-3">
            <MetricCard
              label="Sales Revenue"
              value={amountLabel(dashboard?.business?.gross_revenue_by_currency, currency)}
              detail="Regular Order revenue"
              qualified={partial}
            />
            <MetricCard
              label="Accrued Affiliate Commission"
              value={dashboard?.financial?.accrued_affiliate_commission?.available ? amountLabel(dashboard.financial.accrued_affiliate_commission.amount_by_currency, currency) : "Unavailable"}
              detail="Payout Engine commission ledger"
              tone={dashboard?.financial?.accrued_affiliate_commission?.available ? "neutral" : "warn"}
            />
            <MetricCard
              label="After Affiliate Commission"
              value={dashboard?.financial?.accrued_affiliate_commission?.available ? amountLabel(dashboard.financial.after_affiliate_commission_by_currency, currency) : "Unavailable"}
              detail="Sales revenue minus accrued affiliate commission"
              tone={dashboard?.financial?.accrued_affiliate_commission?.available ? "good" : "warn"}
              qualified={partial && Boolean(dashboard?.financial?.accrued_affiliate_commission?.available)}
            />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <LeakageModule dashboard={dashboard} range={range} />
        <BrandPerformanceModule dashboard={dashboard} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <RankingTable
          title="Which affiliates are profitable?"
          rows={dashboard?.attribution?.affiliate_rankings || []}
          empty="No affiliate evidence exists in commerce rows for this period."
          currency={currency}
          partial={partial}
        />
        <RankingTable
          title="Which sources are creating profitable customers?"
          rows={dashboard?.attribution?.source_rankings || []}
          empty="No source evidence exists in commerce rows for this period."
          currency={currency}
          partial={partial}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <FunnelPlaceholder />
        <Card title="Can we trust the attribution?" right={<HeartPulse className="h-5 w-5 text-slate-400" aria-hidden="true" />}>
          <div className="grid gap-3 md:grid-cols-2">
            <MetricCard
              label="Commerce Source"
              value={dashboard?.business?.commerce_source || "platform_orders"}
              detail={dashboard?.business?.sales_definition || "Regular Order sales"}
              tone="good"
            />
            <MetricCard
              label="Commission Source"
              value={dashboard?.financial?.accrued_affiliate_commission?.available ? "Available" : "Unavailable"}
              detail={dashboard?.financial?.accrued_affiliate_commission?.source || "Payout Engine affiliate_commissions ledger"}
              tone={dashboard?.financial?.accrued_affiliate_commission?.available ? "good" : "warn"}
            />
          </div>
          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-900/70 dark:text-slate-300">
            <div className="flex items-center gap-2 font-medium text-slate-900 dark:text-white">
              <BarChart3 className="h-4 w-4" aria-hidden="true" />
              Data lineage
            </div>
            <p className="mt-2">{dashboard?.business?.orders_definition || "Order definition unavailable."}</p>
            <p className="mt-2">{dashboard?.brands?.resolver || "Brand resolver unavailable."}</p>
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
              Timezone: {dashboard?.filters?.timezone || "UTC"} ({dashboard?.filters?.timezone_source || "fallback"})
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-900/70">
            <div className="font-medium">Currency</div>
            <div className="mt-1 text-slate-500">
              {dashboard?.filters?.currencies?.length ? dashboard.filters.currencies.join(", ") : currency}
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-900/70">
            <div className="font-medium">Generated</div>
            <div className="mt-1 text-slate-500">{formatTimestamp(dashboard?.generated_at)}</div>
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
