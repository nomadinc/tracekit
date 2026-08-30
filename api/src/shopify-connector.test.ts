import assert from "node:assert/strict";
import test from "node:test";

import { ShopifyAdminClient, ShopifyConnectorError } from "./connectors/shopify/client";
import { SHOPIFY_COMMERCE_CAPABILITIES } from "./connectors/shopify/types";

const context = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  connectionId: "22222222-2222-4222-8222-222222222222",
};

test("ShopifyAdminClient normalizes shop identity and preserves tenant context", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;

  const client = new ShopifyAdminClient({
    context,
    credentials: {
      shopDomain: "TRACEKIT-DEMO",
      accessToken: "test-token",
      apiVersion: "2026-07",
    },
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = String(input);
      requestInit = init;
      return new Response(
        JSON.stringify({
          data: {
            shop: {
              id: "gid://shopify/Shop/123",
              name: "TraceKit Demo",
              myshopifyDomain: "tracekit-demo.myshopify.com",
              email: "ops@example.com",
              currencyCode: "USD",
              timezoneAbbreviation: "PDT",
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch,
  });

  const result = await client.testConnection();

  assert.equal(result.ok, true);
  assert.equal(result.organizationId, context.organizationId);
  assert.equal(result.connectionId, context.connectionId);
  assert.equal(result.shopDomain, "tracekit-demo.myshopify.com");
  assert.equal(result.shop.id, "gid://shopify/Shop/123");
  assert.equal(requestUrl, "https://tracekit-demo.myshopify.com/admin/api/2026-07/graphql.json");
  assert.equal((requestInit?.headers as Record<string, string>)["X-Shopify-Access-Token"], "test-token");
});

test("ShopifyAdminClient rejects missing organization scope before making requests", () => {
  assert.throws(
    () =>
      new ShopifyAdminClient({
        context: { organizationId: "", connectionId: context.connectionId },
        credentials: { shopDomain: "tracekit-demo", accessToken: "token" },
      }),
    (error: unknown) => error instanceof ShopifyConnectorError && error.code === "missing_organization",
  );
});

test("ShopifyAdminClient classifies credential failures", async () => {
  const client = new ShopifyAdminClient({
    context,
    credentials: { shopDomain: "tracekit-demo.myshopify.com", accessToken: "bad-token" },
    fetchImpl: (async () =>
      new Response(JSON.stringify({ errors: [{ message: "Unauthorized" }] }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch,
  });

  await assert.rejects(
    () => client.testConnection(),
    (error: unknown) =>
      error instanceof ShopifyConnectorError &&
      error.code === "invalid_credentials" &&
      error.status === 401,
  );
});

test("Shopify capability contract covers the initial commerce resources", () => {
  assert.deepEqual(
    SHOPIFY_COMMERCE_CAPABILITIES.map((capability) => capability.resource),
    ["shop", "products", "customers", "orders"],
  );

  const orders = SHOPIFY_COMMERCE_CAPABILITIES.find((capability) => capability.resource === "orders");
  assert.deepEqual(orders?.incrementalFilters, ["updated_at", "created_at"]);
});
