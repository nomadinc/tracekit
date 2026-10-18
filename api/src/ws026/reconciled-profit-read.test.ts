import assert from "node:assert/strict";
import test from "node:test";
import { presentReconciledPeriod, type ClosedPeriodEvidence } from "./reconciled-profit-read.ts";
const period: ClosedPeriodEvidence = { periodId: "2026-09", currency: "USD", status: "closed",
 operationalProfitCents: 3147, statementProfitCents: 3047, statementEvidenceId: "statement-1",
 closedBy: "reviewer", closedAt: "2026-10-15T00:00:00Z",
 adjustments: [{ id: "adjust-1", currency: "USD", amountCents: 100, direction: "debit", evidenceId: "adjust-evidence", approvalId: "approved-1" }] };
test("closed period with approved adjustment reconciles to statement", () => {
 assert.deepEqual(presentReconciledPeriod(period), { status: "reconciled", periodId: "2026-09", currency: "USD", profitCents: 3047, statementProfitCents: 3047, adjustmentCents: -100 });
});
test("period flag without closure evidence is insufficient", () => {
 assert.deepEqual(presentReconciledPeriod({ ...period, statementEvidenceId: null }), { status: "limited", reason: "missing_evidence" });
 assert.deepEqual(presentReconciledPeriod({ ...period, status: "pending" }), { status: "limited", reason: "period_open" });
});
test("statement variance does not claim reconciled profit", () => {
 assert.deepEqual(presentReconciledPeriod({ ...period, statementProfitCents: 3050 }), { status: "limited", reason: "variance" });
});
test("missing operational calculation cannot reconcile", () => {
 assert.deepEqual(presentReconciledPeriod({ ...period, operationalProfitCents: null }), { status: "limited", reason: "incomplete_operational" });
});
test("duplicate adjustments cannot be counted twice", () => {
 assert.deepEqual(presentReconciledPeriod({ ...period, adjustments: [...period.adjustments, period.adjustments[0]] }), { status: "unavailable", reason: "duplicate_adjustment" });
});
test("currency mismatch and missing approval rejected", () => {
 assert.deepEqual(presentReconciledPeriod({ ...period, adjustments: [{ ...period.adjustments[0], currency: "EUR" }] }), { status: "unavailable", reason: "currency_mismatch" });
 assert.deepEqual(presentReconciledPeriod({ ...period, adjustments: [{ ...period.adjustments[0], approvalId: "" }] }), { status: "unavailable", reason: "invalid_amount" });
});
test("negative reconciled margin is not silently clipped", () => {
 const result = presentReconciledPeriod({ ...period, operationalProfitCents: -500, statementProfitCents: -600 });
 assert.equal(result.status, "reconciled");
 if (result.status === "reconciled") assert.equal(result.profitCents, -600);
});
