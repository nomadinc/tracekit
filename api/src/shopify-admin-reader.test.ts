import assert from "node:assert/strict";
import test from "node:test";
import { createShopifyAdminPageReader } from "./connectors/shopify/admin-reader";

const checkpoint = { cursor: "cursor-1", updatedAt: "2026-08-30T20:00:00.000Z", page: 2 };

test("Shopify Admin order reader requests the canonical M3 fields and advances checkpoint", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const reader = createShopifyAdminPageReader({
    shopDomain: "store-one.myshopify.com",
    accessToken: "token",
    pageSize: 50,
    fetchImpl: async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return response({
        data: {
          orders: {
            nodes: [{ id: "gid://shopify/Order/1", updatedAt: "2026-08-30T20:05:00Z" }],
            pageInfo: { hasNextPage: true, endCursor: "cursor-2" },
          },
        },
      });
    },
  });

  const page = await reader({ resource: "orders", checkpoint });
  assert.equal(requestUrl, "https://store-one.myshopify.com/admin/api/2026-07/graphql.json");
  assert.equal((requestInit?.headers as Record<string, string>)["X-Shopify-Access-Token"], "token");
  const body = JSON.parse(String(requestInit?.body));
  assert.equal(body.variables.first, 50);
  assert.equal(body.variables.after, "cursor-1");
  assert.equal(body.variables.query, "updated_at:>=2026-08-30T20:00:00.000Z");
  assert.match(body.query, /lineItems\(first: 250\)/);
  assert.match(body.query, /discountedTotalSet/);
  assert.match(body.query, /refunds\s*\{/);
  assert.match(body.query, /totalRefundedSet/);
  assert.match(body.query, /transactions\s*\{/);
  assert.doesNotMatch(body.query, /refunds\(first:/);
  assert.doesNotMatch(body.query, /transactions\(first:/);
  assert.match(body.query, /totalShippingPriceSet/);
  assert.equal(page.nextCheckpoint.cursor, "cursor-2");
  assert.equal(page.nextCheckpoint.updatedAt, "2026-08-30T20:05:00.000Z");
  assert.equal(page.nextCheckpoint.page, 3);
});

test("Shopify Admin reader emits final cursor null and preserves high water mark", async () => {
  const reader = createShopifyAdminPageReader({
    shopDomain: "store-one.myshopify.com",
    accessToken: "token",
    fetchImpl: async () => response({
      data: {
        products: {
          nodes: [{ id: "gid://shopify/Product/1", updatedAt: "2026-08-30T19:00:00Z" }],
          pageInfo: { hasNextPage: false, endCursor: "ignored" },
        },
      },
    }),
  });
  const page = await reader({ resource: "products", checkpoint });
  assert.equal(page.nextCheckpoint.cursor, null);
  assert.equal(page.nextCheckpoint.updatedAt, checkpoint.updatedAt);
});

test("Shopify Admin reader fails closed on GraphQL errors", async () => {
  const reader = createShopifyAdminPageReader({
    shopDomain: "store-one.myshopify.com",
    accessToken: "token",
    fetchImpl: async () => response({ errors: [{ message: "Access denied for orders field" }] }),
  });
  await assert.rejects(() => reader({ resource: "orders", checkpoint }), /Access denied/);
});

function response(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
}
