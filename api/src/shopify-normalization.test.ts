import assert from "node:assert/strict";
import test from "node:test";
import { normalizeShopifyCustomerRecord, normalizeShopifyOrderRecord, normalizeShopifyProductRecord } from "./connectors/shopify/normalize";
import { createShopifyNormalizedWriter } from "./connectors/shopify/normalized-writer";
import type { ShopifyPersistedRecord } from "./connectors/shopify/persistence";
import type { ShopifySyncPage } from "./connectors/shopify/resources";

const scope = { organizationId: "org-1", connectionId: "conn-1", providerAccountId: "acct-1" };

function record(resource: "orders" | "products" | "customers", payload: Record<string, unknown>): ShopifyPersistedRecord {
  return {
    ...scope,
    resource,
    providerObjectId: String(payload.id),
    providerUpdatedAt: "2026-08-30T20:00:00.000Z",
    payload: payload as any,
  };
}

function provenance(resource: "orders" | "products" | "customers") {
  return {
    syncRunId: "run-1",
    page: {
      resource,
      nodes: [],
      checkpoint: { cursor: null, updatedAt: null, page: 1 },
      hasNextPage: false,
    } as ShopifySyncPage,
  };
}

test("Shopify order normalization qualifies legacy platform identity by store and preserves provider GID", () => {
  const draft = normalizeShopifyOrderRecord(record("orders", {
    id: "gid://shopify/Order/123",
    name: "#1001",
    createdAt: "2026-08-30T19:00:00Z",
    displayFinancialStatus: "PAID",
    currentTotalPriceSet: { shopMoney: { amount: "99.50", currencyCode: "USD" } },
    currentSubtotalPriceSet: { shopMoney: { amount: "89.50", currencyCode: "USD" } },
    currentTotalShippingPriceSet: { shopMoney: { amount: "10.00", currencyCode: "USD" } },
    currentTotalTaxSet: { shopMoney: { amount: "0", currencyCode: "USD" } },
    customer: { email: "buyer@example.com" },
  }), "store-one.myshopify.com");

  assert.equal(draft.platform_order_id, "shopify:store-one.myshopify.com:gid://shopify/Order/123");
  assert.equal(draft.provider_order_id, "gid://shopify/Order/123");
  assert.equal(draft.platform_store_id, "store-one.myshopify.com");
  assert.equal(draft.status_norm, "COMPLETED");
  assert.equal(draft.gross_amount, 99.5);
  assert.equal(draft.email, "buyer@example.com");
  assert.ok(!("everflow_offer_id" in draft));
  assert.ok(!("affiliate_id" in draft));
});

test("Shopify product and customer normalization preserve durable provider identities", () => {
  const product = normalizeShopifyProductRecord(record("products", {
    id: "gid://shopify/Product/10",
    title: "Widget",
    variants: { nodes: [{ id: "gid://shopify/ProductVariant/11", title: "Blue", sku: "BLUE-1", price: "19.95" }] },
  }));
  assert.equal(product.provider_product_id, "gid://shopify/Product/10");
  assert.deepEqual(product.variants[0], { provider_variant_id: "gid://shopify/ProductVariant/11", title: "Blue", sku: "BLUE-1", price: 19.95 });

  const customer = normalizeShopifyCustomerRecord(record("customers", {
    id: "gid://shopify/Customer/20",
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
  }));
  assert.equal(customer.provider_customer_id, "gid://shopify/Customer/20");
  assert.equal(customer.display_name, "Ada Lovelace");
});

test("normalized writer emits evidence-backed tenant-scoped idempotent order upsert", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes("commerce_provider_connections")) return response([{ account_id: "account-1", provider: "shopify", external_account_id: "store-one.myshopify.com" }]);
    if (url.includes("commerce_provider_accounts")) return response([{ provider_account_external_id: "store-one.myshopify.com" }]);
    return new Response(null, { status: 204 });
  };
  const writer = createShopifyNormalizedWriter({ url: "https://example.supabase.co", serviceRoleKey: "service-role", fetchImpl });

  await writer([record("orders", {
    id: "gid://shopify/Order/123",
    name: "#1001",
    createdAt: "2026-08-30T19:00:00Z",
    displayFinancialStatus: "PAID",
    currentTotalPriceSet: { shopMoney: { amount: "99.50", currencyCode: "USD" } },
  })], provenance("orders"));

  assert.ok(calls.some((call) => call.url.includes("/storage/v1/object/commerce-evidence/")));
  const evidenceWrite = calls.find((call) => call.url.endsWith("/rest/v1/commerce_evidence_records") && call.init?.method === "POST");
  assert.ok(evidenceWrite);
  const evidenceBody = JSON.parse(String(evidenceWrite?.init?.body));
  assert.equal(evidenceBody.sync_run_id, "run-1");
  assert.equal(evidenceBody.source_object_type, "shopify_order");
  assert.equal(evidenceBody.organization_id, scope.organizationId);

  const orderWrite = calls.find((call) => call.url.includes("platform_orders?on_conflict=platform_order_id"));
  assert.ok(orderWrite);
  assert.equal(orderWrite?.init?.method, "POST");
  const body = JSON.parse(String(orderWrite?.init?.body));
  assert.equal(body[0].organization_id, scope.organizationId);
  assert.equal(body[0].connection_id, scope.connectionId);
  assert.equal(body[0].provider_account_id, scope.providerAccountId);
  assert.equal(body[0].account_id, "account-1");
  assert.equal(body[0].platform_order_id, "shopify:store-one.myshopify.com:gid://shopify/Order/123");
  assert.equal(body[0].provider_order_id, "gid://shopify/Order/123");
  assert.ok(body[0].evidence_id);
});

test("normalized writer refuses a non-Shopify connection before evidence or canonical writes", async () => {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input); calls.push(url);
    if (url.includes("commerce_provider_connections")) return response([{ account_id: "account-1", provider: "commas", external_account_id: "store-one.myshopify.com" }]);
    return new Response(null, { status: 204 });
  };
  const writer = createShopifyNormalizedWriter({ url: "https://example.supabase.co", serviceRoleKey: "service-role", fetchImpl });
  await assert.rejects(() => writer([record("orders", { id: "gid://shopify/Order/123", createdAt: "2026-08-30T19:00:00Z" })], provenance("orders")), /scoped Shopify connection/);
  assert.ok(!calls.some((url) => url.includes("commerce-evidence")));
  assert.ok(!calls.some((url) => url.includes("platform_orders")));
});

test("customer writer updates an existing provider identity instead of relying on partial-index upsert", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input); calls.push({ url, init });
    if (url.includes("commerce_provider_connections")) return response([{ account_id: "account-1", provider: "shopify", external_account_id: "store-one.myshopify.com" }]);
    if (url.includes("commerce_provider_accounts")) return response([{ provider_account_external_id: "store-one.myshopify.com" }]);
    if (url.includes("person_source_identities?") && (init?.method || "GET") === "GET") return response([{ id: "identity-1", person_id: "person-1", first_seen_at: "2026-08-01T00:00:00Z" }]);
    return new Response(null, { status: 204 });
  };
  const writer = createShopifyNormalizedWriter({ url: "https://example.supabase.co", serviceRoleKey: "service-role", fetchImpl });
  await writer([record("customers", { id: "gid://shopify/Customer/20", firstName: "Ada", email: "ada@example.com" })], provenance("customers"));

  const identityWrite = calls.find((call) => call.url.includes("person_source_identities?id=eq.identity-1"));
  assert.equal(identityWrite?.init?.method, "PATCH");
  const identityBody = JSON.parse(String(identityWrite?.init?.body));
  assert.ok(identityBody.evidence_id);
  assert.ok(!calls.some((call) => call.url.includes("person_source_identities?on_conflict=")));
});

function response(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
}
