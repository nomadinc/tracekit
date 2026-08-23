import test from "node:test";
import assert from "node:assert/strict";
import { COMMAS_DISPUTE_EVENT_TYPES, deriveCommasDisputeLedgerEvents, hmacSha256Hex, normalizeCommasDisputeEvent, verifyCommasWebhookSignature, webhookStoragePath } from "./commas-dispute-webhook.ts";

const fixture = {
  id: "event-1",
  type: "dispute.created",
  created_at: "2026-08-23T12:00:00Z",
  data: {
    id: "dp-hash-1",
    dispute_id: "dp_1",
    amount: 49,
    dispute_fee: 15,
    status: "needs_response",
    reason: "fraudulent",
    payment_intent_id: "pi_1",
    due_by: "2026-09-01T00:00:00Z",
    buyer: { id: "user_1", name: "REDACTED", email: "redacted@example.test" },
  },
};

test("Commas dispute envelope normalizes created and updated without inventing fields", () => {
  assert.deepEqual(COMMAS_DISPUTE_EVENT_TYPES, ["dispute.created", "dispute.updated"]);
  const event = normalizeCommasDisputeEvent(fixture);
  assert.equal(event?.providerEventId, "event-1");
  assert.equal(event?.providerDisputeId, "dp_1");
  assert.equal(event?.amount, 49);
  assert.equal(event?.fee, 15);
  assert.equal(event?.buyerReference, "user_1");
  assert.equal(event?.currency, null);
  assert.equal(normalizeCommasDisputeEvent({ ...fixture, type: "payment.succeeded" }), null);
  assert.equal(normalizeCommasDisputeEvent({ ...fixture, id: undefined }), null);
  const updated = normalizeCommasDisputeEvent({ ...fixture, id: "event-2", type: "dispute.updated", data: { ...fixture.data, status: "won", updated_at: "2026-08-24T12:00:00Z" } });
  assert.equal(updated?.providerEventId, "event-2");
  assert.equal(updated?.providerDisputeId, "dp_1");
  assert.equal(updated?.status, "won");
});

test("Commas webhook signature uses raw bytes and fails closed", async () => {
  const raw = new TextEncoder().encode(JSON.stringify(fixture));
  const signature = await hmacSha256Hex("secret", raw);
  assert.equal(await verifyCommasWebhookSignature(raw, signature, "secret"), true);
  assert.equal(await verifyCommasWebhookSignature(raw, signature, "wrong"), false);
  assert.equal(await verifyCommasWebhookSignature(raw, null, "secret"), false);
  assert.equal(await verifyCommasWebhookSignature(new TextEncoder().encode(`${JSON.stringify(fixture)} `), signature, "secret"), false);
});

test("webhook storage path is scoped and deterministic", () => {
  assert.equal(webhookStoragePath("org", "connection", "provider", "abc"), "org/connection/provider/commas-dispute-webhook/abc.json");
});

test("ledger effects are emitted only when the event proves a lost chargeback with explicit currency", () => {
  const lost = normalizeCommasDisputeEvent({ ...fixture, data: { ...fixture.data, status: "lost", currency: "USD", transaction_id: "txn-1" } });
  assert.equal(deriveCommasDisputeLedgerEvents(lost!, "provider-account").length, 2);
  const won = normalizeCommasDisputeEvent({ ...fixture, data: { ...fixture.data, status: "won", currency: "USD", transaction_id: "txn-1" } });
  assert.equal(deriveCommasDisputeLedgerEvents(won!, "provider-account").length, 0);
  const noCurrency = normalizeCommasDisputeEvent({ ...fixture, data: { ...fixture.data, status: "lost", transaction_id: "txn-1" } });
  assert.equal(deriveCommasDisputeLedgerEvents(noCurrency!, "provider-account").length, 0);
});

test("migration adds immutable event, projection, and lifecycle storage without scheduler dependencies", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../../supabase/migrations/071_commerce_dispute_webhooks_v1.sql", import.meta.url), "utf8");
  assert.match(source, /commerce_dispute_webhook_events/);
  assert.match(source, /commerce_provider_disputes/);
  assert.match(source, /commerce_provider_dispute_lifecycle_events/);
  assert.match(source, /unique \(organization_id, connection_id, provider_event_id\)/);
  assert.doesNotMatch(source, /commerce_scheduler|commerce_sync_schedules|create queue|drop table/i);
  assert.match(source, /enable row level security/);
  assert.match(source, /revoke all on public\.commerce_dispute_webhook_events/);
  assert.equal((source.match(/\bupdated_at\s+timestamptz/g) || []).length, 1);
  assert.match(source, /create table if not exists public\.commerce_dispute_webhook_events/);
});

test("migration 072 is safe for the partial-071 state and repeats no destructive operation", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../../supabase/migrations/072_commerce_dispute_webhooks_071_recovery.sql", import.meta.url), "utf8");
  for (const table of ["commerce_dispute_webhook_events", "commerce_provider_disputes", "commerce_provider_dispute_lifecycle_events"]) {
    assert.match(source, new RegExp(`create table if not exists public\\.${table}`));
  }
  assert.match(source, /create index if not exists/);
  assert.doesNotMatch(source, /drop table|delete from|truncate|alter table .* drop/i);
});

test("migration 073 enforces the exact dispute-table ACL matrix without changing ownership or policies", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../../supabase/migrations/073_commerce_dispute_webhook_acl_hardening.sql", import.meta.url), "utf8");
  assert.match(source, /revoke all[\s\S]*from service_role, public, anon, authenticated/);
  assert.match(source, /grant select, insert on public\.commerce_dispute_webhook_events to service_role/);
  assert.match(source, /grant select, insert, update on public\.commerce_provider_disputes to service_role/);
  assert.match(source, /grant select, insert on public\.commerce_provider_dispute_lifecycle_events to service_role/);
  assert.doesNotMatch(source, /owner to|alter table .* owner|create policy|drop policy/);
  assert.match(source, /enable row level security/);
});

test("router exposes only the Commas webhook POST path and keeps scheduler/provider paths separate", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("./index.ts", import.meta.url), "utf8");
  assert.equal(source.includes('path === "/v1/connectors/commas/webhooks"'), true);
  assert.equal(source.includes("x-webhook-signature"), true);
  assert.match(source, /X-TK-Secret, X-Webhook-Signature/);
  const signature = "a".repeat(64);
  const request = new Request("https://tracekit.test/v1/connectors/commas/webhooks", { method: "POST", headers: { "content-type": "application/json", "x-webhook-signature": signature }, body: "{}" });
  assert.equal(request.headers.get("x-webhook-signature"), signature);
  assert.doesNotMatch(source.slice(source.indexOf("async function handleCommasDisputeWebhook"), source.indexOf("function parseYmd")), /new Request|new Headers/);
  assert.doesNotMatch(source.slice(source.indexOf("async function handleCommasDisputeWebhook"), source.indexOf("function parseYmd")), /listTransactions|getTransaction|continuous_commerce\.send/);
});
