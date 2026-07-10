// ui/app/(app)/dashboard/revenue-spend-chart.tsx
"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { apiGetJson } from "@/lib/api";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

type ApiPoint = {
  date?: string | null;
  revenue?: number | null;
  spend?: number | null;
};

type ApiResp = {
  ok?: boolean;
  error?: string;
  message?: string;
  series?: ApiPoint[];
};

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

  const [series, setSeries] = React.useState<ApiPoint[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!canFetch || !fromDt || !toDt) return;

      const from = isoDateLocal(fromDt);
      const to = isoDateLocal(toDt);

      try {
        setLoading(true);
        setError(null);

        const json = await apiGetJson<ApiResp>(
          `/v1/revenue-spend?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        );

        if (json?.ok === false) {
          throw new Error(
            json.message || json.error || "API returned not ok",
          );
        }

        const apiSeries = Array.isArray(json?.series) ? json.series : [];

        const byDay = new Map<string, ApiPoint>();

        for (const point of apiSeries) {
          const day = ymdFromApiDate(point?.date);

          if (!day) continue;

          byDay.set(day, {
            date: day,
            revenue: Number(point?.revenue || 0),
            spend: Number(point?.spend || 0),
          });
        }

        const days = eachDayInclusive(fromDt, toDt);

        const filled = days.map((day) => {
          const hit = byDay.get(day);

          return {
            date: day,
            revenue: Number(hit?.revenue || 0),
            spend: Number(hit?.spend || 0),
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
  }, [canFetch, fromQ, toQ]);

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
    spend: Number(p.spend || 0),
  }));

  return (
    <div className="rounded-xl border p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium">Revenue vs Spend</div>
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
            <Tooltip
              formatter={(value: any, name: any) => [
                formatMoney(value),
                String(name || ""),
              ]}
              labelFormatter={(label) => `Date: ${String(label || "")}`}
            />
            <Line type="monotone" dataKey="revenue" dot={false} />
            <Line type="monotone" dataKey="spend" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}