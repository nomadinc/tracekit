import { cleanText } from "./identity-normalization.ts";
import {
  compactJourneyEvent,
  decodeJourneyTimelineCursor,
  encodeJourneyTimelineCursor,
  journeyBackfillDateRange,
  normalizeJourneyAmount,
  normalizeJourneyMetadata,
  normalizeJourneyTimestamp,
  type JourneyEventRow,
  type JourneyEventType,
  type JourneyTimelineCursor,
} from "./journey-events.ts";

export const JOURNEY_ENGINE_CONNECTOR_ID = "journey-engine-backfill";
export const JOURNEY_ENGINE_JOB_TYPE = "journey_assignment_backfill";
export const JOURNEY_ENGINE_PHASE = "assign_journeys";
export const JOURNEY_BOUNDARY_VERSION = "v1_inactivity_timeout";
export const JOURNEY_DEFAULT_TIMEOUT_DAYS = 30;
export const JOURNEY_DEFAULT_TIMEOUT_SECONDS = JOURNEY_DEFAULT_TIMEOUT_DAYS * 24 * 60 * 60;
export const JOURNEY_ASSIGNMENT_DEFAULT_BATCH_SIZE = 10;
export const JOURNEY_ASSIGNMENT_MAX_BATCH_SIZE = 10;

export const JOURNEY_EVENT_ASSIGNMENT_SELECT = [
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

export const JOURNEY_ASSIGNMENT_BACKFILL_INDEX = {
  table: "journey_events",
  columns: ["workspace_id", "person_id", "event_time", "id"],
  filters: [
    "workspace_id = ?",
    "person_id is not null",
    "journey_id is null",
    "event_time >= ?",
    "event_time < ?",
    "(person_id, event_time, id) > cursor when cursor exists",
  ],
  order_by: ["person_id asc", "event_time asc", "id asc"],
} as const;

export const JOURNEY_CONVERSION_EVENT_TYPES: readonly JourneyEventType[] = [
  "purchase",
  "upsell",
  "subscription_started",
  "subscription_renewed",
];

export type JourneyStatus = "active" | "completed" | "abandoned";

export type JourneyEventWithJourney = JourneyEventRow & {
  journey_id?: string | null;
};

export type JourneyRow = {
  id: string;
  workspace_id: string;
  person_id: string;
  started_at: string;
  ended_at: string;
  status: JourneyStatus;
  entry_event_id: string | null;
  conversion_event_id: string | null;
  conversion_count: number;
  purchase_count: number;
  total_revenue: string | number | null;
  event_count: number;
  is_active: boolean;
  boundary_version: string;
  boundary_timeout_seconds: number;
  attribution_window_config: Record<string, any>;
  metadata: Record<string, any>;
  created_at?: string | null;
  updated_at?: string | null;
};

export type JourneyDraft = Omit<JourneyRow, "id" | "created_at" | "updated_at"> & {
  id?: string;
};

export type JourneyBackfillCursor = {
  person_id: string;
  event_time: string;
  id: string;
};

export type JourneyListCursor = {
  started_at: string;
  id: string;
};

export type JourneyBackfillRequest = {
  workspace_id: string;
  from: string;
  to: string;
  batch_size: number;
  cursor: string | null;
  job_id: string | null;
  timeout_seconds: number;
};

export type JourneyBackfillResult = {
  ok: boolean;
  events_scanned: number;
  journeys_created: number;
  events_linked: number;
  events_skipped: number;
  records_failed: number;
  has_more: boolean;
  next_cursor: string | null;
  errors: Array<{ event_id: string | null; message: string }>;
};

export type PersonJourneysParams = {
  workspace_id: string;
  person_id: string;
  limit: number;
  cursor: JourneyListCursor | null;
};

export type JourneyDetailParams = {
  workspace_id: string;
  journey_id: string;
  limit: number;
  cursor: JourneyTimelineCursor | null;
};

export type JourneyRouteMatch =
  | { kind: "person_journeys"; person_id: string }
  | { kind: "journey_detail"; journey_id: string }
  | { kind: "method_not_allowed"; path: string; allowed_methods: string[] };

export interface JourneyRepository {
  getPersonById(workspaceId: string, personId: string): Promise<{ id: string; workspace_id: string } | null>;
  queryUnassignedJourneyEvents(args: {
    workspace_id: string;
    from_ts: string;
    to_exclusive_ts: string;
    cursor: JourneyBackfillCursor | null;
    limit: number;
  }): Promise<JourneyEventWithJourney[]>;
  getLatestAssignedEventBefore(args: {
    workspace_id: string;
    person_id: string;
    event_time: string;
    id: string;
  }): Promise<{ event: JourneyEventWithJourney; journey: JourneyRow } | null>;
  createJourney(row: JourneyDraft): Promise<JourneyRow>;
  updateJourneySummary(journeyId: string, patch: Partial<JourneyRow> & Record<string, any>): Promise<JourneyRow>;
  assignEventsToJourney(journeyId: string, eventIds: string[]): Promise<void>;
  getJourneyById(workspaceId: string, journeyId: string): Promise<JourneyRow | null>;
  queryPersonJourneys(params: PersonJourneysParams & { limit: number }): Promise<JourneyRow[]>;
  queryJourneyEvents(params: JourneyDetailParams & { limit: number }): Promise<JourneyEventWithJourney[]>;
}

export class JourneyValidationError extends Error {
  status = 400;
  code = "bad_request";
}

export class JourneyNotFoundError extends Error {
  status = 404;
  code = "not_found";
}

function nullableText(value: unknown) {
  return cleanText(value) || null;
}

function parseYmd(value: unknown) {
  const text = cleanText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function normalizePositiveInteger(value: unknown, fallback: number, max: number) {
  const n = Math.floor(Number(value ?? fallback));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, n);
}

export function normalizeJourneyBoundaryTimeoutSeconds(value: unknown) {
  const fallback = JOURNEY_DEFAULT_TIMEOUT_SECONDS;
  const n = Math.floor(Number(value ?? fallback));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(60, Math.min(365 * 24 * 60 * 60, n));
}

export function normalizeJourneyBackfillRequest(body: any): { ok: true; value: JourneyBackfillRequest } | { ok: false; status: number; error: string; message: string } {
  const from = cleanText(body?.from);
  const to = cleanText(body?.to);
  const range = journeyBackfillDateRange(from, to);
  if (!from || !to) return { ok: false, status: 400, error: "bad_request", message: "from and to are required in YYYY-MM-DD format." };
  if (!range) return { ok: false, status: 400, error: "bad_request", message: "from/to must be valid YYYY-MM-DD dates and from must be on or before to." };
  return {
    ok: true,
    value: {
      workspace_id: cleanText(body?.workspace_id || body?.workspaceId) || "default",
      from,
      to,
      batch_size: normalizePositiveInteger(
        body?.batch_size ?? body?.batchSize,
        JOURNEY_ASSIGNMENT_DEFAULT_BATCH_SIZE,
        JOURNEY_ASSIGNMENT_MAX_BATCH_SIZE,
      ),
      cursor: nullableText(body?.cursor),
      job_id: nullableText(body?.job_id || body?.jobId),
      timeout_seconds: normalizeJourneyBoundaryTimeoutSeconds(body?.timeout_seconds ?? body?.timeoutSeconds),
    },
  };
}

export function serializeJourneyBackfillCursor(cursor: JourneyBackfillCursor | null) {
  return cursor ? encodeURIComponent(JSON.stringify(cursor)) : null;
}

export function decodeJourneyBackfillCursor(value: unknown): JourneyBackfillCursor | null {
  const text = cleanText(value);
  if (!text) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(text));
    const personId = cleanText(parsed?.person_id);
    const eventTime = normalizeJourneyTimestamp(parsed?.event_time, "cursor.event_time");
    const id = cleanText(parsed?.id);
    if (!personId || !id) throw new Error("cursor fields are required.");
    return { person_id: personId, event_time: eventTime, id };
  } catch {
    throw new JourneyValidationError("Invalid journey backfill cursor.");
  }
}

export function encodeJourneyListCursor(cursor: JourneyListCursor | null) {
  return cursor ? encodeURIComponent(JSON.stringify(cursor)) : null;
}

export function decodeJourneyListCursor(value: unknown): JourneyListCursor | null {
  const text = cleanText(value);
  if (!text) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(text));
    const startedAt = normalizeJourneyTimestamp(parsed?.started_at, "cursor.started_at");
    const id = cleanText(parsed?.id);
    if (!id) throw new Error("cursor.id is required.");
    return { started_at: startedAt, id };
  } catch {
    throw new JourneyValidationError("Invalid journey cursor.");
  }
}

export function normalizePersonJourneysParams(args: {
  workspace_id?: unknown;
  person_id?: unknown;
  limit?: unknown;
  cursor?: unknown;
}): PersonJourneysParams {
  const personId = cleanText(args.person_id);
  if (!personId) throw new JourneyValidationError("person_id is required.");
  return {
    workspace_id: cleanText(args.workspace_id) || "default",
    person_id: personId,
    limit: normalizePositiveInteger(args.limit, 50, 100),
    cursor: decodeJourneyListCursor(args.cursor),
  };
}

export function normalizeJourneyDetailParams(args: {
  workspace_id?: unknown;
  journey_id?: unknown;
  limit?: unknown;
  cursor?: unknown;
}): JourneyDetailParams {
  const journeyId = cleanText(args.journey_id);
  if (!journeyId) throw new JourneyValidationError("journey_id is required.");
  return {
    workspace_id: cleanText(args.workspace_id) || "default",
    journey_id: journeyId,
    limit: normalizePositiveInteger(args.limit, 50, 100),
    cursor: decodeJourneyTimelineCursor(args.cursor),
  };
}

export function matchJourneyRoutes(method: string, path: string): JourneyRouteMatch | null {
  const personMatch = path.match(/^\/v1\/persons\/([^/]+)\/journeys\/?$/);
  if (personMatch) {
    if (method !== "GET") return { kind: "method_not_allowed", path: "/v1/persons/:person_id/journeys", allowed_methods: ["GET"] };
    return { kind: "person_journeys", person_id: decodeURIComponent(personMatch[1] || "") };
  }

  const journeyMatch = path.match(/^\/v1\/journeys\/([^/]+)\/?$/);
  if (journeyMatch) {
    if (method !== "GET") return { kind: "method_not_allowed", path: "/v1/journeys/:journey_id", allowed_methods: ["GET"] };
    return { kind: "journey_detail", journey_id: decodeURIComponent(journeyMatch[1] || "") };
  }

  return null;
}

function decimalToMicros(value: unknown) {
  const normalized = normalizeJourneyAmount(value);
  if (normalized === null) return 0n;
  const negative = normalized.startsWith("-");
  const absolute = negative ? normalized.slice(1) : normalized;
  const [whole, fraction = ""] = absolute.split(".");
  const micros = BigInt(whole || "0") * 1000000n + BigInt(fraction.padEnd(6, "0").slice(0, 6) || "0");
  return negative ? -micros : micros;
}

function microsToDecimal(value: bigint) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 1000000n;
  const fraction = String(absolute % 1000000n).padStart(6, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toString()}${fraction ? `.${fraction}` : ""}`;
}

function addDecimalValues(...values: unknown[]) {
  return microsToDecimal(values.reduce((total, value) => total + decimalToMicros(value), 0n));
}

export function isJourneyConversionEventType(eventType: unknown) {
  return (JOURNEY_CONVERSION_EVENT_TYPES as readonly string[]).includes(cleanText(eventType));
}

function journeyRevenueForEvent(event: JourneyEventWithJourney) {
  return isJourneyConversionEventType(event.event_type) ? event.amount : null;
}

function eventTimestampMs(event: JourneyEventWithJourney) {
  return Date.parse(normalizeJourneyTimestamp(event.event_time));
}

export function sortJourneyEvents(events: JourneyEventWithJourney[]) {
  return [...events].sort((a, b) => eventTimestampMs(a) - eventTimestampMs(b) || cleanText(a.id).localeCompare(cleanText(b.id)));
}

export function deriveJourneyStatus(args: {
  ended_at: string;
  conversion_count: number;
  timeout_seconds: number;
  now?: string;
}): { status: JourneyStatus; is_active: boolean } {
  const nowMs = Date.parse(args.now || new Date().toISOString());
  const endedMs = Date.parse(normalizeJourneyTimestamp(args.ended_at, "ended_at"));
  const timedOut = Number.isFinite(nowMs) && nowMs - endedMs > args.timeout_seconds * 1000;
  if (!timedOut) return { status: "active", is_active: true };
  return {
    status: args.conversion_count > 0 ? "completed" : "abandoned",
    is_active: false,
  };
}

export function summarizeJourneyEvents(events: JourneyEventWithJourney[], args: {
  timeout_seconds?: number;
  now?: string;
  existing?: JourneyRow | null;
} = {}): Partial<JourneyRow> {
  const sorted = sortJourneyEvents(events);
  const existing = args.existing || null;
  const timeoutSeconds = normalizeJourneyBoundaryTimeoutSeconds(args.timeout_seconds ?? existing?.boundary_timeout_seconds);
  const first = sorted[0] || null;
  const last = sorted[sorted.length - 1] || null;
  const newPurchaseCount = sorted.filter((event) => event.event_type === "purchase").length;
  const newConversionEvents = sorted.filter((event) => isJourneyConversionEventType(event.event_type));
  const newRevenue = sorted.reduce((total, event) => total + decimalToMicros(journeyRevenueForEvent(event)), 0n);
  const currentRevenue = decimalToMicros(existing?.total_revenue ?? 0);
  const conversionCount = Number(existing?.conversion_count || 0) + newConversionEvents.length;
  const purchaseCount = Number(existing?.purchase_count || 0) + newPurchaseCount;
  const eventCount = Number(existing?.event_count || 0) + sorted.length;
  const startedAt = first
    ? existing?.started_at && Date.parse(existing.started_at) <= Date.parse(first.event_time)
      ? normalizeJourneyTimestamp(existing.started_at, "started_at")
      : normalizeJourneyTimestamp(first.event_time)
    : existing?.started_at ? normalizeJourneyTimestamp(existing.started_at, "started_at") : null;
  const endedAt = last
    ? existing?.ended_at && Date.parse(existing.ended_at) >= Date.parse(last.event_time)
      ? normalizeJourneyTimestamp(existing.ended_at, "ended_at")
      : normalizeJourneyTimestamp(last.event_time)
    : existing?.ended_at ? normalizeJourneyTimestamp(existing.ended_at, "ended_at") : null;
  if (!startedAt || !endedAt) throw new JourneyValidationError("Cannot summarize an empty journey.");
  const derived = deriveJourneyStatus({ ended_at: endedAt, conversion_count: conversionCount, timeout_seconds: timeoutSeconds, now: args.now });
  const firstConversion = newConversionEvents[0] || null;

  return {
    started_at: startedAt,
    ended_at: endedAt,
    status: derived.status,
    is_active: derived.is_active,
    entry_event_id: existing?.entry_event_id || first?.id || null,
    conversion_event_id: existing?.conversion_event_id || firstConversion?.id || null,
    conversion_count: conversionCount,
    purchase_count: purchaseCount,
    total_revenue: microsToDecimal(currentRevenue + newRevenue),
    event_count: eventCount,
    boundary_version: existing?.boundary_version || JOURNEY_BOUNDARY_VERSION,
    boundary_timeout_seconds: timeoutSeconds,
    attribution_window_config: normalizeJourneyMetadata(existing?.attribution_window_config),
    metadata: normalizeJourneyMetadata(existing?.metadata),
  };
}

export function buildNewJourneyDraft(event: JourneyEventWithJourney, args: { timeout_seconds: number; now?: string }): JourneyDraft {
  const personId = cleanText(event.person_id);
  if (!personId) throw new JourneyValidationError("Journey events must have a person_id.");
  const summary = summarizeJourneyEvents([event], args);
  return {
    workspace_id: cleanText(event.workspace_id) || "default",
    person_id: personId,
    started_at: summary.started_at!,
    ended_at: summary.ended_at!,
    status: summary.status as JourneyStatus,
    entry_event_id: summary.entry_event_id || event.id,
    conversion_event_id: summary.conversion_event_id || null,
    conversion_count: Number(summary.conversion_count || 0),
    purchase_count: Number(summary.purchase_count || 0),
    total_revenue: summary.total_revenue || "0",
    event_count: Number(summary.event_count || 0),
    is_active: Boolean(summary.is_active),
    boundary_version: JOURNEY_BOUNDARY_VERSION,
    boundary_timeout_seconds: args.timeout_seconds,
    attribution_window_config: {},
    metadata: {
      boundary_engine: JOURNEY_BOUNDARY_VERSION,
    },
  };
}

export function withinJourneyBoundary(previous: JourneyEventWithJourney | null, event: JourneyEventWithJourney, timeoutSeconds: number) {
  if (!previous || !previous.person_id || !event.person_id) return false;
  if (cleanText(previous.workspace_id) !== cleanText(event.workspace_id)) return false;
  if (cleanText(previous.person_id) !== cleanText(event.person_id)) return false;
  return eventTimestampMs(event) - eventTimestampMs(previous) <= timeoutSeconds * 1000;
}

export function compactJourney(row: JourneyRow) {
  return {
    id: row.id,
    person_id: row.person_id,
    started_at: normalizeJourneyTimestamp(row.started_at, "started_at"),
    ended_at: normalizeJourneyTimestamp(row.ended_at, "ended_at"),
    status: row.status,
    event_count: Number(row.event_count || 0),
    purchase_count: Number(row.purchase_count || 0),
    conversion_count: Number(row.conversion_count || 0),
    total_revenue: row.total_revenue === null || row.total_revenue === undefined ? "0" : String(row.total_revenue),
    is_active: Boolean(row.is_active),
    entry_event_id: row.entry_event_id || null,
    conversion_event_id: row.conversion_event_id || null,
    boundary_version: row.boundary_version || JOURNEY_BOUNDARY_VERSION,
    boundary_timeout_seconds: Number(row.boundary_timeout_seconds || JOURNEY_DEFAULT_TIMEOUT_SECONDS),
    metadata: normalizeJourneyMetadata(row.metadata),
  };
}

export async function assignJourneyEvents(repo: JourneyRepository, events: JourneyEventWithJourney[], args: {
  timeout_seconds?: number;
  now?: string;
} = {}): Promise<JourneyBackfillResult> {
  const timeoutSeconds = normalizeJourneyBoundaryTimeoutSeconds(args.timeout_seconds);
  const sorted = sortJourneyEvents(events);
  const result: JourneyBackfillResult = {
    ok: true,
    events_scanned: sorted.length,
    journeys_created: 0,
    events_linked: 0,
    events_skipped: 0,
    records_failed: 0,
    has_more: false,
    next_cursor: null,
    errors: [],
  };
  const lastByPerson = new Map<string, { event: JourneyEventWithJourney; journey: JourneyRow }>();

  for (const event of sorted) {
    const personId = cleanText(event.person_id);
    if (!personId || event.journey_id) {
      result.events_skipped += 1;
      continue;
    }
    const personKey = `${cleanText(event.workspace_id)}:${personId}`;
    try {
      let previous = lastByPerson.get(personKey) || null;
      if (!previous) {
        previous = await repo.getLatestAssignedEventBefore({
          workspace_id: cleanText(event.workspace_id) || "default",
          person_id: personId,
          event_time: normalizeJourneyTimestamp(event.event_time),
          id: cleanText(event.id),
        });
      }

      let journey: JourneyRow;
      if (previous && withinJourneyBoundary(previous.event, event, timeoutSeconds)) {
        journey = previous.journey;
        await repo.assignEventsToJourney(journey.id, [event.id]);
        const summary = summarizeJourneyEvents([event], { timeout_seconds: timeoutSeconds, now: args.now, existing: journey });
        journey = await repo.updateJourneySummary(journey.id, summary);
        console.log("journey.updated", {
          workspace_id: journey.workspace_id,
          person_id: journey.person_id,
          journey_id: journey.id,
          events_processed: 1,
        });
        if (!journey.is_active) {
          console.log("journey.closed", {
            workspace_id: journey.workspace_id,
            person_id: journey.person_id,
            journey_id: journey.id,
            status: journey.status,
          });
        }
      } else {
        journey = await repo.createJourney(buildNewJourneyDraft(event, { timeout_seconds: timeoutSeconds, now: args.now }));
        result.journeys_created += 1;
        await repo.assignEventsToJourney(journey.id, [event.id]);
        console.log("journey.created", {
          workspace_id: journey.workspace_id,
          person_id: journey.person_id,
          journey_id: journey.id,
        });
        if (!journey.is_active) {
          console.log("journey.closed", {
            workspace_id: journey.workspace_id,
            person_id: journey.person_id,
            journey_id: journey.id,
            status: journey.status,
          });
        }
      }

      result.events_linked += 1;
      lastByPerson.set(personKey, { event: { ...event, journey_id: journey.id }, journey });
    } catch (error: any) {
      result.records_failed += 1;
      result.ok = false;
      result.errors.push({ event_id: event.id || null, message: error?.message || String(error) });
    }
  }

  return result;
}

export async function getPersonJourneys(repo: JourneyRepository, params: PersonJourneysParams) {
  const person = await repo.getPersonById(params.workspace_id, params.person_id);
  if (!person) throw new JourneyNotFoundError("Person not found.");
  const rows = await repo.queryPersonJourneys({ ...params, limit: params.limit + 1 });
  const page = rows.slice(0, params.limit);
  const last = page[page.length - 1];
  return {
    ok: true,
    person_id: params.person_id,
    journeys: page.map(compactJourney),
    next_cursor: rows.length > params.limit && last ? encodeJourneyListCursor({ started_at: normalizeJourneyTimestamp(last.started_at, "started_at"), id: last.id }) : null,
  };
}

export async function getJourneyDetail(repo: JourneyRepository, params: JourneyDetailParams) {
  const journey = await repo.getJourneyById(params.workspace_id, params.journey_id);
  if (!journey) throw new JourneyNotFoundError("Journey not found.");
  const rows = await repo.queryJourneyEvents({ ...params, limit: params.limit + 1 });
  const page = rows.slice(0, params.limit);
  const last = page[page.length - 1];
  return {
    ok: true,
    journey: compactJourney(journey),
    events: page.map(compactJourneyEvent),
    next_cursor: rows.length > params.limit && last
      ? encodeJourneyTimelineCursor({ event_time: normalizeJourneyTimestamp(last.event_time), id: last.id })
      : null,
  };
}

export function createSupabaseJourneyRepository(supabase: any): JourneyRepository {
  return {
    async getPersonById(workspaceId, personId) {
      const { data, error } = await supabase
        .from("people")
        .select("id,workspace_id")
        .eq("workspace_id", workspaceId)
        .eq("id", personId)
        .maybeSingle();
      if (error) throw new Error(`Person lookup failed: ${error.message}`);
      return data || null;
    },
    async queryUnassignedJourneyEvents(args) {
      let query = supabase
        .from("journey_events")
        .select(JOURNEY_EVENT_ASSIGNMENT_SELECT)
        .eq("workspace_id", args.workspace_id)
        .not("person_id", "is", null)
        .is("journey_id", null)
        .gte("event_time", args.from_ts)
        .lt("event_time", args.to_exclusive_ts)
        .order("person_id", { ascending: true })
        .order("event_time", { ascending: true })
        .order("id", { ascending: true })
        .limit(args.limit);
      if (args.cursor) {
        query = query.or([
          `person_id.gt.${args.cursor.person_id}`,
          `and(person_id.eq.${args.cursor.person_id},event_time.gt.${args.cursor.event_time})`,
          `and(person_id.eq.${args.cursor.person_id},event_time.eq.${args.cursor.event_time},id.gt.${args.cursor.id})`,
        ].join(","));
      }
      const { data, error } = await query;
      if (error) throw new Error(`Journey event assignment scan failed: ${error.message}`);
      return (data || []) as JourneyEventWithJourney[];
    },
    async getLatestAssignedEventBefore(args) {
      const { data, error } = await supabase
        .from("journey_events")
        .select(JOURNEY_EVENT_ASSIGNMENT_SELECT)
        .eq("workspace_id", args.workspace_id)
        .eq("person_id", args.person_id)
        .not("journey_id", "is", null)
        .or(`event_time.lt.${args.event_time},and(event_time.eq.${args.event_time},id.lt.${args.id})`)
        .order("event_time", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`Previous journey event lookup failed: ${error.message}`);
      if (!data?.journey_id) return null;
      const journey = await this.getJourneyById(args.workspace_id, data.journey_id);
      return journey ? { event: data as JourneyEventWithJourney, journey } : null;
    },
    async createJourney(row) {
      const { data, error } = await supabase
        .from("journeys")
        .insert(row)
        .select("*")
        .single();
      if (error) throw new Error(`Journey create failed: ${error.message}`);
      return data as JourneyRow;
    },
    async updateJourneySummary(journeyId, patch) {
      const { data, error } = await supabase
        .from("journeys")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", journeyId)
        .select("*")
        .single();
      if (error) throw new Error(`Journey summary update failed: ${error.message}`);
      return data as JourneyRow;
    },
    async assignEventsToJourney(journeyId, eventIds) {
      if (!eventIds.length) return;
      const { error } = await supabase
        .from("journey_events")
        .update({ journey_id: journeyId, updated_at: new Date().toISOString() })
        .in("id", eventIds);
      if (error) throw new Error(`Journey event assignment failed: ${error.message}`);
    },
    async getJourneyById(workspaceId, journeyId) {
      const { data, error } = await supabase
        .from("journeys")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("id", journeyId)
        .maybeSingle();
      if (error) throw new Error(`Journey lookup failed: ${error.message}`);
      return (data || null) as JourneyRow | null;
    },
    async queryPersonJourneys(params) {
      let query = supabase
        .from("journeys")
        .select("*")
        .eq("workspace_id", params.workspace_id)
        .eq("person_id", params.person_id)
        .order("started_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(params.limit);
      if (params.cursor) {
        query = query.or(`started_at.gt.${params.cursor.started_at},and(started_at.eq.${params.cursor.started_at},id.gt.${params.cursor.id})`);
      }
      const { data, error } = await query;
      if (error) throw new Error(`Person journeys lookup failed: ${error.message}`);
      return (data || []) as JourneyRow[];
    },
    async queryJourneyEvents(params) {
      let query = supabase
        .from("journey_events")
        .select(JOURNEY_EVENT_ASSIGNMENT_SELECT)
        .eq("workspace_id", params.workspace_id)
        .eq("journey_id", params.journey_id)
        .order("event_time", { ascending: true })
        .order("id", { ascending: true })
        .limit(params.limit);
      if (params.cursor) {
        query = query.or(`event_time.gt.${params.cursor.event_time},and(event_time.eq.${params.cursor.event_time},id.gt.${params.cursor.id})`);
      }
      const { data, error } = await query;
      if (error) throw new Error(`Journey events lookup failed: ${error.message}`);
      return (data || []) as JourneyEventWithJourney[];
    },
  };
}
