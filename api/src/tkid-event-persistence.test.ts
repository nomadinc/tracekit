import assert from "node:assert/strict";
import test from "node:test";
import { buildTkidEventRow, buildTkidEvidenceRow, safeTkidPersistenceFailureEvidence, TkidEventPersistenceError } from "./tkid-event-persistence.ts";
import { normalizeEvent } from "./tkid.ts";

const ids = {
  event: "11111111-1111-4111-8111-111111111111",
  journey: "22222222-2222-4222-8222-222222222222",
  session: "33333333-3333-4333-8333-333333333333",
};

test("event persistence mapping enumerates schema columns and excludes normalized-only fields", async () => {
  const event = await normalizeEvent({
    event_id: ids.event,
    event_name: "journey_started",
    schema_version: 1,
    occurred_at: "2026-09-27T03:03:49.543Z",
    journey_id: ids.journey,
    browser_session_id: ids.session,
    privacy_mode: "essential",
  }, "2026-09-27T03:03:50.113Z");
  const row = buildTkidEventRow({ organizationId: "org", sourceId: "source", originId: "origin", observedOrigin: "https://shop.example", evidenceId: "evidence", event });
  assert.equal(row.id, ids.event);
  assert.equal("event_id" in row, false);
  assert.equal("evidence_hash" in row, false);
  assert.deepEqual(Object.keys(row).sort(), [
    "action_type", "affirmative_action", "app_version", "billing_cadence", "browser_session_id", "checkout_session_id", "cta_id", "cta_version", "currency", "descriptor_version", "disclosure_version", "displayed_descriptor", "duration_bucket", "error_category", "error_code", "event_name", "evidence_id", "evidence_state", "funnel_step_id", "id", "journey_id", "milestone", "normalizer_version", "observed_origin", "occurred_at", "offer_id", "offer_version_id", "organization_id", "origin_id", "page_id", "price_amount", "privacy_mode", "received_at", "recurring", "schema_version", "source_id", "terms_version", "trial_state",
  ].sort());
});

test("evidence mapping keeps deterministic event identity and bounded safe payload", async () => {
  const event = await normalizeEvent({
    event_id: ids.event,
    event_name: "page_viewed",
    schema_version: 1,
    occurred_at: "2026-09-27T03:03:49.543Z",
    journey_id: ids.journey,
    browser_session_id: ids.session,
    privacy_mode: "essential",
    page_id: "landing-v1",
  }, "2026-09-27T03:03:50.113Z");
  const row = buildTkidEvidenceRow({ organizationId: "org", sourceId: "source", originId: "origin", observedOrigin: "https://shop.example", event, receivedAt: event.received_at });
  assert.equal(row.event_id, ids.event);
  assert.equal(row.evidence_hash, event.evidence_hash);
  assert.equal(row.bounded_payload.journey_id, ids.journey);
  assert.equal(row.bounded_payload.browser_session_id, ids.session);
  assert.equal("evidence_hash" in row.bounded_payload, false);
});

test("operator failure evidence is bounded and excludes database messages", () => {
  const error = new TkidEventPersistenceError("event", "pgrst204", "request-safe-id");
  assert.deepEqual(safeTkidPersistenceFailureEvidence(error), {
    action: "tkid.event_persistence_failed",
    persistence_stage: "event",
    error_code: "pgrst204",
    request_id: "request-safe-id",
  });
  assert.doesNotMatch(JSON.stringify(safeTkidPersistenceFailureEvidence(error)), /payload|credential|connection/i);
});
