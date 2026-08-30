import assert from "node:assert/strict";
import test from "node:test";

import {
  buildShopifyUpdatedAtSearch,
  initialShopifyCheckpoint,
  listShopifyCustomersPage,
  listShopifyOrdersPage,
  listShopifyProductsPage,
} from "./connectors/shopify/resources.ts";

function graphqlStub(response: unknown, calls: Array<{ query: string; variables: Record<string, unknown> }>) {
  return {
    async graphql(query: string, variables: Record<string, unknown>) {
      calls.push({ query, variables });
      return response as never;
    },
  };
}

test("buildShopifyUpdatedAtSearch normalizes the checkpoint timestamp", () => {
  assert.equal(
    buildShopifyUpdatedAtSearch("2026-08-30T12:00:00-07:00"),
    "updated_at:>'2026-08-30T19:00:00.000Z'",
  );
});

test("initial checkpoint is resource-scoped and starts without a cursor", () => {
  assert.deepEqual(initialShopifyCheckpoint("products", "2026-08-01T00:00:00Z"), {
    resource: "products",
    updatedAt: "2026-08-01T00:00:00.000Z",
    cursor: null,
    maxObservedUpdatedAt: "2026-08-01T00:00:00.000Z",
  });
});

test("products page uses UPDATED_AT sorting, bounded page size, and returns variants", async () => {
  const calls: Array<{ query: string; variables: Record<string, unknown> }> = [];
  const client = graphqlStub({
    products: {
      nodes: [{
        id: "gid://shopify/Product/1",
        title: "Trace Product",
        handle: "trace-product",
        status: "ACTIVE",
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-02T00:00:00Z",
        variants: { nodes: [{ id: "gid://shopify/ProductVariant/11", title: "Default", sku: "TRACE-1" }] },
      }],
      pageInfo: { hasNextPage: false, endCursor: "cursor-products" },
    },
  }, calls);

  const page = await listShopifyProductsPage(client, initialShopifyCheckpoint("products", "2026-08-01T00:00:00Z"), 999);

  assert.equal(calls.length, 1);
  assert.match(calls[0].query, /products\(first: \$first/);
  assert.match(calls[0].query, /sortKey: UPDATED_AT/);
  assert.match(calls[0].query, /variants\(first: 100\)/);
  assert.equal(calls[0].variables.first, 250);
  assert.equal(calls[0].variables.after, null);
  assert.equal(calls[0].variables.query, "updated_at:>'2026-08-01T00:00:00.000Z'");
  assert.equal(page.nodes[0].variants.nodes[0].sku, "TRACE-1");
  assert.equal(page.checkpoint.updatedAt, "2026-08-02T00:00:00.000Z");
  assert.equal(page.checkpoint.cursor, null);
});

test("cursor continuation preserves the original watermark until the last page", async () => {
  const calls: Array<{ query: string; variables: Record<string, unknown> }> = [];
  const firstClient = graphqlStub({
    customers: {
      nodes: [{ id: "gid://shopify/Customer/1", createdAt: "2026-08-02T00:00:00Z", updatedAt: "2026-08-03T00:00:00Z" }],
      pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
    },
  }, calls);

  const initial = initialShopifyCheckpoint("customers", "2026-08-01T00:00:00Z");
  const firstPage = await listShopifyCustomersPage(firstClient, initial, 50);

  assert.equal(firstPage.checkpoint.updatedAt, "2026-08-01T00:00:00.000Z");
  assert.equal(firstPage.checkpoint.maxObservedUpdatedAt, "2026-08-03T00:00:00.000Z");
  assert.equal(firstPage.checkpoint.cursor, "cursor-1");

  const secondClient = graphqlStub({
    customers: {
      nodes: [{ id: "gid://shopify/Customer/2", createdAt: "2026-08-02T00:00:00Z", updatedAt: "2026-08-04T00:00:00Z" }],
      pageInfo: { hasNextPage: false, endCursor: "cursor-2" },
    },
  }, calls);

  const secondPage = await listShopifyCustomersPage(secondClient, firstPage.checkpoint, 50);

  assert.equal(calls[1].variables.query, "updated_at:>'2026-08-01T00:00:00.000Z'");
  assert.equal(calls[1].variables.after, "cursor-1");
  assert.equal(secondPage.checkpoint.updatedAt, "2026-08-04T00:00:00.000Z");
  assert.equal(secondPage.checkpoint.maxObservedUpdatedAt, "2026-08-04T00:00:00.000Z");
  assert.equal(secondPage.checkpoint.cursor, null);
});

test("orders page keeps line items and refunds inside the read contract", async () => {
  const calls: Array<{ query: string; variables: Record<string, unknown> }> = [];
  const client = graphqlStub({
    orders: {
      nodes: [{
        id: "gid://shopify/Order/1",
        name: "#1001",
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-05T00:00:00Z",
        lineItems: { nodes: [{ id: "gid://shopify/LineItem/1", name: "Product", title: "Product", quantity: 1 }] },
        refunds: [{ id: "gid://shopify/Refund/1", createdAt: "2026-08-05T00:00:00Z" }],
      }],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  }, calls);

  const page = await listShopifyOrdersPage(client, initialShopifyCheckpoint("orders", "2026-08-01T00:00:00Z"));

  assert.match(calls[0].query, /orders\(first: \$first/);
  assert.match(calls[0].query, /sortKey: UPDATED_AT/);
  assert.match(calls[0].query, /lineItems\(first: 100\)/);
  assert.match(calls[0].query, /refunds \{/);
  assert.equal(page.nodes[0].lineItems.nodes.length, 1);
  assert.equal(page.nodes[0].refunds.length, 1);
});

test("resource mismatch is rejected before querying Shopify", async () => {
  const calls: Array<{ query: string; variables: Record<string, unknown> }> = [];
  const client = graphqlStub({}, calls);
  const checkpoint = initialShopifyCheckpoint("products", "2026-08-01T00:00:00Z");

  await assert.rejects(
    () => listShopifyOrdersPage(client, checkpoint),
    /checkpoint resource mismatch: expected orders/i,
  );
  assert.equal(calls.length, 0);
});
