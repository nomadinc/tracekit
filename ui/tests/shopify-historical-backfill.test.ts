import assert from "node:assert/strict";
import test from "node:test";

import { createShopifyHistoricalPageReader } from "../lib/commerce/shopify-core/historical-reader";
import { normalizeShopifyCheckpoint } from "../lib/commerce/shopify-core/resources";
import { runShopifyReadSync } from "../lib/commerce/shopify-core/sync";

test("Shopify historical reader uses a fixed created_at cutoff and CREATED_AT ordering", async () => {
  const bodies: Array<Record<string, any>> = [];
  const readPage = createShopifyHistoricalPageReader({
    shopDomain: "stem-labs.myshopify.com",
    accessToken: "test-token",
    pageSize: 50,
    fetchImpl: async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body || "{}")));
      return new Response(JSON.stringify({
        data: { orders: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });

  const cutoff = "2026-09-07T23:59:59.000Z";
  const page = await readPage({
    resource: "orders",
    checkpoint: normalizeShopifyCheckpoint({ cursor: null, updatedAt: null, page: 1, historicalCutoff: cutoff }),
  });

  assert.equal(bodies.length, 1);
  assert.equal(bodies[0]?.variables?.query, `created_at:<='${cutoff}'`);
  assert.match(String(bodies[0]?.query || ""), /sortKey:\s*CREATED_AT/);
  assert.equal(page.nextCheckpoint.historicalCutoff, cutoff);
});

test("bounded historical batches complete cleanly and preserve a resume cursor", async () => {
  let completed = false;
  let failed = false;
  let persisted = 0;
  const persistence = {
    async loadState() { return null; },
    async begin() {},
    async persistPage() { persisted += 1; },
    async complete() { completed = true; },
    async fail() { failed = true; },
  };
  const cutoff = "2026-09-07T23:59:59.000Z";
  const result = await runShopifyReadSync({
    organizationId: "org",
    connectionId: "conn",
    providerAccountId: "acct",
    resource: "orders",
    maxPages: 1,
    allowPartialCompletion: true,
    initialCheckpoint: normalizeShopifyCheckpoint({ cursor: null, updatedAt: null, page: 1, historicalCutoff: cutoff }),
    persistence,
    readPage: async ({ resource, checkpoint }) => ({
      resource,
      checkpoint,
      nodes: [{ id: "gid://shopify/Order/1", updatedAt: cutoff }],
      hasNextPage: true,
      nextCheckpoint: { ...checkpoint, cursor: "resume-cursor", page: checkpoint.page + 1 },
    }),
  });

  assert.equal(persisted, 1);
  assert.equal(completed, true);
  assert.equal(failed, false);
  assert.equal(result.checkpoint.cursor, "resume-cursor");
});
