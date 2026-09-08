import assert from "node:assert/strict";
import test from "node:test";

import { createShopifyAdminPageReader } from "../lib/commerce/shopify-core/admin-reader";
import { normalizeShopifyCheckpoint } from "../lib/commerce/shopify-core/resources";

test("order reads split refund reconciliation into independent bounded Shopify requests", async () => {
  const requestBodies: Array<Record<string, any>> = [];
  const readPage = createShopifyAdminPageReader({
    shopDomain: "stem-labs.myshopify.com",
    accessToken: "test-token",
    pageSize: 50,
    fetchImpl: async (_input, init) => {
      const body = JSON.parse(String(init?.body || "{}"));
      requestBodies.push(body);
      const query = body?.variables?.query;
      if (query === "financial_status:refunded") {
        return new Response(JSON.stringify({
          data: {
            orders: {
              nodes: [{
                id: "gid://shopify/Order/1",
                updatedAt: "2026-09-08T00:13:54.000Z",
                displayFinancialStatus: "REFUNDED",
                refunds: [{ id: "gid://shopify/Refund/1", updatedAt: "2026-09-08T00:20:00.000Z" }],
              }],
              pageInfo: { hasNextPage: true, endCursor: "refunded-next" },
            },
          },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (query === "financial_status:partially_refunded") {
        return new Response(JSON.stringify({
          data: { orders: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({
        data: { orders: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } },
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

  assert.equal(requestBodies.length, 3, "orders must use one incremental request plus two financial reconciliation requests");
  assert.equal(requestBodies[0]?.variables?.query, "updated_at:>=2026-09-08T00:13:54.000Z");
  assert.equal(requestBodies[1]?.variables?.query, "financial_status:refunded");
  assert.equal(requestBodies[2]?.variables?.query, "financial_status:partially_refunded");
  assert.match(String(requestBodies[0]?.query || ""), /query TraceKitShopifyOrders/);
  assert.match(String(requestBodies[1]?.query || ""), /query TraceKitShopifyFinancialOrders/);
  assert.match(String(requestBodies[2]?.query || ""), /query TraceKitShopifyFinancialOrders/);

  assert.equal(page.nodes.length, 1);
  assert.equal(page.nodes[0]?.id, "gid://shopify/Order/1");
  assert.equal(page.hasNextPage, false, "financial traversal must not force an unbounded incremental run");
  assert.equal(page.nextCheckpoint.updatedAt, "2026-09-08T00:13:54.000Z", "financial reconciliation must not move the order watermark");
  assert.equal(page.nextCheckpoint.refundedCursor, "refunded-next");
  assert.equal(page.nextCheckpoint.partiallyRefundedCursor, null);
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
