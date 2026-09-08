import assert from "node:assert/strict";
import test from "node:test";

import { shopifyRefunds } from "../lib/commerce/shopify-core/order-details";

test("Shopify refund uses transaction amount while totalRefundedSet is temporarily zero", () => {
  const refunds = shopifyRefunds({
    refunds: [{
      id: "gid://shopify/Refund/958069014742",
      createdAt: "2026-09-08T00:19:48Z",
      totalRefundedSet: {
        shopMoney: { amount: "0.0", currencyCode: "USD" },
      },
      transactions: {
        nodes: [{
          id: "gid://shopify/OrderTransaction/8484834083030",
          status: "PENDING",
          amountSet: {
            shopMoney: { amount: "57.99", currencyCode: "USD" },
          },
        }],
      },
    }],
  }, "USD");

  assert.equal(refunds.length, 1);
  assert.equal(refunds[0]?.amount, 57.99);
  assert.equal(refunds[0]?.currency, "USD");
  assert.equal(refunds[0]?.providerPaymentId, "gid://shopify/OrderTransaction/8484834083030");
});

test("Shopify refund prefers a positive totalRefundedSet when available", () => {
  const refunds = shopifyRefunds({
    refunds: [{
      id: "gid://shopify/Refund/2",
      createdAt: "2026-09-08T01:00:00Z",
      totalRefundedSet: {
        shopMoney: { amount: "25.00", currencyCode: "USD" },
      },
      transactions: {
        nodes: [{
          id: "gid://shopify/OrderTransaction/2",
          amountSet: {
            shopMoney: { amount: "25.00", currencyCode: "USD" },
          },
        }],
      },
    }],
  }, "USD");

  assert.equal(refunds[0]?.amount, 25);
  assert.equal(refunds[0]?.currency, "USD");
});
