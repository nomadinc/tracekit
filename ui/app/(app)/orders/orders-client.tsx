// ui/app/(app)/orders/orders-client.tsx
"use client";

import Link from "next/link";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { apiGetJson } from "@/lib/api";

type OrderRow = {
  [key: string]: any;
  platform: string;
  platform_order_id: string;
  order_ts: string;
  status: string | null;
  gross_amount: number | null;
  currency: string | null;
};

type PlatformOption = {
  value: string;
  label: string;
};

type PlatformsResp = {
  ok: boolean;
  platforms?: PlatformOption[];
  message?: string;
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
  orders?: OrderRow[];
  limit?: number;
  offset?: number;
  total?: number;
  page?: number;
  totalPages?: number;
  sort?: string;
  dir?: "asc" | "desc";
  search?: string;
};

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

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200, 500];
const SORT_COLUMNS = [
  "order_ts",
  "platform_order_id",
  "status",
  "gross_amount",
  "currency",
] as const;

type SortColumn = (typeof SORT_COLUMNS)[number];

function normalizeStatusFilter(v: string | null | undefined): StatusFilter {
  const x = String(v ?? "")
    .trim()
    .toUpperCase();
  if (!x) return "ALL_SALES";
  if (x === "ALL") return "ALL_SALES";
  if (STATUS_OPTIONS.some((o) => o.value === (x as StatusFilter)))
    return x as StatusFilter;
  return "ALL_SALES";
}

function normalizeSort(v: string | null | undefined): SortColumn {
  const x = String(v ?? "").trim();
  return SORT_COLUMNS.includes(x as SortColumn)
    ? (x as SortColumn)
    : "order_ts";
}

function normalizeDir(v: string | null | undefined): "asc" | "desc" {
  return String(v ?? "").toLowerCase() === "asc" ? "asc" : "desc";
}

function parseOrderId(platform_order_id: string) {
  const idx = platform_order_id.indexOf(":");
  return idx >= 0 ? platform_order_id.slice(idx + 1) : platform_order_id;
}

function getFullOrderHref(order: any) {
  const id = String(order?.platform_order_id || order?.order_id || "").trim();
  return id ? `/orders/${encodeURIComponent(id)}` : "";
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

function getVisiblePages(currentPage: number, totalPages: number) {
  const safeTotal = Math.max(1, totalPages || 1);
  const safeCurrent = Math.min(Math.max(1, currentPage || 1), safeTotal);
  const start = Math.max(1, safeCurrent - 2);
  const end = Math.min(safeTotal, start + 4);
  const adjustedStart = Math.max(1, end - 4);

  const pages: number[] = [];
  for (let p = adjustedStart; p <= end; p++) pages.push(p);
  return pages;
}

function getOrderDataQualityScore(order: any) {
  let score = 0;

  if (order.customer_email || order.email || order.phone) score += 20;
  if (order.tkid) score += 20;
  if (order.transaction_id || order.everflow_transaction_id) score += 20;
  if (
    order.raw ||
    (order.raw_json && Object.keys(order.raw_json || {}).length > 0)
  )
    score += 20;
  if (order.status && order.status !== "UNKNOWN") score += 20;

  return score;
}

function orderNeedsAttention(order: any) {
  return getOrderDataQualityScore(order) < 100;
}

function getHealthLabel(score: number) {
  if (score >= 80) return "Good";
  if (score >= 50) return "Warning";
  return "Poor";
}

function getHealthClasses(score: number) {
  if (score >= 80) {
    return "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300";
  }

  if (score >= 50) {
    return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
  }

  return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";
}

export default function OrdersClient() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [platform, setPlatform] = React.useState<string>("checkoutchamp");
  const [status, setStatus] = React.useState<StatusFilter>("ALL_SALES");
  const [limit, setLimit] = React.useState<number>(100);
  const [offset, setOffset] = React.useState<number>(0);
  const [total, setTotal] = React.useState<number>(0);
  const [currentPage, setCurrentPage] = React.useState<number>(1);
  const [totalPages, setTotalPages] = React.useState<number>(1);
  const [search, setSearch] = React.useState<string>("");
  const [appliedSearch, setAppliedSearch] = React.useState<string>("");
  const [from, setFrom] = React.useState<string>("");
  const [to, setTo] = React.useState<string>("");

  const [rows, setRows] = React.useState<OrderRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [sort, setSort] = React.useState<SortColumn>("order_ts");
  const [dir, setDir] = React.useState<"asc" | "desc">("desc");

  const [selectedOrder, setSelectedOrder] = React.useState<any | null>(null);
  const [customerProfile, setCustomerProfile] = React.useState<any>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [healthFilter, setHealthFilter] = React.useState<
    "all" | "needs_attention"
  >("all");

  const [platformOptions, setPlatformOptions] = React.useState<
    PlatformOption[]
  >([{ value: "checkoutchamp", label: "CheckoutChamp" }]);

  React.useEffect(() => {
    const fromQ = sp.get("from");
    const toQ = sp.get("to");
    const platQ = sp.get("platform");
    const limitQ = sp.get("limit");
    const offsetQ = sp.get("offset");
    const statusQ = sp.get("status");
    const sortQ = sp.get("sort");
    const dirQ = sp.get("dir");

    const searchQ = sp.get("q");
    if (searchQ) {
      setSearch(searchQ);
      setAppliedSearch(searchQ);
    }

    if (platQ) setPlatform(platQ);
    if (limitQ && Number(limitQ))
      setLimit(Math.max(1, Math.min(500, Number(limitQ))));
    if (offsetQ && Number(offsetQ) >= 0)
      setOffset(Math.max(0, Number(offsetQ)));
    setStatus(normalizeStatusFilter(statusQ));
    setSort(normalizeSort(sortQ));
    setDir(normalizeDir(dirQ));

    if (fromQ && toQ) {
      setFrom(fromQ);
      setTo(toQ);
      return;
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    setFrom(isoDateLocal(thirtyDaysAgo));
    setTo(isoDateLocal(now));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!from || !to) return;

    const params = new URLSearchParams();
    params.set("platform", platform);
    params.set("status", status);
    params.set("from", from);
    params.set("to", to);
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    if (appliedSearch.trim()) params.set("q", appliedSearch.trim());
    params.set("sort", sort);
    params.set("dir", dir);

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [
    router,
    pathname,
    platform,
    status,
    from,
    to,
    limit,
    offset,
    sort,
    dir,
    appliedSearch,
  ]);

  React.useEffect(() => {
    let cancelled = false;

    async function loadPlatforms() {
      try {
        const json = await apiGetJson<PlatformsResp>("/v1/platforms");

        if (!cancelled && json.ok && Array.isArray(json.platforms)) {
          setPlatformOptions(json.platforms);
        }
      } catch {
        // keep fallback
      }
    }

    loadPlatforms();

    return () => {
      cancelled = true;
    };
  }, []);
  
  React.useEffect(() => {
	  if (!selectedOrder?.identity_key) {
	    setCustomerProfile(null);
	    return;
	  }
	
	  apiGetJson(
	    `/v1/customers/by-identity?identity_key=${encodeURIComponent(
	      selectedOrder.identity_key
	    )}`
	  )
	    .then((r: any) => {
	      if (r.ok) {
	        setCustomerProfile(r.customer);
	      }
	    })
	    .catch(() => {
	      setCustomerProfile(null);
	    });
	}, [selectedOrder]);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawerOpen(false);
      }
    };

    window.addEventListener("keydown", handler);

    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const fromDt = parseYmdLocal(from);
      const toDt = parseYmdLocal(to);
      if (!fromDt || !toDt) return;

      try {
        setLoading(true);
        setError(null);

        const qs = new URLSearchParams({
          platform,
          from,
          to,
          limit: String(limit),
          offset: String(offset),
          sort,
          dir,
        });

        if (status !== "ALL_SALES") {
          qs.set("status", status);
        }

        if (appliedSearch.trim()) {
          qs.set("q", appliedSearch.trim());
        }

        const json = await apiGetJson<ApiResp>(
          `/v1/platform-orders?${qs.toString()}`,
        );

        if (!json.ok) throw new Error(json.message || "Failed to load orders.");

        if (!cancelled) {
          setRows(
            Array.isArray(json.orders)
              ? json.orders
              : Array.isArray(json.rows)
                ? json.rows
                : [],
          );
          setTotal(Number(json.total ?? 0));
          setCurrentPage(Number(json.page ?? Math.floor(offset / limit) + 1));
          setTotalPages(Math.max(1, Number(json.totalPages ?? 1)));
        }
      } catch (e: any) {
        if (!cancelled) {
          setRows([]);
          setError(e?.message || "Failed to load orders.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [platform, status, from, to, limit, offset, sort, dir, appliedSearch]);

  const pageRows = React.useMemo(() => {
    if (healthFilter === "needs_attention") {
      return rows.filter((r: any) => orderNeedsAttention(r));
    }

    return rows;
  }, [rows, healthFilter]);

  const totalRevenue = React.useMemo(() => {
    let sum = 0;
    for (const r of pageRows) sum += Number(r.gross_amount ?? 0) || 0;
    return sum;
  }, [pageRows]);

  const dataQualityIssues = React.useMemo(() => {
    return rows.filter((r: any) => orderNeedsAttention(r)).length;
  }, [rows]);

  const avgOrderValue = React.useMemo(() => {
    return pageRows.length ? totalRevenue / pageRows.length : 0;
  }, [pageRows.length, totalRevenue]);

  const dataQualityScore = React.useMemo(() => {
    if (!rows.length) return 0;

    let totalScore = 0;
    rows.forEach((r: any) => {
      totalScore += getOrderDataQualityScore(r);
    });

    return Math.round(totalScore / rows.length);
  }, [rows]);

  const visiblePages = React.useMemo(
    () => getVisiblePages(currentPage, totalPages),
    [currentPage, totalPages],
  );

  function goToPage(page: number) {
    const safePage = Math.max(1, Math.min(totalPages, page));
    setOffset((safePage - 1) * limit);
  }

  function applySearch() {
    setAppliedSearch(search.trim());
    setOffset(0);
  }

  function clearSearch() {
    setSearch("");
    setAppliedSearch("");
    setOffset(0);
  }

  function clearOperationalFilters() {
    setHealthFilter("all");
    setSearch("");
    setAppliedSearch("");
    setStatus("ALL_SALES");
    setSort("order_ts");
    setDir("desc");
    setOffset(0);
  }

  function showNeedsAttention() {
    setHealthFilter("needs_attention");
    setOffset(0);
  }

  function sortByRevenue() {
    setHealthFilter("all");
    setSort("gross_amount");
    setDir("desc");
    setOffset(0);
  }

  function exportCsv() {
    const headers = ["Order TS", "Order ID", "Status", "Amount", "Currency"];

    const lines = pageRows.map((r) => [
      r.order_ts ?? "",
      parseOrderId(r.platform_order_id ?? ""),
      r.status ?? "",
      String(r.gross_amount ?? ""),
      r.currency ?? "",
    ]);

    const csv = [headers, ...lines]
      .map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `tracekit-orders-${platform}-${from}-to-${to}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  }

  function getDataHealth(order: any) {
    const issues: string[] = [];

    if (!order.customer_email && !order.email)
      issues.push("Missing customer email");
    if (!order.transaction_id && !order.everflow_transaction_id)
      issues.push("Missing transaction ID");
    if (!order.tkid) issues.push("Missing tkid");
    if (!Number(order.gross_amount)) issues.push("Missing or zero amount");
    if (!order.status || order.status === "UNKNOWN")
      issues.push("Unknown status");
    if (!order.raw_json || Object.keys(order.raw_json || {}).length === 0)
      issues.push("Missing raw payload");

    return issues;
  }

  function getReconciliation(order: any) {
    const checks = [
      {
        label: "Journey Link",
        ok: Boolean(order.tkid),
        detail: order.tkid ? `TKID ${order.tkid}` : "No TKID linked yet",
      },
      {
        label: "Transaction Identifier",
        ok: Boolean(order.transaction_id || order.everflow_transaction_id),
        detail:
          order.transaction_id ||
          order.everflow_transaction_id ||
          "No transaction ID found",
      },
      {
        label: "Customer Identity",
        ok: Boolean(order.customer_email || order.email || order.phone),
        detail:
          order.customer_email ||
          order.email ||
          order.phone ||
          "No email or phone available",
      },
      {
        label: "Revenue Available",
        ok: Number(order.gross_amount) > 0,
        detail:
          Number(order.gross_amount) > 0
            ? formatMoney(order.gross_amount, order.currency)
            : "Missing or zero amount",
      },
      {
        label: "Status Quality",
        ok: Boolean(order.status && order.status !== "UNKNOWN"),
        detail: order.status || "UNKNOWN",
      },
    ];

    const passed = checks.filter((c) => c.ok).length;
    const confidence = Math.round((passed / checks.length) * 100);

    return { checks, confidence };
  }

  function toggleSort(col: SortColumn) {
    if (sort === col) {
      setDir(dir === "asc" ? "desc" : "asc");
    } else {
      setSort(col);
      setDir("desc");
    }

    setOffset(0);
  }

  function SortHeader({ col, label }: { col: SortColumn; label: string }) {
    const active = sort === col;
    const arrow = active ? (dir === "asc" ? "↑" : "↓") : "";

    return (
      <button
        type="button"
        className="font-semibold hover:underline text-slate-900 dark:text-slate-100"
        onClick={() => toggleSort(col)}
      >
        {label} {arrow}
      </button>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">Orders</h1>
          <p className="text-sm text-slate-500">
            Inspect imported orders from{" "}
            <span className="font-mono">platform_orders</span>.
          </p>
        </div>

        <div className="text-xs text-slate-500">
          {loading ? "loading…" : ""}
        </div>
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <label className="text-sm">
            <div className="mb-1 text-xs text-slate-500">Platform</div>
            <select
              className="w-full rounded-md border px-3 py-2 text-sm bg-white dark:bg-slate-900"
              value={platform}
              onChange={(e) => {
                setPlatform(e.target.value);
                setOffset(0);
              }}
            >
              {platformOptions.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <div className="mb-1 text-xs text-slate-500">Search</div>
            <div className="flex gap-2">
              <input
                className="w-full rounded-md border px-3 py-2 text-sm bg-white dark:bg-slate-900"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applySearch();
                  }
                }}
                placeholder="Order, email, tkid, txn"
              />
              <button
                type="button"
                className="rounded-md border px-3 py-2 text-xs disabled:opacity-50"
                onClick={applySearch}
                disabled={loading}
              >
                Search
              </button>
              {appliedSearch.trim() ? (
                <button
                  type="button"
                  className="rounded-md border px-3 py-2 text-xs disabled:opacity-50"
                  onClick={clearSearch}
                  disabled={loading}
                >
                  Clear
                </button>
              ) : null}
            </div>
          </label>

          <label className="text-sm">
            <div className="mb-1 text-xs text-slate-500">Status</div>
            <select
              className="w-full rounded-md border px-3 py-2 text-sm bg-white dark:bg-slate-900"
              value={status}
              onChange={(e) => {
                setStatus(normalizeStatusFilter(e.target.value));
                setOffset(0);
              }}
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
              className="w-full rounded-md border px-3 py-2 text-sm bg-white dark:bg-slate-900"
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setOffset(0);
              }}
              placeholder="YYYY-MM-DD"
            />
          </label>

          <label className="text-sm">
            <div className="mb-1 text-xs text-slate-500">To</div>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm bg-white dark:bg-slate-900"
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setOffset(0);
              }}
              placeholder="YYYY-MM-DD"
            />
          </label>

          <label className="text-sm">
            <div className="mb-1 text-xs text-slate-500">Rows per page</div>
            <select
              className="w-full rounded-md border px-3 py-2 text-sm bg-white dark:bg-slate-900"
              value={String(limit)}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setOffset(0);
              }}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center justify-between gap-4 flex-wrap text-xs text-slate-500">
          <div>
            Range: <span className="font-mono">{from || "—"}</span> →{" "}
            <span className="font-mono">{to || "—"}</span> • Platform:{" "}
            <span className="font-mono">{platform}</span> • Status:{" "}
            <span className="font-mono">{status}</span> • Sort:{" "}
            <span className="font-mono">
              {sort} {dir}
            </span>
            {appliedSearch.trim() ? (
              <>
                {" "}
                • Search:{" "}
                <span className="font-mono">{appliedSearch.trim()}</span>
              </>
            ) : null}
          </div>
          <div>
            Total revenue (this page):{" "}
            <span className="font-mono">
              {formatMoney(totalRevenue, "USD")}
            </span>{" "}
            • Rows: <span className="font-mono">{pageRows.length}</span>
          </div>
        </div>

        {error ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="font-semibold">Couldn’t load orders</div>
            <div className="font-mono text-xs opacity-80">{error}</div>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <button
          type="button"
          className="rounded-xl border p-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800"
          onClick={clearOperationalFilters}
          title="Clear search, health filter, and reset sorting"
        >
          <div className="text-xs text-slate-500">Orders Shown</div>
          <div className="mt-1 text-2xl font-semibold">
            {pageRows.length.toLocaleString()}
          </div>
          {healthFilter !== "all" ? (
            <div className="mt-1 text-xs text-slate-500">
              filtered from {rows.length.toLocaleString()}
            </div>
          ) : null}
        </button>

        <button
          type="button"
          className="rounded-xl border p-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800"
          onClick={sortByRevenue}
          title="Sort by revenue descending"
        >
          <div className="text-xs text-slate-500">Revenue Shown</div>
          <div className="mt-1 text-2xl font-semibold">
            {formatMoney(totalRevenue, "USD")}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            click to sort by amount
          </div>
        </button>

        <button
          type="button"
          className="rounded-xl border p-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800"
          onClick={sortByRevenue}
          title="Sort by revenue descending"
        >
          <div className="text-xs text-slate-500">Avg Order Value</div>
          <div className="mt-1 text-2xl font-semibold">
            {formatMoney(avgOrderValue, "USD")}
          </div>
          <div className="mt-1 text-xs text-slate-500">current view</div>
        </button>

        <button
          type="button"
          className={`rounded-xl border p-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800 ${
            healthFilter === "needs_attention" ? "ring-2 ring-amber-400" : ""
          }`}
          onClick={showNeedsAttention}
          title="Show orders with data quality issues"
        >
          <div className="text-xs text-slate-500">Data Quality Score</div>
          <div className="mt-1 text-2xl font-semibold">{dataQualityScore}%</div>
          <div className="mt-1 text-xs text-slate-500">
            {dataQualityIssues.toLocaleString()} orders need attention
          </div>
        </button>
      </div>

      {healthFilter !== "all" ? (
        <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <div>Showing orders that need attention.</div>
          <button
            type="button"
            className="rounded border px-2 py-1 text-xs"
            onClick={() => setHealthFilter("all")}
          >
            Clear health filter
          </button>
        </div>
      ) : null}

      <div className="rounded-xl border overflow-hidden">
        <div className="px-4 py-3 border-b text-sm font-medium flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <span>Results</span>

            <button
              type="button"
              className="rounded border px-2 py-1 text-xs disabled:opacity-50"
              disabled={loading || pageRows.length === 0}
              onClick={exportCsv}
            >
              Export Current View
            </button>

            <div className="flex items-center gap-1 flex-wrap">
              <button
                className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                disabled={currentPage <= 1 || loading}
                onClick={() => goToPage(currentPage - 1)}
              >
                &lsaquo;
              </button>

              {visiblePages[0] > 1 ? (
                <>
                  <button
                    className="rounded border px-2 py-1 text-xs"
                    onClick={() => goToPage(1)}
                  >
                    1
                  </button>
                  <span className="px-1 text-xs text-slate-400">…</span>
                </>
              ) : null}

              {visiblePages.map((p) => (
                <button
                  key={p}
                  className={`rounded border px-2 py-1 text-xs ${p === currentPage ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : ""}`}
                  disabled={loading}
                  onClick={() => goToPage(p)}
                >
                  {p}
                </button>
              ))}

              {visiblePages[visiblePages.length - 1] < totalPages ? (
                <>
                  <span className="px-1 text-xs text-slate-400">…</span>
                  <button
                    className="rounded border px-2 py-1 text-xs"
                    onClick={() => goToPage(totalPages)}
                  >
                    {totalPages}
                  </button>
                </>
              ) : null}

              <button
                className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                disabled={currentPage >= totalPages || loading}
                onClick={() => goToPage(currentPage + 1)}
              >
                &rsaquo;
              </button>
            </div>
          </div>

          <span className="text-xs text-slate-500">
            {pageRows.length.toLocaleString()} shown • {total.toLocaleString()}{" "}
            total • page {currentPage} of {totalPages}
          </span>
        </div>

        <div className="max-h-[70vh] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800">
              <tr>
                <th className="px-4 py-2 text-left whitespace-nowrap">
                  <SortHeader col="order_ts" label="Order TS" />
                </th>
                <th className="px-4 py-2 text-left whitespace-nowrap">
                  <SortHeader col="platform_order_id" label="Order ID" />
                </th>
                <th className="px-4 py-2 text-left whitespace-nowrap">
                  <SortHeader col="status" label="Status" />
                </th>
                <th className="px-4 py-2 text-left whitespace-nowrap">
                  <SortHeader col="gross_amount" label="Amount" />
                </th>
                <th className="px-4 py-2 text-left whitespace-nowrap">
                  <SortHeader col="currency" label="Currency" />
                </th>
                <th className="px-4 py-2 text-left whitespace-nowrap">
                  Health
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    className="px-4 py-6 text-center text-slate-500"
                    colSpan={6}
                  >
                    Loading orders...
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td className="px-4 py-3 text-slate-500" colSpan={6}>
                    No rows for this range.
                  </td>
                </tr>
              ) : (
                pageRows.map((r) => {
                  const healthScore = getOrderDataQualityScore(r);

                  return (
                    <tr
                      key={r.platform_order_id}
                      className={`border-t cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800 ${
                        healthScore >= 80
                          ? "bg-green-50/20 dark:bg-green-950/10"
                          : healthScore >= 50
                            ? "bg-amber-50/30 dark:bg-amber-950/10"
                            : "bg-red-50/20 dark:bg-red-950/10"
                      }`}
                      onClick={() => {
                        setSelectedOrder(r);
                        setDrawerOpen(true);
                      }}
                    >
                      <td className="px-4 py-2 whitespace-nowrap font-mono text-xs">
                        {r.order_ts}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap font-mono text-xs">
                        {parseOrderId(r.platform_order_id)}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {r.status ?? "—"}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {formatMoney(r.gross_amount, r.currency)}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {r.currency ?? "—"}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span
                          className={`rounded-full px-2 py-1 text-xs ${getHealthClasses(healthScore)}`}
                        >
                          {getHealthLabel(healthScore)}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {drawerOpen && selectedOrder ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setDrawerOpen(false)}
          />

          <aside className="fixed right-0 top-0 z-50 h-full w-full max-w-[600px] overflow-auto border-l bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-6 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Order Details</h2>
                <div className="mt-1 font-mono text-xs text-slate-500 break-all">
                  {selectedOrder.platform_order_id || "—"}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {getFullOrderHref(selectedOrder) ? (
                  <Link
                    href={getFullOrderHref(selectedOrder)}
                    className="rounded border px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Open Full Order Page
                  </Link>
                ) : null}

                <button
                  type="button"
                  className="rounded border px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                  onClick={() => setDrawerOpen(false)}
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border p-4">
                <div className="mb-3 text-sm font-semibold">Summary</div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-slate-500">Order ID</div>
                    <div className="font-medium">
                      {parseOrderId(selectedOrder.platform_order_id)}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500">Status</div>
                    <div>{selectedOrder.status ?? "—"}</div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500">Platform</div>
                    <div>{selectedOrder.platform ?? "—"}</div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500">
                      Order Timestamp
                    </div>
                    <div className="font-mono text-xs">
                      {selectedOrder.order_ts ?? "—"}
                    </div>
                  </div>

                  <div className="col-span-2">
                    <div className="text-xs text-slate-500">
                      Full Platform Order ID
                    </div>
                    <div className="font-mono text-xs break-all">
                      {selectedOrder.platform_order_id ?? "—"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <div className="mb-3 text-sm font-semibold">Customer</div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-slate-500">Email</div>
                    <div className="break-all">
                      {selectedOrder.customer_email ||
                        selectedOrder.email ||
                        "—"}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500">Phone</div>
                    <div>{selectedOrder.phone || "—"}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <div className="mb-3 text-sm font-semibold">Attribution</div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-slate-500">TKID</div>
                    <div className="font-mono text-xs break-all">
                      {selectedOrder.tkid || "—"}
                    </div>
                  </div>

                  <div>
					  <div className="text-xs text-slate-500">Everflow TID</div>
					  <div className="font-mono text-xs break-all">
					    {selectedOrder.everflow_transaction_id ||
					      selectedOrder.sub5 ||
					      "—"}
					  </div>
					</div>
					
					<div>
					  <div className="text-xs text-slate-500">Payment Transaction ID</div>
					  <div className="font-mono text-xs break-all">
					    {selectedOrder.transaction_id || "—"}
					  </div>
					</div>

                  <div>
                    <div className="text-xs text-slate-500">Affiliate ID</div>
                    <div>{selectedOrder.affiliate_id || "—"}</div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500">Offer ID</div>
                    <div>{selectedOrder.everflow_offer_id || "—"}</div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500">Sub1</div>
                    <div className="break-all">{selectedOrder.sub1 || "—"}</div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500">Sub2</div>
                    <div className="break-all">{selectedOrder.sub2 || "—"}</div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500">Sub3</div>
                    <div className="break-all">{selectedOrder.sub3 || "—"}</div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500">Source ID</div>
                    <div className="break-all">
                      {selectedOrder.source_id || "—"}
                    </div>
                  </div>
                </div>
				
				{customerProfile && (
				  <div className="rounded-lg border p-4">
				    <div className="mb-3 text-sm font-semibold">
				      Customer
				    </div>
				
				    <div className="grid grid-cols-2 gap-4 text-sm">
				
				      <div>
				        <div className="text-xs text-slate-500">
				          Orders
				        </div>
				        <div>
				          {customerProfile.order_count}
				        </div>
				      </div>
				
				      <div>
				        <div className="text-xs text-slate-500">
				          Lifetime Revenue
				        </div>
				        <div>
				          {formatMoney(
				            customerProfile.lifetime_revenue,
				            selectedOrder.currency
				          )}
				        </div>
				      </div>
				
				      <div>
				        <div className="text-xs text-slate-500">
				          Average Order Value
				        </div>
				        <div>
				          {formatMoney(
				            customerProfile.average_order_value,
				            selectedOrder.currency
				          )}
				        </div>
				      </div>
				
				      <div>
				        <div className="text-xs text-slate-500">
				          First Order
				        </div>
				        <div>
				          {customerProfile.first_order_ts || "—"}
				        </div>
				      </div>
				
				      <div>
				        <div className="text-xs text-slate-500">
				          Last Order
				        </div>
				        <div>
				          {customerProfile.last_order_ts || "—"}
				        </div>
				      </div>
				
				    </div>
				  </div>
				)}
				
                <div className="mt-4 rounded-lg border bg-slate-50 p-3 dark:bg-slate-800">
                  <div className="mb-2 text-sm font-semibold">Journey</div>
                  <div className="mb-3 text-xs text-slate-500">
                    {selectedOrder.tkid
                      ? "A TKID is available for this order."
                      : "No journey is linked yet. This will become active once TKID matching is populated."}
                  </div>

                  <button
                    type="button"
                    className="rounded border px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!selectedOrder.tkid}
                    onClick={() => {
                      if (selectedOrder.tkid) {
                        router.push(
                          `/journeys/${encodeURIComponent(selectedOrder.tkid)}`,
                        );
                      }
                    }}
                  >
                    Open Journey
                  </button>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <div className="mb-3 text-sm font-semibold">Financials</div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-slate-500">Gross Amount</div>
                    <div>
                      {formatMoney(
                        selectedOrder.gross_amount,
                        selectedOrder.currency,
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500">Currency</div>
                    <div>{selectedOrder.currency || "—"}</div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500">
                      Product Subtotal
                    </div>
                    <div>
                      {formatMoney(
                        selectedOrder.product_subtotal,
                        selectedOrder.currency,
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500">
                      Shipping Amount
                    </div>
                    <div>
                      {formatMoney(
                        selectedOrder.shipping_amount,
                        selectedOrder.currency,
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500">Tax Amount</div>
                    <div>
                      {formatMoney(
                        selectedOrder.tax_amount,
                        selectedOrder.currency,
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500">Gateway Fee</div>
                    <div>
                      {formatMoney(
                        selectedOrder.gateway_fee,
                        selectedOrder.currency,
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500">Product Cost</div>
                    <div>
                      {formatMoney(
                        selectedOrder.product_cost,
                        selectedOrder.currency,
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500">Shipping Cost</div>
                    <div>
                      {formatMoney(
                        selectedOrder.shipping_cost,
                        selectedOrder.currency,
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <div className="mb-3 text-sm font-semibold">Data Health</div>

                {getDataHealth(selectedOrder).length === 0 ? (
                  <div className="rounded bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
                    No obvious data gaps detected.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {getDataHealth(selectedOrder).map((issue) => (
                      <div
                        key={issue}
                        className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      >
                        {issue}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-semibold">
                    Attribution Readiness
                  </div>
                  <div
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      getReconciliation(selectedOrder).confidence >= 80
                        ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                        : getReconciliation(selectedOrder).confidence >= 50
                          ? "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                          : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                    }`}
                  >
                    {getReconciliation(selectedOrder).confidence}%
                    attribution-ready
                  </div>
                </div>

                <div className="space-y-2">
                  {getReconciliation(selectedOrder).checks.map((check) => (
                    <div
                      key={check.label}
                      className="flex items-start justify-between gap-3 rounded bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800"
                    >
                      <div>
                        <div className="font-medium">{check.label}</div>
                        <div className="text-xs text-slate-500 break-all">
                          {check.detail}
                        </div>
                      </div>
                      <div
                        className={`shrink-0 rounded-full px-2 py-1 text-xs ${
                          check.ok
                            ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                            : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                        }`}
                      >
                        {check.ok ? "Matched" : "Missing"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4">
                <div className="mb-2 text-xs text-slate-500">Raw JSON</div>
                <pre className="max-h-[45vh] overflow-auto rounded bg-slate-100 p-3 text-xs dark:bg-slate-800">
                  {JSON.stringify(selectedOrder, null, 2)}
                </pre>
              </div>
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
