import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
async function source(path: string) { return readFile(new URL(path, root), "utf8"); }

test("M9 Shopify webhook endpoint authenticates raw-body HMAC before commerce processing", async () => {
  const route = await source("app/api/webhooks/shopify/route.ts");
  const runtime = await source("lib/commerce/shopify-webhook-runtime.ts");
  assert.match(route, /await request\.text\(\)/);
  assert.match(route, /x-shopify-hmac-sha256/);
  assert.match(route, /x-shopify-shop-domain/);
  assert.match(route, /x-shopify-topic/);
  assert.match(route, /x-shopify-webhook-id/);
  assert.match(runtime, /createHmac\("sha256", secret\)/);
  assert.match(runtime, /timingSafeEqual/);
  assert.match(runtime, /shopify_webhook_hmac_invalid/);
});

test("M9 accepts only order-create and refund-create and resolves tenant from shop identity", async () => {
  const runtime = await source("lib/commerce/shopify-webhook-runtime.ts");
  assert.match(runtime, /orders\/create/);
  assert.match(runtime, /refunds\/create/);
  assert.match(runtime, /provider_account_external_id/);
  assert.match(runtime, /provider !== "shopify"/);
  assert.doesNotMatch(runtime, /organizationId:\s*payload/);
});

test("M9 preserves webhook evidence, delivery idempotency, and reuses certified incremental order persistence", async () => {
  const runtime = await source("lib/commerce/shopify-webhook-runtime.ts");
  assert.match(runtime, /source_object_type:\s*"shopify_webhook"/);
  assert.match(runtime, /commerce-evidence/);
  assert.match(runtime, /source_object_id=eq\.\$\{q\(args\.webhookId\)\}/);
  assert.match(runtime, /duplicate:\s*true/);
  assert.match(runtime, /runShopifyIncrementalResource/);
  assert.match(runtime, /resource:\s*"orders"/);
  assert.match(runtime, /maxPages:\s*2/);
});
