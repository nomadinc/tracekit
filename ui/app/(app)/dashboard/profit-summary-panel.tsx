"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { apiGetJson } from "@/lib/api";
import type { ProfitSummaryResponse } from "@/lib/profit-types";

function isoDateLocal(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseYmdLocal(v: string | null): Date | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v).trim());
  if (!m) return null;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function formatMoney(value: unknown, currency = "USD") {
  const n = Number(value ?? 0);
  return n.toLocaleString("en-US", { style: "currency", currency });
}

function formatSignedMoney(value: unknown, currency = "USD") {
  const n = Number(value ?? 0);
  const formatted = Math.abs(n).toLocaleString("en-US", {
    style: "currency",
    currency,
  });

  if (n < 0) return `-${formatted}`;
  if (n > 0) return `+${formatted}`;
  return formatted;
}

function formatProfitMargin(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(1)}%` : "—";
}

function num(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function useDashboardDateRange() {
  const searchParams = useSearchParams();
  const fromQ = searchParams.get("from");
  const toQ = searchParams.get("to");

  return React.useMemo(() => {
    const today = new Date();
    const defaultTo = isoDateLocal(today);
    const defaultFromDate = new Date(today);
    defaultFromDate.setDate(defaultFromDate.getDate() - 6);
    const defaultFrom = isoDateLocal(defaultFromDate);

    const fromDate = parseYmdLocal(fromQ || defaultFrom);
    const toDate = parseYmdLocal(toQ || fromQ || defaultTo);

    return {
      from: isoDateLocal(fromDate || defaultFromDate),
      to: isoDateLocal(toDate || today),
    };
  }, [fromQ, toQ]);
}

export function ProfitSummaryPanel() {
  const range = useDashboardDateRange();
  const [summary, setSummary] = React.useState<ProfitSummaryResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      const params = new URLSearchParams({
        workspace_id: "default",
        from: range.from,
        to: range.to,
      });

      try {
        setLoading(true);
        setError(null);

        const json = await apiGetJson<ProfitSummaryResponse>(
          `/v1/profit/summary?${params.toString()}`,
        );

        if (json?.ok === false) {
          throw new Error(json.message || json.error || "Profit summary unavailable");
        }

        if (!cancelled) setSummary(json);
      } catch (e: any) {
        if (!cancelled) {
          setSummary(null);
          setError(e?.message || "Failed to load profit summary");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [range.from, range.to]);

  const rows = [
    { label: "Refunds", value: summary?.refunds, treatment: "Deduction" },
    { label: "Chargebacks", value: summary?.chargebacks, treatment: "Deduction" },
    { label: "Processor Fees", value: summary?.processor_fees, treatment: "Deduction" },
    { label: "Chargeback Fees", value: summary?.chargeback_fees, treatment: "Deduction" },
    { label: "Bank Fees", value: summary?.bank_fees, treatment: "Deduction" },
    { label: "Shipping", value: summary?.shipping_cost ?? summary?.shipping, treatment: "Deduction" },
    { label: "Tax", value: summary?.tax, treatment: "Category" },
    { label: "COGS", value: summary?.cogs, treatment: "Deduction" },
    { label: "Affiliate Payouts", value: summary?.affiliate_payout, treatment: "Deduction" },
    { label: "Ad Spend", value: summary?.ad_spend, treatment: "Deduction" },
  ];

  return (
    <Card
      title="Profit Summary"
      right={
        <span className="text-xs text-slate-500">
          {loading ? "loading..." : `${range.from} to ${range.to}`}
        </span>
      }
    >
      {error ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          <span className="font-semibold">Profit summary unavailable.</span>{" "}
          <span className="font-mono text-xs opacity-80">{error}</span>
        </div>
      ) : null}

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Net Revenue"
          value={summary ? formatMoney(summary.net_revenue) : "—"}
        />
        <KpiCard
          label="Total Costs"
          value={summary ? formatSignedMoney(summary.total_costs) : "—"}
        />
        <KpiCard
          label="Net Profit"
          value={summary ? formatMoney(summary.net_profit) : "—"}
        />
        <KpiCard
          label="Profit Margin"
          value={summary ? formatProfitMargin(summary.profit_margin_pct) : "—"}
        />
      </div>

      <div className="mt-4 overflow-auto rounded-lg border">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 dark:bg-slate-800">
            <tr>
              <th className="px-4 py-2 text-left">Category</th>
              <th className="px-4 py-2 text-left">Treatment</th>
              <th className="px-4 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t">
              <td className="px-4 py-2 font-medium">Gross Revenue</td>
              <td className="px-4 py-2 text-slate-500">Revenue</td>
              <td className="px-4 py-2 text-right font-mono">
                {summary ? formatMoney(summary.gross_revenue) : "—"}
              </td>
            </tr>
            {rows.map((row) => (
              <tr key={row.label} className="border-t">
                <td className="px-4 py-2 font-medium">{row.label}</td>
                <td className="px-4 py-2 text-slate-500">{row.treatment}</td>
                <td className="px-4 py-2 text-right font-mono">
                  {summary ? formatSignedMoney(num(row.value)) : "—"}
                </td>
              </tr>
            ))}
            <tr className="border-t bg-slate-50 dark:bg-slate-900">
              <td className="px-4 py-2 font-semibold">Net Profit</td>
              <td className="px-4 py-2 text-slate-500">Result</td>
              <td className="px-4 py-2 text-right font-mono font-semibold">
                {summary ? formatMoney(summary.net_profit) : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}
