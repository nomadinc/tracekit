// ui/app/(app)/dashboard/revenue-spend-chart.tsx
"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { apiGetJson } from "@/lib/api";
import type { RevenueSpendPoint, RevenueSpendResponse } from "@/lib/profit-types";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

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

  const dt = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    0,
    0,
    0,
    0,
  );

  return Number.isNaN(dt.getTime()) ? null : dt;
}

function eachDayInclusive(from: Date, to: Date): string[] {
  const out: string[] = [];

  const cur = new Date(
    from.getFullYear(),
    from.getMonth(),
    from.getDate(),
    0,
    0,
    0,
    0,
  );

  const end = new Date(
    to.getFullYear(),
    to.getMonth(),
    to.getDate(),
    0,
    0,
    0,
    0,
  );

  while (cur.getTime() <= end.getTime()) {
    out.push(isoDateLocal(cur));
    cur.setDate(cur.getDate() + 1);
  }

  return out;
}

function ymdFromApiDate(value: unknown): string {
  const s = String(value || "").trim();

  if (!s) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) return isoDateLocal(dt);

  return s.slice(0, 10);
}

function formatMoney(value: unknown) {
  const n = Number(value || 0);

  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function isProbablyHtml(s: string) {
  const t = String(s || "").trim().toLowerCase();
  return (
    t.startsWith("<!doctype") ||
    t.startsWith("<html") ||
    t.startsWith("<head")
  );
}

export function RevenueSpendChart() {
  const searchParams = useSearchParams();

  const fromQ = searchParams?.get("from") || null;
  const toQ = searchParams?.get("to") || null;

  const today = React.useMemo(() => new Date(), []);
  const defaultTo = isoDateLocal(today);

  const defaultFrom = React.useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 29);
    return isoDateLocal(d);
  }, [today]);

  const fromDt = parseYmdLocal(fromQ || defaultFrom);
  const toDt = parseYmdLocal(toQ || fromQ || defaultTo);

  const canFetch = Boolean(fromDt && toDt);
  const fromMs = fromDt?.getTime() ?? null;
  const toMs = toDt?.getTime() ?? null;

  const [series, setSeries] = React.useState<RevenueSpendPoint[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!canFetch || fromMs == null || toMs == null) return;

      const fromDate = new Date(fromMs);
      const toDate = new Date(toMs);
      const from = isoDateLocal(fromDate);
      const to = isoDateLocal(toDate);

      try {
        setLoading(true);
        setError(null);

        const json = await apiGetJson<RevenueSpendResponse>(
          `/v1/revenue-spend?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        );

        if (json?.ok === false) {
          throw new Error(
            json.message || json.error || "API returned not ok",
          );
        }

        const apiSeries = Array.isArray(json?.series) ? json.series : [];

        const byDay = new Map<string, RevenueSpendPoint>();

        for (const point of apiSeries) {
          const day = ymdFromApiDate(point?.date);

          if (!day) continue;

          byDay.set(day, {
            date: day,
            revenue: Number(point?.revenue || 0),
            spend: Number(point?.spend || 0),
            net_profit: Number(point?.net_profit || 0),
            refunds: Number(point?.refunds || 0),
            chargebacks: Number(point?.chargebacks || 0),
          });
        }

        const days = eachDayInclusive(fromDate, toDate);

        const filled = days.map((day) => {
          const hit = byDay.get(day);

          return {
            date: day,
            revenue: Number(hit?.revenue || 0),
            spend: Number(hit?.spend || 0),
            net_profit: Number(hit?.net_profit || 0),
            refunds: Number(hit?.refunds || 0),
            chargebacks: Number(hit?.chargebacks || 0),
          };
        });

        if (!cancelled) setSeries(filled);
      } catch (e: any) {
        const msg = String(e?.message || "Failed to load chart.");

        if (!cancelled) {
          setError(
            isProbablyHtml(msg)
              ? "Chart unavailable: API returned HTML. Check API routing."
              : msg,
          );
          setSeries([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [canFetch, fromMs, toMs]);

  if (!canFetch) {
    return (
      <div className="rounded-xl border p-4 text-sm text-slate-500">
        Select a date range to view revenue/spend.
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
        <div className="font-semibold">Chart unavailable</div>
        <div className="font-mono text-xs opacity-80">{error}</div>
      </div>
    );
  }

  const chartData = series.map((p) => ({
    dateLabel: String(p.date || ""),
    revenue: Number(p.revenue || 0),
    adSpend: Number(p.spend || 0),
    netProfit: Number(p.net_profit || 0),
    refunds: Number(p.refunds || 0),
    chargebacks: Number(p.chargebacks || 0),
  }));

  function ProfitTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload || {};

    return (
      <div className="rounded-lg border bg-white p-3 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-950">
        <div className="mb-2 font-medium">Date: {String(label || "")}</div>
        <div className="space-y-1">
          <div>Revenue: {formatMoney(row.revenue)}</div>
          <div>Ad Spend: {formatMoney(row.adSpend)}</div>
          <div>Net Profit: {formatMoney(row.netProfit)}</div>
          <div>Refunds: {formatMoney(row.refunds)}</div>
          <div>Chargebacks: {formatMoney(row.chargebacks)}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium">Revenue, Spend, and Profit</div>
        <div className="text-xs text-slate-500">
          {loading ? "loading…" : ""}
        </div>
      </div>

      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="dateLabel" />
            <YAxis tickFormatter={(v) => `$${Number(v || 0).toFixed(0)}`} />
            <Tooltip content={<ProfitTooltip />} />
            <Line type="monotone" dataKey="revenue" name="Revenue" dot={false} stroke="#059669" strokeWidth={2} />
            <Line type="monotone" dataKey="adSpend" name="Ad Spend" dot={false} stroke="#d97706" strokeWidth={2} />
            <Line type="monotone" dataKey="netProfit" name="Net Profit" dot={false} stroke="#2563eb" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
