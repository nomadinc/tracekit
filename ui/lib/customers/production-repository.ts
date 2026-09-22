import type { CustomerRepository } from "./repository";
import type {
  CustomerDeepLinkState,
  CustomerDrawerRecord,
  CustomerJourneyEvent,
  CustomerListFilter,
  CustomerSearchResult,
  CustomerSummary,
  CustomerWorkspaceSnapshot,
  ProductionCustomerScope,
} from "./types";

async function readJson(res: Response) {
  const text = await res.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text.slice(0, 300) }; }
  if (!res.ok) throw new Error(body?.message || body?.error || `Customer request failed (${res.status})`);
  return body;
}
async function get(path: string) {
  return readJson(await fetch(path, { method: "GET", cache: "no-store", headers: { accept: "application/json" } }));
}
const n = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const when = (value: unknown) => {
  const text = String(value || "").trim();
  if (!text) return "Not observed";
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : text;
};
const eventName = (value: unknown) => String(value || "event").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const qs = (scope: ProductionCustomerScope, extra: Record<string, unknown> = {}) => {
  const params = new URLSearchParams({ workspace_id: scope.workspaceId });
  for (const [key, value] of Object.entries(extra)) if (value !== null && value !== undefined && value !== "") params.set(key, String(value));
  return params.toString();
};
function summary(row: any, scope: ProductionCustomerScope): CustomerSummary {
  const c = row?.customer || {};
  const source = row?.attributed_source?.affiliate_id ? `Affiliate ${row.attributed_source.affiliate_id}` : row?.attributed_source?.source || row?.source_systems?.[0] || "No retained acquisition source";
  return {
    id: String(c.id || ""),
    organizationId: scope.organizationId || "",
    offerIds: [],
    name: String(c.display_name || c.primary_email || c.primary_phone || c.id || "Unresolved customer"),
    email: String(c.primary_email || ""),
    phone: String(c.primary_phone || ""),
    sensitiveMasked: false,
    profit: 0,
    profitStatus: "Estimated",
    profitAvailable: false,
    lastActivity: when(row?.last_activity_at),
    status: String(row?.identity_status || c.status || "Unknown"),
    trackingHealth: row?.has_attribution ? "Healthy" : "Incomplete",
    repeat: Number(row?.order_count || 0) > 1,
    refunded: false,
    interferenceLikely: false,
    journeyPreview: `${Number(row?.journey_count || 0)} journey(s) · ${Number(row?.order_count || 0)} order(s) · ${source}`,
  };
}
function mapEvent(row: any, identity: any, credits: any[] = [], orders: any[] = []): CustomerJourneyEvent {
  const tech = row?.technical_evidence || row?.technical || {};
  const display = row?.display_fields || {};
  const explanation = row?.explanation || {};
  const attributionEvidence = [
    row?.transaction_id ? `Transaction ID: ${row.transaction_id}` : null,
    row?.affiliate_id ? `Affiliate ID: ${row.affiliate_id}` : null,
    row?.offer_id ? `Offer ID: ${row.offer_id}` : null,
    row?.source ? `Source: ${row.source}` : null,
    row?.medium ? `Medium: ${row.medium}` : null,
  ].filter((value): value is string => Boolean(value));
  const eventId = String(row?.id || "");
  const eventType = String(row?.event_type || row?.activity_type || "").toLowerCase();
  const matchingCredits = credits.filter((credit: any) => String(credit?.touchpoint_event_id || "") === eventId || String(credit?.conversion_event_id || "") === eventId);
  const attributedCredit = matchingCredits.find((credit: any) => credit?.status === "attributed");
  const relatedOrder = eventType === "purchase" ? orders.find((order: any) => {
    const orderTime = Date.parse(String(order?.created_at || ""));
    const eventTime = Date.parse(String(row?.event_time || row?.occurred_at || ""));
    return Number.isFinite(orderTime) && Number.isFinite(eventTime) && Math.abs(orderTime - eventTime) <= 5000;
  }) : null;
  const eventAmount = n(row?.amount);
  const sourceLabel = String(row?.source_platform || tech?.source_platform || "TraceKit");
  const affiliate = row?.affiliate_id || attributedCredit?.affiliate_id;
  const offer = row?.offer_id || attributedCredit?.offer_id;
  const name = eventType === "click"
    ? `${sourceLabel === "everflow" ? "Everflow " : ""}Affiliate Click`
    : eventType === "purchase"
      ? `Purchase${eventAmount ? ` · ${eventAmount.toFixed(0)}` : ""}`
      : String(row?.title || eventName(eventType));
  const identifiers = Array.isArray(identity?.identifiers) ? identity.identifiers.map((i: any) => ({
    id: String(i.id || i.type || "identifier"),
    type: String(i.type || i.identifier_type || "Identifier"),
    value: String(i.normalized_value || i.raw_value || i.value || ""),
    status: i.status === "historical" ? "Recovered" as const : "Observed" as const,
    eventId: String(row?.id || ""),
  })) : [];
  return {
    id: eventId,
    name,
    timestamp: when(row?.occurred_at || row?.event_time),
    domain: String(row?.source_platform || tech?.source_platform || "TraceKit"),
    role: String(row?.category || row?.event_type || row?.activity_type || "evidence"),
    status: row?.system_derived ? "Derived" : "Observed",
    confidence: attributedCredit ? `Attributed${affiliate ? ` · Affiliate ${affiliate}` : ""}${offer ? ` · Offer ${offer}` : ""}` : relatedOrder ? `Commas · Order ${relatedOrder.order_id || relatedOrder.platform_order_id || ""}` : explanation?.reason_is_stored ? "Stored conclusion" : row?.system_derived ? "Derived from retained evidence" : "Observed evidence",
    trackingHealth: "Unknown",
    trackingStatus: String(row?.system_derived ? "Derived" : "Observed"),
    originalUrl: String(display?.url || row?.url || ""),
    referrer: "",
    destinationUrl: "",
    queryParameters: {},
    identifiers,
    redirects: [],
    diagnostics: [],
    relationships: [
      ...(row?.related_order_id ? [{ type: "Order", id: String(row.related_order_id), label: String(row.related_order_id) }] : []),
      ...(relatedOrder ? [{ type: "Order", id: String(relatedOrder.platform_order_id || relatedOrder.order_id), label: String(relatedOrder.order_id || relatedOrder.platform_order_id) }] : []),
      ...(tech?.journey_id ? [{ type: "Journey", id: String(tech.journey_id), label: String(tech.journey_id) }] : []),
    ],
    explanation: {
      conclusion: String(row?.summary || row?.title || "Evidence recorded."),
      reason: String(explanation?.reason || explanation?.fallback_reason || "Retained production evidence."),
      evidence: [...attributionEvidence, ...Object.entries(tech).filter(([,v]) => v !== null && v !== undefined && typeof v !== "object").map(([k,v]) => `${k}: ${String(v)}`)].slice(0, 12),
    },
  };
}
function orderRow(row: any) {
  const id = String(row?.order_id || row?.platform_order_id || "");
  return {
    id,
    number: String(row?.order_id || row?.platform_order_id || "Order"),
    date: when(row?.created_at),
    amount: n(row?.amount),
    profit: null,
    profitStatus: "Estimated" as const,
    profitAvailable: false,
    status: String(row?.status || "Unknown"),
    refunded: /refund|return|void|chargeback/i.test(String(row?.status || "")),
    offerId: String(row?.offer_id || ""),
    offerName: row?.offer_id ? `Offer ${row.offer_id}` : "Offer evidence unavailable",
    trackingHealth: "Unknown" as const,
  };
}

export class ProductionCustomerRepository implements CustomerRepository<ProductionCustomerScope> {
  async listCustomers(scope: ProductionCustomerScope, filter: CustomerListFilter = {}) {
    if (!scope.authenticated) return [];
    const body = await get(`/api/customers?${qs(scope, { search: filter.query, limit: 50 })}`);
    let rows = (body.customers || []).map((row: any) => summary(row, scope));
    if (filter.state === "repeat") rows = rows.filter((row: CustomerSummary) => row.repeat);
    return rows;
  }
  async resolveCustomer(scope: ProductionCustomerScope, customerId: string) {
    if (!scope.authenticated || !customerId) return null;
    try {
      await get(`/api/customers/${encodeURIComponent(customerId)}?${qs(scope)}`);
      return { organizationId: scope.organizationId || "", businessContextId: scope.businessContextId, customerId };
    } catch { return null; }
  }
  async loadWorkspace(scope: ProductionCustomerScope, customerId: string): Promise<CustomerWorkspaceSnapshot | null> {
    if (!scope.authenticated || !customerId) return null;
    const detail = await get(`/api/customers/${encodeURIComponent(customerId)}?${qs(scope)}`);
    const journeys = Array.isArray(detail.journeys) ? detail.journeys : [];
    const selectedJourney = journeys[0] || null;
    let journeyDetail: any = null;
    if (selectedJourney?.id) journeyDetail = await get(`/api/customers/${encodeURIComponent(customerId)}/journeys/${encodeURIComponent(selectedJourney.id)}?${qs(scope, { limit: 100 })}`);
    const listLike = {
      customer: detail.customer,
      last_activity_at: detail.summary?.last_seen_at,
      journey_count: detail.summary?.total_journeys,
      order_count: detail.summary?.total_orders,
      has_attribution: Array.isArray(detail.attribution) && detail.attribution.some((credit: any) => credit?.status === "attributed"),
      identity_status: detail.customer?.id && (detail.customer?.primary_email || detail.customer?.primary_phone) ? (Number(detail.summary?.identity_link_count || 0) > 0 ? "Resolved" : "Known · limited identity evidence") : detail.summary?.identity_status,
      source_systems: detail.summary?.source_systems || [],
    };
    const customer = summary(listLike, scope);
    const activity = Array.isArray(journeyDetail?.activity) ? journeyDetail.activity : Array.isArray(journeyDetail?.events) ? journeyDetail.events : [];
    const timeline = Array.isArray(journeyDetail?.events) ? journeyDetail.events : [];
    const rawOrders = Array.isArray(detail.orders) ? detail.orders : [];
    const orders = rawOrders.map(orderRow);
    const acquisition = detail.customer_360?.acquisition || {};
    const attribution = Array.isArray(journeyDetail?.attribution) ? journeyDetail.attribution : [];
    const story = timeline.length ? timeline.map((row: any) => mapEvent(row, journeyDetail?.identity_context, attribution, rawOrders)) : activity.map((row: any) => mapEvent(row, journeyDetail?.identity_context, attribution, rawOrders));
    const firstCredit = attribution.find((credit: any) => credit?.status === "attributed" && credit?.model === "first_touch") || attribution.find((credit: any) => credit?.status === "attributed");
    const firstSource = acquisition?.first_attributed_source?.source || acquisition?.first_attributed_source?.affiliate_id || firstCredit?.source || firstCredit?.affiliate_id;
    const attributedOffer = firstCredit?.offer_id ? String(firstCredit.offer_id) : "";
    const enrichedOrders = orders.map((order: any) => ({
      ...order,
      offerName: order.offerId ? order.offerName : attributedOffer ? `Journey attributed to Offer ${attributedOffer} · not supplied on Order` : order.offerName,
    }));
    return {
      customer,
      lifetimeRevenue: n(detail.summary?.lifetime_revenue),
      customerSince: when(detail.summary?.first_seen_at),
      firstTouch: firstSource ? (firstCredit?.affiliate_id && !firstCredit?.source ? `Affiliate ${firstCredit.affiliate_id}${firstCredit.offer_id ? ` · Offer ${firstCredit.offer_id}` : ""}` : String(firstSource)) : "No retained attribution conclusion",
      lastPurchase: orders[0]?.date || "No linked purchase",
      journeyId: String(selectedJourney?.id || "No canonical journey"),
      journey: story,
      orders: enrichedOrders,
      offers: attributedOffer ? [{ id: attributedOffer, name: `Offer ${attributedOffer}`, firstTouch: firstCredit?.affiliate_id ? `Affiliate ${firstCredit.affiliate_id}` : "Attributed Journey" }] : [],
      privacySignals: [],
      trackingExplanation: detail.customer_360?.evidence_limits?.length
        ? String(detail.customer_360.evidence_limits.join(" "))
        : story.length ? "Production Journey evidence is available. Inspect an event to review retained evidence." : "No canonical Journey events are available for this customer.",
    };
  }
  async loadJourney(scope: ProductionCustomerScope, customerId: string) {
    return (await this.loadWorkspace(scope, customerId))?.journey || [];
  }
  async loadDrawer(scope: ProductionCustomerScope, customerId: string, drawerId: string): Promise<CustomerDrawerRecord | null> {
    const snapshot = await this.loadWorkspace(scope, customerId);
    if (!snapshot) return null;
    const [kind, key] = drawerId.split(":", 2);
    if (kind === "event" || kind === "journey-event") {
      const event = snapshot.journey.find((row) => row.id === key);
      if (!event) return null;
      return {
        id: drawerId, kind: "event", title: event.name,
        question: "What happened, and what retained production evidence supports it?",
        summary: event.explanation.conclusion,
        facts: [
          { label: "Timestamp", value: event.timestamp },
          { label: "Evidence state", value: event.status },
          { label: "Source", value: event.domain },
          { label: "Role", value: event.role },
        ],
        originalUrl: event.originalUrl || undefined,
        identifiers: event.identifiers,
        diagnostics: event.diagnostics,
        evidence: event.explanation.evidence.length ? event.explanation.evidence : [event.explanation.reason],
        relationships: event.relationships,
      };
    }
    if (kind === "order" || kind === "related-order") {
      const order = snapshot.orders.find((row) => row.id === key);
      if (!order) return null;
      return {
        id: drawerId, kind: "order", title: order.number,
        question: "Which commercial record is linked to this customer?",
        summary: `${order.status} · ${order.date}`,
        facts: [{ label: "Amount", value: String(order.amount) }, { label: "Profit", value: "Not asserted in Customer Workspace" }],
        evidence: ["Linked by the production Customer Explorer commerce relationship."],
        relationships: [{ type: "Customer", id: customerId, label: snapshot.customer.name }, { type: "Order", id: order.id, label: order.number }],
      };
    }
    if (drawerId === "tracking") {
      return {
        id: drawerId, kind: "tracking", title: "Tracking evidence",
        question: "What tracking evidence is available for this customer?",
        summary: snapshot.trackingExplanation,
        facts: [{ label: "Canonical Journey", value: snapshot.journeyId }],
        evidence: snapshot.journey.length ? ["Canonical Journey activity is retained and inspectable."] : ["No canonical Journey activity was returned."],
        relationships: [{ type: "Customer", id: customerId, label: snapshot.customer.name }],
      };
    }
    return null;
  }
  async search(scope: ProductionCustomerScope, query: string): Promise<CustomerSearchResult[]> {
    const rows = await this.listCustomers(scope, { query });
    return rows.map((row: CustomerSummary) => ({ id: row.id, type: "customer", title: row.name, subtitle: row.journeyPreview, value: row.id, href: `/customers?v=1&customer_id=${encodeURIComponent(row.id)}` }));
  }
  async resolveDeepLink(_scope: ProductionCustomerScope, state: CustomerDeepLinkState) { return state; }
}
export const productionCustomerRepository = new ProductionCustomerRepository();
