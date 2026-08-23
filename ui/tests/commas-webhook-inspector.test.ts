import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { exactTargetMatch, summarizeWebhookSubscription } from "../lib/commerce/commas-webhook-inspector.ts";

const target = "https://webhooks.trace-kit.io/v1/connectors/commas/webhooks";

test("webhook inspector emits only safe subscription fields", () => {
  const summary = summarizeWebhookSubscription({
    id: 42,
    webhook_url: target,
    event_types: ["dispute.created", "dispute.updated", 7],
    is_active: true,
    secret_key: "must-not-be-returned",
    request_id: "must-not-be-returned",
  });
  assert.deepEqual(summary, { id: "42", webhookUrl: target, eventTypes: ["dispute.created", "dispute.updated"], active: true });
  assert.equal(JSON.stringify(summary).includes("secret"), false);
});

test("exact target matching is URL-exact and does not create/update/delete", async () => {
  const subscriptions = [summarizeWebhookSubscription({ id: "1", webhook_url: target, event_types: ["dispute.created", "dispute.updated"] })];
  assert.equal(exactTargetMatch(subscriptions, target), true);
  assert.equal(exactTargetMatch(subscriptions, `${target}/`), false);
  const source = await readFile(new URL("../scripts/inspect-commas-webhooks.ts", import.meta.url), "utf8");
  assert.match(source, /GET|webhook-subscriptions/);
  assert.doesNotMatch(source, /method:\s*["'](?:POST|PATCH|DELETE)["']/);
  assert.doesNotMatch(source, /secret_key/);
});
