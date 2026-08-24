import type { CustomerRepository } from "./repository";
import type {
  CustomerDeepLinkState,
  CustomerDrawerRecord,
  CustomerListFilter,
  CustomerRelatedOffer,
  CustomerScope,
  CustomerSearchResult,
  CustomerSummary,
  CustomerTrackingState,
  CustomerWorkspaceSnapshot,
} from "./types";
import { customerDeepLinkHref, normalizeCustomerDeepLink } from "./deep-link";
import { withDevelopmentIdentity } from "@/lib/identity/development-state";

async function readJsonSafe(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, error: "invalid_json", message: text.slice(0, 240) };
  }
}

async function apiGet(path: string) {
  const response = await fetch(path, {
    method: "GET",
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  const body = await readJsonSafe(response);
  if (!response.ok) {
    throw new Error(body?.message || body?.error || `Customer request failed (${response.status})`);
  }
  return body;
}

function numeric(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function trackingState(value: unknown): CustomerTrackingState {
  const text = String(value || "").toLowerCase();
  if (text.includes("interference")) return "Interference Likely";
  if (text.includes("degraded")) return "Degraded";
  if (text.includes("incomplete")) return "Incomplete";
  if (text.includes("healthy")) return "Healthy";
  return "Unknown";
}

function dateText(value: unknown, fallback = "No activity") {
  if (!value) return fallback;
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return String(value);
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function customerSummaryFromList(row: any, organizationId: string): CustomerSummary {
  const customer = row?.customer || {};
  const source = row?.attributed_source?.source || row?.source_systems?.[0] || null;
  return {
    id: String(customer.id || ""),
    organizationId,
    offerIds: [],
    name: String(customer.display_name || [customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.primary_email || "Unnamed Customer"),
    email: String(customer.primary_email || ""),
    phone: String(customer.primary_phone || ""),
    sensitiveMasked: false,
    profit: 0,
    profitStatus: "Estimated",
    lastActivity: dateText(row?.last_activity_at),
    status: String(customer.status || "active"),
    trackingHealth: trackingState(row?.tracking_health),
    repeat: numeric(row?.order_count) > 1,
    refunded: Boolean(row?.refunded),
    interferenceLikely: trackingState(row?.tracking_health) === "Interference Likely",
    journeyPreview: source ? `${source} · ${numeric(row?.journey_count)} journey${numeric(row?.journey_count) === 1 ? "" : "s"}` : `${numeric(row?.journey_count)} journey${numeric(row?.journey_count) === 1 ? "" : "s"}`,
  };
}

function customerSummaryFromDetail(body: any, organizationId: string): CustomerSummary {
  const customer = body?.customer || {};
  const summary = body?.summary || {};
  const status = body?.customer_360?.status || customer.status || "active";
  const health = body?.customer_360?.operational_health?.tracking_health || body?.customer_360?.operational_health?.status;
  return {
    id: String(customer.id || ""),
    organizationId,
    offerIds: Array.from(new Set((body?.orders || []).map((order: any) => String(order.offer_id || "")).filter(Boolean))) as string[],
    name: String(customer.display_name || [customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.primary_email || "Unnamed Customer"),
    email: String(customer.primary_email || ""),
    phone: String(customer.primary_phone || ""),
    sensitiveMasked: false,
    profit: 0,
    profitStatus: "Estimated",
    lastActivity: dateText(summary.last_seen_at),
    status: String(status),
    trackingHealth: trackingState(health),
    repeat: numeric(summary.total_orders) > 1,
    refunded: Boolean(body?.customer_360?.refunds?.count || 0),
    interferenceLikely: trackingState(health) === "Interference Likely",
    journeyPreview: `${numeric(summary.total_journeys)} journey${numeric(summary.total_journeys) === 1 ? "" : "s"} · ${numeric(summary.total_orders)} order${numeric(summary.total_orders) === 1 ? "" : "s"}`,
  };
}

function snapshotFromDetail(body: any, organizationId: string): CustomerWorkspaceSnapshot {
  const customer = customerSummaryFromDetail(body, organizationId);
  const summary = body?.summary || {};
  const journeys = Array.isArray(body?.journeys) ? body.journeys : [];
  const orders = Array.isArray(body?.orders) ? body.orders : [];
  const firstJourney = journeys[0] || null;
  const offersById = new Map<string, CustomerRelatedOffer>();
  for (const order of orders) {
    const id = String(order?.offer_id || order?.everflow_offer_id || "");
    if (!id || offersById.has(id)) continue;
    offersById.set(id, {
      id,
      name: String(order?.offer_name || order?.offer_id || order?.everflow_offer_id || "Offer"),
      firstTouch: "Recorded commerce relationship",
    });
  }
  return {
    customer,
    lifetimeRevenue: numeric(summary.lifetime_revenue),
    customerSince: dateText(summary.first_seen_at, "Unknown"),
    firstTouch: String(body?.customer_360?.acquisition?.first_touch?.source || body?.customer_360?.acquisition?.source || "Unknown"),
    lastPurchase: orders[0]?.order_ts ? dateText(orders[0].order_ts) : "No purchases",
    journeyId: String(firstJourney?.id || "No journey"),
    journey: [],
    orders: orders.map((order: any) => ({
      id: String(order.platform_order_id || order.order_id || order.id || ""),
      number: String(order.order_id || order.platform_order_id || order.id || "Order"),
      date: dateText(order.order_ts || order.created_at),
      amount: numeric(order.gross_amount ?? order.receipt_total ?? order.amount),
      profit: null,
      profitStatus: "Estimated" as const,
      status: String(order.status_norm || order.status || "Recorded"),
      refunded: /refund|return|void|chargeback/i.test(String(order.status_norm || order.status || "")),
      offerId: String(order.offer_id || order.everflow_offer_id || ""),
      offerName: String(order.offer_name || order.offer_id || order.everflow_offer_id || "Offer"),
      trackingHealth: "Unknown" as CustomerTrackingState,
    })),
    offers: Array.from(offersById.values()),
    privacySignals: [],
    trackingExplanation: String(body?.customer_360?.operational_health?.explanation || "Customer evidence loaded from the TraceKit Customer Explorer."),
  };
}

export class ApiCustomerRepository implements CustomerRepository {
  async listCustomers(scope: CustomerScope, filter: CustomerListFilter = {}): Promise<CustomerSummary[]> {
    if (!scope.authenticated) return [];
    const params = new URLSearchParams({ limit: "25" });
    if (filter.query) params.set("search", filter.query);
    if (filter.offerId) params.set("offer_id", filter.offerId);
    const body = await apiGet(`/api/customers?${params.toString()}`);
    const organizationId = String(scope.mockOrganizationId || "");
    let values: CustomerSummary[] = (Array.isArray(body?.customers) ? body.customers : []).map((row: any) => customerSummaryFromList(row, organizationId));
    if (filter.state === "repeat") values = values.filter((customer) => customer.repeat);
    if (filter.state === "refunded") values = values.filter((customer) => customer.refunded);
    if (filter.state === "interference") values = values.filter((customer) => customer.interferenceLikely);
    return values;
  }

  async resolveCustomer(scope: CustomerScope, customerId: string) {
    if (!scope.authenticated || !customerId) return null;
    try {
      const body = await apiGet(`/api/customers/${encodeURIComponent(customerId)}`);
      return {
        organizationId: String(scope.mockOrganizationId || ""),
        businessContextId: null,
        customerId: String(body?.customer?.id || customerId),
      };
    } catch {
      return null;
    }
  }

  async loadWorkspace(scope: CustomerScope, customerId: string) {
    if (!scope.authenticated || !customerId) return null;
    const body = await apiGet(`/api/customers/${encodeURIComponent(customerId)}`);
    return snapshotFromDetail(body, String(scope.mockOrganizationId || ""));
  }

  async loadJourney(scope: CustomerScope, customerId: string) {
    return (await this.loadWorkspace(scope, customerId))?.journey || [];
  }

  async loadDrawer(_scope: CustomerScope, _customerId: string, _drawerId: string): Promise<CustomerDrawerRecord | null> {
    return null;
  }

  async search(scope: CustomerScope, query: string): Promise<CustomerSearchResult[]> {
    const customers: CustomerSummary[] = await this.listCustomers(scope, { query });
    return customers.slice(0, 12).map((customer: CustomerSummary) => ({
      id: `customer:${customer.id}`,
      type: "Customer",
      title: customer.name,
      subtitle: customer.id,
      value: `${customer.email} ${customer.phone}`,
      href: withDevelopmentIdentity(customerDeepLinkHref({ customerId: customer.id }), scope.identity.id),
    }));
  }

  async resolveDeepLink(scope: CustomerScope, state: CustomerDeepLinkState) {
    const list = await this.listCustomers(scope, { offerId: state.offerId });
    const snapshot = state.customerId ? await this.loadWorkspace(scope, state.customerId) : null;
    return normalizeCustomerDeepLink(state, list, snapshot);
  }
}

export const apiCustomerRepository: CustomerRepository = new ApiCustomerRepository();