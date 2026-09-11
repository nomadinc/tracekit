import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(process.cwd());
const route = fs.readFileSync(path.join(root, "app/api/next29/webhook-characterize/[connectionId]/route.ts"), "utf8");

test("29Next M13 characterization endpoint is non-production diagnostic only", () => {
  assert.match(route, /TRACEKIT_NEXT29_WEBHOOK_CHARACTERIZATION_ENV/);
  assert.match(route, /preview/);
  assert.match(route, /staging/);
  assert.match(route, /process\.env\.VERCEL_ENV/);
  assert.match(route, /vercelEnvironment === "production"/);
  assert.match(route, /characterizeNext29WebhookSignature/);
  assert.match(route, /x-29next-signature/);
  assert.match(route, /request\.arrayBuffer\(\)/);
  assert.match(route, /MAX_BODY_BYTES = 256_000/);
});

test("29Next M13 characterization does not activate webhook processing", () => {
  assert.doesNotMatch(route, /handleNext29Webhook/);
  assert.doesNotMatch(route, /reserveWebhook/);
  assert.doesNotMatch(route, /commerce_webhook_receipts/);
  assert.doesNotMatch(route, /enable.*schedule/i);
  assert.match(route, /Diagnostic-only endpoint/);
});

test("29Next M13 characterization returns proof only", () => {
  assert.match(route, /TRACEKIT_NEXT29_WEBHOOK_SIGNING_SECRET/);
  assert.match(route, /verified: true, serialization: proof\.serialization, requestId/);
  assert.doesNotMatch(route, /payload:\s*raw/);
  assert.doesNotMatch(route, /signingSecret:\s*signingSecret/);
});
