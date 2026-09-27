import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { normalizeEvent } from "./tkid.ts";
import { buildTkidEventRow, buildTkidEvidenceRow, persistTkidEvent, TkidEventPersistenceError } from "./tkid-event-persistence.ts";

const url = process.env.TKID_DATABASE_INTEGRATION_URL;
const key = process.env.TKID_DATABASE_INTEGRATION_SERVICE_ROLE_KEY;
const integration = Boolean(url && key);
const run = integration ? test : test.skip;

const fixture = {
  account: randomUUID(),
  organization: randomUUID(),
  source: randomUUID(),
  origin: randomUUID(),
  context: `tkid-event-${randomUUID()}`,
  journey: randomUUID(),
  session: randomUUID(),
  bootstrap: randomUUID(),
  interruptedEvent: randomUUID(),
};
const publicSourceId = `tksrc_eventpersist_${randomUUID().replaceAll("-", "").slice(0, 20)}`;

const source = {
  id: fixture.source,
  account_id: fixture.account,
  organization_id: fixture.organization,
  business_context_id: fixture.context,
};
const origin = { id: fixture.origin };
const now = "2026-09-27T03:03:50.113Z";

async function setup(db: any) {
  for (const [table, row] of [
    ["tracekit_accounts", { id: fixture.account, account_type: "client", name: "TKID event persistence integration" }],
    ["tracekit_organizations", { id: fixture.organization, owning_account_id: fixture.account, name: "TKID event persistence integration" }],
    ["tracekit_business_contexts", { id: source.business_context_id, account_id: fixture.account, organization_id: fixture.organization, name: "TKID event persistence integration" }],
    ["tkid_sources", { ...source, public_source_id: publicSourceId, environment: "production", status: "shadow", allowed_origins: ["https://event-persistence.example"], capture_mode: "essential", abuse_adapter: "supabase_fixed_window_v1", proof_max_journeys: 50, proof_max_events: 1000, proof_starts_at: "2026-09-27T00:00:00Z", proof_ends_at: "2026-09-29T00:00:00Z", ingestion_state: "enabled" }],
    ["tkid_source_origins", { id: fixture.origin, account_id: fixture.account, organization_id: fixture.organization, business_context_id: source.business_context_id, source_id: fixture.source, canonical_origin: "https://event-persistence.example", role: "frontend", lifecycle_status: "active", verification_state: "verified", verified_at: "2026-09-27T00:00:00Z" }],
  ] as const) {
    const { error } = await db.from(table).insert(row);
    assert.equal(error, null, `${table}: ${error?.message}`);
  }
}

const db: any = integration ? createClient(url!, key!, { auth: { persistSession: false } }) : null;
if (integration) test.before(async () => { await setup(db); });

run("real SDK-compatible journey_started follows the Worker claim/persistence pipeline against the actual schema", async () => {
  {
    const bootstrap = await db.rpc("claim_tkid_proof_capacity_v1", { p_organization_id: fixture.organization, p_source_id: fixture.source, p_origin_id: fixture.origin, p_claim_type: "bootstrap", p_journey_id: fixture.journey, p_browser_session_id: fixture.session, p_bootstrap_key: fixture.bootstrap, p_event_id: null, p_now: now });
    assert.equal(bootstrap.error, null);
    const eventId = randomUUID();
    const event = await normalizeEvent({ event_id: eventId, event_name: "journey_started", schema_version: 1, occurred_at: now, journey_id: fixture.journey, browser_session_id: fixture.session, privacy_mode: "essential" }, now);
    const claim = await db.rpc("claim_tkid_proof_capacity_v1", { p_organization_id: fixture.organization, p_source_id: fixture.source, p_origin_id: fixture.origin, p_claim_type: "event", p_journey_id: fixture.journey, p_browser_session_id: null, p_bootstrap_key: null, p_event_id: eventId, p_now: now });
    assert.equal(claim.error, null);
    assert.equal((await persistTkidEvent({ db, source, origin, canonicalOrigin: "https://event-persistence.example", event, receivedAt: now, requestId: "route-pipeline" })).state, "persisted");
    const { data: rows, error } = await db.from("tkid_events").select("id,event_name,evidence_id").eq("id", eventId);
    assert.equal(error, null);
    assert.equal(rows?.length, 1);
    assert.equal(rows?.[0].event_name, "journey_started");
  }
});

run("evidence-only interruption resumes the same event without another reservation", async () => {
  {
    const bootstrap = await db.rpc("claim_tkid_proof_capacity_v1", { p_organization_id: fixture.organization, p_source_id: fixture.source, p_origin_id: fixture.origin, p_claim_type: "bootstrap", p_journey_id: fixture.journey, p_browser_session_id: fixture.session, p_bootstrap_key: fixture.bootstrap, p_event_id: null, p_now: now });
    assert.equal(bootstrap.error, null);
    const raw = { event_id: fixture.interruptedEvent, event_name: "journey_started", schema_version: 1, occurred_at: now, journey_id: fixture.journey, browser_session_id: fixture.session, privacy_mode: "essential" };
    const event = await normalizeEvent(raw, now);
    const firstClaim = await db.rpc("claim_tkid_proof_capacity_v1", { p_organization_id: fixture.organization, p_source_id: fixture.source, p_origin_id: fixture.origin, p_claim_type: "event", p_journey_id: fixture.journey, p_browser_session_id: null, p_bootstrap_key: null, p_event_id: event.event_id, p_now: now });
    assert.equal(firstClaim.error, null);
    await assert.rejects(() => persistTkidEvent({ db, source, origin, canonicalOrigin: "https://event-persistence.example", event, receivedAt: now, requestId: "interrupt", afterEvidencePersisted() { throw new Error("simulated_after_evidence"); } }), /simulated_after_evidence/);
    assert.equal((await db.from("tkid_event_evidence").select("id").eq("event_id", event.event_id)).data?.length, 1);
    assert.equal((await db.from("tkid_events").select("id").eq("id", event.event_id)).data?.length, 0);
    const retryClaim = await db.rpc("claim_tkid_proof_capacity_v1", { p_organization_id: fixture.organization, p_source_id: fixture.source, p_origin_id: fixture.origin, p_claim_type: "event", p_journey_id: fixture.journey, p_browser_session_id: null, p_bootstrap_key: null, p_event_id: event.event_id, p_now: now });
    assert.equal(retryClaim.data?.[0]?.reused, true);
    assert.equal((await db.from("tkid_proof_event_claims").select("id").eq("event_id", event.event_id)).data?.length, 1);
    assert.deepEqual(await persistTkidEvent({ db, source, origin, canonicalOrigin: "https://event-persistence.example", event, receivedAt: now, requestId: "resume" }), { state: "resumed", evidenceId: (await db.from("tkid_event_evidence").select("id").eq("event_id", event.event_id).single()).data?.id });
    assert.equal((await db.from("tkid_events").select("id").eq("id", event.event_id)).data?.length, 1);
    assert.equal((await persistTkidEvent({ db, source, origin, canonicalOrigin: "https://event-persistence.example", event, receivedAt: now, requestId: "duplicate" })).state, "duplicate");
    const conflicting = await normalizeEvent({ ...raw, occurred_at: "2026-09-27T03:03:51.113Z" }, "2026-09-27T03:03:51.113Z");
    await assert.rejects(() => persistTkidEvent({ db, source, origin, canonicalOrigin: "https://event-persistence.example", event: conflicting, receivedAt: conflicting.received_at, requestId: "conflict" }), (error: unknown) => error instanceof TkidEventPersistenceError && error.safeCode === "evidence_conflict");
  }
});

run("Stage-1 event types share the same explicit persistence mapper", async () => {
  {
    await db.rpc("claim_tkid_proof_capacity_v1", { p_organization_id: fixture.organization, p_source_id: fixture.source, p_origin_id: fixture.origin, p_claim_type: "bootstrap", p_journey_id: fixture.journey, p_browser_session_id: fixture.session, p_bootstrap_key: fixture.bootstrap, p_event_id: null, p_now: now });
    const cases = [
      ["journey_started", {}],
      ["page_viewed", { page_id: "landing-v1" }],
      ["funnel_step_viewed", { funnel_step_id: "hero" }],
      ["cta_clicked", { cta_id: "hero-cta", cta_version: "v1", funnel_step_id: "hero", action_type: "navigate" }],
    ] as const;
    const persistedEventIds: string[] = [];
    for (let index = 0; index < cases.length; index++) {
      const eventId = randomUUID();
      persistedEventIds.push(eventId);
      const [eventName, fields] = cases[index];
      const event = await normalizeEvent({ event_id: eventId, event_name: eventName, schema_version: 1, occurred_at: now, journey_id: fixture.journey, browser_session_id: fixture.session, privacy_mode: "essential", ...fields }, now);
      const claim = await db.rpc("claim_tkid_proof_capacity_v1", { p_organization_id: fixture.organization, p_source_id: fixture.source, p_origin_id: fixture.origin, p_claim_type: "event", p_journey_id: fixture.journey, p_browser_session_id: null, p_bootstrap_key: null, p_event_id: eventId, p_now: now });
      assert.equal(claim.error, null);
      assert.equal((await persistTkidEvent({ db, source, origin, canonicalOrigin: "https://event-persistence.example", event, receivedAt: now, requestId: `type-${index}` })).state, "persisted");
    }
    const { data } = await db.from("tkid_events").select("event_name").in("id", persistedEventIds).order("event_name");
    assert.deepEqual(data?.map((row) => row.event_name).sort(), cases.map(([name]) => name).sort());
  }
});

run("an event without its matching evidence fails closed", async () => {
  const orphanEventId = randomUUID();
  const supportEvidenceEventId = randomUUID();
  const orphanEvent = await normalizeEvent({ event_id: orphanEventId, event_name: "journey_started", schema_version: 1, occurred_at: now, journey_id: fixture.journey, browser_session_id: fixture.session, privacy_mode: "essential" }, now);
  const supportEvidenceEvent = await normalizeEvent({ event_id: supportEvidenceEventId, event_name: "journey_started", schema_version: 1, occurred_at: now, journey_id: fixture.journey, browser_session_id: fixture.session, privacy_mode: "essential" }, now);
  const evidenceInsert = await db.from("tkid_event_evidence").insert(buildTkidEvidenceRow({ organizationId: fixture.organization, sourceId: fixture.source, originId: fixture.origin, observedOrigin: "https://event-persistence.example", event: supportEvidenceEvent, receivedAt: now })).select("id").single();
  assert.equal(evidenceInsert.error, null);
  const eventInsert = await db.from("tkid_events").insert(buildTkidEventRow({ organizationId: fixture.organization, sourceId: fixture.source, originId: fixture.origin, observedOrigin: "https://event-persistence.example", evidenceId: evidenceInsert.data.id, event: orphanEvent }));
  assert.equal(eventInsert.error, null);
  await assert.rejects(() => persistTkidEvent({ db, source, origin, canonicalOrigin: "https://event-persistence.example", event: orphanEvent, receivedAt: now, requestId: "event-without-evidence" }), (error: unknown) => error instanceof TkidEventPersistenceError && error.safeCode === "event_without_evidence");
});
