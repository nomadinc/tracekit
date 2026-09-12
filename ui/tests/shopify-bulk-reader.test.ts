import test from "node:test";
import assert from "node:assert/strict";

import { createShopifyBulkReader, parseShopifyBulkJsonl } from "../lib/commerce/shopify-core/bulk-reader";

test("starts a historical bulk query with the requested cutoff", async () => {
  let requestBody: any;
  const fetchImpl: typeof fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body || "{}"));
    return new Response(JSON.stringify({ data: { bulkOperationRunQuery: { bulkOperation: { id: "gid://shopify/BulkOperation/1", status: "CREATED", errorCode: null, objectCount: "0", fileSize: null, url: null, partialDataUrl: null, createdAt: "2026-09-11T00:00:00Z", completedAt: null }, userErrors: [] } } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const reader = createShopifyBulkReader({ shopDomain: "example.myshopify.com", accessToken: "test-token", fetchImpl });
  const operation = await reader.start({ resource: "orders", before: "2026-01-01T00:00:00Z" });
  assert.equal(operation.id, "gid://shopify/BulkOperation/1");
  assert.equal(operation.status, "CREATED");
  assert.match(requestBody.variables.query, /updated_at:<='2026-01-01T00:00:00.000Z'/);
  assert.match(requestBody.variables.query, /orders/);
});

test("surfaces Shopify bulk user errors", async () => {
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ data: { bulkOperationRunQuery: { bulkOperation: null, userErrors: [{ field: ["query"], message: "A bulk query operation for this app and shop is already in progress." }] } } }), { status: 200, headers: { "content-type": "application/json" } });
  const reader = createShopifyBulkReader({ shopDomain: "example.myshopify.com", accessToken: "test-token", fetchImpl });
  await assert.rejects(() => reader.start({ resource: "customers", before: "2026-01-01T00:00:00Z" }), /already in progress/);
});

test("reads a persisted bulk operation by exact id", async () => {
  let requestBody: any;
  const fetchImpl: typeof fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body || "{}"));
    return new Response(JSON.stringify({ data: { bulkOperation: { id: "gid://shopify/BulkOperation/2", status: "COMPLETED", errorCode: null, objectCount: "1250", fileSize: "98765", url: "https://storage.example/result.jsonl", partialDataUrl: null, createdAt: "2026-09-11T00:00:00Z", completedAt: "2026-09-11T00:01:00Z" } } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const reader = createShopifyBulkReader({ shopDomain: "example.myshopify.com", accessToken: "test-token", fetchImpl });
  const operation = await reader.get("gid://shopify/BulkOperation/2");
  assert.equal(requestBody.variables.id, "gid://shopify/BulkOperation/2");
  assert.equal(operation?.status, "COMPLETED");
  assert.equal(operation?.objectCount, "1250");
  assert.equal(operation?.url, "https://storage.example/result.jsonl");
});

test("downloads bulk JSONL only over HTTPS", async () => {
  const fetchImpl: typeof fetch = async (input) => new Response(String(input).includes("result.jsonl") ? '{"id":"gid://shopify/Product/1"}\n' : "", { status: 200 });
  const reader = createShopifyBulkReader({ shopDomain: "example.myshopify.com", accessToken: "test-token", fetchImpl });
  assert.equal(await reader.download("https://storage.example/result.jsonl"), '{"id":"gid://shopify/Product/1"}\n');
  await assert.rejects(() => reader.download("http://storage.example/result.jsonl"), /must use HTTPS/);
});

test("parses flat bulk JSONL resources", () => {
  const result = parseShopifyBulkJsonl("customers", [JSON.stringify({ id: "gid://shopify/Customer/1", email: "a@example.com", updatedAt: "2026-01-01T00:00:00Z" }), JSON.stringify({ id: "gid://shopify/Customer/2", email: "b@example.com", updatedAt: "2026-01-02T00:00:00Z" })].join("\n"));
  assert.equal(result.length, 2);
  assert.equal(result[0].id, "gid://shopify/Customer/1");
});

test("reassembles order children from Shopify JSONL parent relationships", () => {
  const orderId = "gid://shopify/Order/1";
  const result = parseShopifyBulkJsonl("orders", [JSON.stringify({ id: orderId, name: "#1001", updatedAt: "2026-01-01T00:00:00Z" }), JSON.stringify({ id: "gid://shopify/LineItem/1", __parentId: orderId, __typename: "LineItem", quantity: 2 }), JSON.stringify({ id: "gid://shopify/OrderTransaction/1", __parentId: orderId, __typename: "OrderTransaction", status: "SUCCESS" }), JSON.stringify({ id: "gid://shopify/Refund/1", __parentId: orderId, __typename: "Refund", createdAt: "2026-01-02T00:00:00Z" })].join("\n"));
  assert.equal(result.length, 1);
  const order = result[0] as any;
  assert.equal(order.lineItems.nodes.length, 1);
  assert.equal(order.transactions.length, 1);
  assert.equal(order.refunds.length, 1);
  assert.equal(order.lineItems.nodes[0].__parentId, undefined);
});

test("rejects malformed bulk JSONL", () => {
  assert.throws(() => parseShopifyBulkJsonl("products", '{"id":"ok"}\nnot-json'), /invalid JSONL/);
});
