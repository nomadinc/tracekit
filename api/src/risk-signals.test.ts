import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateJourneyAttribution } from "./attribution.ts";
import { evaluateJourneyRiskSignals, RISK_SIGNALS_RULESET_VERSION } from "./risk-signals.ts";

const truncation = { truncated: false, events: false, identifiers: false, distinct_values: false, referrer_origins: false, flags: false };
const identifier = (overrides: Record<string, unknown> = {}) => ({
  raw_param: "_ef_transaction_id", provider: "everflow", category: "affiliate_network", identifier_type: "transaction_id",
  first_seen_at: "2026-01-01T00:00:00.000Z", last_seen_at: "2026-01-02T00:00:00.000Z",
  first_value: "not-digested", latest_value: "not-digested", distinct_value_count: 1, value_changed: false,
  first_source_location: "page_url", latest_source_location: "page_url", event_count: 2, ...overrides,
});
const evidence = (identifiers: any[] = [], overrides: Record<string, unknown> = {}) => ({
  schema_version: 1, providers: [], identifiers, referrers: {}, flags: [], identifier_count: identifiers.length,
  evidence_event_count: 2, truncation: { ...truncation }, ...overrides,
});
const evaluate = (value: unknown, evaluated_at = "2026-02-01T00:00:00.000Z") => evaluateJourneyRiskSignals({ workspace_id: "default", journey_id: "journey-1", attribution_evidence_v1: value, evaluated_at });

test("stable and repeated identifier observations produce no signal", async () => {
  assert.deepEqual((await evaluate(evidence([identifier()]))).signals, []);
});

test("known Everflow transaction change spanning two events is medium", async () => {
  const result = await evaluate(evidence([identifier({ value_changed: true, distinct_value_count: 2 })]));
  assert.equal(result.signals[0].signal_code, "journey_identifier_value_changed");
  assert.equal(result.signals[0].severity, "medium");
  assert.equal(result.signals[0].confidence, "deterministic");
  assert.equal(Object.hasOwn(result.signals[0].facts, "first_value"), false);
});

test("known Google click change spanning two events is medium", async () => {
  const result = await evaluate(evidence([identifier({ raw_param: "gclid", provider: "google", category: "paid_media", identifier_type: "click_id", value_changed: true, distinct_value_count: 2 })]));
  assert.equal(result.signals[0].severity, "medium");
});

test("unknown tracker change is low", async () => {
  const result = await evaluate(evidence([identifier({ raw_param: "click_id", provider: "unknown", category: "tracker", identifier_type: "click_id", value_changed: true, distinct_value_count: 2 })]));
  assert.equal(result.signals[0].severity, "low");
});

test("different transaction alias groups do not manufacture a change", async () => {
  const result = await evaluate(evidence([identifier({ first_value: "A", latest_value: "A" }), identifier({ raw_param: "transaction_id", provider: "unknown", category: "tracker", first_value: "B", latest_value: "B" })]));
  assert.deepEqual(result.signals, []);
});

test("value_changed without two retained distinct values is insufficient", async () => {
  assert.deepEqual((await evaluate(evidence([identifier({ value_changed: true, distinct_value_count: 1 })]))).signals, []);
});

test("multiple changed groups produce deterministic separate signals", async () => {
  const ids = [identifier({ raw_param: "gclid", provider: "google", category: "paid_media", identifier_type: "click_id", value_changed: true, distinct_value_count: 2 }), identifier({ value_changed: true, distinct_value_count: 2 })];
  const result = await evaluate(evidence(ids));
  assert.equal(result.signals.length, 2);
  assert.deepEqual(result.signals.map((signal) => signal.facts.raw_param), ["_ef_transaction_id", "gclid"]);
  assert.notEqual(result.signals[0].id, result.signals[1].id);
});

test("Everflow plus TUNE emits one informational multi-network signal", async () => {
  const result = await evaluate(evidence([identifier(), identifier({ raw_param: "aff_click_id", provider: "tune", identifier_type: "click_id" })]));
  const signal = result.signals.find((item) => item.signal_code === "multiple_affiliate_networks_observed")!;
  assert.equal(signal.severity, "informational");
  assert.deepEqual(signal.facts.providers, ["everflow", "tune"]);
});

test("two Everflow params count as one network", async () => {
  assert.deepEqual((await evaluate(evidence([identifier(), identifier({ raw_param: "ef_transaction_id" })]))).signals, []);
});

test("paid media and unknown affiliate providers do not count as known networks", async () => {
  const ids = [identifier(), identifier({ raw_param: "fbclid", provider: "meta", category: "paid_media", identifier_type: "click_id" }), identifier({ raw_param: "affiliate_id", provider: "unknown" })];
  assert.deepEqual((await evaluate(evidence(ids))).signals, []);
});

test("three known affiliate networks have one sorted provider signal", async () => {
  const ids = [identifier({ provider: "tune", raw_param: "aff_click_id" }), identifier({ provider: "impact", raw_param: "irclickid" }), identifier()];
  const result = await evaluate(evidence(ids));
  assert.equal(result.signals.length, 1);
  assert.deepEqual(result.signals[0].facts.providers, ["everflow", "impact", "tune"]);
  assert.deepEqual(result.signals[0].evidence_refs.map((ref) => ref.stable_key), [...result.signals[0].evidence_refs.map((ref) => ref.stable_key)].sort());
});

test("rule-relevant truncation is partial while flag/referrer caps are complete", async () => {
  for (const field of ["events", "identifiers", "distinct_values"] as const) {
    const result = await evaluate(evidence([], { truncation: { ...truncation, truncated: true, [field]: true } }));
    assert.equal(result.evaluation_status, "partial");
    assert.equal(result.input.truncated, true);
  }
  for (const field of ["flags", "referrer_origins"] as const) {
    const result = await evaluate(evidence([], { truncation: { ...truncation, truncated: true, [field]: true } }));
    assert.equal(result.evaluation_status, "complete");
    assert.equal(result.input.truncated, true);
  }
});

test("positive retained facts still emit under partial evaluation", async () => {
  const result = await evaluate(evidence([identifier({ value_changed: true, distinct_value_count: 2 })], { truncation: { ...truncation, truncated: true, events: true } }));
  assert.equal(result.evaluation_status, "partial");
  assert.equal(result.signals.length, 1);
});

test("same semantic input is deterministic across time, shuffle, and retry", async () => {
  const ids = [identifier({ provider: "tune", raw_param: "aff_click_id" }), identifier({ value_changed: true, distinct_value_count: 2 })];
  const a = await evaluate(evidence(ids), "2026-02-01T00:00:00Z");
  const b = await evaluate(evidence([...ids].reverse()), "2026-03-01T00:00:00Z");
  assert.equal(a.input.input_digest, b.input.input_digest);
  assert.deepEqual(a.signals, b.signals);
  assert.notEqual(a.evaluated_at, b.evaluated_at);
  assert.equal(a.ruleset_version, RISK_SIGNALS_RULESET_VERSION);
});

test("digest excludes values, evaluated time, unrelated fields, and array order", async () => {
  const a = await evaluate(evidence([identifier({ first_value: "SECRET_A", latest_value: "SECRET_B" })], { unrelated: "A" }));
  const b = await evaluate(evidence([identifier({ first_value: "OTHER_A", latest_value: "OTHER_B" })], { unrelated: "B" }), "2026-04-01T00:00:00Z");
  assert.equal(a.input.input_digest, b.input.input_digest);
});

test("empty, missing, malformed, and unsupported evidence fail safely", async () => {
  assert.equal((await evaluate(evidence())).evaluation_status, "complete");
  assert.deepEqual((await evaluate(null)).signals, []);
  assert.deepEqual((await evaluate({ schema_version: 1, identifiers: ["bad"] })).signals, []);
  const unsupported = await evaluate({ schema_version: 2, identifiers: [identifier({ value_changed: true, distinct_value_count: 2 })] });
  assert.equal(unsupported.evaluation_status, "not_evaluable");
  assert.deepEqual(unsupported.signals, []);
});

test("risk evaluation leaves attribution inputs and outputs byte-for-byte unchanged", async () => {
  const journey: any = { id: "journey-1", workspace_id: "default", person_id: "person-1", started_at: "2026-01-01T00:00:00Z", ended_at: "2026-01-02T00:00:00Z", status: "completed", entry_event_id: "touch-1", conversion_event_id: "purchase-1", conversion_count: 1, purchase_count: 1, total_revenue: "99", event_count: 2, is_active: false, boundary_version: "v1", boundary_timeout_seconds: 100, attribution_window_config: {}, metadata: {} };
  const events: any[] = [
    { id: "touch-1", workspace_id: "default", person_id: "person-1", journey_id: "journey-1", event_type: "click", event_time: "2026-01-01T00:00:00Z", source_platform: "browser", source_connector: "browser", source_record_id: "touch-1", affiliate_id: "aff-1", source: "partner", medium: "affiliate", metadata: {} },
    { id: "purchase-1", workspace_id: "default", person_id: "person-1", journey_id: "journey-1", event_type: "purchase", event_time: "2026-01-02T00:00:00Z", source_platform: "browser", source_connector: "browser", source_record_id: "purchase-1", amount: "99", currency: "USD", metadata: {} },
  ];
  const inputBefore = JSON.stringify({ journey, events });
  const before = calculateJourneyAttribution(journey, events, ["first_touch", "last_touch"], { calculated_at: "2026-02-01T00:00:00Z" });
  await evaluate(evidence([identifier({ value_changed: true, distinct_value_count: 2 })]));
  const after = calculateJourneyAttribution(journey, events, ["first_touch", "last_touch"], { calculated_at: "2026-02-01T00:00:00Z" });
  assert.equal(JSON.stringify({ journey, events }), inputBefore);
  assert.deepEqual(after, before);
  assert.doesNotMatch(readFileSync(new URL("./attribution.ts", import.meta.url), "utf8"), /risk-signals/);
});

test("detail-only wiring reuses one evaluator and adds no persistence", () => {
  const journeys = readFileSync(new URL("./journeys.ts", import.meta.url), "utf8");
  const customer = readFileSync(new URL("./customer-explorer.ts", import.meta.url), "utf8");
  const evaluator = readFileSync(new URL("./risk-signals.ts", import.meta.url), "utf8");
  assert.match(journeys, /risk_signals_v1: riskSignals/);
  assert.match(customer, /risk_signals_v1: riskSignals/);
  assert.doesNotMatch(journeys.slice(journeys.indexOf("export async function getPersonJourneys"), journeys.indexOf("export async function getJourneyDetail")), /risk_signals_v1/);
  assert.doesNotMatch(customer.slice(customer.indexOf("export async function getCustomerDetail"), customer.indexOf("async function loadJourneyEvents")), /risk_signals_v1/);
  assert.doesNotMatch(evaluator, /\.from\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
});
