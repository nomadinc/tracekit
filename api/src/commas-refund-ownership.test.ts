import test from "node:test";
import assert from "node:assert/strict";
import { commasRefundEconomicOwner, crossSurfaceRefundIdEqualitySupported } from "./commas-refund-ownership.ts";

const epoch = "2026-09-15T12:00:00Z";

test("before activation transaction pages retain economic ownership", () => {
  assert.equal(commasRefundEconomicOwner({ source: "transaction_page", refundCreatedAt: "2026-09-15T13:00:00Z", forwardActivatedAt: null }).owned, true);
  assert.equal(commasRefundEconomicOwner({ source: "refund_created", refundCreatedAt: "2026-09-15T13:00:00Z", forwardActivatedAt: null }).owned, false);
});

test("at and after activation refund.created exclusively owns economics", () => {
  assert.deepEqual(commasRefundEconomicOwner({ source: "refund_created", refundCreatedAt: epoch, forwardActivatedAt: epoch }), { owned: true, reason: "forward_webhook_authority" });
  assert.deepEqual(commasRefundEconomicOwner({ source: "transaction_page", refundCreatedAt: "2026-09-15T12:00:01Z", forwardActivatedAt: epoch }), { owned: false, reason: "forward_transaction_reconciliation_only" });
});

test("pre-epoch historical refunds remain transaction-page economic authority", () => {
  assert.equal(commasRefundEconomicOwner({ source: "transaction_page", refundCreatedAt: "2026-09-15T11:59:59Z", forwardActivatedAt: epoch }).owned, true);
  assert.equal(commasRefundEconomicOwner({ source: "refund_created", refundCreatedAt: "2026-09-15T11:59:59Z", forwardActivatedAt: epoch }).owned, false);
});

test("invalid timestamps fail closed", () => {
  assert.equal(commasRefundEconomicOwner({ source: "refund_created", refundCreatedAt: "bad", forwardActivatedAt: epoch }).owned, false);
  assert.equal(commasRefundEconomicOwner({ source: "refund_created", refundCreatedAt: epoch, forwardActivatedAt: "bad" }).owned, false);
});

test("provider cross-surface refund IDs are never compared for equality", () => {
  assert.equal(crossSurfaceRefundIdEqualitySupported(), false);
});
