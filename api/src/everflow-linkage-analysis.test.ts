import assert from "node:assert/strict";
import test from "node:test";
import { SafeParameterProfiler, EverflowSchemaProfiler, classifyAttributionProvenance, classifyNandiFailure, compareInvestigationVersions, compareOpaqueIdentifiers, normalizeHistoricalEverflowReportTime, summarizeTransactionGroup, uniquelyClaimedJourneyLinks } from "./connectors/everflow/linkage-analysis.ts";

test("103-field profiling reports type, nullability, cardinality, and group stability without values", () => {
  const fields = Array.from({ length: 103 }, (_, index) => index === 0 ? "transaction_id" : `field_${index}`);
  const profiler = new EverflowSchemaProfiler(fields);
  profiler.observe({ transaction_id: "tx-a", field_1: "1", field_2: "same" });
  profiler.observe({ transaction_id: "tx-a", field_1: "2", field_2: "same" });
  const result = profiler.finish();
  assert.equal(result.length, 103);
  assert.deepEqual(result.find((field) => field.field === "field_1")?.observedTypes, ["number"]);
  assert.equal(result.find((field) => field.field === "field_1")?.varyingGroups, 1);
  assert.equal(result.find((field) => field.field === "field_2")?.stableGroups, 1);
});

test("URL and bounded structured parameter discovery reports paths, never values", () => {
  const profiler = new SafeParameterProfiler();
  profiler.observe("referer", "https://example.invalid/path?c1=secret&transaction_id=opaque");
  profiler.observe("metadata", JSON.stringify({ tracking: { click_id: "secret-click" } }));
  assert.deepEqual(profiler.finish().map((entry) => entry.path), ["metadata.tracking.click_id", "referer.query.c1", "referer.query.transaction_id"]);
  assert.equal(JSON.stringify(profiler.finish()).includes("secret"), false);
});

test("opaque identifier comparison distinguishes deterministic matches and collisions", () => {
  const shared = Array.from({ length: 10 }, (_, index) => `shared-${index}`);
  const deterministic = compareOpaqueIdentifiers({ everflowField: "order_id", commasField: "provider_order_id", everflowValues: shared, commasValues: shared });
  assert.equal(deterministic.uniqueOneToOne, 10);
  assert.equal(deterministic.deterministic, true);
  const collision = compareOpaqueIdentifiers({ everflowField: "order_id", commasField: "provider_order_id", everflowValues: ["a", "a"], commasValues: ["a"] });
  assert.equal(collision.manyToOne, 1);
  assert.equal(collision.deterministic, false);
});

test("journey attribution provenance remains explicit", () => {
  assert.equal(classifyAttributionProvenance({ sharedIdentifier: true, journeySeed: false, evidenceRule: false }), "direct");
  assert.equal(classifyAttributionProvenance({ sharedIdentifier: false, journeySeed: true, evidenceRule: false }), "propagated_within_journey");
  assert.equal(classifyAttributionProvenance({ sharedIdentifier: false, journeySeed: false, evidenceRule: false }), "unattributed");
});

test("nandi failures are classified without relaxing evidence", () => {
  assert.equal(classifyNandiFailure({ contactCandidates: 1, dateCandidates: 1, amountCandidates: 0, productCompatible: true, identifierMatch: false }), "missing_compatible_amount");
  assert.equal(classifyNandiFailure({ contactCandidates: 0, dateCandidates: 0, amountCandidates: 0, productCompatible: false, identifierMatch: false }), "contact_mismatch");
});

test("investigation version comparison is deterministic", () => {
  assert.deepEqual(compareInvestigationVersions({ coverage: 10, finding: 2 }, { coverage: 10, finding: 1 }), { coverage: "unchanged", finding: "weakened" });
});

test("report-period timezone normalization is explicit and rejects timezone-marked input", () => {
  assert.equal(normalizeHistoricalEverflowReportTime("2026-07-01 12:30:00"), "2026-07-01T16:30:00.000Z");
  assert.throws(() => normalizeHistoricalEverflowReportTime("2026-07-01T12:30:00Z"));
});

test("Transaction-group semantics preserve events and varying commercial fields", () => {
  assert.deepEqual(summarizeTransactionGroup([
    { transactionId: "tx", conversionId: "a", eventName: "Sale", saleAmount: 67, revenue: 67 },
    { transactionId: "tx", conversionId: "b", eventName: "Sale", saleAmount: 177, revenue: 67 },
  ]), { eventCount: 2, transactionCount: 1, conversionCount: 2, eventNameCount: 1, saleAmountVaries: true, revenueVaries: false });
});

test("Journey propagation excludes competing claims", () => {
  assert.deepEqual(uniquelyClaimedJourneyLinks([
    { journeyId: "a", orderId: "one" }, { journeyId: "a", orderId: "two" }, { journeyId: "b", orderId: "two" },
  ]), [{ journeyId: "a", orderId: "one" }]);
});
