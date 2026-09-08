import assert from "node:assert/strict";
import test from "node:test";

import { createShopifyAdminPageReader } from "../lib/commerce/shopify-core/admin-reader";
import { normalizeShopifyCheckpoint } from "../lib/commerce/shopify-core/resources";

test("Shopify incremental order searches quote updated_at timestamps", async () => {
  const bodies: Array<Record<string, any>> = [];
  const readPage = createShopifyAdminPageReader({
    shopDomain: "stem-labs.myshopify.com",
    accessToken: "test-token",
    pageSize: 50,
    fetchImpl: async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body || "{}")));
      return new Response(JSON.stringify({
        data: {
          orders: {
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });

  await readPage({
    resource: "orders",
    checkpoint: normalizeShopifyCheckpoint({
      cursor: null,
      updatedAt: "2026-09-08T00:13:54.000Z",
      page: 6,
      refundedCursor: null,
      partiallyRefundedCursor: null,
    }),
  });

  assert.equal(bodies.length, 3);
  assert.equal(bodies[0]?.variables?.query, "updated_at:>='2026-09-08T00:13:54.000Z'");
  assert.equal(bodies[1]?.variables?.query, "financial_status:refunded");
  assert.equal(bodies[2]?.variables?.query, "financial_status:partially_refunded");
});
