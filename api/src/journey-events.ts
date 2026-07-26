import { cleanText } from "./identity-normalization.ts";

export const JOURNEY_EVENT_TYPES = [
  "click",
  "session_start",
  "page_view",
  "identify",
  "landing_page",
  "quiz_started",
  "form_started",
  "lead_created",
  "checkout_started",
  "purchase",
  "upsell",
  "subscription_started",
  "subscription_renewed",
  "refund",
  "chargeback",
  "cancellation",
  "email_open",
  "email_click",
  "call",
  "sms",
  "appointment",
  "custom",
] as const;

export type JourneyEventType = (typeof JOURNEY_EVENT_TYPES)[number];
export type JourneyEventCreateStatus = "inserted" | "already_present" | "conflict";

export const JOURNEY_EVENTS_CONNECTOR_ID = "journey-events-platform-orders-backfill";
export const JOURNEY_EVENTS_BACKFILL_JOB_TYPE = "journey_events_platform_orders_backfill";
export const JOURNEY_EVENTS_BACKFILL_PHASE = "backfill_platform_orders";
export const JOURNEY_EVENTS_PLATFORM_ORDER_SELECT = [
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
  "commerce_reference",
].join(",");

export const JOURNEY_EVENTS_PLATFORM_ORDER_BACKFILL_INDEX = {
  table: "platform_orders",
  columns: ["workspace_id", "platform", "order_ts", "platform_order_id"],
  filters: [
    "workspace_id = ?",
    "platform = ?",
    "person_id is not null",
    "platform_order_id is not null",
    "order_ts >= ?",
    "order_ts < ?",
    "platform_order_id > ? when cursor exists",
  ],
  order_by: ["platform_order_id asc"],
} as const;

export type JourneyEventRow = {
  id: string;
  workspace_id: string;
  person_id: string | null;
  platform_order_id: string | null;
  session_id: string | null;
  touchpoint_id: string | null;
  event_type: JourneyEventType;
  event_time: string;
  source_platform: string;
  source_connector: string;
  source_record_id: string;
  amount: string | number | null;
  currency: string | null;
  affiliate_id: string | null;
  offer_id: string | null;
  campaign_id: string | null;
  source: string | null;
  medium: string | null;
  sub1: string | null;
  sub2: string | null;
  sub3: string | null;
  sub4: string | null;
  sub5: string | null;
  transaction_id: string | null;
  metadata: Record<string, any>;
  created_at?: string | null;
  updated_at?: string | null;
};

export type JourneyEventInput = {
  workspace_id?: unknown;
  person_id?: unknown;
  platform_order_id?: unknown;
  session_id?: unknown;
  touchpoint_id?: unknown;
  event_type?: unknown;
  event_time?: unknown;
  source_platform?: unknown;
  source_connector?: unknown;
  source_record_id?: unknown;
  amount?: unknown;
  currency?: unknown;
  affiliate_id?: unknown;
  offer_id?: unknown;
  campaign_id?: unknown;
  source?: unknown;
  medium?: unknown;
  sub1?: unknown;
  sub2?: unknown;
  sub3?: unknown;
  sub4?: unknown;
  sub5?: unknown;
  transaction_id?: unknown;
  metadata?: unknown;
};

export type JourneyEventCreateResult = {
  status: JourneyEventCreateStatus;
  event: JourneyEventRow | null;
  conflict_fields?: string[];
};

export type JourneyEventBatchResult = {
  ok: boolean;
  inserted: number;
  already_present: number;
  conflicted: number;
  malformed: number;
  events: JourneyEventRow[];
  conflicts: Array<{ key: string; conflict_fields: string[] }>;
  errors: Array<{ index: number; message: string }>;
};

export type JourneyTimelineCursor = {
  event_time: string;
  id: string;
};

export type JourneyTimelineParams = {
  workspace_id: string;
  person_id: string;
  limit: number;
  cursor: JourneyTimelineCursor | null;
  event_type?: JourneyEventType | null;
  from?: string | null;
  to?: string | null;
};

export type JourneyBackfillCursor = {
  current_platform: string;
  platform_order_id: string | null;
};

export type JourneyBackfillRequest = {
  workspace_id: string;
  platforms: string[];
  from: string;
  to: string;
  batch_size: number;
  cursor: string | null;
  job_id: string | null;
};

export type JourneyTimelineRouteMatch =
  | { kind: "person_timeline"; person_id: string }
  | { kind: "method_not_allowed"; path: string; allowed_methods: string[] };

export type JourneyPlatformOrderRow = Record<string, any> & {
  workspace_id?: string | null;
  person_id?: string | null;
  platform?: string | null;
  platform_order_id?: string | null;
  order_id?: string | null;
  order_ts?: string | null;
  gross_amount?: string | number | null;
  receipt_total?: string | number | null;
  currency?: string | null;
};

export interface JourneyEventRepository {
  findJourneyEventsByIdempotencyKeys(keys: JourneyEventIdempotencyKey[]): Promise<JourneyEventRow[]>;
  insertJourneyEvents(rows: JourneyEventRowDraft[]): Promise<JourneyEventRow[]>;
  getPersonById(workspaceId: string, personId: string): Promise<{ id: string; workspace_id: string } | null>;
  queryPersonTimeline(params: JourneyTimelineParams): Promise<JourneyEventRow[]>;
}

export type JourneyEventIdempotencyKey = {
  workspace_id: string;
  source_platform: string;
  source_connector: string;
  source_record_id: string;
  event_type: JourneyEventType;
};

export type JourneyEventRowDraft = Omit<JourneyEventRow, "id" | "created_at" | "updated_at"> & {
  id?: string;
};

export class JourneyEventValidationError extends Error {
  status = 400;
  code = "bad_request";
}

export class JourneyEventConflictError extends Error {
  status = 409;
  code = "journey_event_conflict";
  conflict_fields: string[];

  constructor(message: string, conflictFields: string[]) {
    super(message);
    this.name = "JourneyEventConflictError";
    this.conflict_fields = conflictFields;
  }
}

export class JourneyEventNotFoundError extends Error {
  status = 404;
  code = "not_found";
}

function nullableText(value: unknown) {
  return cleanText(value) || null;
}

export function isJourneyEventType(value: unknown): value is JourneyEventType {
  return (JOURNEY_EVENT_TYPES as readonly string[]).includes(cleanText(value));
}

export function normalizeJourneyEventType(value: unknown): JourneyEventType {
  const type = cleanText(value);
  if (!isJourneyEventType(type)) throw new JourneyEventValidationError(`Invalid journey event_type: ${type || "(empty)"}`);
  return type;
}

export function normalizeJourneyTimestamp(value: unknown, field = "event_time") {
  const text = cleanText(value);
  if (!text) throw new JourneyEventValidationError(`${field} is required.`);
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) throw new JourneyEventValidationError(`${field} must be a valid timestamp.`);
  return new Date(ms).toISOString();
}

export function normalizeJourneyCurrency(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  const currency = text.toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new JourneyEventValidationError("currency must be a 3-letter ISO code.");
  return currency;
}

export function normalizeJourneyAmount(value: unknown) {
  if (value === null || value === undefined || cleanText(value) === "") return null;
  const text = cleanText(value).replace(/,/g, "");
  if (!/^-?\d+(\.\d{1,6})?$/.test(text)) throw new JourneyEventValidationError("amount must be a decimal number.");
  if (!Number.isFinite(Number(text))) throw new JourneyEventValidationError("amount must be finite.");
  return text;
}

export function normalizeJourneyMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value, (_key, item) => {
    if (item === undefined) return null;
    if (typeof item === "function" || typeof item === "symbol") return null;
    return item;
  }));
}

export function journeyEventIdempotencyKey(input: JourneyEventIdempotencyKey | JourneyEventRowDraft | JourneyEventRow) {
  return [
    input.workspace_id,
    input.source_platform,
    input.source_connector,
    input.source_record_id,
    input.event_type,
  ].map((part) => cleanText(part)).join("|");
}

export function normalizeJourneyEventInput(input: JourneyEventInput): JourneyEventRowDraft {
  const workspaceId = nullableText(input.workspace_id) || "default";
  const sourcePlatform = nullableText(input.source_platform);
  const sourceConnector = nullableText(input.source_connector);
  const sourceRecordId = nullableText(input.source_record_id);
  if (!workspaceId) throw new JourneyEventValidationError("workspace_id is required.");
  if (!sourcePlatform) throw new JourneyEventValidationError("source_platform is required.");
  if (!sourceConnector) throw new JourneyEventValidationError("source_connector is required.");
  if (!sourceRecordId) throw new JourneyEventValidationError("source_record_id is required.");

  return {
    workspace_id: workspaceId,
    person_id: nullableText(input.person_id),
    platform_order_id: nullableText(input.platform_order_id),
    session_id: nullableText(input.session_id),
    touchpoint_id: nullableText(input.touchpoint_id),
    event_type: normalizeJourneyEventType(input.event_type),
    event_time: normalizeJourneyTimestamp(input.event_time),
    source_platform: sourcePlatform,
    source_connector: sourceConnector,
    source_record_id: sourceRecordId,
    amount: normalizeJourneyAmount(input.amount),
    currency: normalizeJourneyCurrency(input.currency),
    affiliate_id: nullableText(input.affiliate_id),
    offer_id: nullableText(input.offer_id),
    campaign_id: nullableText(input.campaign_id),
    source: nullableText(input.source),
    medium: nullableText(input.medium),
    sub1: nullableText(input.sub1),
    sub2: nullableText(input.sub2),
    sub3: nullableText(input.sub3),
    sub4: nullableText(input.sub4),
    sub5: nullableText(input.sub5),
    transaction_id: nullableText(input.transaction_id),
    metadata: normalizeJourneyMetadata(input.metadata),
  };
}

function comparableAmount(value: unknown) {
  const normalized = normalizeJourneyAmount(value);
  return normalized === null ? null : String(Number(normalized));
}

function comparableTimestamp(value: unknown) {
  return value ? normalizeJourneyTimestamp(value) : null;
}

export function journeyEventConflictFields(existing: JourneyEventRow, incoming: JourneyEventRowDraft) {
  const fields: string[] = [];
  const checks: Array<[keyof JourneyEventRowDraft, unknown, unknown]> = [
    ["event_time", comparableTimestamp(existing.event_time), comparableTimestamp(incoming.event_time)],
    ["person_id", nullableText(existing.person_id), nullableText(incoming.person_id)],
    ["platform_order_id", nullableText(existing.platform_order_id), nullableText(incoming.platform_order_id)],
    ["session_id", nullableText(existing.session_id), nullableText(incoming.session_id)],
    ["touchpoint_id", nullableText(existing.touchpoint_id), nullableText(incoming.touchpoint_id)],
    ["amount", comparableAmount(existing.amount), comparableAmount(incoming.amount)],
    ["currency", normalizeJourneyCurrency(existing.currency), normalizeJourneyCurrency(incoming.currency)],
    ["transaction_id", nullableText(existing.transaction_id), nullableText(incoming.transaction_id)],
  ];
  for (const [field, left, right] of checks) {
    if (left !== right) fields.push(String(field));
  }
  return fields;
}

function isUniqueViolation(error: unknown) {
  const record = error && typeof error === "object" ? error as Record<string, any> : {};
  const message = cleanText(record.message || record.details || record.hint || String(error || ""));
  return record.code === "23505" || /duplicate key|unique/i.test(message);
}

export async function createJourneyEventsBatch(
  repo: JourneyEventRepository,
  inputs: JourneyEventInput[],
  args: { max_batch_size?: number } = {},
): Promise<JourneyEventBatchResult> {
  const started = Date.now();
  const maxBatchSize = Math.max(1, Math.min(500, Number(args.max_batch_size || 100)));
  if (inputs.length > maxBatchSize) throw new JourneyEventValidationError(`Batch size exceeds ${maxBatchSize}.`);

  const result: JourneyEventBatchResult = {
    ok: true,
    inserted: 0,
    already_present: 0,
    conflicted: 0,
    malformed: 0,
    events: [],
    conflicts: [],
    errors: [],
  };

  const normalized: JourneyEventRowDraft[] = [];
  inputs.forEach((input, index) => {
    try {
      normalized.push(normalizeJourneyEventInput(input));
    } catch (error: any) {
      result.malformed += 1;
      result.errors.push({ index, message: error?.message || String(error) });
    }
  });
  if (result.malformed) {
    result.ok = false;
    return result;
  }
  if (!normalized.length) return result;

  const keys = normalized.map((row) => ({
    workspace_id: row.workspace_id,
    source_platform: row.source_platform,
    source_connector: row.source_connector,
    source_record_id: row.source_record_id,
    event_type: row.event_type,
  }));
  const existingRows = await repo.findJourneyEventsByIdempotencyKeys(keys);
  const existingByKey = new Map(existingRows.map((row) => [journeyEventIdempotencyKey(row), row]));
  const rowsToInsertByKey = new Map<string, JourneyEventRowDraft>();

  for (const row of normalized) {
    const key = journeyEventIdempotencyKey(row);
    const existing = existingByKey.get(key);
    if (!existing) {
      const pending = rowsToInsertByKey.get(key);
      if (!pending) {
        rowsToInsertByKey.set(key, row);
        continue;
      }
      const conflictFields = journeyEventConflictFields(pending as JourneyEventRow, row);
      if (conflictFields.length) {
        result.conflicted += 1;
        result.conflicts.push({ key, conflict_fields: conflictFields });
        console.log("journey_event.conflict", {
          workspace_id: row.workspace_id,
          event_type: row.event_type,
          source_platform: row.source_platform,
          source_connector: row.source_connector,
          conflict_fields: conflictFields,
        });
      } else {
        result.already_present += 1;
        console.log("journey_event.duplicate", {
          workspace_id: row.workspace_id,
          event_type: row.event_type,
          source_platform: row.source_platform,
          source_connector: row.source_connector,
        });
      }
      continue;
    }

    const conflictFields = journeyEventConflictFields(existing, row);
    if (conflictFields.length) {
      result.conflicted += 1;
      result.conflicts.push({ key, conflict_fields: conflictFields });
      console.log("journey_event.conflict", {
        workspace_id: row.workspace_id,
        event_type: row.event_type,
        source_platform: row.source_platform,
        source_connector: row.source_connector,
        conflict_fields: conflictFields,
      });
    } else {
      result.already_present += 1;
      result.events.push(existing);
      console.log("journey_event.duplicate", {
        workspace_id: row.workspace_id,
        event_type: row.event_type,
        source_platform: row.source_platform,
        source_connector: row.source_connector,
      });
    }
  }

  const rowsToInsert = Array.from(rowsToInsertByKey.values());
  if (rowsToInsert.length) {
    try {
      const inserted = await repo.insertJourneyEvents(rowsToInsert);
      result.inserted += inserted.length;
      result.events.push(...inserted);
      for (const event of inserted) {
        console.log("journey_event.created", {
          workspace_id: event.workspace_id,
          event_type: event.event_type,
          source_platform: event.source_platform,
          source_connector: event.source_connector,
        });
      }
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const recoveredRows = await repo.findJourneyEventsByIdempotencyKeys(rowsToInsert.map((row) => ({
        workspace_id: row.workspace_id,
        source_platform: row.source_platform,
        source_connector: row.source_connector,
        source_record_id: row.source_record_id,
        event_type: row.event_type,
      })));
      const recoveredByKey = new Map(recoveredRows.map((row) => [journeyEventIdempotencyKey(row), row]));
      for (const row of rowsToInsert) {
        const key = journeyEventIdempotencyKey(row);
        const existing = recoveredByKey.get(key);
        if (!existing) throw error;
        const conflictFields = journeyEventConflictFields(existing, row);
        if (conflictFields.length) {
          result.conflicted += 1;
          result.conflicts.push({ key, conflict_fields: conflictFields });
          console.log("journey_event.conflict", {
            workspace_id: row.workspace_id,
            event_type: row.event_type,
            source_platform: row.source_platform,
            source_connector: row.source_connector,
            conflict_fields: conflictFields,
          });
        } else {
          result.already_present += 1;
          result.events.push(existing);
          console.log("journey_event.duplicate", {
            workspace_id: row.workspace_id,
            event_type: row.event_type,
            source_platform: row.source_platform,
            source_connector: row.source_connector,
          });
        }
      }
    }
  }

  result.ok = result.malformed === 0;
  console.log("journey_event.batch_completed", {
    inserted_count: result.inserted,
    duplicate_count: result.already_present,
    conflict_count: result.conflicted,
    malformed_count: result.malformed,
    duration_ms: Date.now() - started,
  });
  return result;
}

export async function createJourneyEvent(repo: JourneyEventRepository, input: JourneyEventInput): Promise<JourneyEventCreateResult> {
  const batch = await createJourneyEventsBatch(repo, [input], { max_batch_size: 1 });
  if (batch.malformed) throw new JourneyEventValidationError(batch.errors[0]?.message || "Invalid journey event.");
  if (batch.conflicted) {
    const fields = batch.conflicts[0]?.conflict_fields || [];
    return { status: "conflict", event: null, conflict_fields: fields };
  }
  if (batch.inserted) return { status: "inserted", event: batch.events[0] || null };
  return { status: "already_present", event: batch.events[0] || null };
}

export function compactJourneyEvent(row: JourneyEventRow) {
  return {
    id: row.id,
    event_type: row.event_type,
    event_time: normalizeJourneyTimestamp(row.event_time),
    source_platform: row.source_platform,
    source_connector: row.source_connector,
    source_record_id: row.source_record_id,
    platform_order_id: row.platform_order_id || null,
    session_id: row.session_id || null,
    touchpoint_id: row.touchpoint_id || null,
    amount: row.amount === null || row.amount === undefined ? null : String(row.amount),
    currency: row.currency || null,
    affiliate_id: row.affiliate_id || null,
    offer_id: row.offer_id || null,
    campaign_id: row.campaign_id || null,
    source: row.source || null,
    medium: row.medium || null,
    sub1: row.sub1 || null,
    sub2: row.sub2 || null,
    sub3: row.sub3 || null,
    sub4: row.sub4 || null,
    sub5: row.sub5 || null,
    transaction_id: row.transaction_id || null,
    metadata: normalizeJourneyMetadata(row.metadata),
  };
}

export function encodeJourneyTimelineCursor(cursor: JourneyTimelineCursor | null) {
  return cursor ? encodeURIComponent(JSON.stringify(cursor)) : null;
}

export function decodeJourneyTimelineCursor(value: unknown): JourneyTimelineCursor | null {
  const text = cleanText(value);
  if (!text) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(text));
    const eventTime = normalizeJourneyTimestamp(parsed?.event_time, "cursor.event_time");
    const id = cleanText(parsed?.id);
    if (!id) throw new Error("cursor.id is required.");
    return { event_time: eventTime, id };
  } catch {
    throw new JourneyEventValidationError("Invalid timeline cursor.");
  }
}

function normalizeTimelineDate(value: unknown, field: string) {
  const text = cleanText(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return normalizeJourneyTimestamp(`${text}T00:00:00.000Z`, field);
  return normalizeJourneyTimestamp(text, field);
}

export function normalizePersonTimelineParams(args: {
  workspace_id?: unknown;
  person_id?: unknown;
  limit?: unknown;
  cursor?: unknown;
  event_type?: unknown;
  from?: unknown;
  to?: unknown;
}): JourneyTimelineParams {
  const personId = cleanText(args.person_id);
  if (!personId) throw new JourneyEventValidationError("person_id is required.");
  const limit = Math.max(1, Math.min(100, Math.floor(Number(args.limit || 50)) || 50));
  const eventType = cleanText(args.event_type) ? normalizeJourneyEventType(args.event_type) : null;
  const from = normalizeTimelineDate(args.from, "from");
  const to = normalizeTimelineDate(args.to, "to");
  if (from && to && Date.parse(from) > Date.parse(to)) throw new JourneyEventValidationError("from must be on or before to.");
  return {
    workspace_id: cleanText(args.workspace_id) || "default",
    person_id: personId,
    limit,
    cursor: decodeJourneyTimelineCursor(args.cursor),
    event_type: eventType,
    from,
    to,
  };
}

export function matchJourneyTimelineRoute(method: string, path: string): JourneyTimelineRouteMatch | null {
  const match = path.match(/^\/v1\/persons\/([^/]+)\/timeline\/?$/);
  if (!match) return null;
  if (method !== "GET") {
    return {
      kind: "method_not_allowed",
      path: "/v1/persons/:person_id/timeline",
      allowed_methods: ["GET"],
    };
  }
  return { kind: "person_timeline", person_id: decodeURIComponent(match[1] || "") };
}

export async function getPersonTimeline(repo: JourneyEventRepository, params: JourneyTimelineParams) {
  const person = await repo.getPersonById(params.workspace_id, params.person_id);
  if (!person) throw new JourneyEventNotFoundError("Person not found.");
  const rows = await repo.queryPersonTimeline({ ...params, limit: params.limit + 1 });
  const page = rows.slice(0, params.limit);
  const last = page[page.length - 1];
  return {
    ok: true,
    person_id: params.person_id,
    events: page.map(compactJourneyEvent),
    next_cursor: rows.length > params.limit && last
      ? encodeJourneyTimelineCursor({ event_time: normalizeJourneyTimestamp(last.event_time), id: last.id })
      : null,
  };
}

export function serializeJourneyBackfillCursor(cursor: JourneyBackfillCursor | null) {
  if (!cursor) return null;
  return JSON.stringify({
    current_platform: cleanText(cursor.current_platform),
    platform_order_id: cleanText(cursor.platform_order_id) || null,
  });
}

export function parseJourneyBackfillCursor(value: unknown, platforms: string[]): JourneyBackfillCursor {
  const fallback = { current_platform: platforms[0] || "wowboost", platform_order_id: null };
  if (!cleanText(value)) return fallback;
  try {
    const parsed = JSON.parse(cleanText(value));
    const platform = cleanText(parsed?.current_platform || parsed?.platform || fallback.current_platform);
    return {
      current_platform: platforms.includes(platform) ? platform : fallback.current_platform,
      platform_order_id: nullableText(parsed?.platform_order_id || parsed?.cursor),
    };
  } catch {
    return { current_platform: fallback.current_platform, platform_order_id: cleanText(value) || null };
  }
}

function parseYmd(value: unknown) {
  const text = cleanText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function journeyBackfillDateRange(from: string, to: string) {
  const fromDate = parseYmd(from);
  const toDate = parseYmd(to);
  if (!fromDate || !toDate) return null;
  if (fromDate.getTime() > toDate.getTime()) return null;
  return {
    from_ts: fromDate.toISOString(),
    to_exclusive_ts: new Date(toDate.getTime() + 86400000).toISOString(),
  };
}

export function normalizeJourneyBackfillPlatforms(value: unknown) {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  const platforms = Array.from(new Set(raw.map((item) => cleanText(item).toLowerCase()).filter(Boolean)));
  return platforms.length ? platforms.sort() : ["wowboost"];
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
      platforms: normalizeJourneyBackfillPlatforms(body?.platforms || body?.platform),
      from,
      to,
      batch_size: Math.max(1, Math.min(100, Math.floor(Number(body?.batch_size ?? body?.batchSize ?? 100)) || 100)),
      cursor: nullableText(body?.cursor),
      job_id: nullableText(body?.job_id || body?.jobId),
    },
  };
}

export function nextJourneyBackfillPlatform(currentPlatform: string, platforms: string[]) {
  const index = platforms.indexOf(cleanText(currentPlatform));
  if (index < 0) return platforms[0] || null;
  return platforms[index + 1] || null;
}

function firstPresent(...values: unknown[]) {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return null;
}

export function mapPlatformOrderToJourneyEvent(row: JourneyPlatformOrderRow): JourneyEventInput | null {
  const workspaceId = cleanText(row.workspace_id) || "default";
  const personId = nullableText(row.person_id);
  const platform = nullableText(row.platform);
  const platformOrderId = nullableText(row.platform_order_id);
  const eventTime = nullableText(row.order_ts);
  if (!personId || !platform || !platformOrderId || !eventTime) return null;

  const amount = normalizeJourneyAmount(row.gross_amount ?? row.receipt_total);
  const currency = normalizeJourneyCurrency(row.currency);
  const sourceConnector = firstPresent(row.source_connector, row.connector_id, row.import_connector, platform) || platform;

  return {
    workspace_id: workspaceId,
    person_id: personId,
    platform_order_id: platformOrderId,
    event_type: "purchase",
    event_time: eventTime,
    source_platform: platform,
    source_connector: sourceConnector,
    source_record_id: platformOrderId,
    amount,
    currency,
    affiliate_id: row.affiliate_id,
    offer_id: row.everflow_offer_id || row.offer_id,
    campaign_id: row.campaign_id || row.platform_store_id,
    source: row.source || row.source_id,
    medium: row.medium || row.utm_medium,
    sub1: row.sub1,
    sub2: row.sub2,
    sub3: row.sub3,
    sub4: row.sub4,
    sub5: row.sub5,
    transaction_id: row.transaction_id || row.everflow_transaction_id,
    metadata: {
      source_table: "platform_orders",
      order_id: nullableText(row.order_id),
      commerce_reference: nullableText(row.commerce_reference),
      status: nullableText(row.status),
      status_norm: nullableText(row.status_norm),
      platform_store_id: nullableText(row.platform_store_id),
      receipt_total: normalizeJourneyAmount(row.receipt_total),
      product_subtotal: normalizeJourneyAmount(row.product_subtotal),
      shipping_amount: normalizeJourneyAmount(row.shipping_amount),
      tax_amount: normalizeJourneyAmount(row.tax_amount),
    },
  };
}

export function createSupabaseJourneyEventRepository(supabase: any): JourneyEventRepository {
  return {
    async findJourneyEventsByIdempotencyKeys(keys) {
      const uniqueKeys = Array.from(new Map(keys.map((key) => [journeyEventIdempotencyKey(key), key])).values());
      if (!uniqueKeys.length) return [];
      const keySet = new Set(uniqueKeys.map(journeyEventIdempotencyKey));
      const { data, error } = await supabase
        .from("journey_events")
        .select("*")
        .in("workspace_id", Array.from(new Set(uniqueKeys.map((key) => key.workspace_id))))
        .in("source_platform", Array.from(new Set(uniqueKeys.map((key) => key.source_platform))))
        .in("source_connector", Array.from(new Set(uniqueKeys.map((key) => key.source_connector))))
        .in("source_record_id", Array.from(new Set(uniqueKeys.map((key) => key.source_record_id))))
        .in("event_type", Array.from(new Set(uniqueKeys.map((key) => key.event_type))));
      if (error) throw new Error(`Journey event lookup failed: ${error.message}`);
      return ((data || []) as JourneyEventRow[]).filter((row) => keySet.has(journeyEventIdempotencyKey(row)));
    },
    async insertJourneyEvents(rows) {
      if (!rows.length) return [];
      const { data, error } = await supabase
        .from("journey_events")
        .insert(rows)
        .select("*");
      if (error) throw error;
      return (data || []) as JourneyEventRow[];
    },
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
    async queryPersonTimeline(params) {
      let query = supabase
        .from("journey_events")
        .select("*")
        .eq("workspace_id", params.workspace_id)
        .eq("person_id", params.person_id)
        .order("event_time", { ascending: true })
        .order("id", { ascending: true })
        .limit(params.limit);

      if (params.event_type) query = query.eq("event_type", params.event_type);
      if (params.from) query = query.gte("event_time", params.from);
      if (params.to) query = query.lte("event_time", params.to);
      if (params.cursor) {
        query = query.or(`event_time.gt.${params.cursor.event_time},and(event_time.eq.${params.cursor.event_time},id.gt.${params.cursor.id})`);
      }

      const { data, error } = await query;
      if (error) throw new Error(`Person timeline lookup failed: ${error.message}`);
      return (data || []) as JourneyEventRow[];
    },
  };
}
