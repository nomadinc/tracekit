import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  JOURNEY_EVENTS_PLATFORM_ORDER_BACKFILL_INDEX,
  JOURNEY_EVENTS_PLATFORM_ORDER_SELECT,
  createJourneyEvent,
  createJourneyEventsBatch,
  decodeJourneyTimelineCursor,
  encodeJourneyTimelineCursor,
  getPersonTimeline,
  journeyBackfillDateRange,
  journeyEventIdempotencyKey,
  mapPlatformOrderToJourneyEvent,
  matchJourneyTimelineRoute,
  normalizeJourneyBackfillRequest,
  normalizeJourneyCurrency,
  normalizePersonTimelineParams,
  parseJourneyBackfillCursor,
  serializeJourneyBackfillCursor,
  type JourneyEventRepository,
  type JourneyEventRow,
  type JourneyEventRowDraft,
  type JourneyTimelineParams,
} from "./journey-events.ts";

class MemoryJourneyRepository implements JourneyEventRepository {
  events: JourneyEventRow[] = [];
  people = new Map<string, { id: string; workspace_id: string }>();
  lookupCalls = 0;
  insertCalls = 0;

  addPerson(workspaceId: string, personId: string) {
    this.people.set(`${workspaceId}:${personId}`, { id: personId, workspace_id: workspaceId });
  }

  async findJourneyEventsByIdempotencyKeys(keys: any[]) {
    this.lookupCalls += 1;
    const wanted = new Set(keys.map(journeyEventIdempotencyKey));
    return this.events.filter((event) => wanted.has(journeyEventIdempotencyKey(event)));
  }

  async insertJourneyEvents(rows: JourneyEventRowDraft[]) {
    this.insertCalls += 1;
    const inserted = rows.map((row, index) => ({
      id: `event-${this.events.length + index + 1}`,
      ...row,
      created_at: "2026-07-20T00:00:00.000Z",
      updated_at: "2026-07-20T00:00:00.000Z",
    })) as JourneyEventRow[];
    this.events.push(...inserted);
    return inserted;
  }

  async getPersonById(workspaceId: string, personId: string) {
    return this.people.get(`${workspaceId}:${personId}`) || null;
  }

  async queryPersonTimeline(params: JourneyTimelineParams) {
    return this.events
      .filter((event) => event.workspace_id === params.workspace_id)
      .filter((event) => event.person_id === params.person_id)
      .filter((event) => !params.event_type || event.event_type === params.event_type)
      .filter((event) => !params.from || Date.parse(event.event_time) >= Date.parse(params.from))
      .filter((event) => !params.to || Date.parse(event.event_time) <= Date.parse(params.to))
      .filter((event) => {
        if (!params.cursor) return true;
        const eventTime = Date.parse(event.event_time);
        const cursorTime = Date.parse(params.cursor.event_time);
        return eventTime > cursorTime || (eventTime === cursorTime && event.id > params.cursor.id);
      })
      .sort((a, b) => Date.parse(a.event_time) - Date.parse(b.event_time) || a.id.localeCompare(b.id))
      .slice(0, params.limit);
  }
}

function purchaseInput(overrides: Record<string, any> = {}) {
  return {
    workspace_id: "default",
    person_id: "person-1",
    platform_order_id: "wowboost:125055",
    event_type: "purchase",
    event_time: "2026-07-18T12:34:56.000Z",
    source_platform: "wowboost",
    source_connector: "wowboost",
    source_record_id: "wowboost:125055",
    amount: "99.00",
    currency: "usd",
    metadata: { source_table: "platform_orders" },
    ...overrides,
  };
}

test("migration creates journey_events with idempotency and timeline indexes", () => {
  const migration = readFileSync(new URL("../../supabase/migrations/017_journey_events_ledger.sql", import.meta.url), "utf8");
  assert.match(migration, /create table if not exists public\.journey_events/);
  assert.match(migration, /amount numeric/);
  assert.match(migration, /journey_events_source_event_uidx/);
  assert.match(migration, /workspace_id,\s*source_platform,\s*source_connector,\s*source_record_id,\s*event_type/s);
  assert.match(migration, /journey_events_person_timeline_idx/);
  assert.match(migration, /event_type in/);
  assert.match(migration, /currency ~ '\^\[A-Z\]\{3\}\$'/);
});

test("migration 022 allows identify journey events without changing the ledger table", () => {
  const migration = readFileSync(new URL("../../supabase/migrations/022_journey_events_identify_event_type.sql", import.meta.url), "utf8");
  assert.match(migration, /drop constraint journey_events_event_type_check/);
  assert.match(migration, /'identify'/);
  assert.doesNotMatch(migration.toLowerCase(), /drop table|truncate table|rename to/);
});

test("identify is a valid journey event type for browser identity milestones", async () => {
  const repo = new MemoryJourneyRepository();
  const result = await createJourneyEvent(repo, {
    workspace_id: "default",
    person_id: "person-1",
    event_type: "identify",
    event_time: "2026-07-23T05:21:00.000Z",
    source_platform: "browser",
    source_connector: "browser-event-normalization",
    source_record_id: "identify-1",
    metadata: { browser_event_type: "identify", tkid: "tkid_smoke_001" },
  });

  assert.equal(result.status, "inserted");
  assert.equal(result.event?.event_type, "identify");
  assert.equal(result.event?.person_id, "person-1");
});

test("valid event insert normalizes currency and preserves metadata", async () => {
  const repo = new MemoryJourneyRepository();
  const result = await createJourneyEvent(repo, purchaseInput({ metadata: { channel: "affiliate" } }));
  assert.equal(result.status, "inserted");
  assert.equal(result.event?.currency, "USD");
  assert.deepEqual(result.event?.metadata, { channel: "affiliate" });
  assert.equal(repo.lookupCalls, 1);
  assert.equal(repo.insertCalls, 1);
});

test("duplicate event returns already-present while different event type is allowed", async () => {
  const repo = new MemoryJourneyRepository();
  const first = await createJourneyEvent(repo, purchaseInput());
  const duplicate = await createJourneyEvent(repo, purchaseInput());
  const refund = await createJourneyEvent(repo, purchaseInput({ event_type: "refund" }));

  assert.equal(first.status, "inserted");
  assert.equal(duplicate.status, "already_present");
  assert.equal(refund.status, "inserted");
  assert.equal(repo.events.length, 2);
});

test("conflicting immutable event values are surfaced and not overwritten", async () => {
  const repo = new MemoryJourneyRepository();
  await createJourneyEvent(repo, purchaseInput({ amount: "99.00" }));
  const conflict = await createJourneyEvent(repo, purchaseInput({ amount: "79.00" }));

  assert.equal(conflict.status, "conflict");
  assert.deepEqual(conflict.conflict_fields, ["amount"]);
  assert.equal(repo.events.length, 1);
  assert.equal(String(repo.events[0].amount), "99.00");
});

test("invalid event type and amount are rejected", async () => {
  const repo = new MemoryJourneyRepository();
  await assert.rejects(() => createJourneyEvent(repo, purchaseInput({ event_type: "first_touch" })), /Invalid journey event_type/);
  await assert.rejects(() => createJourneyEvent(repo, purchaseInput({ amount: "not-money" })), /amount must be a decimal/);
});

test("batch insert reports inserted duplicate and conflict counts", async () => {
  const repo = new MemoryJourneyRepository();
  await createJourneyEvent(repo, purchaseInput({ source_record_id: "wowboost:1", platform_order_id: "wowboost:1" }));
  const batch = await createJourneyEventsBatch(repo, [
    purchaseInput({ source_record_id: "wowboost:1", platform_order_id: "wowboost:1" }),
    purchaseInput({ source_record_id: "wowboost:2", platform_order_id: "wowboost:2" }),
    purchaseInput({ source_record_id: "wowboost:1", platform_order_id: "wowboost:1", amount: "10.00" }),
  ]);

  assert.equal(batch.inserted, 1);
  assert.equal(batch.already_present, 1);
  assert.equal(batch.conflicted, 1);
  assert.equal(batch.events.length, 2);
  assert.equal(repo.events.length, 2);
});

test("batch insert dedupes repeated source keys before insert", async () => {
  const repo = new MemoryJourneyRepository();
  const batch = await createJourneyEventsBatch(repo, [
    purchaseInput({ source_record_id: "wowboost:1", platform_order_id: "wowboost:1", amount: "99.00" }),
    purchaseInput({ source_record_id: "wowboost:1", platform_order_id: "wowboost:1", amount: "99.00" }),
    purchaseInput({ source_record_id: "wowboost:2", platform_order_id: "wowboost:2", amount: "10.00" }),
    purchaseInput({ source_record_id: "wowboost:2", platform_order_id: "wowboost:2", amount: "11.00" }),
  ]);

  assert.equal(batch.inserted, 2);
  assert.equal(batch.already_present, 1);
  assert.equal(batch.conflicted, 1);
  assert.equal(repo.insertCalls, 1);
  assert.equal(repo.events.length, 2);
});

test("idempotency key is workspace-scoped", async () => {
  const repo = new MemoryJourneyRepository();
  await createJourneyEvent(repo, purchaseInput({ workspace_id: "default" }));
  const other = await createJourneyEvent(repo, purchaseInput({ workspace_id: "other" }));
  assert.equal(other.status, "inserted");
  assert.equal(repo.events.length, 2);
});

test("platform order adapter maps linked orders to purchase events without sensitive metadata", () => {
  const input = mapPlatformOrderToJourneyEvent({
    workspace_id: "default",
    person_id: "person-1",
    platform: "wowboost",
    platform_order_id: "wowboost:105330",
    order_id: "105330",
    order_ts: "2026-07-18T12:34:56.000Z",
    gross_amount: 99,
    currency: "usd",
    transaction_id: "tx-1",
    affiliate_id: "aff-1",
    everflow_offer_id: "offer-1",
    source_id: "src-1",
    customer_email: "hidden@example.com",
    phone: "5555555555",
    raw_json: { email: "hidden@example.com" },
  });

  assert.equal(input?.event_type, "purchase");
  assert.equal(input?.source_record_id, "wowboost:105330");
  assert.equal(input?.amount, "99");
  assert.equal(input?.currency, "USD");
  assert.equal(input?.affiliate_id, "aff-1");
  assert.equal(input?.offer_id, "offer-1");
  assert.equal(input?.source, "src-1");
  assert.equal(input?.transaction_id, "tx-1");
  assert.equal((input?.metadata as any).source_table, "platform_orders");
  assert.equal(JSON.stringify(input?.metadata).includes("hidden@example.com"), false);
  assert.equal(JSON.stringify(input?.metadata).includes("5555555555"), false);
});

test("platform order adapter skips unlinked or incomplete orders", () => {
  assert.equal(mapPlatformOrderToJourneyEvent({ platform: "wowboost", platform_order_id: "wowboost:1", order_ts: "2026-07-18T00:00:00.000Z" }), null);
  assert.equal(mapPlatformOrderToJourneyEvent({ person_id: "person-1", platform: "wowboost", order_ts: "2026-07-18T00:00:00.000Z" }), null);
});

test("platform order adapter leaves missing optional revenue fields null", () => {
  const input = mapPlatformOrderToJourneyEvent({
    workspace_id: "default",
    person_id: "person-1",
    platform: "wowboost",
    platform_order_id: "wowboost:105331",
    order_ts: "2026-07-18T12:34:56.000Z",
  });

  assert.equal(input?.amount, null);
  assert.equal(input?.currency, null);
  assert.equal((input?.metadata as any).receipt_total, null);
  assert.equal((input?.metadata as any).shipping_amount, null);
});

test("rerunning mapped platform order creates no duplicate journey event", async () => {
  const repo = new MemoryJourneyRepository();
  const input = mapPlatformOrderToJourneyEvent({
    workspace_id: "default",
    person_id: "person-1",
    platform: "wowboost",
    platform_order_id: "wowboost:125055",
    order_ts: "2026-07-18T12:34:56.000Z",
    gross_amount: "99.00",
    currency: "USD",
  });
  assert.ok(input);
  await createJourneyEvent(repo, input!);
  const second = await createJourneyEvent(repo, input!);
  assert.equal(second.status, "already_present");
  assert.equal(repo.events.length, 1);
});

test("person timeline returns chronological stable-cursor pages", async () => {
  const repo = new MemoryJourneyRepository();
  repo.addPerson("default", "person-1");
  await createJourneyEventsBatch(repo, [
    purchaseInput({ source_record_id: "wowboost:2", platform_order_id: "wowboost:2", event_time: "2026-07-18T12:00:00.000Z" }),
    purchaseInput({ source_record_id: "wowboost:1", platform_order_id: "wowboost:1", event_time: "2026-07-18T11:00:00.000Z" }),
    purchaseInput({ source_record_id: "wowboost:3", platform_order_id: "wowboost:3", event_time: "2026-07-18T13:00:00.000Z" }),
  ]);

  const first = await getPersonTimeline(repo, normalizePersonTimelineParams({ workspace_id: "default", person_id: "person-1", limit: 2 }));
  assert.deepEqual(first.events.map((event) => event.source_record_id), ["wowboost:1", "wowboost:2"]);
  assert.ok(first.next_cursor);

  const second = await getPersonTimeline(repo, normalizePersonTimelineParams({ workspace_id: "default", person_id: "person-1", limit: 2, cursor: first.next_cursor }));
  assert.deepEqual(second.events.map((event) => event.source_record_id), ["wowboost:3"]);
  assert.equal(second.next_cursor, null);
});

test("person timeline route matcher reaches GET handler and rejects other methods deterministically", () => {
  assert.deepEqual(matchJourneyTimelineRoute("GET", "/v1/persons/person-1/timeline"), {
    kind: "person_timeline",
    person_id: "person-1",
  });
  assert.deepEqual(matchJourneyTimelineRoute("GET", "/v1/persons/person-1/timeline/"), {
    kind: "person_timeline",
    person_id: "person-1",
  });
  assert.deepEqual(matchJourneyTimelineRoute("POST", "/v1/persons/person-1/timeline"), {
    kind: "method_not_allowed",
    path: "/v1/persons/:person_id/timeline",
    allowed_methods: ["GET"],
  });
  assert.equal(matchJourneyTimelineRoute("GET", "/v1/people/person-1/history"), null);
});

test("person timeline supports event type and date filters", async () => {
  const repo = new MemoryJourneyRepository();
  repo.addPerson("default", "person-1");
  await createJourneyEventsBatch(repo, [
    purchaseInput({ source_record_id: "purchase-1", platform_order_id: "purchase-1", event_time: "2026-07-17T12:00:00.000Z" }),
    purchaseInput({ source_record_id: "refund-1", platform_order_id: "purchase-1", event_type: "refund", event_time: "2026-07-18T12:00:00.000Z" }),
  ]);
  const result = await getPersonTimeline(repo, normalizePersonTimelineParams({
    workspace_id: "default",
    person_id: "person-1",
    event_type: "refund",
    from: "2026-07-18T00:00:00.000Z",
    to: "2026-07-18T23:59:59.000Z",
  }));
  assert.deepEqual(result.events.map((event) => event.event_type), ["refund"]);
});

test("person timeline rejects missing people invalid cursor and invalid limit normalizes safely", async () => {
  const repo = new MemoryJourneyRepository();
  await assert.rejects(() => getPersonTimeline(repo, normalizePersonTimelineParams({ workspace_id: "default", person_id: "missing" })), /Person not found/);
  assert.throws(() => decodeJourneyTimelineCursor("%7Bbad"), /Invalid timeline cursor/);
  assert.equal(normalizePersonTimelineParams({ person_id: "person-1", limit: 1000 }).limit, 100);
  assert.equal(encodeJourneyTimelineCursor({ event_time: "2026-07-18T00:00:00.000Z", id: "event-1" })?.includes("event-1"), true);
});

test("person timeline is workspace scoped", async () => {
  const repo = new MemoryJourneyRepository();
  repo.addPerson("other", "person-1");
  await assert.rejects(() => getPersonTimeline(repo, normalizePersonTimelineParams({ workspace_id: "default", person_id: "person-1" })), /Person not found/);
});

test("journey backfill request and cursor are date-bounded and resumable", () => {
  const parsed = normalizeJourneyBackfillRequest({
    workspace_id: "default",
    platforms: ["wowsuite:wowboost", "wowboost", "wowboost"],
    from: "2026-07-01",
    to: "2026-07-18",
    batch_size: 250,
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.deepEqual(parsed.value.platforms, ["wowboost", "wowsuite:wowboost"]);
    assert.equal(parsed.value.batch_size, 100);
  }
  assert.deepEqual(journeyBackfillDateRange("2026-07-01", "2026-07-18"), {
    from_ts: "2026-07-01T00:00:00.000Z",
    to_exclusive_ts: "2026-07-19T00:00:00.000Z",
  });
  const cursor = serializeJourneyBackfillCursor({ current_platform: "wowboost", platform_order_id: "wowboost:10" });
  assert.deepEqual(parseJourneyBackfillCursor(cursor, ["wowboost"]), {
    current_platform: "wowboost",
    platform_order_id: "wowboost:10",
  });
});

test("journey backfill scan contract uses linked platform orders and excludes sensitive selected fields", () => {
  assert.deepEqual(JOURNEY_EVENTS_PLATFORM_ORDER_BACKFILL_INDEX.columns, ["workspace_id", "platform", "order_ts", "platform_order_id"]);
  assert.ok(JOURNEY_EVENTS_PLATFORM_ORDER_BACKFILL_INDEX.filters.includes("person_id is not null"));
  assert.ok(JOURNEY_EVENTS_PLATFORM_ORDER_BACKFILL_INDEX.filters.includes("platform_order_id > ? when cursor exists"));
  assert.equal(JOURNEY_EVENTS_PLATFORM_ORDER_SELECT.includes("customer_email"), false);
  assert.equal(JOURNEY_EVENTS_PLATFORM_ORDER_SELECT.includes("phone"), false);
  assert.equal(JOURNEY_EVENTS_PLATFORM_ORDER_SELECT.includes("raw_json"), false);
  assert.equal(normalizeJourneyCurrency("usd"), "USD");
});
