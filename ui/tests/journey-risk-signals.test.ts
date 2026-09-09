import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JourneyRiskSignalsSection } from "../app/(app)/customers/[person_id]/journey-risk-signals.tsx";
import {
  identifierEvidenceDomId,
  identifierEvidenceDomIdFromStableKey,
  identifierEvidenceStableKey,
  type IdentifierValueChangedRiskSignal,
  type JourneyRiskSignalsV1,
  type MultipleAffiliateNetworksRiskSignal,
} from "../lib/journey-risk-signals.ts";

const group = { raw_param: "gclid", provider: "google", category: "paid_media", identifier_type: "click_id" };
const stableKey = identifierEvidenceStableKey(group);

function changedSignal(overrides: Partial<IdentifierValueChangedRiskSignal> = {}): IdentifierValueChangedRiskSignal {
  return {
    id: "risk_signal_changed",
    signal_code: "journey_identifier_value_changed",
    category: "identifier_integrity",
    severity: "medium",
    confidence: "deterministic",
    observed_at: "2026-09-01T10:05:00.000Z",
    summary: "An attribution identifier changed during the journey.",
    explanation: "The same bounded identifier group contained at least two distinct values.",
    assumptions: ["The canonical group dimensions identify one identifier."],
    evidence_refs: [{ evidence_type: "journey_attribution_identifier_group", scope_id: "journey-1", schema_version: 1, stable_key: stableKey }],
    facts: { ...group, distinct_value_count: 2, event_count: 2, first_seen_at: "2026-09-01T10:00:00.000Z", last_seen_at: "2026-09-01T10:05:00.000Z" },
    operator_guidance: "Inspect the contributing events, timestamps, and source locations.",
    ...overrides,
  };
}

function networkSignal(overrides: Partial<MultipleAffiliateNetworksRiskSignal> = {}): MultipleAffiliateNetworksRiskSignal {
  return {
    id: "risk_signal_networks",
    signal_code: "multiple_affiliate_networks_observed",
    category: "affiliate_network_consistency",
    severity: "informational",
    confidence: "deterministic",
    observed_at: "2026-09-01T10:05:00.000Z",
    summary: "Identifiers from multiple affiliate networks were observed during the journey.",
    explanation: "Retained identifier evidence names at least two known providers.",
    assumptions: ["Provider categories follow the canonical registry."],
    evidence_refs: [{ evidence_type: "journey_attribution_identifier_group", scope_id: "journey-1", schema_version: 1, stable_key: stableKey }],
    facts: { provider_count: 2, providers: ["everflow", "tune"], evidence_event_count: 3 },
    operator_guidance: "Inspect whether the networks represent forwarding or separate journey stages.",
    ...overrides,
  };
}

function evaluation(overrides: Partial<JourneyRiskSignalsV1> = {}): JourneyRiskSignalsV1 {
  return {
    schema_version: 1,
    ruleset_version: "core-risk-signals-v1.0.0",
    scope: { type: "journey", id: "journey-1", workspace_id: "default" },
    evaluated_at: "2026-09-01T11:00:00.000Z",
    evaluation_status: "complete",
    input: { evidence_versions: { journey_attribution_evidence: 1 }, truncated: false, input_digest: "a".repeat(64) },
    signals: [],
    ...overrides,
  };
}

const render = (value: JourneyRiskSignalsV1) => renderToStaticMarkup(createElement(JourneyRiskSignalsSection, { evaluation: value }));

test("complete zero-signal state is quiet and does not claim safety", () => {
  const html = render(evaluation());
  assert.match(html, /No review signals were produced by the current ruleset/);
  assert.match(html, /not a statement that the journey is safe or risk-free/);
  assert.doesNotMatch(html, />Safe<|>Clean<|>Trusted<|No fraud/i);
});

test("informational network signal appears only under Context", () => {
  const html = render(evaluation({ signals: [networkSignal()] }));
  assert.match(html, /<h3[^>]*>Context<\/h3>/);
  assert.doesNotMatch(html, /<h3[^>]*>Review signals<\/h3>/);
  assert.match(html, /Multiple affiliate networks observed/);
  assert.match(html, />Informational</);
  assert.match(html, /forwarding, partner routing, or separate acquisition stages/);
});

test("unexpected network severity is neutralized with a contract warning", () => {
  const html = render(evaluation({ signals: [networkSignal({ severity: "high" })] }));
  assert.match(html, /unsupported severity and cannot be classified for review/);
  assert.match(html, />Informational</);
  assert.doesNotMatch(html, />High</);
});

test("low and medium identifier changes render exact title, copy, and severity", () => {
  const html = render(evaluation({ signals: [changedSignal({ id: "low", severity: "low" }), changedSignal({ id: "medium", severity: "medium" })] }));
  assert.equal((html.match(/data-risk-signal-card/g) || []).length, 2);
  assert.match(html, /The same attribution identifier group was observed with more than one value during this journey/);
  assert.match(html, />Low</);
  assert.match(html, />Medium</);
  assert.match(html, /Distinct values/);
  assert.match(html, /Inspect the contributing events, timestamps, and source locations/);
  assert.doesNotMatch(html, /first_value|latest_value|raw historical/i);
});

test("future high severity and all confidence labels remain textual", () => {
  const high = render(evaluation({ signals: [changedSignal({ severity: "high", confidence: "conditional" })] }));
  const incomplete = render(evaluation({ signals: [changedSignal({ confidence: "incomplete" })] }));
  assert.match(high, />High</);
  assert.match(high, /Conditional/);
  assert.match(high, /depends on stated assumptions or incomplete context/);
  assert.match(incomplete, /Incomplete/);
  assert.match(incomplete, /insufficient for a complete evaluation/);
});

test("review signals precede informational context when mixed", () => {
  const html = render(evaluation({ signals: [networkSignal(), changedSignal()] }));
  assert.ok(html.indexOf("Review signals") < html.indexOf("Context"));
});

test("multiple changed groups remain separate cards", () => {
  const html = render(evaluation({ signals: [changedSignal({ id: "changed-a" }), changedSignal({ id: "changed-b", facts: { ...changedSignal().facts, raw_param: "_ef_transaction_id" } })] }));
  assert.equal((html.match(/data-risk-signal-card/g) || []).length, 2);
});

test("partial zero-signal state explains incompleteness without favorable empty copy", () => {
  const html = render(evaluation({ evaluation_status: "partial", input: { evidence_versions: { journey_attribution_evidence: 1 }, truncated: true, input_digest: "b".repeat(64) } }));
  assert.match(html, /Risk evaluation is incomplete because some contributing evidence was truncated/);
  assert.match(html, /role="status"/);
  assert.doesNotMatch(html, /No review signals were produced/);
});

test("not-evaluable state explains unsupported evidence", () => {
  const html = render(evaluation({ evaluation_status: "not_evaluable", signals: [changedSignal()], input: { evidence_versions: { journey_attribution_evidence: 2 }, truncated: false, input_digest: "c".repeat(64) } }));
  assert.match(html, /could not be evaluated under the current risk ruleset/);
  assert.match(html, /missing or used an unsupported contract version/);
  assert.doesNotMatch(html, /No review signals were produced/);
  assert.doesNotMatch(html, /Attribution identifier changed/);
});

test("signal and evaluation disclosures expose bounded provenance accessibly", () => {
  const html = render(evaluation({ signals: [changedSignal()] }));
  assert.match(html, /<summary[^>]*>Signal details<\/summary>/);
  assert.match(html, /<summary[^>]*>Evaluation details<\/summary>/);
  assert.match(html, /Deterministic/);
  assert.match(html, /follows directly from retained evidence under the current ruleset/);
  assert.match(html, /core-risk-signals-v1\.0\.0/);
  assert.match(html, /Input digest/);
  assert.match(html, /break-all/);
  assert.match(html, /<time dateTime=/);
});

test("stable evidence key and DOM ID are deterministic, bounded-contract identities", () => {
  assert.equal(stableKey, "gclid|google|paid_media|click_id");
  assert.equal(identifierEvidenceDomId(group), identifierEvidenceDomIdFromStableKey(stableKey));
  assert.notEqual(identifierEvidenceDomId({ ...group, raw_param: "a|b" }), identifierEvidenceDomId({ ...group, raw_param: "a", provider: "b|google" }));
});

test("unresolved evidence references have neutral feedback and no fetch path", () => {
  const component = readFileSync(new URL("../app/(app)/customers/[person_id]/journey-risk-signals.tsx", import.meta.url), "utf8");
  assert.match(component, /Supporting evidence is not available in the retained journey evidence/);
  assert.match(component, /getElementById/);
  assert.match(component, /scrollIntoView/);
  assert.match(component, /\.focus\(/);
  assert.doesNotMatch(component, /fetch\(|axios|XMLHttpRequest/);
});

test("evidence cards expose focusable stable anchors and non-color-only highlighting", () => {
  const evidence = readFileSync(new URL("../app/(app)/customers/[person_id]/journey-attribution-evidence.tsx", import.meta.url), "utf8");
  assert.match(evidence, /id=\{identifierEvidenceDomId\(identifier\)\}/);
  assert.match(evidence, /tabIndex=\{-1\}/);
  assert.match(evidence, /Supporting evidence/);
  assert.match(evidence, /data-\[supporting-evidence=true\]/);
});

test("long bounded facts and digest use wrapping responsive layouts without tables", () => {
  const long = "x".repeat(256);
  const html = render(evaluation({ input: { evidence_versions: { journey_attribution_evidence: 1 }, truncated: false, input_digest: long }, signals: [changedSignal({ facts: { ...changedSignal().facts, raw_param: long } })] }));
  assert.match(html, /break-words/);
  assert.match(html, /break-all/);
  assert.doesNotMatch(html, /<table/);
});

test("rendered conclusions remain neutral", () => {
  const html = render(evaluation({ signals: [changedSignal(), networkSignal()] }));
  assert.doesNotMatch(html, /fraudulent|scam|suspicious customer|bad actor|malicious|hijacked|stolen attribution|invalid traffic|confirmed abuse/i);
});

test("customer cards, header, and timeline remain isolated from risk signals", () => {
  const customer = readFileSync(new URL("../app/(app)/customers/[person_id]/customer-detail-client.tsx", import.meta.url), "utf8");
  const listCards = customer.slice(customer.indexOf("detail.journeys.map"), customer.indexOf("{journeyError"));
  const timeline = customer.slice(customer.indexOf("<ActivityFilterBar"), customer.indexOf("</Section>", customer.indexOf("<ActivityFilterBar")));
  assert.doesNotMatch(listCards, /risk_signals_v1|Risk Signals/);
  assert.doesNotMatch(timeline, /risk_signals_v1|Risk Signals/);
  assert.match(customer, /JourneyStoryHeader[\s\S]*JourneyRiskSignalsSection[\s\S]*JourneyAttributionEvidenceSection[\s\S]*ActivityFilterBar[\s\S]*NarrativeTimeline/);
  assert.equal((customer.match(/fetchJourney\(/g) || []).length, 3);
});
