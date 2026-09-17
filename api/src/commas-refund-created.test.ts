import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCommasRefundCreated, refundCreatedFinancialDecision, pendingCommasRefundSettlementReadContract } from "./commas-refund-created.ts";

const event = (overrides: Record<string, unknown> = {}) => ({
  id: "evt_refund_1", type: "refund.created", created_at: "2026-09-15T06:00:00Z",
  data: {
    refund_id: "refund_hashid", original_payment_id: "ORD-ABC-123", refund_transaction_id: "txn_hashid",
    amount: 100, refund_cost: 82, refund_cost_creator_amount: 80, refund_cost_affiliate_commission: 15,
    status: "success", refund_type: "partial", created_at: "2026-09-15T06:00:00Z", updated_at: "2026-09-15T06:00:00Z",
    processor: { processor_refund_cost_fee: 2, processor_refund_id: "processor-refund", processor_charge_id: "processor-charge" },
    ...overrides,
  },
});

test("normalizes success using ORD identity and provider refund_cost", () => {
  const row = normalizeCommasRefundCreated(event()); assert.ok(row);
  assert.equal(row.paymentIdentityState, "ord"); assert.equal(row.currency, "USD"); assert.equal(row.providerRefundCost, 82);
  assert.equal(row.creatorAmount, 80); assert.equal(row.processorFee, 2); assert.equal(row.affiliateCommissionClawback, 15);
  assert.deepEqual(refundCreatedFinancialDecision(row), { state: "realized", postEconomics: true, amount: -82, currency: "USD" });
});

test("pending persists provisionally and never posts economics", () => {
  const row = normalizeCommasRefundCreated(event({ status: "pending", refund_cost: 0, refund_cost_creator_amount: 0, processor: { processor_refund_cost_fee: 0 } })); assert.ok(row);
  assert.equal(refundCreatedFinancialDecision(row).state, "provider_settlement_unobservable");
  assert.equal(refundCreatedFinancialDecision(row).postEconomics, false);
  assert.deepEqual(pendingCommasRefundSettlementReadContract(), { supported: false, reason: "unsupported_pending_settlement_read" });
});

test("failed refund never posts economics", () => {
  const row = normalizeCommasRefundCreated(event({ status: "failed", refund_cost: 0, refund_cost_creator_amount: 0, processor: { processor_refund_cost_fee: 0 } })); assert.ok(row);
  assert.equal(refundCreatedFinancialDecision(row).postEconomics, false);
});

test("legacy original_payment_id remains unresolved rather than treated as ORD", () => {
  const row = normalizeCommasRefundCreated(event({ original_payment_id: "legacyHashId" })); assert.ok(row); assert.equal(row.paymentIdentityState, "legacy_hashid");
});

test("rejects non-conserving seller components", () => {
  assert.equal(normalizeCommasRefundCreated(event({ refund_cost: 90 })), null);
});

test("affiliate clawback does not change seller economics", () => {
  const a = normalizeCommasRefundCreated(event({ refund_cost_affiliate_commission: 1 }));
  const b = normalizeCommasRefundCreated(event({ refund_cost_affiliate_commission: 99 }));
  assert.ok(a && b); assert.equal(refundCreatedFinancialDecision(a).amount, refundCreatedFinancialDecision(b).amount);
});
