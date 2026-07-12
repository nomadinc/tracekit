import test from "node:test";
import assert from "node:assert/strict";
import {
  buildShopifyLedgerEventsFromOrder,
  normalizeShopifyOrderForPlatformOrder,
  normalizeShopifyShopDomain,
  signedShopifyLedgerAmount,
  stableShopifyRefundEventId,
  stableShopifySaleEventId,
} from "./shopify.ts";

const shopDomain = "tracekit-demo.myshopify.com";

const orderFixture = {
  id: "gid://shopify/Order/450789469",
  legacyResourceId: "450789469",
  name: "#1001",
  email: "buyer@example.com",
  phone: "+15555550101",
  processedAt: "2026-07-01T12:34:56Z",
  createdAt: "2026-07-01T12:33:00Z",
  displayFinancialStatus: "PAID",
  currencyCode: "USD",
  sourceName: "web",
  sourceIdentifier: "tracekit-landing",
  customAttributes: [
    { key: "tkid", value: "tk_123" },
    { key: "affiliate_id", value: "aff_9" },
    { key: "sub1", value: "creative-a" },
    { key: "sub5", value: "ef_tx_123" },
  ],
  customer: {
    id: "gid://shopify/Customer/123",
    legacyResourceId: "123",
    email: "buyer@example.com",
    phone: "+15555550101",
  },
  currentTotalPriceSet: {
    shopMoney: {
      amount: "129.99",
      currencyCode: "USD",
    },
  },
  totalPriceSet: {
    shopMoney: {
      amount: "129.99",
      currencyCode: "USD",
    },
  },
  subtotalPriceSet: {
    shopMoney: {
      amount: "120.00",
      currencyCode: "USD",
    },
  },
  totalShippingPriceSet: {
    shopMoney: {
      amount: "4.99",
      currencyCode: "USD",
    },
  },
  currentTotalTaxSet: {
    shopMoney: {
      amount: "5.00",
      currencyCode: "USD",
    },
  },
  currentTotalDiscountsSet: {
    shopMoney: {
      amount: "10.00",
      currencyCode: "USD",
    },
  },
  lineItems: {
    edges: [
      {
        node: {
          id: "gid://shopify/LineItem/1",
          name: "NAD Spray",
          title: "NAD Spray",
          sku: "NAD-1X",
          quantity: 2,
          originalTotalSet: { shopMoney: { amount: "130.00", currencyCode: "USD" } },
          discountedTotalSet: { shopMoney: { amount: "120.00", currencyCode: "USD" } },
          variant: { id: "gid://shopify/ProductVariant/1", sku: "NAD-1X" },
          product: { id: "gid://shopify/Product/1" },
        },
      },
    ],
  },
  refunds: [
    {
      id: "gid://shopify/Refund/777",
      createdAt: "2026-07-02T10:00:00Z",
      totalRefundedSet: { shopMoney: { amount: "20.00", currencyCode: "USD" } },
      refundLineItems: {
        edges: [
          {
            node: {
              id: "gid://shopify/RefundLineItem/1",
              quantity: 1,
              subtotalSet: { shopMoney: { amount: "20.00", currencyCode: "USD" } },
              totalTaxSet: { shopMoney: { amount: "0.00", currencyCode: "USD" } },
              lineItem: { id: "gid://shopify/LineItem/1", title: "NAD Spray", sku: "NAD-1X" },
            },
          },
        ],
      },
    },
  ],
  transactions: [
    {
      id: "gid://shopify/OrderTransaction/999",
      kind: "SALE",
      status: "SUCCESS",
      gateway: "shopify_payments",
      createdAt: "2026-07-01T12:35:00Z",
      amountSet: { shopMoney: { amount: "129.99", currencyCode: "USD" } },
      fees: [
        {
          type: "processing_fee",
          amount: { amount: "3.21", currencyCode: "USD" },
        },
      ],
    },
  ],
};

test("normalizes Shopify shop domains", () => {
  assert.equal(normalizeShopifyShopDomain("tracekit-demo"), shopDomain);
  assert.equal(normalizeShopifyShopDomain("https://tracekit-demo.myshopify.com/admin"), shopDomain);
  assert.equal(normalizeShopifyShopDomain("example.com"), "");
});

test("normalizes Shopify order payloads into platform_orders shape", () => {
  const row = normalizeShopifyOrderForPlatformOrder(orderFixture, shopDomain);

  assert.ok(row);
  assert.equal(row.platform, "shopify");
  assert.equal(row.platform_order_id, "gid://shopify/Order/450789469");
  assert.equal(row.platform_store_id, shopDomain);
  assert.equal(row.order_id, "#1001");
  assert.equal(row.transaction_id, "gid://shopify/OrderTransaction/999");
  assert.equal(row.email, "buyer@example.com");
  assert.equal(row.phone, "+15555550101");
  assert.equal(row.status, "COMPLETED");
  assert.equal(row.gross_amount, 129.99);
  assert.equal(row.currency, "USD");
  assert.equal(row.tkid, "tk_123");
  assert.equal(row.affiliate_id, "aff_9");
  assert.equal(row.sub1, "creative-a");
  assert.equal(row.sub5, "ef_tx_123");
  assert.equal(row.product_subtotal, 120);
  assert.equal(row.shipping_amount, 4.99);
  assert.equal(row.tax_amount, 5);
  assert.equal(row.gateway_fee, 3.21);
  assert.equal(row.raw_json.customer_gid, "gid://shopify/Customer/123");
  assert.equal(row.raw_json.line_items[0].sku, "NAD-1X");
  assert.equal(row.raw_json.line_items[0].quantity, 2);
  assert.equal(row.raw_json.refunds[0].total_refunded, 20);
});

test("builds stable Shopify ledger event IDs and signs", () => {
  const events = buildShopifyLedgerEventsFromOrder(orderFixture, shopDomain);
  const sale = events.find((event) => event.ledgerType === "sale");
  const refund = events.find((event) => event.ledgerType === "refund");
  const processorFee = events.find((event) => event.ledgerType === "processor_fee");

  assert.ok(sale);
  assert.ok(refund);
  assert.ok(processorFee);

  assert.equal(sale.transactionId, stableShopifySaleEventId(shopDomain, "gid://shopify/Order/450789469"));
  assert.equal(refund.transactionId, stableShopifyRefundEventId(shopDomain, "gid://shopify/Refund/777"));
  assert.equal(processorFee.transactionId, "shopify:tracekit-demo.myshopify.com:gid://shopify/OrderTransaction/999:processing_fee:processor_fee");

  assert.equal(signedShopifyLedgerAmount(sale), 129.99);
  assert.equal(signedShopifyLedgerAmount(refund), -20);
  assert.equal(signedShopifyLedgerAmount(processorFee), -3.21);
});
