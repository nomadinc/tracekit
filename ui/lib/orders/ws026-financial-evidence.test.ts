import assert from "node:assert/strict";
import test from "node:test";
import { assessOrderFinancialEvidence, type OrderFinancialEvidence } from "./ws026-financial-evidence.ts";
const base: OrderFinancialEvidence = { currency: "USD", grossRevenue: { amount: "49.99", evidenceId: "sale" },
 refunds: [], affiliateCommission: { amount: "8.00", evidenceId: "commission" },
 landedCogs: { amount: "9.02", evidenceId: "landed", appliedVersionId: "cost-v1", includesShipping: true },
 processingFees: { amount: "1.50", evidenceId: "fee", actual: true },
 reconciliation: null, sourceCurrent: true };
test("complete component evidence alone does not claim operational profit", () => {
 const r = assessOrderFinancialEvidence(base);
 assert.equal(r.status, "reconciliation_pending");
 assert.equal(r.operationalProfitDisplay, null);
});
test("missing landed COGS cannot be treated as zero", () => {
 const r = assessOrderFinancialEvidence({ ...base, landedCogs: null });
 assert.equal(r.status, "incomplete");
 assert.ok(r.missing.includes("historical_landed_cogs"));
});
test("estimated processing fees are not actual fees", () => {
 const r = assessOrderFinancialEvidence({ ...base, processingFees: { ...base.processingFees!, actual: false } });
 assert.ok(r.missing.includes("actual_processing_fees"));
});
test("shipping treatment remains explicit", () => {
 const r = assessOrderFinancialEvidence({ ...base, landedCogs: { ...base.landedCogs!, includesShipping: false } });
 assert.ok(r.missing.includes("shipping_cost_treatment"));
});
test("unknown currency and stale source remain incomplete", () => {
 const r = assessOrderFinancialEvidence({ ...base, currency: null, sourceCurrent: false });
 assert.ok(r.missing.includes("source_currency"));
 assert.ok(r.missing.includes("stale_financial_source"));
});
test("closed reconciliation flag alone never authorizes profit", () => {
 const r = assessOrderFinancialEvidence({ ...base, reconciliation: { status: "closed", accepted: true, statementEvidenceId: "statement" } });
 assert.equal(r.reconciledProfitDisplay, null);
});
