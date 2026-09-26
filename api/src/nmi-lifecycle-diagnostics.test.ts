import assert from "node:assert/strict";
import test from "node:test";
import {
  gatewayClassicParentEvidenceFromTransactionXml,
  parseGatewayClassicTransactionDiagnostic,
  summarizeGatewayClassicTransactionDiagnostics,
} from "./chargebacks.ts";
import {
  blackboxNegativeSettleA,
  blackboxNegativeSettleB,
  normalCloseSettlement,
  normalPositiveSettle,
  successfulReturnRefund,
  suspectedFraudSale,
  syntheticAchReturn,
  syntheticChargeback,
  syntheticRepresentment,
  syntheticVoid,
} from "./nmi-lifecycle-diagnostics.fixtures.ts";

const parse = (xml: string) => parseGatewayClassicTransactionDiagnostic({ platform: "nmi:blackboxproducts0362", processor_account_id: "nmi:blackboxproducts0362", transaction_xml: xml });

test("negative settle-only children remain unknown candidates with complete safe evidence", async () => {
  const [first, second] = await Promise.all([parse(blackboxNegativeSettleA()), parse(blackboxNegativeSettleB())]);
  for (const diagnostic of [first, second]) {
    assert.equal(diagnostic.classification, "unknown");
    assert.equal(diagnostic.classification_reason, "unclassified_negative_settle_with_original_transaction");
    assert.equal(diagnostic.candidate, true);
    assert.equal(diagnostic.parent_present, false);
    assert.equal(diagnostic.inserted, false);
    assert.equal(diagnostic.actions[0].raw.response_code, "100");
    assert.equal(diagnostic.actions[0].raw.processor_response_code, "0");
    assert.ok(diagnostic.source_xml_hash.match(/^[a-f0-9]{64}$/));
  }
  assert.equal(first.batch_id, second.batch_id);
  assert.equal(first.processor_batch_id, second.processor_batch_id);
});

test("normal settlement and CLOSE batch evidence do not imply disputes", async () => {
  const [settle, close] = await Promise.all([parse(normalPositiveSettle()), parse(normalCloseSettlement())]);
  assert.equal(settle.classification, "unknown");
  assert.equal(settle.candidate, false);
  assert.equal(close.classification, "unknown");
  assert.equal(close.candidate, false);
});

test("RETURN refund and SUSPECTED FRAUD decline preserve their non-dispute meanings", async () => {
  const [refund, fraud] = await Promise.all([parse(successfulReturnRefund()), parse(suspectedFraudSale())]);
  assert.equal(refund.classification, "refund");
  assert.equal(refund.candidate, false);
  assert.equal(fraud.classification, "unknown");
  assert.equal(fraud.candidate, false);
});

test("synthetic lifecycle shapes exercise mechanics without certifying provider semantics", async () => {
  const results = await Promise.all([syntheticChargeback(), syntheticRepresentment(), syntheticAchReturn(), syntheticVoid()].map(parse));
  assert.deepEqual(results.map((row) => row.classification), ["card_chargeback_dispute", "reversal_recovery", "ach_return", "void"]);
  assert.ok(results.every((row) => row.classification_reason === "diagnostic_keyword_match_unverified_provider_semantics"));
  assert.ok(results.every((row) => row.inserted === false));
});

test("exact same-account parent evidence is safe and optional", async () => {
  const parentXml = normalCloseSettlement().replaceAll("SAFE-CLOSE", "12002859492");
  const parent = gatewayClassicParentEvidenceFromTransactionXml(parentXml);
  assert.ok(parent);
  const child = await parseGatewayClassicTransactionDiagnostic({ platform: "nmi:blackboxproducts0362", processor_account_id: "nmi:blackboxproducts0362", transaction_xml: blackboxNegativeSettleA(), parent });
  assert.equal(child.parent_present, true);
  assert.equal(child.parent?.transaction_id, "12002859492");
  assert.deepEqual(Object.keys(child.parent || {}).sort(), ["action_sequence", "amount", "condition", "currency", "source_timestamp", "transaction_id"]);
});

test("bounded summary retains every candidate and explicitly truncates ordinary evidence", async () => {
  const diagnostics = await Promise.all([blackboxNegativeSettleB(), normalPositiveSettle(), blackboxNegativeSettleA(), normalCloseSettlement()].map(parse));
  const summary = await summarizeGatewayClassicTransactionDiagnostics({ diagnostics, ordinaryEvidenceLimit: 1 });
  assert.deepEqual(summary.candidate_ids, ["12006746129", "12006747797"]);
  assert.equal(summary.candidate_count, 2);
  assert.equal(summary.candidates.length, 2);
  assert.equal(summary.candidate_truncated, false);
  assert.equal(summary.ordinary_evidence_retained, 1);
  assert.equal(summary.ordinary_evidence_truncated, true);
  assert.match(summary.summary_hash, /^[a-f0-9]{64}$/);
});

test("diagnostic evidence contains no unrestricted XML or common customer/card fields", async () => {
  const diagnostic = await parse(blackboxNegativeSettleA());
  const serialized = JSON.stringify(diagnostic);
  for (const forbidden of ["source_xml", "security_key", "cc_number", "first_name", "last_name", "email", "address_1"]) {
    assert.equal(serialized.includes(`\"${forbidden}\"`), false);
  }
});
