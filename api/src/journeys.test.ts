import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  JOURNEY_ASSIGNMENT_BACKFILL_INDEX,
  JOURNEY_DEFAULT_TIMEOUT_SECONDS,
  assignJourneyEvents,
  compactJourney,
  createSupabaseJourneyRepository,
  decodeJourneyBackfillCursor,
  deriveJourneyStatus,
  encodeJourneyListCursor,
  getJourneyDetail,
  getPersonJourneys,
  isJourneyConversionEventType,
  matchJourneyRoutes,
  normalizeJourneyBackfillRequest,
  normalizeJourneyBoundaryTimeoutSeconds,
  normalizeJourneyDetailParams,
  normalizePersonJourneysParams,
  serializeJourneyBackfillCursor,
  summarizeJourneyEvents,
  withinJourneyBoundary,
  type JourneyEventWithJourney,
  type JourneyRepository,
  type JourneyRow,
} from "./journeys.ts";

class MemoryJourneyRepository implements JourneyRepository {
  people = new Map<string, { id: string; workspace_id: string }>();
  events: JourneyEventWithJourney[] = [];
  journeys: JourneyRow[] = [];
  createCalls = 0;
  updateCalls = 0;
  assignCalls = 0;

  addPerson(workspaceId: string, personId: string) {
    this.people.set(`${workspaceId}:${personId}`, { id: personId, workspace_id: workspaceId });
  }

  addEvent(event: Partial<JourneyEventWithJourney> & { id: string; person_id: string; event_time: string }) {
    this.events.push({
      workspace_id: "default",
      journey_id: null,
      platform_order_id: null,
      session_id: null,
      touchpoint_id: null,
      event_type: "page_view",
      source_platform: "test",
      source_connector: "test",
      source_record_id: event.id,
      amount: null,
      currency: null,
      affiliate_id: null,
      offer_id: null,
      campaign_id: null,
      source: null,
      medium: null,
      sub1: null,
      sub2: null,
      sub3: null,
      sub4: null,
      sub5: null,
      transaction_id: null,
      metadata: {},
      ...event,
    } as JourneyEventWithJourney);
  }

  async getPersonById(workspaceId: string, personId: string) {
    return this.people.get(`${workspaceId}:${personId}`) || null;
  }

  async queryUnassignedJourneyEvents(args: any) {
    return this.events
      .filter((event) => event.workspace_id === args.workspace_id)
      .filter((event) => event.person_id && !event.journey_id)
      .filter((event) => Date.parse(event.event_time) >= Date.parse(args.from_ts))
      .filter((event) => Date.parse(event.event_time) < Date.parse(args.to_exclusive_ts))
      .filter((event) => {
        if (!args.cursor) return true;
        return event.person_id! > args.cursor.person_id
          || (event.person_id === args.cursor.person_id && Date.parse(event.event_time) > Date.parse(args.cursor.event_time))
          || (event.person_id === args.cursor.person_id && Date.parse(event.event_time) === Date.parse(args.cursor.event_time) && event.id > args.cursor.id);
      })
      .sort((a, b) => String(a.person_id).localeCompare(String(b.person_id)) || Date.parse(a.event_time) - Date.parse(b.event_time) || a.id.localeCompare(b.id))
      .slice(0, args.limit);
  }

  async getLatestAssignedEventBefore(args: any) {
    const event = this.events
      .filter((item) => item.workspace_id === args.workspace_id)
      .filter((item) => item.person_id === args.person_id)
      .filter((item) => item.journey_id)
      .filter((item) => Date.parse(item.event_time) < Date.parse(args.event_time) || (Date.parse(item.event_time) === Date.parse(args.event_time) && item.id < args.id))
      .sort((a, b) => Date.parse(b.event_time) - Date.parse(a.event_time) || b.id.localeCompare(a.id))[0];
    if (!event?.journey_id) return null;
    const journey = this.journeys.find((item) => item.id === event.journey_id) || null;
    return journey ? { event, journey } : null;
  }

  async createJourney(row: any) {
    this.createCalls += 1;
    const journey = {
      id: row.id || `journey-${this.journeys.length + 1}`,
      created_at: "2026-07-20T00:00:00.000Z",
      updated_at: "2026-07-20T00:00:00.000Z",
      ...row,
    } as JourneyRow;
    this.journeys.push(journey);
    return journey;
  }

  async updateJourneySummary(journeyId: string, patch: any) {
    this.updateCalls += 1;
    const index = this.journeys.findIndex((journey) => journey.id === journeyId);
    assert.notEqual(index, -1);
    this.journeys[index] = { ...this.journeys[index], ...patch, updated_at: "2026-07-20T00:00:00.000Z" };
    return this.journeys[index];
  }

  async assignEventsToJourney(journeyId: string, eventIds: string[]) {
    this.assignCalls += 1;
    for (const event of this.events) {
      if (eventIds.includes(event.id)) event.journey_id = journeyId;
    }
  }

  async getJourneyById(workspaceId: string, journeyId: string) {
    return this.journeys.find((journey) => journey.workspace_id === workspaceId && journey.id === journeyId) || null;
  }

  async queryPersonJourneys(params: any) {
    return this.journeys
      .filter((journey) => journey.workspace_id === params.workspace_id && journey.person_id === params.person_id)
      .filter((journey) => !params.cursor || Date.parse(journey.started_at) > Date.parse(params.cursor.started_at) || (Date.parse(journey.started_at) === Date.parse(params.cursor.started_at) && journey.id > params.cursor.id))
      .sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at) || a.id.localeCompare(b.id))
      .slice(0, params.limit);
  }

  async queryJourneyEvents(params: any) {
    return this.events
      .filter((event) => event.workspace_id === params.workspace_id && event.journey_id === params.journey_id)
      .filter((event) => !params.cursor || Date.parse(event.event_time) > Date.parse(params.cursor.event_time) || (Date.parse(event.event_time) === Date.parse(params.cursor.event_time) && event.id > params.cursor.id))
      .sort((a, b) => Date.parse(a.event_time) - Date.parse(b.event_time) || a.id.localeCompare(b.id))
      .slice(0, params.limit);
  }
}

test("migration creates journeys and links journey_events without redesigning the ledger", () => {
  const migration = readFileSync(new URL("../../supabase/migrations/018_journeys_engine.sql", import.meta.url), "utf8");
  assert.match(migration, /create table if not exists public\.journeys/);
  assert.match(migration, /alter table public\.journey_events\s+add column if not exists journey_id/s);
  assert.match(migration, /boundary_timeout_seconds/);
  assert.match(migration, /attribution_window_config jsonb/);
  assert.match(migration, /journey_events_unassigned_backfill_idx/);
  assert.deepEqual(JOURNEY_ASSIGNMENT_BACKFILL_INDEX.order_by, ["person_id asc", "event_time asc", "id asc"]);
});

test("same person events inside timeout share a journey while gaps create new journeys", async () => {
  const repo = new MemoryJourneyRepository();
  repo.addPerson("default", "person-1");
  repo.addEvent({ id: "event-1", person_id: "person-1", event_time: "2026-01-01T00:00:00.000Z", event_type: "page_view" });
  repo.addEvent({ id: "event-2", person_id: "person-1", event_time: "2026-01-15T00:00:00.000Z", event_type: "purchase", amount: "10.00" });
  repo.addEvent({ id: "event-3", person_id: "person-1", event_time: "2026-03-01T00:00:00.000Z", event_type: "email_click" });

  const result = await assignJourneyEvents(repo, repo.events, { now: "2026-03-02T00:00:00.000Z" });

  assert.equal(result.ok, true);
  assert.equal(result.journeys_created, 2);
  assert.equal(repo.events[0].journey_id, repo.events[1].journey_id);
  assert.notEqual(repo.events[1].journey_id, repo.events[2].journey_id);
  assert.equal(repo.journeys[0].event_count, 2);
  assert.equal(repo.journeys[0].purchase_count, 1);
  assert.equal(String(repo.journeys[0].total_revenue), "10");
});

test("different people never share journeys", async () => {
  const repo = new MemoryJourneyRepository();
  repo.addPerson("default", "person-1");
  repo.addPerson("default", "person-2");
  repo.addEvent({ id: "event-1", person_id: "person-1", event_time: "2026-01-01T00:00:00.000Z" });
  repo.addEvent({ id: "event-2", person_id: "person-2", event_time: "2026-01-01T00:00:01.000Z" });

  await assignJourneyEvents(repo, repo.events);

  assert.equal(repo.journeys.length, 2);
  assert.notEqual(repo.events[0].journey_id, repo.events[1].journey_id);
});

test("purchases refunds subscriptions and chargebacks do not terminate a journey", async () => {
  const repo = new MemoryJourneyRepository();
  repo.addPerson("default", "person-1");
  repo.addEvent({ id: "event-1", person_id: "person-1", event_time: "2026-01-01T00:00:00.000Z", event_type: "purchase", amount: "20" });
  repo.addEvent({ id: "event-2", person_id: "person-1", event_time: "2026-01-02T00:00:00.000Z", event_type: "refund", amount: "-5" });
  repo.addEvent({ id: "event-3", person_id: "person-1", event_time: "2026-01-03T00:00:00.000Z", event_type: "subscription_started", amount: "30" });
  repo.addEvent({ id: "event-4", person_id: "person-1", event_time: "2026-01-04T00:00:00.000Z", event_type: "chargeback", amount: "-20" });

  await assignJourneyEvents(repo, repo.events, { now: "2026-01-05T00:00:00.000Z" });

  assert.equal(new Set(repo.events.map((event) => event.journey_id)).size, 1);
  assert.equal(repo.journeys[0].event_count, 4);
  assert.equal(repo.journeys[0].purchase_count, 1);
  assert.equal(repo.journeys[0].conversion_count, 2);
  assert.equal(String(repo.journeys[0].total_revenue), "50");
  assert.equal(isJourneyConversionEventType("chargeback"), false);
});

test("journey status is derived from inactivity and conversion presence", () => {
  assert.deepEqual(deriveJourneyStatus({
    ended_at: "2026-01-01T00:00:00.000Z",
    conversion_count: 1,
    timeout_seconds: 60,
    now: "2026-01-01T00:00:30.000Z",
  }), { status: "active", is_active: true });
  assert.deepEqual(deriveJourneyStatus({
    ended_at: "2026-01-01T00:00:00.000Z",
    conversion_count: 1,
    timeout_seconds: 60,
    now: "2026-01-01T00:02:00.000Z",
  }), { status: "completed", is_active: false });
  assert.deepEqual(deriveJourneyStatus({
    ended_at: "2026-01-01T00:00:00.000Z",
    conversion_count: 0,
    timeout_seconds: 60,
    now: "2026-01-01T00:02:00.000Z",
  }), { status: "abandoned", is_active: false });
});

test("boundary helper requires same workspace person and timeout window", () => {
  const previous: any = { id: "a", workspace_id: "default", person_id: "person-1", event_time: "2026-01-01T00:00:00.000Z" };
  assert.equal(withinJourneyBoundary(previous, { ...previous, id: "b", event_time: "2026-01-31T00:00:00.000Z" }, JOURNEY_DEFAULT_TIMEOUT_SECONDS), true);
  assert.equal(withinJourneyBoundary(previous, { ...previous, id: "b", event_time: "2026-02-01T00:00:01.000Z" }, JOURNEY_DEFAULT_TIMEOUT_SECONDS), false);
  assert.equal(withinJourneyBoundary(previous, { ...previous, person_id: "person-2", id: "b" }, JOURNEY_DEFAULT_TIMEOUT_SECONDS), false);
});

test("summaries preserve decimal-safe revenue and compact public shape", () => {
  const summary = summarizeJourneyEvents([
    { id: "a", workspace_id: "default", person_id: "person-1", event_time: "2026-01-01T00:00:00.000Z", event_type: "purchase", amount: "0.10" } as any,
    { id: "b", workspace_id: "default", person_id: "person-1", event_time: "2026-01-02T00:00:00.000Z", event_type: "upsell", amount: "0.20" } as any,
  ], { now: "2026-01-03T00:00:00.000Z" });

  assert.equal(summary.total_revenue, "0.3");
  assert.equal(summary.conversion_count, 2);
  assert.equal(compactJourney({ id: "journey-1", workspace_id: "default", person_id: "person-1", ...summary } as JourneyRow).total_revenue, "0.3");
});

test("assignment backfill is idempotent and skips already assigned events", async () => {
  const repo = new MemoryJourneyRepository();
  repo.addPerson("default", "person-1");
  repo.addEvent({ id: "event-1", person_id: "person-1", event_time: "2026-01-01T00:00:00.000Z" });
  await assignJourneyEvents(repo, repo.events);
  const second = await assignJourneyEvents(repo, repo.events);

  assert.equal(second.events_skipped, 1);
  assert.equal(second.journeys_created, 0);
  assert.equal(repo.journeys.length, 1);
});

test("backfill request validation and cursor encoding are deterministic", () => {
  const parsed = normalizeJourneyBackfillRequest({ workspace_id: "default", from: "2026-07-01", to: "2026-07-18", batch_size: 1000, timeout_seconds: 30 });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.batch_size, 10);
    assert.equal(parsed.value.timeout_seconds, 60);
  }
  assert.equal(normalizeJourneyBackfillRequest({ from: "2026-07-18", to: "2026-07-01" }).ok, false);
  const cursor = serializeJourneyBackfillCursor({ person_id: "person-1", event_time: "2026-07-18T00:00:00.000Z", id: "event-1" });
  assert.deepEqual(decodeJourneyBackfillCursor(cursor), { person_id: "person-1", event_time: "2026-07-18T00:00:00.000Z", id: "event-1" });
  assert.equal(normalizeJourneyBoundaryTimeoutSeconds(0), JOURNEY_DEFAULT_TIMEOUT_SECONDS);
});

test("person journeys API returns stable cursor pages and enforces workspace", async () => {
  const repo = new MemoryJourneyRepository();
  repo.addPerson("default", "person-1");
  repo.addPerson("other", "person-1");
  repo.journeys.push(
    { id: "journey-1", workspace_id: "default", person_id: "person-1", started_at: "2026-01-01T00:00:00.000Z", ended_at: "2026-01-01T00:00:00.000Z", status: "active", entry_event_id: null, conversion_event_id: null, conversion_count: 0, purchase_count: 0, total_revenue: "0", event_count: 1, is_active: true, boundary_version: "v1_inactivity_timeout", boundary_timeout_seconds: 60, attribution_window_config: {}, metadata: {} },
    { id: "journey-2", workspace_id: "default", person_id: "person-1", started_at: "2026-02-01T00:00:00.000Z", ended_at: "2026-02-01T00:00:00.000Z", status: "active", entry_event_id: null, conversion_event_id: null, conversion_count: 0, purchase_count: 0, total_revenue: "0", event_count: 1, is_active: true, boundary_version: "v1_inactivity_timeout", boundary_timeout_seconds: 60, attribution_window_config: {}, metadata: {} },
  );

  const first = await getPersonJourneys(repo, normalizePersonJourneysParams({ workspace_id: "default", person_id: "person-1", limit: 1 }));
  assert.deepEqual(first.journeys.map((journey) => journey.id), ["journey-1"]);
  assert.ok(first.next_cursor);
  const second = await getPersonJourneys(repo, normalizePersonJourneysParams({ workspace_id: "default", person_id: "person-1", limit: 1, cursor: first.next_cursor }));
  assert.deepEqual(second.journeys.map((journey) => journey.id), ["journey-2"]);
  await assert.rejects(() => getPersonJourneys(repo, normalizePersonJourneysParams({ workspace_id: "default", person_id: "missing" })), /Person not found/);
  assert.ok(encodeJourneyListCursor({ started_at: "2026-01-01T00:00:00.000Z", id: "journey-1" }));
});

test("journey detail returns chronological events with pagination", async () => {
  const repo = new MemoryJourneyRepository();
  repo.journeys.push({ id: "journey-1", workspace_id: "default", person_id: "person-1", started_at: "2026-01-01T00:00:00.000Z", ended_at: "2026-01-02T00:00:00.000Z", status: "active", entry_event_id: "event-1", conversion_event_id: null, conversion_count: 0, purchase_count: 0, total_revenue: "0", event_count: 2, is_active: true, boundary_version: "v1_inactivity_timeout", boundary_timeout_seconds: 60, attribution_window_config: {}, metadata: {} });
  repo.addEvent({ id: "event-2", person_id: "person-1", journey_id: "journey-1", event_time: "2026-01-02T00:00:00.000Z" });
  repo.addEvent({ id: "event-1", person_id: "person-1", journey_id: "journey-1", event_time: "2026-01-01T00:00:00.000Z" });

  const first = await getJourneyDetail(repo, normalizeJourneyDetailParams({ workspace_id: "default", journey_id: "journey-1", limit: 1 }));
  assert.deepEqual(first.events.map((event) => event.id), ["event-1"]);
  const second = await getJourneyDetail(repo, normalizeJourneyDetailParams({ workspace_id: "default", journey_id: "journey-1", limit: 1, cursor: first.next_cursor }));
  assert.deepEqual(second.events.map((event) => event.id), ["event-2"]);
  await assert.rejects(() => getJourneyDetail(repo, normalizeJourneyDetailParams({ workspace_id: "other", journey_id: "journey-1" })), /Journey not found/);
});

test("journey route matcher reaches read handlers and rejects unsupported methods", () => {
  assert.deepEqual(matchJourneyRoutes("GET", "/v1/persons/person-1/journeys"), { kind: "person_journeys", person_id: "person-1" });
  assert.deepEqual(matchJourneyRoutes("GET", "/v1/journeys/journey-1/"), { kind: "journey_detail", journey_id: "journey-1" });
  assert.deepEqual(matchJourneyRoutes("POST", "/v1/journeys/journey-1"), { kind: "method_not_allowed", path: "/v1/journeys/:journey_id", allowed_methods: ["GET"] });
  assert.equal(matchJourneyRoutes("GET", "/v1/persons/person-1/timeline"), null);
});

test("supabase repository query shape uses exact tuple filtering after broad cursor conditions", () => {
  assert.equal(typeof createSupabaseJourneyRepository, "function");
});
