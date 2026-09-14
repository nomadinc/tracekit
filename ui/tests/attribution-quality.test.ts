import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { aggregateCommasAttributionQuality, type QualityObservation } from "../lib/commerce/attribution-quality";

const sample = (patch: Partial<QualityObservation> = {}): QualityObservation => ({
  id: "opaque-1", eventId: "event-1", evidenceId: "evidence-1", observedAt: "2026-09-13T22:00:00Z",
  webhookObservedAt: "2026-09-13T22:00:00Z",
  paymentId: "ORD-ONE", canonicalOrderId: "order-1", matchState: "exact", aliasState: "all_agree", comparisonState: "exact_match",
  affiliateId: "restricted-aff", sub1: "restricted-sub1", sub4: null,
  efTransactionId: "restricted-tid", transactionId: "restricted-tid", tid: "restricted-tid", c1: "restricted-tid",
  evidenceNormalizerVersion: "commas-provider-attribution-v2", reconciliationVersion: null,
  journeyCreatedAt: "2026-09-13T22:01:00Z", comparison: { matched_fields: ["transaction_id"], conflicting_fields: [] },
  ...patch,
});

test("quality funnel and coverage keep identity, evidence, and projection separate", () => {
  const report = aggregateCommasAttributionQuality([sample(), sample({ id: "opaque-2", paymentId: null, canonicalOrderId: null, matchState: "malformed", aliasState: "none", comparisonState: "no_commas_tid", affiliateId: null, sub1: null, efTransactionId: null, transactionId: null, tid: null, c1: null, journeyCreatedAt: null })]);
  assert.equal(report.total, 2);
  assert.equal(report.funnel.paymentPresent, 1);
  assert.equal(report.funnel.exactOrd, 1);
  assert.equal(report.funnel.journeyShadow, 1);
  assert.equal(report.parameters.anyAlias, 1);
  assert.equal(report.parameters.noFields, 1);
  assert.equal(report.ord.malformed, 1);
});

test("conflict diagnostics contain field names but no source values", () => {
  const report = aggregateCommasAttributionQuality([sample({ aliasState: "conflict", comparisonState: "conflict", c1: "private-other", comparison: { conflicting_fields: ["sub4"], matched_fields: ["sub1"] } })]);
  const serialized = JSON.stringify(report);
  assert.deepEqual(report.conflicts[0].conflictingAliases, ["c1"]);
  assert.deepEqual(report.conflicts[0].conflictingFields, ["sub4"]);
  for (const value of ["restricted-aff", "restricted-sub1", "restricted-tid", "private-other"]) assert.ok(!serialized.includes(value));
});

test("field agreement separates missing values, and temporal cohorts use UTC event dates", () => {
  const report = aggregateCommasAttributionQuality([
    sample({ everflow: { transactionId: "restricted-tid", affiliateId: "restricted-aff", sub1: "restricted-sub1", sub4: "everflow-sub4" }, sub4: "commas-sub4" }),
    sample({ id: "opaque-2", observedAt: "2026-09-14T00:01:00Z", webhookObservedAt: "2026-09-14T00:01:01Z", everflow: { transactionId: "restricted-tid", affiliateId: null, sub1: null, sub4: null }, affiliateId: null, sub1: null, evidenceNormalizerVersion: "commas-provider-attribution-v1", normalizerVersion: "commas-provider-attribution-v2" }),
  ], { cutoverAt: "2026-09-13T23:00:00Z" });
  assert.equal(report.fieldAgreement.sub4.comparable, 1);
  assert.equal(report.fieldAgreement.sub4.disagree, 1);
  assert.equal(report.fieldAgreement.affiliateId.bothMissing, 1);
  assert.equal(report.provenance.laterReconciled, 1);
  assert.deepEqual(report.daily.map(day => day.date), ["2026-09-13", "2026-09-14"]);
  assert.equal(report.maturity.postCutover, 1);
});

test("latency uses persisted stage timestamps and does not invent first-match history", () => {
  const report = aggregateCommasAttributionQuality([
    sample({ ordMappingCreatedAt: "2026-09-13T22:00:12Z", journeyCreatedAt: "2026-09-13T22:00:20Z" }),
    sample({ id: "opaque-2", ordMappingCreatedAt: "2026-09-13T22:00:30Z", journeyCreatedAt: null }),
  ]);
  assert.equal(report.latency.webhookToOrdAvailable.medianSeconds, 12);
  assert.equal(report.latency.webhookToOrdAvailable.maxSeconds, 30);
  assert.equal(report.latency.webhookToJourneyShadow.measured, 1);
  assert.equal(report.latency.webhookToFirstExactMatch, null);
});

test("ORD identity pending after a newer webhook is not counted as a permanent mapping failure", () => {
  const report = aggregateCommasAttributionQuality([
    sample({ matchState: "unmatched", canonicalOrderId: null, ordMappingCreatedAt: null, webhookObservedAt: "2026-09-14T02:46:01Z" }),
  ], { latestSyncCompletedAt: "2026-09-14T02:40:49Z" });
  assert.equal(report.ord.unmatchedReasons.transactionNotIngestedYet, 1);
  assert.equal(report.ord.unmatchedReasons.ordMappingAbsent, 0);
});

test("report request path is GET only and cannot mutate attribution state", () => {
  const route = readFileSync(new URL("../app/api/commerce/attribution-quality/route.ts", import.meta.url), "utf8");
  const repository = readFileSync(new URL("../lib/commerce/attribution-quality-repository.ts", import.meta.url), "utf8");
  assert.match(route, /export async function GET/);
  assert.match(route, /requirePermission\(resolution\.session, "connectors\.view"\)/);
  assert.match(repository, /organization_id=eq\.\$\{organizationId\}/);
  const sql = readFileSync(new URL("../../supabase/migrations/20260914034800_commas_attribution_quality_read_v1.sql", import.meta.url), "utf8");
  assert.match(repository, /rpc\/read_commas_attribution_quality_v1/);
  assert.match(repository, /rpc\/read_commas_attribution_conflicts_v1/);
  assert.doesNotMatch(route + repository, /journey_attribution_credits|method:\s*["'](?:POST|PATCH|PUT|DELETE)["']/);
  assert.match(sql, /stable security invoker/g);
  assert.doesNotMatch(sql, /\b(?:insert|update|delete|truncate|perform)\b\s+(?:into\s+|from\s+)?(?:public\.)?(?:journey_attribution_credits|commerce_provider_attribution_observations|commerce_source_mappings|journey_events|everflow_\w+)/i);
  assert.doesNotMatch(sql, /grant execute .* to (?:anon|authenticated)/i);
});

test("database aggregation is scoped and has no 5,000-observation application bound", () => {
  const repository = readFileSync(new URL("../lib/commerce/attribution-quality-repository.ts", import.meta.url), "utf8");
  const sql = readFileSync(new URL("../../supabase/migrations/20260914034800_commas_attribution_quality_read_v1.sql", import.meta.url), "utf8");
  assert.doesNotMatch(repository, /MAX_ROWS|scopedRows|observations\.map/);
  assert.match(sql, /o\.organization_id=p_organization_id and o\.connection_id=p_connection_id/);
  assert.match(sql, /o\.provider_account_id=p_provider_account_id/);
  assert.match(sql, /p_limit>50/);
  assert.match(sql, /count\(distinct o\.id\)[\s\S]*post_epoch/);
});

test("measurement epoch and healthy days require durable scoped evidence", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20260914034700_commas_attribution_measurement_epoch_v1.sql", import.meta.url), "utf8");
  assert.match(sql, /source_evidence_id uuid not null/);
  assert.match(sql, /first_verified_post_cutover_delivery/);
  assert.match(sql, /endpoint_healthy and provider_transaction_parity and ingestion_current/);
  assert.match(sql, /journey_projection_healthy and firewall_intact/);
  assert.match(sql, /append-only/);
  assert.doesNotMatch(sql, /insert into public\.commerce_attribution_healthy_day_certifications/i);
});

test("stored comparison, pending identity, unavailable latency and payment path are explicit", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20260914034800_commas_attribution_quality_read_v1.sql", import.meta.url), "utf8");
  for (const required of ["'everflow'", "'currentEverflow'", "'comparisonFreshness'", "'pending_identity'", "'ord_mapping_absent'", "'identityLatency','UNAVAILABLE'", "'paymentPathAvailability','UNAVAILABLE'", "'initialMatchState','UNKNOWN'"]) assert.ok(sql.includes(required), required);
  assert.match(sql, /'classification'[\s\S]*'FIELD_LEVEL_CONFLICT'/);
  assert.match(sql, /'transactionIdentity'[\s\S]*'affiliateId'[\s\S]*'sub1'[\s\S]*'sub4'/);
  assert.doesNotMatch(sql, /'rawAdditionalParams'|'email'|'phone'|'signatureValue'/);
});
