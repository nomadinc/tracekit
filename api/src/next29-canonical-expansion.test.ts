import assert from "node:assert/strict";
import test from "node:test";
import { expandNext29Order } from "./connectors/next29/expansion.ts";

const rawOrder = {
  number: "1001",
  attribution: {
    affiliate: "42",
    funnel: "main",
    subaffiliate1: "ef-tid",
    utm_source: "affiliate",
    metadata: { tkid: "tk_abc" },
    agent: { email: "private@example.com" },
  },
  user: {
    id: 55,
    email: "Buyer@Example.com",
    phone_number: "+15555550100",
    first_name: "Jane",
    last_name: "Doe",
    ip: "203.0.113.1",
    user_agent: "secret-browser",
  },
  lines: [
    {
      id: 10,
      product_id: 200,
      variant_id: 201,
      sku: "SKU-1",
      product_title: "Product One",
      quantity: 2,
      price_incl_tax: "19.995",
      unit_cost: "4.50",
      currency: "usd",
      is_upsell: true,
    },
  ],
  transactions: [
    {
      id: 300,
      parent_id: null,
      external_id: "gw-300",
      network_transaction_id: "network-1",
      auth_code: "AUTH",
      amount: "39.99",
      currency: "usd",
      date_created: "2026-08-01T12:01:00Z",
      payment_method: "card",
      status: "succeeded",
      type: "sale",
      is_disputed: false,
      is_external: false,
      is_test: false,
      payment_details: {
        gateway: { id: 1, name: "Example Gateway", type: "card" },
        card_token: "must-not-propagate",
        bankcard_first_six: "411111",
        bankcard_last_four: "1111",
      },
    },
  ],
  refunds: [
    {
      id: 400,
      created_at: "2026-08-02T12:00:00Z",
      total_refund_amount: "10.00",
      report_values: { currency: "usd" },
      transactions: [{ id: 401 }, { id: 401 }],
    },
  ],
};

test("29Next canonical expansion extracts lines, customer, transactions, refunds, and attribution", () => {
  const expanded = expandNext29Order(rawOrder);
  assert.equal(expanded.lines.length, 1);
  assert.deepEqual(expanded.lines[0], {
    sourceLineKey: "10",
    providerProductId: "200",
    providerVariantId: "201",
    sku: "SKU-1",
    title: "Product One",
    quantity: 2,
    unitAmount: 19.995,
    grossAmount: 39.99,
    unitCost: 4.5,
    currency: "USD",
    isUpsell: true,
  });
  assert.deepEqual(expanded.customer, {
    providerCustomerId: "55",
    email: "buyer@example.com",
    phone: "+15555550100",
    displayName: "Jane Doe",
  });
  assert.equal(expanded.transactions[0].providerTransactionId, "300");
  assert.equal(expanded.transactions[0].networkTransactionId, "network-1");
  assert.equal(expanded.transactions[0].gatewayName, "Example Gateway");
  assert.equal(expanded.refunds[0].providerRefundId, "400");
  assert.deepEqual(expanded.refunds[0].transactionIds, ["401"]);
  assert.equal(expanded.attribution.subaffiliate1, "ef-tid");
  assert.deepEqual(expanded.attribution.metadata, { tkid: "tk_abc" });
});

test("29Next canonical expansion does not promote sensitive payment or browser fields", () => {
  const expanded = expandNext29Order(rawOrder);
  const serialized = JSON.stringify(expanded);
  assert.equal(serialized.includes("card_token"), false);
  assert.equal(serialized.includes("411111"), false);
  assert.equal(serialized.includes("203.0.113.1"), false);
  assert.equal(serialized.includes("secret-browser"), false);
  assert.equal(serialized.includes("private@example.com"), false);
});

test("29Next canonical expansion skips child records without durable provider identity", () => {
  const expanded = expandNext29Order({
    lines: [{ quantity: 1, price_incl_tax: "10.00" }],
    user: { email: "buyer@example.com" },
    transactions: [{ amount: "10.00" }],
    refunds: [{ total_refund_amount: "10.00" }],
  });
  assert.deepEqual(expanded.lines, []);
  assert.equal(expanded.customer, null);
  assert.deepEqual(expanded.transactions, []);
  assert.deepEqual(expanded.refunds, []);
});

test("29Next canonical expansion preserves only documented attribution keys plus metadata", () => {
  const expanded = expandNext29Order({ attribution: { affiliate: "42", subaffiliate5: "x", arbitrary_secret: "nope", metadata: { tkid: "tk_1" } } });
  assert.deepEqual(expanded.attribution, { affiliate: "42", subaffiliate5: "x", metadata: { tkid: "tk_1" } });
});
