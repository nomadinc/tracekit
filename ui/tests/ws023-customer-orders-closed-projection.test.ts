import { exactRelatedOrder } from "../lib/reporting/order-relationship";
import assert from "node:assert/strict";
import test from "node:test";
import { projectCustomerOrders } from "../lib/identity/customer-orders-projection";
import type { TraceKitSessionContext } from "../lib/identity/persistent-types";

const nh = "ab757103-4ad9-4fd8-a3f1-3f5adaee9b03";
const stem = "8f6bb14b-2126-49b8-bfdb-c60edbc3549b";
const person = "8129566a-4fc7-438d-ad6d-417ec3745358";
const session = (org: string, permissions: string[]) =>
  ({ activeOrganization: { id: org }, effectivePermissions: permissions }) as TraceKitSessionContext;
const source = (org: string, providerOrder: string, overrides: Record<string, unknown> = {}) => ({
  ok: true,
  orders: [{
    order: {
      workspace_id: org, organization_id: org, person_id: null, resolved_person_id: person,
      identity_resolution: "exact_provider_identity", platform: "next29", platform_order_id: providerOrder,
      order_id: providerOrder.replace("next29:", ""), order_ts: "2026-11-13T01:04:10.984Z",
      status: "open", status_norm: "completed", currency: "USD", evidence_id: "evidence",
      gross_amount: "116.99", subtotal: 110, tax_amount: 4, shipping_amount: 2.99,
      total: 116.99, revenue: 116.99, price: 100, processor_fee: 3,
      order_lines: [{ price_incl_tax: 116.99, unit_amount: 58.495, quantity: 2, tax: 4, discount: 2, shipping: 3 }],
      metadata: { provider_private: "hidden", charge: 200 },
      ...overrides,
    },
    customer: { id: person, email: "private@example.test", lifetime_value: 900 },
    identity_state: "exact_provider_identity",
    amount: 116.99, order_total: 116.99, line_items: [{ amount: 42 }],
    unknown: { money: 999 },
  }],
  next_offset: null, total_amount: 116.99, provider_raw: { secret: "hidden" },
});
test("denied sessions remove all financial fields, nested charges and aliases from serialized JSON", () => {
  for (const permissions of [[], ["financials.view"], ["orders.view_financials"]]) {
    const json = JSON.stringify(projectCustomerOrders(source(nh, "next29:103533"), session(nh, permissions)));
    const body = JSON.parse(json);
    assert.equal(body.orders[0].order.platform_order_id, "next29:103533");
    assert.equal(body.orders[0].customer.id, person);
    for (const key of ["gross_amount", "subtotal", "tax_amount", "shipping_amount", "total", "revenue", "price", "processor_fee", "order_lines", "line_items", "metadata", "total_amount", "order_total", "amount", "unknown", "provider_raw", "email", "lifetime_value"])
      assert.ok(!json.includes('"' + key + '"'), key + " leaked");
    assert.ok(!json.includes("private@example.test"));
  }
});
test("both financial permissions preserve genuine Core order total but never uncertified NH line amounts", () => {
  const result = projectCustomerOrders(source(nh, "next29:103533"), session(nh, ["financials.view", "orders.view_financials"]));
  assert.equal(result.orders[0].order.gross_amount, "116.99");
  assert.ok(!JSON.stringify(result).includes("price_incl_tax"));
  assert.ok(!JSON.stringify(result).includes("unit_amount"));
});
test("Stem Labs 103104 retains exact Order and Customer relationship", () => {
  const result = projectCustomerOrders(source(stem, "next29:103104"), session(stem, ["orders.view"]));
  assert.equal(result.orders[0].order.order_id, "103104");
  assert.equal(result.orders[0].order.resolved_person_id, person);
  assert.deepEqual(result.orders[0].customer, { id: person });
  assert.equal(result.orders[0].identity_state, "exact_provider_identity");
});
test("null and unavailable amount evidence are not invented", () => {
  for (const amount of [null, undefined, "unavailable", { raw: 3 }]) {
    const result = projectCustomerOrders(source(stem, "next29:103104", { gross_amount: amount }), session(stem, ["financials.view", "orders.view_financials"]));
    assert.equal(result.orders[0].order.gross_amount, amount === null ? null : undefined);
  }
});
test("foreign tenant and inconsistent Customer relationships fail closed", () => {
  assert.throws(() => projectCustomerOrders(source(stem, "next29:103104"), session(nh, ["orders.view"])), /scope unavailable/);
  const inconsistent = source(nh, "next29:103533");
  inconsistent.orders[0].customer.id = "foreign-person";
  assert.throws(() => projectCustomerOrders(inconsistent, session(nh, ["orders.view"])), /relationship unavailable/);
});
test("unknown provider fields and top-level monetary aliases are never serialized even with financial access", () => {
  const result = projectCustomerOrders(source(stem, "next29:103104"), session(stem, ["financials.view", "orders.view_financials"]));
  const json = JSON.stringify(result);
  assert.ok(!json.includes("provider_private"));
  assert.ok(!json.includes("total_amount"));
  assert.ok(!json.includes("order_lines"));
  assert.deepEqual(Object.keys(result), ["ok", "orders", "next_offset"]);
});

test("F1 rejects monetary narratives in every copied categorical field for denied sessions", () => {
  const contaminated = source(nh, "next29:103533", {
    status: "Refund $987.65", status_norm: "Paid 99 USD",
    identity_resolution: "Matched $43.00", platform: "next29",
  });
  contaminated.orders[0].identity_state = "Matched $200";
  const body = projectCustomerOrders(contaminated, session(nh, ["orders.view"]));
  const json = JSON.stringify(body);
  assert.ok(!json.includes("$987.65"));
  assert.ok(!json.includes("99 USD"));
  assert.ok(!json.includes("$43.00"));
  assert.ok(!json.includes("$200"));
  assert.equal(body.orders[0].order.status, null);
  assert.equal(body.orders[0].order.status_norm, null);
  assert.equal(body.orders[0].identity_state, null);
});
test("F1 preserves legitimate categorical status and never substitutes identifiers", () => {
  const result = projectCustomerOrders(source(stem, "next29:103104", { status: "refunded", status_norm: "completed" }), session(stem, []));
  assert.equal(result.orders[0].order.status, "refunded");
  assert.equal(result.orders[0].order.status_norm, "completed");
  assert.equal(result.orders[0].order.platform_order_id, "next29:103104");
});
test("F2 preserves canonical Order ID for deterministic purchase relationship", () => {
  const canonical = "a7afdca4-6b1d-4cef-9a44-03feed38388e";
  const result = projectCustomerOrders(source(nh, "next29:103533", { canonical_order_id: canonical }), session(nh, []));
  const order = result.orders[0].order;
  assert.equal(order.canonical_order_id, canonical);
  const event = { event_type: "purchase", canonical_order_id: canonical, platform_order_id: "next29:103533", workspace_id: nh, organization_id: nh };
  assert.equal(exactRelatedOrder(event, [order]), order);
  const purchase = new Date("2026-11-13T01:03:10.984Z").getTime();
  const orderTime = new Date(order.order_ts!).getTime();
  assert.equal((orderTime - purchase) / 1000, 60);
});
test("F2 rejects malformed canonical and conflicting provider-qualified scope", () => {
  assert.throws(() => projectCustomerOrders(source(nh, "next29:103533", { canonical_order_id: "not valid" }), session(nh, [])), /identity unavailable/);
  assert.throws(() => projectCustomerOrders(source(nh, "next29:conn1:acct1:103533", { connection_id: "conn2", provider_account_id: "acct1" }), session(nh, [])), /identity scope unavailable/);
});
test("F2 retains explicit provider account and connection scope without leaking unknown fields", () => {
  const result = projectCustomerOrders(source(nh, "next29:conn1:acct1:103533", { connection_id: "conn1", provider_account_id: "acct1" }), session(nh, []));
  assert.equal(result.orders[0].order.connection_id, "conn1");
  assert.equal(result.orders[0].order.provider_account_id, "acct1");
  assert.ok(!JSON.stringify(result).includes("processor_fee"));
});
