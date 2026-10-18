import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path: string) {
  return readFile(new URL(path, root), "utf8");
}

test("Shopify M6 scheduler reuses the certified incremental runtime with bounded leases", async () => {
  const worker = await source("lib/commerce/shopify-scheduled-worker.ts");
  assert.match(worker, /runShopifyIncrementalResource/);
  assert.match(worker, /SHOPIFY_RESOURCES.*products.*customers.*orders/s);
  assert.match(worker, /maxPages:\s*1/);
  // Source-contract assertions only; execution behavior is validated separately.
  assert.match(worker, /const LIVE_PAGE_SIZE = 50;/);
  assert.match(worker, /const ORDER_PAGE_SIZE = 25;/);
  assert.match(worker, /pageSize:\s*pageSizeForResource\(schedule\.resource, LIVE_PAGE_SIZE\)/);
  assert.match(worker, /return resource === "orders" \? ORDER_PAGE_SIZE : defaultSize;/);
  assert.match(worker, /lease_owner/);
  assert.match(worker, /lease_expires_at/);
  assert.match(worker, /last_enqueued_at/);
  assert.match(worker, /next_overlap_at/);
  assert.match(worker, /5_minutes/);
});

test("Shopify scheduler is cron-protected and registered every five minutes", async () => {
  const route = await source("app/api/cron/shopify-scheduler/route.ts");
  const vercel = JSON.parse(await source("vercel.json")) as { crons?: Array<{ path?: string; schedule?: string }> };
  assert.match(route, /CRON_SECRET/);
  assert.match(route, /runDueShopifySchedules/);
  assert.ok(vercel.crons?.some((cron) => cron.path === "/api/cron/shopify-scheduler" && cron.schedule === "*/5 * * * *"));
});
