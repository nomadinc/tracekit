import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BROWSER_EXTERNAL_CUSTOMER_ID_MAX_LENGTH,
  BROWSER_EVENT_CONFIG_PATH,
  BROWSER_EVENT_INGESTION_PATH,
  BROWSER_EVENT_LEGACY_INGESTION_PATH,
  BROWSER_EVENT_DEFAULT_BATCH_SIZE,
  BROWSER_EVENT_LEGACY_SETUP_PATH,
  BROWSER_EVENT_NORMALIZE_TASK_TYPE,
  BROWSER_EVENT_SETUP_PATH,
  BROWSER_EVENTS_CONNECTOR_ID,
  BROWSER_EVENTS_JOB_TYPE,
  browserCorsHeaders,
  browserIdentityIdentifiers,
  browserJourneyEventType,
  browserOriginAllowed,
  browserPayloadHash,
  browserSetupSnippet,
  browserWriteKeyHash,
  browserEventPersonAttributes,
  applyBrowserTkidIdentityToBatch,
  buildBrowserJourneyEventInput,
  ATTRIBUTION_EVIDENCE_MAX_ENTRIES,
  ATTRIBUTION_EVIDENCE_MAX_VALUE_LENGTH,
  extractBrowserAttributionEvidence,
  isBrowserAttributionEligible,
  matchBrowserEventRoute,
  normalizeBrowserEventForRawStorage,
  normalizeBrowserEventType,
  normalizeBrowserMarketingFields,
  parseBrowserEventCursor,
  serializeBrowserEventCursor,
} from "./browser-events.ts";
import {
  assignJourneyEvents,
  type JourneyEventWithJourney,
  type JourneyRepository,
  type JourneyRow,
} from "./journeys.ts";

class BrowserJourneyMemoryRepository implements JourneyRepository {
  people = new Map<string, { id: string; workspace_id: string }>();
  events: JourneyEventWithJourney[] = [];
  journeys: JourneyRow[] = [];

  addPerson(workspaceId: string, personId: string) {
    this.people.set(`${workspaceId}:${personId}`, { id: personId, workspace_id: workspaceId });
  }

  async getPersonById(workspaceId: string, personId: string) {
    return this.people.get(`${workspaceId}:${personId}`) || null;
  }

  async queryUnassignedJourneyEvents() {
    return [];
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
    const journey = {
      id: row.id || `journey-${this.journeys.length + 1}`,
      created_at: "2026-07-23T00:00:00.000Z",
      updated_at: "2026-07-23T00:00:00.000Z",
      ...row,
    } as JourneyRow;
    this.journeys.push(journey);
    return journey;
  }

  async updateJourneySummary(journeyId: string, patch: any) {
    const index = this.journeys.findIndex((journey) => journey.id === journeyId);
    assert.notEqual(index, -1);
    this.journeys[index] = { ...this.journeys[index], ...patch, updated_at: "2026-07-23T00:00:00.000Z" };
    return this.journeys[index];
  }

  async assignEventsToJourney(journeyId: string, eventIds: string[]) {
    for (const event of this.events) {
      if (eventIds.includes(event.id)) event.journey_id = journeyId;
    }
  }

  async getJourneyById(workspaceId: string, journeyId: string) {
    return this.journeys.find((journey) => journey.workspace_id === workspaceId && journey.id === journeyId) || null;
  }

  async queryPersonJourneys() {
    return [];
  }

  async queryJourneyEvents() {
    return [];
  }
}

test("browser event type aliases normalize to canonical values", () => {
  assert.equal(normalizeBrowserEventType("pageview"), "page_view");
  assert.equal(normalizeBrowserEventType("page.view"), "page_view");
  assert.equal(normalizeBrowserEventType("outbound_click"), "click");
  assert.equal(normalizeBrowserEventType("identify"), "identify");
  assert.equal(normalizeBrowserEventType("form_submit"), "lead");
  assert.equal(normalizeBrowserEventType("initiate_checkout"), "checkout_started");
  assert.equal(normalizeBrowserEventType("purchase"), "purchase");
});

test("normalizes raw page views without requiring identity", async () => {
  const normalized = await normalizeBrowserEventForRawStorage({
    workspace_id: "default",
    event_type: "page_view",
    event_time: "2026-07-22T10:00:00.000Z",
    tkid: "tkid_123",
    session_id: "session_1",
    page_url: "https://example.com/?utm_source=partner",
  }, {
    received_at: "2026-07-22T10:00:01.000Z",
    event_id_fallback: "evt_fallback",
    request_context: { origin: "https://example.com" },
  });

  assert.equal(normalized.ok, true);
  assert.equal(normalized.value.event_id, "evt_fallback");
  assert.equal(normalized.value.normalized_event_type, "page_view");
  assert.equal(normalized.value.tkid, "tkid_123");
  assert.equal(normalized.value.normalization_status, "pending");
});

test("smoke page view with string browser session id is accepted for browser_events_raw", async () => {
  const normalized = await normalizeBrowserEventForRawStorage({
    workspace_id: "default",
    event_type: "page_view",
    event_time: "2026-07-23T05:20:00.000Z",
    event_id: "smoke-pageview-001",
    tkid: "tkid_smoke_001",
    session_id: "tks_smoke_001",
    page_url: "https://tracekit.io/smoke-test?utm_source=facebook&utm_medium=cpc&utm_campaign=browser-smoke-test",
    landing_url: "https://tracekit.io/smoke-test",
    utm_source: "facebook",
    utm_medium: "cpc",
    utm_campaign: "browser-smoke-test",
    affiliate_id: "123",
  }, {
    received_at: "2026-07-23T05:20:01.000Z",
    event_id_fallback: "ignored",
    request_context: { origin: "https://tracekit.io" },
  });

  assert.equal(normalized.ok, true);
  assert.equal(normalized.value.session_id, "tks_smoke_001");
  assert.equal(normalized.value.event_id, "smoke-pageview-001");
  assert.equal(normalized.value.normalized_event_type, "page_view");
  assert.equal(normalized.value.raw_payload.utm_source, "facebook");
});

test("missing event time uses received_at with warning instead of rejecting", async () => {
  const normalized = await normalizeBrowserEventForRawStorage({
    workspace_id: "default",
    event_type: "click",
    event_id: "evt_click",
  }, {
    received_at: "2026-07-22T10:00:01.000Z",
    event_id_fallback: "ignored",
    request_context: {},
  });

  assert.equal(normalized.ok, true);
  assert.equal(normalized.value.event_time, "2026-07-22T10:00:01.000Z");
  assert.deepEqual(normalized.warnings, ["event_time_missing_or_invalid_used_received_at"]);
});

test("unsupported event type is clearly rejected before persistence", async () => {
  const normalized = await normalizeBrowserEventForRawStorage({
    workspace_id: "default",
    event_type: "refund",
  }, {
    received_at: "2026-07-22T10:00:01.000Z",
    event_id_fallback: "evt",
    request_context: {},
  });

  assert.equal(normalized.ok, false);
  assert.equal(normalized.error, "unsupported_event_type");
});

test("marketing parameters preserve current and first-touch values", () => {
  const fields = normalizeBrowserMarketingFields({
    page_url: "https://example.com/?utm_source=search&_ef_transaction_id=EF-123&affid=aff-1&oid=offer-1&sub6=six",
    utm_medium: "cpc",
    first_touch: { utm_source: "original" },
    current_touch: { utm_source: "search" },
  });

  assert.equal(fields.current.source, "search");
  assert.equal(fields.current.medium, "cpc");
  assert.equal(fields.current.transaction_id, "EF-123");
  assert.equal(fields.current.affiliate_id, "aff-1");
  assert.equal(fields.current.offer_id, "offer-1");
  assert.equal(fields.current.sub6, "six");
  assert.deepEqual(fields.first_touch, { utm_source: "original" });
  assert.deepEqual(fields.current_touch, { utm_source: "search" });
});

test("attribution evidence preserves providers, aliases, conflicts, and compatibility", () => {
  const payload = {
    page_url: "https://example.com/?fbclid=META1&gclid=G1&_ef_transaction_id=EF1&transaction_id=OTHER1&aff_click_id=T1&aff_sub=A&aff_sub2=B&irclickid=I1&gbraid=GB1&wbraid=WB1",
    referrer: "https://publisher.example/path?token=not-copied",
  };
  const before = normalizeBrowserMarketingFields(payload);
  const evidence = extractBrowserAttributionEvidence(payload);
  const after = normalizeBrowserMarketingFields(payload);

  assert.deepEqual(after, before);
  assert.equal(after.current.transaction_id, "EF1");
  assert.deepEqual(evidence.identifiers.map((item) => [item.raw_param, item.value, item.provider, item.category]), [
    ["_ef_transaction_id", "EF1", "everflow", "affiliate_network"],
    ["transaction_id", "OTHER1", "unknown", "tracker"],
    ["aff_click_id", "T1", "tune", "affiliate_network"],
    ["aff_sub", "A", "tune", "affiliate_network"],
    ["aff_sub2", "B", "tune", "affiliate_network"],
    ["irclickid", "I1", "impact", "affiliate_network"],
    ["gclid", "G1", "google", "paid_media"],
    ["gbraid", "GB1", "google", "paid_media"],
    ["wbraid", "WB1", "google", "paid_media"],
    ["fbclid", "META1", "meta", "paid_media"],
  ]);
  assert.deepEqual(evidence.referrer, { client: "https://publisher.example/path", origin: "https://publisher.example", domain: "publisher.example", missing: false });
  assert.ok(evidence.flags.includes("identifier_value_conflict"));
  assert.ok(evidence.flags.includes("paid_media_plus_affiliate_network"));
  assert.ok(!evidence.flags.some((flag) => /fraud|suspicious/.test(flag)));
});

test("attribution evidence retains locations and distinct values deterministically", () => {
  const evidence = extractBrowserAttributionEvidence({
    fbclid: "SAME",
    page_url: "https://example.com/?fbclid=SAME&fbclid=DIFFERENT&_ef_transaction_id=EF1",
    landing_url: "https://example.com/start?_ef_transaction_id=EF1",
    first_touch: { params: { _ef_transaction_id: "EF1" } },
    current_touch: { params: { fbclid: "SAME" } },
  });
  assert.deepEqual(evidence.identifiers.filter((item) => item.raw_param === "fbclid").map((item) => [item.value, item.source_location]), [
    ["SAME", "top_level"], ["SAME", "page_url"], ["DIFFERENT", "page_url"], ["SAME", "current_touch.params"],
  ]);
  assert.deepEqual(evidence.identifiers.filter((item) => item.raw_param === "_ef_transaction_id").map((item) => item.source_location), [
    "page_url", "landing_url", "first_touch.params",
  ]);
  assert.ok(evidence.flags.includes("identifier_value_conflict"));
});

test("attribution evidence is allowlisted, bounded, conservative, and fail-open", () => {
  const oversized = "x".repeat(ATTRIBUTION_EVIDENCE_MAX_VALUE_LENGTH + 50);
  const evidence = extractBrowserAttributionEvidence({
    page_url: `https://example.com/?gclid=${oversized}&password=p&token=t&access_token=a&email=buyer%40example.com&s1=cake-ambiguous`,
  });
  assert.equal(evidence.identifiers[0].value.length, ATTRIBUTION_EVIDENCE_MAX_VALUE_LENGTH);
  assert.deepEqual(evidence.marketing_params.map((item) => [item.raw_param, item.provider, item.category]), [["s1", "unknown", "marketing_metadata"]]);
  assert.doesNotMatch(JSON.stringify(evidence), /password|access_token|buyer@example\.com/);
  assert.deepEqual(evidence.referrer, { client: null, origin: null, domain: null, missing: true });
  assert.ok(evidence.flags.includes("referrer_missing"));
  assert.ok(evidence.identifiers.length + evidence.marketing_params.length <= ATTRIBUTION_EVIDENCE_MAX_ENTRIES);

  const broken = new Proxy({}, { get() { throw new Error("broken payload getter"); } });
  assert.doesNotThrow(() => extractBrowserAttributionEvidence(broken));
  assert.deepEqual(extractBrowserAttributionEvidence(broken).identifiers, []);
});

test("journey metadata receives evidence without changing normalized output", () => {
  const raw: any = {
    event_id: "evidence-1", workspace_id: "default", received_at: "2026-07-22T10:00:01.000Z", event_time: "2026-07-22T10:00:00.000Z",
    event_type: "page_view", normalized_event_type: "page_view", tkid: "tkid_evidence", session_id: "tks_evidence", source: "browser_sdk", schema_version: 1,
    raw_payload: { page_url: "https://example.com/?gclid=G1&_ef_transaction_id=EF1", referrer: "" }, request_context: {}, normalization_status: "pending",
  };
  const input = buildBrowserJourneyEventInput(raw)!;
  assert.equal(input.transaction_id, "EF1");
  assert.equal(input.metadata.tkid, "tkid_evidence");
  assert.deepEqual(input.metadata.attribution_evidence_v1.identifiers.map((item: any) => item.raw_param), ["_ef_transaction_id", "gclid"]);
});

test("browser journey event mapping uses existing journey event schema", () => {
  assert.equal(browserJourneyEventType("lead"), "lead_created");
  assert.equal(browserJourneyEventType("identify"), "identify");
  assert.equal(isBrowserAttributionEligible("page_view"), true);
  assert.equal(isBrowserAttributionEligible("click"), true);
  assert.equal(isBrowserAttributionEligible("lead"), true);
  assert.equal(isBrowserAttributionEligible("checkout_started"), true);
  assert.equal(isBrowserAttributionEligible("identify"), false);
  assert.equal(isBrowserAttributionEligible("purchase"), false);
  assert.equal(isBrowserAttributionEligible("custom"), false);
});

test("browser identify remains identify and can carry resolved person identity", () => {
  const input = buildBrowserJourneyEventInput({
    event_id: "identify-1",
    workspace_id: "default",
    received_at: "2026-07-23T05:21:01.000Z",
    event_time: "2026-07-23T05:21:00.000Z",
    event_type: "identify",
    normalized_event_type: "identify",
    tkid: "tkid_smoke_001",
    session_id: "tks_smoke_001",
    source: "browser_sdk",
    schema_version: 1,
    raw_payload: {
      event_type: "identify",
      normalized_event_type: "identify",
      email: "buyer@example.com",
      tkid: "tkid_smoke_001",
    },
    request_context: { origin: "https://tracekit.io" },
    normalization_status: "pending",
  }, { person_id: "person-1" });

  assert.equal(input?.event_type, "identify");
  assert.equal(input?.person_id, "person-1");
  assert.equal(input?.metadata?.browser_event_type, "identify");
  assert.equal(input?.metadata?.attribution_eligible, false);
  assert.equal(input?.metadata?.tkid, "tkid_smoke_001");
});

test("same-batch anonymous page_view inherits person from later identify with same tkid", () => {
  const rows = [
    { event_id: "page-1", tkid: "tkid_smoke_001" },
    { event_id: "identify-1", tkid: "tkid_smoke_001" },
    { event_id: "other-page", tkid: "tkid_other" },
  ];
  const result = applyBrowserTkidIdentityToBatch(rows, new Map([
    ["page-1", null],
    ["identify-1", "person-1"],
    ["other-page", null],
  ]));

  assert.equal(result.linked, 1);
  assert.equal(result.person_id_by_event_id.get("page-1"), "person-1");
  assert.equal(result.person_id_by_event_id.get("identify-1"), "person-1");
  assert.equal(result.person_id_by_event_id.get("other-page"), null);
});

test("browser identify with identity.email populates person and journey linkage for prior tkid page view", async () => {
  const page = await normalizeBrowserEventForRawStorage({
    workspace_id: "default",
    event_id: "page-before-identify",
    event_type: "page_view",
    event_time: "2026-07-23T05:00:00.000Z",
    tkid: "tkid_browser_identity_001",
    session_id: "session-browser-1",
    page_url: "https://example.com/?utm_source=affiliate",
  }, {
    received_at: "2026-07-23T05:00:01.000Z",
    event_id_fallback: "fallback-page",
    request_context: {},
  });
  const identify = await normalizeBrowserEventForRawStorage({
    workspace_id: "default",
    event_id: "identify-after-page",
    event_type: "identify",
    event_time: "2026-07-23T05:05:00.000Z",
    tkid: "tkid_browser_identity_001",
    session_id: "session-browser-1",
    identity: {
      email: "buyer@example.com",
      first_name: "Buyer",
      last_name: "Example",
    },
  }, {
    received_at: "2026-07-23T05:05:01.000Z",
    event_id_fallback: "fallback-identify",
    request_context: {},
  });
  const purchase = await normalizeBrowserEventForRawStorage({
    workspace_id: "default",
    event_id: "purchase-after-identify",
    event_type: "purchase",
    event_time: "2026-07-23T05:10:00.000Z",
    tkid: "tkid_browser_identity_001",
    session_id: "session-browser-1",
    amount: "49.95",
    currency: "usd",
    transaction_id: "smoke-tx-1",
  }, {
    received_at: "2026-07-23T05:10:01.000Z",
    event_id_fallback: "fallback-purchase",
    request_context: {},
  });

  assert.equal(page.ok, true);
  assert.equal(identify.ok, true);
  assert.equal(purchase.ok, true);
  if (!page.ok || !identify.ok || !purchase.ok) throw new Error("browser fixture failed validation");
  assert.deepEqual(browserIdentityIdentifiers(identify.value.raw_payload).map((identifier) => identifier.identifier_type), ["email"]);
  assert.deepEqual(browserEventPersonAttributes(identify.value.raw_payload), {
    display_name: null,
    first_name: "Buyer",
    last_name: "Example",
  });

  const personId = "person-browser-1";
  const applied = applyBrowserTkidIdentityToBatch([
    { event_id: page.value.event_id, tkid: page.value.tkid },
    { event_id: identify.value.event_id, tkid: identify.value.tkid },
    { event_id: purchase.value.event_id, tkid: purchase.value.tkid },
  ], new Map([
    [page.value.event_id, null],
    [identify.value.event_id, personId],
    [purchase.value.event_id, null],
  ]));

  const pageInput = buildBrowserJourneyEventInput(page.value, { person_id: applied.person_id_by_event_id.get(page.value.event_id) });
  const identifyInput = buildBrowserJourneyEventInput(identify.value, { person_id: applied.person_id_by_event_id.get(identify.value.event_id) });
  const purchaseInput = buildBrowserJourneyEventInput(purchase.value, { person_id: applied.person_id_by_event_id.get(purchase.value.event_id) });
  if (!pageInput || !identifyInput || !purchaseInput) throw new Error("browser journey input was not created");
  assert.equal(pageInput?.person_id, personId);
  assert.equal(identifyInput?.person_id, personId);
  assert.equal(identifyInput?.event_type, "identify");
  assert.equal(purchaseInput?.person_id, personId);
  assert.equal(purchaseInput?.event_type, "purchase");
  assert.equal(purchaseInput?.amount, "49.95");
  assert.equal(purchaseInput?.currency, "usd");
  assert.equal(purchaseInput?.transaction_id, "smoke-tx-1");
  assert.equal(purchaseInput?.metadata?.browser_purchase_smoke_event, true);

  const repo = new BrowserJourneyMemoryRepository();
  repo.addPerson("default", personId);
  repo.events.push(
    { id: "journey-event-page", journey_id: null, created_at: "2026-07-23T05:00:02.000Z", updated_at: "2026-07-23T05:00:02.000Z", ...pageInput } as JourneyEventWithJourney,
    { id: "journey-event-identify", journey_id: null, created_at: "2026-07-23T05:05:02.000Z", updated_at: "2026-07-23T05:05:02.000Z", ...identifyInput } as JourneyEventWithJourney,
    { id: "journey-event-purchase", journey_id: null, created_at: "2026-07-23T05:10:02.000Z", updated_at: "2026-07-23T05:10:02.000Z", ...purchaseInput } as JourneyEventWithJourney,
  );

  const assignment = await assignJourneyEvents(repo, repo.events);
  assert.equal(assignment.ok, true);
  assert.equal(assignment.journeys_created, 1);
  assert.equal(assignment.events_linked, 3);
  assert.equal(repo.events[0].journey_id, repo.events[1].journey_id);
  assert.equal(repo.events[1].journey_id, repo.events[2].journey_id);
  assert.ok(repo.events[0].journey_id);
  assert.equal(repo.journeys[0].purchase_count, 1);
  assert.equal(String(repo.journeys[0].total_revenue), "49.95");

  const rawRows = [page.value, identify.value, purchase.value].map((raw) => ({
    ...raw,
    person_id: applied.person_id_by_event_id.get(raw.event_id) || null,
    journey_id: repo.events.find((event) => event.source_record_id === raw.event_id)?.journey_id || null,
  }));
  assert.equal(rawRows[0].person_id, personId);
  assert.equal(rawRows[0].journey_id, repo.events[0].journey_id);
  assert.equal(rawRows[1].person_id, personId);
  assert.equal(rawRows[1].journey_id, repo.events[1].journey_id);
  assert.equal(rawRows[2].person_id, personId);
  assert.equal(rawRows[2].journey_id, repo.events[2].journey_id);
});

test("later browser purchase can join an existing tkid journey after identify resolved the person", async () => {
  const personId = "person-browser-purchase-1";
  const page = await normalizeBrowserEventForRawStorage({
    workspace_id: "default",
    event_id: "payout-pageview-003",
    event_type: "page_view",
    event_time: "2026-07-23T05:00:00.000Z",
    tkid: "tkid_payout_smoke_003",
    session_id: "session-payout-003",
    page_url: "https://example.com/?affiliate_id=affiliate-smoke-001",
    affiliate_id: "affiliate-smoke-001",
  }, {
    received_at: "2026-07-23T05:00:01.000Z",
    event_id_fallback: "fallback-page",
    request_context: {},
  });
  const identify = await normalizeBrowserEventForRawStorage({
    workspace_id: "default",
    event_id: "payout-identify-003",
    event_type: "identify",
    event_time: "2026-07-23T05:05:00.000Z",
    tkid: "tkid_payout_smoke_003",
    session_id: "session-payout-003",
    identity: { email: "buyer@example.com" },
  }, {
    received_at: "2026-07-23T05:05:01.000Z",
    event_id_fallback: "fallback-identify",
    request_context: {},
  });
  const purchase = await normalizeBrowserEventForRawStorage({
    workspace_id: "default",
    event_id: "payout-purchase-003",
    event_type: "purchase",
    event_time: "2026-07-23T05:10:00.000Z",
    tkid: "tkid_payout_smoke_003",
    session_id: "session-payout-003",
    amount: "99.00",
    currency: "USD",
    transaction_id: "payout-smoke-tx-003",
  }, {
    received_at: "2026-07-23T05:10:01.000Z",
    event_id_fallback: "fallback-purchase",
    request_context: {},
  });

  assert.equal(page.ok, true);
  assert.equal(identify.ok, true);
  assert.equal(purchase.ok, true);
  if (!page.ok || !identify.ok || !purchase.ok) throw new Error("browser fixture failed validation");
  assert.equal(browserIdentityIdentifiers(purchase.value.raw_payload).length, 0);

  const repo = new BrowserJourneyMemoryRepository();
  repo.addPerson("default", personId);
  const pageInput = buildBrowserJourneyEventInput(page.value, { person_id: personId });
  const identifyInput = buildBrowserJourneyEventInput(identify.value, { person_id: personId });
  if (!pageInput || !identifyInput) throw new Error("browser journey input was not created");
  repo.events.push(
    { id: "journey-event-payout-page", journey_id: null, created_at: "2026-07-23T05:00:02.000Z", updated_at: "2026-07-23T05:00:02.000Z", ...pageInput } as JourneyEventWithJourney,
    { id: "journey-event-payout-identify", journey_id: null, created_at: "2026-07-23T05:05:02.000Z", updated_at: "2026-07-23T05:05:02.000Z", ...identifyInput } as JourneyEventWithJourney,
  );
  const initialAssignment = await assignJourneyEvents(repo, repo.events);
  assert.equal(initialAssignment.ok, true);
  assert.equal(initialAssignment.events_linked, 2);
  const existingJourneyId = repo.events[0].journey_id;
  assert.ok(existingJourneyId);
  assert.equal(repo.events[1].journey_id, existingJourneyId);

  const purchaseInput = buildBrowserJourneyEventInput(purchase.value, { person_id: personId });
  if (!purchaseInput) throw new Error("browser purchase journey input was not created");
  repo.events.push({ id: "journey-event-payout-purchase", journey_id: null, created_at: "2026-07-23T05:10:02.000Z", updated_at: "2026-07-23T05:10:02.000Z", ...purchaseInput } as JourneyEventWithJourney);
  const purchaseAssignment = await assignJourneyEvents(repo, [repo.events[2]]);

  assert.equal(purchaseAssignment.ok, true);
  assert.equal(purchaseAssignment.events_linked, 1);
  assert.equal(repo.events[2].person_id, personId);
  assert.equal(repo.events[2].journey_id, existingJourneyId);
  assert.equal(repo.journeys[0].purchase_count, 1);
  assert.equal(String(repo.journeys[0].total_revenue), "99");
});

test("raw click becomes a journey event input with safe metadata", () => {
  const input = buildBrowserJourneyEventInput({
    event_id: "evt-1",
    workspace_id: "default",
    received_at: "2026-07-22T10:00:01.000Z",
    event_time: "2026-07-22T10:00:00.000Z",
    event_type: "outbound_click",
    normalized_event_type: "click",
    tkid: "tkid_1",
    session_id: "session_1",
    source: "browser_sdk",
    schema_version: 1,
    raw_payload: {
      page_url: "https://example.com/path?email=secret@example.com&utm_source=partner",
      utm_medium: "affiliate",
      affiliate_id: "aff-1",
      sub10: "ten",
    },
    request_context: { origin: "https://example.com" },
    normalization_status: "pending",
  });

  assert.equal(input?.event_type, "click");
  assert.equal(input?.source_platform, "browser");
  assert.equal(input?.source_connector, BROWSER_EVENTS_CONNECTOR_ID);
  assert.equal(input?.affiliate_id, "aff-1");
  assert.equal(input?.medium, "affiliate");
  assert.equal(input?.metadata?.page_url, "https://example.com/path");
  assert.equal(input?.metadata?.sub10, "ten");
  assert.equal(input?.metadata?.attribution_eligible, true);
});

test("identify events expose identity identifiers but page views do not require them", () => {
  assert.equal(browserIdentityIdentifiers({}).length, 0);
  const identifiers = browserIdentityIdentifiers({ email: "A@Example.com", phone: "555-111-2222", country: "US" });
  assert.deepEqual(identifiers.map((item) => item.identifier_type), ["email", "phone"]);
  const nested = browserIdentityIdentifiers({ identity: { email: "Nested@Example.com" } });
  assert.deepEqual(nested.map((item) => item.identifier_type), ["email"]);
});

test("browser external_customer_id is explicit bounded and additive", () => {
  const identifiers = browserIdentityIdentifiers({
    external_customer_id: "  validation-customer-1  ",
    email: "A@Example.com",
  });
  assert.deepEqual(identifiers.map((item) => item.identifier_type), ["email", "external_customer_id"]);
  assert.equal(identifiers[1].value, "validation-customer-1");
  assert.equal(identifiers[1].confidence, 0.99);

  assert.equal(browserIdentityIdentifiers({ external_customer_id: "   " }).length, 0);
  assert.equal(browserIdentityIdentifiers({ external_customer_id: "null" }).length, 0);
  assert.equal(browserIdentityIdentifiers({ external_customer_id: "0" }).length, 0);
  assert.equal(browserIdentityIdentifiers({ external_customer_id: "x".repeat(BROWSER_EXTERNAL_CUSTOMER_ID_MAX_LENGTH) })[0].value, "x".repeat(BROWSER_EXTERNAL_CUSTOMER_ID_MAX_LENGTH));
  assert.equal(browserIdentityIdentifiers({ external_customer_id: "x".repeat(BROWSER_EXTERNAL_CUSTOMER_ID_MAX_LENGTH + 1) }).length, 0);
  assert.equal(browserIdentityIdentifiers({ external_customer_id: { arbitrary: "object" } }).length, 0);
  assert.equal(browserIdentityIdentifiers({ customer_id: "customer-1", user_id: "user-1", external_user_id: "external-1" }).length, 0);
  assert.equal(browserIdentityIdentifiers({ identity: { external_customer_id: "nested-customer-1" } })[0].value, "nested-customer-1");
});

test("external customer identify resolves a normal journey while unrelated TKIDs stay anonymous", async () => {
  const page = await normalizeBrowserEventForRawStorage({
    workspace_id: "default",
    event_id: "external-page-before-identify",
    event_type: "page_view",
    event_time: "2026-09-08T00:00:00.000Z",
    tkid: "tkid_external_identity_001",
    session_id: "shared-session-metadata",
    page_url: "https://example.com/?_ef_transaction_id=EF_EXTERNAL_1",
  }, { received_at: "2026-09-08T00:00:01.000Z", event_id_fallback: "fallback-page", request_context: {} });
  const identify = await normalizeBrowserEventForRawStorage({
    workspace_id: "default",
    event_id: "external-identify-after-page",
    event_type: "identify",
    event_time: "2026-09-08T00:05:00.000Z",
    tkid: "tkid_external_identity_001",
    session_id: "shared-session-metadata",
    external_customer_id: "tracekit_validation_001",
  }, { received_at: "2026-09-08T00:05:01.000Z", event_id_fallback: "fallback-identify", request_context: {} });
  const unrelated = await normalizeBrowserEventForRawStorage({
    workspace_id: "default",
    event_id: "external-unrelated-page",
    event_type: "page_view",
    event_time: "2026-09-08T00:06:00.000Z",
    tkid: "tkid_external_identity_other",
    session_id: "shared-session-metadata",
  }, { received_at: "2026-09-08T00:06:01.000Z", event_id_fallback: "fallback-other", request_context: {} });
  assert.equal(page.ok && identify.ok && unrelated.ok, true);
  if (!page.ok || !identify.ok || !unrelated.ok) throw new Error("browser fixture failed validation");

  assert.equal(browserIdentityIdentifiers(page.value.raw_payload).length, 0);
  const personId = "person-external-1";
  assert.deepEqual(browserIdentityIdentifiers(identify.value.raw_payload).map((item) => item.identifier_type), ["external_customer_id"]);

  const applied = applyBrowserTkidIdentityToBatch([
    { event_id: page.value.event_id, tkid: page.value.tkid },
    { event_id: identify.value.event_id, tkid: identify.value.tkid },
    { event_id: unrelated.value.event_id, tkid: unrelated.value.tkid },
  ], new Map([
    [page.value.event_id, null],
    [identify.value.event_id, personId],
    [unrelated.value.event_id, null],
  ]));
  assert.equal(applied.person_id_by_event_id.get(page.value.event_id), personId);
  assert.equal(applied.person_id_by_event_id.get(unrelated.value.event_id), null);

  const repo = new BrowserJourneyMemoryRepository();
  repo.addPerson("default", personId);
  for (const raw of [page.value, identify.value]) {
    const input = buildBrowserJourneyEventInput(raw, { person_id: applied.person_id_by_event_id.get(raw.event_id) });
    if (!input) throw new Error("browser journey input was not created");
    repo.events.push({ id: `journey-${raw.event_id}`, journey_id: null, created_at: raw.received_at, updated_at: raw.received_at, ...input } as JourneyEventWithJourney);
  }
  const assignment = await assignJourneyEvents(repo, repo.events);
  assert.equal(assignment.ok, true);
  assert.equal(assignment.events_linked, 2);
  assert.ok(repo.events[0].journey_id);
  assert.equal(repo.events[1].journey_id, repo.events[0].journey_id);
  assert.equal(repo.events[0].metadata?.attribution_evidence_v1.identifiers[0].value, "EF_EXTERNAL_1");
});

test("payload hashes are stable for exact replay detection", async () => {
  const left = await browserPayloadHash({ b: 2, a: { c: 3 } });
  const right = await browserPayloadHash({ a: { c: 3 }, b: 2 });
  const other = await browserPayloadHash({ a: { c: 4 }, b: 2 });
  assert.equal(left, right);
  assert.notEqual(left, other);
});

test("write key hash is workspace-scoped", async () => {
  const defaultHash = await browserWriteKeyHash("default", "tk_pub_secret");
  const otherHash = await browserWriteKeyHash("other", "tk_pub_secret");
  assert.notEqual(defaultHash, otherHash);
  assert.match(defaultHash, /^[0-9a-f]{64}$/);
});

test("CORS allow and deny behavior is deterministic", () => {
  assert.equal(browserOriginAllowed("https://shop.example.com", ["https://shop.example.com"]), true);
  assert.equal(browserOriginAllowed("https://shop.example.com", ["*.example.com"]), true);
  assert.equal(browserOriginAllowed("https://evil.example.net", ["https://shop.example.com"]), false);
  assert.equal(browserOriginAllowed("", ["https://shop.example.com"]), true);
  assert.equal(browserCorsHeaders("https://shop.example.com", true)["access-control-allow-origin"], "https://shop.example.com");
  assert.equal(browserCorsHeaders("https://shop.example.com", false)["access-control-allow-origin"], "null");
});

test("browser event cursors round trip", () => {
  const cursor = { received_at: "2026-07-22T10:00:00.000Z", event_id: "evt-1" };
  assert.deepEqual(parseBrowserEventCursor(serializeBrowserEventCursor(cursor)), cursor);
});

test("setup snippet uses caller endpoint and never hard-codes production host in logic", () => {
  const snippet = browserSetupSnippet({ workspace_id: "default", endpoint: "https://api.example.com" });
  assert.match(snippet, /TraceKit\.init/);
  assert.match(snippet, /https:\/\/api\.example\.com/);
  assert.match(snippet, /tk_pub_\.\.\./);
  assert.doesNotMatch(snippet, /tk_live_/);
});

test("browser HTTP route matcher registers ingestion setup and configuration routes", () => {
  for (const route of [BROWSER_EVENT_INGESTION_PATH, "/browser/events", "/v1/events/browser", BROWSER_EVENT_LEGACY_INGESTION_PATH]) {
    const getRequest = new Request(`https://tracekit.test${route}`, { method: "GET" });
    const getMatch = matchBrowserEventRoute(getRequest.method, new URL(getRequest.url).pathname);
    assert.equal(getMatch?.kind, "method_not_allowed", route);
    assert.equal(getMatch?.path, route, route);
    assert.deepEqual(getMatch?.allowed_methods, ["POST"], route);

    const postRequest = new Request(`https://tracekit.test${route}`, { method: "POST" });
    const postMatch = matchBrowserEventRoute(postRequest.method, new URL(postRequest.url).pathname);
    assert.equal(postMatch?.kind, "ingest", route);
    assert.equal(postMatch?.path, route, route);
  }

  for (const route of [BROWSER_EVENT_SETUP_PATH, BROWSER_EVENT_CONFIG_PATH, BROWSER_EVENT_LEGACY_SETUP_PATH]) {
    const getRequest = new Request(`https://tracekit.test${route}`, { method: "GET" });
    const getMatch = matchBrowserEventRoute(getRequest.method, new URL(getRequest.url).pathname);
    assert.equal(getMatch?.kind, "setup", route);
    assert.equal(getMatch?.path, route, route);

    const postRequest = new Request(`https://tracekit.test${route}`, { method: "POST" });
    const postMatch = matchBrowserEventRoute(postRequest.method, new URL(postRequest.url).pathname);
    assert.equal(postMatch?.kind, "setup", route);
    assert.equal(postMatch?.path, route, route);

    const putRequest = new Request(`https://tracekit.test${route}`, { method: "PUT" });
    const putMatch = matchBrowserEventRoute(putRequest.method, new URL(putRequest.url).pathname);
    assert.equal(putMatch?.kind, "method_not_allowed", route);
    assert.deepEqual(putMatch?.allowed_methods, ["GET", "POST"], route);
  }

  assert.equal(matchBrowserEventRoute("POST", `${BROWSER_EVENT_INGESTION_PATH}/`)?.kind, "ingest");
  assert.equal(matchBrowserEventRoute("GET", `${BROWSER_EVENT_SETUP_PATH}/`)?.kind, "setup");
  assert.equal(matchBrowserEventRoute("POST", "/v1/not-browser"), null);
});

test("Worker router dispatch uses browser route matcher before generic not_found", () => {
  const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  assert.match(source, /const browserRoute = matchBrowserEventRoute\(req\.method, path\)/);
  assert.match(source, /browserRoute\?\.kind === "ingest"/);
  assert.match(source, /browserRoute\?\.kind === "setup"/);
  assert.match(source, /browserRoute\?\.kind === "method_not_allowed"/);
});

test("migration upgrades legacy events_raw additively before indexing canonical fields", () => {
  const migration = readFileSync(new URL("../../supabase/migrations/020_browser_touchpoint_ingestion_v1.sql", import.meta.url), "utf8");
  assert.match(migration, /Production already has public\.events_raw/);
  assert.match(migration, /create table if not exists public\.events_raw\s*\(\s*id uuid primary key/s);
  assert.match(migration, /alter table public\.events_raw add column if not exists workspace_id text/s);
  assert.match(migration, /alter table public\.events_raw add column if not exists event_id text/s);
  assert.match(migration, /alter table public\.events_raw add column if not exists normalization_job_id uuid/s);
  assert.match(migration, /workspace_id = coalesce\(nullif\(btrim\(site_key::text\), ''\), 'default'\)/);
  assert.match(migration, /event_id = 'legacy_' \|\| id::text/);
  assert.match(migration, /received_at = created_at/);
  assert.match(migration, /event_time = ts::timestamptz/);
  assert.match(migration, /event_type = 'custom'/);
  assert.match(migration, /raw_payload = coalesce\(to_jsonb\(payload\), '\{\}'::jsonb\)/);
  assert.match(migration, /source = 'legacy_browser_event'/);
  assert.match(migration, /alter column event_id set not null/);
  assert.match(migration, /create unique index if not exists events_raw_workspace_event_uidx\s+on public\.events_raw \(workspace_id, event_id\)/s);
  assert.match(migration, /on public\.journey_events \(workspace_id, \(\(metadata->>'tkid'\)\), event_time, id\)/);
  assert.doesNotMatch(migration.toLowerCase(), /drop table|truncate table|rename to/);
});

test("migration 021 creates canonical browser_events_raw without altering legacy events_raw", () => {
  const migration = readFileSync(new URL("../../supabase/migrations/021_browser_events_raw.sql", import.meta.url), "utf8");
  assert.match(migration, /create table if not exists public\.browser_events_raw/);
  assert.match(migration, /session_id text/);
  assert.match(migration, /create unique index if not exists browser_events_raw_workspace_event_uidx\s+on public\.browser_events_raw \(workspace_id, event_id\)/s);
  assert.match(migration, /browser_events_raw_normalization_scan_idx/);
  assert.match(migration, /browser_events_raw_workspace_tkid_event_time_idx/);
  assert.match(migration, /browser_events_raw_workspace_session_event_time_idx/);
  assert.match(migration, /browser_events_raw_normalized_journey_event_idx/);
  assert.match(migration, /copy_legacy_events_raw_to_browser_events_raw/);
  assert.match(migration, /on conflict \(workspace_id, event_id\) do nothing/);
  assert.doesNotMatch(migration.toLowerCase(), /drop table public\.events_raw|truncate table public\.events_raw|alter table public\.events_raw|rename to/);
});

test("migration 023 allows browser purchase smoke events without ledger schema changes", () => {
  const migration = readFileSync(new URL("../../supabase/migrations/023_browser_purchase_smoke_event.sql", import.meta.url), "utf8");
  assert.match(migration, /browser_events_raw_browser_event_type_check/);
  assert.match(migration, /'purchase'/);
  assert.match(migration, /events_raw_browser_event_type_check/);
  assert.doesNotMatch(migration.toLowerCase(), /create table public\.platform_orders|create table public\.conversions|drop table|truncate table/);
});

test("browser SDK exposes required API and avoids blanket click capture", () => {
  const source = readFileSync(new URL("../public/tracekit.js", import.meta.url), "utf8");
  assert.match(source, /init: init/);
  assert.match(source, /track: track/);
  assert.match(source, /identify: identify/);
  assert.match(source, /getTkid: getTkid/);
  assert.match(source, /DEFAULT_SESSION_TIMEOUT_MS = 30 \* 60 \* 1000/);
  assert.match(source, /storageGet\(TKID_KEY\)/);
  assert.match(source, /storageSet\(TKID_KEY, existing\)/);
  assert.match(source, /document\.cookie =/);
  assert.match(source, /FIRST_TOUCH_KEY/);
  assert.match(source, /current_touch: paramsFromLocation\(\)/);
  for (const parameter of ["gbraid", "wbraid", "aff_click_id", "aff_sub5", "s1", "s5"]) assert.ok(source.includes(`"${parameter}"`), parameter);
  assert.match(source, /history\.pushState/);
  assert.match(source, /data-tracekit-track/);
  assert.doesNotMatch(source, /document\.addEventListener\("click", function \(_event\)/);
});

test("Connector Runtime dispatch includes browser normalization task", () => {
  const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  assert.equal(BROWSER_EVENT_DEFAULT_BATCH_SIZE, 3);
  assert.match(source, /BROWSER_EVENT_NORMALIZE_RUNTIME_MAX_BATCH_SIZE = BROWSER_EVENT_DEFAULT_BATCH_SIZE/);
  assert.match(source, /function browserEventNormalizeBatchSize/);
  assert.match(source, new RegExp(`task\\.task_type === ${BROWSER_EVENT_NORMALIZE_TASK_TYPE === "browser_event_normalize_batch" ? "BROWSER_EVENT_NORMALIZE_TASK_TYPE" : "never"}`));
  assert.match(source, /executeBrowserEventNormalizeRuntimeTask/);
  assert.match(source, /browserEventNormalizeTaskPlanForProgress/);
  assert.match(source, /BROWSER_EVENTS_JOB_TYPE/);
  assert.match(source, /BROWSER_EVENTS_RAW_TABLE/);
  assert.match(source, /eventType !== "identify" && eventType !== "lead" && eventType !== "purchase"/);
  assert.match(source, /findLinkedBrowserIdentityForPurchase/);
  assert.match(source, /\.eq\("metadata->>tkid", value\)/);
  assert.match(source, /\.eq\("session_id", value\)/);
  assert.match(source, /applyBrowserTkidIdentityToBatch\(batchRows\.filter/);
  assert.match(source, /linkCurrentAnonymousBrowserJourneyEventsByPerson/);
  assert.match(source, /linkPriorAnonymousBrowserJourneyEventsByTkid/);
  assert.match(source, /\.eq\("metadata->>tkid", tkid\)/);
  assert.match(source, /updateBrowserRawEventsForRetroIdentity/);
  assert.match(source, /current_identity_linked_events/);
  assert.match(source, /retro_linked_events/);
  assert.match(source, /isBrowserEventNormalizeRuntimeTask/);
  assert.match(source, /BROWSER_EVENT_NORMALIZE_TASK_RECHECK_DELAY_SECONDS/);
  assert.match(source, /browser_event_normalize_task_already_running/);
  assert.match(source, /preserveBrowserRunningLease/);
  assert.match(source, /lease_preserved: true/);
  assert.match(source, /browser_event_normalize\.selection\.before/);
  assert.match(source, /browser_event_normalize\.selection\.tail_recheck\.before/);
  assert.match(source, /tail_pending/);
  assert.match(source, /browser_event_normalize\.normalization\.after/);
  assert.match(source, /browser_event_normalize\.purchase_domain_events\.before/);
  assert.match(source, /browser_event_normalize\.current_identity_link\.after/);
  assert.match(source, /browser_event_normalize\.journey_assignment\.after/);
  assert.match(source, /browser_event_normalize\.attribution_recalculation\.get_journey\.before/);
  assert.match(source, /browser_event_normalize\.attribution_recalculation\.error/);
  assert.match(source, /browser_event_normalize\.raw_update\.after/);
  assert.match(source, /browser_event_normalize\.commit\.after/);
  assert.match(source, /browser_event_normalize\.failure/);
  assert.match(source, /browser_event_normalize\.lock_release\.completed/);
  assert.doesNotMatch(source, /\.from\("events_raw"\)/);
});
