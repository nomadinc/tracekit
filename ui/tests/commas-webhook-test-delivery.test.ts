import assert from "node:assert/strict";
import test from "node:test";
import { sendCommasWebhookTestDelivery } from "../lib/commerce/commas-webhook-test-delivery.ts";

test("test delivery uses the exact endpoint, API-key header, and event body", async () => {
  let request: { url: string; init: RequestInit } | null = null;
  const summary = await sendCommasWebhookTestDelivery({
    apiKey: "api-key-not-output",
    subscriptionId: "24848",
    eventType: "dispute.created",
    baseUrl: "https://commas.test",
    fetchImpl: async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify({ status: "success", message: "sent", data: { event_sent: true, response_status: 200, secret_key: "must-not-escape" } }), { status: 200 });
    },
  });
  assert.equal(request?.url, "https://commas.test/public-api/webhook-subscriptions/24848/test");
  assert.equal((request?.init.headers as Record<string, string>)["x-api-key"], "api-key-not-output");
  assert.deepEqual(JSON.parse(String(request?.init.body)), { event_type: "dispute.created" });
  assert.deepEqual(summary, { httpStatus: 200, apiStatus: "success", message: "sent", eventSent: true, responseStatus: 200 });
  assert.equal(JSON.stringify(summary).includes("secret"), false);
});

test("unsupported events and missing IDs are rejected before fetch", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return new Response("{}", { status: 200 }); };
  await assert.rejects(() => sendCommasWebhookTestDelivery({ apiKey: "x", subscriptionId: "24848", eventType: "payment.succeeded", fetchImpl }), /configured Commas webhook event/);
  await assert.rejects(() => sendCommasWebhookTestDelivery({ apiKey: "x", subscriptionId: "", eventType: "dispute.created", fetchImpl }), /subscription ID/);
  assert.equal(calls, 0);
});
