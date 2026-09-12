import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(process.cwd());
const route = fs.readFileSync(path.join(root, "app/api/next29/webhook-canary/[connectionId]/route.ts"), "utf8");
const helper = fs.readFileSync(path.join(root, "lib/commerce/next29-webhook-canary.ts"), "utf8");
const middleware = fs.readFileSync(path.join(root, "middleware.ts"), "utf8");

test("29Next M13 webhook canary is raw-byte signed and non-production gated", () => {
  assert.match(route, /runtime = "nodejs"/);
  assert.match(route, /TRACEKIT_NEXT29_WEBHOOK_CANARY_ENV/);
  assert.match(route, /VERCEL_ENV/);
  assert.match(route, /request\.arrayBuffer\(\)/);
  assert.match(route, /x-29next-signature/);
  assert.match(route, /MAX_BODY_BYTES = 256_000/);
  assert.match(helper, /verifyNext29WebhookSignature/);
  assert.match(helper, /handleNext29Webhook/);
  assert.match(helper, /parseNext29Webhook/);
});

test("29Next M13 webhook canary accepts only order.created and refreshes current order", () => {
  assert.match(helper, /envelope\.event_type !== "order\.created"/);
  assert.match(helper, /envelope\.object !== "order"/);
  assert.match(helper, /context\.client\.getOrder\(number/);
  assert.match(helper, /normalizeNext29Order\(detail\.item\)/);
  assert.match(helper, /persistNext29Evidence/);
  assert.match(helper, /createNext29HistoricalPersistence/);
});

test("29Next M13 webhook canary persists idempotent receipt and keeps schedules disabled", () => {
  assert.match(helper, /createNext29WebhookIdempotency/);
  assert.match(helper, /commerce_webhook_receipts/);
  assert.match(helper, /status: "completed"/);
  assert.match(helper, /status: "failed"/);
  assert.match(helper, /commerce_sync_schedules/);
  assert.match(helper, /enabled=eq\.true/);
  assert.doesNotMatch(helper, /enabled:\s*true/);
});

test("only explicit M13 webhook paths bypass WorkOS and secrets are not returned", () => {
  assert.match(middleware, /\/api\/next29\/webhook-characterize\/:path\*/);
  assert.match(middleware, /\/api\/next29\/webhook-canary\/:path\*/);
  assert.doesNotMatch(middleware, /\/api\/next29\/:path\*/);
  assert.doesNotMatch(route, /signingSecret:\s*signingSecret/);
  assert.doesNotMatch(route, /rawBody:\s*rawBody/);
});
