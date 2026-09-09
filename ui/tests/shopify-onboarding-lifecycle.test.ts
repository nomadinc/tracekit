import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
async function source(path: string) { return readFile(new URL(path, root), "utf8"); }

test("M8 scheduler prioritizes live sync and advances bounded historical backfill", async () => {
  const worker = await source("lib/commerce/shopify-scheduled-worker.ts");
  assert.match(worker, /runShopifyIncrementalResource/);
  assert.match(worker, /runShopifyHistoricalResource/);
  assert.match(worker, /maxPages:\s*1/);
  assert.match(worker, /BACKFILL_PAGE_SIZE\s*=\s*50/);
  assert.match(worker, /Backfill failure must never stop fresh orders\/refunds/);
  assert.match(worker, /shopify_onboarding_backfill_failed/);
});

test("Shopify orders stay below the Admin GraphQL single-query cost ceiling", async () => {
  const worker = await source("lib/commerce/shopify-scheduled-worker.ts");
  assert.match(worker, /ORDER_PAGE_SIZE\s*=\s*25/);
  assert.match(worker, /pageSizeForResource\(schedule\.resource, LIVE_PAGE_SIZE\)/);
  assert.match(worker, /pageSizeForResource\(schedule\.resource, BACKFILL_PAGE_SIZE\)/);
  assert.match(worker, /resource === "orders" \? ORDER_PAGE_SIZE : defaultSize/);
});

test("M8 customer connection page replaces manual Shopify test controls with lifecycle status", async () => {
  const page = await source("app/(app)/connections/commerce/[connectionId]/page.tsx");
  assert.match(page, /ShopifyOnboardingStatus/);
  assert.match(page, /loadShopifyOnboardingLifecycle/);
  assert.doesNotMatch(page, /ShopifySmokeTest/);
});

test("M8 lifecycle exposes setup, history, ready and attention states", async () => {
  const lifecycle = await source("lib/commerce/shopify-onboarding-lifecycle.ts");
  assert.match(lifecycle, /setting_up/);
  assert.match(lifecycle, /syncing_history/);
  assert.match(lifecycle, /ready/);
  assert.match(lifecycle, /needs_attention/);
  assert.match(lifecycle, /shopify_backfill_/);
  assert.match(lifecycle, /shopify_/);
  assert.match(lifecycle, /connectors\.view/);
});
