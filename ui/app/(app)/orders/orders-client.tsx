// ui/app/(app)/orders/orders-client.tsx
"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { apiGetJson } from "@/lib/api";

type OrderRow = {
  platform: string;
  platform_order_id: string;
  order_ts: string;
  status: string | null;
  gross_amount: number | null;
  currency: string | null;
};

type ApiResp = {
  ok: boolean;
  message?: string;
  platform?: string | null;
  from?: string;
  to?: string;
  status?: string;
  count?: number;
  rows?: OrderRow[];
};

/** Status filter options (matches import filters 1:1) */
type StatusFilter =
  | "ALL_SALES"
  | "COMPLETED"
  | "PENDING"
  | "PARTIAL"
  | "DECLINED"
  | "REFUNDED"
  | "CANCELLED";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "ALL_SALES", label: "All Sales" },
  { value: "COMPLETED", label: "Completed" },
  { value: "PENDING", label: "Pending" },
  { value: "PARTIAL", label: "Partial" },
  { value: "DECLINED", label: "Declined" },
  { value: "REFUNDED", label: "Refunded" },
  { value: "CANCELLED", label: "Cancelled" },
];

function normalizeStatusFilter(v: string | null | undefined): StatusFilter {
  const x = String(v ?? "").trim().toUpperCase();
  if (!x) return "ALL_SALES";
  // If someone passes "ALL" or "ALL_SALES" treat as ALL_SALES
  if (x === "ALL") return "ALL_SALES";
  // Only allow known values
  if (STATUS_OPTIONS.some((o) => o.value === (x as StatusFilter))) return x as StatusFilter;
  return "ALL_SALES";
}

function parseOrderId(platform_order_id: string) {
  // platform_order_id looks like: "checkoutchamp:F3C32C130B" or "checkoutchamp:txn:65857"
  // We only want what's after the FIRST colon (keep txn:... if it's there)
  const idx = platform_order_id.indexOf(":");
  return idx >= 0 ? platform_order_id.slice(idx + 1) : platform_order_id;
}

function parseYmdLocal(v: string | null): Date | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d, 0, 0, 0, 0);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function isoDateLocal(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatMoney(n: number | null | undefined, currency?: string | null) {
  const cur = currency || "USD";
  const val = Number(n ?? 0);
  return val.toLocaleString("en-US", { style: "currency", currency: cur });
}

export default function OrdersClient() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [platform, setPlatform] = React.useState<string>("checkoutchamp");
  const [status, setStatus] = React.useState<StatusFilter>("ALL_SALES");
  const [limit, setLimit] = React.useState<number>(200);

  // Avoid hydration mismatch: don’t compute Date() in initial state
  const [from, setFrom] = React.useState<string>("");
  const [to, setTo] = React.useState<string>("");

  const [rows, setRows] = React.useState<OrderRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const hasBootstrappedUrl = React.useRef(false);

  // Bootstrap from URL or set defaults client-side
  React.useEffect(() => {
    const fromQ = sp.get("from");
    const toQ = sp.get("to");
    const platQ = sp.get("platform");
    const limitQ = sp.get("limit");
    const statusQ = sp.get("status");

    if (platQ) setPlatform(platQ);
    if (limitQ && Number(limitQ)) setLimit(Math.max(1, Math.min(1000, Number(limitQ))));
    setStatus(normalizeStatusFilter(statusQ));

    if (fromQ && toQ) {
      setFrom(fromQ);
      setTo(toQ);
      return;
    }

    // Default: last 2 days
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    setFrom(isoDateLocal(yesterday));
    setTo(isoDateLocal(now));
  }, [sp]);

  // Keep URL in sync
  React.useEffect(() => {
    if (!from || !to) return;

    const params = new URLSearchParams(sp.toString());

    if (!hasBootstrappedUrl.current) {
      hasBootstrappedUrl.current = true;
    }

    params.set("platform", platform);
    params.set("status", status);
    params.set("from", from);
    params.set("to", to);
    params.set("limit", String(limit));

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, status, from, to, limit]);

  // Fetch when range/platform/status changes
  React.useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const fromDt = parseYmdLocal(from);
      const toDt = parseYmdLocal(to);
      if (!fromDt || !toDt) return;

      try {
        setLoading(true);
        setError(null);

        const json = await apiGetJson<ApiResp>(
          `/v1/platform-orders?platform=${encodeURIComponent(platform)}&status=${encodeURIComponent(
            status
          )}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=${encodeURIComponent(
            String(limit)
          )}`
        );

        if (!json.ok) throw new Error(json.message || "Failed to load orders.");

        if (!cancelled) setRows(Array.isArray(json.rows) ? json.rows : []);
      } catch (e: any) {
        if (!cancelled) setRows([]);
        if (!cancelled) setError(e?.message || "Failed to load orders.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [platform, status, from, to, limit]);

  // Simple totals for current page
  const totalRevenue = React.useMemo(() => {
    let sum = 0;
    for (const r of rows) sum += Number(r.gross_amount ?? 0) || 0;
    return sum;
  }, [rows]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">Orders</h1>
          <p className="text-sm text-slate-500">
            Inspect imported orders from <span className="font-mono">platform_orders</span>.
          </p>
        </div>

        <div className="text-xs text-slate-500">{loading ? "loading…" : ""}</div>
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <label className="text-sm">
            <div className="mb-1 text-xs text-slate-500">Platform</div>
            <select
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
            >
              <option value="checkoutchamp">checkoutchamp</option>
              {/* add more later */}
            </select>
          </label>

          <label className="text-sm">
            <div className="mb-1 text-xs text-slate-500">Status</div>
            <select
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={status}
              onChange={(e) => setStatus(normalizeStatusFilter(e.target.value))}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <div className="mb-1 text-xs text-slate-500">From</div>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="YYYY-MM-DD"
            />
          </label>

          <label className="text-sm">
            <div className="mb-1 text-xs text-slate-500">To</div>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="YYYY-MM-DD"
            />
          </label>

          <label className="text-sm">
            <div className="mb-1 text-xs text-slate-500">Limit</div>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              type="number"
              min={1}
              max={1000}
              value={String(limit)}
              onChange={(e) => setLimit(Math.max(1, Math.min(1000, Number(e.target.value) || 200)))}
              placeholder="200"
            />
          </label>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500">
          <div>
            Range: <span className="font-mono">{from || "—"}</span> →{" "}
            <span className="font-mono">{to || "—"}</span> • Platform:{" "}
            <span className="font-mono">{platform}</span> • Status:{" "}
            <span className="font-mono">{status}</span>
          </div>
          <div>
            Total revenue (this page): <span className="font-mono">{formatMoney(totalRevenue, "USD")}</span>{" "}
            • Rows: <span className="font-mono">{rows.length}</span>
          </div>
        </div>

        {error ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="font-semibold">Couldn’t load orders</div>
            <div className="font-mono text-xs opacity-80">{error}</div>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border overflow-hidden">
        <div className="px-4 py-3 border-b text-sm font-medium flex items-center justify-between">
          <span>Results</span>
          <span className="text-xs text-slate-500">{rows.length} rows</span>
        </div>

        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left">
                <th className="px-4 py-2 whitespace-nowrap">Order TS</th>
                <th className="px-4 py-2 whitespace-nowrap">Order ID</th>
                <th className="px-4 py-2 whitespace-nowrap">Status</th>
                <th className="px-4 py-2 whitespace-nowrap">Amount</th>
                <th className="px-4 py-2 whitespace-nowrap">Currency</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-3 text-slate-500" colSpan={5}>
                    {loading ? "Loading…" : "No rows for this range."}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.platform_order_id} className="border-t">
                    <td className="px-4 py-2 whitespace-nowrap font-mono text-xs">{r.order_ts}</td>
                    <td className="px-4 py-2 whitespace-nowrap font-mono text-xs">
                      {parseOrderId(r.platform_order_id)}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{r.status ?? "—"}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {formatMoney(r.gross_amount, r.currency)}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{r.currency ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
