import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(process.cwd());
const route = fs.readFileSync(path.join(root, "app/api/next29/webhook/[connectionId]/route.ts"), "utf8");
const resolver = fs.readFileSync(path.join(root, "lib/commerce/next29-webhook-signing-secret.ts"), "utf8");
const helper = fs.readFileSync(path.join(root, "lib/commerce/next29-webhook-canary.ts"), "utf8");
const middleware = fs.readFileSync(path.join(root, "middleware.ts"), "utf8");

test("29Next M14 permanent webhook route is inert, raw-byte signed, and bounded", () => {
  assert.match(route, /runtime = "nodejs"/);
  assert.match(route, /TRACEKIT_NEXT29_WEBHOOK_RUNTIME_ENV/);
  assert.match(route, /configured !== "staging"/);
  assert.match(route, /VERCEL_ENV/);
  assert.match(route, /vercelEnvironment === "production"/);
  assert.match(route, /request\.arrayBuffer\(\)/);
  assert.match(route, /x-29next-signature/);
  assert.match(route, /MAX_BODY_BYTES = 256_000/);
  assert.match(route, /cache-control/);
});

test("29Next M14 signing secret is behind a server-only connection-scoped resolver", () => {
  assert.match(resolver, /import "server-only"/);
  assert.match(resolver, /resolveNext29WebhookSigningSecret/);
  assert.match(resolver, /resolveTypedCommerceCredential/);
  assert.match(resolver, /credentialType: "webhook_signing_secret"/);
  assert.match(resolver, /M14\.1B/);
  assert.doesNotMatch(resolver, /TRACEKIT_NEXT29_WEBHOOK_SIGNING_SECRET/);
  assert.doesNotMatch(route, /process\.env\.TRACEKIT_NEXT29_WEBHOOK_SIGNING_SECRET/);
});

test("29Next M14 route reuses proven order.created processing without broadening event coverage", () => {
  assert.match(route, /runNext29WebhookCanary/);
  assert.match(helper, /envelope\.event_type !== "order\.created"/);
  assert.match(helper, /envelope\.object !== "order"/);
  assert.match(helper, /status === "failed"/);
  assert.match(helper, /status: "reserved"/);
  assert.match(helper, /status: "completed"/);
  assert.match(helper, /commerce_sync_schedules/);
  assert.doesNotMatch(route, /order\.updated|transaction\.created|subscription\.created|dispute\.created|refund\.created/);
});

test("only the exact permanent 29Next webhook path is added to WorkOS bypass", () => {
  assert.match(middleware, /\/api\/next29\/webhook\/:path\*/);
  assert.doesNotMatch(middleware, /\/api\/next29\/webhook-canary\/:path\*/);
  assert.doesNotMatch(middleware, /\/api\/next29\/webhook-characterize\/:path\*/);
  assert.doesNotMatch(middleware, /"\/api\/next29\/:path\*"/);
});

test("29Next M14 runtime logging is bounded and response does not expose secret material", () => {
  assert.match(route, /next29_webhook_runtime/);
  assert.match(route, /next29_webhook_runtime_failed/);
  assert.match(route, /durationMs/);
  assert.doesNotMatch(route, /console\.(?:info|error)[\s\S]*signature,/);
  assert.doesNotMatch(route, /console\.(?:info|error)[\s\S]*rawBody,/);
  assert.doesNotMatch(route, /NextResponse\.json\([^\n]*signingSecret/);
});
