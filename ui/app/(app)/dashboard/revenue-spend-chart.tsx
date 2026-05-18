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
  date: string; // API may return ISO, we'll normalize to YYYY-MM-DD
  revenue: number;
  spend: number;
};

type ApiResp = {
  ok?: boolean;
  error?: string;
  message?: string;
  series: ApiPoint[];
};

// ---------- date helpers ----------
function isoDateLocal(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseYmdLocal(v: string | null): Date | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d, 0, 0, 0, 0);
  return isNaN(dt.getTime()) ? null : dt;
}

function eachDayInclusive(from: Date, to: Date): string[] {
  const out: string[] = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 0, 0, 0, 0);
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 0, 0, 0, 0);

  while (cur.getTime() <= end.getTime()) {
    out.push(isoDateLocal(cur)); // YYYY-MM-DD
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function ymdFromApiDate(d: string): string {
  // If API sends ISO timestamps, normalize to YYYY-MM-DD.
  // If it's already YYYY-MM-DD, keep it.
  const s = String(d || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) return isoDateLocal(dt);

  // fallback: slice first 10 chars
  return s.slice(0, 10);
}

// ---------- formatting ----------
function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function isProbablyHtml(s: string) {
  const t = s.trim().toLowerCase();
  return t.startsWith("<!doctype") || t.startsWith("<html") || t.startsWith("<head");
}

// ---------- component ----------
export function RevenueSpendChart() {
  const searchParams = useSearchParams();

  const fromQ = searchParams?.get("from") ?? null;
  const toQ = searchParams?.get("to") ?? null;

  const fromDt = parseYmdLocal(fromQ);
  const toDt = parseYmdLocal(toQ ?? fromQ);

  const canFetch = Boolean(fromDt && toDt);

  const [series, setSeries] = React.useState<ApiPoint[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!canFetch || !fromDt || !toDt) return;

      const from = isoDateLocal(fromDt);
      const to = isoDateLocal(toDt);

      try {
        setLoading(true);
        setError(null);

        // Use apiGetJson (already handles many failure cases),
        // but we still guard for any weird response shapes.
        const json = await apiGetJson<ApiResp>(
          `/v1/revenue-spend?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
        );

        // If API returns ok:false, surface it
        if ((json as any)?.ok === false) {
          throw new Error((json as any)?.message || (json as any)?.error || "API returned not ok");
        }

        const apiSeries = Array.isArray(json.series) ? json.series : [];

        // Normalize -> map by YYYY-MM-DD
        const byDay = new Map<string, ApiPoint>();
        for (const p of apiSeries) {
          byDay.set(ymdFromApiDate(p.date), {
            date: ymdFromApiDate(p.date),
            revenue: Number(p.revenue || 0),
            spend: Number(p.spend || 0),
          });
        }

        // Fill every day in the selected range
        const days = eachDayInclusive(fromDt, toDt);
        const filled: ApiPoint[] = days.map((day) => {
          const hit = byDay.get(day);
          return {
            date: day, // YYYY-MM-DD
            revenue: hit?.revenue ?? 0,
            spend: hit?.spend ?? 0,
          };
        });

        if (!cancelled) setSeries(filled);
      } catch (e: any) {
        // Defensive: handle HTML accidentally returned from same-origin proxy, etc.
        const msg = String(e?.message || "Failed to load chart.");
        if (!cancelled) {
          setError(
            isProbablyHtml(msg)
              ? "Chart unavailable: API returned HTML (check NEXT_PUBLIC_API_BASE_URL / proxy routing)."
              : msg
          );
          setSeries([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [canFetch, fromQ, toQ]); // using query strings avoids Date object identity issues

  // ---- UI ----
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

  return (
    <div className="rounded-xl border p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium">Revenue vs Spend</div>
        <div className="text-xs text-slate-500">{loading ? "loading…" : ""}</div>
      </div>

      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer>
          <LineChart
            data={series.map((p) => ({
              ...p,
              dateLabel: p.date, // already YYYY-MM-DD
            }))}
            margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="dateLabel" />
            <YAxis tickFormatter={(v) => `$${Number(v || 0).toFixed(0)}`} />
            <Tooltip
              formatter={(value: any, name: any) => [formatMoney(Number(value)), name]}
              labelFormatter={(label) => `Date: ${label}`}
            />
            <Line type="monotone" dataKey="revenue" dot={false} />
            <Line type="monotone" dataKey="spend" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
