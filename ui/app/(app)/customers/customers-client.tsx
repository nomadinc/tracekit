"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  UserRound,
  X,
} from "lucide-react";
import {
  compactCustomerId,
  customerStatusTone,
  formatCustomerMoney,
  formatCustomerTime,
  type CustomerBadgeTone,
} from "@/lib/customers";

type CustomerRow = {
  customer: {
    id: string;
    display_name: string;
    primary_email?: string | null;
    primary_phone?: string | null;
    status?: string | null;
  };
  primary_identifier?: { type: string; value: string } | null;
  last_activity_at?: string | null;
  journey_count: number;
  order_count: number;
  revenue: string;
  attributed_revenue: string;
  attributed_source?: { affiliate_id?: string | null; source?: string | null; model?: string | null } | null;
  match_reason?: string | null;
  has_purchase?: boolean;
  has_attribution?: boolean;
  has_commission?: boolean;
  identity_status: string;
  source_systems: string[];
};

type CustomerListResponse = {
  ok: boolean;
  workspace_id: string;
  customers: CustomerRow[];
  next_cursor?: string | null;
  has_more?: boolean;
  message?: string;
};

const SOURCE_OPTIONS = ["", "browser", "shopify", "paypal", "konnektive", "wowboost", "wowsuite"];
const JOURNEY_STATUSES = ["", "active", "completed", "abandoned"];

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: CustomerBadgeTone }) {
  const cls = {
    good: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
    warn: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100",
    bad: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200",
    neutral: "border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200",
  }[tone];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

async function readJsonSafe(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, error: "invalid_json", message: text.slice(0, 240) };
  }
}

function buildQuery(filters: Record<string, any>, cursor?: string | null) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === null || value === undefined || value === "" || value === false) continue;
    params.set(key, String(value));
  }
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

async function fetchCustomers(filters: Record<string, any>, cursor?: string | null) {
  const res = await fetch(`/api/customers?${buildQuery(filters, cursor)}`, {
    method: "GET",
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  const body = await readJsonSafe(res);
  if (!res.ok) throw new Error(body?.message || body?.error || `Customer lookup failed (${res.status})`);
  return body as CustomerListResponse;
}

function sourceLabel(row: CustomerRow) {
  const affiliate = row.attributed_source?.affiliate_id;
  if (affiliate) return `Affiliate ${affiliate}`;
  const source = row.attributed_source?.source;
  if (source) return source;
  return row.source_systems?.[0] || "-";
}

export default function CustomersClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [workspaceId, setWorkspaceId] = React.useState(searchParams.get("workspace_id") || "default");
  const [search, setSearch] = React.useState(searchParams.get("search") || searchParams.get("q") || "");
  const [from, setFrom] = React.useState(searchParams.get("from") || "");
  const [to, setTo] = React.useState(searchParams.get("to") || "");
  const [source, setSource] = React.useState(searchParams.get("source") || "");
  const [affiliate, setAffiliate] = React.useState(searchParams.get("affiliate_id") || "");
  const [journeyStatus, setJourneyStatus] = React.useState(searchParams.get("journey_status") || "");
  const [hasPurchase, setHasPurchase] = React.useState(searchParams.get("has_purchase") === "true");
  const [hasAttribution, setHasAttribution] = React.useState(searchParams.get("has_attribution") === "true");
  const [hasCommission, setHasCommission] = React.useState(searchParams.get("has_commission") === "true");
  const [identityStatus, setIdentityStatus] = React.useState(searchParams.get("identity_status") || "");
  const [customers, setCustomers] = React.useState<CustomerRow[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const filters = React.useMemo(() => ({
    workspace_id: workspaceId,
    search,
    from,
    to,
    source,
    affiliate_id: affiliate,
    journey_status: journeyStatus,
    has_purchase: hasPurchase,
    has_attribution: hasAttribution,
    has_commission: hasCommission,
    identity_status: identityStatus,
    limit: 25,
  }), [workspaceId, search, from, to, source, affiliate, journeyStatus, hasPurchase, hasAttribution, hasCommission, identityStatus]);

  const load = React.useCallback(async (reset = true, cursor: string | null = null) => {
    setError(null);
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const data = await fetchCustomers(filters, reset ? null : cursor);
      setCustomers((current) => reset ? data.customers || [] : [...current, ...(data.customers || [])]);
      setNextCursor(data.next_cursor || null);
      setHasMore(Boolean(data.has_more && data.next_cursor));
    } catch (err: any) {
      setError(err?.message || "Customer Explorer failed.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filters]);

  React.useEffect(() => {
    load(true);
  }, [load]);

  function applyFilters() {
    const query = buildQuery(filters);
    router.replace(`/customers${query ? `?${query}` : ""}`);
    load(true);
  }

  function clearFilters() {
    setSearch("");
    setFrom("");
    setTo("");
    setSource("");
    setAffiliate("");
    setJourneyStatus("");
    setHasPurchase(false);
    setHasAttribution(false);
    setHasCommission(false);
    setIdentityStatus("");
    router.replace("/customers");
  }

  const noFilters = !search && !from && !to && !source && !affiliate && !journeyStatus && !hasPurchase && !hasAttribution && !hasCommission && !identityStatus;

  return (
    <div className="min-h-full space-y-5">
      <section className="rounded-lg border bg-white p-5 shadow-sm dark:bg-ink/80">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Customers</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Customer Journey Explorer</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
              Investigate resolved customers, linked identities, journeys, orders, attribution decisions, and generated commissions.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => load(true)} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-white/5">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button type="button" onClick={clearFilters} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-white/5">
              <X className="h-4 w-4" />
              Clear
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2 border-b pb-3 text-sm dark:border-white/10">
          <Badge tone="good">Customers</Badge>
          <span className="rounded-full border px-2 py-0.5 text-xs text-slate-500 dark:border-white/10">Journeys</span>
          <span className="rounded-full border px-2 py-0.5 text-xs text-slate-500 dark:border-white/10">Unresolved Identity</span>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-6">
          <label className="space-y-1 text-sm lg:col-span-2">
            <span className="font-medium">Search</span>
            <div className="flex rounded-md border bg-white focus-within:ring-2 focus-within:ring-slate-300 dark:bg-transparent">
              <Search className="ml-3 mt-2.5 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") applyFilters();
                }}
                placeholder="Email, phone, person ID, order ID, transaction ID"
                className="min-w-0 flex-1 bg-transparent px-3 py-2 outline-none"
              />
            </div>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Workspace</span>
            <input value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value || "default")} className="w-full rounded-md border bg-white px-3 py-2 dark:bg-transparent" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">From</span>
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="w-full rounded-md border bg-white px-3 py-2 dark:bg-transparent" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">To</span>
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="w-full rounded-md border bg-white px-3 py-2 dark:bg-transparent" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Source</span>
            <select value={source} onChange={(event) => setSource(event.target.value)} className="w-full rounded-md border bg-white px-3 py-2 dark:bg-ink">
              {SOURCE_OPTIONS.map((option) => <option key={option || "all"} value={option}>{option || "All"}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Affiliate</span>
            <input value={affiliate} onChange={(event) => setAffiliate(event.target.value)} className="w-full rounded-md border bg-white px-3 py-2 dark:bg-transparent" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Journey status</span>
            <select value={journeyStatus} onChange={(event) => setJourneyStatus(event.target.value)} className="w-full rounded-md border bg-white px-3 py-2 dark:bg-ink">
              {JOURNEY_STATUSES.map((option) => <option key={option || "any"} value={option}>{option || "Any"}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Identity</span>
            <select value={identityStatus} onChange={(event) => setIdentityStatus(event.target.value)} className="w-full rounded-md border bg-white px-3 py-2 dark:bg-ink">
              <option value="">Any</option>
              <option value="active">Resolved</option>
              <option value="review_required">Under review</option>
              <option value="merged">Merged</option>
            </select>
          </label>
          <div className="flex flex-wrap items-end gap-3 lg:col-span-3">
            <label className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm dark:border-white/10">
              <input type="checkbox" checked={hasPurchase} onChange={(event) => setHasPurchase(event.target.checked)} />
              Has purchase
            </label>
            <label className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm dark:border-white/10">
              <input type="checkbox" checked={hasAttribution} onChange={(event) => setHasAttribution(event.target.checked)} />
              Has attribution
            </label>
            <label className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm dark:border-white/10">
              <input type="checkbox" checked={hasCommission} onChange={(event) => setHasCommission(event.target.checked)} />
              Has commission
            </label>
            <button type="button" onClick={applyFilters} className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950">
              <Filter className="h-4 w-4" />
              Apply
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <section className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100">
          <div className="flex gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5" />
            <div>
              <h2 className="font-semibold">Customer Explorer unavailable</h2>
              <p className="mt-1 text-sm">{error}</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-lg border bg-white shadow-sm dark:bg-ink/80">
        <div className="flex items-center justify-between border-b px-5 py-4 dark:border-white/10">
          <div>
            <h2 className="font-semibold">Customers</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{customers.length} shown</p>
          </div>
          {loading ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
        </div>

        {loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-14 animate-pulse rounded-md bg-slate-100 dark:bg-white/10" />)}
          </div>
        ) : customers.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-[960px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-white/5 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Primary Identifier</th>
                  <th className="px-5 py-3">Last Activity</th>
                  <th className="px-5 py-3">Journeys</th>
                  <th className="px-5 py-3">Orders</th>
                  <th className="px-5 py-3">Revenue</th>
                  <th className="px-5 py-3">Attributed Source</th>
                  <th className="px-5 py-3">Identity</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-white/10">
                {customers.map((row) => (
                  <tr key={row.customer.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                    <td className="px-5 py-4">
                      <Link href={`/customers/${encodeURIComponent(row.customer.id)}`} className="flex items-center gap-3 font-medium text-slate-950 hover:underline dark:text-white">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-200">
                          <UserRound className="h-4 w-4" />
                        </span>
                        <span>
                          <span className="block">{row.customer.display_name}</span>
                          <span className="block text-xs font-normal text-slate-500">{compactCustomerId(row.customer.id)}</span>
                          {row.match_reason ? <span className="mt-1 block text-xs font-normal text-slate-500">{row.match_reason}</span> : null}
                        </span>
                      </Link>
                    </td>
                    <td className="px-5 py-4">
                      <span className="block">{row.primary_identifier?.value || row.customer.primary_email || row.customer.primary_phone || "-"}</span>
                      <span className="text-xs text-slate-500">{row.primary_identifier?.type || "identifier"}</span>
                    </td>
                    <td className="px-5 py-4">{formatCustomerTime(row.last_activity_at)}</td>
                    <td className="px-5 py-4">{row.journey_count}</td>
                    <td className="px-5 py-4">{row.order_count}</td>
                    <td className="px-5 py-4">
                      <span className="block font-medium">{formatCustomerMoney(row.revenue)}</span>
                      <span className="text-xs text-slate-500">{formatCustomerMoney(row.attributed_revenue)} attributed</span>
                    </td>
                    <td className="px-5 py-4">{sourceLabel(row)}</td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        <Badge tone={customerStatusTone(row.identity_status)}>{row.identity_status}</Badge>
                        {row.has_attribution ? <Badge tone="good">Attributed</Badge> : row.has_purchase ? <Badge tone="warn">Unattributed</Badge> : null}
                        {row.has_commission ? <Badge tone="good">Commissioned</Badge> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-white/10">
              <UserRound className="h-5 w-5" />
            </div>
            <h3 className="mt-4 font-semibold">{noFilters ? "No customers yet" : "No customers match these filters"}</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500 dark:text-slate-400">
              {noFilters
                ? "Customer profiles appear after identity resolution links browser, commerce, or platform records to a person."
                : "Try a narrower identifier search or clear one of the filters."}
            </p>
          </div>
        )}

        {hasMore ? (
          <div className="border-t px-5 py-4 dark:border-white/10">
            <button type="button" disabled={loadingMore} onClick={() => load(false, nextCursor)} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60 dark:hover:bg-white/5">
              {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Load more
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
