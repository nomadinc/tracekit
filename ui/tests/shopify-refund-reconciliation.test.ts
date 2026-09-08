import assert from "node:assert/strict";
import test from "node:test";

import { createShopifyAdminPageReader } from "../lib/commerce/shopify-core/admin-reader";
import { normalizeShopifyCheckpoint } from "../lib/commerce/shopify-core/resources";

test("order reads reconcile refunded orders independently of Order.updatedAt", async () => {
  let requestBody: Record<string, any> | null = null;
  const readPage = createShopifyAdminPageReader({
    shopDomain: "stem-labs.myshopify.com",
    accessToken: "test-token",
    pageSize: 50,
    fetchImpl: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body || "{}"));
      return new Response(JSON.stringify({
        data: {
          orders: {
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
          refundedOrders: {
            nodes: [{
              id: "gid://shopify/Order/1",
              updatedAt: "2026-09-08T00:13:54.000Z",
              displayFinancialStatus: "REFUNDED",
              refunds: [{ id: "gid://shopify/Refund/1", updatedAt: "2026-09-08T00:20:00.000Z" }],
            }],
            pageInfo: { hasNextPage: true, endCursor: "refunded-next" },
          },
          partiallyRefundedOrders: {
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });

  const page = await readPage({
    resource: "orders",
    checkpoint: normalizeShopifyCheckpoint({
      cursor: null,
      updatedAt: "2026-09-08T00:13:54.000Z",
      page: 4,
      refundedCursor: null,
      partiallyRefundedCursor: null,
    }),
  });

  assert.equal(page.nodes.length, 1);
  assert.equal(page.nodes[0]?.id, "gid://shopify/Order/1");
  assert.equal(page.hasNextPage, false, "financial traversal must not force an unbounded incremental run");
  assert.equal(page.nextCheckpoint.updatedAt, "2026-09-08T00:13:54.000Z", "financial reconciliation must not move the order watermark");
  assert.equal(page.nextCheckpoint.refundedCursor, "refunded-next");
  assert.equal(page.nextCheckpoint.partiallyRefundedCursor, null);
  assert.equal(requestBody?.variables?.query, "updated_at:>=2026-09-08T00:13:54.000Z");
  assert.equal(requestBody?.variables?.refundedQuery, "financial_status:refunded");
  assert.equal(requestBody?.variables?.partiallyRefundedQuery, "financial_status:partially_refunded");
});

test("legacy financial cursor migrates to the refunded traversal", () => {
  const checkpoint = normalizeShopifyCheckpoint({
    cursor: "orders-cursor",
    updatedAt: "2026-09-08T00:13:54Z",
    page: 7,
    financialCursor: "legacy-refund-cursor",
  });
  assert.equal(checkpoint.cursor, "orders-cursor");
  assert.equal(checkpoint.financialCursor, "legacy-refund-cursor");
  assert.equal(checkpoint.refundedCursor, "legacy-refund-cursor");
  assert.equal(checkpoint.partiallyRefundedCursor, null);
  assert.equal(checkpoint.page, 7);
});
