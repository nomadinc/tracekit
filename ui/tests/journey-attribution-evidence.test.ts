import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JourneyAttributionEvidenceSection } from "../app/(app)/customers/[person_id]/journey-attribution-evidence.tsx";
import { eventAttributionEvidence, type JourneyAttributionEvidence } from "../lib/journey-attribution-evidence.ts";

const base: JourneyAttributionEvidence = {
  schema_version: 1,
  providers: [],
  identifiers: [],
  referrers: {
    first_observed_client_referrer: null,
    latest_observed_client_referrer: null,
    first_external_origin: null,
    latest_external_origin: null,
    distinct_external_origins: [],
    missing_observed: false,
    changed: false,
  },
  flags: [],
  identifier_count: 0,
  evidence_event_count: 0,
  truncation: { truncated: false, events: false, identifiers: false, distinct_values: false, referrer_origins: false, flags: false },
};

function identifier(raw_param: string, provider: string, changed = false) {
  return {
    raw_param,
    provider,
    category: provider === "everflow" ? "affiliate_network" : "paid_media",
    identifier_type: "transaction_id",
    first_seen_at: "2026-09-01T10:00:00.000Z",
    last_seen_at: "2026-09-01T10:05:00.000Z",
    first_value: `${provider}-first`,
    latest_value: changed ? `${provider}-latest` : `${provider}-first`,
    distinct_value_count: changed ? 2 : 1,
    value_changed: changed,
    first_source_location: "page_url",
    latest_source_location: "page_url",
    event_count: changed ? 2 : 1,
  };
}

function render(evidence: JourneyAttributionEvidence | null) {
  return renderToStaticMarkup(createElement(JourneyAttributionEvidenceSection, { evidence }));
}

test("empty evidence is a valid, clear state", () => {
  assert.match(render(base), /No attribution evidence observed/);
  assert.doesNotMatch(render(base), /Journey unavailable/);
});

test("Everflow-only evidence shows a stable identifier", () => {
  const evidence = { ...base, providers: [{ provider: "everflow", category: "affiliate_network", first_seen_at: "2026-09-01T10:00:00.000Z", last_seen_at: "2026-09-01T10:00:00.000Z", event_count: 1 }], identifiers: [identifier("_ef_transaction_id", "everflow")], identifier_count: 1, evidence_event_count: 1 };
  const html = render(evidence);
  assert.match(html, /Everflow/);
  assert.match(html, /_ef_transaction_id/);
  assert.match(html, /Stable/);
});

test("Meta and Everflow evidence remains descriptive", () => {
  const html = render({ ...base, providers: [{ provider: "meta", category: "paid_media", first_seen_at: "x", last_seen_at: "x", event_count: 1 }, { provider: "everflow", category: "affiliate_network", first_seen_at: "x", last_seen_at: "x", event_count: 1 }], flags: ["paid_media_and_affiliate_observed"], evidence_event_count: 1 });
  assert.match(html, /Meta/);
  assert.match(html, /Everflow/);
  assert.match(html, /Paid media and affiliate identifiers observed/);
});

test("Google and Everflow providers render independently", () => {
  const html = render({ ...base, providers: [{ provider: "google", category: "paid_media", first_seen_at: "x", last_seen_at: "x", event_count: 1 }, { provider: "everflow", category: "affiliate_network", first_seen_at: "x", last_seen_at: "x", event_count: 1 }], evidence_event_count: 1 });
  assert.match(html, /Google/);
  assert.match(html, /affiliate network/);
});

test("raw alias groups display separately", () => {
  const html = render({ ...base, identifiers: [identifier("_ef_transaction_id", "everflow"), identifier("transaction_id", "unknown")], identifier_count: 2, evidence_event_count: 1 });
  assert.match(html, /_ef_transaction_id/);
  assert.match(html, />transaction_id</);
  assert.equal((html.match(/>Stable</g) || []).length, 2);
});

test("missing referrer has explicit operational wording", () => {
  const html = render({ ...base, referrers: { ...base.referrers, missing_observed: true }, flags: ["referrer_missing_observed"], evidence_event_count: 1 });
  assert.match(html, /Missing observed/);
  assert.match(html, /Referrer missing on one or more events/);
});

test("changed identifier is labeled Changed without accusation", () => {
  const html = render({ ...base, identifiers: [identifier("gclid", "google", true)], identifier_count: 1, evidence_event_count: 2, flags: ["identifier_value_changed"] });
  assert.match(html, />Changed</);
  assert.match(html, /Identifier value changed during journey/);
  assert.doesNotMatch(html, /suspicious|bad actor|cloaking|hijack|theft|invalid traffic/i);
});

test("multiple providers remain compact badges", () => {
  const html = render({ ...base, providers: ["meta", "google", "tiktok"].map((provider) => ({ provider, category: "paid_media", first_seen_at: "x", last_seen_at: "x", event_count: 1 })), evidence_event_count: 1 });
  assert.match(html, /Meta/);
  assert.match(html, /Google/);
  assert.match(html, /TikTok/);
});

test("truncation is visible and names capped categories", () => {
  const html = render({ ...base, evidence_event_count: 1, truncation: { ...base.truncation, truncated: true, events: true, distinct_values: true } });
  assert.match(html, /Some evidence is omitted/);
  assert.match(html, /Capped: events, distinct values/);
});

test("helper copy is explicitly evidence-only", () => {
  const html = render({ ...base, evidence_event_count: 1 });
  assert.match(html, /observed attribution evidence, not a fraud determination/i);
  assert.doesNotMatch(html, /suspicious|bad actor|cloaking|hijack|theft|invalid traffic/i);
});

test("event drill-down extracts only the bounded evidence contract", () => {
  const evidence = { schema_version: 1 as const, identifiers: [], marketing_params: [], referrer: { client: null, domain: null, origin: null, missing: true }, flags: [] };
  assert.deepEqual(eventAttributionEvidence({ technical_evidence: { metadata: { attribution_evidence_v1: evidence, arbitrary_secret: "not selected" } } }), evidence);
  assert.equal(eventAttributionEvidence({ technical_evidence: { metadata: { raw_payload: { token: "secret" } } } }), null);
});

test("responsive layout uses collapsing grids and no mandatory wide table", () => {
  const source = readFileSync(new URL("../app/(app)/customers/[person_id]/journey-attribution-evidence.tsx", import.meta.url), "utf8");
  assert.match(source, /sm:grid-cols-2/);
  assert.match(source, /xl:grid-cols-4/);
  assert.doesNotMatch(source, /<table/);
});

test("loading and API errors remain handled by the existing journey detail state", () => {
  const source = readFileSync(new URL("../app/(app)/customers/[person_id]/customer-detail-client.tsx", import.meta.url), "utf8");
  assert.match(source, /journeyLoading \? <Loader2/);
  assert.match(source, /journeyError \?/);
  assert.match(source, /JourneyAttributionEvidenceSection/);
});

test("person journey cards stay compact and evidence loads only with selected detail", () => {
  const source = readFileSync(new URL("../app/(app)/customers/[person_id]/customer-detail-client.tsx", import.meta.url), "utf8");
  const listCard = source.slice(source.indexOf("detail.journeys.map"), source.indexOf("{journeyError"));
  assert.doesNotMatch(listCard, /attribution_evidence_v1/);
  assert.equal((source.match(/fetchJourney\(/g) || []).length, 3);
  assert.doesNotMatch(source, /identifiers\.map\([^)]*fetch/);
});
