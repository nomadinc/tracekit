import { readJourneyPages } from "@/lib/reporting/journey-pages";
import { observedAmount, formatObservedMoney } from "@/lib/reporting/observed-money";
import { exactRelatedOrder } from "@/lib/reporting/order-relationship";
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
  if (!res.ok || body?.ok === false) throw new Error(body?.message || body?.error || `Customer request failed (${res.status})`);
  return body;
}
function coreBase(){return String(process.env.TRACEKIT_API_BASE_URL||process.env.NEXT_PUBLIC_API_BASE_URL||process.env.NEXT_PUBLIC_API_BASE||"http://127.0.0.1:8787").replace(/\/+$/,"");}
function coreSecret(){return String(process.env.TK_SECRET_KEY||process.env.TRACEKIT_TK_SECRET||"").trim();}
function coreFailure(status:number){return new Error(`customer_repository_core_http_${status}`);}
async function get(path:string,scope?:ProductionCustomerScope){
  if(typeof window!=="undefined")return readJson(await fetch(path,{method:"GET",cache:"no-store",headers:{accept:"application/json"}}));
  if(!scope?.authenticated||!scope.organizationId)throw new Error("customer_repository_scope_unavailable");
  const secret=coreSecret();if(!secret)throw new Error("customer_repository_core_auth_unavailable");
  const incoming=new URL(path,"http://tracekit.internal"),params=new URLSearchParams(incoming.searchParams);
  params.set("workspace_id",scope.organizationId);
  const internalPath=incoming.pathname.replace(/^\/api\/customers/,"/v1/customers");
  let res:Response;try{res=await fetch(`${coreBase()}${internalPath}?${params.toString()}`,{method:"GET",cache:"no-store",headers:{accept:"application/json","x-tk-secret":secret}});}catch{throw new Error("customer_repository_core_fetch_failed");}if(!res.ok)throw coreFailure(res.status);return readJson(res);
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
  const params = new URLSearchParams({ workspace_id: scope.workspaceId, ...(scope.businessContextId ? { business_context_id: scope.businessContextId } : {}), ...(scope.journeyId ? { journey_id: scope.journeyId } : {}) });
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
function mapEvent(row: any, identity: any, credits: any[] = [], orders: any[] = [], organizationId = ""): CustomerJourneyEvent {
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
  const hasCoreProof = Object.prototype.hasOwnProperty.call(row, "commerce");
  const proof = Array.isArray(row.commerce) && row.commerce.length === 1 ? row.commerce[0] : null;
  const ownedProof = proof && proof.organization_id === organizationId && proof.workspace_id === organizationId ? proof : null;
  const relatedOrder = eventType === "purchase" ? exactRelatedOrder(row, hasCoreProof ? ownedProof ? [ownedProof] : [] : orders) : null;
  const commerce = relatedOrder;
  const unavailable = (v: unknown) => v === null || v === undefined || v === "" ? "Unavailable" : String(v);
  const money = (v: unknown) => observedAmount(v) === null ? "Unavailable" : formatObservedMoney(Number(v), commerce?.currency);
  const commerceFacts = eventType === "purchase" ? [
    {label:"Canonical event",value:unavailable(row.id)}, {label:"Canonical Journey",value:unavailable(row.journey_id)},
    {label:"Canonical Order",value:unavailable(commerce?.canonical_order_id)}, {label:"Provider Order",value:unavailable(commerce?.platform_order_id)},
    {label:"Purchase amount",value:money(commerce?.amount ?? row.amount)}, {label:"Payment status",value:unavailable(commerce?.status)},
    {label:"Payment reference",value:unavailable(commerce?.payment_reference)}, {label:"Transaction",value:unavailable(commerce?.transaction_id)},
    {label:"TKID",value:unavailable(commerce?.tkid)}, {label:"Everflow transaction",value:unavailable(commerce?.everflow_transaction_id)},
    {label:"Source evidence",value:unavailable(commerce?.evidence_id)}, {label:"Acquisition",value:attributedCredit ? "Attributed" : "Unmatched"},
    ...(commerce?.order_lines || []).flatMap((line: any) => [
      {label:"Product",value:unavailable(line.product_name)}, {label:"SKU",value:unavailable(line.sku)},
      {label:"Product / variant",value:`${unavailable(line.provider_product_id)} / ${unavailable(line.provider_variant_id)}`},
      {label:"Quantity",value:unavailable(line.quantity)}, {label:"Unit price",value:money(line.unit_amount)}, {label:"Line total",value:money(line.gross_amount)},
      {label:"Canonical line",value:unavailable(line.id)}, {label:"Line evidence",value:unavailable(line.evidence_id)},
    ]),
  ] : [];
  const eventAmount = observedAmount(commerce?.amount ?? row?.amount);
  const sourceLabel = String(row?.source_platform || tech?.source_platform || "TraceKit");
  const affiliate = row?.affiliate_id || attributedCredit?.affiliate_id;
  const offer = row?.offer_id || attributedCredit?.offer_id;
  const name = eventType === "click"
    ? `${sourceLabel === "everflow" ? "Everflow " : ""}Affiliate Click`
    : eventType === "purchase"
      ? `Purchase${eventAmount !== null ? ` · ${formatObservedMoney(eventAmount, row?.currency)}` : ""}`
      : String(row?.title || eventName(eventType));
  const identifiers = Array.isArray(identity?.identifiers) ? identity.identifiers.map((i: any) => ({
    id: String(i.id || i.type || "identifier"),
    type: String(i.type || i.identifier_type || "Identifier"),
    value: String(i.normalized_value || i.raw_value || i.value || ""),
    status: i.status === "historical" ? "Recovered" as const : "Observed" as const,
    eventId: String(row?.id || ""),
  })) : [];
  return {
    commerceFacts,
    id: eventId,
    name,
    timestamp: when(row?.occurred_at || row?.event_time),
    domain: String(row?.source_platform || tech?.source_platform || "TraceKit"),
    role: String(row?.category || row?.event_type || row?.activity_type || "evidence"),
    status: row?.system_derived ? "Derived" : "Observed",
    confidence: attributedCredit ? `Attributed${affiliate ? ` · Affiliate ${affiliate}` : ""}${offer ? ` · Offer ${offer}` : ""}` : relatedOrder ? `${relatedOrder.platform || "Commerce"} · Order ${relatedOrder.order_id || relatedOrder.platform_order_id || ""}` : explanation?.reason_is_stored ? "Stored conclusion" : row?.system_derived ? "Derived from retained evidence" : "Observed evidence",
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
      ...(relatedOrder ? [{ type: "Order", id: String(relatedOrder.platform_order_id || relatedOrder.order_id), label: String(relatedOrder.order_id || relatedOrder.platform_order_id) }] : []),
      ...((row.journey_id || tech?.journey_id) ? [{ type: "Journey", id: String(row.journey_id || tech.journey_id), label: String(row.journey_id || tech.journey_id) }] : []),
    ],
    explanation: {
      conclusion: String(row?.summary || row?.title || "Evidence recorded."),
      reason: String(explanation?.reason || explanation?.fallback_reason || "Retained production evidence."),
      evidence: [...attributionEvidence, ...Object.entries(tech).filter(([,v]) => v !== null && v !== undefined && typeof v !== "object").map(([k,v]) => `${k}: ${String(v)}`)].slice(0, 12),
    },
  };
}
function orderRow(row: any) {
  const id = String(row?.platform_order_id || row?.order_id || "");
  return {
    id,
    number: String(row?.order_id || row?.platform_order_id || "Order"),
    date: when(row?.created_at),
    amount: observedAmount(row?.amount),
    amountAvailable: observedAmount(row?.amount) !== null,
    currency: row?.currency || null,
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
    let cursor: string | null = null;
    const cursors = new Set<string>();
    const customers = new Map<string, CustomerSummary>();
    do {
      const body = await get(`/api/customers?${qs(scope, { search: filter.query, limit: 50, cursor })}`,scope);
      if (body.ok === false || !Array.isArray(body.customers)) throw new Error("Customer list is unavailable.");
      for (const row of body.customers) {
        const customer = summary(row, scope);
        if (!customer.id) throw new Error("Customer list is unavailable.");
        if (!customers.has(customer.id)) customers.set(customer.id, customer);
      }
      if (!body.has_more) break;
      if (typeof body.next_cursor !== "string" || !body.next_cursor || cursors.has(body.next_cursor)) {
        throw new Error("Customer pagination is unavailable.");
      }
      const nextCursor: string = body.next_cursor;
      cursor = nextCursor;
      cursors.add(nextCursor);
    } while (cursor !== null);
    let rows = Array.from(customers.values());
    if (filter.state === "repeat") rows = rows.filter((row: CustomerSummary) => row.repeat);
    return rows;
  }
  async resolveCustomer(scope: ProductionCustomerScope, customerId: string) {
    if (!scope.authenticated || !customerId) return null;
    try {
      await get(`/api/customers/${encodeURIComponent(customerId)}?${qs(scope)}`,scope);
      return { organizationId: scope.organizationId || "", businessContextId: scope.businessContextId, customerId };
    } catch { return null; }
  }
  async loadWorkspace(scope: ProductionCustomerScope, customerId: string): Promise<CustomerWorkspaceSnapshot | null> {
    if (!scope.authenticated || !customerId) return null;
    const detail = await get(`/api/customers/${encodeURIComponent(customerId)}?${qs(scope)}`,scope);
    if (String(detail.customer?.id || "") !== customerId) return null;
    const journeys = Array.isArray(detail.journeys) ? detail.journeys : [];
    const selectedJourney = detail.canonical_journey_id ? {id:detail.canonical_journey_id} : null;
    if (scope.journeyId && selectedJourney?.id !== scope.journeyId) throw new Error("Journey is unavailable.");
    let journeyDetail: any = null;
    if (selectedJourney?.id) journeyDetail = await readJourneyPages((cursor) => get(`/api/customers/${encodeURIComponent(customerId)}/journeys/${encodeURIComponent(selectedJourney.id)}?${qs(scope, { limit: 100, cursor })}`,scope));
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
    const story = timeline.length ? timeline.map((row: any) => mapEvent(row, journeyDetail?.identity_context, attribution, rawOrders, scope.organizationId || "")) : activity.map((row: any) => mapEvent(row, journeyDetail?.identity_context, attribution, rawOrders, scope.organizationId || ""));
    const firstCredit = attribution.find((credit: any) => credit?.status === "attributed" && credit?.model === "first_touch") || attribution.find((credit: any) => credit?.status === "attributed");
    const firstSource = acquisition?.first_attributed_source?.source || acquisition?.first_attributed_source?.affiliate_id || firstCredit?.source || firstCredit?.affiliate_id;
    const attributedOffer = firstCredit?.offer_id ? String(firstCredit.offer_id) : "";
    const enrichedOrders = orders.map((order: any) => ({
      ...order,
      offerName: order.offerId ? order.offerName : attributedOffer ? `Journey attributed to Offer ${attributedOffer} · not supplied on Order` : order.offerName,
    }));
    return {
      customer,
      lifetimeRevenue: observedAmount(detail.summary?.lifetime_revenue),
      lifetimeRevenueAvailable: observedAmount(detail.summary?.lifetime_revenue) !== null
        && rawOrders.length > 0 && rawOrders.every((row: any) => row.currency && observedAmount(row.amount) !== null)
        && new Set(rawOrders.map((row: any) => row.currency)).size === 1,
      revenueCurrency: detail.summary?.revenue_currency || null,
      customerSince: when(detail.summary?.first_seen_at),
      firstTouch: firstSource ? (firstCredit?.affiliate_id && !firstCredit?.source ? `Affiliate ${firstCredit.affiliate_id}${firstCredit.offer_id ? ` · Offer ${firstCredit.offer_id}` : ""}` : String(firstSource)) : "No retained attribution conclusion",
      lastPurchase: orders[0]?.date || "No linked purchase",
      journeyId: String(selectedJourney?.id || "No canonical journey"),
      availableJourneys: journeys.map((journey: any) => ({id:String(journey.id),label:when(journey.started_at)})),
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
    const separator = drawerId.indexOf(":");
    const kind = separator < 0 ? drawerId : drawerId.slice(0, separator);
    const key = separator < 0 ? "" : drawerId.slice(separator + 1);
    if (kind === "event" || kind === "journey-event") {
      const event = snapshot.journey.find((row) => row.id === key);
      if (!event) return null;
      return {
        id: drawerId, kind: "event", title: event.name,
        links: event.relationships.flatMap((relationship) => relationship.type === "Order" ? [{label:"Open Order",href:`/orders?v=1&order_id=${encodeURIComponent(relationship.id)}`}] : relationship.type === "Journey" ? [{label:"Open canonical Journey",href:`/customers?v=1&customer_id=${encodeURIComponent(customerId)}&journey_id=${encodeURIComponent(relationship.id)}&focus=journey`}] : []),
        question: "What happened, and what retained production evidence supports it?",
        summary: event.explanation.conclusion,
        facts: [
          ...(event.commerceFacts || []),
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
        facts: [{ label: "Amount", value: order.amountAvailable === false ? "Unavailable" : formatObservedMoney(order.amount, order.currency) }, { label: "Profit", value: "Not asserted in Customer Workspace" }],
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
