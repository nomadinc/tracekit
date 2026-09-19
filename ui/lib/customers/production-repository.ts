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
function mapEvent(row: any, identity: any): CustomerJourneyEvent {
  const tech = row?.technical_evidence || row?.technical || {};
  const display = row?.display_fields || {};
  const explanation = row?.explanation || {};
  const identifiers = Array.isArray(identity?.identifiers) ? identity.identifiers.map((i: any) => ({
    id: String(i.id || i.type || "identifier"),
    type: String(i.type || i.identifier_type || "Identifier"),
    value: String(i.normalized_value || i.raw_value || i.value || ""),
    status: i.status === "historical" ? "Recovered" as const : "Observed" as const,
    eventId: String(row?.id || ""),
  })) : [];
  return {
    id: String(row?.id || ""),
    name: String(row?.title || eventName(row?.event_type || row?.activity_type)),
    timestamp: when(row?.occurred_at || row?.event_time),
    domain: String(row?.source_platform || tech?.source_platform || "TraceKit"),
    role: String(row?.category || row?.event_type || row?.activity_type || "evidence"),
    status: row?.system_derived ? "Derived" : "Observed",
    confidence: explanation?.reason_is_stored ? "Stored conclusion" : row?.system_derived ? "Derived from retained evidence" : "Observed evidence",
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
      ...(tech?.journey_id ? [{ type: "Journey", id: String(tech.journey_id), label: String(tech.journey_id) }] : []),
    ],
    explanation: {
      conclusion: String(row?.summary || row?.title || "Evidence recorded."),
      reason: String(explanation?.reason || explanation?.fallback_reason || "Retained production evidence."),
      evidence: Object.entries(tech).filter(([,v]) => v !== null && v !== undefined && typeof v !== "object").map(([k,v]) => `${k}: ${String(v)}`).slice(0, 12),
    },
  };
}
function orderTrackingEvidence(row: any) {
  return {
    tkid: row?.tkid ? String(row.tkid) : null,
    everflowTransactionId: row?.everflow_transaction_id ? String(row.everflow_transaction_id) : null,
    transactionId: row?.transaction_id ? String(row.transaction_id) : null,
    affiliateId: row?.affiliate_id ? String(row.affiliate_id) : null,
    sourceId: row?.source_id ? String(row.source_id) : null,
    sub1: row?.sub1 ? String(row.sub1) : null,
    sub2: row?.sub2 ? String(row.sub2) : null,
    sub3: row?.sub3 ? String(row.sub3) : null,
    sub4: row?.sub4 ? String(row.sub4) : null,
    sub5: row?.sub5 ? String(row.sub5) : null,
  };
}
function hasTrackingEvidence(row: any) {
  const evidence = orderTrackingEvidence(row);
  return Boolean(evidence.tkid || evidence.everflowTransactionId || evidence.affiliateId || evidence.sourceId || evidence.sub1 || evidence.sub2 || evidence.sub3 || evidence.sub4 || evidence.sub5);
}
function orderRow(row: any) {
  const id = String(row?.platform_order_id || row?.order_id || "");
  const trackingEvidence = orderTrackingEvidence(row);
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
    trackingHealth: hasTrackingEvidence(row) ? "Healthy" as const : "Incomplete" as const,
    trackingEvidence,
  };
}
function orderEvidenceEvent(row: any): CustomerJourneyEvent {
  const evidence = orderTrackingEvidence(row);
  const evidenceLines = [
    evidence.everflowTransactionId ? `Everflow transaction ID: ${evidence.everflowTransactionId}` : null,
    evidence.tkid ? `TKID: ${evidence.tkid}` : null,
    evidence.affiliateId ? `Affiliate ID: ${evidence.affiliateId}` : null,
    evidence.sourceId ? `Source ID: ${evidence.sourceId}` : null,
    ...(["sub1","sub2","sub3","sub4","sub5"] as const).map((key) => evidence[key] ? `${key}: ${evidence[key]}` : null),
    row?.transaction_id ? `Commerce transaction ID: ${String(row.transaction_id)}` : null,
  ].filter((value): value is string => Boolean(value));
  return {
    id: `order-evidence-${String(row?.platform_order_id || row?.order_id || "unknown")}`,
    name: "Purchase observed",
    timestamp: when(row?.created_at),
    domain: String(row?.platform || "Commerce"),
    role: "commerce",
    status: "Observed",
    confidence: "Observed provider evidence",
    trackingHealth: evidenceLines.length ? "Healthy" : "Incomplete",
    trackingStatus: evidenceLines.length ? "Tracking identifiers retained" : "Tracking identifiers missing",
    originalUrl: "",
    referrer: "",
    destinationUrl: "",
    queryParameters: {},
    identifiers: [],
    redirects: [],
    diagnostics: evidenceLines.length ? [{ label: "Order-level tracking evidence", result: "Observed" }] : [{ label: "Order-level tracking evidence", result: "Missing" }],
    relationships: [{ type: "Order", id: String(row?.platform_order_id || row?.order_id || ""), label: String(row?.order_id || row?.platform_order_id || "Order") }],
    explanation: {
      conclusion: `Commerce order ${String(row?.order_id || row?.platform_order_id || "")} was observed.`,
      reason: evidenceLines.length ? "The commerce record retains acquisition/tracking identifiers even though a canonical Journey has not yet been materialized." : "The commerce record is linked to this customer, but no acquisition/tracking identifiers were retained on this order.",
      evidence: evidenceLines.length ? evidenceLines : ["Linked by the production Customer Explorer commerce relationship."],
    },
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
      has_attribution: n(detail.summary?.attributed_revenue) > 0,
      identity_status: detail.summary?.identity_status,
      source_systems: detail.summary?.source_systems || [],
    };
    const customer = summary(listLike, scope);
    const activity = Array.isArray(journeyDetail?.activity) ? journeyDetail.activity : Array.isArray(journeyDetail?.events) ? journeyDetail.events : [];
    const canonicalStory = activity.map((row: any) => mapEvent(row, journeyDetail?.identity_context));
    const rawOrders = Array.isArray(detail.orders) ? detail.orders : [];
    const story = canonicalStory.length ? canonicalStory : rawOrders.map(orderEvidenceEvent).sort((a: CustomerJourneyEvent, b: CustomerJourneyEvent) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    const orders = rawOrders.map(orderRow);
    const trackedOrders = rawOrders.filter(hasTrackingEvidence);
    const acquisition = detail.customer_360?.acquisition || {};
    const firstTrackedOrder = rawOrders.find(hasTrackingEvidence);
    const firstSource = acquisition?.first_attributed_source?.source || acquisition?.first_attributed_source?.affiliate_id || firstTrackedOrder?.affiliate_id || firstTrackedOrder?.source_id;
    customer.trackingHealth = canonicalStory.length ? customer.trackingHealth : trackedOrders.length ? "Incomplete" : "Unknown";
    return {
      customer,
      lifetimeRevenue: n(detail.summary?.lifetime_revenue),
      customerSince: when(detail.summary?.first_seen_at),
      firstTouch: firstSource ? String(firstSource) : "No retained attribution conclusion",
      lastPurchase: orders[0]?.date || "No linked purchase",
      journeyId: String(selectedJourney?.id || "Not materialized"),
      journey: story,
      orders,
      offers: [],
      privacySignals: [],
      trackingExplanation: canonicalStory.length
        ? "Canonical Journey evidence is available. Inspect an event to review retained evidence."
        : trackedOrders.length
          ? `Canonical Journey not yet materialized. ${trackedOrders.length} of ${rawOrders.length} linked order(s) retain acquisition/tracking identifiers; the Customer Story is showing observed commerce evidence without inventing a canonical Journey.`
          : detail.customer_360?.evidence_limits?.length
            ? String(detail.customer_360.evidence_limits.join(" "))
            : "No canonical Journey or retained order-level acquisition evidence is available for this customer.",
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
    if (kind === "order") {
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
        facts: [
          { label: "Canonical Journey", value: snapshot.journeyId },
          { label: "Linked orders", value: String(snapshot.orders.length) },
          { label: "Orders with tracking evidence", value: String(snapshot.orders.filter((order) => order.trackingHealth === "Healthy").length) },
        ],
        evidence: Array.from(new Set(snapshot.orders.flatMap((order) => {
          const e = order.trackingEvidence;
          if (!e) return [];
          return [
            e.everflowTransactionId ? `Everflow transaction ID: ${e.everflowTransactionId}` : null,
            e.tkid ? `TKID: ${e.tkid}` : null,
            e.affiliateId ? `Affiliate ID: ${e.affiliateId}` : null,
            e.sourceId ? `Source ID: ${e.sourceId}` : null,
            e.sub1 ? `sub1: ${e.sub1}` : null,
            e.sub2 ? `sub2: ${e.sub2}` : null,
            e.sub3 ? `sub3: ${e.sub3}` : null,
            e.sub4 ? `sub4: ${e.sub4}` : null,
            e.sub5 ? `sub5: ${e.sub5}` : null,
          ].filter((value): value is string => Boolean(value));
        }))).slice(0, 24).concat(snapshot.journeyId === "Not materialized" ? ["Canonical Journey has not yet been materialized; retained commerce evidence is shown separately and is not promoted to a Journey conclusion."] : []),
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
