import { cleanText } from "./identity-normalization.ts";
import { normalizeJourneyMetadata, normalizeJourneyTimestamp } from "./journey-events.ts";
import { buildCustomer360 } from "./explanations.ts";
import { getWorkItemsForPerson } from "./work-items.ts";

export const CUSTOMER_EXPLORER_DEFAULT_LIMIT = 25;
export const CUSTOMER_EXPLORER_MAX_LIMIT = 50;
export const CUSTOMER_JOURNEY_EVENT_DEFAULT_LIMIT = 100;
export const CUSTOMER_JOURNEY_EVENT_MAX_LIMIT = 100;

const PEOPLE_SELECT = [
  "id",
  "workspace_id",
  "status",
  "display_name",
  "primary_email",
  "primary_phone",
  "first_name",
  "last_name",
  "first_seen_at",
  "last_seen_at",
  "created_at",
  "updated_at",
  "metadata",
].join(",");

const IDENTIFIER_SELECT = [
  "id",
  "workspace_id",
  "person_id",
  "identifier_type",
  "raw_value",
  "normalized_value",
  "source_platform",
  "source_record_type",
  "source_record_id",
  "source_connector_id",
  "verification_status",
  "confidence",
  "is_primary",
  "first_seen_at",
  "last_seen_at",
  "created_at",
  "updated_at",
  "metadata",
].join(",");

const IDENTITY_EVENT_SELECT = [
  "id",
  "workspace_id",
  "person_id",
  "candidate_person_ids",
  "resolution_action",
  "resolution_reason",
  "confidence",
  "source_platform",
  "source_record_type",
  "source_record_id",
  "created_at",
  "metadata",
].join(",");

const JOURNEY_SELECT = [
  "id",
  "workspace_id",
  "person_id",
  "started_at",
  "ended_at",
  "status",
  "entry_event_id",
  "conversion_event_id",
  "conversion_count",
  "purchase_count",
  "total_revenue",
  "event_count",
  "is_active",
  "boundary_version",
  "boundary_timeout_seconds",
  "attribution_window_config",
  "metadata",
  "created_at",
  "updated_at",
].join(",");

const JOURNEY_EVENT_SELECT = [
  "id",
  "workspace_id",
  "person_id",
  "journey_id",
  "platform_order_id",
  "session_id",
  "touchpoint_id",
  "event_type",
  "event_time",
  "source_platform",
  "source_connector",
  "source_record_id",
  "amount",
  "currency",
  "affiliate_id",
  "offer_id",
  "campaign_id",
  "source",
  "medium",
  "sub1",
  "sub2",
  "sub3",
  "sub4",
  "sub5",
  "transaction_id",
  "metadata",
  "created_at",
  "updated_at",
].join(",");

const PLATFORM_ORDER_SELECT = [
  "workspace_id",
  "person_id",
  "platform",
  "platform_order_id",
  "platform_store_id",
  "order_id",
  "order_ts",
  "status",
  "status_norm",
  "gross_amount",
  "receipt_total",
  "currency",
  "transaction_id",
  "everflow_transaction_id",
  "affiliate_id",
  "everflow_offer_id",
  "source_id",
  "sub1",
  "sub2",
  "sub3",
  "sub4",
  "sub5",
  "product_subtotal",
  "shipping_amount",
  "tax_amount",
  "customer_email",
  "customer_email_normalized",
  "commerce_reference",
  "raw_json",
  "created_at",
].join(",");

const ATTRIBUTION_SELECT = [
  "id",
  "workspace_id",
  "journey_id",
  "person_id",
  "conversion_event_id",
  "touchpoint_event_id",
  "conversion_event_time",
  "touchpoint_event_time",
  "model",
  "model_version",
  "touchpoint_eligibility_version",
  "status",
  "reason",
  "credit_fraction",
  "credit_percent",
  "credit_amount",
  "currency",
  "touchpoint_channel",
  "source",
  "medium",
  "campaign_id",
  "affiliate_id",
  "offer_id",
  "calculated_at",
  "metadata",
  "created_at",
].join(",");

const COMMISSION_SELECT = [
  "id",
  "workspace_id",
  "commission_event_id",
  "journey_attribution_credit_id",
  "journey_id",
  "person_id",
  "conversion_event_id",
  "touchpoint_event_id",
  "conversion_event_time",
  "touchpoint_event_time",
  "affiliate_id",
  "publisher_id",
  "offer_id",
  "campaign_id",
  "touchpoint_source",
  "touchpoint_medium",
  "model",
  "model_version",
  "credit_fraction",
  "credit_percent",
  "credit_amount",
  "attributed_amount",
  "currency",
  "commission_rate",
  "commission_amount",
  "status",
  "source",
  "source_credit_created_at",
  "generated_at",
  "policy_snapshot",
  "metadata",
  "created_at",
].join(",");

export type CustomerExplorerRouteMatch =
  | { kind: "customer_list" }
  | { kind: "customer_detail"; person_id: string }
  | { kind: "customer_journey_detail"; person_id: string; journey_id: string }
  | { kind: "method_not_allowed"; path: string; allowed_methods: string[] };

export type CustomerListCursor = {
  updated_at: string;
  id: string;
};

export type JourneyEventCursor = {
  event_time: string;
  id: string;
};

export type CustomerListParams = {
  workspace_id: string;
  search: string | null;
  limit: number;
  cursor: CustomerListCursor | null;
  from: string | null;
  to_exclusive: string | null;
  journey_status: string | null;
  has_purchase: boolean | null;
  has_attribution: boolean | null;
  has_commission: boolean | null;
  identity_status: string | null;
  source_platform: string | null;
  affiliate_id: string | null;
};

export type CustomerJourneyDetailParams = {
  workspace_id: string;
  person_id: string;
  journey_id: string;
  limit: number;
  cursor: JourneyEventCursor | null;
};

type ActivityCategory = "marketing" | "customer_action" | "identity" | "commerce" | "attribution" | "commission" | "system" | "exception";

type ActivityEntry = {
  id: string;
  category: ActivityCategory;
  activity_type: string;
  occurred_at: string | null;
  title: string;
  summary: string;
  source_platform: string | null;
  related_order_id: string | null;
  related_conversion_id: string | null;
  related_touchpoint_id: string | null;
  related_commission_id: string | null;
  related_credit_id: string | null;
  display_fields: Record<string, any>;
  explanation: Record<string, any>;
  technical_evidence: Record<string, any>;
  system_derived: boolean;
};

function nullableText(value: unknown) {
  return cleanText(value) || null;
}

function numericValue(value: unknown) {
  if (value === null || value === undefined || cleanText(value) === "") return 0;
  const parsed = Number(cleanText(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeLimit(value: unknown, fallback = CUSTOMER_EXPLORER_DEFAULT_LIMIT, max = CUSTOMER_EXPLORER_MAX_LIMIT) {
  const n = Math.floor(Number(value ?? fallback));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, n);
}

function parseBoolFilter(value: unknown): boolean | null {
  const text = cleanText(value).toLowerCase();
  if (!text) return null;
  if (["true", "1", "yes", "y"].includes(text)) return true;
  if (["false", "0", "no", "n"].includes(text)) return false;
  return null;
}

function normalizeDateParam(value: unknown, endExclusive = false) {
  const text = cleanText(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const date = new Date(`${text}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime())) return null;
    if (endExclusive) date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString();
  }
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function safeQueryText(value: unknown) {
  const text = cleanText(value).replace(/[(),]/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 160) : null;
}

function safeLikeTerm(value: unknown) {
  const text = safeQueryText(value);
  if (!text || text.length < 3) return null;
  return `%${text.slice(0, 120)}%`;
}

function digitsOnly(value: unknown) {
  return cleanText(value).replace(/[^\d]/g, "");
}

function normalizeSearchCandidates(search: string | null) {
  const text = cleanText(search);
  const lower = text.toLowerCase();
  const digits = digitsOnly(text);
  const phoneCandidates = Array.from(new Set([
    digits,
    digits.length === 10 ? `+1${digits}` : "",
    digits.length === 11 && digits.startsWith("1") ? `+${digits}` : "",
    text.startsWith("+") ? `+${digits}` : "",
  ].filter(Boolean)));
  return {
    text,
    lower,
    email: lower.includes("@") ? lower : null,
    phone_candidates: phoneCandidates,
    exact_candidates: Array.from(new Set([text, lower, ...phoneCandidates].filter(Boolean))),
    like: safeLikeTerm(text),
  };
}

function normalizedPath(path: string) {
  const trimmed = String(path || "").replace(/\/+$/, "");
  return trimmed || "/";
}

export function matchCustomerExplorerRoute(method: string, path: string): CustomerExplorerRouteMatch | null {
  const cleanPath = normalizedPath(path);
  const upperMethod = String(method || "GET").toUpperCase();
  if (cleanPath === "/v1/customers") {
    if (upperMethod === "GET") return { kind: "customer_list" };
    return { kind: "method_not_allowed", path: "/v1/customers", allowed_methods: ["GET"] };
  }

  const journeyMatch = cleanPath.match(/^\/v1\/customers\/([^/]+)\/journeys\/([^/]+)$/);
  if (journeyMatch) {
    if (upperMethod === "GET") {
      return {
        kind: "customer_journey_detail",
        person_id: decodeURIComponent(journeyMatch[1] || ""),
        journey_id: decodeURIComponent(journeyMatch[2] || ""),
      };
    }
    return { kind: "method_not_allowed", path: "/v1/customers/:person_id/journeys/:journey_id", allowed_methods: ["GET"] };
  }

  const detailMatch = cleanPath.match(/^\/v1\/customers\/([^/]+)$/);
  if (detailMatch) {
    if (upperMethod === "GET") return { kind: "customer_detail", person_id: decodeURIComponent(detailMatch[1] || "") };
    return { kind: "method_not_allowed", path: "/v1/customers/:person_id", allowed_methods: ["GET"] };
  }

  return null;
}

export function encodeCustomerListCursor(cursor: CustomerListCursor | null) {
  return cursor ? encodeURIComponent(JSON.stringify(cursor)) : null;
}

export function decodeCustomerListCursor(value: unknown): CustomerListCursor | null {
  const text = cleanText(value);
  if (!text) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(text));
    const updatedAt = normalizeDateParam(parsed?.updated_at);
    const id = cleanText(parsed?.id);
    return updatedAt && id ? { updated_at: updatedAt, id } : null;
  } catch {
    throw Object.assign(new Error("Invalid customer cursor."), { status: 400, code: "bad_request" });
  }
}

export function encodeJourneyEventCursor(cursor: JourneyEventCursor | null) {
  return cursor ? encodeURIComponent(JSON.stringify(cursor)) : null;
}

export function decodeJourneyEventCursor(value: unknown): JourneyEventCursor | null {
  const text = cleanText(value);
  if (!text) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(text));
    const eventTime = normalizeDateParam(parsed?.event_time);
    const id = cleanText(parsed?.id);
    return eventTime && id ? { event_time: eventTime, id } : null;
  } catch {
    throw Object.assign(new Error("Invalid journey event cursor."), { status: 400, code: "bad_request" });
  }
}

export function normalizeCustomerListParams(args: Record<string, unknown>): CustomerListParams {
  const from = normalizeDateParam(args.from);
  const toExclusive = normalizeDateParam(args.to, true);
  if (from && toExclusive && Date.parse(from) >= Date.parse(toExclusive)) {
    throw Object.assign(new Error("from must be before to."), { status: 400, code: "bad_request" });
  }
  return {
    workspace_id: cleanText(args.workspace_id || args.workspaceId) || "default",
    search: nullableText(args.search || args.q),
    limit: normalizeLimit(args.limit),
    cursor: decodeCustomerListCursor(args.cursor),
    from,
    to_exclusive: toExclusive,
    journey_status: nullableText(args.journey_status || args.journeyStatus),
    has_purchase: parseBoolFilter(args.has_purchase || args.hasPurchase),
    has_attribution: parseBoolFilter(args.has_attribution || args.hasAttribution),
    has_commission: parseBoolFilter(args.has_commission || args.hasCommission),
    identity_status: nullableText(args.identity_status || args.identityStatus),
    source_platform: nullableText(args.source || args.source_platform || args.sourcePlatform),
    affiliate_id: nullableText(args.affiliate_id || args.affiliateId || args.affiliate),
  };
}

export function normalizeCustomerJourneyDetailParams(args: Record<string, unknown>): CustomerJourneyDetailParams {
  const personId = cleanText(args.person_id || args.personId);
  const journeyId = cleanText(args.journey_id || args.journeyId);
  if (!personId || !journeyId) throw Object.assign(new Error("person_id and journey_id are required."), { status: 400, code: "bad_request" });
  return {
    workspace_id: cleanText(args.workspace_id || args.workspaceId) || "default",
    person_id: personId,
    journey_id: journeyId,
    limit: normalizeLimit(args.limit, CUSTOMER_JOURNEY_EVENT_DEFAULT_LIMIT, CUSTOMER_JOURNEY_EVENT_MAX_LIMIT),
    cursor: decodeJourneyEventCursor(args.cursor),
  };
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function mapBy<T>(rows: T[], key: (row: T) => string) {
  const map = new Map<string, T>();
  for (const row of rows) {
    const value = key(row);
    if (value) map.set(value, row);
  }
  return map;
}

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const value = key(row);
    if (!value) continue;
    const bucket = map.get(value) || [];
    bucket.push(row);
    map.set(value, bucket);
  }
  return map;
}

export function customerDisplayName(person: any, identifiers: any[] = []) {
  const first = cleanText(person?.first_name);
  const last = cleanText(person?.last_name);
  const name = cleanText(person?.display_name) || cleanText(`${first} ${last}`);
  if (name) return name;
  const primary = identifiers.find((identifier) => identifier.is_primary) || null;
  const email = cleanText(person?.primary_email) || cleanText(primary?.identifier_type === "email" ? primary.normalized_value || primary.raw_value : "");
  if (email) return email;
  const phone = cleanText(person?.primary_phone) || cleanText(primary?.identifier_type === "phone" ? primary.normalized_value || primary.raw_value : "");
  if (phone) return phone;
  const external = identifiers.find((identifier) => !["email", "phone"].includes(cleanText(identifier.identifier_type)));
  return cleanText(external?.normalized_value || external?.raw_value) || cleanText(person?.id) || "Unresolved customer";
}

function compactIdentifier(row: any) {
  return {
    id: row.id,
    type: row.identifier_type,
    raw_value: row.raw_value || null,
    normalized_value: row.normalized_value || null,
    source_platform: row.source_platform || null,
    source_record_type: row.source_record_type || null,
    source_record_id: row.source_record_id || null,
    source_connector_id: row.source_connector_id || null,
    verification_status: row.verification_status || null,
    confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
    is_primary: Boolean(row.is_primary),
    first_seen_at: row.first_seen_at || null,
    last_seen_at: row.last_seen_at || null,
    status: row.verification_status === "deprecated" ? "historical" : "active",
    link_reason: cleanText(row.metadata?.link_reason || row.metadata?.reason) || "Linked by Identity Engine",
  };
}

function compactPerson(person: any, identifiers: any[] = []) {
  return {
    id: person.id,
    workspace_id: person.workspace_id,
    status: person.status || "active",
    display_name: customerDisplayName(person, identifiers),
    primary_email: person.primary_email || null,
    primary_phone: person.primary_phone || null,
    first_name: person.first_name || null,
    last_name: person.last_name || null,
    first_seen_at: person.first_seen_at || person.created_at || null,
    last_seen_at: person.last_seen_at || person.updated_at || null,
    created_at: person.created_at || null,
    updated_at: person.updated_at || null,
    metadata: person.metadata || {},
  };
}

function compactJourney(row: any) {
  return {
    id: row.id,
    person_id: row.person_id,
    started_at: row.started_at,
    ended_at: row.ended_at,
    status: row.status,
    event_count: Number(row.event_count || 0),
    purchase_count: Number(row.purchase_count || 0),
    conversion_count: Number(row.conversion_count || 0),
    total_revenue: row.total_revenue === null || row.total_revenue === undefined ? "0" : String(row.total_revenue),
    is_active: Boolean(row.is_active),
    entry_event_id: row.entry_event_id || null,
    conversion_event_id: row.conversion_event_id || null,
    duration_seconds: durationSeconds(row.started_at, row.ended_at),
    metadata: normalizeJourneyMetadata(row.metadata),
  };
}

function compactOrder(row: any) {
  const raw = row.raw_json && typeof row.raw_json === "object" ? row.raw_json : {};
  const products = Array.isArray(raw.line_items)
    ? raw.line_items
    : Array.isArray(raw.items)
      ? raw.items
      : Array.isArray(raw.products)
        ? raw.products
        : [];
  return {
    platform: row.platform || null,
    platform_order_id: row.platform_order_id || null,
    order_id: row.order_id || null,
    transaction_id: row.transaction_id || null,
    commerce_reference: row.commerce_reference || null,
    created_at: row.order_ts || row.created_at || null,
    status: row.status_norm || row.status || null,
    raw_status: row.status || null,
    amount: row.gross_amount ?? row.receipt_total ?? null,
    currency: row.currency || null,
    customer_email: row.customer_email || row.customer_email_normalized || null,
    affiliate_id: row.affiliate_id || null,
    offer_id: row.everflow_offer_id || null,
    source_id: row.source_id || null,
    products: products.slice(0, 8).map((item: any) => ({
      name: nullableText(item?.name || item?.title || item?.product_name || item?.productName),
      sku: nullableText(item?.sku || item?.SKU || item?.product_sku || item?.productSku),
      quantity: item?.quantity ?? item?.qty ?? null,
    })),
  };
}

function compactAttributionCredit(row: any, touchpointById = new Map<string, any>()) {
  const touchpoint = row.touchpoint_event_id ? touchpointById.get(cleanText(row.touchpoint_event_id)) : null;
  return {
    id: row.id,
    journey_id: row.journey_id,
    conversion_event_id: row.conversion_event_id,
    touchpoint_event_id: row.touchpoint_event_id || null,
    conversion_event_time: row.conversion_event_time || null,
    touchpoint_event_time: row.touchpoint_event_time || touchpoint?.event_time || null,
    model: row.model,
    model_version: row.model_version,
    status: row.status,
    reason: row.reason || null,
    credit_fraction: row.credit_fraction === null || row.credit_fraction === undefined ? null : String(row.credit_fraction),
    credit_percent: row.credit_percent === null || row.credit_percent === undefined ? null : String(row.credit_percent),
    credit_amount: row.credit_amount === null || row.credit_amount === undefined ? null : String(row.credit_amount),
    currency: row.currency || null,
    affiliate_id: row.affiliate_id || touchpoint?.affiliate_id || null,
    source: row.source || touchpoint?.source || null,
    medium: row.medium || touchpoint?.medium || null,
    campaign_id: row.campaign_id || touchpoint?.campaign_id || null,
    offer_id: row.offer_id || touchpoint?.offer_id || null,
    calculated_at: row.calculated_at || row.created_at || null,
    touchpoint: touchpoint ? compactTimelineEvent(touchpoint, []) : null,
  };
}

function compactCommission(row: any) {
  return {
    id: row.id,
    commission_event_id: row.commission_event_id,
    journey_attribution_credit_id: row.journey_attribution_credit_id,
    journey_id: row.journey_id,
    conversion_event_id: row.conversion_event_id,
    touchpoint_event_id: row.touchpoint_event_id || null,
    affiliate_id: row.affiliate_id,
    publisher_id: row.publisher_id || null,
    model: row.model,
    model_version: row.model_version,
    credit_amount: row.credit_amount === null || row.credit_amount === undefined ? null : String(row.credit_amount),
    commission_rate: row.commission_rate === null || row.commission_rate === undefined ? null : String(row.commission_rate),
    commission_amount: row.commission_amount === null || row.commission_amount === undefined ? null : String(row.commission_amount),
    currency: row.currency || null,
    status: row.status,
    generated_at: row.generated_at || row.created_at || null,
    policy_snapshot: row.policy_snapshot || {},
  };
}

function durationSeconds(from: unknown, to: unknown) {
  const start = Date.parse(cleanText(from));
  const end = Date.parse(cleanText(to));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 1000);
}

function identityStatus(person: any, identifiers: any[]) {
  const status = cleanText(person?.status);
  if (status === "review_required") return "Under review";
  if (status === "merged") return "Merged";
  return identifiers.length ? "Resolved" : "Unresolved";
}

function orderRevenue(rows: any[]) {
  return rows.reduce((total, row) => total + numericValue(row.gross_amount ?? row.receipt_total), 0);
}

function sumCreditAmount(rows: any[]) {
  return rows.reduce((total, row) => total + numericValue(row.credit_amount), 0);
}

function uniqueSourceSystems(identifiers: any[], orders: any[], events: any[] = []) {
  return unique([
    ...identifiers.map((identifier) => cleanText(identifier.source_platform)),
    ...orders.map((order) => cleanText(order.platform)),
    ...events.map((event) => cleanText(event.source_platform || event.source_connector)),
  ]);
}

function latestTimestamp(...values: unknown[]) {
  const sorted = values
    .map((value) => cleanText(value))
    .filter(Boolean)
    .sort((a, b) => Date.parse(b) - Date.parse(a));
  return sorted[0] || null;
}

function compactIdentityEvent(row: any) {
  return {
    id: row.id,
    action: row.resolution_action,
    reason: row.resolution_reason,
    confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
    source_platform: row.source_platform || null,
    source_record_type: row.source_record_type || null,
    source_record_id: row.source_record_id || null,
    created_at: row.created_at || null,
    summary: identityEventSummary(row),
    metadata: row.metadata || {},
  };
}

function identityEventSummary(row: any) {
  const action = cleanText(row.resolution_action);
  if (action === "created_person") return "Person created";
  if (action === "matched_existing_person") return "Matched existing person";
  if (action === "attached_identifier") return "Identifier attached";
  if (action === "conflict_detected") return "Identity conflict detected";
  if (action === "review_required") return "Needs identity review";
  if (action === "manually_merged") return "Merge applied";
  return action ? action.replace(/_/g, " ") : "Identity event";
}

const EVENT_TITLE_BY_TYPE: Record<string, string> = {
  page_view: "Page viewed",
  click: "Affiliate click",
  landing_page: "Landing page viewed",
  email_open: "Email opened",
  email_click: "Email clicked",
  lead_submitted: "Lead submitted",
  lead_created: "Lead submitted",
  checkout_started: "Checkout started",
  purchase: "Purchase completed",
  upsell: "Upsell purchased",
  subscription_started: "Subscription started",
  subscription_renewed: "Subscription renewed",
  refund: "Order refunded",
  chargeback: "Chargeback recorded",
  identify: "Identity observed",
  session_start: "Session started",
  form_started: "Form started",
};

export function narrativeEventTitle(eventType: unknown) {
  const type = cleanText(eventType || "custom").toLowerCase();
  return EVENT_TITLE_BY_TYPE[type] || eventCategoryLabel(type);
}

function eventCategoryLabel(value: unknown) {
  const text = cleanText(value || "event").replace(/_/g, " ");
  return text.replace(/\b\w/g, (char) => char.toUpperCase());
}

function eventCategory(eventType: string) {
  if (["click", "landing_page", "email_open", "email_click"].includes(eventType)) return "marketing_touchpoint";
  if (["purchase", "upsell", "subscription_started", "subscription_renewed", "refund", "chargeback"].includes(eventType)) return "commerce_event";
  if (eventType === "identify") return "identity_event";
  if (["page_view", "session_start", "form_started", "lead_created", "checkout_started"].includes(eventType)) return "customer_action";
  return "system_event";
}

function narrativeCategory(eventType: string): ActivityCategory {
  const type = cleanText(eventType).toLowerCase();
  if (["click", "landing_page", "email_open", "email_click"].includes(type)) return "marketing";
  if (["purchase", "upsell", "subscription_started", "subscription_renewed", "refund", "chargeback"].includes(type)) return "commerce";
  if (type === "identify") return "identity";
  if (["page_view", "session_start", "form_started", "lead_created", "lead_submitted", "checkout_started"].includes(type)) return "customer_action";
  if (["error", "failed", "exception"].includes(type)) return "exception";
  return "system";
}

function compactTimelineEvent(row: any, credits: any[] = [], commissions: any[] = []) {
  const type = cleanText(row.event_type || "custom");
  const metadata = normalizeJourneyMetadata(row.metadata);
  return {
    id: row.id,
    event_type: type,
    category: eventCategory(type),
    event_time: row.event_time,
    source_platform: row.source_platform || null,
    source_connector: row.source_connector || null,
    source_record_id: row.source_record_id || null,
    platform_order_id: row.platform_order_id || null,
    transaction_id: row.transaction_id || null,
    session_id: row.session_id || null,
    touchpoint_id: row.touchpoint_id || null,
    amount: row.amount === null || row.amount === undefined ? null : String(row.amount),
    currency: row.currency || null,
    affiliate_id: row.affiliate_id || null,
    offer_id: row.offer_id || null,
    campaign_id: row.campaign_id || null,
    source: row.source || null,
    medium: row.medium || null,
    url: metadata.url || metadata.page_url || metadata.landing_page || null,
    product: metadata.product_name || metadata.product || null,
    identity_state: row.person_id ? "Linked" : "Unresolved",
    attribution_status: credits.length ? "Attributed" : ["purchase", "upsell", "subscription_started", "subscription_renewed"].includes(type) ? "Unattributed" : "Not applicable",
    commission_status: commissions.length ? summarizeCommissionStatus(commissions) : "Not commissioned",
    technical: {
      source_platform: row.source_platform || null,
      source_connector: row.source_connector || null,
      source_record_id: row.source_record_id || null,
      metadata: redactTechnicalMetadata(metadata),
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
    },
  };
}

function summarizeCommissionStatus(rows: any[]) {
  const statuses = unique(rows.map((row) => cleanText(row.status)));
  if (statuses.includes("paid")) return "Paid";
  if (statuses.includes("approved")) return "Approved";
  if (statuses.includes("pending")) return "Pending";
  if (statuses.includes("draft")) return "Draft";
  return statuses[0] || "Commissioned";
}

function redactEvidenceValue(value: any, depth = 0): any {
  if (depth > 4) return "[redacted_nested_value]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}...` : value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => redactEvidenceValue(item, depth + 1));
  const blocked = /token|secret|authorization|password|card|cvv|pan|credential|access[_-]?key|api[_-]?key|bearer/i;
  const redacted: Record<string, any> = {};
  for (const [key, nested] of Object.entries(value || {})) {
    if (blocked.test(key)) {
      redacted[key] = "[redacted]";
      continue;
    }
    redacted[key] = redactEvidenceValue(nested, depth + 1);
  }
  return redacted;
}

export function redactTechnicalMetadata(metadata: Record<string, any>) {
  return redactEvidenceValue(metadata || {});
}

function moneyText(amount: unknown, currency: unknown = "USD") {
  const text = cleanText(amount);
  if (!text) return null;
  const numeric = Number(text);
  const code = cleanText(currency) || "USD";
  if (!Number.isFinite(numeric)) return `${text} ${code}`.trim();
  try {
    return numeric.toLocaleString("en-US", { style: "currency", currency: code });
  } catch {
    return `${numeric.toFixed(2)} ${code}`;
  }
}

function percentText(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  const numeric = Number(text);
  if (!Number.isFinite(numeric)) return text;
  return `${numeric.toLocaleString("en-US", { maximumFractionDigits: 4 })}%`;
}

function firstPopulated(...values: unknown[]) {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return null;
}

function eventSummary(event: any, credits: any[] = [], commissions: any[] = []) {
  const type = cleanText(event.event_type).toLowerCase();
  const metadata = normalizeJourneyMetadata(event.metadata);
  const url = firstPopulated(metadata.url, metadata.page_url, metadata.landing_page);
  const affiliate = firstPopulated(event.affiliate_id, metadata.affiliate_id, metadata.publisher_id);
  const orderId = firstPopulated(event.platform_order_id, event.source_record_id, event.transaction_id);
  const amount = moneyText(event.amount, event.currency);
  if (type === "click" || affiliate) {
    if (affiliate && url) return `Affiliate ${affiliate} brought the customer to ${url}.`;
    if (affiliate) return `Affiliate ${affiliate} created a marketing touchpoint.`;
    if (url) return `The customer arrived from a marketing touchpoint on ${url}.`;
  }
  if (type === "page_view" || type === "landing_page") {
    return url ? `The customer viewed ${url}.` : "The customer viewed a page.";
  }
  if (type === "lead_created" || type === "lead_submitted") return "The customer submitted lead information.";
  if (type === "checkout_started") return "The customer started checkout.";
  if (["purchase", "upsell", "subscription_started", "subscription_renewed"].includes(type)) {
    if (orderId && amount) return `Order ${orderId} was completed for ${amount}.`;
    if (orderId) return `Order ${orderId} was completed.`;
    if (amount) return `A purchase was completed for ${amount}.`;
    return "A purchase was completed.";
  }
  if (type === "refund") return orderId ? `Order ${orderId} was refunded.` : "A refund was recorded.";
  if (type === "chargeback") return orderId ? `Order ${orderId} had a chargeback.` : "A chargeback was recorded.";
  if (type === "identify") return event.person_id ? "This event carried identity evidence and was linked to a person." : "This event carried identity evidence.";
  if (credits.length) return "The Attribution Engine associated this event with attribution credit.";
  if (commissions.length) return "A commission record is associated with this event.";
  return `${narrativeEventTitle(type)} was recorded.`;
}

function eventDisplayFields(event: any) {
  const metadata = normalizeJourneyMetadata(event.metadata);
  const fields: Record<string, any> = {};
  const url = firstPopulated(metadata.url, metadata.page_url, metadata.landing_page);
  if (url) fields.url = url;
  if (event.amount !== null && event.amount !== undefined) fields.amount = moneyText(event.amount, event.currency);
  if (event.affiliate_id) fields.affiliate = event.affiliate_id;
  if (event.campaign_id) fields.campaign = event.campaign_id;
  if (event.offer_id) fields.offer = event.offer_id;
  if (event.platform_order_id) fields.order = event.platform_order_id;
  if (event.transaction_id) fields.transaction = event.transaction_id;
  if (event.session_id) fields.session = event.session_id;
  if (event.source || event.medium) fields.channel = [event.source, event.medium].filter(Boolean).join(" / ");
  return fields;
}

function eventActivity(event: any, credits: any[] = [], commissions: any[] = []): ActivityEntry {
  const type = cleanText(event.event_type || "custom").toLowerCase();
  return {
    id: `journey_event:${event.id}`,
    category: narrativeCategory(type),
    activity_type: type,
    occurred_at: event.event_time || null,
    title: narrativeEventTitle(type),
    summary: eventSummary(event, credits, commissions),
    source_platform: event.source_platform || event.source_connector || null,
    related_order_id: event.platform_order_id || null,
    related_conversion_id: credits.find((credit) => cleanText(credit.conversion_event_id) === cleanText(event.id))?.conversion_event_id || (["purchase", "upsell", "subscription_started", "subscription_renewed", "refund", "chargeback"].includes(type) ? event.id : null),
    related_touchpoint_id: event.touchpoint_id || null,
    related_commission_id: commissions.find((commission) => cleanText(commission.conversion_event_id) === cleanText(event.id))?.id || null,
    related_credit_id: credits.find((credit) => cleanText(credit.conversion_event_id) === cleanText(event.id) || cleanText(credit.touchpoint_event_id) === cleanText(event.id))?.id || null,
    display_fields: eventDisplayFields(event),
    explanation: {
      original_event_type: type,
      attribution_status: credits.length ? "attributed" : null,
      commission_status: commissions.length ? summarizeCommissionStatus(commissions) : null,
    },
    technical_evidence: {
      event_id: event.id,
      journey_id: event.journey_id || null,
      person_id: event.person_id || null,
      original_event_type: type,
      source_platform: event.source_platform || null,
      source_connector: event.source_connector || null,
      source_record_id: event.source_record_id || null,
      occurred_at: event.event_time || null,
      received_at: event.created_at || null,
      metadata: redactTechnicalMetadata(normalizeJourneyMetadata(event.metadata)),
    },
    system_derived: false,
  };
}

function identityActivity(event: any): ActivityEntry {
  const action = cleanText(event.resolution_action || "identity_event");
  return {
    id: `identity_event:${event.id}`,
    category: action === "conflict_detected" || action === "review_required" ? "exception" : "identity",
    activity_type: action,
    occurred_at: event.created_at || null,
    title: identityEventSummary(event),
    summary: event.resolution_reason ? `Identity Engine recorded: ${event.resolution_reason}.` : "Linked by the TraceKit Identity Engine.",
    source_platform: event.source_platform || "tracekit_identity",
    related_order_id: event.source_record_type === "platform_order" ? event.source_record_id || null : null,
    related_conversion_id: null,
    related_touchpoint_id: null,
    related_commission_id: null,
    related_credit_id: null,
    display_fields: {
      action,
      confidence: event.confidence === null || event.confidence === undefined ? null : Number(event.confidence),
      source: event.source_platform || null,
      source_record: event.source_record_id || null,
    },
    explanation: {
      reason: event.resolution_reason || null,
      fallback_reason: event.resolution_reason ? null : "Linked by the TraceKit Identity Engine.",
    },
    technical_evidence: {
      event_id: event.id,
      person_id: event.person_id || null,
      action,
      reason: event.resolution_reason || null,
      source_platform: event.source_platform || null,
      source_record_type: event.source_record_type || null,
      source_record_id: event.source_record_id || null,
      metadata: redactTechnicalMetadata(event.metadata || {}),
    },
    system_derived: true,
  };
}

function orderActivity(order: any): ActivityEntry {
  const amount = moneyText(order.gross_amount ?? order.receipt_total, order.currency);
  const status = cleanText(order.status_norm || order.status).toLowerCase();
  const refunded = /refund|return|void|chargeback/.test(status);
  return {
    id: `platform_order:${order.platform_order_id || order.order_id || order.transaction_id}`,
    category: "commerce",
    activity_type: refunded ? "refund_or_reversal" : "commerce_order",
    occurred_at: order.order_ts || order.created_at || null,
    title: refunded ? "Order refund or reversal recorded" : "Commerce order recorded",
    summary: `${order.order_id || order.platform_order_id || "An order"} was recorded${amount ? ` for ${amount}` : ""}${order.platform ? ` through ${order.platform}` : ""}.`,
    source_platform: order.platform || null,
    related_order_id: order.platform_order_id || order.order_id || null,
    related_conversion_id: null,
    related_touchpoint_id: null,
    related_commission_id: null,
    related_credit_id: null,
    display_fields: {
      order: order.order_id || order.platform_order_id || null,
      transaction: order.transaction_id || null,
      status: order.status_norm || order.status || null,
      amount,
      affiliate: order.affiliate_id || null,
      commerce_reference: order.commerce_reference || null,
    },
    explanation: {
      system_derived: "Derived from the stored platform order record.",
    },
    technical_evidence: {
      platform: order.platform || null,
      platform_order_id: order.platform_order_id || null,
      order_id: order.order_id || null,
      transaction_id: order.transaction_id || null,
      commerce_reference: order.commerce_reference || null,
      raw_json: redactTechnicalMetadata(order.raw_json || {}),
    },
    system_derived: true,
  };
}

function attributionSummary(credit: any) {
  const affiliate = firstPopulated(credit.affiliate_id, credit.source, credit.medium);
  const percent = percentText(credit.credit_percent);
  const amount = moneyText(credit.credit_amount, credit.currency);
  if (affiliate && percent && amount) return `${affiliate.startsWith("affiliate") ? affiliate : `Affiliate ${affiliate}`} received ${percent} credit for ${amount}.`;
  if (affiliate && percent) return `${affiliate.startsWith("affiliate") ? affiliate : `Affiliate ${affiliate}`} received ${percent} credit.`;
  if (amount) return `Attribution credit was calculated for ${amount}.`;
  return "Attribution credit was calculated.";
}

function attributionExplanation(credit: any, touchpointById = new Map<string, any>()) {
  const touchpoint = credit.touchpoint_event_id ? touchpointById.get(cleanText(credit.touchpoint_event_id)) : null;
  const reason = cleanText(credit.reason);
  return {
    winner: credit.affiliate_id ? `Affiliate ${credit.affiliate_id}` : firstPopulated(credit.source, credit.medium, "Stored attribution credit"),
    model: credit.model || null,
    model_version: credit.model_version || null,
    credit_percent: credit.credit_percent === null || credit.credit_percent === undefined ? null : String(credit.credit_percent),
    credit_amount: credit.credit_amount === null || credit.credit_amount === undefined ? null : String(credit.credit_amount),
    currency: credit.currency || null,
    winning_touchpoint_at: credit.touchpoint_event_time || touchpoint?.event_time || null,
    reason: reason || "Attribution Engine result.",
    reason_is_stored: Boolean(reason),
    touchpoint: touchpoint ? {
      event_id: touchpoint.id,
      event_type: touchpoint.event_type,
      occurred_at: touchpoint.event_time,
      affiliate_id: touchpoint.affiliate_id || null,
      source: touchpoint.source || null,
      medium: touchpoint.medium || null,
    } : null,
    missing_exclusion_evidence_message: "Detailed exclusion evidence was not recorded for this attribution decision.",
  };
}

function attributionActivity(credit: any, touchpointById = new Map<string, any>()): ActivityEntry {
  return {
    id: `attribution_credit:${credit.id}`,
    category: "attribution",
    activity_type: "attribution_calculated",
    occurred_at: credit.calculated_at || credit.created_at || credit.conversion_event_time || null,
    title: "Attribution calculated",
    summary: attributionSummary(credit),
    source_platform: "tracekit_attribution",
    related_order_id: null,
    related_conversion_id: credit.conversion_event_id || null,
    related_touchpoint_id: credit.touchpoint_event_id || null,
    related_commission_id: null,
    related_credit_id: credit.id,
    display_fields: {
      affiliate: credit.affiliate_id || null,
      model: credit.model || null,
      credit: percentText(credit.credit_percent),
      credited_revenue: moneyText(credit.credit_amount, credit.currency),
    },
    explanation: attributionExplanation(credit, touchpointById),
    technical_evidence: {
      credit_id: credit.id,
      conversion_event_id: credit.conversion_event_id || null,
      touchpoint_event_id: credit.touchpoint_event_id || null,
      model: credit.model || null,
      model_version: credit.model_version || null,
      metadata: redactTechnicalMetadata(credit.metadata || {}),
    },
    system_derived: true,
  };
}

function commissionFormula(commission: any) {
  const amount = moneyText(commission.credit_amount ?? commission.attributed_amount, commission.currency);
  const rate = commission.commission_rate === null || commission.commission_rate === undefined ? null : Number(commission.commission_rate);
  const commissionAmount = moneyText(commission.commission_amount, commission.currency);
  if (!amount || rate === null || !Number.isFinite(rate) || !commissionAmount) return null;
  const rateNumber = rate;
  return `${amount} x ${(rateNumber * 100).toLocaleString("en-US", { maximumFractionDigits: 4 })}% = ${commissionAmount}`;
}

function commissionExplanation(commission: any) {
  return {
    affiliate: commission.affiliate_id || null,
    publisher: commission.publisher_id || null,
    status: commission.status || null,
    credited_revenue: commission.credit_amount === null || commission.credit_amount === undefined ? null : String(commission.credit_amount),
    commission_rate: commission.commission_rate === null || commission.commission_rate === undefined ? null : String(commission.commission_rate),
    commission_amount: commission.commission_amount === null || commission.commission_amount === undefined ? null : String(commission.commission_amount),
    currency: commission.currency || null,
    formula: commissionFormula(commission),
    calculation_basis: commission.policy_snapshot || commission.metadata?.calculation_basis || null,
  };
}

function commissionActivity(commission: any): ActivityEntry {
  const amount = moneyText(commission.commission_amount, commission.currency);
  const affiliate = commission.affiliate_id ? `Affiliate ${commission.affiliate_id}` : "An affiliate";
  return {
    id: `commission:${commission.id}`,
    category: "commission",
    activity_type: "commission_created",
    occurred_at: commission.generated_at || commission.created_at || commission.conversion_event_time || null,
    title: "Commission created",
    summary: amount ? `${amount} commission was created for ${affiliate}.` : `A commission was created for ${affiliate}.`,
    source_platform: "tracekit_payouts",
    related_order_id: null,
    related_conversion_id: commission.conversion_event_id || null,
    related_touchpoint_id: commission.touchpoint_event_id || null,
    related_commission_id: commission.id,
    related_credit_id: commission.journey_attribution_credit_id || null,
    display_fields: {
      affiliate: commission.affiliate_id || null,
      status: commission.status || null,
      commission_amount: amount,
      credited_revenue: moneyText(commission.credit_amount, commission.currency),
      rate: commission.commission_rate === null || commission.commission_rate === undefined ? null : `${Number(commission.commission_rate) * 100}%`,
    },
    explanation: commissionExplanation(commission),
    technical_evidence: {
      commission_id: commission.id,
      commission_event_id: commission.commission_event_id || null,
      credit_id: commission.journey_attribution_credit_id || null,
      conversion_event_id: commission.conversion_event_id || null,
      policy_snapshot: redactTechnicalMetadata(commission.policy_snapshot || {}),
      metadata: redactTechnicalMetadata(commission.metadata || {}),
    },
    system_derived: true,
  };
}

const ACTIVITY_SORT_PRIORITY: Record<ActivityCategory, number> = {
  customer_action: 10,
  marketing: 20,
  commerce: 30,
  identity: 40,
  attribution: 50,
  commission: 60,
  system: 70,
  exception: 80,
};

function sortActivity(rows: ActivityEntry[]) {
  return rows.sort((a, b) => {
    const aTime = Date.parse(cleanText(a.occurred_at));
    const bTime = Date.parse(cleanText(b.occurred_at));
    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return aTime - bTime;
    if (Number.isFinite(aTime) !== Number.isFinite(bTime)) return Number.isFinite(aTime) ? -1 : 1;
    const category = (ACTIVITY_SORT_PRIORITY[a.category] || 999) - (ACTIVITY_SORT_PRIORITY[b.category] || 999);
    if (category !== 0) return category;
    return a.id.localeCompare(b.id);
  });
}

function dedupeActivity(rows: ActivityEntry[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = row.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildJourneyActivity(args: {
  events: any[];
  identityEvents: any[];
  orders: any[];
  credits: any[];
  commissions: any[];
}) {
  const eventsById = mapBy(args.events, (row: any) => cleanText(row.id));
  const creditsByEvent = new Map<string, any[]>();
  for (const credit of args.credits) {
    for (const id of unique([cleanText(credit.conversion_event_id), cleanText(credit.touchpoint_event_id)])) {
      const bucket = creditsByEvent.get(id) || [];
      bucket.push(credit);
      creditsByEvent.set(id, bucket);
    }
  }
  const commissionsByConversion = groupBy(args.commissions, (row: any) => cleanText(row.conversion_event_id));
  const eventOrderIds = new Set(args.events.map((event: any) => cleanText(event.platform_order_id)).filter(Boolean));
  const orderActivities = args.orders
    .filter((order: any) => !eventOrderIds.has(cleanText(order.platform_order_id)))
    .map(orderActivity);
  const activity = dedupeActivity([
    ...args.events.map((event: any) => eventActivity(event, creditsByEvent.get(cleanText(event.id)) || [], commissionsByConversion.get(cleanText(event.id)) || [])),
    ...args.identityEvents.map(identityActivity),
    ...orderActivities,
    ...args.credits.map((credit: any) => attributionActivity(credit, eventsById)),
    ...args.commissions.map(commissionActivity),
  ]);
  return sortActivity(activity);
}

export function buildJourneyActivitySummary(journey: any, activity: ActivityEntry[], credits: any[], commissions: any[]) {
  const revenue = moneyText(journey.total_revenue, commissions[0]?.currency || credits[0]?.currency || "USD");
  const attributed = credits.find((credit: any) => cleanText(credit.affiliate_id || credit.source)) || null;
  const commissionTotal = commissions.reduce((sum: number, commission: any) => sum + numericValue(commission.commission_amount), 0);
  const commissionCurrency = commissions.find((commission: any) => commission.currency)?.currency || credits.find((credit: any) => credit.currency)?.currency || "USD";
  return {
    date_range: { from: journey.started_at || null, to: journey.ended_at || null },
    status: journey.status || null,
    events: Number(journey.event_count || activity.filter((entry) => !entry.system_derived).length || 0),
    marketing_touchpoints: activity.filter((entry) => entry.category === "marketing").length,
    purchases: Number(journey.purchase_count || activity.filter((entry) => entry.activity_type === "purchase").length || 0),
    revenue,
    attributed_source: attributed ? {
      affiliate_id: attributed.affiliate_id || null,
      source: attributed.source || null,
      model: attributed.model || null,
    } : null,
    commission_total: commissions.length ? moneyText(commissionTotal.toFixed(2), commissionCurrency) : null,
    commission_count: commissions.length,
  };
}

function buildIdentityExplanation(person: any, identifiers: any[], identityEvents: any[]) {
  return {
    primary_person: compactPerson(person, identifiers),
    linked_identifiers: identifiers.map(compactIdentifier),
    why_linked: identityEvents.find((event: any) => cleanText(event.resolution_reason))?.resolution_reason || "Linked by the TraceKit Identity Engine.",
    timeline: identityEvents.map(compactIdentityEvent),
  };
}

function buildAttributionExplanations(credits: any[], touchpointById = new Map<string, any>()) {
  const byConversion = groupBy(credits, (credit: any) => cleanText(credit.conversion_event_id || "unknown"));
  return Array.from(byConversion.entries()).map(([conversionEventId, rows]) => ({
    conversion_event_id: conversionEventId === "unknown" ? null : conversionEventId,
    credits: rows.map((credit: any) => ({
      id: credit.id,
      ...attributionExplanation(credit, touchpointById),
    })),
    multiple_credit_model: rows.length > 1,
    excluded_touchpoints: [],
    exclusion_evidence_available: false,
    missing_exclusion_evidence_message: "Detailed exclusion evidence was not recorded for this attribution decision.",
  }));
}

function buildCommissionExplanations(commissions: any[]) {
  return commissions.map((commission: any) => ({
    id: commission.id,
    ...commissionExplanation(commission),
  }));
}

function cursorFilterPeople(query: any, params: CustomerListParams) {
  if (!params.cursor) return query;
  return query.or(`updated_at.lt.${params.cursor.updated_at},and(updated_at.eq.${params.cursor.updated_at},id.lt.${params.cursor.id})`);
}

function setMatchReason(reasons: Map<string, string>, personId: unknown, reason: string) {
  const id = cleanText(personId);
  if (id && !reasons.has(id)) reasons.set(id, reason);
}

async function supabaseRows(query: any, label: string): Promise<any[]> {
  const { data, error } = await query;
  if (error) throw new Error(`${label} failed: ${error.message}`);
  return data || [];
}

async function supabaseMaybeSingle(query: any, label: string): Promise<any | null> {
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`${label} failed: ${error.message}`);
  return data || null;
}

async function findPersonIdsBySearch(supabase: any, params: CustomerListParams) {
  if (!params.search) return null;
  const search = normalizeSearchCandidates(params.search);
  const personIds: string[] = [];
  const matchReasons = new Map<string, string>();

  const exactPerson = await supabaseMaybeSingle(
    supabase.from("people").select("id").eq("workspace_id", params.workspace_id).eq("id", search.text),
    "Customer person search",
  );
  if (exactPerson?.id) {
    personIds.push(exactPerson.id);
    setMatchReason(matchReasons, exactPerson.id, "Matched by person ID");
  }

  if (search.exact_candidates.length) {
    const identifierRows = await supabaseRows(
      supabase
        .from("person_identifiers")
        .select("person_id,identifier_type,normalized_value,raw_value")
        .eq("workspace_id", params.workspace_id)
        .in("normalized_value", search.exact_candidates)
        .in("verification_status", ["observed", "verified"])
        .limit(100),
      "Customer identifier search",
    );
    for (const row of identifierRows) {
      personIds.push(cleanText(row.person_id));
      setMatchReason(matchReasons, row.person_id, `Matched by ${cleanText(row.identifier_type) || "identifier"} ${cleanText(row.normalized_value || row.raw_value)}`);
    }
  }

  const orderOrParts = [
    `platform_order_id.eq.${search.text}`,
    `order_id.eq.${search.text}`,
    `transaction_id.eq.${search.text}`,
    `everflow_transaction_id.eq.${search.text}`,
    `commerce_reference.eq.${search.text}`,
    `affiliate_id.eq.${search.text}`,
  ];
  if (search.email) orderOrParts.push(`customer_email_normalized.eq.${search.email}`);
  const orderRows = await supabaseRows(
    supabase
      .from("platform_orders")
      .select("person_id,platform_order_id,order_id,transaction_id,everflow_transaction_id,commerce_reference,affiliate_id,customer_email_normalized")
      .eq("workspace_id", params.workspace_id)
      .not("person_id", "is", null)
      .or(orderOrParts.join(","))
      .limit(100),
    "Customer order search",
  );
  for (const row of orderRows) {
    personIds.push(cleanText(row.person_id));
    if (cleanText(row.order_id) === search.text) setMatchReason(matchReasons, row.person_id, `Matched by order ID ${row.order_id}`);
    else if (cleanText(row.platform_order_id) === search.text) setMatchReason(matchReasons, row.person_id, `Matched by platform order ID ${row.platform_order_id}`);
    else if (cleanText(row.transaction_id) === search.text) setMatchReason(matchReasons, row.person_id, `Matched by transaction ID ${row.transaction_id}`);
    else if (cleanText(row.everflow_transaction_id) === search.text) setMatchReason(matchReasons, row.person_id, `Matched by Everflow transaction ID ${row.everflow_transaction_id}`);
    else if (cleanText(row.commerce_reference) === search.text) setMatchReason(matchReasons, row.person_id, `Matched by commerce reference ${row.commerce_reference}`);
    else if (cleanText(row.affiliate_id) === search.text) setMatchReason(matchReasons, row.person_id, `Matched by affiliate ID ${row.affiliate_id}`);
    else if (search.email && cleanText(row.customer_email_normalized) === search.email) setMatchReason(matchReasons, row.person_id, `Matched by customer email ${row.customer_email_normalized}`);
    else setMatchReason(matchReasons, row.person_id, "Matched by linked order evidence");
  }

  if (search.like) {
    const peopleRows = await supabaseRows(
      supabase
        .from("people")
        .select("id")
        .eq("workspace_id", params.workspace_id)
        .or(`primary_email.ilike.${search.like},display_name.ilike.${search.like},primary_phone.ilike.${search.like}`)
        .order("updated_at", { ascending: false })
        .limit(50),
      "Customer people text search",
    );
    for (const row of peopleRows) {
      personIds.push(cleanText(row.id));
      setMatchReason(matchReasons, row.id, "Matched by customer profile text");
    }
  }

  const ids = unique(personIds);
  return { person_ids: ids, match_reasons: Object.fromEntries(matchReasons.entries()) };
}

async function findPersonIdsByFilters(supabase: any, params: CustomerListParams) {
  const filterSets: string[][] = [];
  const needsOrders = params.has_purchase !== null || params.source_platform || params.affiliate_id || params.from || params.to_exclusive;
  if (needsOrders) {
    let query = supabase
      .from("platform_orders")
      .select("person_id")
      .eq("workspace_id", params.workspace_id)
      .not("person_id", "is", null)
      .order("order_ts", { ascending: false })
      .limit(1000);
    if (params.source_platform) query = query.eq("platform", params.source_platform);
    if (params.affiliate_id) query = query.eq("affiliate_id", params.affiliate_id);
    if (params.from) query = query.gte("order_ts", params.from);
    if (params.to_exclusive) query = query.lt("order_ts", params.to_exclusive);
    if (params.has_purchase === true) query = query.gt("gross_amount", 0);
    const rows = await supabaseRows(query, "Customer order filter");
    filterSets.push(unique(rows.map((row: any) => cleanText(row.person_id))));
  }
  if (params.has_attribution !== null || params.affiliate_id) {
    let query = supabase
      .from("journey_attribution_credits")
      .select("person_id")
      .eq("workspace_id", params.workspace_id)
      .order("conversion_event_time", { ascending: false })
      .limit(1000);
    if (params.has_attribution === true) query = query.eq("status", "attributed");
    if (params.has_attribution === false) query = query.eq("status", "unattributed");
    if (params.affiliate_id) query = query.eq("affiliate_id", params.affiliate_id);
    if (params.from) query = query.gte("conversion_event_time", params.from);
    if (params.to_exclusive) query = query.lt("conversion_event_time", params.to_exclusive);
    const rows = await supabaseRows(query, "Customer attribution filter");
    filterSets.push(unique(rows.map((row: any) => cleanText(row.person_id))));
  }
  if (params.has_commission !== null) {
    let query = supabase
      .from("affiliate_commissions")
      .select("person_id")
      .eq("workspace_id", params.workspace_id)
      .order("conversion_event_time", { ascending: false })
      .limit(1000);
    if (params.has_commission === true) query = query.not("id", "is", null);
    if (params.affiliate_id) query = query.eq("affiliate_id", params.affiliate_id);
    if (params.from) query = query.gte("conversion_event_time", params.from);
    if (params.to_exclusive) query = query.lt("conversion_event_time", params.to_exclusive);
    const rows = await supabaseRows(query, "Customer commission filter");
    const ids = unique(rows.map((row: any) => cleanText(row.person_id)));
    filterSets.push(params.has_commission === false ? [] : ids);
  }
  if (params.journey_status) {
    let query = supabase
      .from("journeys")
      .select("person_id")
      .eq("workspace_id", params.workspace_id)
      .eq("status", params.journey_status)
      .order("started_at", { ascending: false })
      .limit(1000);
    if (params.from) query = query.gte("started_at", params.from);
    if (params.to_exclusive) query = query.lt("started_at", params.to_exclusive);
    const rows = await supabaseRows(query, "Customer journey status filter");
    filterSets.push(unique(rows.map((row: any) => cleanText(row.person_id))));
  }
  if (!filterSets.length) return null;
  return filterSets.reduce((current, next) => current.filter((id) => next.includes(id)));
}

function intersectionOrCandidate(searchIds: string[] | null, filterIds: string[] | null) {
  if (searchIds && filterIds) return searchIds.filter((id) => filterIds.includes(id));
  if (searchIds) return searchIds;
  if (filterIds) return filterIds;
  return null;
}

async function queryCustomerPeople(supabase: any, params: CustomerListParams, candidateIds: string[] | null) {
  let query = supabase.from("people").select(PEOPLE_SELECT).eq("workspace_id", params.workspace_id);
  if (params.identity_status) {
    const status = params.identity_status === "unresolved" ? "review_required" : params.identity_status;
    if (["active", "merged", "suppressed", "review_required"].includes(status)) query = query.eq("status", status);
  }
  if (candidateIds) {
    if (!candidateIds.length) return [];
    query = query.in("id", candidateIds.slice(0, 500));
  } else {
    if (params.from) query = query.gte("updated_at", params.from);
    if (params.to_exclusive) query = query.lt("updated_at", params.to_exclusive);
    query = cursorFilterPeople(query, params);
  }
  query = query.order("updated_at", { ascending: false }).order("id", { ascending: false }).limit(params.limit + 1);
  const rows = await supabaseRows(query, "Customer list lookup");
  if (candidateIds) {
    const priority = new Map(candidateIds.map((id, index) => [id, index]));
    rows.sort((a: any, b: any) => (priority.get(cleanText(a.id)) ?? 9999) - (priority.get(cleanText(b.id)) ?? 9999));
  }
  return rows;
}

async function loadCustomerSummaryRows(supabase: any, workspaceId: string, personIds: string[]) {
  const ids = unique(personIds.map(cleanText));
  if (!ids.length) return { identifiers: [], journeys: [], orders: [], credits: [], commissions: [] };
  const [identifiers, journeys, orders, credits, commissions] = await Promise.all([
    supabaseRows(
      supabase.from("person_identifiers").select(IDENTIFIER_SELECT).eq("workspace_id", workspaceId).in("person_id", ids).order("is_primary", { ascending: false }).order("updated_at", { ascending: false }).limit(1000),
      "Customer identifiers lookup",
    ),
    supabaseRows(
      supabase.from("journeys").select(JOURNEY_SELECT).eq("workspace_id", workspaceId).in("person_id", ids).order("started_at", { ascending: false }).limit(1000),
      "Customer journey summary lookup",
    ),
    supabaseRows(
      supabase.from("platform_orders").select(PLATFORM_ORDER_SELECT).eq("workspace_id", workspaceId).in("person_id", ids).order("order_ts", { ascending: false }).limit(2000),
      "Customer order summary lookup",
    ),
    supabaseRows(
      supabase.from("journey_attribution_credits").select(ATTRIBUTION_SELECT).eq("workspace_id", workspaceId).in("person_id", ids).order("conversion_event_time", { ascending: false }).limit(2000),
      "Customer attribution summary lookup",
    ),
    supabaseRows(
      supabase.from("affiliate_commissions").select(COMMISSION_SELECT).eq("workspace_id", workspaceId).in("person_id", ids).order("conversion_event_time", { ascending: false }).limit(2000),
      "Customer commission summary lookup",
    ),
  ]);
  return { identifiers, journeys, orders, credits, commissions };
}

function summarizeCustomer(person: any, groups: {
  identifiers: any[];
  journeys: any[];
  orders: any[];
  credits: any[];
  commissions: any[];
}) {
  const identifiers = groups.identifiers;
  const journeys = groups.journeys;
  const orders = groups.orders;
  const credits = groups.credits;
  const commissions = groups.commissions;
  const lastActivity = latestTimestamp(
    person.last_seen_at,
    person.updated_at,
    ...journeys.map((journey) => journey.ended_at || journey.updated_at),
    ...orders.map((order) => order.order_ts || order.created_at),
    ...credits.map((credit) => credit.conversion_event_time),
  );
  const attributed = credits.filter((credit) => cleanText(credit.status) === "attributed");
  const attributedSource = attributed.find((credit) => cleanText(credit.affiliate_id || credit.source)) || null;
  return {
    customer: compactPerson(person, identifiers),
    primary_identifier: primaryIdentifier(person, identifiers),
    last_activity_at: lastActivity,
    journey_count: journeys.length,
    order_count: orders.length,
    revenue: orderRevenue(orders).toFixed(2),
    attributed_revenue: sumCreditAmount(attributed).toFixed(2),
    attributed_source: attributedSource ? {
      affiliate_id: attributedSource.affiliate_id || null,
      source: attributedSource.source || null,
      medium: attributedSource.medium || null,
      model: attributedSource.model || null,
    } : null,
    has_purchase: orders.some((order) => numericValue(order.gross_amount ?? order.receipt_total) > 0) || journeys.some((journey) => Number(journey.purchase_count || 0) > 0),
    has_attribution: attributed.length > 0,
    has_commission: commissions.length > 0,
    identity_status: identityStatus(person, identifiers),
    source_systems: uniqueSourceSystems(identifiers, orders),
  };
}

function primaryIdentifier(person: any, identifiers: any[]) {
  if (person.primary_email) return { type: "email", value: person.primary_email };
  if (person.primary_phone) return { type: "phone", value: person.primary_phone };
  const primary = identifiers.find((identifier) => identifier.is_primary) || identifiers[0] || null;
  return primary ? { type: primary.identifier_type, value: primary.normalized_value || primary.raw_value } : null;
}

export async function listCustomers(supabase: any, params: CustomerListParams) {
  const [searchResult, filterIds] = await Promise.all([
    findPersonIdsBySearch(supabase, params),
    findPersonIdsByFilters(supabase, params),
  ]);
  const searchIds = searchResult?.person_ids || null;
  const candidateIds = intersectionOrCandidate(searchIds, filterIds);
  const rows = await queryCustomerPeople(supabase, params, candidateIds);
  const page = rows.slice(0, params.limit);
  const ids = page.map((row: any) => cleanText(row.id));
  const summaryRows = await loadCustomerSummaryRows(supabase, params.workspace_id, ids);
  const identifiersByPerson = groupBy(summaryRows.identifiers, (row: any) => cleanText(row.person_id));
  const journeysByPerson = groupBy(summaryRows.journeys, (row: any) => cleanText(row.person_id));
  const ordersByPerson = groupBy(summaryRows.orders, (row: any) => cleanText(row.person_id));
  const creditsByPerson = groupBy(summaryRows.credits, (row: any) => cleanText(row.person_id));
  const commissionsByPerson = groupBy(summaryRows.commissions, (row: any) => cleanText(row.person_id));
  const customers = page.map((person: any) => summarizeCustomer(person, {
    identifiers: identifiersByPerson.get(cleanText(person.id)) || [],
    journeys: journeysByPerson.get(cleanText(person.id)) || [],
    orders: ordersByPerson.get(cleanText(person.id)) || [],
    credits: creditsByPerson.get(cleanText(person.id)) || [],
    commissions: commissionsByPerson.get(cleanText(person.id)) || [],
  })).map((row: any) => ({
    ...row,
    match_reason: searchResult?.match_reasons?.[cleanText(row.customer?.id)] || null,
  }));
  const last = page[page.length - 1] || null;
  return {
    ok: true,
    workspace_id: params.workspace_id,
    customers,
    next_cursor: rows.length > params.limit && last ? encodeCustomerListCursor({ updated_at: normalizeJourneyTimestamp(last.updated_at || last.created_at), id: cleanText(last.id) }) : null,
    has_more: rows.length > params.limit,
    filters: {
      search: params.search,
      from: params.from,
      to_exclusive: params.to_exclusive,
      journey_status: params.journey_status,
      has_purchase: params.has_purchase,
      has_attribution: params.has_attribution,
      has_commission: params.has_commission,
      identity_status: params.identity_status,
      source_platform: params.source_platform,
      affiliate_id: params.affiliate_id,
    },
  };
}

async function getPersonOrThrow(supabase: any, workspaceId: string, personId: string) {
  const person = await supabaseMaybeSingle(
    supabase.from("people").select(PEOPLE_SELECT).eq("workspace_id", workspaceId).eq("id", personId),
    "Customer lookup",
  );
  if (!person) throw Object.assign(new Error("Customer not found."), { status: 404, code: "not_found" });
  return person;
}

export async function getCustomerDetail(supabase: any, args: { workspace_id: string; person_id: string }) {
  const person = await getPersonOrThrow(supabase, args.workspace_id, args.person_id);
  const [identifiers, identityEvents, journeys, orders, credits, commissions, workItems] = await Promise.all([
    supabaseRows(
      supabase.from("person_identifiers").select(IDENTIFIER_SELECT).eq("workspace_id", args.workspace_id).eq("person_id", args.person_id).order("is_primary", { ascending: false }).order("updated_at", { ascending: false }).limit(200),
      "Customer identifiers lookup",
    ),
    supabaseRows(
      supabase.from("identity_resolution_events").select(IDENTITY_EVENT_SELECT).eq("workspace_id", args.workspace_id).eq("person_id", args.person_id).order("created_at", { ascending: false }).limit(50),
      "Customer identity events lookup",
    ),
    supabaseRows(
      supabase.from("journeys").select(JOURNEY_SELECT).eq("workspace_id", args.workspace_id).eq("person_id", args.person_id).order("started_at", { ascending: false }).limit(50),
      "Customer journeys lookup",
    ),
    supabaseRows(
      supabase.from("platform_orders").select(PLATFORM_ORDER_SELECT).eq("workspace_id", args.workspace_id).eq("person_id", args.person_id).order("order_ts", { ascending: false }).limit(500),
      "Customer orders lookup",
    ),
    supabaseRows(
      supabase.from("journey_attribution_credits").select(ATTRIBUTION_SELECT).eq("workspace_id", args.workspace_id).eq("person_id", args.person_id).order("conversion_event_time", { ascending: false }).limit(1000),
      "Customer attribution lookup",
    ),
    supabaseRows(
      supabase.from("affiliate_commissions").select(COMMISSION_SELECT).eq("workspace_id", args.workspace_id).eq("person_id", args.person_id).order("conversion_event_time", { ascending: false }).limit(1000),
      "Customer commissions lookup",
    ),
    getWorkItemsForPerson(supabase, {
      workspace_id: args.workspace_id,
      person_id: args.person_id,
      open_limit: 10,
      resolved_limit: 5,
    }).catch(() => ({ open: [], recent_resolved: [] })),
  ]);
  const compactIdentifiers = identifiers.map(compactIdentifier);
  const compactJourneys = journeys.map(compactJourney);
  const compactOrders = orders.map(compactOrder);
  const compactCredits = credits.map((credit: any) => compactAttributionCredit(credit));
  const compactCommissions = commissions.map(compactCommission);
  const sourceSystems = uniqueSourceSystems(identifiers, orders);
  const customer360 = buildCustomer360({ person, identifiers, identityEvents, journeys, orders, credits, commissions });
  return {
    ok: true,
    workspace_id: args.workspace_id,
    customer: compactPerson(person, identifiers),
    identifiers: compactIdentifiers,
    identity_events: identityEvents.map(compactIdentityEvent),
    journeys: compactJourneys,
    orders: compactOrders,
    attribution: compactCredits,
    commissions: compactCommissions,
    customer_360: {
      metrics: customer360.metrics,
      status: customer360.status,
      operational_health: customer360.operational_health,
      channels: customer360.channels,
      acquisition: customer360.acquisition,
      commercial_summary: customer360.commercial_summary,
      subscription: customer360.subscription,
      refunds: customer360.refunds,
      chargebacks: customer360.chargebacks,
      value_by_month: customer360.value_by_month,
      attribution_summary: customer360.attribution_summary,
      commission_summary: customer360.commission_summary,
      evidence_limits: customer360.evidence_limits,
    },
    work_items: workItems,
    explanations: customer360.explanations,
    summary: {
      identity_status: identityStatus(person, identifiers),
      first_seen_at: person.first_seen_at || person.created_at || null,
      last_seen_at: latestTimestamp(person.last_seen_at, person.updated_at, ...journeys.map((journey: any) => journey.ended_at), ...orders.map((order: any) => order.order_ts)),
      total_journeys: journeys.length,
      total_orders: orders.length,
      lifetime_revenue: orderRevenue(orders).toFixed(2),
      attributed_revenue: sumCreditAmount(credits.filter((credit: any) => cleanText(credit.status) === "attributed")).toFixed(2),
      source_systems: sourceSystems,
      identity_link_count: identifiers.length,
      commission_count: commissions.length,
    },
  };
}

async function loadJourneyEvents(supabase: any, params: CustomerJourneyDetailParams) {
  let query = supabase
    .from("journey_events")
    .select(JOURNEY_EVENT_SELECT)
    .eq("workspace_id", params.workspace_id)
    .eq("journey_id", params.journey_id)
    .order("event_time", { ascending: true })
    .order("id", { ascending: true })
    .limit(params.limit + 1);
  if (params.cursor) {
    query = query.or(`event_time.gt.${params.cursor.event_time},and(event_time.eq.${params.cursor.event_time},id.gt.${params.cursor.id})`);
  }
  return supabaseRows(query, "Customer journey event lookup");
}

export async function getCustomerJourneyDetail(supabase: any, params: CustomerJourneyDetailParams) {
  const [person, journey] = await Promise.all([
    getPersonOrThrow(supabase, params.workspace_id, params.person_id),
    supabaseMaybeSingle(
      supabase.from("journeys").select(JOURNEY_SELECT).eq("workspace_id", params.workspace_id).eq("id", params.journey_id).eq("person_id", params.person_id),
      "Customer journey lookup",
    ),
  ]);
  if (!journey) throw Object.assign(new Error("Journey not found."), { status: 404, code: "not_found" });
  const eventRows = await loadJourneyEvents(supabase, params);
  const page = eventRows.slice(0, params.limit);
  let identityQuery = supabase
    .from("identity_resolution_events")
    .select(IDENTITY_EVENT_SELECT)
    .eq("workspace_id", params.workspace_id)
    .eq("person_id", params.person_id)
    .order("created_at", { ascending: true })
    .limit(100);
  if (journey.started_at) identityQuery = identityQuery.gte("created_at", journey.started_at);
  if (journey.ended_at) identityQuery = identityQuery.lte("created_at", journey.ended_at);

  let orderQuery = supabase
    .from("platform_orders")
    .select(PLATFORM_ORDER_SELECT)
    .eq("workspace_id", params.workspace_id)
    .eq("person_id", params.person_id)
    .order("order_ts", { ascending: true })
    .limit(100);
  if (journey.started_at) orderQuery = orderQuery.gte("order_ts", journey.started_at);
  if (journey.ended_at) orderQuery = orderQuery.lte("order_ts", journey.ended_at);

  const [identifiers, identityEvents, allCredits, commissions, orders] = await Promise.all([
    supabaseRows(
      supabase.from("person_identifiers").select(IDENTIFIER_SELECT).eq("workspace_id", params.workspace_id).eq("person_id", params.person_id).order("is_primary", { ascending: false }).order("updated_at", { ascending: false }).limit(200),
      "Customer journey identifiers lookup",
    ),
    supabaseRows(identityQuery, "Customer journey identity activity lookup"),
    supabaseRows(
      supabase.from("journey_attribution_credits").select(ATTRIBUTION_SELECT).eq("workspace_id", params.workspace_id).eq("journey_id", params.journey_id).order("conversion_event_time", { ascending: true }).order("model", { ascending: true }).limit(300),
      "Customer journey attribution lookup",
    ),
    supabaseRows(
      supabase.from("affiliate_commissions").select(COMMISSION_SELECT).eq("workspace_id", params.workspace_id).eq("journey_id", params.journey_id).order("conversion_event_time", { ascending: true }).limit(300),
      "Customer journey commissions lookup",
    ),
    supabaseRows(orderQuery, "Customer journey order lookup"),
  ]);
  const eventById = mapBy(page, (row: any) => cleanText(row.id));
  const creditsByEvent = groupBy(allCredits, (row: any) => cleanText(row.conversion_event_id || row.touchpoint_event_id));
  const commissionsByConversion = groupBy(commissions, (row: any) => cleanText(row.conversion_event_id));
  const timeline = page.map((event: any) => compactTimelineEvent(
    event,
    creditsByEvent.get(cleanText(event.id)) || [],
    commissionsByConversion.get(cleanText(event.id)) || [],
  ));
  const touchpointById = new Map<string, any>();
  for (const event of page) touchpointById.set(cleanText(event.id), event);
  const touchpoints = page
    .filter((event: any) => eventCategory(cleanText(event.event_type)) === "marketing_touchpoint" || cleanText(event.affiliate_id))
    .map((event: any) => ({
      ...compactTimelineEvent(event),
      eligible_for_attribution: allCredits.some((credit: any) => cleanText(credit.touchpoint_event_id) === cleanText(event.id)),
      eligibility_reason: allCredits.some((credit: any) => cleanText(credit.touchpoint_event_id) === cleanText(event.id)) ? "Used by Attribution Engine" : "No stored attribution credit",
    }));
  const activity = buildJourneyActivity({ events: page, identityEvents, orders, credits: allCredits, commissions });
  const last = page[page.length - 1] || null;
  return {
    ok: true,
    workspace_id: params.workspace_id,
    customer: compactPerson(person, identifiers),
    journey: compactJourney(journey),
    events: timeline,
    activity,
    activity_summary: buildJourneyActivitySummary(journey, activity, allCredits, commissions),
    touchpoints,
    orders: orders.map(compactOrder),
    attribution: allCredits.map((credit: any) => compactAttributionCredit(credit, eventById)),
    attribution_explanations: buildAttributionExplanations(allCredits, eventById),
    commissions: commissions.map(compactCommission),
    commission_explanations: buildCommissionExplanations(commissions),
    identity_explanation: buildIdentityExplanation(person, identifiers, identityEvents),
    identity_context: {
      person_id: params.person_id,
      identity_status: identityStatus(person, identifiers),
      identifiers: identifiers.map(compactIdentifier),
      explanation: buildIdentityExplanation(person, identifiers, identityEvents),
    },
    page: {
      limit: params.limit,
      next_cursor: eventRows.length > params.limit && last ? encodeJourneyEventCursor({ event_time: normalizeJourneyTimestamp(last.event_time), id: cleanText(last.id) }) : null,
      has_more: eventRows.length > params.limit,
    },
  };
}
