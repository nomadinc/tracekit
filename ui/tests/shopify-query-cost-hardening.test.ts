import test from "node:test";
import assert from "node:assert/strict";

import { createShopifyAdminPageReader, shopifyPageSizeForResource } from "../lib/commerce/shopify-core/admin-reader";
import { initialShopifyCheckpoint } from "../lib/commerce/shopify-core/resources";

test("orders are capped below Shopify's single-query cost ceiling", () => {
  assert.equal(shopifyPageSizeForResource("orders", 250), 25);
  assert.equal(shopifyPageSizeForResource("orders", 50), 25);
  assert.equal(shopifyPageSizeForResource("orders", 10), 10);
  assert.equal(shopifyPageSizeForResource("products", 250), 100);
  assert.equal(shopifyPageSizeForResource("customers", 250), 100);
});

test("reader halves page size and retries when Shopify rejects a query for cost", async () => {
  const pageSizes: number[] = [];
  let calls = 0;
  const fetchImpl: typeof fetch = async (_input, init) => {
    calls += 1;
    const body = JSON.parse(String(init?.body || "{}"));
    pageSizes.push(body.variables.first);
    if (calls === 1) {
      return new Response(JSON.stringify({
        errors: [{ message: "Query cost is 1140, which exceeds the single query max cost limit (1000)." }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({
      data: {
        products: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
      extensions: {
        cost: {
          requestedQueryCost: 570,
          actualQueryCost: 10,
          throttleStatus: { maximumAvailable: 2000, currentlyAvailable: 1990, restoreRate: 100 },
        },
      },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const readPage = createShopifyAdminPageReader({
    shopDomain: "example.myshopify.com",
    accessToken: "test-token",
    pageSize: 100,
    fetchImpl,
  });

  const result = await readPage({ resource: "products", checkpoint: initialShopifyCheckpoint() });
  assert.equal(result.nodes.length, 0);
  assert.deepEqual(pageSizes, [100, 50]);
});

test("reader does not retry non-cost GraphQL errors", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ errors: [{ message: "Access denied" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const readPage = createShopifyAdminPageReader({
    shopDomain: "example.myshopify.com",
    accessToken: "test-token",
    pageSize: 25,
    fetchImpl,
  });

  await assert.rejects(
    () => readPage({ resource: "customers", checkpoint: initialShopifyCheckpoint() }),
    /Access denied/,
  );
  assert.equal(calls, 1);
});
