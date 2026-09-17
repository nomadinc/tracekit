import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../supabase/migrations/20260917010000_commas_refund_transaction_epoch_guard.sql", import.meta.url), "utf8");
const gate = readFileSync(new URL("../../supabase/migrations/20260917010100_commas_refund_created_financial_gate.sql", import.meta.url), "utf8");

test("verified refund dispatch precedes attribution and dispute dispatch", () => {
  const verify = worker.indexOf("verifyCommasWebhookSignatureAgainstSecrets(raw, suppliedSignature");
  const refund = worker.indexOf('if (attributionEventType === "refund.created")');
  const attribution = worker.indexOf("if(COMMAS_ATTRIBUTION_EVENT_TYPES.includes(attributionEventType");
  const dispute = worker.indexOf("const normalized = normalizeCommasDisputeEvent(payload);", attribution);
  assert.ok(verify > 0 && verify < refund && refund < attribution && attribution < dispute);
});

test("refund handler persists restricted Evidence before normalizing and cannot mutate attribution", () => {
  const handler = worker.slice(worker.indexOf("async function handleCommasRefundCreatedWebhookPayload"), worker.indexOf("async function handleCommasAttributionWebhookPayload"));
  assert.ok(handler.indexOf('source_object_type: "commas_refund_created_webhook"') < handler.indexOf("normalizeCommasRefundCreated(payload)"));
  assert.match(handler, /pii_classification: "restricted"/);
  assert.match(handler, /provider_settlement_unobservable/);
  assert.match(handler, /failed_no_economics/);
  assert.match(handler, /eligible_not_yet_enabled/);
  assert.doesNotMatch(handler, /attribution_credit|attribution_webhook|handleCommasDispute/);
});

test("database guards transaction-page economics and posts one seller-cost refund only after epoch", () => {
  assert.match(migration, /if public\.commas_refund_transaction_page_economic_owner_v1\(/);
  assert.match(gate, /o\.status<>'success'/);
  assert.match(gate, /o\.order_match_state<>'exact_ord'/);
  assert.match(gate, /v_epoch is null or o\.provider_created_at<v_epoch/);
  assert.match(gate, /-abs\(o\.seller_refund_cost\),'USD','refund'/);
  assert.match(gate, /on conflict\(organization_id,connection_id,provider_account_id,idempotency_key\)/);
  assert.doesNotMatch(gate, /refund_fee|affiliate_clawback/);
});
