import assert from "node:assert/strict";
import test from "node:test";
import { next29DisputeLifecycleFingerprint, next29DisputeReconciliationKeys, normalizeNext29Dispute } from "./connectors/next29/dispute.ts";
import { next29ChargebackLedgerProjection } from "./connectors/next29/dispute-repository.ts";

function dispute(overrides: Record<string, unknown> = {}) {
  return { id: 77, type: "chargeback", status: "open", amount: "67.00", currency: "usd", report_amount: "67.00", report_currency: "usd", arn: "arn-1", case_number: "case-1", date_created: "2026-08-01T00:00:00Z", happened_at: "2026-08-02T00:00:00Z", order: "1001", transaction: 5001, resolution: "accepted", metadata: { source: "provider" }, ...overrides };
}

test("29Next dispute normalization preserves documented identifiers lifecycle and money", () => {
  const value = normalizeNext29Dispute(dispute());
  assert.equal(value.providerDisputeId, "77");
  assert.equal(value.type, "chargeback");
  assert.equal(value.status, "open");
  assert.equal(value.amount, 67);
  assert.equal(value.currency, "USD");
  assert.equal(value.providerOrderId, "1001");
  assert.equal(value.providerTransactionId, "5001");
  assert.equal(value.resolution, "accepted");
  assert.equal(value.happenedAt, "2026-08-02T00:00:00.000Z");
});

test("29Next dispute reconciliation uses direct transaction then order identifiers without heuristics", () => {
  const keys = next29DisputeReconciliationKeys(normalizeNext29Dispute(dispute()));
  assert.equal(keys.directTransactionKey, "next29:transaction:5001");
  assert.equal(keys.directOrderKey, "next29:order:1001");
});

test("29Next dispute lifecycle fingerprint changes when lifecycle resolution changes", () => {
  const open = normalizeNext29Dispute(dispute({ resolution: null }));
  const resolved = normalizeNext29Dispute(dispute({ status: "resolved", resolution: "won" }));
  assert.notEqual(next29DisputeLifecycleFingerprint(open), next29DisputeLifecycleFingerprint(resolved));
});

test("29Next financial projection is deterministic and does not project alert lifecycle as chargeback money", () => {
  const chargeback = next29ChargebackLedgerProjection(normalizeNext29Dispute(dispute()));
  assert.equal(chargeback?.amount, -67);
  assert.equal(chargeback?.source_event_id, "next29:dispute:77:chargeback");
  assert.equal(next29ChargebackLedgerProjection(normalizeNext29Dispute(dispute({ type: "alert" }))), null);
});
