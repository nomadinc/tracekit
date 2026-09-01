import assert from "node:assert/strict";
import test from "node:test";
import { createNext29WebhookIdempotency, next29WebhookReceiptInsert } from "./connectors/next29/webhook-repository.ts";

const scope = { organizationId: "org", connectionId: "conn", providerAccountId: "acct" };

test("29Next webhook receipt adapter preserves tenant scope and provider event identity", async () => {
  const calls: any[] = [];
  const store = createNext29WebhookIdempotency({
    async reserveReceipt(input) { calls.push(["reserve", input]); return { accepted: true }; },
    async completeReceipt(input) { calls.push(["complete", input]); },
    async failReceipt(input) { calls.push(["fail", input]); },
  });
  assert.deepEqual(await store.reserve({ ...scope, eventId: "evt-1", eventType: "order.created", apiVersion: "2024-04-01" }), { accepted: true });
  await store.complete({ ...scope, eventId: "evt-1" });
  await store.fail({ ...scope, eventId: "evt-2", error: "Bearer secret-token should-not-leak" });
  assert.equal(calls[0][1].provider, "next29");
  assert.equal(calls[0][1].providerEventId, "evt-1");
  assert.equal(calls[1][1].providerEventId, "evt-1");
  assert.equal(calls[2][1].error.includes("secret-token"), false);
});

test("29Next webhook receipt row is server-scoped and deterministic by provider event id", () => {
  const row = next29WebhookReceiptInsert({ ...scope, eventId: "evt-1", eventType: "subscription.updated", apiVersion: "2024-04-01" });
  assert.equal(row.organization_id, "org");
  assert.equal(row.connection_id, "conn");
  assert.equal(row.provider_account_id, "acct");
  assert.equal(row.provider, "next29");
  assert.equal(row.provider_event_id, "evt-1");
  assert.equal(row.status, "reserved");
});
