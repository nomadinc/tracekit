import assert from "node:assert/strict";
import test from "node:test";
import { normalizeShopifyOrderRecord } from "../lib/commerce/shopify-core/normalize";

function record(payload: Record<string, unknown>) {
  return {
    organizationId: "org",
    connectionId: "connection",
    providerAccountId: "provider-account",
    resource: "orders" as const,
    providerObjectId: String(payload.id),
    providerUpdatedAt: String(payload.updatedAt || payload.createdAt),
    payload,
  };
}

function money(amount: string) {
  return { shopMoney: { amount, currencyCode: "USD" } };
}

test("fully refunded Shopify order normalizes as REFUNDED even when displayFinancialStatus remains PAID", () => {
  const order = normalizeShopifyOrderRecord(record({
    id: "gid://shopify/Order/1006",
    name: "#1006",
    createdAt: "2026-09-15T05:24:29Z",
    updatedAt: "2026-09-15T05:26:26Z",
    displayFinancialStatus: "PAID",
    currentTotalPriceSet: money("0.0"),
    totalPriceSet: money("8.50"),
    currentSubtotalPriceSet: money("0.0"),
    totalShippingPriceSet: money("8.0"),
    currentTotalTaxSet: money("0.0"),
    refunds: [{ id: "gid://shopify/Refund/1" }],
    transactions: [],
  }), "store.myshopify.com");

  assert.equal(order.status, "PAID");
  assert.equal(order.status_norm, "REFUNDED");
  assert.equal(order.gross_amount, 0);
});

test("paid Shopify order with no refund remains COMPLETED", () => {
  const order = normalizeShopifyOrderRecord(record({
    id: "gid://shopify/Order/1007",
    name: "#1007",
    createdAt: "2026-09-15T05:30:00Z",
    displayFinancialStatus: "PAID",
    currentTotalPriceSet: money("8.50"),
    totalPriceSet: money("8.50"),
    refunds: [],
    transactions: [],
  }), "store.myshopify.com");

  assert.equal(order.status_norm, "COMPLETED");
});

test("partial refund does not mark the Shopify order fully refunded", () => {
  const order = normalizeShopifyOrderRecord(record({
    id: "gid://shopify/Order/1008",
    name: "#1008",
    createdAt: "2026-09-15T05:35:00Z",
    displayFinancialStatus: "PAID",
    currentTotalPriceSet: money("4.25"),
    totalPriceSet: money("8.50"),
    refunds: [{ id: "gid://shopify/Refund/2" }],
    transactions: [],
  }), "store.myshopify.com");

  assert.equal(order.status_norm, "COMPLETED");
});
