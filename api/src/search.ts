import { cleanText } from "./identity-normalization.ts";

export const GLOBAL_SEARCH_ROUTE = "/v1/search";
export const GLOBAL_SEARCH_MIN_QUERY_LENGTH = 2;
export const GLOBAL_SEARCH_DEFAULT_LIMIT = 12;
export const GLOBAL_SEARCH_MAX_LIMIT = 20;

export type GlobalSearchParams = {
  workspace_id: string;
  query: string;
  limit: number;
};

export type GlobalSearchRouteMatch =
  | { kind: "global_search" }
  | { kind: "method_not_allowed"; path: string; allowed_methods: string[] };

export type GlobalSearchResult = {
  id: string;
  type: "customer" | "order" | "work_item";
  title: string;
  subtitle: string | null;
  meta: string | null;
  href: string;
  matched_by: string;
};

function normalizedPath(path: string) {
  const trimmed = String(path || "").replace(/\/+$/, "");
  return trimmed || "/";
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function sanitizeSearchText(value: unknown) {
  return cleanText(value).replace(/[%,()]/g, " ").replace(/\s+/g, " ").trim();
}

function encodeQuery(params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

function money(value: unknown, currency: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  try {
    return numeric.toLocaleString("en-US", {
      style: "currency",
      currency: cleanText(currency) || "USD",
      maximumFractionDigits: 2,
    });
  } catch {
    return numeric.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
}

function dateLabel(value: unknown) {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

function compactText(...values: unknown[]) {
  return values.map((value) => cleanText(value)).find(Boolean) || null;
}

export function matchGlobalSearchRoute(method: string, path: string): GlobalSearchRouteMatch | null {
  const cleanPath = normalizedPath(path);
  if (cleanPath !== GLOBAL_SEARCH_ROUTE) return null;
  const upperMethod = String(method || "GET").toUpperCase();
  if (upperMethod === "GET") return { kind: "global_search" };
  return { kind: "method_not_allowed", path: GLOBAL_SEARCH_ROUTE, allowed_methods: ["GET"] };
}

export function normalizeGlobalSearchParams(args: Record<string, unknown>): GlobalSearchParams {
  return {
    workspace_id: cleanText(args.workspace_id || args.workspaceId) || "default",
    query: sanitizeSearchText(args.q || args.query || args.search),
    limit: clampInt(args.limit, GLOBAL_SEARCH_DEFAULT_LIMIT, 1, GLOBAL_SEARCH_MAX_LIMIT),
  };
}

function customerResult(row: any, workspaceId: string): GlobalSearchResult {
  const title = compactText(row.display_name, row.primary_email, row.primary_phone, row.id) || "Customer";
  const subtitle = compactText(row.primary_email, row.primary_phone);
  return {
    id: cleanText(row.id),
    type: "customer",
    title,
    subtitle,
    meta: row.last_seen_at ? `Last seen ${dateLabel(row.last_seen_at)}` : null,
    href: `/customers/${encodeURIComponent(cleanText(row.id))}${encodeQuery({ workspace_id: workspaceId })}`,
    matched_by: "customer_profile",
  };
}

function orderResult(row: any, workspaceId: string): GlobalSearchResult {
  const orderId = compactText(row.order_id, row.platform_order_id) || "unknown";
  const amount = money(row.gross_amount ?? row.receipt_total, row.currency);
  const customer = compactText(row.customer_email, row.customer_email_normalized, row.person_id);
  const parts = [customer, amount, cleanText(row.status_norm || row.status)].filter(Boolean);
  return {
    id: cleanText(row.platform_order_id || row.order_id),
    type: "order",
    title: `Order ${orderId}`,
    subtitle: parts.length ? parts.join(" · ") : cleanText(row.platform) || null,
    meta: row.order_ts ? `Ordered ${dateLabel(row.order_ts)}` : null,
    href: `/orders/${encodeURIComponent(cleanText(row.platform_order_id || row.order_id))}${encodeQuery({ workspace_id: workspaceId })}`,
    matched_by: "platform_order",
  };
}

function workItemResult(row: any, workspaceId: string): GlobalSearchResult {
  const href = cleanText(row.deep_link) || `/operations${encodeQuery({ workspace_id: workspaceId, work_item_id: cleanText(row.id) })}`;
  return {
    id: cleanText(row.id),
    type: "work_item",
    title: cleanText(row.title) || "Work Item",
    subtitle: cleanText(row.summary) || null,
    meta: [cleanText(row.priority), cleanText(row.status), cleanText(row.category)].filter(Boolean).join(" · ") || null,
    href: href.includes("?") ? `${href}&workspace_id=${encodeURIComponent(workspaceId)}` : `${href}${encodeQuery({ workspace_id: workspaceId })}`,
    matched_by: "work_item",
  };
}

export async function searchWorkspace(supabase: any, params: GlobalSearchParams) {
  const query = params.query;
  if (query.length < GLOBAL_SEARCH_MIN_QUERY_LENGTH) {
    return {
      ok: true,
      workspace_id: params.workspace_id,
      query,
      min_query_length: GLOBAL_SEARCH_MIN_QUERY_LENGTH,
      limit: params.limit,
      groups: { customers: [], orders: [], work_items: [] },
    };
  }

  const exact = query.toLowerCase();
  const like = `%${query}%`;
  const perGroupLimit = params.limit;
  const orderOrParts = [
    `platform_order_id.eq.${query}`,
    `order_id.eq.${query}`,
    `transaction_id.eq.${query}`,
    `everflow_transaction_id.eq.${query}`,
    `commerce_reference.eq.${query}`,
    `affiliate_id.eq.${query}`,
    `customer_email.ilike.${like}`,
    `customer_email_normalized.eq.${exact}`,
  ];

  const [peopleResult, ordersResult, workItemsResult] = await Promise.all([
    supabase
      .from("people")
      .select("id,display_name,primary_email,primary_phone,last_seen_at,updated_at")
      .eq("workspace_id", params.workspace_id)
      .or(`id.eq.${query},primary_email.ilike.${like},primary_phone.ilike.${like},display_name.ilike.${like}`)
      .order("updated_at", { ascending: false })
      .limit(perGroupLimit),
    supabase
      .from("platform_orders")
      .select("platform,platform_order_id,order_id,person_id,customer_email,customer_email_normalized,status,status_norm,gross_amount,receipt_total,currency,order_ts,transaction_id,everflow_transaction_id,commerce_reference,affiliate_id")
      .eq("workspace_id", params.workspace_id)
      .or(orderOrParts.join(","))
      .order("order_ts", { ascending: false })
      .limit(perGroupLimit),
    supabase
      .from("work_items")
      .select("id,title,summary,status,priority,category,related_person_id,related_order_id,related_connector_id,deep_link,updated_at")
      .eq("workspace_id", params.workspace_id)
      .or(`id.eq.${query},title.ilike.${like},summary.ilike.${like},source_key.ilike.${like},related_order_id.eq.${query},related_person_id.eq.${query},related_connector_id.eq.${query}`)
      .order("updated_at", { ascending: false })
      .limit(perGroupLimit),
  ]);

  const failures = [
    ["customers", peopleResult.error],
    ["orders", ordersResult.error],
    ["work_items", workItemsResult.error],
  ].filter(([, error]) => Boolean(error));
  if (failures.length) {
    const [section, error] = failures[0] as [string, any];
    throw new Error(`Global search ${section} lookup failed: ${error?.message || JSON.stringify(error)}`);
  }

  return {
    ok: true,
    workspace_id: params.workspace_id,
    query,
    min_query_length: GLOBAL_SEARCH_MIN_QUERY_LENGTH,
    limit: params.limit,
    groups: {
      customers: (peopleResult.data || []).slice(0, perGroupLimit).map((row: any) => customerResult(row, params.workspace_id)),
      orders: (ordersResult.data || []).slice(0, perGroupLimit).map((row: any) => orderResult(row, params.workspace_id)),
      work_items: (workItemsResult.data || []).slice(0, perGroupLimit).map((row: any) => workItemResult(row, params.workspace_id)),
    },
  };
}
