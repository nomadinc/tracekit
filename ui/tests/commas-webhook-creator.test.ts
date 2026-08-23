import assert from "node:assert/strict";
import test from "node:test";
import { createCommasDisputeWebhook } from "../lib/commerce/commas-webhook-creator.ts";

const target = "https://webhooks.trace-kit.io/v1/connectors/commas/webhooks";

test("existing exact subscription prevents creation and secret update", async () => {
  let creates = 0;
  let updates = 0;
  const result = await createCommasDisputeWebhook(true, {
    listSubscriptions: async () => [{ id: "8", webhookUrl: target, eventTypes: ["dispute.created"], active: true }],
    createSubscription: async () => { creates += 1; return { id: "new", webhookUrl: target, eventTypes: [], secretKey: "never" }; },
    updateCloudflareSecret: async () => { updates += 1; return true; },
  });
  assert.equal(result.created, false);
  assert.equal(creates, 0);
  assert.equal(updates, 0);
});

test("successful creation updates Cloudflare exactly once and returns no secret", async () => {
  let receivedBody: unknown;
  const secrets: string[] = [];
  const result = await createCommasDisputeWebhook(true, {
    listSubscriptions: async () => [],
    createSubscription: async (body) => { receivedBody = body; return { id: "9", webhookUrl: target, eventTypes: ["dispute.created", "dispute.updated"], secretKey: "secret-never-printed" }; },
    updateCloudflareSecret: async (secret) => { secrets.push(secret); return true; },
  });
  assert.deepEqual(receivedBody, { webhook_url: target, event_types: ["dispute.created", "dispute.updated"] });
  assert.deepEqual(secrets, ["secret-never-printed"]);
  assert.equal(result.cloudflareSecretUpdated, true);
  assert.equal("secretKey" in result, false);
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("missing returned secret fails closed before Cloudflare update", async () => {
  let updates = 0;
  await assert.rejects(() => createCommasDisputeWebhook(true, {
    listSubscriptions: async () => [],
    createSubscription: async () => ({ id: "10", webhookUrl: target, eventTypes: [] }),
    updateCloudflareSecret: async () => { updates += 1; return true; },
  }), /without a returned secret_key/);
  assert.equal(updates, 0);
});

test("confirmation is mandatory", async () => {
  await assert.rejects(() => createCommasDisputeWebhook(false, {
    listSubscriptions: async () => [],
    createSubscription: async () => ({ id: "x", webhookUrl: target, eventTypes: [], secretKey: "x" }),
    updateCloudflareSecret: async () => true,
  }), /confirm-create-commas-dispute-webhook/);
});
