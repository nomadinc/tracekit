import { cleanText } from "./identity-normalization.ts";
import { normalizeJourneyMetadata, normalizeJourneyTimestamp, type JourneyEventRow } from "./journey-events.ts";

export const EVENT_EXPLORER_DEFAULT_LIMIT = 50;
export const EVENT_EXPLORER_MAX_LIMIT = 100;

export type EventExplorerRouteMatch =
  | { kind: "event_list" }
  | { kind: "event_detail"; event_key: string }
  | { kind: "method_not_allowed"; path: string; allowed_methods: string[] };

export type EventExplorerCursor = {
  event_time: string;
  id: string;
};

export type EventExplorerListParams = {
  workspace_id: string;
  limit: number;
  cursor: EventExplorerCursor | null;
  sort: "event_time";
  dir: "asc" | "desc";
  from: string | null;
  to_exclusive: string | null;
  event_type: string | null;
  status: string | null;
  source: string | null;
  affiliate_id: string | null;
  person_id: string | null;
  journey_id: string | null;
  origin: "all" | "browser" | "server";
  needs_review: boolean;
  normalized: boolean;
  failed: boolean;
  search: string | null;
};

type BrowserRawEventRow = Record<string, any>;
type AttributionCreditRow = Record<string, any>;
type CommissionRow = Record<string, any>;
type PersonRow = Record<string, any>;

const BROWSER_EVENT_SELECT = [
  "id",
  "event_id",
  "workspace_id",
  "received_at",
  "event_time",
  "event_type",
  "normalized_event_type",
  "tkid",
  "session_id",
  "person_id",
  "journey_id",
  "source",
  "raw_payload",
  "request_context",
  "normalization_status",
  "normalization_error",
  "normalization_attempts",
  "normalization_job_id",
  "normalized_journey_event_id",
  "normalized_at",
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

const PEOPLE_SELECT = "id,workspace_id,display_name,primary_email,primary_phone,status";
const ATTRIBUTION_SELECT = "id,workspace_id,journey_id,person_id,conversion_event_id,touchpoint_event_id,model,model_version,status,credit_amount,currency,affiliate_id,calculated_at,metadata";
const COMMISSION_SELECT = "id,workspace_id,commission_event_id,journey_attribution_credit_id,conversion_event_id,touchpoint_event_id,model,model_version,affiliate_id,publisher_id,commission_amount,currency,status,generated_at,created_at";

function nullableText(value: unknown) {
  return cleanText(value) || null;
}

function normalizeLimit(value: unknown) {
  return Math.max(1, Math.min(EVENT_EXPLORER_MAX_LIMIT, Math.floor(Number(value || EVENT_EXPLORER_DEFAULT_LIMIT)) || EVENT_EXPLORER_DEFAULT_LIMIT));
}

function parseBool(value: unknown) {
  const text = cleanText(value).toLowerCase();
  return text === "true" || text === "1" || text === "yes";
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

function safeFilterText(value: unknown) {
  const text = cleanText(value);
  return text ? text.slice(0, 160) : null;
}

function safeLikeTerm(value: string | null) {
  if (!value) return null;
  const text = value.replace(/[%,()]/g, " ").trim().replace(/\s+/g, " ");
  return text ? `%${text.slice(0, 120)}%` : null;
}

export function encodeEventExplorerCursor(cursor: EventExplorerCursor | null) {
  return cursor ? JSON.stringify(cursor) : null;
}

export function decodeEventExplorerCursor(value: unknown): EventExplorerCursor | null {
  const text = cleanText(value);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    const eventTime = normalizeDateParam(parsed?.event_time);
    const id = cleanText(parsed?.id);
    return eventTime && id ? { event_time: eventTime, id } : null;
  } catch {
    return null;
  }
}

export function normalizeEventExplorerListParams(args: Record<string, unknown>): EventExplorerListParams {
  const from = normalizeDateParam(args.from);
  const toExclusive = normalizeDateParam(args.to, true);
  if (from && toExclusive && Date.parse(from) >= Date.parse(toExclusive)) {
    throw Object.assign(new Error("from must be before to."), { status: 400, code: "bad_request" });
  }
  const origin = cleanText(args.origin || args.browser_or_server || args.browserOrServer).toLowerCase();
  const dir = cleanText(args.dir).toLowerCase() === "asc" ? "asc" : "desc";
  return {
    workspace_id: cleanText(args.workspace_id || args.workspaceId) || "default",
    limit: normalizeLimit(args.limit),
    cursor: decodeEventExplorerCursor(args.cursor),
    sort: "event_time",
    dir,
    from,
    to_exclusive: toExclusive,
    event_type: safeFilterText(args.event_type || args.eventType),
    status: safeFilterText(args.status),
    source: safeFilterText(args.source),
    affiliate_id: safeFilterText(args.affiliate_id || args.affiliateId),
    person_id: safeFilterText(args.person_id || args.personId),
    journey_id: safeFilterText(args.journey_id || args.journeyId),
    origin: origin === "browser" || origin === "server" ? origin : "all",
    needs_review: parseBool(args.needs_review || args.needsReview),
    normalized: parseBool(args.normalized),
    failed: parseBool(args.failed),
    search: safeFilterText(args.search || args.q),
  };
}

export function matchEventExplorerRoute(method: string, path: string): EventExplorerRouteMatch | null {
  if (/^\/v1\/events\/?$/.test(path)) {
    if (method === "GET") return { kind: "event_list" };
    return { kind: "method_not_allowed", path: "/v1/events", allowed_methods: ["GET"] };
  }
  const detail = path.match(/^\/v1\/events\/([^/]+)\/?$/);
  if (detail && detail[1] !== "browser") {
    if (method === "GET") return { kind: "event_detail", event_key: decodeURIComponent(detail[1] || "") };
    return { kind: "method_not_allowed", path: "/v1/events/:event_key", allowed_methods: ["GET"] };
  }
  return null;
}

function rawPayloadText(row: BrowserRawEventRow, ...keys: string[]) {
  const payload = row.raw_payload && typeof row.raw_payload === "object" ? row.raw_payload : {};
  for (const key of keys) {
    const value = key.split(".").reduce((current: any, part) => current && typeof current === "object" ? current[part] : undefined, payload);
    const text = nullableText(value);
    if (text) return text;
  }
  return null;
}

function eventAmount(value: unknown) {
  if (value === null || value === undefined || cleanText(value) === "") return null;
  const number = Number(cleanText(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

function personSummary(person: PersonRow | null | undefined) {
  if (!person) return null;
  return {
    id: person.id,
    display_name: person.display_name || null,
    email: person.primary_email || null,
    phone: person.primary_phone || null,
    status: person.status || null,
  };
}

function creditsForEvent(credits: AttributionCreditRow[], journeyEventId: string | null) {
  if (!journeyEventId) return [];
  return credits.filter((credit) =>
    cleanText(credit.conversion_event_id) === journeyEventId ||
    cleanText(credit.touchpoint_event_id) === journeyEventId
  );
}

export function summarizeAttributionStatus(eventType: string, affiliateId: string | null, credits: AttributionCreditRow[]) {
  if (credits.some((credit) => cleanText(credit.status) === "attributed")) return "attributed";
  if (credits.some((credit) => cleanText(credit.status) === "unattributed")) return "unattributed";
  if (["purchase", "lead_created", "checkout_started", "upsell", "subscription_started", "subscription_renewed"].includes(eventType)) return "not_calculated";
  if (affiliateId) return "eligible_touchpoint";
  return "not_applicable";
}

export function summarizeCommissionStatus(commissions: CommissionRow[]) {
  if (!commissions.length) return "not_commissioned";
  const statuses = Array.from(new Set(commissions.map((commission) => cleanText(commission.status) || "draft")));
  if (statuses.includes("paid")) return "paid";
  if (statuses.includes("approved")) return "approved";
  if (statuses.includes("pending")) return "pending";
  if (statuses.includes("draft")) return "draft";
  return statuses[0] || "commissioned";
}

function compactBrowserEvent(args: {
  row: BrowserRawEventRow;
  journeyEvent?: JourneyEventRow | null;
  person?: PersonRow | null;
  credits?: AttributionCreditRow[];
  commissions?: CommissionRow[];
}) {
  const row = args.row;
  const journeyEvent: any = args.journeyEvent || null;
  const eventType = cleanText(row.normalized_event_type || row.event_type || journeyEvent?.event_type || "custom");
  const affiliateId = nullableText(journeyEvent?.affiliate_id) || rawPayloadText(row, "affiliate_id", "current.affiliate_id", "properties.affiliate_id");
  const amount = eventAmount(journeyEvent?.amount ?? rawPayloadText(row, "amount", "properties.amount", "value"));
  const currency = nullableText(journeyEvent?.currency) || rawPayloadText(row, "currency", "properties.currency");
  const credits = args.credits || [];
  const commissions = args.commissions || [];
  return {
    event_key: `browser:${row.id}`,
    record_source: "browser",
    record_id: row.id,
    event_id: row.event_id,
    journey_event_id: journeyEvent?.id || row.normalized_journey_event_id || null,
    timestamp: row.event_time || row.received_at,
    event_time: row.event_time || row.received_at,
    received_at: row.received_at || null,
    event_type: eventType,
    raw_event_type: row.event_type || null,
    status: row.normalization_status || "pending",
    source: row.source || "browser",
    browser_or_server: "browser",
    person_id: row.person_id || journeyEvent?.person_id || null,
    person: personSummary(args.person),
    journey_id: row.journey_id || journeyEvent?.journey_id || null,
    affiliate_id: affiliateId,
    amount,
    currency,
    tkid: row.tkid || null,
    session_id: row.session_id || null,
    attribution_status: summarizeAttributionStatus(eventType, affiliateId, credits),
    commission_status: summarizeCommissionStatus(commissions),
    needs_review: row.normalization_status === "review",
    normalized: row.normalization_status === "normalized",
    failed: ["error", "invalid", "unsupported"].includes(cleanText(row.normalization_status)),
  };
}

function compactServerEvent(args: {
  row: JourneyEventRow & { journey_id?: string | null };
  person?: PersonRow | null;
  credits?: AttributionCreditRow[];
  commissions?: CommissionRow[];
}) {
  const row = args.row;
  const eventType = cleanText(row.event_type || "custom");
  const affiliateId = nullableText(row.affiliate_id);
  const credits = args.credits || [];
  const commissions = args.commissions || [];
  return {
    event_key: `journey:${row.id}`,
    record_source: "journey",
    record_id: row.id,
    event_id: row.id,
    journey_event_id: row.id,
    timestamp: row.event_time,
    event_time: row.event_time,
    received_at: row.created_at || null,
    event_type: eventType,
    raw_event_type: null,
    status: "normalized",
    source: row.source_platform || row.source_connector || row.source || "server",
    browser_or_server: "server",
    person_id: row.person_id || null,
    person: personSummary(args.person),
    journey_id: row.journey_id || null,
    affiliate_id: affiliateId,
    amount: eventAmount(row.amount),
    currency: row.currency || null,
    tkid: normalizeJourneyMetadata(row.metadata).tkid || null,
    session_id: row.session_id || null,
    attribution_status: summarizeAttributionStatus(eventType, affiliateId, credits),
    commission_status: summarizeCommissionStatus(commissions),
    needs_review: false,
    normalized: true,
    failed: false,
  };
}

export function sortEventExplorerItems<T extends { event_time?: string | null; timestamp?: string | null; event_key: string }>(items: T[], dir: "asc" | "desc") {
  return [...items].sort((a, b) => {
    const aTime = Date.parse(cleanText(a.event_time || a.timestamp));
    const bTime = Date.parse(cleanText(b.event_time || b.timestamp));
    const timeCompare = (Number.isFinite(aTime) ? aTime : 0) - (Number.isFinite(bTime) ? bTime : 0);
    if (timeCompare) return dir === "asc" ? timeCompare : -timeCompare;
    const keyCompare = cleanText(a.event_key).localeCompare(cleanText(b.event_key));
    return dir === "asc" ? keyCompare : -keyCompare;
  });
}

function itemMatchesPostFilters(item: any, params: EventExplorerListParams) {
  if (params.affiliate_id && cleanText(item.affiliate_id) !== params.affiliate_id) return false;
  if (params.person_id && cleanText(item.person_id) !== params.person_id) return false;
  if (params.journey_id && cleanText(item.journey_id) !== params.journey_id) return false;
  if (!params.search) return true;
  const haystack = [
    item.event_id,
    item.event_key,
    item.event_type,
    item.status,
    item.source,
    item.person_id,
    item.person?.display_name,
    item.person?.email,
    item.journey_id,
    item.affiliate_id,
    item.tkid,
    item.session_id,
  ].map(cleanText).join(" ").toLowerCase();
  return haystack.includes(params.search.toLowerCase());
}

function cursorFilter(query: any, params: EventExplorerListParams) {
  if (!params.cursor) return query;
  const op = params.dir === "asc" ? "gt" : "lt";
  return query.or(`event_time.${op}.${params.cursor.event_time},and(event_time.eq.${params.cursor.event_time},id.${op}.${params.cursor.id})`);
}

function applyCommonQueryFilters(query: any, params: EventExplorerListParams) {
  if (params.from) query = query.gte("event_time", params.from);
  if (params.to_exclusive) query = query.lt("event_time", params.to_exclusive);
  query = cursorFilter(query, params);
  return query;
}

function browserStatusSet(params: EventExplorerListParams) {
  const statuses = new Set<string>();
  if (params.status) statuses.add(params.status);
  if (params.needs_review) statuses.add("review");
  if (params.normalized) statuses.add("normalized");
  if (params.failed) ["error", "invalid", "unsupported"].forEach((status) => statuses.add(status));
  return Array.from(statuses);
}

async function queryBrowserEvents(supabase: any, params: EventExplorerListParams, limit: number) {
  let query = supabase
    .from("browser_events_raw")
    .select(BROWSER_EVENT_SELECT)
    .eq("workspace_id", params.workspace_id)
    .order("event_time", { ascending: params.dir === "asc" })
    .order("id", { ascending: params.dir === "asc" })
    .limit(limit);
  query = applyCommonQueryFilters(query, params);
  if (params.event_type) query = query.or(`normalized_event_type.eq.${params.event_type},event_type.eq.${params.event_type}`);
  const statuses = browserStatusSet(params);
  if (statuses.length === 1) query = query.eq("normalization_status", statuses[0]);
  if (statuses.length > 1) query = query.in("normalization_status", statuses);
  if (params.source) query = query.eq("source", params.source);
  const like = safeLikeTerm(params.search);
  if (like) query = query.or(`event_id.ilike.${like},tkid.ilike.${like},session_id.ilike.${like},source.ilike.${like},event_type.ilike.${like},normalized_event_type.ilike.${like}`);
  const { data, error } = await query;
  if (error) throw new Error(`Browser event explorer lookup failed: ${error.message}`);
  return data || [];
}

async function queryServerJourneyEvents(supabase: any, params: EventExplorerListParams, limit: number) {
  if (params.needs_review || params.failed) return [];
  if (params.status && params.status !== "normalized") return [];
  let query = supabase
    .from("journey_events")
    .select(JOURNEY_EVENT_SELECT)
    .eq("workspace_id", params.workspace_id)
    .neq("source_platform", "browser")
    .order("event_time", { ascending: params.dir === "asc" })
    .order("id", { ascending: params.dir === "asc" })
    .limit(limit);
  query = applyCommonQueryFilters(query, params);
  if (params.event_type) query = query.eq("event_type", params.event_type);
  if (params.source) query = query.or(`source_platform.eq.${params.source},source_connector.eq.${params.source},source.eq.${params.source}`);
  if (params.affiliate_id) query = query.eq("affiliate_id", params.affiliate_id);
  if (params.person_id) query = query.eq("person_id", params.person_id);
  if (params.journey_id) query = query.eq("journey_id", params.journey_id);
  const like = safeLikeTerm(params.search);
  if (like) query = query.or(`id.ilike.${like},source_record_id.ilike.${like},platform_order_id.ilike.${like},transaction_id.ilike.${like},affiliate_id.ilike.${like},event_type.ilike.${like}`);
  const { data, error } = await query;
  if (error) throw new Error(`Journey event explorer lookup failed: ${error.message}`);
  return data || [];
}

async function findByIds(supabase: any, table: string, select: string, column: string, ids: string[]) {
  const unique = Array.from(new Set(ids.map(cleanText).filter(Boolean)));
  if (!unique.length) return [];
  const { data, error } = await supabase.from(table).select(select).in(column, unique);
  if (error) throw new Error(`${table} lookup failed: ${error.message}`);
  return data || [];
}

async function loadAttributionCredits(supabase: any, workspaceId: string, journeyEventIds: string[]) {
  const unique = Array.from(new Set(journeyEventIds.map(cleanText).filter(Boolean)));
  if (!unique.length) return [];
  const [conversion, touchpoint] = await Promise.all([
    supabase.from("journey_attribution_credits").select(ATTRIBUTION_SELECT).eq("workspace_id", workspaceId).in("conversion_event_id", unique),
    supabase.from("journey_attribution_credits").select(ATTRIBUTION_SELECT).eq("workspace_id", workspaceId).in("touchpoint_event_id", unique),
  ]);
  if (conversion.error) throw new Error(`Attribution conversion lookup failed: ${conversion.error.message}`);
  if (touchpoint.error) throw new Error(`Attribution touchpoint lookup failed: ${touchpoint.error.message}`);
  return [...(conversion.data || []), ...(touchpoint.data || [])];
}

async function loadCommissions(supabase: any, workspaceId: string, journeyEventIds: string[]) {
  const unique = Array.from(new Set(journeyEventIds.map(cleanText).filter(Boolean)));
  if (!unique.length) return [];
  const { data, error } = await supabase
    .from("affiliate_commissions")
    .select(COMMISSION_SELECT)
    .eq("workspace_id", workspaceId)
    .in("conversion_event_id", unique);
  if (error) throw new Error(`Affiliate commission event lookup failed: ${error.message}`);
  return data || [];
}

export async function listEventExplorerEvents(supabase: any, params: EventExplorerListParams) {
  const fetchLimit = Math.min(EVENT_EXPLORER_MAX_LIMIT * 2, params.limit * 3 + 3);
  const [browserRows, serverRows] = await Promise.all([
    params.origin === "server" ? Promise.resolve([]) : queryBrowserEvents(supabase, params, fetchLimit),
    params.origin === "browser" ? Promise.resolve([]) : queryServerJourneyEvents(supabase, params, fetchLimit),
  ]);

  const normalizedJourneyIds = browserRows.map((row: any) => cleanText(row.normalized_journey_event_id)).filter(Boolean);
  const journeyRowsById = new Map<string, any>();
  for (const row of serverRows) journeyRowsById.set(cleanText(row.id), row);
  for (const row of await findByIds(supabase, "journey_events", JOURNEY_EVENT_SELECT, "id", normalizedJourneyIds)) {
    journeyRowsById.set(cleanText(row.id), row);
  }

  const allJourneyIds = [
    ...serverRows.map((row: any) => cleanText(row.id)),
    ...normalizedJourneyIds,
  ].filter(Boolean);
  const allPersonIds = [
    ...browserRows.map((row: any) => cleanText(row.person_id)),
    ...serverRows.map((row: any) => cleanText(row.person_id)),
    ...Array.from(journeyRowsById.values()).map((row: any) => cleanText(row.person_id)),
  ].filter(Boolean);
  const [people, credits, commissions] = await Promise.all([
    findByIds(supabase, "people", PEOPLE_SELECT, "id", allPersonIds),
    loadAttributionCredits(supabase, params.workspace_id, allJourneyIds),
    loadCommissions(supabase, params.workspace_id, allJourneyIds),
  ]);

  const peopleById = new Map<string, PersonRow>(people.map((person: any) => [cleanText(person.id), person]));
  const items = [
    ...browserRows.map((row: any) => {
      const journey = row.normalized_journey_event_id ? journeyRowsById.get(cleanText(row.normalized_journey_event_id)) : null;
      const personId = cleanText(row.person_id || journey?.person_id);
      const journeyId = cleanText(journey?.id);
      return compactBrowserEvent({
        row,
        journeyEvent: journey,
        person: peopleById.get(personId),
        credits: creditsForEvent(credits, journeyId),
        commissions: commissions.filter((commission: any) => cleanText(commission.conversion_event_id) === journeyId),
      });
    }),
    ...serverRows.map((row: any) => compactServerEvent({
      row,
      person: peopleById.get(cleanText(row.person_id)),
      credits: creditsForEvent(credits, cleanText(row.id)),
      commissions: commissions.filter((commission: any) => cleanText(commission.conversion_event_id) === cleanText(row.id)),
    })),
  ].filter((item) => itemMatchesPostFilters(item, params));

  const sorted = sortEventExplorerItems(items, params.dir);
  const page = sorted.slice(0, params.limit);
  const last = page[page.length - 1] || null;
  return {
    ok: true,
    workspace_id: params.workspace_id,
    events: page,
    limit: params.limit,
    sort: params.sort,
    dir: params.dir,
    has_more: sorted.length > params.limit || browserRows.length >= fetchLimit || serverRows.length >= fetchLimit,
    next_cursor: last ? encodeEventExplorerCursor({ event_time: normalizeJourneyTimestamp(last.event_time || last.timestamp), id: cleanText(last.record_id) }) : null,
  };
}

function parseEventKey(value: unknown) {
  const text = cleanText(value);
  const [prefix, ...rest] = text.split(":");
  const id = rest.join(":");
  if ((prefix === "browser" || prefix === "journey") && id) return { source: prefix, id };
  return { source: "unknown", id: text };
}

async function findBrowserDetail(supabase: any, workspaceId: string, id: string) {
  const byId = await supabase.from("browser_events_raw").select(BROWSER_EVENT_SELECT).eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
  if (byId.error) throw new Error(`Browser event detail lookup failed: ${byId.error.message}`);
  if (byId.data) return byId.data;
  const byEventId = await supabase.from("browser_events_raw").select(BROWSER_EVENT_SELECT).eq("workspace_id", workspaceId).eq("event_id", id).maybeSingle();
  if (byEventId.error) throw new Error(`Browser event detail lookup failed: ${byEventId.error.message}`);
  return byEventId.data || null;
}

async function findJourneyDetail(supabase: any, workspaceId: string, id: string) {
  const { data, error } = await supabase.from("journey_events").select(JOURNEY_EVENT_SELECT).eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
  if (error) throw new Error(`Journey event detail lookup failed: ${error.message}`);
  return data || null;
}

async function findBrowserForJourneyEvent(supabase: any, workspaceId: string, journeyEventId: string) {
  const { data, error } = await supabase
    .from("browser_events_raw")
    .select(BROWSER_EVENT_SELECT)
    .eq("workspace_id", workspaceId)
    .eq("normalized_journey_event_id", journeyEventId)
    .maybeSingle();
  if (error) throw new Error(`Browser event detail lookup failed: ${error.message}`);
  return data || null;
}

async function previousNextJourneyEvents(supabase: any, journeyEvent: any) {
  const workspaceId = cleanText(journeyEvent?.workspace_id);
  const journeyId = cleanText(journeyEvent?.journey_id);
  const eventTime = cleanText(journeyEvent?.event_time);
  const id = cleanText(journeyEvent?.id);
  if (!workspaceId || !journeyId || !eventTime || !id) return { previous: null, next: null };
  const [previous, next] = await Promise.all([
    supabase
      .from("journey_events")
      .select(JOURNEY_EVENT_SELECT)
      .eq("workspace_id", workspaceId)
      .eq("journey_id", journeyId)
      .or(`event_time.lt.${eventTime},and(event_time.eq.${eventTime},id.lt.${id})`)
      .order("event_time", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("journey_events")
      .select(JOURNEY_EVENT_SELECT)
      .eq("workspace_id", workspaceId)
      .eq("journey_id", journeyId)
      .or(`event_time.gt.${eventTime},and(event_time.eq.${eventTime},id.gt.${id})`)
      .order("event_time", { ascending: true })
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  if (previous.error) throw new Error(`Previous event lookup failed: ${previous.error.message}`);
  if (next.error) throw new Error(`Next event lookup failed: ${next.error.message}`);
  return { previous: previous.data || null, next: next.data || null };
}

function compactNeighbor(row: any) {
  if (!row) return null;
  return {
    event_key: `journey:${row.id}`,
    event_id: row.id,
    event_type: row.event_type,
    event_time: row.event_time,
    source: row.source_platform || row.source_connector || row.source || null,
  };
}

function timelineStage(name: string, at: string | null, status: string, previousAt?: string | null) {
  const atMs = at ? Date.parse(at) : NaN;
  const prevMs = previousAt ? Date.parse(previousAt) : NaN;
  return {
    name,
    timestamp: at,
    status,
    duration_ms: Number.isFinite(atMs) && Number.isFinite(prevMs) && atMs >= prevMs ? atMs - prevMs : null,
  };
}

export function buildEventExplorerTimeline(args: {
  browser?: BrowserRawEventRow | null;
  journey?: any | null;
  credits?: AttributionCreditRow[];
  commissions?: CommissionRow[];
}) {
  const browser = args.browser || null;
  const journey = args.journey || null;
  const credits = args.credits || [];
  const commissions = args.commissions || [];
  const receivedAt = browser?.received_at || journey?.created_at || null;
  const normalizedAt = browser?.normalized_at || journey?.created_at || null;
  const identityAt = (browser?.person_id || journey?.person_id) ? (browser?.updated_at || journey?.updated_at || normalizedAt) : null;
  const journeyAt = (browser?.journey_id || journey?.journey_id) ? (browser?.updated_at || journey?.updated_at || identityAt) : null;
  const attributedTimes = credits.map((credit) => cleanText(credit.calculated_at)).filter(Boolean).sort();
  const commissionedTimes = commissions.map((commission) => cleanText(commission.generated_at || commission.created_at)).filter(Boolean).sort();
  const attributedAt = attributedTimes[attributedTimes.length - 1] || null;
  const commissionedAt = commissionedTimes[commissionedTimes.length - 1] || null;
  return [
    timelineStage("Received", receivedAt, receivedAt ? "complete" : "pending"),
    timelineStage("Normalized", normalizedAt, normalizedAt ? "complete" : browser?.normalization_status === "error" ? "failed" : "pending", receivedAt),
    timelineStage("Identity", identityAt, identityAt ? "complete" : "pending", normalizedAt),
    timelineStage("Journey", journeyAt, journeyAt ? "complete" : "pending", identityAt),
    timelineStage("Attributed", attributedAt, attributedAt ? "complete" : "pending", journeyAt),
    timelineStage("Commission", commissionedAt, commissionedAt ? "complete" : "pending", attributedAt),
  ];
}

export async function getEventExplorerEventDetail(supabase: any, args: { workspace_id: string; event_key: string }) {
  const parsed = parseEventKey(args.event_key);
  let browser: any = null;
  let journey: any = null;
  if (parsed.source === "browser") {
    browser = await findBrowserDetail(supabase, args.workspace_id, parsed.id);
    if (browser?.normalized_journey_event_id) journey = await findJourneyDetail(supabase, args.workspace_id, browser.normalized_journey_event_id);
  } else if (parsed.source === "journey") {
    journey = await findJourneyDetail(supabase, args.workspace_id, parsed.id);
    if (journey?.source_platform === "browser") browser = await findBrowserForJourneyEvent(supabase, args.workspace_id, journey.id);
  } else {
    browser = await findBrowserDetail(supabase, args.workspace_id, parsed.id);
    if (browser?.normalized_journey_event_id) journey = await findJourneyDetail(supabase, args.workspace_id, browser.normalized_journey_event_id);
    if (!browser && !journey) journey = await findJourneyDetail(supabase, args.workspace_id, parsed.id);
  }
  if (!browser && !journey) throw Object.assign(new Error("Event not found."), { status: 404, code: "not_found" });

  const journeyId = cleanText(journey?.id || browser?.normalized_journey_event_id);
  const personId = cleanText(browser?.person_id || journey?.person_id);
  const [people, credits, commissions, neighbors] = await Promise.all([
    findByIds(supabase, "people", PEOPLE_SELECT, "id", personId ? [personId] : []),
    loadAttributionCredits(supabase, args.workspace_id, journeyId ? [journeyId] : []),
    loadCommissions(supabase, args.workspace_id, journeyId ? [journeyId] : []),
    journey ? previousNextJourneyEvents(supabase, journey) : Promise.resolve({ previous: null, next: null }),
  ]);
  const person = people[0] || null;
  const item = browser
    ? compactBrowserEvent({ row: browser, journeyEvent: journey, person, credits, commissions })
    : compactServerEvent({ row: journey, person, credits, commissions });
  const winningTouch = credits.find((credit: any) => cleanText(credit.status) === "attributed" && cleanText(credit.touchpoint_event_id)) || null;
  return {
    ok: true,
    workspace_id: args.workspace_id,
    event: item,
    summary: {
      event_type: item.event_type,
      time: item.event_time,
      status: item.status,
    },
    identity: {
      person: personSummary(person),
      email: person?.primary_email || null,
      phone: person?.primary_phone || null,
      tkid: browser?.tkid || normalizeJourneyMetadata(journey?.metadata).tkid || null,
      session_id: browser?.session_id || journey?.session_id || null,
    },
    journey: {
      journey_id: item.journey_id,
      previous_event: compactNeighbor(neighbors.previous),
      next_event: compactNeighbor(neighbors.next),
    },
    attribution: {
      status: item.attribution_status,
      winning_touch: winningTouch ? {
        touchpoint_event_id: winningTouch.touchpoint_event_id || null,
        model: winningTouch.model || null,
        credit_amount: winningTouch.credit_amount === null || winningTouch.credit_amount === undefined ? null : String(winningTouch.credit_amount),
        currency: winningTouch.currency || null,
      } : null,
      credits: credits.map((credit: any) => ({
        id: credit.id,
        model: credit.model,
        model_version: credit.model_version,
        status: credit.status,
        touchpoint_event_id: credit.touchpoint_event_id || null,
        credit_amount: credit.credit_amount === null || credit.credit_amount === undefined ? null : String(credit.credit_amount),
        currency: credit.currency || null,
        calculated_at: credit.calculated_at || null,
      })),
    },
    commission: {
      status: item.commission_status,
      commissions: commissions.map((commission: any) => ({
        id: commission.id,
        commission_event_id: commission.commission_event_id,
        status: commission.status,
        model: commission.model,
        commission_amount: commission.commission_amount === null || commission.commission_amount === undefined ? null : String(commission.commission_amount),
        currency: commission.currency || null,
        generated_at: commission.generated_at || commission.created_at || null,
      })),
    },
    technical: {
      raw_payload: browser?.raw_payload || null,
      normalized_payload: journey ? {
        id: journey.id,
        event_type: journey.event_type,
        event_time: journey.event_time,
        source_platform: journey.source_platform,
        source_connector: journey.source_connector,
        source_record_id: journey.source_record_id,
        amount: journey.amount === null || journey.amount === undefined ? null : String(journey.amount),
        currency: journey.currency || null,
        metadata: normalizeJourneyMetadata(journey.metadata),
      } : null,
      processing_timeline: buildEventExplorerTimeline({ browser, journey, credits, commissions }),
    },
  };
}
