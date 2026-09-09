import { cleanText, sha256Hex } from "./identity-normalization.ts";
import { type IdentityInputIdentifier } from "./identity-service.ts";
import { type JourneyEventInput, type JourneyEventType } from "./journey-events.ts";

export const BROWSER_EVENTS_CONNECTOR_ID = "browser-event-normalization";
export const BROWSER_EVENTS_JOB_TYPE = "browser_event_normalization";
export const BROWSER_EVENTS_PHASE = "normalize_browser_events";
export const BROWSER_EVENT_NORMALIZE_TASK_TYPE = "browser_event_normalize_batch";
export const BROWSER_EVENTS_RAW_TABLE = "browser_events_raw";
export const BROWSER_EVENT_SCHEMA_VERSION = 1;
export const BROWSER_EVENT_DEFAULT_BATCH_SIZE = 3;
export const BROWSER_EVENT_MAX_BATCH_SIZE = 100;
export const BROWSER_EVENT_PUBLIC_SOURCE = "public_event_api";
export const BROWSER_EVENT_SDK_SOURCE = "browser_sdk";
export const BROWSER_EVENT_INGESTION_PATH = "/v1/browser/events";
export const BROWSER_EVENT_LEGACY_INGESTION_PATH = "/v1/event";
export const BROWSER_EVENT_SETUP_PATH = "/v1/browser/setup";
export const BROWSER_EVENT_CONFIG_PATH = "/v1/browser/config";
export const BROWSER_EVENT_LEGACY_SETUP_PATH = "/v1/event/setup";
export const BROWSER_EXTERNAL_CUSTOMER_ID_MAX_LENGTH = 256;
const BROWSER_EXTERNAL_CUSTOMER_ID_PLACEHOLDERS = new Set(["null", "undefined", "unknown", "n/a", "na", "none", "(none)", "-", "--", "0"]);

export const BROWSER_EVENT_TYPES = [
  "page_view",
  "click",
  "identify",
  "lead",
  "checkout_started",
  "purchase",
  "custom",
] as const;

export type BrowserEventType = (typeof BROWSER_EVENT_TYPES)[number];

export type BrowserEventRawStatus =
  | "pending"
  | "processing"
  | "normalized"
  | "duplicate"
  | "invalid"
  | "unsupported"
  | "error"
  | "review";

export type BrowserRawEventRow = {
  id?: string | null;
  event_id: string;
  workspace_id: string;
  received_at: string;
  event_time: string | null;
  event_type: string;
  normalized_event_type: BrowserEventType | null;
  tkid: string | null;
  session_id: string | null;
  source: string;
  schema_version: number;
  raw_payload: Record<string, any>;
  request_context: Record<string, any>;
  payload_hash?: string | null;
  normalization_status: BrowserEventRawStatus;
  normalization_error?: string | null;
  normalization_job_id?: string | null;
  normalized_journey_event_id?: string | null;
  person_id?: string | null;
  journey_id?: string | null;
  normalization_attempts?: number | null;
  normalized_at?: string | null;
};

export type BrowserEventRawDraft = Omit<BrowserRawEventRow, "id"> & {
  payload_hash: string;
};

export type BrowserEventValidationResult =
  | { ok: true; value: BrowserEventRawDraft; warnings: string[] }
  | { ok: false; status: number; error: string; message: string };

export type BrowserEventCursor = {
  received_at: string;
  event_id: string;
};

export type BrowserEventRouteMatch =
  | { kind: "ingest"; path: string; allowed_methods: ["POST"] }
  | { kind: "setup"; path: string; allowed_methods: ["GET", "POST"] }
  | { kind: "method_not_allowed"; route: "browser_event_ingest" | "browser_event_setup"; path: string; allowed_methods: string[] };

const BROWSER_EVENT_INGESTION_PATHS = new Set([
  BROWSER_EVENT_INGESTION_PATH,
  BROWSER_EVENT_LEGACY_INGESTION_PATH,
  "/browser/events",
  "/v1/events/browser",
]);

const BROWSER_EVENT_SETUP_PATHS = new Set([
  BROWSER_EVENT_SETUP_PATH,
  BROWSER_EVENT_CONFIG_PATH,
  BROWSER_EVENT_LEGACY_SETUP_PATH,
]);

export function normalizeBrowserRoutePath(path: string) {
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

export function isBrowserEventIngestionPath(path: string) {
  return BROWSER_EVENT_INGESTION_PATHS.has(normalizeBrowserRoutePath(path));
}

export function isBrowserEventSetupPath(path: string) {
  return BROWSER_EVENT_SETUP_PATHS.has(normalizeBrowserRoutePath(path));
}

export function matchBrowserEventRoute(method: string, path: string): BrowserEventRouteMatch | null {
  const normalizedPath = normalizeBrowserRoutePath(path);
  const normalizedMethod = cleanText(method).toUpperCase();
  if (isBrowserEventIngestionPath(normalizedPath)) {
    if (normalizedMethod === "POST") return { kind: "ingest", path: normalizedPath, allowed_methods: ["POST"] };
    return { kind: "method_not_allowed", route: "browser_event_ingest", path: normalizedPath, allowed_methods: ["POST"] };
  }
  if (isBrowserEventSetupPath(normalizedPath)) {
    if (normalizedMethod === "GET" || normalizedMethod === "POST") return { kind: "setup", path: normalizedPath, allowed_methods: ["GET", "POST"] };
    return { kind: "method_not_allowed", route: "browser_event_setup", path: normalizedPath, allowed_methods: ["GET", "POST"] };
  }
  return null;
}

const EVENT_TYPE_ALIASES: Record<string, BrowserEventType> = {
  pageview: "page_view",
  "page.view": "page_view",
  outbound_click: "click",
  form_submit: "lead",
  initiate_checkout: "checkout_started",
};

const PARAM_TO_FIELD: Array<[string, string]> = [
  ["utm_source", "utm_source"],
  ["utm_medium", "utm_medium"],
  ["utm_campaign", "utm_campaign"],
  ["utm_content", "utm_content"],
  ["utm_term", "utm_term"],
  ["affiliate_id", "affiliate_id"],
  ["affid", "affiliate_id"],
  ["aff_id", "affiliate_id"],
  ["offer_id", "offer_id"],
  ["oid", "offer_id"],
  ["_ef_transaction_id", "transaction_id"],
  ["ef_transaction_id", "transaction_id"],
  ["transaction_id", "transaction_id"],
  ["click_id", "click_id"],
  ["gclid", "gclid"],
  ["fbclid", "fbclid"],
  ["ttclid", "ttclid"],
  ["msclkid", "msclkid"],
  ["irclickid", "irclickid"],
  ["c1", "sub1"],
  ["sub1", "sub1"],
  ["sub2", "sub2"],
  ["sub3", "sub3"],
  ["sub4", "sub4"],
  ["sub5", "sub5"],
  ["sub6", "sub6"],
  ["sub7", "sub7"],
  ["sub8", "sub8"],
  ["sub9", "sub9"],
  ["sub10", "sub10"],
];

export const ATTRIBUTION_EVIDENCE_SCHEMA_VERSION = 1;
export const ATTRIBUTION_EVIDENCE_MAX_ENTRIES = 100;
export const ATTRIBUTION_EVIDENCE_MAX_VALUE_LENGTH = 512;

type AttributionEvidenceCategory = "affiliate_network" | "paid_media" | "tracker" | "marketing_metadata";
type AttributionEvidenceKind = "identifier" | "marketing_param";
type AttributionEvidenceRegistryEntry = { provider: string; category: AttributionEvidenceCategory; identifier_type: string; kind: AttributionEvidenceKind; conflict_group?: string };

// Kept separate from PARAM_TO_FIELD so evidence capture cannot change existing
// normalized acquisition-field precedence.
export const ATTRIBUTION_EVIDENCE_REGISTRY: Readonly<Record<string, AttributionEvidenceRegistryEntry>> = {
  _ef_transaction_id: { provider: "everflow", category: "affiliate_network", identifier_type: "transaction_id", kind: "identifier", conflict_group: "transaction_id" },
  ef_transaction_id: { provider: "everflow", category: "affiliate_network", identifier_type: "transaction_id", kind: "identifier", conflict_group: "transaction_id" },
  transaction_id: { provider: "unknown", category: "tracker", identifier_type: "transaction_id", kind: "identifier", conflict_group: "transaction_id" },
  affiliate_id: { provider: "unknown", category: "affiliate_network", identifier_type: "affiliate_id", kind: "identifier", conflict_group: "affiliate_id" },
  affid: { provider: "unknown", category: "affiliate_network", identifier_type: "affiliate_id", kind: "identifier", conflict_group: "affiliate_id" },
  aff_id: { provider: "unknown", category: "affiliate_network", identifier_type: "affiliate_id", kind: "identifier", conflict_group: "affiliate_id" },
  aff_click_id: { provider: "tune", category: "affiliate_network", identifier_type: "click_id", kind: "identifier", conflict_group: "tune_click_id" },
  aff_sub: { provider: "tune", category: "affiliate_network", identifier_type: "affiliate_sub", kind: "identifier" },
  aff_sub2: { provider: "tune", category: "affiliate_network", identifier_type: "affiliate_sub2", kind: "identifier" },
  aff_sub3: { provider: "tune", category: "affiliate_network", identifier_type: "affiliate_sub3", kind: "identifier" },
  aff_sub4: { provider: "tune", category: "affiliate_network", identifier_type: "affiliate_sub4", kind: "identifier" },
  aff_sub5: { provider: "tune", category: "affiliate_network", identifier_type: "affiliate_sub5", kind: "identifier" },
  irclickid: { provider: "impact", category: "affiliate_network", identifier_type: "click_id", kind: "identifier", conflict_group: "impact_click_id" },
  gclid: { provider: "google", category: "paid_media", identifier_type: "click_id", kind: "identifier", conflict_group: "google_click_id" },
  gbraid: { provider: "google", category: "paid_media", identifier_type: "click_id", kind: "identifier", conflict_group: "google_click_id" },
  wbraid: { provider: "google", category: "paid_media", identifier_type: "click_id", kind: "identifier", conflict_group: "google_click_id" },
  fbclid: { provider: "meta", category: "paid_media", identifier_type: "click_id", kind: "identifier", conflict_group: "meta_click_id" },
  ttclid: { provider: "tiktok", category: "paid_media", identifier_type: "click_id", kind: "identifier", conflict_group: "tiktok_click_id" },
  msclkid: { provider: "microsoft", category: "paid_media", identifier_type: "click_id", kind: "identifier", conflict_group: "microsoft_click_id" },
  click_id: { provider: "unknown", category: "tracker", identifier_type: "click_id", kind: "identifier", conflict_group: "generic_click_id" },
  utm_source: { provider: "unknown", category: "marketing_metadata", identifier_type: "utm_source", kind: "marketing_param" },
  utm_medium: { provider: "unknown", category: "marketing_metadata", identifier_type: "utm_medium", kind: "marketing_param" },
  utm_campaign: { provider: "unknown", category: "marketing_metadata", identifier_type: "utm_campaign", kind: "marketing_param" },
  utm_content: { provider: "unknown", category: "marketing_metadata", identifier_type: "utm_content", kind: "marketing_param" },
  utm_term: { provider: "unknown", category: "marketing_metadata", identifier_type: "utm_term", kind: "marketing_param" },
  offer_id: { provider: "unknown", category: "marketing_metadata", identifier_type: "offer_id", kind: "marketing_param" },
  oid: { provider: "unknown", category: "marketing_metadata", identifier_type: "offer_id", kind: "marketing_param" },
  c1: { provider: "unknown", category: "marketing_metadata", identifier_type: "sub1", kind: "marketing_param" },
  ...Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`sub${index + 1}`, { provider: "unknown", category: "marketing_metadata", identifier_type: `sub${index + 1}`, kind: "marketing_param" }])),
  ...Object.fromEntries(Array.from({ length: 5 }, (_, index) => [`s${index + 1}`, { provider: "unknown", category: "marketing_metadata", identifier_type: `sub${index + 1}`, kind: "marketing_param" }])),
};

export type BrowserAttributionEvidenceObservation = { raw_param: string; value: string; provider: string; category: AttributionEvidenceCategory; identifier_type: string; source_location: string };

function attributionEvidenceReferrer(payload: Record<string, any>) {
  const rawClient = firstText(payload.referrer, payload.first_touch?.referrer, payload.context?.first_touch?.referrer);
  if (!rawClient) return { client: null, origin: null, domain: null, missing: true };
  const client = safeUrlForDiagnostics(rawClient);
  try {
    const parsed = new URL(rawClient);
    return { client, origin: parsed.origin, domain: parsed.hostname || null, missing: false };
  } catch {
    return { client, origin: null, domain: null, missing: false };
  }
}

export function extractBrowserAttributionEvidence(payload: Record<string, any>) {
  try {
    const observations: Array<BrowserAttributionEvidenceObservation & { kind: AttributionEvidenceKind; conflict_group?: string }> = [];
    const seen = new Set<string>();
    const add = (rawParam: string, rawValue: unknown, sourceLocation: string) => {
      if (observations.length >= ATTRIBUTION_EVIDENCE_MAX_ENTRIES) return;
      const registry = ATTRIBUTION_EVIDENCE_REGISTRY[rawParam];
      if (!registry) return;
      const value = cleanText(rawValue);
      if (!value) return;
      const limitedValue = value.slice(0, ATTRIBUTION_EVIDENCE_MAX_VALUE_LENGTH);
      // Location is part of the key: repeats within one stage are noise, while
      // the same observation at meaningfully different stages remains evidence.
      const key = `${rawParam}\u0000${limitedValue}\u0000${sourceLocation}`;
      if (seen.has(key)) return;
      seen.add(key);
      observations.push({ raw_param: rawParam, value: limitedValue, provider: registry.provider, category: registry.category, identifier_type: registry.identifier_type, source_location: sourceLocation, kind: registry.kind, conflict_group: registry.conflict_group });
    };
    const addObject = (value: unknown, location: string) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      for (const rawParam of Object.keys(ATTRIBUTION_EVIDENCE_REGISTRY)) add(rawParam, (value as any)[rawParam], location);
    };
    const addUrl = (value: unknown, location: string) => {
      const params = urlSearchParamsFrom(value);
      if (!params) return;
      for (const rawParam of Object.keys(ATTRIBUTION_EVIDENCE_REGISTRY)) for (const item of params.getAll(rawParam)) add(rawParam, item, location);
    };

    addObject(payload, "top_level");
    addUrl(firstText(payload.page_url, payload.pageUrl, payload.url), "page_url");
    addUrl(firstText(payload.landing_url, payload.landingUrl), "landing_url");
    const context = payload.context && typeof payload.context === "object" ? payload.context : {};
    const firstTouch = payload.first_touch && typeof payload.first_touch === "object" ? payload.first_touch : context.first_touch;
    const currentTouch = payload.current_touch && typeof payload.current_touch === "object" ? payload.current_touch : context.current_touch;
    addObject(firstTouch?.params, "first_touch.params");
    addObject(currentTouch, "current_touch");
    addObject(currentTouch?.params, "current_touch.params");

    const identifiers = observations.filter((item) => item.kind === "identifier").map(({ kind: _kind, conflict_group: _group, ...item }) => item);
    const marketingParams = observations.filter((item) => item.kind === "marketing_param").map(({ kind: _kind, conflict_group: _group, ...item }) => item);
    const flags = new Set<string>();
    const referrer = attributionEvidenceReferrer(payload);
    if (referrer.missing) flags.add("referrer_missing");
    const affiliate = identifiers.filter((item) => item.category === "affiliate_network");
    const trackers = identifiers.filter((item) => item.category === "tracker");
    const paid = identifiers.filter((item) => item.category === "paid_media");
    if (new Set(affiliate.map((item) => `${item.raw_param}\u0000${item.value}`)).size > 1) flags.add("multiple_affiliate_network_identifiers");
    if (new Set(trackers.map((item) => `${item.raw_param}\u0000${item.value}`)).size > 1) flags.add("multiple_tracker_identifiers");
    if (paid.length && affiliate.length) flags.add("paid_media_plus_affiliate_network");
    const groups = new Map<string, Set<string>>();
    for (const item of observations) {
      if (!item.conflict_group) continue;
      const values = groups.get(item.conflict_group) || new Set<string>();
      values.add(item.value);
      groups.set(item.conflict_group, values);
    }
    if ([...groups.values()].some((values) => values.size > 1)) flags.add("identifier_value_conflict");
    return { schema_version: ATTRIBUTION_EVIDENCE_SCHEMA_VERSION, identifiers, marketing_params: marketingParams, referrer, flags: [...flags].sort() };
  } catch {
    return { schema_version: ATTRIBUTION_EVIDENCE_SCHEMA_VERSION, identifiers: [], marketing_params: [], referrer: { client: null, origin: null, domain: null, missing: true }, flags: ["referrer_missing"] };
  }
}

export function normalizeBrowserEventType(value: unknown): BrowserEventType | null {
  const raw = cleanText(value).toLowerCase();
  if (!raw) return null;
  const aliased = EVENT_TYPE_ALIASES[raw] || raw;
  return (BROWSER_EVENT_TYPES as readonly string[]).includes(aliased) ? aliased as BrowserEventType : null;
}

export function browserJourneyEventType(eventType: BrowserEventType): JourneyEventType {
  if (eventType === "lead") return "lead_created";
  return eventType as JourneyEventType;
}

export function isBrowserAttributionEligible(eventType: BrowserEventType) {
  return eventType === "page_view" || eventType === "click" || eventType === "lead" || eventType === "checkout_started";
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return null;
}

function browserPurchaseAmount(payload: Record<string, any>) {
  return firstText(
    payload.amount,
    payload.value,
    payload.revenue,
    payload.total,
    payload.order_total,
    payload.orderTotal,
    payload.properties?.amount,
    payload.properties?.value,
    payload.properties?.revenue,
    payload.properties?.total,
  );
}

function browserPurchaseCurrency(payload: Record<string, any>) {
  return firstText(
    payload.currency,
    payload.currency_code,
    payload.currencyCode,
    payload.iso_currency_code,
    payload.properties?.currency,
    payload.properties?.currency_code,
    payload.properties?.currencyCode,
  );
}

function parseTimestamp(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function sortObject(value: any): any {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((acc: Record<string, any>, key) => {
    acc[key] = sortObject(value[key]);
    return acc;
  }, {});
}

export function stableBrowserPayloadString(value: unknown) {
  return JSON.stringify(sortObject(value ?? null));
}

export async function browserPayloadHash(value: unknown) {
  return sha256Hex(stableBrowserPayloadString(value));
}

export async function browserWriteKeyHash(workspaceId: string, writeKey: string) {
  return sha256Hex(`tracekit_browser_write_key:${cleanText(workspaceId) || "default"}:${cleanText(writeKey)}`);
}

export function browserEventId(value: unknown, fallback: string) {
  const text = cleanText(value);
  if (!text) return fallback;
  return text.slice(0, 160);
}

export function parseBrowserEventCursor(value: unknown): BrowserEventCursor | null {
  const text = cleanText(value);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    const receivedAt = parseTimestamp(parsed?.received_at);
    const eventId = cleanText(parsed?.event_id);
    return receivedAt && eventId ? { received_at: receivedAt, event_id: eventId } : null;
  } catch {
    return null;
  }
}

export function serializeBrowserEventCursor(cursor: BrowserEventCursor | null) {
  return cursor ? JSON.stringify(cursor) : null;
}

export function browserDateFromTimestamp(value: string) {
  const date = new Date(Date.parse(value));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function urlSearchParamsFrom(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  try {
    return new URL(text).searchParams;
  } catch {
    try {
      return new URL(text, "https://example.invalid").searchParams;
    } catch {
      return null;
    }
  }
}

export function safeUrlForDiagnostics(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return `${url.origin}${url.pathname}`;
  } catch {
    return text.split("?")[0]?.slice(0, 300) || null;
  }
}

function extractParamsFromUrl(value: unknown) {
  const params = urlSearchParamsFrom(value);
  const result: Record<string, string> = {};
  if (!params) return result;
  for (const [param, field] of PARAM_TO_FIELD) {
    const item = cleanText(params.get(param));
    if (item && !result[field]) result[field] = item;
  }
  return result;
}

export function normalizeBrowserMarketingFields(payload: Record<string, any>) {
  const urlParams = {
    ...extractParamsFromUrl(payload.landing_url || payload.landingUrl),
    ...extractParamsFromUrl(payload.page_url || payload.pageUrl || payload.url),
  };
  const current: Record<string, string | null> = {};
  const original_param_names: Record<string, string> = {};

  for (const [param, field] of PARAM_TO_FIELD) {
    const value = firstText(payload[field], payload[param], urlParams[field]);
    if (value && !current[field]) {
      current[field] = value;
      original_param_names[field] = payload[field] ? field : payload[param] ? param : "url";
    }
  }

  const context = payload.context && typeof payload.context === "object" ? payload.context : {};
  const firstTouch = payload.first_touch && typeof payload.first_touch === "object"
    ? payload.first_touch
    : context.first_touch && typeof context.first_touch === "object"
      ? context.first_touch
      : {};
  const currentTouch = payload.current_touch && typeof payload.current_touch === "object"
    ? payload.current_touch
    : context.current_touch && typeof context.current_touch === "object"
      ? context.current_touch
      : {};

  const normalizedCurrent: Record<string, string | null> = {
      ...current,
      source: firstText(payload.source, payload.utm_source, current.source, current.utm_source),
      medium: firstText(payload.medium, payload.utm_medium, current.medium, current.utm_medium),
      campaign_id: firstText(payload.campaign_id, payload.utm_campaign, current.campaign_id, current.utm_campaign),
      affiliate_id: firstText(payload.affiliate_id, payload.affid, payload.aff_id, current.affiliate_id),
      offer_id: firstText(payload.offer_id, payload.oid, current.offer_id),
      transaction_id: firstText(payload.transaction_id, payload._ef_transaction_id, payload.ef_transaction_id, current.transaction_id),
  };

  return {
    current: normalizedCurrent,
    first_touch: firstTouch,
    current_touch: currentTouch,
    original_param_names,
  };
}

export function browserIdentityIdentifiers(payload: Record<string, any>): IdentityInputIdentifier[] {
  const identifiers: IdentityInputIdentifier[] = [];
  const email = firstText(payload.email, payload.identity?.email, payload.properties?.email, payload.user?.email);
  const phone = firstText(payload.phone, payload.identity?.phone, payload.properties?.phone, payload.user?.phone);
  // Keep the browser contract explicit and bounded; the canonical identity
  // normalizer trims again, preserves external ID case, and hashes type:value.
  const externalCustomerId = [payload.external_customer_id, payload.identity?.external_customer_id]
    .find((value) => {
      if (typeof value !== "string") return false;
      const normalized = cleanText(value);
      return normalized.length > 0
        && normalized.length <= BROWSER_EXTERNAL_CUSTOMER_ID_MAX_LENGTH
        && !BROWSER_EXTERNAL_CUSTOMER_ID_PLACEHOLDERS.has(normalized.toLowerCase());
    });
  const country = firstText(payload.country, payload.identity?.country, payload.properties?.country, payload.user?.country);
  if (email) identifiers.push({ identifier_type: "email", value: email, verification_status: "observed", confidence: 0.85 });
  if (phone) identifiers.push({ identifier_type: "phone", value: phone, country, verification_status: "observed", confidence: 0.75 });
  if (externalCustomerId) identifiers.push({ identifier_type: "external_customer_id", value: cleanText(externalCustomerId), verification_status: "observed", confidence: 0.99 });
  return identifiers;
}

export function browserEventPersonAttributes(payload: Record<string, any>) {
  return {
    display_name: firstText(payload.name, payload.display_name, payload.identity?.name, payload.identity?.display_name, payload.properties?.name, payload.user?.name),
    first_name: firstText(payload.first_name, payload.firstName, payload.identity?.first_name, payload.identity?.firstName, payload.properties?.first_name, payload.user?.first_name),
    last_name: firstText(payload.last_name, payload.lastName, payload.identity?.last_name, payload.identity?.lastName, payload.properties?.last_name, payload.user?.last_name),
  };
}

export function applyBrowserTkidIdentityToBatch(
  rows: Array<Pick<BrowserRawEventRow, "event_id" | "tkid">>,
  personIdByEventId: Map<string, string | null>,
) {
  const resolvedPersonIdByTkid = new Map<string, string>();
  for (const row of rows) {
    const tkid = firstText(row.tkid);
    const personId = firstText(personIdByEventId.get(row.event_id));
    if (tkid && personId && !resolvedPersonIdByTkid.has(tkid)) {
      resolvedPersonIdByTkid.set(tkid, personId);
    }
  }

  let linked = 0;
  const next = new Map(personIdByEventId);
  for (const row of rows) {
    if (firstText(next.get(row.event_id))) continue;
    const tkid = firstText(row.tkid);
    const personId = tkid ? resolvedPersonIdByTkid.get(tkid) : null;
    if (!personId) continue;
    next.set(row.event_id, personId);
    linked += 1;
  }

  return {
    person_id_by_event_id: next,
    linked,
  };
}

export async function normalizeBrowserEventForRawStorage(body: any, args: {
  received_at: string;
  event_id_fallback: string;
  request_context: Record<string, any>;
}): Promise<BrowserEventValidationResult> {
  const payload = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const workspaceId = firstText(payload.workspace_id, payload.workspaceId);
  if (!workspaceId) return { ok: false, status: 400, error: "bad_request", message: "workspace_id is required." };
  const originalEventType = firstText(payload.event_type, payload.eventType, payload.type, payload.event_name, payload.eventName);
  const normalizedEventType = normalizeBrowserEventType(originalEventType);
  if (!normalizedEventType) return { ok: false, status: 400, error: "unsupported_event_type", message: "event_type is not supported." };
  const warnings: string[] = [];
  const eventTime = parseTimestamp(payload.event_time ?? payload.eventTime ?? payload.client_timestamp ?? payload.clientTimestamp ?? payload.timestamp);
  if (!eventTime) warnings.push("event_time_missing_or_invalid_used_received_at");
  const receivedAt = parseTimestamp(args.received_at) || new Date().toISOString();
  const eventId = browserEventId(payload.event_id ?? payload.eventId, args.event_id_fallback);
  const source = cleanText(payload.source) === BROWSER_EVENT_SDK_SOURCE || cleanText(payload.sdk_version || payload.sdkVersion)
    ? BROWSER_EVENT_SDK_SOURCE
    : BROWSER_EVENT_PUBLIC_SOURCE;
  const rawPayload = {
    ...payload,
    event_type: originalEventType,
    normalized_event_type: normalizedEventType,
  };

  return {
    ok: true,
    value: {
      event_id: eventId,
      workspace_id: workspaceId,
      received_at: receivedAt,
      event_time: eventTime || receivedAt,
      event_type: originalEventType || normalizedEventType,
      normalized_event_type: normalizedEventType,
      tkid: firstText(payload.tkid, payload.tracekit_id, payload.tracekitId),
      session_id: firstText(payload.session_id, payload.sessionId),
      source,
      schema_version: BROWSER_EVENT_SCHEMA_VERSION,
      raw_payload: rawPayload,
      request_context: args.request_context,
      payload_hash: await browserPayloadHash(rawPayload),
      normalization_status: "pending",
      normalization_error: null,
      normalized_journey_event_id: null,
      person_id: null,
      journey_id: null,
      normalization_attempts: 0,
      normalized_at: null,
    },
    warnings,
  };
}

export function buildBrowserJourneyEventInput(raw: BrowserRawEventRow, args: { person_id?: string | null } = {}): JourneyEventInput | null {
  const payload = raw.raw_payload || {};
  const eventType = normalizeBrowserEventType(raw.normalized_event_type || payload.normalized_event_type || raw.event_type);
  if (!eventType) return null;
  const marketing = normalizeBrowserMarketingFields(payload);
  const current = marketing.current;
  const isPurchase = eventType === "purchase";
  return {
    workspace_id: raw.workspace_id || "default",
    person_id: args.person_id || raw.person_id || null,
    platform_order_id: null,
    session_id: raw.session_id || firstText(payload.session_id, payload.sessionId),
    touchpoint_id: firstText(payload.touchpoint_id, payload.touchpointId, raw.tkid ? `${raw.tkid}:${raw.event_id}` : null),
    event_type: browserJourneyEventType(eventType),
    event_time: raw.event_time || raw.received_at,
    source_platform: "browser",
    source_connector: BROWSER_EVENTS_CONNECTOR_ID,
    source_record_id: raw.event_id,
    amount: isPurchase ? browserPurchaseAmount(payload) : null,
    currency: isPurchase ? browserPurchaseCurrency(payload) : null,
    affiliate_id: current.affiliate_id,
    offer_id: current.offer_id,
    campaign_id: current.campaign_id,
    source: current.source || current.utm_source,
    medium: current.medium || current.utm_medium,
    sub1: current.sub1,
    sub2: current.sub2,
    sub3: current.sub3,
    sub4: current.sub4,
    sub5: current.sub5,
    transaction_id: current.transaction_id,
    metadata: {
      source_table: BROWSER_EVENTS_RAW_TABLE,
      raw_event_id: raw.id || null,
      browser_event_id: raw.event_id,
      browser_event_type: eventType,
      original_event_type: raw.event_type,
      attribution_eligible: isBrowserAttributionEligible(eventType),
      browser_purchase_smoke_event: isPurchase,
      tkid: raw.tkid || null,
      order_id: isPurchase ? firstText(payload.order_id, payload.orderId, payload.order_number, payload.orderNumber, payload.properties?.order_id, payload.properties?.orderId) : null,
      page_url: safeUrlForDiagnostics(firstText(payload.page_url, payload.pageUrl, payload.url)),
      landing_url: safeUrlForDiagnostics(firstText(payload.landing_url, payload.landingUrl)),
      page_title: firstText(payload.page_title, payload.pageTitle),
      referrer_domain: firstText(payload.referrer_domain, payload.referrerDomain),
      first_touch: marketing.first_touch,
      current_touch: marketing.current_touch,
      current_params: current,
      original_param_names: marketing.original_param_names,
      sub6: current.sub6 || null,
      sub7: current.sub7 || null,
      sub8: current.sub8 || null,
      sub9: current.sub9 || null,
      sub10: current.sub10 || null,
      ad_click_ids: {
        gclid: current.gclid || null,
        fbclid: current.fbclid || null,
        ttclid: current.ttclid || null,
        msclkid: current.msclkid || null,
        irclickid: current.irclickid || null,
        click_id: current.click_id || null,
      },
      consent: payload.consent && typeof payload.consent === "object" ? payload.consent : null,
      screen: payload.screen && typeof payload.screen === "object" ? payload.screen : null,
      locale: firstText(payload.locale),
      timezone: firstText(payload.timezone),
      request_context: raw.request_context || {},
      attribution_evidence_v1: extractBrowserAttributionEvidence(payload),
    },
  };
}

export function browserOriginAllowed(origin: unknown, allowedOrigins: unknown) {
  const originText = cleanText(origin);
  if (!originText) return true;
  const allowed = Array.isArray(allowedOrigins)
    ? allowedOrigins.map(cleanText).filter(Boolean)
    : cleanText(allowedOrigins).split(",").map(cleanText).filter(Boolean);
  if (!allowed.length) return false;
  return allowed.some((item) => {
    if (item === "*") return true;
    if (item === originText) return true;
    if (item.startsWith("*.")) {
      try {
        const host = new URL(originText).hostname.toLowerCase();
        const suffix = item.slice(1).toLowerCase();
        return host.endsWith(suffix);
      } catch {
        return false;
      }
    }
    return false;
  });
}

export function browserCorsHeaders(origin: unknown, allowed = false) {
  const originText = cleanText(origin);
  const allowOrigin = allowed && originText ? originText : allowed ? "*" : "null";
  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-headers": "Content-Type, Authorization, X-TraceKit-Write-Key, X-TraceKit-Workspace-Id",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-max-age": "86400",
    "vary": "Origin",
  };
}

export function browserSetupSnippet(args: { workspace_id: string; endpoint: string }) {
  const workspaceId = cleanText(args.workspace_id) || "default";
  const endpoint = cleanText(args.endpoint) || "https://tracekit-api.example.com";
  return `<script src="https://cdn.tracekit.io/v1/tracekit.js"></script>
<script>
  TraceKit.init({
    workspaceId: "${workspaceId}",
    writeKey: "tk_pub_...",
    endpoint: "${endpoint}"
  });
</script>`;
}
