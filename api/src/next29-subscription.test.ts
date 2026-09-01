import assert from "node:assert/strict";
import test from "node:test";
import { normalizeNext29Subscription, next29SubscriptionRebillKeys } from "./connectors/next29/subscription.ts";

function fixture() {
  return {
    id: 501,
    status: "active",
    currency: "usd",
    total: "39.95",
    interval: "month",
    interval_count: 1,
    next_renewal_date: "2026-10-01T12:00:00Z",
    date_created: "2026-08-01T12:00:00Z",
    cancel_reason: "",
    is_test: false,
    payment_method: "card",
    attribution: { affiliate: "42", subaffiliate1: "ef-tid", utm_source: "affiliate", secret: "drop-me" },
    user: { id: 99, email: "person@example.com", ip: "203.0.113.1", user_agent: "browser" },
    lines: [
      { id: 701, product_id: 184, variant_id: 512, sku: "REFILL", product_title: "Monthly Refill", quantity: 2, price: "19.975" },
    ],
    orders: [
      { billing_cycle: 0, order_number: "1001" },
      { billing_cycle: 1, order_number: "1002" },
    ],
  };
}

test("29Next subscription normalization preserves lifecycle cadence lines and renewal order lineage", () => {
  const subscription = normalizeNext29Subscription(fixture());
  assert.equal(subscription.providerSubscriptionId, "501");
  assert.equal(subscription.providerCustomerId, "99");
  assert.equal(subscription.status, "active");
  assert.equal(subscription.currency, "USD");
  assert.equal(subscription.recurringAmount, 39.95);
  assert.equal(subscription.interval, "month");
  assert.equal(subscription.intervalCount, 1);
  assert.equal(subscription.nextRenewalAt, "2026-10-01T12:00:00.000Z");
  assert.equal(subscription.lines[0].providerProductId, "184");
  assert.equal(subscription.lines[0].providerVariantId, "512");
  assert.equal(subscription.renewalOrders[1].providerOrderId, "1002");
  assert.equal(subscription.renewalOrders[1].billingCycle, 1);
});

test("29Next subscription normalization recognizes the documented lifecycle states", () => {
  for (const status of ["active", "past_due", "canceled", "retrying", "paused"] as const) {
    assert.equal(normalizeNext29Subscription({ ...fixture(), status }).status, status);
  }
  assert.equal(normalizeNext29Subscription({ ...fixture(), status: "future_state" }).status, "unknown");
});

test("29Next subscription model does not promote sensitive user or payment details", () => {
  const subscription = normalizeNext29Subscription(fixture());
  const serialized = JSON.stringify(subscription);
  assert.equal(serialized.includes("203.0.113.1"), false);
  assert.equal(serialized.includes("user_agent"), false);
  assert.equal(serialized.includes("person@example.com"), false);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(subscription.paymentMethod, "card");
});

test("29Next rebill keys deterministically link subscription and provider order without guessing", () => {
  const keys = next29SubscriptionRebillKeys(normalizeNext29Subscription(fixture()));
  assert.deepEqual(keys, [
    { providerSubscriptionId: "501", providerOrderId: "1001", billingCycle: 0, key: "next29:501:order:1001" },
    { providerSubscriptionId: "501", providerOrderId: "1002", billingCycle: 1, key: "next29:501:order:1002" },
  ]);
});

test("29Next subscription normalization skips child rows without durable provider identity", () => {
  const subscription = normalizeNext29Subscription({ ...fixture(), lines: [{ product_id: 184 }], orders: [{ billing_cycle: 1 }] });
  assert.equal(subscription.lines.length, 0);
  assert.equal(subscription.renewalOrders.length, 0);
});
