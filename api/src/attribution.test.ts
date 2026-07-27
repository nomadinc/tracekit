import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ATTRIBUTION_BACKFILL_INDEX,
  ATTRIBUTION_BACKFILL_DEFAULT_JOURNEY_BATCH_SIZE,
  ATTRIBUTION_BACKFILL_MAX_JOURNEY_BATCH_SIZE,
  ATTRIBUTION_MODEL_VERSION,
  TOUCHPOINT_ELIGIBILITY_VERSION,
  attributionCreditsEquivalent,
  calculateConversionAttribution,
  calculateJourneyAttribution,
  classifyTouchpoint,
  getJourneyAttribution,
  getPersonAttribution,
  isAttributableConversionEvent,
  isEligibleTouchpoint,
  matchAttributionRoutes,
  normalizeAttributionBackfillRequest,
  normalizePersonAttributionParams,
  persistAttributionCredits,
  processAttributionBackfillJourneys,
  recalculateJourneyAttribution,
  resolveAttributionWindowDays,
  type AttributionCreditInput,
  type AttributionCreditRow,
  type AttributionRepository,
} from "./attribution.ts";
import { type JourneyEventType } from "./journey-events.ts";
import { type JourneyEventWithJourney, type JourneyRow } from "./journeys.ts";

class MemoryAttributionRepository implements AttributionRepository {
  people = new Map<string, { id: string; workspace_id: string }>();
  journeys: JourneyRow[] = [];
  events: JourneyEventWithJourney[] = [];
  credits: AttributionCreditRow[] = [];
  replaceCalls = 0;
  findCalls = 0;
  eventQueryCalls = 0;
  identityMutationCalls = 0;
  journeyAssignmentCalls = 0;

  addPerson(workspaceId: string, personId: string) {
    this.people.set(`${workspaceId}:${personId}`, { id: personId, workspace_id: workspaceId });
  }

  addJourney(overrides: Partial<JourneyRow> & { id: string; person_id?: string; started_at?: string }) {
    const journey = makeJourney(overrides);
    this.journeys.push(journey);
    this.addPerson(journey.workspace_id, journey.person_id);
    return journey;
  }

  addEvent(overrides: Partial<JourneyEventWithJourney> & { id: string; event_type?: JourneyEventType; event_time: string }) {
    const event = makeEvent(overrides);
    this.events.push(event);
    return event;
  }

  async getPersonById(workspaceId: string, personId: string) {
    return this.people.get(`${workspaceId}:${personId}`) || null;
  }

  async getJourneyById(workspaceId: string, journeyId: string) {
    return this.journeys.find((journey) => journey.workspace_id === workspaceId && journey.id === journeyId) || null;
  }

  async queryJourneyEvents(workspaceId: string, journeyId: string) {
    this.eventQueryCalls += 1;
    return this.events
      .filter((event) => event.workspace_id === workspaceId && event.journey_id === journeyId)
      .sort((a, b) => Date.parse(a.event_time) - Date.parse(b.event_time) || a.id.localeCompare(b.id));
  }

  async queryAttributionCreditsForJourney(args: any) {
    return this.credits
      .filter((credit) => credit.workspace_id === args.workspace_id && credit.journey_id === args.journey_id)
      .filter((credit) => !args.model || credit.model === args.model)
      .filter((credit) => !args.conversion_event_id || credit.conversion_event_id === args.conversion_event_id)
      .sort((a, b) => Date.parse(a.conversion_event_time) - Date.parse(b.conversion_event_time) || a.conversion_event_id.localeCompare(b.conversion_event_id) || a.model.localeCompare(b.model));
  }

  async queryAttributionCreditsForPerson(args: any) {
    return this.credits
      .filter((credit) => credit.workspace_id === args.workspace_id && credit.person_id === args.person_id)
      .filter((credit) => !args.model || credit.model === args.model)
      .filter((credit) => !args.from || Date.parse(credit.conversion_event_time) >= Date.parse(args.from))
      .filter((credit) => !args.to || Date.parse(credit.conversion_event_time) <= Date.parse(args.to))
      .filter((credit) => {
        if (!args.cursor) return true;
        return Date.parse(credit.conversion_event_time) > Date.parse(args.cursor.event_time)
          || (Date.parse(credit.conversion_event_time) === Date.parse(args.cursor.event_time) && credit.id > args.cursor.id);
      })
      .sort((a, b) => Date.parse(a.conversion_event_time) - Date.parse(b.conversion_event_time) || a.id.localeCompare(b.id))
      .slice(0, args.limit);
  }

  async queryBackfillJourneys(args: any) {
    return this.journeys
      .filter((journey) => journey.workspace_id === args.workspace_id)
      .filter((journey) => Date.parse(journey.started_at) >= Date.parse(args.from_ts))
      .filter((journey) => Date.parse(journey.started_at) < Date.parse(args.to_exclusive_ts))
      .filter((journey) => !args.cursor || Date.parse(journey.started_at) > Date.parse(args.cursor.started_at) || (Date.parse(journey.started_at) === Date.parse(args.cursor.started_at) && journey.id > args.cursor.id))
      .sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at) || a.id.localeCompare(b.id))
      .slice(0, args.limit);
  }

  async findCreditsForRecalculation(args: any) {
    this.findCalls += 1;
    return this.credits.filter((credit) =>
      credit.workspace_id === args.workspace_id
      && credit.conversion_event_id === args.conversion_event_id
      && credit.model === args.model
      && credit.model_version === args.model_version,
    );
  }

  async replaceAttributionCredits(args: any) {
    this.replaceCalls += 1;
    const before = this.credits.length;
    this.credits = this.credits.filter((credit) =>
      !(credit.workspace_id === args.workspace_id
        && credit.conversion_event_id === args.conversion_event_id
        && credit.model === args.model
        && credit.model_version === args.model_version),
    );
    const replaced = before - this.credits.length;
    const rows = args.credits.map((credit: AttributionCreditInput, index: number) => ({
      id: `credit-${this.replaceCalls}-${index + 1}`,
      ...credit,
      created_at: "2026-07-20T00:00:00.000Z",
      updated_at: "2026-07-20T00:00:00.000Z",
    }));
    this.credits.push(...rows);
    return { inserted: rows.length, replaced };
  }
}

function makeJourney(overrides: Partial<JourneyRow> & { id?: string } = {}): JourneyRow {
  return {
    id: "journey-1",
    workspace_id: "default",
    person_id: "person-1",
    started_at: "2026-01-01T00:00:00.000Z",
    ended_at: "2026-01-05T00:00:00.000Z",
    status: "completed",
    entry_event_id: "touch-1",
    conversion_event_id: "purchase-1",
    conversion_count: 1,
    purchase_count: 1,
    total_revenue: "99.00",
    event_count: 3,
    is_active: false,
    boundary_version: "v1_inactivity_timeout",
    boundary_timeout_seconds: 2592000,
    attribution_window_config: {},
    metadata: {},
    ...overrides,
  };
}

function makeEvent(overrides: Partial<JourneyEventWithJourney> & { id: string; event_time: string }): JourneyEventWithJourney {
  return {
    workspace_id: "default",
    person_id: "person-1",
    journey_id: "journey-1",
    platform_order_id: null,
    session_id: null,
    touchpoint_id: null,
    event_type: "click",
    source_platform: "test",
    source_connector: "test",
    source_record_id: overrides.id,
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
    ...overrides,
  } as JourneyEventWithJourney;
}

function standardJourneyEvents(overrides: Partial<JourneyEventWithJourney>[] = []) {
  return [
    makeEvent({ id: "touch-1", event_time: "2026-01-01T00:00:00.000Z", event_type: "click", affiliate_id: "aff-1", source: "partner" }),
    makeEvent({ id: "touch-2", event_time: "2026-01-03T00:00:00.000Z", event_type: "email_click", source: "newsletter", medium: "email" }),
    makeEvent({ id: "purchase-1", event_time: "2026-01-05T00:00:00.000Z", event_type: "purchase", amount: "99.990001", currency: "usd" }),
    ...overrides.map((event) => makeEvent(event as any)),
  ];
}

test("migration creates rebuildable attribution credit storage and indexes", () => {
  const migration = readFileSync(new URL("../../supabase/migrations/019_attribution_engine_v1.sql", import.meta.url), "utf8");
  assert.match(migration, /create table if not exists public\.journey_attribution_credits/);
  assert.match(migration, /credit_fraction numeric\(18,6\)/);
  assert.match(migration, /credit_percent numeric\(18,4\)/);
  assert.match(migration, /credit_amount numeric/);
  assert.match(migration, /model in \('first_touch', 'last_touch'\)/);
  assert.match(migration, /journey_attribution_credit_uidx/);
  assert.match(migration, /journey_attribution_unattributed_uidx/);
  assert.match(migration, /replace_journey_attribution_credits/);
  assert.deepEqual(ATTRIBUTION_BACKFILL_INDEX.order_by, ["started_at asc", "id asc"]);
});

test("route matching covers attribution APIs and deterministic method rejection", () => {
  assert.deepEqual(matchAttributionRoutes("GET", "/v1/journeys/journey-1/attribution"), { kind: "journey_attribution", journey_id: "journey-1" });
  assert.deepEqual(matchAttributionRoutes("POST", "/v1/journeys/journey-1/attribution/recalculate"), { kind: "journey_attribution_recalculate", journey_id: "journey-1" });
  assert.deepEqual(matchAttributionRoutes("GET", "/v1/persons/person-1/attribution/"), { kind: "person_attribution", person_id: "person-1" });
  assert.deepEqual(matchAttributionRoutes("POST", "/v1/persons/person-1/attribution"), { kind: "method_not_allowed", path: "/v1/persons/:person_id/attribution", allowed_methods: ["GET"] });
});

test("backfill route is wired to Connector Runtime instead of synchronous attribution processing", () => {
  const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const routeStart = source.indexOf('if (path === "/v1/attribution/backfill" && req.method === "POST")');
  const routeEnd = source.indexOf('if (path === "/v1/attribution/backfill" && req.method !== "POST")');
  assert.ok(routeStart > 0);
  assert.ok(routeEnd > routeStart);
  const routeSource = source.slice(routeStart, routeEnd);
  assert.match(routeSource, /startAttributionBackfillRuntimeJob\(env/);
  assert.doesNotMatch(routeSource, /runAttributionBackfill\(env/);
  assert.match(source, /const ATTRIBUTION_BACKFILL_RUNTIME_TASK_TYPE = "attribution_backfill_batch"/);
  assert.match(source, /task\.task_type === ATTRIBUTION_BACKFILL_RUNTIME_TASK_TYPE/);
  assert.match(source, /createAndEnqueueConnectorRuntimeTask\(env, attributionBackfillRuntimeTaskPlanForProgress/);
  assert.match(source, /const ATTRIBUTION_BACKFILL_TASK_STALE_MS = 120000/);
  assert.match(source, /recoverStaleAttributionBackfillTask\(env, task/);
  assert.match(source, /findActiveAttributionBackfillTaskForJob\(env, job\.id, progress\)/);
  assert.match(source, /already_locked: executeAlreadyLocked/);
  assert.match(source, /const batchSize = attributionJourneyBatchSize\(task\.payload\?\.journey_batch_size/);
  assert.match(source, /if \(result\.body\?\.has_more && refreshedJob/);
  assert.match(source, /reconcileConnectorRuntimeJobQueue\(env, job/);
  assert.match(source, /action === "reconcile-queue"/);
  assert.match(source, /reconcileActiveConnectorRuntimeQueues\(env\)/);
  assert.match(source, /connector_runtime\.queue\.duplicate_execution_prevented/);
  assert.match(source, /connector_runtime\.queue\.queued_task_republished/);
});

test("queue handler acknowledges runtime messages only after execution and durable follow-up", () => {
  const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const queueStart = source.indexOf("async queue(batch: MessageBatch<any>, env: Env, ctx: ExecutionContext)");
  const executeBefore = source.indexOf("connector_runtime.queue.execute.before", queueStart);
  const executeCall = source.indexOf("executeConnectorRuntimeTask(env, task", executeBefore);
  const executeAfter = source.indexOf("connector_runtime.queue.execute.after", executeCall);
  const ackAfter = source.indexOf('ackRuntimeMessage({ reason: "runtime_task_processed" })', executeAfter);
  assert.ok(queueStart > 0);
  assert.ok(executeBefore > queueStart);
  assert.ok(executeCall > executeBefore);
  assert.ok(executeAfter > executeCall);
  assert.ok(ackAfter > executeAfter);
  assert.match(source.slice(queueStart, ackAfter), /await executeConnectorRuntimeTask\(env, task/);
  assert.match(source.slice(queueStart, ackAfter), /await forceQueueEvent\("connector_runtime\.queue\.execute\.after"/);
});

test("touchpoint eligibility is centralized and requires acquisition context", () => {
  const affiliate = makeEvent({ id: "a", event_time: "2026-01-01T00:00:00.000Z", event_type: "click", affiliate_id: "78" });
  const paid = makeEvent({ id: "b", event_time: "2026-01-01T00:00:00.000Z", event_type: "click", campaign_id: "camp-1", medium: "cpc" });
  const email = makeEvent({ id: "c", event_time: "2026-01-01T00:00:00.000Z", event_type: "email_click", source: "email" });
  const landing = makeEvent({ id: "d", event_time: "2026-01-01T00:00:00.000Z", event_type: "landing_page", source: "partner" });
  const emptyPage = makeEvent({ id: "e", event_time: "2026-01-01T00:00:00.000Z", event_type: "page_view" });

  assert.equal(isEligibleTouchpoint(affiliate), true);
  assert.equal(classifyTouchpoint(affiliate).channel, "affiliate");
  assert.equal(classifyTouchpoint(paid).channel, "paid_search");
  assert.equal(classifyTouchpoint(email).channel, "email");
  assert.equal(isEligibleTouchpoint(landing), true);
  assert.equal(isEligibleTouchpoint(makeEvent({ id: "lead", event_time: "2026-01-01T00:00:00.000Z", event_type: "lead_created", source: "partner" })), true);
  assert.equal(isEligibleTouchpoint(makeEvent({ id: "checkout", event_time: "2026-01-01T00:00:00.000Z", event_type: "checkout_started", source: "partner" })), true);
  assert.equal(isEligibleTouchpoint(emptyPage), false);
  assert.equal(classifyTouchpoint(emptyPage).reason, "missing_acquisition_context");
  assert.equal(classifyTouchpoint(affiliate).eligibility_version, TOUCHPOINT_ELIGIBILITY_VERSION);
  assert.deepEqual(classifyTouchpoint(makeEvent({ id: "x", event_time: "2026-01-01T00:00:00.000Z", event_type: "click", source: "unknown-source" })).channel, "other");
});

test("non-touchpoint and financial reversal events are not acquisition candidates", () => {
  for (const event_type of ["purchase", "upsell", "subscription_started", "subscription_renewed", "refund", "chargeback", "cancellation", "identify", "custom", "quiz_started", "form_started", "appointment", "email_open"] as JourneyEventType[]) {
    assert.equal(isEligibleTouchpoint(makeEvent({ id: event_type, event_type, event_time: "2026-01-01T00:00:00.000Z", source: "partner" })), false, event_type);
  }
});

test("conversion eligibility only includes positive conversion lifecycle events", () => {
  for (const event_type of ["purchase", "upsell", "subscription_started", "subscription_renewed"] as JourneyEventType[]) {
    assert.equal(isAttributableConversionEvent(makeEvent({ id: event_type, event_type, event_time: "2026-01-01T00:00:00.000Z" })), true, event_type);
  }
  for (const event_type of ["refund", "chargeback", "cancellation", "checkout_started"] as JourneyEventType[]) {
    assert.equal(isAttributableConversionEvent(makeEvent({ id: event_type, event_type, event_time: "2026-01-01T00:00:00.000Z" })), false, event_type);
  }
});

test("first and last touch choose deterministic winners inside one journey", () => {
  const journey = makeJourney();
  const events = standardJourneyEvents();
  const first = calculateConversionAttribution(journey, events, events[2], "first_touch");
  const last = calculateConversionAttribution(journey, events, events[2], "last_touch");

  assert.equal(first?.touchpoint_event_id, "touch-1");
  assert.equal(last?.touchpoint_event_id, "touch-2");
  assert.equal(first?.credit_fraction, "1.000000");
  assert.equal(first?.credit_percent, "100.0000");
  assert.equal(first?.credit_amount, "99.990001");
  assert.equal(first?.currency, "USD");
  assert.equal(first?.touchpoint_eligibility_version, TOUCHPOINT_ELIGIBILITY_VERSION);
});

test("browser page_view linked by identify can receive credit for a later commerce purchase", () => {
  const journey = makeJourney({
    id: "browser-journey",
    person_id: "person-browser",
    entry_event_id: "browser-page",
    conversion_event_id: "commerce-purchase",
  });
  const events = [
    makeEvent({
      id: "browser-page",
      journey_id: journey.id,
      person_id: journey.person_id,
      event_time: "2026-07-23T05:20:00.000Z",
      event_type: "page_view",
      source_platform: "browser",
      source_connector: "browser-event-normalization",
      source_record_id: "smoke-pageview-001",
      source: "facebook",
      medium: "cpc",
      campaign_id: "browser-smoke-test",
      affiliate_id: "123",
      metadata: { tkid: "tkid_smoke_001" },
    }),
    makeEvent({
      id: "browser-identify",
      journey_id: journey.id,
      person_id: journey.person_id,
      event_time: "2026-07-23T05:21:00.000Z",
      event_type: "identify",
      source_platform: "browser",
      source_connector: "browser-event-normalization",
      source_record_id: "identify-1",
      metadata: { tkid: "tkid_smoke_001" },
    }),
    makeEvent({
      id: "commerce-purchase",
      journey_id: journey.id,
      person_id: journey.person_id,
      event_time: "2026-07-23T05:30:00.000Z",
      event_type: "purchase",
      source_platform: "shopify",
      source_connector: "shopify",
      source_record_id: "shopify:order-1",
      amount: "50.00",
      currency: "USD",
    }),
  ];

  const first = calculateConversionAttribution(journey, events, events[2], "first_touch");
  const last = calculateConversionAttribution(journey, events, events[2], "last_touch");
  assert.equal(first?.touchpoint_event_id, "browser-page");
  assert.equal(last?.touchpoint_event_id, "browser-page");
  assert.equal(first?.metadata.touchpoint_event_type, "page_view");
});

test("browser purchase smoke event is a conversion without making identify a touchpoint", () => {
  const journey = makeJourney({
    id: "browser-smoke-journey",
    person_id: "person-browser",
    entry_event_id: "browser-page",
    conversion_event_id: "browser-purchase",
  });
  const events = [
    makeEvent({
      id: "browser-page",
      journey_id: journey.id,
      person_id: journey.person_id,
      event_time: "2026-07-23T05:20:00.000Z",
      event_type: "page_view",
      source_platform: "browser",
      source_connector: "browser-event-normalization",
      source_record_id: "smoke-pageview-001",
      source: "facebook",
      medium: "cpc",
      metadata: { tkid: "tkid_smoke_001" },
    }),
    makeEvent({
      id: "browser-identify",
      journey_id: journey.id,
      person_id: journey.person_id,
      event_time: "2026-07-23T05:21:00.000Z",
      event_type: "identify",
      source_platform: "browser",
      source_connector: "browser-event-normalization",
      source_record_id: "identify-1",
      metadata: { tkid: "tkid_smoke_001" },
    }),
    makeEvent({
      id: "browser-purchase",
      journey_id: journey.id,
      person_id: journey.person_id,
      event_time: "2026-07-23T05:30:00.000Z",
      event_type: "purchase",
      source_platform: "browser",
      source_connector: "browser-event-normalization",
      source_record_id: "smoke-purchase-001",
      amount: "49.95",
      currency: "USD",
      metadata: { browser_purchase_smoke_event: true, tkid: "tkid_smoke_001" },
    }),
  ];

  assert.equal(isAttributableConversionEvent(events[2]), true);
  assert.equal(isEligibleTouchpoint(events[1]), false);
  const first = calculateConversionAttribution(journey, events, events[2], "first_touch");
  const last = calculateConversionAttribution(journey, events, events[2], "last_touch");

  assert.equal(first?.touchpoint_event_id, "browser-page");
  assert.equal(last?.touchpoint_event_id, "browser-page");
  assert.equal(first?.credit_amount, "49.95");
  assert.equal(first?.currency, "USD");
});

test("after-conversion, out-of-scope, and outside-window touchpoints are excluded", () => {
  const journey = makeJourney();
  const conversion = makeEvent({ id: "purchase-1", event_time: "2026-02-01T00:00:00.000Z", event_type: "purchase", amount: "10", currency: "USD" });
  const events = [
    makeEvent({ id: "old", event_time: "2025-12-31T23:59:59.000Z", event_type: "click", affiliate_id: "aff-old" }),
    makeEvent({ id: "other-person", person_id: "person-2", event_time: "2026-01-20T00:00:00.000Z", event_type: "click", affiliate_id: "aff-other" }),
    makeEvent({ id: "other-journey", journey_id: "journey-2", event_time: "2026-01-20T00:00:00.000Z", event_type: "click", affiliate_id: "aff-other" }),
    makeEvent({ id: "other-workspace", workspace_id: "other", event_time: "2026-01-20T00:00:00.000Z", event_type: "click", affiliate_id: "aff-other" }),
    makeEvent({ id: "valid", event_time: "2026-01-20T00:00:00.000Z", event_type: "click", affiliate_id: "aff-valid" }),
    makeEvent({ id: "after", event_time: "2026-02-01T00:00:01.000Z", event_type: "click", affiliate_id: "aff-after" }),
    conversion,
  ];

  assert.equal(calculateConversionAttribution(journey, events, conversion, "first_touch")?.touchpoint_event_id, "valid");
  assert.equal(calculateConversionAttribution(journey, events, conversion, "last_touch")?.touchpoint_event_id, "valid");
});

test("same-timestamp ties use event id ascending for first touch and descending for last touch", () => {
  const journey = makeJourney();
  const conversion = makeEvent({ id: "purchase-1", event_time: "2026-01-02T00:00:00.000Z", event_type: "purchase" });
  const events = [
    makeEvent({ id: "a-touch", event_time: "2026-01-01T00:00:00.000Z", event_type: "click", campaign_id: "campaign" }),
    makeEvent({ id: "z-touch", event_time: "2026-01-01T00:00:00.000Z", event_type: "click", campaign_id: "campaign" }),
    conversion,
  ];

  assert.equal(calculateConversionAttribution(journey, events, conversion, "first_touch")?.touchpoint_event_id, "a-touch");
  assert.equal(calculateConversionAttribution(journey, events, conversion, "last_touch")?.touchpoint_event_id, "z-touch");
});

test("window defaults, inclusive boundary, custom config, and invalid config fallback are deterministic", () => {
  const conversion = makeEvent({ id: "purchase-1", event_time: "2026-01-31T00:00:00.000Z", event_type: "purchase" });
  const boundaryTouch = makeEvent({ id: "boundary", event_time: "2026-01-01T00:00:00.000Z", event_type: "click", affiliate_id: "aff" });
  const outsideTouch = makeEvent({ id: "outside", event_time: "2025-12-31T23:59:59.000Z", event_type: "click", affiliate_id: "aff" });
  const defaultJourney = makeJourney();

  assert.equal(calculateConversionAttribution(defaultJourney, [boundaryTouch, conversion], conversion, "first_touch")?.touchpoint_event_id, "boundary");
  assert.equal(calculateConversionAttribution(defaultJourney, [outsideTouch, conversion], conversion, "first_touch")?.status, "unattributed");

  const viewTouch = makeEvent({ id: "view", event_time: "2026-01-28T00:00:00.000Z", event_type: "landing_page", source: "partner" });
  const customJourney = makeJourney({ attribution_window_config: { default_view_days: 5 } as any });
  const invalidJourney = makeJourney({ attribution_window_config: { default_click_days: "invalid" } as any });
  assert.equal(resolveAttributionWindowDays(viewTouch, customJourney), 5);
  assert.equal(resolveAttributionWindowDays(boundaryTouch, invalidJourney), 30);
  assert.equal(calculateConversionAttribution(customJourney, [viewTouch, conversion], conversion, "last_touch")?.metadata.attribution_window_days, 5);
});

test("unattributed conversions are explicit and missing amounts still receive percentage credit", () => {
  const journey = makeJourney();
  const noAmountConversion = makeEvent({ id: "purchase-no-amount", event_time: "2026-01-05T00:00:00.000Z", event_type: "purchase", amount: null, currency: "USD" });
  const attributed = calculateConversionAttribution(journey, [standardJourneyEvents()[0], noAmountConversion], noAmountConversion, "first_touch");
  assert.equal(attributed?.status, "attributed");
  assert.equal(attributed?.credit_percent, "100.0000");
  assert.equal(attributed?.credit_amount, null);

  const unattributed = calculateConversionAttribution(journey, [noAmountConversion], noAmountConversion, "first_touch");
  assert.equal(unattributed?.status, "unattributed");
  assert.equal(unattributed?.touchpoint_event_id, null);
  assert.equal(unattributed?.reason, "no_eligible_touchpoint");
});

test("journey calculation supports platform and model filters", () => {
  const journey = makeJourney();
  const events = standardJourneyEvents([
    { id: "shopify-purchase", event_time: "2026-01-06T00:00:00.000Z", event_type: "purchase", source_platform: "shopify", amount: "15", currency: "USD" },
  ]);

  const all = calculateJourneyAttribution(journey, events, ["first_touch", "last_touch"]);
  const wowOnly = calculateJourneyAttribution(journey, events, ["first_touch"], { platforms: ["test"] });

  assert.equal(all.conversions.length, 2);
  assert.equal(all.credits.length, 4);
  assert.equal(wowOnly.conversions.length, 1);
  assert.equal(wowOnly.credits.length, 1);
});

test("persistence inserts, reruns idempotently, replaces stale winners, and isolates versions", async () => {
  const repo = new MemoryAttributionRepository();
  const journey = repo.addJourney({ id: "journey-1" });
  repo.events.push(...standardJourneyEvents());
  const calculated = calculateJourneyAttribution(journey, repo.events, ["first_touch", "last_touch"]);

  const inserted = await persistAttributionCredits(repo, calculated.credits);
  assert.equal(inserted.inserted, 2);
  assert.equal(repo.credits.length, 2);

  const rerun = await persistAttributionCredits(repo, calculated.credits);
  assert.equal(rerun.already_current, 2);
  assert.equal(repo.replaceCalls, 2);

  const delayedEarlierTouch = makeEvent({ id: "touch-0", event_time: "2025-12-31T00:00:00.000Z", event_type: "click", affiliate_id: "aff-0" });
  repo.events.unshift(delayedEarlierTouch);
  const recalculated = calculateJourneyAttribution(journey, repo.events, ["first_touch"]);
  const replaced = await persistAttributionCredits(repo, recalculated.credits, { force_recalculate: true });
  assert.equal(replaced.replaced, 1);
  assert.equal(repo.credits.find((credit) => credit.model === "first_touch")?.touchpoint_event_id, "touch-0");
  assert.equal(repo.credits.find((credit) => credit.model === "last_touch")?.touchpoint_event_id, "touch-2");

  repo.credits.push({ ...repo.credits[0], id: "old-version", model_version: "old_v1", touchpoint_event_id: "legacy-touch" });
  await persistAttributionCredits(repo, recalculated.credits);
  assert.equal(repo.credits.some((credit) => credit.model_version === "old_v1"), true);
  assert.equal(attributionCreditsEquivalent(repo.credits.filter((credit) => credit.model_version === ATTRIBUTION_MODEL_VERSION && credit.model === "first_touch"), recalculated.credits), true);
});

test("persisting attribution credits emits domain events only after authoritative replacement", async () => {
  const repo = new MemoryAttributionRepository();
  const journey = repo.addJourney({ id: "journey-1" });
  repo.events.push(...standardJourneyEvents());
  const calculated = calculateJourneyAttribution(journey, repo.events, ["first_touch"]);
  const events: any[] = [];

  const inserted = await persistAttributionCredits(repo, calculated.credits, {
    on_domain_event: async (event) => {
      events.push(event);
    },
  });
  const rerun = await persistAttributionCredits(repo, calculated.credits, {
    on_domain_event: async (event) => {
      events.push(event);
    },
  });

  assert.equal(inserted.inserted, 1);
  assert.equal(rerun.already_current, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "attribution.generated");
  assert.equal(events[0].payload.model, "first_touch");
  assert.equal(events[0].correlationId.includes("purchase-1"), true);
});

test("recalculate journey persists first and last touch without mutating source events", async () => {
  const repo = new MemoryAttributionRepository();
  const journey = repo.addJourney({ id: "journey-1" });
  repo.events.push(...standardJourneyEvents());
  const before = JSON.stringify(repo.events);

  const result = await recalculateJourneyAttribution(repo, {
    workspace_id: "default",
    journey_id: journey.id,
    models: ["first_touch", "last_touch"],
    force_recalculate: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.conversions_discovered, 1);
  assert.equal(repo.credits.length, 2);
  assert.equal(JSON.stringify(repo.events), before);
  assert.equal(repo.identityMutationCalls, 0);
  assert.equal(repo.journeyAssignmentCalls, 0);
});

test("backfill processes bounded journeys, records unattributed conversions, and resumes by cursor", async () => {
  const repo = new MemoryAttributionRepository();
  const firstJourney = repo.addJourney({ id: "journey-1", started_at: "2026-01-01T00:00:00.000Z" });
  const secondJourney = repo.addJourney({ id: "journey-2", started_at: "2026-01-02T00:00:00.000Z" });
  repo.addJourney({ id: "journey-3", started_at: "2026-01-03T00:00:00.000Z" });
  repo.events.push(...standardJourneyEvents().map((event) => ({ ...event, journey_id: firstJourney.id })));
  repo.events.push(makeEvent({ id: "purchase-2", journey_id: secondJourney.id, event_time: "2026-01-02T12:00:00.000Z", event_type: "purchase", amount: "5", currency: "USD" }));

  const rows = await repo.queryBackfillJourneys({
    workspace_id: "default",
    from_ts: "2026-01-01T00:00:00.000Z",
    to_exclusive_ts: "2026-01-04T00:00:00.000Z",
    cursor: null,
    limit: 2,
  });
  const result = await processAttributionBackfillJourneys(repo, rows, {
    workspace_id: "default",
    from: "2026-01-01",
    to: "2026-01-03",
    models: ["first_touch", "last_touch"],
    platforms: [],
    batch_size: 2,
    cursor: null,
    job_id: null,
    force_recalculate: false,
  });

  assert.equal(result.journeys_discovered, 2);
  assert.equal(result.journeys_processed, 2);
  assert.equal(result.conversions_discovered, 2);
  assert.equal(result.conversions_attributed_first_touch, 1);
  assert.equal(result.conversions_attributed_last_touch, 1);
  assert.equal(result.conversions_unattributed, 2);
  assert.equal(repo.credits.length, 4);
  const rerun = await processAttributionBackfillJourneys(repo, rows, {
    workspace_id: "default",
    from: "2026-01-01",
    to: "2026-01-03",
    models: ["first_touch", "last_touch"],
    platforms: [],
    batch_size: 2,
    cursor: null,
    job_id: null,
    force_recalculate: false,
  });
  assert.equal(rerun.credits_already_current, 4);
});

test("one-journey attribution batch still processes multiple conversions in that journey", async () => {
  const repo = new MemoryAttributionRepository();
  const journey = repo.addJourney({ id: "journey-1", started_at: "2026-01-01T00:00:00.000Z" });
  repo.events.push(
    ...standardJourneyEvents([
      { id: "purchase-2", event_time: "2026-01-06T00:00:00.000Z", event_type: "purchase", amount: "25", currency: "USD" },
    ]).map((event) => ({ ...event, journey_id: journey.id })),
  );

  const rows = await repo.queryBackfillJourneys({
    workspace_id: "default",
    from_ts: "2026-01-01T00:00:00.000Z",
    to_exclusive_ts: "2026-01-07T00:00:00.000Z",
    cursor: null,
    limit: 1,
  });
  const result = await processAttributionBackfillJourneys(repo, rows, {
    workspace_id: "default",
    from: "2026-01-01",
    to: "2026-01-06",
    models: ["first_touch", "last_touch"],
    platforms: [],
    batch_size: 1,
    cursor: null,
    job_id: null,
    force_recalculate: false,
  });

  assert.equal(result.journeys_discovered, 1);
  assert.equal(result.journeys_processed, 1);
  assert.equal(result.conversions_discovered, 2);
  assert.equal(result.conversions_attributed_first_touch, 2);
  assert.equal(result.conversions_attributed_last_touch, 2);
  assert.equal(repo.credits.length, 4);
});

test("backfill request validation rejects invalid dates and preserves normalized options", () => {
  const parsed = normalizeAttributionBackfillRequest({
    workspace_id: "default",
    from: "2026-01-01",
    to: "2026-01-31",
    models: ["first_touch"],
    platforms: ["WowBoost", "shopify"],
    batch_size: 500,
    force_recalculate: true,
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.deepEqual(parsed.value.models, ["first_touch"]);
    assert.deepEqual(parsed.value.platforms, ["shopify", "wowboost"]);
    assert.equal(ATTRIBUTION_BACKFILL_DEFAULT_JOURNEY_BATCH_SIZE, 1);
    assert.equal(ATTRIBUTION_BACKFILL_MAX_JOURNEY_BATCH_SIZE, 1);
    assert.equal(parsed.value.batch_size, 1);
    assert.equal(parsed.value.force_recalculate, true);
  }
  assert.equal(normalizeAttributionBackfillRequest({ from: "2026-02-01", to: "2026-01-01" }).ok, false);
});

test("journey attribution API distinguishes not calculated from unattributed and supports filters", async () => {
  const repo = new MemoryAttributionRepository();
  const journey = repo.addJourney({ id: "journey-1" });
  repo.events.push(...standardJourneyEvents());

  const before = await getJourneyAttribution(repo, { workspace_id: "default", journey_id: journey.id, models: ["first_touch"], conversion_event_id: null });
  assert.equal(before.conversions[0].attribution.first_touch.status, "not_calculated");

  await recalculateJourneyAttribution(repo, { workspace_id: "default", journey_id: journey.id, models: ["first_touch"], force_recalculate: true });
  const after = await getJourneyAttribution(repo, { workspace_id: "default", journey_id: journey.id, models: ["first_touch"], conversion_event_id: "purchase-1" });
  assert.equal(after.conversions.length, 1);
  assert.equal(after.conversions[0].attribution.first_touch.status, "attributed");
  assert.equal(after.conversions[0].attribution.first_touch.touchpoint.event_id, "touch-1");

  await assert.rejects(() => getJourneyAttribution(repo, { workspace_id: "other", journey_id: journey.id, models: ["first_touch"], conversion_event_id: null }), /Journey not found/);
});

test("person attribution API is workspace scoped, filtered, paginated, and omits sensitive identity fields", async () => {
  const repo = new MemoryAttributionRepository();
  const journey = repo.addJourney({ id: "journey-1" });
  repo.events.push(...standardJourneyEvents([
    { id: "purchase-2", event_time: "2026-01-06T00:00:00.000Z", event_type: "upsell", amount: "25", currency: "USD" },
  ]));
  await recalculateJourneyAttribution(repo, { workspace_id: "default", journey_id: journey.id, models: ["first_touch"], force_recalculate: true });
  const firstPage = await getPersonAttribution(repo, { workspace_id: "default", person_id: "person-1", model: "first_touch", from: null, to: null, limit: 1, cursor: null });
  assert.equal(firstPage.attribution.length, 1);
  assert.ok(firstPage.next_cursor);
  assert.equal(JSON.stringify(firstPage).includes("@"), false);
  assert.equal(JSON.stringify(firstPage).includes("phone"), false);

  const secondPage = await getPersonAttribution(repo, normalizePersonAttributionParams({
    workspace_id: "default",
    person_id: "person-1",
    model: "first_touch",
    limit: 5,
    cursor: firstPage.next_cursor,
  }));
  assert.equal(secondPage.attribution.length, 1);
  assert.equal(secondPage.attribution[0].conversion_event_id, "purchase-2");
  await assert.rejects(() => getPersonAttribution(repo, normalizePersonAttributionParams({ workspace_id: "other", person_id: "person-1" })), /Person not found/);
  assert.throws(() => normalizePersonAttributionParams({ person_id: "person-1", model: "linear" }), /Invalid attribution model/);
  assert.throws(() => normalizePersonAttributionParams({ person_id: "person-1", from: "2026-02-01", to: "2026-01-01" }), /from must be on or before to/);
  assert.throws(() => normalizePersonAttributionParams({ person_id: "person-1", cursor: "not-json" }), /Invalid timeline cursor/);
});
