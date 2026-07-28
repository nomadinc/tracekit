"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

import { apiGetJson } from "@/lib/api";
import type {
  FinancialIssueAffectedOrder,
  FinancialIssueAnalysisResponse,
  FinancialIssueKind,
  FinancialIssueSourceRow,
} from "@/lib/profit-types";

type Props = {
  kind: FinancialIssueKind;
};

const COPY = {
  refund: {
    title: "Refund Analysis",
    question: "Which affiliates and traffic sources are causing refunds?",
    amountLabel: "Total Refund Amount",
    ordersLabel: "Number of Refunded Orders",
    orderRateLabel: "Refund Rate by Orders",
    revenueRateLabel: "Refund Rate by Revenue",
    averageLabel: "Average Refund Amount",
    countLabel: "Refund Count",
    amountColumn: "Refund Amount",
    noData: "No refunds were recorded in the selected period.",
    endpoint: "/v1/refunds/analysis",
    issueName: "refund",
  },
  chargeback: {
    title: "Chargeback Analysis",
    question: "Which affiliates and traffic sources are causing chargebacks?",
    amountLabel: "Total Chargeback Amount",
    ordersLabel: "Number of Charged-Back Orders",
    orderRateLabel: "Chargeback Rate by Orders",
    revenueRateLabel: "Chargeback Rate by Revenue",
    averageLabel: "Average Chargeback Amount",
    countLabel: "Chargeback Count",
    amountColumn: "Chargeback Amount",
    noData: "No chargebacks were recorded in the selected period.",
    endpoint: "/v1/chargebacks/analysis",
    issueName: "chargeback",
  },
} as const;

const SORT_OPTIONS = [
  { value: "rate_by_revenue", label: "Rate by Revenue" },
  { value: "count", label: "Count" },
  { value: "amount", label: "Amount" },
  { value: "rate_by_orders", label: "Rate by Orders" },
  { value: "total_revenue", label: "Total Revenue" },
];

function isoDateLocal(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function defaultRange() {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 29);
  return { from: isoDateLocal(from), to: isoDateLocal(today) };
}

function formatMoney(value: unknown) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "Unavailable";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "Unavailable";
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function formatNumber(value: unknown) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "Unavailable";
  return n.toLocaleString("en-US");
}

function compactDate(value: string | null | undefined) {
  if (!value) return "Unavailable";
  return String(value).slice(0, 10);
}

function sourceId(row: FinancialIssueSourceRow) {
  return row.affiliate_id || row.source_id || row.campaign_id || "Unknown";
}

function groupTypeLabel(value: string | null | undefined) {
  if (value === "traffic_source") return "Traffic Source";
  if (value === "affiliate") return "Affiliate";
  if (value === "campaign") return "Campaign";
  return "Unattributed";
}

function metricUnavailable(value: number | null | undefined) {
  return value == null || !Number.isFinite(Number(value));
}

function SummaryCard({ label, value, helper, warning }: { label: string; value: string; helper: string; warning?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${warning ? "border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20" : "bg-white dark:bg-ink/60"}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{helper}</div>
    </div>
  );
}

function DataQuality({ data }: { data: FinancialIssueAnalysisResponse | null }) {
  const warnings = data?.data_quality?.warnings || [];
  const missing = data?.data_quality?.missing_denominators || [];
  const coverage = data?.data_quality?.attributed_order_coverage;

  if (!warnings.length && !missing.length && coverage == null) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
      <div className="font-semibold">Data quality</div>
      <div className="mt-1">
        Attribution coverage: {coverage == null ? "Unavailable" : formatPercent(coverage)}
      </div>
      {missing.length ? (
        <div className="mt-1">Missing denominators: {missing.join(" · ")}</div>
      ) : null}
      {warnings.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function TrendChart({ data, kind }: { data: FinancialIssueAnalysisResponse | null; kind: FinancialIssueKind }) {
  const copy = COPY[kind];
  const rows = data?.trend || [];

  return (
    <section className="rounded-2xl border bg-white p-5 dark:bg-ink/60">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Trend</h2>
          <p className="mt-1 text-sm text-slate-500">
            {copy.amountColumn} and event count over the selected date range.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-900 dark:text-slate-300">
          {rows.length ? `${rows.length} buckets` : "No buckets"}
        </span>
      </div>
      <div className="mt-4 h-56">
        {rows.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-slate-800" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickMargin={8} />
              <YAxis yAxisId="amount" tick={{ fontSize: 11 }} width={56} tickFormatter={(value) => `$${Number(value).toLocaleString("en-US")}`} />
              <YAxis yAxisId="count" orientation="right" tick={{ fontSize: 11 }} width={32} />
              <Tooltip
                formatter={(value, name) => (
                  name === "amount"
                    ? [formatMoney(value), copy.amountColumn]
                    : [formatNumber(value), copy.countLabel]
                )}
              />
              <Line yAxisId="amount" type="monotone" dataKey="amount" stroke="#f59e0b" strokeWidth={2} dot={false} />
              <Line yAxisId="count" type="monotone" dataKey="count" stroke="#0f766e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500 dark:bg-slate-900/70">
            Trend appears after {copy.issueName} events exist in the selected period.
          </div>
        )}
      </div>
    </section>
  );
}

function Filters({
  values,
  onChange,
}: {
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  function setValue(key: string, value: string) {
    onChange({ ...values, [key]: value, page: "1" });
  }

  return (
    <div className="grid gap-3 rounded-2xl border bg-white p-4 text-sm dark:bg-ink/60 md:grid-cols-2 xl:grid-cols-6">
      <label className="space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Affiliate</span>
        <input value={values.affiliate_id || ""} onChange={(event) => setValue("affiliate_id", event.target.value)} className="w-full rounded-lg border bg-white px-3 py-2 dark:bg-slate-950" />
      </label>
      <label className="space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Traffic Source</span>
        <input value={values.source_id || ""} onChange={(event) => setValue("source_id", event.target.value)} className="w-full rounded-lg border bg-white px-3 py-2 dark:bg-slate-950" />
      </label>
      <label className="space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Campaign</span>
        <input value={values.campaign_id || ""} onChange={(event) => setValue("campaign_id", event.target.value)} className="w-full rounded-lg border bg-white px-3 py-2 dark:bg-slate-950" />
      </label>
      <label className="space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Attribution</span>
        <select value={values.attribution_status || ""} onChange={(event) => setValue("attribution_status", event.target.value)} className="w-full rounded-lg border bg-white px-3 py-2 dark:bg-slate-950">
          <option value="">All</option>
          <option value="attributed">Attributed</option>
          <option value="unattributed">Unattributed</option>
        </select>
      </label>
      <label className="space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Sort</span>
        <select value={values.sort || "rate_by_revenue"} onChange={(event) => setValue("sort", event.target.value)} className="w-full rounded-lg border bg-white px-3 py-2 dark:bg-slate-950">
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <label className="space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Direction</span>
        <select value={values.direction || "desc"} onChange={(event) => setValue("direction", event.target.value)} className="w-full rounded-lg border bg-white px-3 py-2 dark:bg-slate-950">
          <option value="desc">High to low</option>
          <option value="asc">Low to high</option>
        </select>
      </label>
    </div>
  );
}

function SourceTable({
  data,
  kind,
  onSelect,
}: {
  data: FinancialIssueAnalysisResponse | null;
  kind: FinancialIssueKind;
  onSelect: (row: FinancialIssueSourceRow) => void;
}) {
  const copy = COPY[kind];
  const rows = data?.sources || [];

  return (
    <section className="rounded-2xl border bg-white dark:bg-ink/60">
      <div className="border-b p-5">
        <h2 className="text-base font-semibold">Source performance</h2>
        <p className="mt-1 text-sm text-slate-500">
          Ranked by source-specific rates. Rates use each source row as its own denominator.
        </p>
      </div>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/70">
              <tr>
                <th className="px-4 py-3">Affiliate / Source</th>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3 text-right">Total Orders</th>
                <th className="px-4 py-3 text-right">Total Revenue</th>
                <th className="px-4 py-3 text-right">{copy.countLabel}</th>
                <th className="px-4 py-3 text-right">{copy.amountColumn}</th>
                <th className="px-4 py-3 text-right">Rate by Orders</th>
                <th className="px-4 py-3 text-right">Rate by Revenue</th>
                <th className="px-4 py-3 text-right">Avg Affected Value</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => {
                const highRate = Number(row.rate_by_revenue || 0) >= 0.1;
                return (
                  <tr key={row.group_key} className="hover:bg-slate-50 dark:hover:bg-slate-900/60">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onSelect(row)}
                        className="text-left font-medium text-teal-700 underline-offset-4 hover:underline focus:outline-none focus:ring-2 focus:ring-teal-500 dark:text-teal-300"
                      >
                        {row.source_name}
                      </button>
                      <div className="mt-1 text-xs text-slate-500">{groupTypeLabel(row.group_type)}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{sourceId(row)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatNumber(row.total_orders)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMoney(row.total_revenue)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatNumber(row.affected_orders)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMoney(row.amount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatPercent(row.rate_by_orders)}</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${highRate ? "font-semibold text-amber-700 dark:text-amber-300" : ""}`}>
                      {formatPercent(row.rate_by_revenue)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {metricUnavailable(row.average_affected_order_value) ? "Unavailable" : formatMoney(row.average_affected_order_value)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-5 text-sm text-slate-500">
          {data?.summary?.amount ? "No source rows match the current filters." : COPY[kind].noData}
        </div>
      )}
    </section>
  );
}

function DetailDrawer({
  source,
  orders,
  kind,
  onClose,
}: {
  source: FinancialIssueSourceRow | null;
  orders: FinancialIssueAffectedOrder[];
  kind: FinancialIssueKind;
  onClose: () => void;
}) {
  React.useEffect(() => {
    if (!source) return undefined;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [source, onClose]);

  if (!source) return null;

  const copy = COPY[kind];
  const filtered = orders.filter((order) => order.group_key === source.group_key);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/30 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`${source.source_name} ${copy.title}`}>
      <div className="ml-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-950">
        <div className="flex items-start justify-between gap-4 border-b p-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{groupTypeLabel(source.group_type)}</div>
            <h2 className="mt-1 text-xl font-semibold">{source.source_name}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {formatNumber(source.affected_orders)} affected orders · {formatMoney(source.amount)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:hover:bg-slate-900"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-auto p-5">
          {filtered.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-[820px] w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Order ID</th>
                    <th className="px-3 py-2">Order Date</th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Source</th>
                    <th className="px-3 py-2 text-right">Gross Revenue</th>
                    <th className="px-3 py-2 text-right">{copy.amountColumn}</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Attribution Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((order) => (
                    <tr key={`${order.order_id}:${order.amount}`}>
                      <td className="px-3 py-2 font-medium">
                        {order.platform_order_id ? (
                          <Link href={`/orders/${encodeURIComponent(order.platform_order_id)}`} className="text-teal-700 hover:underline dark:text-teal-300">
                            {order.order_id}
                          </Link>
                        ) : (
                          order.order_id
                        )}
                      </td>
                      <td className="px-3 py-2">{compactDate(order.order_date)}</td>
                      <td className="px-3 py-2">{order.customer || "Unavailable"}</td>
                      <td className="px-3 py-2">{order.affiliate_or_source || "Unknown"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(order.gross_revenue)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(order.amount)}</td>
                      <td className="px-3 py-2">{order.status || "Unavailable"}</td>
                      <td className="px-3 py-2">{order.attribution_confidence || "Unavailable"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500 dark:bg-slate-900">
              Affected order details are unavailable for this source in the current page.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function FinancialIssueAnalysisClient({ kind }: Props) {
  const copy = COPY[kind];
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRange = defaultRange();
  const [data, setData] = React.useState<FinancialIssueAnalysisResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<FinancialIssueSourceRow | null>(null);

  const params = React.useMemo(() => {
    const values: Record<string, string> = {
      workspace_id: searchParams.get("workspace_id") || "default",
      from: searchParams.get("from") || initialRange.from,
      to: searchParams.get("to") || initialRange.to,
      sort: searchParams.get("sort") || "rate_by_revenue",
      direction: searchParams.get("direction") || "desc",
      page: searchParams.get("page") || "1",
      limit: searchParams.get("limit") || "25",
      affiliate_id: searchParams.get("affiliate_id") || "",
      source_id: searchParams.get("source_id") || "",
      campaign_id: searchParams.get("campaign_id") || "",
      attribution_status: searchParams.get("attribution_status") || "",
    };
    return values;
  }, [searchParams, initialRange.from, initialRange.to]);

  const query = React.useMemo(() => {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) q.set(key, value);
    }
    return q;
  }, [params]);

  function updateQuery(next: Record<string, string>) {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (value) q.set(key, value);
    }
    router.push(`/dashboard/${kind === "refund" ? "refunds" : "chargebacks"}?${q.toString()}`);
  }

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const response = await apiGetJson<FinancialIssueAnalysisResponse>(`${copy.endpoint}?${query.toString()}`);
        if (!cancelled) setData(response);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || `${copy.title} data is unavailable.`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [copy.endpoint, copy.title, query]);

  const summary = data?.summary;
  const page = data?.pagination?.page || Number(params.page || 1);
  const totalPages = data?.pagination?.total_pages || 1;

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/dashboard?from=${encodeURIComponent(params.from)}&to=${encodeURIComponent(params.to)}`} className="text-sm font-medium text-teal-700 hover:underline dark:text-teal-300">
            Back to Decision Home
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">{copy.title}</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-300">{copy.question}</p>
        </div>
        <div className="rounded-xl border bg-white p-3 text-sm dark:bg-ink/60">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date Range</div>
          <div className="mt-1 font-medium">{params.from} to {params.to}</div>
        </div>
      </div>

      <Filters values={params} onChange={updateQuery} />

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/20 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label={copy.amountLabel} value={loading ? "Loading" : summary ? formatMoney(summary.amount) : "Unavailable"} helper={`${formatNumber(summary?.event_count || 0)} event${Number(summary?.event_count || 0) === 1 ? "" : "s"}`} warning />
        <SummaryCard label={copy.ordersLabel} value={loading ? "Loading" : summary ? formatNumber(summary.affected_orders) : "Unavailable"} helper="Distinct affected orders" warning />
        <SummaryCard label={copy.orderRateLabel} value={loading ? "Loading" : formatPercent(summary?.rate_by_orders)} helper={metricUnavailable(summary?.rate_by_orders) ? "Order denominator unavailable" : "Affected orders / source orders"} />
        <SummaryCard label={copy.revenueRateLabel} value={loading ? "Loading" : formatPercent(summary?.rate_by_revenue)} helper={metricUnavailable(summary?.rate_by_revenue) ? "Revenue denominator unavailable" : "Amount / attributed revenue"} />
        <SummaryCard label={copy.averageLabel} value={loading ? "Loading" : metricUnavailable(summary?.average_amount) ? "Unavailable" : formatMoney(summary?.average_amount)} helper="Amount / affected orders" />
      </div>

      {!loading && summary?.amount === 0 ? (
        <div className="rounded-2xl border bg-white p-5 text-sm text-slate-600 dark:bg-ink/60 dark:text-slate-300">
          {copy.noData}
        </div>
      ) : null}

      <DataQuality data={data} />
      <TrendChart data={data} kind={kind} />
      <SourceTable data={data} kind={kind} onSelect={setSelected} />

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="text-slate-500">
          Page {page} of {totalPages} · {formatNumber(data?.pagination?.total || 0)} source rows
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => updateQuery({ ...params, page: String(Math.max(1, page - 1)) })}
            className="rounded-lg border px-3 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:hover:bg-slate-900"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => updateQuery({ ...params, page: String(page + 1) })}
            className="rounded-lg border px-3 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:hover:bg-slate-900"
          >
            Next
          </button>
        </div>
      </div>

      <DetailDrawer
        source={selected}
        orders={data?.affected_orders || []}
        kind={kind}
        onClose={() => setSelected(null)}
      />
    </main>
  );
}
