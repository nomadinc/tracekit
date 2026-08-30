import assert from "node:assert/strict";
import test from "node:test";

import { runShopifyReadSync } from "./connectors/shopify/sync.ts";

function clientFromResponses(responses: unknown[], calls: Array<Record<string, unknown>>) {
  let index = 0;
  return {
    async graphql(_query: string, variables: Record<string, unknown>) {
      calls.push(variables);
      const response = responses[index];
      index += 1;
      return response as never;
    },
  };
}

test("read sync consumes every page and advances watermark only after completion", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const client = clientFromResponses([
    {
      products: {
        nodes: [{ id: "gid://shopify/Product/1", title: "One", handle: "one", status: "ACTIVE", createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-02T00:00:00Z", variants: { nodes: [] } }],
        pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
      },
    },
    {
      products: {
        nodes: [{ id: "gid://shopify/Product/2", title: "Two", handle: "two", status: "ACTIVE", createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-03T00:00:00Z", variants: { nodes: [] } }],
        pageInfo: { hasNextPage: false, endCursor: "cursor-2" },
      },
    },
  ], calls);

  const seen: string[] = [];
  const result = await runShopifyReadSync({
    client,
    options: { resource: "products", updatedAt: "2026-08-01T00:00:00Z", pageSize: 50 },
    onPage(page) {
      seen.push(...page.nodes.map((node) => node.id));
    },
  });

  assert.deepEqual(seen, ["gid://shopify/Product/1", "gid://shopify/Product/2"]);
  assert.equal(result.pagesRead, 2);
  assert.equal(result.recordsRead, 2);
  assert.equal(result.complete, true);
  assert.equal(result.checkpoint.updatedAt, "2026-08-03T00:00:00.000Z");
  assert.equal(result.checkpoint.cursor, null);
  assert.equal(calls[0].query, "updated_at:>'2026-08-01T00:00:00.000Z'");
  assert.equal(calls[1].query, "updated_at:>'2026-08-01T00:00:00.000Z'");
  assert.equal(calls[1].after, "cursor-1");
});

test("read sync returns a resumable checkpoint when maxPages stops the run", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const client = clientFromResponses([
    {
      customers: {
        nodes: [{ id: "gid://shopify/Customer/1", createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-04T00:00:00Z" }],
        pageInfo: { hasNextPage: true, endCursor: "customer-cursor" },
      },
    },
  ], calls);

  const result = await runShopifyReadSync({
    client,
    options: { resource: "customers", updatedAt: "2026-08-01T00:00:00Z", maxPages: 1 },
  });

  assert.equal(result.complete, false);
  assert.equal(result.pagesRead, 1);
  assert.equal(result.checkpoint.updatedAt, "2026-08-01T00:00:00.000Z");
  assert.equal(result.checkpoint.maxObservedUpdatedAt, "2026-08-04T00:00:00.000Z");
  assert.equal(result.checkpoint.cursor, "customer-cursor");
});

test("read sync refuses cross-resource checkpoints", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const client = clientFromResponses([], calls);

  await assert.rejects(
    () => runShopifyReadSync({
      client,
      options: {
        resource: "orders",
        updatedAt: "2026-08-01T00:00:00Z",
        checkpoint: {
          resource: "products",
          updatedAt: "2026-08-01T00:00:00.000Z",
          cursor: null,
          maxObservedUpdatedAt: "2026-08-01T00:00:00.000Z",
        },
      },
    }),
    /sync checkpoint resource mismatch: expected orders/i,
  );
  assert.equal(calls.length, 0);
});

test("read sync fails closed when Shopify claims another page without a cursor", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const client = clientFromResponses([
    {
      orders: {
        nodes: [],
        pageInfo: { hasNextPage: true, endCursor: null },
      },
    },
  ], calls);

  await assert.rejects(
    () => runShopifyReadSync({ client, options: { resource: "orders", updatedAt: "2026-08-01T00:00:00Z" } }),
    /another page without an end cursor/i,
  );
});
