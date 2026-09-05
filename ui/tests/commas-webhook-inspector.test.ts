import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { exactTargetMatch, sanitizeWebhookUrl, summarizeWebhookSubscription } from "../lib/commerce/commas-webhook-inspector.ts";

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

test("webhook URL sanitizer preserves routing identity without query secrets or fragments", () => {
  const sanitized = sanitizeWebhookUrl("https://relay.trace-kit.io/provider/path?token=super-secret&campaign=private-value&api_key=also-secret#fragment-secret");
  assert.equal(sanitized.startsWith("https://relay.trace-kit.io/provider/path?"), true);
  assert.equal(sanitized.includes("campaign=%5Bredacted%5D"), true);
  assert.equal(sanitized.includes("%5Bredacted-key%5D=%5Bredacted%5D"), true);
  for (const secret of ["token", "api_key", "super-secret", "private-value", "also-secret", "fragment-secret"]) {
    assert.equal(sanitized.includes(secret), false);
  }
  assert.equal(sanitizeWebhookUrl(target), target);
  assert.equal(sanitizeWebhookUrl("not a URL"), "[invalid-url]");
});

test("subscription identity remains visible after endpoint sanitization without secret disclosure", () => {
  const summary = summarizeWebhookSubscription({
    id: 24848,
    webhook_url: `${target}?signature=hidden#secret-fragment`,
    event_types: ["dispute.created", "dispute.updated"],
    is_active: true,
    secret_key: "never-visible",
  });
  assert.equal(summary.id, "24848");
  assert.equal(summary.active, true);
  assert.deepEqual(summary.eventTypes, ["dispute.created", "dispute.updated"]);
  assert.equal(summary.webhookUrl.startsWith(target), true);
  assert.equal(JSON.stringify(summary).includes("hidden"), false);
  assert.equal(JSON.stringify(summary).includes("never-visible"), false);
  assert.equal(JSON.stringify(summary).includes("fragment"), false);
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
