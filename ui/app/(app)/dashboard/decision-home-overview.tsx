"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

import { Card } from "@/components/ui/card";
import { apiGetJson } from "@/lib/api";
import type {
  ProfitSummaryResponse,
  RevenueSpendPoint,
  RevenueSpendResponse,
} from "@/lib/profit-types";

function isoDateLocal(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatMoney(value: unknown) {
  const n = Number(value ?? 0);
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function num(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatAov(summary: ProfitSummaryResponse | null) {
  const orders = num(summary?.order_count);
  if (!summary || orders <= 0) return "—";
  return formatMoney(num(summary.gross_revenue) / orders);
}

function useDashboardRange() {
  const searchParams = useSearchParams();
  const fromQ = searchParams.get("from");
  const toQ = searchParams.get("to");

  return React.useMemo(() => {
    const today = new Date();
    const from = new Date(today);
    from.setDate(from.getDate() - 29);

    return {
      from: fromQ || isoDateLocal(from),
      to: toQ || fromQ || isoDateLocal(today),
    };
  }, [fromQ, toQ]);
}

function Metric({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-900/70">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {helper ? <div className="mt-1 text-xs text-slate-500">{helper}</div> : null}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

const PIE_COLORS = ["#0f766e", "#2563eb", "#d97706", "#dc2626", "#7c3aed", "#64748b", "#16a34a"];

export function DecisionHomeOverview() {
  const range = useDashboardRange();
  const [summary, setSummary] = React.useState<ProfitSummaryResponse | null>(null);
  const [series, setSeries] = React.useState<RevenueSpendPoint[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const summaryParams = new URLSearchParams({
          workspace_id: "default",
          from: range.from,
          to: range.to,
        });

        const [summaryJson, trendJson] = await Promise.all([
          apiGetJson<ProfitSummaryResponse>(`/v1/profit/summary?${summaryParams.toString()}`),
          apiGetJson<RevenueSpendResponse>(
            `/v1/revenue-spend?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
          ),
        ]);

        if (!cancelled) {
          setSummary(summaryJson);
          setSeries(Array.isArray(trendJson?.series) ? trendJson.series : []);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Home dashboard data is unavailable.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to]);

  const chartData = series.map((point) => ({
    date: String(point.date || "").slice(0, 10),
    revenue: num(point.revenue),
    expenses: Math.max(0, num(point.revenue) - num(point.net_profit)),
    netProfit: num(point.net_profit),
  }));

  const costBreakdown = [
    { name: "Product costs", value: Math.abs(num(summary?.cogs)) },
    { name: "Ad spend", value: Math.abs(num(summary?.ad_spend)) },
    { name: "Affiliate payouts", value: Math.abs(num(summary?.affiliate_payout)) },
    { name: "Processing fees", value: Math.abs(num(summary?.processor_fees)) },
    { name: "Shipping", value: Math.abs(num(summary?.shipping_cost ?? summary?.shipping)) },
    { name: "Other bank fees", value: Math.abs(num(summary?.bank_fees) + num(summary?.chargeback_fees)) },
  ].filter((row) => row.value > 0);

  const leakageMix = [
    { name: "Retained revenue", value: Math.max(0, num(summary?.net_revenue)) },
    { name: "Refunds", value: Math.abs(num(summary?.refunds)) },
    { name: "Chargebacks", value: Math.abs(num(summary?.chargebacks)) },
  ].filter((row) => row.value > 0);

  const missingInputs = [
    num(summary?.cogs) === 0 ? "Product costs are missing or zero" : null,
    num(summary?.ad_spend) === 0 ? "Ad spend is not connected or is zero" : null,
    num(summary?.affiliate_payout) === 0 ? "Affiliate payout data is unavailable or zero" : null,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border bg-white p-6 dark:bg-ink/60">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-sm font-medium text-slate-500">Did we make money?</div>
            <div className="mt-2 text-5xl font-semibold tracking-tight">
              {summary ? formatMoney(summary.net_profit) : "—"}
            </div>
            <div className="mt-2 text-sm text-slate-500">
              Net profit for {range.from} through {range.to}
            </div>
          </div>

          <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:max-w-5xl xl:grid-cols-6">
            <Metric label="Gross revenue" value={summary ? formatMoney(summary.gross_revenue) : "—"} />
            <Metric label="Net revenue" value={summary ? formatMoney(summary.net_revenue) : "—"} />
            <Metric label="Total costs" value={summary ? formatMoney(summary.total_costs) : "—"} />
            <Metric
              label="Profit margin"
              value={summary ? `${num(summary.profit_margin_pct).toFixed(1)}%` : "—"}
            />
            <Metric label="Orders" value={summary ? num(summary.order_count).toLocaleString("en-US") : "—"} />
            <Metric label="AOV" value={formatAov(summary)} helper="Gross revenue / orders" />
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {missingInputs.length ? (
        <Card title="Action required" right={<span className="text-xs text-amber-600">Profit confidence is incomplete</span>}>
          <div className="grid gap-3 md:grid-cols-3">
            {missingInputs.map((message) => (
              <div key={message} className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                {message}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card title="Why did profit move?" right={<span className="text-xs text-slate-500">Revenue, expenses, and net profit</span>}>
        {loading ? (
          <EmptyState>Loading financial trend…</EmptyState>
        ) : chartData.length ? (
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} minTickGap={28} />
                <YAxis tickFormatter={(value) => `$${Number(value || 0).toLocaleString("en-US")}`} width={82} />
                <Tooltip formatter={(value) => formatMoney(value)} />
                <Legend />
                <Line type="monotone" dataKey="revenue" name="Revenue" dot={false} stroke="#0f766e" strokeWidth={2.5} />
                <Line type="monotone" dataKey="expenses" name="Expenses" dot={false} stroke="#d97706" strokeWidth={2.5} />
                <Line type="monotone" dataKey="netProfit" name="Net Profit" dot={false} stroke="#2563eb" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState>No daily trend data exists for this date range.</EmptyState>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Where did the money go?" right={<span className="text-xs text-slate-500">Cost breakdown</span>}>
          {costBreakdown.length ? (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={costBreakdown} dataKey="value" nameKey="name" innerRadius={68} outerRadius={104} paddingAngle={2}>
                    {costBreakdown.map((row, index) => (
                      <Cell key={row.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatMoney(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState>Connect cost sources to see the cost breakdown.</EmptyState>
          )}
        </Card>

        <Card title="Where are we losing revenue?" right={<span className="text-xs text-slate-500">Refund and chargeback leakage</span>}>
          {leakageMix.length ? (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={leakageMix} dataKey="value" nameKey="name" innerRadius={68} outerRadius={104} paddingAngle={2}>
                    {leakageMix.map((row, index) => (
                      <Cell key={row.name} fill={PIE_COLORS[(index + 2) % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatMoney(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState>No refund or chargeback data exists for this date range.</EmptyState>
          )}
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Where are customers dropping off?">
          <EmptyState>Offer and upsell funnel data will appear here after product-stage mapping is available.</EmptyState>
        </Card>
        <Card title="Which affiliates are profitable?">
          <EmptyState>Affiliate-level net profit requires attributed revenue, payout, refund, and chargeback rollups.</EmptyState>
        </Card>
        <Card title="Can we trust the attribution?">
          <EmptyState>Attribution health metrics will appear here after the normalized health endpoint is connected.</EmptyState>
        </Card>
      </div>

      <Card title="What needs attention now?">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl border border-dashed p-4">
            <div className="text-sm font-medium">Missing COGS</div>
            <div className="mt-2 text-sm text-slate-500">
              {summary && num(summary.cogs) > 0 ? "Product costs detected" : "Needs product cost source"}
            </div>
          </div>
          <div className="rounded-xl border border-dashed p-4">
            <div className="text-sm font-medium">Missing ad spend</div>
            <div className="mt-2 text-sm text-slate-500">
              {summary && num(summary.ad_spend) > 0 ? "Ad spend detected" : "Needs ad platform data"}
            </div>
          </div>
          <div className="rounded-xl border border-dashed p-4">
            <div className="text-sm font-medium">Missing affiliate payout</div>
            <div className="mt-2 text-sm text-slate-500">
              {summary && num(summary.affiliate_payout) > 0 ? "Payout data detected" : "Needs commission or payout data"}
            </div>
          </div>
          <div className="rounded-xl border border-dashed p-4">
            <div className="text-sm font-medium">RDR alerts</div>
            <div className="mt-2 text-sm text-slate-500">Not connected</div>
          </div>
          <div className="rounded-xl border border-dashed p-4">
            <div className="text-sm font-medium">Ethoca alerts</div>
            <div className="mt-2 text-sm text-slate-500">Not connected</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
