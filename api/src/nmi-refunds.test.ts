import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyNmiRefund,
  cumulativeSuccessfulRefundAmount,
  nmiRefundFinancialFingerprint,
  parseNmiRefundEvidence,
  refundReconciliationState,
} from "./nmi-refunds.ts";
import {
  FAILED_ACTION,
  SUCCESS_ACTION,
  failedRefundFixture,
  fullRefundFixture,
  partialRefundFixture,
  returnReferenceRefundFixture,
  sanitizedNmiTransactionXml,
} from "./nmi-refunds.fixtures.ts";

const ACCOUNT = "nmi:sanitized-account";

async function decide(xml: string) {
  const evidence = await parseNmiRefundEvidence(ACCOUNT, xml);
  const decision = classifyNmiRefund(evidence);
  return { evidence, decision, fingerprint: await nmiRefundFinancialFingerprint(evidence, decision) };
}

test("1. successful full refund is an eligible negative economic event", async () => {
  const { evidence, decision } = await decide(fullRefundFixture());
  assert.equal(decision.classification, "REFUND_SUCCEEDED");
  assert.equal(decision.attemptedAmount, 64.38);
  assert.equal(decision.effectiveAmount, -64.38);
  assert.equal(decision.eventCreationEligible, true);
  assert.equal(evidence.sourceEventId, "nmi_refund:nmi:sanitized-account:refund-full-001");
  assert.equal(evidence.originalTransactionId, "sale-full-001");
  assert.equal(evidence.settleEvidencePresent, true);
  assert.equal(evidence.sourceXml, fullRefundFixture());
  assert.match(evidence.refundActions[0].rawXml, /<action_type>refund<\/action_type>/);
});

test("2. successful partial refund preserves its independent amount and parent", async () => {
  const { evidence, decision } = await decide(partialRefundFixture());
  assert.equal(decision.classification, "REFUND_SUCCEEDED");
  assert.equal(decision.attemptedAmount, 30.99);
  assert.equal(decision.effectiveAmount, -30.99);
  assert.equal(evidence.originalTransactionId, "sale-partial-001");
  assert.equal(evidence.settleEvidencePresent, false);
});

test("3. failed refund records attempted amount but no economic effect", async () => {
  const { decision } = await decide(failedRefundFixture());
  assert.equal(decision.classification, "REFUND_FAILED");
  assert.equal(decision.responseEvidence, "CERTIFIED_FAILURE");
  assert.equal(decision.attemptedAmount, 67.88);
  assert.equal(decision.effectiveAmount, 0);
  assert.equal(decision.eventCreationEligible, false);
});

test("4. two successful refund children remain independent and cumulative", async () => {
  const first = await decide(partialRefundFixture({ transactionId: "child-1", actions: [{ ...SUCCESS_ACTION, amount: "10.00" }] }));
  const second = await decide(partialRefundFixture({ transactionId: "child-2", actions: [{ ...SUCCESS_ACTION, amount: "20.00" }] }));
  assert.notEqual(first.evidence.sourceEventId, second.evidence.sourceEventId);
  assert.equal(cumulativeSuccessfulRefundAmount([first.decision, second.decision]), 30);
});

test("5. failed then successful attempts count only the successful child", async () => {
  const failed = await decide(failedRefundFixture({ transactionId: "attempt-failed", originalTransactionId: "sale-attempts" }));
  const succeeded = await decide(partialRefundFixture({ transactionId: "attempt-succeeded", originalTransactionId: "sale-attempts", actions: [{ ...SUCCESS_ACTION, amount: "25.00" }] }));
  assert.equal(cumulativeSuccessfulRefundAmount([failed.decision, succeeded.decision]), 25);
  assert.equal(failed.decision.eventCreationEligible, false);
  assert.equal(succeeded.decision.eventCreationEligible, true);
});

test("6. unresolved parent does not invalidate source evidence", async () => {
  const { decision } = await decide(partialRefundFixture());
  assert.equal(decision.classification, "REFUND_SUCCEEDED");
  assert.deepEqual(refundReconciliationState({ parentPresent: false }), { state: "unreconciled", diagnostic: "parent_transaction_not_present" });
});

test("7. missing attribution is absent from financial evidence and does not block classification", async () => {
  const { evidence, decision } = await decide(partialRefundFixture());
  assert.equal("customerEmail" in evidence, false);
  assert.equal(decision.eventCreationEligible, true);
});

test("8. identical replay and normalized raw formatting retain identity and financial fingerprint", async () => {
  const firstXml = partialRefundFixture();
  const secondXml = firstXml.replace("<amount>30.99</amount>", "<amount>+030.990</amount>").replace("<response_text>APPROVED</response_text>", "<response_text>  APPROVED  </response_text>");
  const first = await decide(firstXml);
  const second = await decide(secondXml);
  assert.equal(first.evidence.sourceEventId, second.evidence.sourceEventId);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.notEqual(first.evidence.sourceXmlHash, second.evidence.sourceXmlHash);
});

test("9. conflicting replay changes the material financial fingerprint", async () => {
  const first = await decide(partialRefundFixture());
  const second = await decide(partialRefundFixture({ actions: [{ ...SUCCESS_ACTION, date: "20260106155751", amount: "31.00" }] }));
  assert.equal(first.evidence.sourceEventId, second.evidence.sourceEventId);
  assert.notEqual(first.fingerprint, second.fingerprint);
  assert.deepEqual(refundReconciliationState({ parentPresent: true, conflictingFingerprint: true }), { state: "conflict", diagnostic: "financial_fingerprint_conflict" });
});

test("10. unknown response code is ambiguous", async () => {
  const { decision } = await decide(partialRefundFixture({ actions: [{ ...SUCCESS_ACTION, responseCode: "777", responseText: "MYSTERY" }] }));
  assert.equal(decision.classification, "REFUND_AMBIGUOUS");
  assert.equal(decision.effectiveAmount, 0);
  assert.equal(decision.eventCreationEligible, false);
  assert.ok(decision.diagnostics.includes("unknown_response_code"));
});

test("11. prospective pending refund has zero economic effect", async () => {
  const pending = sanitizedNmiTransactionXml({ transactionId: "pending-1", originalTransactionId: "sale-pending", condition: "pending", actions: [{ type: "refund", date: "20260119120000", amount: "10.00" }] });
  const { decision } = await decide(pending);
  assert.equal(decision.classification, "REFUND_PENDING");
  assert.equal(decision.effectiveAmount, 0);
  assert.equal(decision.eventCreationEligible, false);
});

test("12. multiple refund actions in one transaction are quarantined as ambiguous", async () => {
  const multiple = sanitizedNmiTransactionXml({ transactionId: "multiple-1", originalTransactionId: "sale-multiple", condition: "complete", actions: [SUCCESS_ACTION, { ...SUCCESS_ACTION, date: "20260105100000", amount: "5.00" }] });
  const { evidence, decision } = await decide(multiple);
  assert.equal(evidence.refundActionCount, 2);
  assert.equal(decision.classification, "REFUND_AMBIGUOUS");
  assert.equal(decision.eventCreationEligible, false);
  assert.ok(decision.diagnostics.includes("multiple_refund_actions"));
});

test("13. cumulative refund above sale is preserved and flagged for review", async () => {
  const first = await decide(partialRefundFixture({ transactionId: "over-1", actions: [{ ...SUCCESS_ACTION, amount: "60.00" }] }));
  const second = await decide(partialRefundFixture({ transactionId: "over-2", actions: [{ ...SUCCESS_ACTION, amount: "50.00" }] }));
  const cumulative = cumulativeSuccessfulRefundAmount([first.decision, second.decision]);
  assert.equal(cumulative, 110);
  assert.deepEqual(refundReconciliationState({ parentPresent: true, cumulativeRefund: cumulative, saleAmount: 100 }), { state: "review_required", diagnostic: "cumulative_refund_exceeds_sale" });
});

test("14. later parent arrival advances reconciliation without changing refund identity", async () => {
  const refund = await decide(partialRefundFixture());
  assert.deepEqual(refundReconciliationState({ parentPresent: false }), { state: "unreconciled", diagnostic: "parent_transaction_not_present" });
  assert.deepEqual(refundReconciliationState({ parentPresent: true, canonicalOrderId: "canonical-order-1" }), { state: "reconciled", diagnostic: null });
  assert.equal(refund.evidence.sourceEventId, "nmi_refund:nmi:sanitized-account:refund-partial-001");
});

test("invalid amount, currency, and timestamp remain ambiguous diagnostics", async () => {
  const invalid = sanitizedNmiTransactionXml({ transactionId: "invalid-1", originalTransactionId: "sale-invalid", condition: "complete", currency: "US", actions: [{ ...SUCCESS_ACTION, date: "20260230120000", amount: "not-money" }] });
  const { decision } = await decide(invalid);
  assert.equal(decision.classification, "REFUND_AMBIGUOUS");
  assert.deepEqual([...decision.diagnostics].sort(), ["invalid_amount", "invalid_currency", "invalid_timestamp", "uncertified_refund_evidence_combination"].sort());
});

test("alternate certified failure response remains a zero-effect attempt", async () => {
  const { decision } = await decide(failedRefundFixture({ actions: [{ ...FAILED_ACTION, responseCode: "220", responseText: "INVALID CARD #" }] }));
  assert.equal(decision.classification, "REFUND_FAILED");
  assert.equal(decision.effectiveAmount, 0);
});

test("success-shaped action without processor response evidence remains ambiguous", async () => {
  const { decision } = await decide(partialRefundFixture({ actions: [{ ...SUCCESS_ACTION, processorResponseCode: undefined, processorResponseText: undefined }] }));
  assert.equal(decision.classification, "REFUND_AMBIGUOUS");
  assert.equal(decision.eventCreationEligible, false);
});

test("certifies only the retained RETURN reference family with exact settlement corroboration", async () => {
  for (const response of ["RETURN DFYCXZ", "RETURN CAD11C", "RETURN R78641", "RETURN R86453", "RETURN R94232"]) {
    const { evidence, decision } = await decide(returnReferenceRefundFixture(response));
    assert.equal(decision.classification, "REFUND_SUCCEEDED", response);
    assert.equal(decision.effectiveAmount, -59.48);
    assert.equal(decision.eventCreationEligible, true);
    assert.equal(evidence.settleActions[0].batchId, "867721287");
  }
});

test("nearby or insufficiently corroborated RETURN evidence remains ambiguous", async () => {
  const nearby = await decide(returnReferenceRefundFixture("RETURN 100"));
  const noSettle = await decide(returnReferenceRefundFixture("RETURN ABC123", { actions: [{ type: "refund", date: "20260110143508", amount: "-59.48", responseCode: "100", responseText: "RETURN ABC123", processorResponseCode: "0", processorResponseText: "RETURN ABC123" }] }));
  const mismatchedSettle = await decide(returnReferenceRefundFixture("RETURN ABC123", { actions: [
    { type: "refund", date: "20260110143508", amount: "-59.48", responseCode: "100", responseText: "RETURN ABC123", processorResponseCode: "0", processorResponseText: "RETURN ABC123" },
    { type: "settle", date: "20260110231147", amount: "-50.00", responseCode: "100", processorResponseCode: "0" },
  ] }));
  assert.equal(nearby.decision.classification, "REFUND_AMBIGUOUS");
  assert.equal(noSettle.decision.classification, "REFUND_AMBIGUOUS");
  assert.equal(mismatchedSettle.decision.classification, "REFUND_AMBIGUOUS");
});

test("RETURN reference replay fingerprint is stable and settlement changes are material", async () => {
  const first = await decide(returnReferenceRefundFixture());
  const replay = await decide(returnReferenceRefundFixture().replace("<response_text>RETURN DFYCXZ</response_text>", "<response_text>  RETURN DFYCXZ  </response_text>"));
  const changed = await decide(returnReferenceRefundFixture("RETURN DFYCXZ", { actions: [
    { type: "refund", date: "20260110143508", amount: "-59.48", responseCode: "100", responseText: "RETURN DFYCXZ", processorResponseCode: "0", processorResponseText: "RETURN DFYCXZ", batchId: "0" },
    { type: "settle", date: "20260110231148", amount: "-59.48", responseCode: "100", processorResponseCode: "0", batchId: "867721287", processorBatchId: "8" },
  ] }));
  assert.equal(first.evidence.sourceEventId, replay.evidence.sourceEventId);
  assert.equal(first.fingerprint, replay.fingerprint);
  assert.notEqual(first.fingerprint, changed.fingerprint);
});
