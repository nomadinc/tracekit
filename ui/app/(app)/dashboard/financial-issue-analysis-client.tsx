"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { TimeIntervalPicker } from "@/components/time-interval-picker";
import { apiGetJson } from "@/lib/api";
import type {
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
    amountLabel: "Total Refund Amount",
    ordersLabel: "Distinct Refunded Orders",
    rateLabel: "Overall Refund Rate",
    heading: "Top 5 Affiliates by Refunds",
    affectedColumn: "Distinct Refunded Orders",
    eventColumn: "Refund Event Count",
    amountColumn: "Refund Amount",
    rateColumn: "Refund Rate",
    noData: "No refund data was found",
    endpoint: "/v1/refunds/analysis",
    path: "/dashboard/refunds",
  },
  chargeback: {
    title: "Chargeback Analysis",
    amountLabel: "Total Chargeback Amount",
    ordersLabel: "Distinct Charged-Back Orders",
    rateLabel: "Overall Chargeback Rate",
    heading: "Top 5 Affiliates by Chargebacks",
    affectedColumn: "Distinct Charged-Back Orders",
    eventColumn: "Chargeback Event Count",
    amountColumn: "Chargeback Amount",
    rateColumn: "Chargeback Rate",
    noData: "No chargeback data was found",
    endpoint: "/v1/chargebacks/analysis",
    path: "/dashboard/chargebacks",
  },
} as const;

function isoDateLocal(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseYmd(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function defaultRange() {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 29);
  return { from: isoDateLocal(from), to: isoDateLocal(today) };
}

function rangeFromQuery(searchParams: URLSearchParams) {
  const fallback = defaultRange();
  const from = searchParams.get("from") || fallback.from;
  const to = searchParams.get("to") || fallback.to;
  return { from, to };
}

function money(value: unknown) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "Unavailable";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function integer(value: unknown) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "Unavailable";
  return Math.trunc(n).toLocaleString("en-US");
}

function percent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "Unavailable";
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function Metric({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-xl border bg-white p-4 dark:bg-ink/60">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{helper}</div>
    </div>
  );
}

function emptyMessage(kind: FinancialIssueKind, affiliateId: string, from: string, to: string) {
  const base = COPY[kind].noData;
  if (affiliateId) return `${base} for affiliate ${affiliateId} in the selected period.`;
  return `${base} between ${from} and ${to}.`;
}

function affiliateName(row: FinancialIssueSourceRow) {
  return row.affiliate_name || row.source_name || `Affiliate ${row.affiliate_id || "Unknown"}`;
}

function sourceName(row: FinancialIssueSourceRow) {
  if (row.source_name) return row.source_name;
  if (row.source_id) return `Source ${row.source_id}`;
  if (row.sub_id_key && row.sub_id_value) return `${row.sub_id_key.toUpperCase()} ${row.sub_id_value}`;
  return "Unknown source";
}

function sourceKey(row: FinancialIssueSourceRow) {
  if (row.source_id) return row.source_id;
  if (row.sub_id_key && row.sub_id_value) return `${row.sub_id_key}:${row.sub_id_value}`;
  return row.group_key || "Unavailable";
}

export function FinancialIssueAnalysisClient({ kind }: Props) {
  const copy = COPY[kind];
  const router = useRouter();
  const searchParams = useSearchParams();
  const range = rangeFromQuery(searchParams);
  const affiliateId = searchParams.get("affiliate_id") || "";
  const [affiliateInput, setAffiliateInput] = React.useState(affiliateId);
  const [data, setData] = React.useState<FinancialIssueAnalysisResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setAffiliateInput(affiliateId);
  }, [affiliateId]);

  function pushQuery(next: { from?: string; to?: string; affiliate_id?: string }) {
    const query = new URLSearchParams({
      workspace_id: "default",
      from: next.from || range.from,
      to: next.to || range.to,
      limit: "5",
    });
    const nextAffiliate = String(next.affiliate_id ?? affiliateId).trim();
    if (nextAffiliate) query.set("affiliate_id", nextAffiliate);
    router.push(`${copy.path}?${query.toString()}`);
  }

  React.useEffect(() => {
    const query = new URLSearchParams({
      workspace_id: "default",
      from: range.from,
      to: range.to,
      limit: "5",
    });
    if (affiliateId) query.set("affiliate_id", affiliateId);

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
  }, [affiliateId, copy.endpoint, copy.title, range.from, range.to]);

  const rows = data?.affiliates || [];
  const sourceRows = data?.sources || [];
  const summary = data?.summary;
  const warnings = data?.data_quality?.warnings || [];
  const partialScan = Boolean(data?.data_quality?.partial_scan);

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/dashboard?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`} className="text-sm font-medium text-teal-700 hover:underline dark:text-teal-300">
            Back to Decision Home
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">{copy.title}</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-300">
            A focused affiliate report for the selected period.
          </p>
        </div>
        <TimeIntervalPicker
          value={{ from: parseYmd(range.from), to: parseYmd(range.to) }}
          onChange={(next) => {
            const from = next.from ? isoDateLocal(next.from) : range.from;
            const to = next.to ? isoDateLocal(next.to) : range.to;
            pushQuery({ from, to, affiliate_id: affiliateId });
          }}
        />
      </div>

      <div className="rounded-2xl border bg-white p-4 dark:bg-ink/60">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Affiliate ID</span>
            <input
              value={affiliateInput}
              onChange={(event) => setAffiliateInput(event.target.value)}
              placeholder="Optional affiliate ID"
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm dark:bg-slate-950"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => pushQuery({ affiliate_id: affiliateInput })}
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => {
                setAffiliateInput("");
                pushQuery({ affiliate_id: "" });
              }}
              className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:hover:bg-slate-900"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/20 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <Metric label={copy.amountLabel} value={loading ? "Loading" : summary ? money(summary.amount) : "Unavailable"} helper={`${integer(summary?.event_count || 0)} event${Number(summary?.event_count || 0) === 1 ? "" : "s"}`} />
        <Metric label={copy.ordersLabel} value={loading ? "Loading" : summary ? integer(summary.affected_orders) : "Unavailable"} helper="Distinct affected orders" />
        <Metric label={copy.rateLabel} value={loading ? "Loading" : percent(summary?.rate_by_orders)} helper="Affected orders / total affiliate sale orders" />
      </div>

      {partialScan || warnings.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
          {partialScan ? <div className="font-medium">This response used a bounded scan. Narrow the date range for a complete ranking.</div> : null}
          {warnings.length ? <div className="mt-1">{warnings.join(" · ")}</div> : null}
        </div>
      ) : null}

      <section className="rounded-2xl border bg-white dark:bg-ink/60">
        <div className="border-b p-5">
          <h2 className="text-base font-semibold">{copy.heading}</h2>
          <p className="mt-1 text-sm text-slate-500">
            Sorted by distinct affected orders, then rate. Event count, affected-order count, and amount are shown separately.
          </p>
        </div>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-[820px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/70">
                <tr>
                  <th className="px-4 py-3">Rank</th>
                  <th className="px-4 py-3">Affiliate</th>
                  <th className="px-4 py-3">Affiliate ID</th>
                  <th className="px-4 py-3 text-right">Total Orders</th>
                  <th className="px-4 py-3 text-right">{copy.affectedColumn}</th>
                  <th className="px-4 py-3 text-right">{copy.eventColumn}</th>
                  <th className="px-4 py-3 text-right">{copy.amountColumn}</th>
                  <th className="px-4 py-3 text-right">{copy.rateColumn}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row, index) => (
                  <tr key={row.affiliate_id || index} className="hover:bg-slate-50 dark:hover:bg-slate-900/60">
                    <td className="px-4 py-3 font-semibold tabular-nums">{index + 1}</td>
                    <td className="px-4 py-3 font-medium">{affiliateName(row)}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.affiliate_id || "Unavailable"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{integer(row.total_orders)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{integer(row.affected_orders)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{integer(row.event_count)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(row.amount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{percent(row.rate_by_orders)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5 text-sm text-slate-500">
            {loading ? "Loading affiliate rows..." : emptyMessage(kind, affiliateId, range.from, range.to)}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-white dark:bg-ink/60">
        <div className="border-b p-5">
          <h2 className="text-base font-semibold">Source / Sub-ID Ranking</h2>
          <p className="mt-1 text-sm text-slate-500">
            Uses source and sub-ID fields when they are available on matched orders.
          </p>
        </div>
        {sourceRows.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/70">
                <tr>
                  <th className="px-4 py-3">Rank</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Key</th>
                  <th className="px-4 py-3 text-right">Total Orders</th>
                  <th className="px-4 py-3 text-right">{copy.affectedColumn}</th>
                  <th className="px-4 py-3 text-right">{copy.eventColumn}</th>
                  <th className="px-4 py-3 text-right">{copy.amountColumn}</th>
                  <th className="px-4 py-3 text-right">{copy.rateColumn}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sourceRows.map((row, index) => (
                  <tr key={row.group_key || index} className="hover:bg-slate-50 dark:hover:bg-slate-900/60">
                    <td className="px-4 py-3 font-semibold tabular-nums">{index + 1}</td>
                    <td className="px-4 py-3 font-medium">{sourceName(row)}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{sourceKey(row)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{integer(row.total_orders)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{integer(row.affected_orders)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{integer(row.event_count)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(row.amount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{percent(row.rate_by_orders)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5 text-sm text-slate-500">
            {loading ? "Loading source rows..." : "No source or sub-ID ranking data was found for the selected period."}
          </div>
        )}
      </section>
    </main>
  );
}
