import { cleanText } from "./identity-normalization.ts";
import { getWorkspaceHealthReport, type HealthCategory, type HealthReport } from "./health.ts";
import { getWorkspaceOnboardingState, SETUP_WIZARD_STEPS } from "./setup-wizard.ts";
import { listCustomers, normalizeCustomerListParams } from "./customer-explorer.ts";
import { getOperationsSummary, listWorkItems, normalizeWorkItemParams } from "./work-items.ts";

export const HOME_ROUTE = "/v1/home";
export const HOME_ENGINE_VERSION = "home_command_center_v1";
export const HOME_PRIORITY_WORK_ITEM_LIMIT = 8;
export const HOME_ACTIVITY_LIMIT = 20;
export const HOME_RECENT_CUSTOMER_LIMIT = 8;
export const HOME_QUERY_LIMIT = 5000;

export const HOME_WINDOWS = ["today", "last_7_days", "month_to_date", "last_30_days"] as const;
export type HomeWindow = (typeof HOME_WINDOWS)[number];

export type HomeRouteMatch =
  | { kind: "home_summary" }
  | { kind: "method_not_allowed"; path: string; allowed_methods: string[] };

export type HomeQueryParams = {
  workspace_id: string;
  window: HomeWindow;
  from: string;
  to: string;
};

export type HomeActivityItem = {
  id: string;
  type: string;
  title: string;
  summary: string;
  occurred_at: string;
  tone: "critical" | "warning" | "info" | "success" | "neutral";
  person_id: string | null;
  order_id: string | null;
  work_item_id: string | null;
  connector_id: string | null;
  deep_link: string;
  metadata: Record<string, any>;
};

function normalizedPath(path: string) {
  const trimmed = String(path || "").replace(/\/+$/, "");
  return trimmed || "/";
}

export function matchHomeRoute(method: string, path: string): HomeRouteMatch | null {
  const cleanPath = normalizedPath(path);
  const upperMethod = String(method || "GET").toUpperCase();
  if (cleanPath === HOME_ROUTE) {
    if (upperMethod === "GET") return { kind: "home_summary" };
    return { kind: "method_not_allowed", path: HOME_ROUTE, allowed_methods: ["GET"] };
  }
  return null;
}

function ymd(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function monthStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function parseDate(value: unknown, endOfDay = false) {
  const text = cleanText(value);
  if (!text) return null;
  const ms = Date.parse(text.length === 10 ? `${text}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z` : text);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

export function normalizeHomeParams(args: Record<string, unknown>, now = new Date()): HomeQueryParams {
  const requestedWindow = cleanText(args.window).toLowerCase();
  const window = HOME_WINDOWS.includes(requestedWindow as HomeWindow) ? requestedWindow as HomeWindow : "month_to_date";
  const today = startOfUtcDay(now);
  const fallbackFrom =
    window === "today" ? today
      : window === "last_7_days" ? addDays(today, -6)
        : window === "last_30_days" ? addDays(today, -29)
          : monthStart(today);
  const fallbackTo = now;
  const from = parseDate(args.from) || fallbackFrom;
  const to = parseDate(args.to, true) || fallbackTo;
  return {
    workspace_id: cleanText(args.workspace_id || args.workspaceId) || "default",
    window,
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

function numeric(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rounded(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function percent(numerator: number, denominator: number) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 10000) / 100;
}

function safeTime(value: unknown) {
  const text = cleanText(value);
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : 0;
}

function isRefundLike(row: any) {
  const status = cleanText(row?.status || row?.normalized_status).toLowerCase();
  return status.includes("refund") || status.includes("chargeback") || status.includes("reversal") || numeric(row?.gross_amount) < 0;
}

function isCanceled(row: any) {
  const status = cleanText(row?.status || row?.normalized_status).toLowerCase();
  return status.includes("cancel") || status.includes("void");
}

function activeStatus(status: unknown) {
  return ["open", "acknowledged", "in_progress"].includes(cleanText(status));
}

function deepLinkForCustomer(personId: string | null, extra = "") {
  return personId ? `/customers/${encodeURIComponent(personId)}${extra}` : "/customers";
}

function redacted(value: any, depth = 0): any {
  if (depth > 4) return "[redacted_nested_value]";
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return typeof value === "string" && value.length > 500 ? `${value.slice(0, 500)}...` : value;
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => redacted(item, depth + 1));
  const blocked = /token|secret|authorization|password|credential|access[_-]?key|api[_-]?key|card|cvv|pan|bearer/i;
  const result: Record<string, any> = {};
  for (const [key, nested] of Object.entries(value)) {
    result[key] = blocked.test(key) ? "[redacted]" : redacted(nested, depth + 1);
  }
  return result;
}

async function safeRows<T = any>(query: any, section: string, diagnostics: any[]) {
  const { data, error } = await query;
  if (error) {
    diagnostics.push({ section, error: error.message || JSON.stringify(error) });
    return [] as T[];
  }
  return Array.isArray(data) ? data as T[] : [];
}

async function safeMaybe<T = any>(query: any, section: string, diagnostics: any[]) {
  const { data, error } = await query;
  if (error) {
    diagnostics.push({ section, error: error.message || JSON.stringify(error) });
    return null;
  }
  return data as T | null;
}

async function safeSection<T>(diagnostics: any[], section: string, fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    diagnostics.push({ section, error: error?.message || String(error) });
    return fallback;
  }
}

function workItemDeepLink(item: any) {
  return `/operations?work_item_id=${encodeURIComponent(cleanText(item?.id))}`;
}

function summarizeOnboarding(row: any, health: HealthReport | null) {
  const completedSteps = Array.isArray(row?.completed_steps) ? row.completed_steps.map(cleanText).filter(Boolean) : [];
  const completed = new Set(completedSteps);
  const totalSteps = SETUP_WIZARD_STEPS.length;
  const missing = SETUP_WIZARD_STEPS.filter((step) => !completed.has(step)).slice(0, 5);
  const healthInitializing = health ? Number(health.counts?.initializing || 0) > 0 || Number(health.counts?.needs_configuration || 0) > 0 : false;
  const state = row?.completed_at
    ? healthInitializing ? "initializing" : "active"
    : completed.size ? "initializing" : "new_workspace";
  return {
    state,
    workspace_name: cleanText(row?.workspace_name) || null,
    primary_website_url: cleanText(row?.primary_website_url) || null,
    current_step: cleanText(row?.current_step) || "workspace",
    completed_steps: completedSteps,
    total_steps: totalSteps,
    progress_percent: Math.round((completed.size / totalSteps) * 100),
    completed_at: cleanText(row?.completed_at) || null,
    next_steps: missing.map((step) => ({
      id: step,
      label: step.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
      deep_link: "/setup",
    })),
  };
}

function compactHealth(health: HealthReport | null, operations: any) {
  if (!health) return null;
  const queueByCategory = new Map<string, any>((operations?.queues || []).map((queue: any) => [cleanText(queue.category), queue]));
  const categoryOrder: HealthCategory[] = ["identity", "tracking", "attribution", "commissions", "integrations", "platform_processing"];
  return {
    overall: health.overall,
    counts: health.counts,
    categories: categoryOrder.map((category) => {
      const categoryReport = health.categories?.[category];
      const finding = (health.findings || []).find((item) => item.category === category && item.status === "open" && item.severity !== "healthy")
        || (health.findings || []).find((item) => item.category === category);
      const queue = queueByCategory.get(category === "platform_processing" ? "system" : category);
      return {
        category,
        label: category === "platform_processing" ? "Runtime" : category.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
        score: categoryReport?.score ?? null,
        status: categoryReport?.status || "Healthy",
        lifecycle_state: finding?.lifecycle_state || "healthy",
        severity: finding?.severity || "healthy",
        summary: finding?.summary || "No active finding.",
        metric_value: finding?.metric_value || null,
        work_item_count: Number(queue?.open_count || 0),
        deep_link: queue?.open_count ? queue.deep_link : category === "integrations" ? "/settings/integrations" : category === "identity" ? "/customers" : category === "attribution" ? "/journeys" : "/operations",
      };
    }),
  };
}

function buildRevenueSnapshot(params: HomeQueryParams, rows: any[], todayRows: any[], monthRows: any[], credits: any[], commissions: any[]) {
  const currency = cleanText(rows.find((row) => row.currency)?.currency || credits.find((row) => row.currency)?.currency || commissions.find((row) => row.currency)?.currency) || "USD";
  const summarizeOrders = (sourceRows: any[]) => {
    const positive = sourceRows.filter((row) => numeric(row.gross_amount) > 0 && !isRefundLike(row) && !isCanceled(row));
    const refunded = sourceRows.filter((row) => isRefundLike(row));
    const gross = positive.reduce((sum, row) => sum + numeric(row.gross_amount), 0);
    const refunds = refunded.reduce((sum, row) => sum + Math.abs(numeric(row.gross_amount)), 0);
    return { gross, refunds, count: positive.length };
  };
  const windowOrders = summarizeOrders(rows);
  const todayOrders = summarizeOrders(todayRows);
  const monthOrders = summarizeOrders(monthRows);
  const attributedRevenue = credits
    .filter((row) => cleanText(row.status) === "attributed")
    .reduce((sum, row) => sum + numeric(row.credit_amount), 0);
  const commissionGenerated = commissions
    .filter((row) => !["voided", "reversed"].includes(cleanText(row.status)))
    .reduce((sum, row) => sum + numeric(row.commission_amount), 0);
  const commissionPaid = commissions
    .filter((row) => cleanText(row.status) === "paid")
    .reduce((sum, row) => sum + numeric(row.commission_amount), 0);
  return {
    window: { key: params.window, from: params.from, to: params.to },
    currency,
    order_count: windowOrders.count,
    gross_revenue: rounded(windowOrders.gross),
    refunded_revenue: rounded(windowOrders.refunds),
    net_revenue: rounded(windowOrders.gross - windowOrders.refunds),
    revenue_today: rounded(todayOrders.gross),
    revenue_month_to_date: rounded(monthOrders.gross),
    attributed_revenue: rounded(attributedRevenue),
    commission_generated: rounded(commissionGenerated),
    commission_paid: rounded(commissionPaid),
    definitions: {
      gross_revenue: "positive platform_orders.gross_amount in the selected window, excluding refund/chargeback/canceled statuses",
      attributed_revenue: "stored journey_attribution_credits.credit_amount for the active workspace model in the selected window",
      commission_generated: "stored affiliate_commissions.commission_amount excluding voided/reversed rows in the selected window",
    },
  };
}

function buildAttributionSnapshot(activeModel: string | null, credits: any[], operations: any) {
  const uniqueAttributed = new Set(credits.filter((row) => cleanText(row.status) === "attributed").map((row) => cleanText(row.conversion_event_id)).filter(Boolean));
  const uniqueUnattributed = new Set(credits.filter((row) => cleanText(row.status) === "unattributed").map((row) => cleanText(row.conversion_event_id)).filter(Boolean));
  const affiliateMap = new Map<string, { affiliate_id: string; credited_revenue: number; conversions: Set<string> }>();
  for (const row of credits) {
    if (cleanText(row.status) !== "attributed") continue;
    const affiliate = cleanText(row.affiliate_id || row.source) || "unknown";
    const entry = affiliateMap.get(affiliate) || { affiliate_id: affiliate, credited_revenue: 0, conversions: new Set<string>() };
    entry.credited_revenue += numeric(row.credit_amount);
    const conversionId = cleanText(row.conversion_event_id);
    if (conversionId) entry.conversions.add(conversionId);
    affiliateMap.set(affiliate, entry);
  }
  const topAffiliate = Array.from(affiliateMap.values())
    .sort((a, b) => b.credited_revenue - a.credited_revenue || a.affiliate_id.localeCompare(b.affiliate_id))[0] || null;
  const attributionQueue = (operations?.queues || []).find((queue: any) => cleanText(queue.category) === "attribution");
  return {
    active_model: activeModel,
    attributed_purchases: uniqueAttributed.size,
    unattributed_purchases: uniqueUnattributed.size,
    attribution_coverage: percent(uniqueAttributed.size, uniqueAttributed.size + uniqueUnattributed.size),
    attributed_revenue: rounded(Array.from(affiliateMap.values()).reduce((sum, row) => sum + row.credited_revenue, 0)),
    top_affiliate: topAffiliate ? {
      affiliate_id: topAffiliate.affiliate_id,
      credited_revenue: rounded(topAffiliate.credited_revenue),
      conversions: topAffiliate.conversions.size,
    } : null,
    needs_review_count: Number(attributionQueue?.open_count || 0),
    deep_links: {
      marketing: "/journeys",
      review: "/operations?category=attribution&status=open,acknowledged,in_progress",
    },
  };
}

export function buildPurchaseActivity(workspaceId: string, row: any): HomeActivityItem | null {
  const platformOrderId = cleanText(row.platform_order_id);
  const orderId = cleanText(row.order_id || platformOrderId);
  const occurredAt = cleanText(row.order_ts || row.created_at);
  if (!occurredAt || !platformOrderId || numeric(row.gross_amount) <= 0 || isRefundLike(row) || isCanceled(row)) return null;
  const personId = cleanText(row.person_id) || null;
  const amount = rounded(numeric(row.gross_amount));
  const currency = cleanText(row.currency) || "USD";
  return {
    id: `activity:purchase:${workspaceId}:${platformOrderId}`,
    type: "purchase_completed",
    title: "Purchase completed",
    summary: `Order ${orderId} completed for ${amount.toFixed(2)} ${currency}.`,
    occurred_at: occurredAt,
    tone: "success",
    person_id: personId,
    order_id: orderId || null,
    work_item_id: null,
    connector_id: cleanText(row.platform) || null,
    deep_link: personId ? `${deepLinkForCustomer(personId)}?order_id=${encodeURIComponent(orderId || platformOrderId)}` : `/orders?search=${encodeURIComponent(orderId || platformOrderId)}`,
    metadata: redacted({ platform: row.platform, platform_order_id: platformOrderId, amount, currency }),
  };
}

function buildCommissionActivity(workspaceId: string, row: any): HomeActivityItem | null {
  const id = cleanText(row.id);
  const occurredAt = cleanText(row.created_at || row.updated_at || row.conversion_event_time);
  if (!id || !occurredAt) return null;
  return {
    id: `activity:commission:${workspaceId}:${id}`,
    type: cleanText(row.status) === "paid" ? "commission_paid" : "commission_created",
    title: cleanText(row.status) === "paid" ? "Commission paid" : "Commission generated",
    summary: `${rounded(numeric(row.commission_amount)).toFixed(2)} ${cleanText(row.currency) || "USD"} commission ${cleanText(row.status) || "created"}.`,
    occurred_at: occurredAt,
    tone: cleanText(row.status) === "paid" ? "success" : "info",
    person_id: cleanText(row.person_id) || null,
    order_id: null,
    work_item_id: null,
    connector_id: null,
    deep_link: cleanText(row.person_id) ? deepLinkForCustomer(row.person_id) : "/reports",
    metadata: redacted({ commission_id: id, conversion_event_id: row.conversion_event_id, affiliate_id: row.affiliate_id, publisher_id: row.publisher_id, status: row.status }),
  };
}

function buildAttributionActivity(workspaceId: string, row: any): HomeActivityItem | null {
  const conversionId = cleanText(row.conversion_event_id);
  const occurredAt = cleanText(row.calculated_at || row.created_at || row.conversion_event_time);
  if (!conversionId || !occurredAt || cleanText(row.status) !== "attributed") return null;
  return {
    id: `activity:attribution:${workspaceId}:${cleanText(row.model)}:${conversionId}`,
    type: "attribution_completed",
    title: "Attribution completed",
    summary: `Stored ${cleanText(row.model) || "selected"} attribution credit for a conversion.`,
    occurred_at: occurredAt,
    tone: "info",
    person_id: cleanText(row.person_id) || null,
    order_id: null,
    work_item_id: null,
    connector_id: null,
    deep_link: cleanText(row.person_id) ? deepLinkForCustomer(row.person_id) : "/journeys",
    metadata: redacted({ conversion_event_id: conversionId, model: row.model, affiliate_id: row.affiliate_id, credit_amount: row.credit_amount, currency: row.currency }),
  };
}

function buildWorkItemActivity(workspaceId: string, row: any): HomeActivityItem | null {
  const id = cleanText(row.id);
  const workItemId = cleanText(row.work_item_id);
  const occurredAt = cleanText(row.created_at);
  if (!id || !workItemId || !occurredAt) return null;
  const type = cleanText(row.activity_type);
  return {
    id: `activity:work_item:${workspaceId}:${id}`,
    type: `work_item_${type || "updated"}`,
    title: type === "resolved" ? "Work Item resolved" : type === "reopened" ? "Work Item reopened" : "Work Item updated",
    summary: cleanText(row.body) || `Activity recorded on Work Item ${workItemId}.`,
    occurred_at: occurredAt,
    tone: type === "resolved" ? "success" : type === "reopened" ? "warning" : "neutral",
    person_id: null,
    order_id: null,
    work_item_id: workItemId,
    connector_id: null,
    deep_link: `/operations?work_item_id=${encodeURIComponent(workItemId)}`,
    metadata: redacted({ activity_type: type, actor_id: row.actor_id }),
  };
}

function buildConnectorActivity(workspaceId: string, row: any): HomeActivityItem | null {
  const id = cleanText(row.id);
  const occurredAt = cleanText(row.completed_at || row.updated_at || row.created_at);
  if (!id || !occurredAt) return null;
  const status = cleanText(row.status);
  if (!["failed", "completed", "completed_with_errors"].includes(status)) return null;
  return {
    id: `activity:connector:${workspaceId}:${id}:${status}`,
    type: status === "failed" ? "connector_failed" : "connector_recovered",
    title: status === "failed" ? "Connector job failed" : "Connector job completed",
    summary: `${cleanText(row.connector_id || row.job_type || "Connector")} ${status.replace(/_/g, " ")}.`,
    occurred_at: occurredAt,
    tone: status === "failed" ? "critical" : status === "completed_with_errors" ? "warning" : "success",
    person_id: null,
    order_id: null,
    work_item_id: null,
    connector_id: cleanText(row.connector_id) || null,
    deep_link: cleanText(row.connector_id) ? `/settings/integrations/${encodeURIComponent(row.connector_id)}` : "/settings/integrations",
    metadata: redacted({ job_id: id, connector_id: row.connector_id, job_type: row.job_type, status }),
  };
}

export function dedupeAndSortHomeActivity(items: Array<HomeActivityItem | null | undefined>, limit = HOME_ACTIVITY_LIMIT) {
  const byId = new Map<string, HomeActivityItem>();
  for (const item of items) {
    if (!item?.id) continue;
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  return Array.from(byId.values())
    .sort((a, b) => safeTime(b.occurred_at) - safeTime(a.occurred_at) || a.id.localeCompare(b.id))
    .slice(0, limit);
}

function quickActions(operations: any, attribution: any) {
  const actions = [
    { label: "Review open Work Items", href: "/operations?status=open,acknowledged,in_progress", tone: Number(operations?.metrics?.open || 0) ? "warning" : "neutral" },
    { label: "Search customers", href: "/customers", tone: "neutral" },
    { label: "View unattributed purchases", href: "/operations?category=attribution&status=open,acknowledged,in_progress", tone: Number(attribution?.needs_review_count || 0) ? "warning" : "neutral" },
    { label: "Check integrations", href: "/settings/integrations", tone: "neutral" },
    { label: "Open notifications", href: "/notifications", tone: "neutral" },
  ];
  return actions;
}

export async function buildHomeSummary(supabase: any, params: HomeQueryParams, now = new Date()) {
  const diagnostics: any[] = [];
  const workspaceId = params.workspace_id;
  const today = startOfUtcDay(now);
  const tomorrow = addDays(today, 1);
  const month = monthStart(today);

  const [health, operations] = await Promise.all([
    safeSection(diagnostics, "health", null as HealthReport | null, () => getWorkspaceHealthReport(supabase, { workspace_id: workspaceId }, now)),
    safeSection(diagnostics, "operations", null as any, () => getOperationsSummary(supabase, { workspace_id: workspaceId })),
  ]);

  const [onboarding, priorityWorkItems] = await Promise.all([
    safeSection(diagnostics, "onboarding", null as any, () => getWorkspaceOnboardingState(supabase, workspaceId)),
    safeSection(diagnostics, "priority_work_items", { work_items: [] } as any, () => listWorkItems(supabase, normalizeWorkItemParams({
      workspace_id: workspaceId,
      status: "open,acknowledged,in_progress",
      sort: "priority",
      limit: HOME_PRIORITY_WORK_ITEM_LIMIT,
    }), { sync: false })),
  ]);

  const activeModel = cleanText(health?.findings?.find((finding) => finding.id === "attribution.active_policy")?.evidence?.active_model)
    || cleanText((await safeMaybe<any>(
      supabase.from("workspace_attribution_policy").select("active_model").eq("workspace_id", workspaceId).maybeSingle(),
      "workspace_attribution_policy",
      diagnostics,
    ))?.active_model)
    || "first_touch";

  const [orders, todayOrders, monthOrders, credits, commissions, workItemActivityRows, connectorJobs] = await Promise.all([
    safeRows<any>(
      supabase.from("platform_orders").select("platform_order_id,order_id,person_id,platform,gross_amount,currency,order_ts,status,created_at").eq("workspace_id", workspaceId).gte("order_ts", params.from).lte("order_ts", params.to).order("order_ts", { ascending: false }).limit(HOME_QUERY_LIMIT),
      "platform_orders.window",
      diagnostics,
    ),
    safeRows<any>(
      supabase.from("platform_orders").select("platform_order_id,order_id,person_id,platform,gross_amount,currency,order_ts,status,created_at").eq("workspace_id", workspaceId).gte("order_ts", today.toISOString()).lt("order_ts", tomorrow.toISOString()).order("order_ts", { ascending: false }).limit(HOME_QUERY_LIMIT),
      "platform_orders.today",
      diagnostics,
    ),
    safeRows<any>(
      supabase.from("platform_orders").select("platform_order_id,order_id,person_id,platform,gross_amount,currency,order_ts,status,created_at").eq("workspace_id", workspaceId).gte("order_ts", month.toISOString()).lte("order_ts", params.to).order("order_ts", { ascending: false }).limit(HOME_QUERY_LIMIT),
      "platform_orders.month",
      diagnostics,
    ),
    safeRows<any>(
      supabase.from("journey_attribution_credits").select("id,conversion_event_id,touchpoint_event_id,person_id,journey_id,status,model,affiliate_id,source,credit_amount,currency,conversion_event_time,calculated_at,created_at").eq("workspace_id", workspaceId).eq("model", activeModel).gte("conversion_event_time", params.from).lte("conversion_event_time", params.to).order("conversion_event_time", { ascending: false }).limit(HOME_QUERY_LIMIT),
      "journey_attribution_credits.window",
      diagnostics,
    ),
    safeRows<any>(
      supabase.from("affiliate_commissions").select("id,conversion_event_id,touchpoint_event_id,person_id,journey_id,affiliate_id,publisher_id,status,commission_amount,currency,created_at,updated_at,conversion_event_time,model").eq("workspace_id", workspaceId).gte("created_at", params.from).lte("created_at", params.to).order("created_at", { ascending: false }).limit(HOME_QUERY_LIMIT),
      "affiliate_commissions.window",
      diagnostics,
    ),
    safeRows<any>(
      supabase.from("work_item_activity").select("id,workspace_id,work_item_id,activity_type,actor_id,body,metadata,created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(25),
      "work_item_activity.recent",
      diagnostics,
    ),
    safeRows<any>(
      supabase.from("integration_import_jobs").select("id,connector_id,job_type,status,phase,created_at,updated_at,completed_at,last_error").eq("workspace_id", workspaceId).order("updated_at", { ascending: false }).limit(25),
      "integration_import_jobs.recent",
      diagnostics,
    ),
  ]);

  const recentCustomers = await safeSection(diagnostics, "recent_customers", { customers: [] } as any, () => listCustomers(supabase, normalizeCustomerListParams({
    workspace_id: workspaceId,
    limit: HOME_RECENT_CUSTOMER_LIMIT,
    has_purchase: "true",
  })));

  const revenue = buildRevenueSnapshot(params, orders, todayOrders, monthOrders, credits, commissions);
  const attribution = buildAttributionSnapshot(activeModel, credits, operations);
  const activity = dedupeAndSortHomeActivity([
    ...orders.slice(0, 20).map((row) => buildPurchaseActivity(workspaceId, row)),
    ...credits.slice(0, 20).map((row) => buildAttributionActivity(workspaceId, row)),
    ...commissions.slice(0, 20).map((row) => buildCommissionActivity(workspaceId, row)),
    ...workItemActivityRows.map((row) => buildWorkItemActivity(workspaceId, row)),
    ...connectorJobs.map((row) => buildConnectorActivity(workspaceId, row)),
  ]);

  const integrationWorkItemQueue = (operations?.queues || []).find((queue: any) => cleanText(queue.category) === "integrations");
  const integrations = (health?.findings || [])
    .filter((finding) => finding.category === "integrations")
    .map((finding) => ({
      id: finding.id,
      name: cleanText(finding.evidence?.platform) || finding.id.replace(/^integrations\./, ""),
      status: finding.lifecycle_state,
      severity: finding.severity,
      summary: finding.summary,
      last_success_at: finding.evidence?.last_success_at || null,
      recent_failure_count: finding.severity === "warning" || finding.severity === "critical" ? 1 : 0,
      open_work_item_count: Number(integrationWorkItemQueue?.open_count || 0),
      deep_link: `/settings/integrations/${encodeURIComponent(cleanText(finding.evidence?.platform) || finding.id.replace(/^integrations\./, ""))}`,
    }))
    .slice(0, 12);

  return {
    ok: true,
    workspace_id: workspaceId,
    generated_at: now.toISOString(),
    engine_version: HOME_ENGINE_VERSION,
    window: {
      key: params.window,
      from: params.from,
      to: params.to,
      label: params.window.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
    },
    onboarding: summarizeOnboarding(onboarding, health),
    operations: operations || { metrics: { open: 0, urgent: 0, high: 0, unassigned: 0, resolved_today: 0 }, queues: [] },
    health: compactHealth(health, operations),
    revenue,
    attribution,
    recent_customers: Array.isArray(recentCustomers?.customers) ? recentCustomers.customers.slice(0, HOME_RECENT_CUSTOMER_LIMIT) : [],
    integrations,
    priority_work_items: Array.isArray(priorityWorkItems?.work_items) ? priorityWorkItems.work_items.slice(0, HOME_PRIORITY_WORK_ITEM_LIMIT) : [],
    recent_activity: activity,
    quick_actions: quickActions(operations, attribution),
    query_bounds: {
      priority_work_items: HOME_PRIORITY_WORK_ITEM_LIMIT,
      recent_activity: HOME_ACTIVITY_LIMIT,
      recent_customers: HOME_RECENT_CUSTOMER_LIMIT,
      source_query_limit: HOME_QUERY_LIMIT,
    },
    definitions: {
      operations: "Work Item counts come from /v1/operations/summary.",
      health: "Health score and lifecycle values come from the Health Engine.",
      revenue: "Revenue uses existing platform order semantics and stored attribution/commission ledgers.",
      attribution: "Attribution uses stored journey_attribution_credits for the active workspace policy model.",
      activity_dedupe: "Activity IDs use source table plus canonical business identifier such as platform_order_id, conversion_event_id, commission id, Work Item activity id, or import job id.",
    },
    diagnostics: {
      section_errors: diagnostics,
    },
  };
}
