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

function formatPercent(value: number) {
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : "—";
}

function positiveMoney(value: unknown) {
  return formatMoney(Math.abs(num(value)));
}

function sumFields(summary: ProfitSummaryResponse | null, fields: string[]) {
  if (!summary) return 0;
  const record = summary as Record<string, unknown>;
  return fields.reduce((total, field) => total + num(record[field]), 0);
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

function dateRangeQuery(range: { from: string; to: string }) {
  const params = new URLSearchParams({ from: range.from, to: range.to });
  return params.toString();
}

function dashboardDrilldown(range: { from: string; to: string }, section: string) {
  return `/dashboard?${dateRangeQuery(range)}#${section}`;
}

function Metric({
  label,
  value,
  helper,
  href,
  title,
  id,
}: {
  label: string;
  value: string;
  helper?: string;
  href: string;
  title: string;
  id?: string;
}) {
  return (
    <Link
      id={id}
      href={href}
      title={title}
      className="block rounded-xl bg-slate-50 p-4 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-900/70 dark:hover:bg-slate-900"
    >
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {helper ? <div className="mt-1 text-xs text-slate-500">{helper}</div> : null}
    </Link>
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

type CostCategory = {
  name: string;
  description: string;
  value: number;
};

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
    operatingCosts: Math.max(0, num(point.revenue) - num(point.net_profit)),
    netProfit: num(point.net_profit),
  }));

  const knownOperatingCostCategories: CostCategory[] = [
    {
      name: "Advertising",
      description: "Paid media and tracked ad spend",
      value: Math.abs(num(summary?.ad_spend)),
    },
    {
      name: "Affiliate Payouts",
      description: "Affiliate commissions and partner payouts",
      value: Math.abs(num(summary?.affiliate_payout)),
    },
    {
      name: "COGS",
      description: "Product cost of goods sold",
      value: Math.abs(num(summary?.cogs)),
    },
    {
      name: "Fulfillment",
      description: "Shipping, fulfillment, and delivery costs",
      value: Math.abs(num(summary?.shipping_cost ?? summary?.shipping)),
    },
    {
      name: "Payment Processing",
      description: "Processor fees and bank fees",
      value: Math.abs(num(summary?.processor_fees) + num(summary?.bank_fees)),
    },
    {
      name: "Chargebacks & Refunds",
      description: "Chargeback fees and mapped refund fees",
      value: Math.abs(num(summary?.chargeback_fees) + sumFields(summary, ["refund_fees", "refund_fee"])),
    },
    {
      name: "Software & Infrastructure",
      description: "Recurring SaaS and infrastructure costs when mapped",
      value: Math.abs(sumFields(summary, [
        "software_infrastructure",
        "software_infrastructure_costs",
        "software_costs",
        "infrastructure_costs",
      ])),
    },
    {
      name: "General & Administrative",
      description: "Tax and mapped administrative operating costs",
      value: Math.abs(num(summary?.tax) + sumFields(summary, ["general_administrative", "g_and_a", "administrative_costs"])),
    },
  ];

  const knownOperatingCostTotal = knownOperatingCostCategories.reduce((sum, row) => sum + row.value, 0);
  const explicitOtherOperatingCosts = Math.abs(sumFields(summary, ["other_operating_expenses", "misc_operating_expenses"]));
  const operatingCostTotal = Math.max(Math.abs(num(summary?.total_costs)), knownOperatingCostTotal + explicitOtherOperatingCosts);
  const operatingCostOther = Math.max(0, explicitOtherOperatingCosts, operatingCostTotal - knownOperatingCostTotal);
  const costBreakdown: CostCategory[] = [
    ...knownOperatingCostCategories,
    {
      name: "Other",
      description: "Miscellaneous mapped operating expenses",
      value: operatingCostOther,
    },
  ];
  const costDonutData = costBreakdown.filter((row) => row.value > 0);

  const leakageMix = [
    { name: "Retained revenue", value: Math.max(0, num(summary?.net_revenue)) },
    { name: "Refunds", value: Math.abs(num(summary?.refunds)) },
    { name: "Chargebacks", value: Math.abs(num(summary?.chargebacks)) },
  ].filter((row) => row.value > 0);

  const missingInputs = summary
    ? ([
        num(summary.cogs) === 0 ? "Product costs are missing or zero" : null,
        num(summary.ad_spend) === 0 ? "Ad spend is not connected or is zero" : null,
        num(summary.affiliate_payout) === 0 ? "Affiliate payout data is unavailable or zero" : null,
        costBreakdown.find((row) => row.name === "Software & Infrastructure")?.value === 0
          ? "Software and infrastructure expenses are not mapped"
          : null,
        costBreakdown.find((row) => row.name === "Other")?.value === 0
          ? "Miscellaneous operating expense mapping is not configured"
          : null,
      ].filter(Boolean) as string[])
    : [];

  return (
    <div className="space-y-6">
      <section id="profit-statement" className="overflow-hidden rounded-2xl border bg-white p-6 dark:bg-ink/60">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <Link
            href={dashboardDrilldown(range, "profit-statement")}
            title="Open Profit Statement"
            className="rounded-xl transition focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <div className="text-sm font-medium text-slate-500">Did we make money?</div>
            <div className="mt-2 text-5xl font-semibold tracking-tight">
              {summary ? formatMoney(summary.net_profit) : "—"}
            </div>
            <div className="mt-2 text-sm text-slate-500">
              Net Profit for {range.from} through {range.to}
            </div>
          </Link>

          <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:max-w-5xl xl:grid-cols-6">
            <Metric
              label="Gross revenue"
              value={summary ? formatMoney(summary.gross_revenue) : "—"}
              href={dashboardDrilldown(range, "revenue-breakdown")}
              title="Open Revenue Breakdown"
              id="revenue-breakdown"
            />
            <Metric
              label="Net revenue"
              value={summary ? formatMoney(summary.net_revenue) : "—"}
              helper="After refunds and chargebacks"
              href={dashboardDrilldown(range, "revenue-after-leakage")}
              title="Open Revenue after refunds and chargebacks"
              id="revenue-after-leakage"
            />
            <Metric
              label="Operating Costs"
              value={summary ? positiveMoney(operatingCostTotal) : "—"}
              href={dashboardDrilldown(range, "operating-cost-breakdown")}
              title="Open Operating Cost Breakdown"
              id="operating-cost-breakdown"
            />
            <Metric
              label="Profit margin"
              value={summary ? `${num(summary.profit_margin_pct).toFixed(1)}%` : "—"}
              href={dashboardDrilldown(range, "profit-analysis")}
              title="Open Profit Analysis"
              id="profit-analysis"
            />
            <Metric
              label="Orders"
              value={summary ? num(summary.order_count).toLocaleString("en-US") : "—"}
              href={`/orders?${dateRangeQuery(range)}`}
              title="Open Orders"
            />
            <Metric
              label="AOV"
              value={formatAov(summary)}
              helper="Gross revenue / orders"
              href={`/orders?${dateRangeQuery(range)}&analysis=order-value`}
              title="Open Order Value Analysis"
            />
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

      <Card title="Why did profit move?" right={<span className="text-xs text-slate-500">Revenue, operating costs, and net profit</span>}>
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
                <Line type="monotone" dataKey="operatingCosts" name="Operating Costs" dot={false} stroke="#d97706" strokeWidth={2.5} />
                <Line type="monotone" dataKey="netProfit" name="Net Profit" dot={false} stroke="#2563eb" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState>No daily trend data exists for this date range.</EmptyState>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card
          title="Where did the money go?"
          right={<span className="text-xs text-slate-500">Operating Cost Breakdown</span>}
        >
          {summary ? (
            <div className="grid gap-6 2xl:grid-cols-[minmax(18rem,26rem)_1fr]">
              {costDonutData.length ? (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={costDonutData} dataKey="value" nameKey="name" innerRadius={68} outerRadius={104} paddingAngle={2}>
                        {costDonutData.map((row, index) => (
                          <Cell key={row.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatMoney(value)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState>No operating cost categories are currently mapped.</EmptyState>
              )}
              <div className="overflow-auto rounded-lg border">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/60">
                    <tr>
                      <th className="px-4 py-3 text-left">Category</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-right">Percent of Operating Costs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costBreakdown.map((row) => (
                      <tr key={row.name} className="border-t">
                        <td className="px-4 py-3">
                          <div className="font-medium">{row.name}</div>
                          <div className="mt-1 text-xs text-slate-500">{row.description}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono">{formatMoney(row.value)}</td>
                        <td className="px-4 py-3 text-right font-mono">
                          {operatingCostTotal > 0 ? formatPercent((row.value / operatingCostTotal) * 100) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <EmptyState>Connect operating cost sources to see the breakdown.</EmptyState>
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
