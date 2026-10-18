import assert from "node:assert/strict";
import test from "node:test";
import { planHistoricalOrderPersonLinks } from "./historical-identity-plan.ts";
import type { ScopedOrder, ScopedCustomerIdentity } from "./exact-order-person-link.ts";
const order: ScopedOrder = { canonicalOrderId: "order-1", organizationId: "stem", connectionId: "next29", providerAccountId: "merchant", personId: null };
const identity: ScopedCustomerIdentity = { organizationId: "stem", connectionId: "next29", providerAccountId: "merchant", sourceType: "provider_customer_id", sourceId: "customer-1", personId: "person-1" };
const people = [{ id: "person-1", organizationId: "stem" }];
test("plans historical exact matches without performing writes", () => {
 const before = JSON.stringify({ order, identity, people });
 const plan = planHistoricalOrderPersonLinks("stem", [{ order, providerCustomerId: "customer-1" }], [identity], people);
 assert.deepEqual([plan.status, plan.total, plan.linkable, plan.unresolved], ["review_only", 1, 1, 0]);
 assert.equal(JSON.stringify({ order, identity, people }), before);
});
test("unresolved identity remains review-only", () => {
 const plan = planHistoricalOrderPersonLinks("stem", [{ order, providerCustomerId: null }], [identity], people);
 assert.equal(plan.linkable, 0);
 assert.equal(plan.unresolved, 1);
});
test("rejects foreign-tenant orders and duplicate order IDs", () => {
 assert.throws(() => planHistoricalOrderPersonLinks("stem", [{ order: { ...order, organizationId: "foreign" }, providerCustomerId: "customer-1" }], [identity], people));
 assert.throws(() => planHistoricalOrderPersonLinks("stem", [{ order, providerCustomerId: "customer-1" }, { order, providerCustomerId: "customer-1" }], [identity], people));
});
test("already linked historical orders are not relinked", () => {
 const plan = planHistoricalOrderPersonLinks("stem", [{ order: { ...order, personId: "person-1" }, providerCustomerId: "customer-1" }], [identity], people);
 assert.equal(plan.alreadyLinked, 1);
 assert.equal(plan.linkable, 0);
});
test("conflicting person assignment is unresolved", () => {
 const plan = planHistoricalOrderPersonLinks("stem", [{ order: { ...order, personId: "other" }, providerCustomerId: "customer-1" }], [identity], people);
 assert.equal(plan.unresolved, 1);
});
