import assert from "node:assert/strict";
import test from "node:test";
import { decideExactOrderPersonLink, type ScopedOrder, type ScopedCustomerIdentity } from "./exact-order-person-link.ts";
const order: ScopedOrder = { canonicalOrderId: "order-1", organizationId: "stem", connectionId: "next29", providerAccountId: "merchant", personId: null };
const identity: ScopedCustomerIdentity = { organizationId: "stem", connectionId: "next29", providerAccountId: "merchant", sourceType: "provider_customer_id", sourceId: "customer-123", personId: "person-1" };
const people = [{ id: "person-1", organizationId: "stem" }];
test("exact existing provider identity links to correct person", () => assert.deepEqual(decideExactOrderPersonLink(order, "customer-123", [identity], people), { status: "link", canonicalOrderId: "order-1", organizationId: "stem", personId: "person-1" }));
test("replay is idempotently already linked", () => assert.equal(decideExactOrderPersonLink({ ...order, personId: "person-1" }, "customer-123", [identity], people).status, "already_linked"));
test("missing provider evidence never guesses identity", () => assert.deepEqual(decideExactOrderPersonLink(order, null, [identity], people), { status: "unavailable", reason: "missing_identity" }));
test("foreign organization and connection cannot match", () => {
 assert.equal(decideExactOrderPersonLink({ ...order, organizationId: "foreign" }, "customer-123", [identity], people).status, "unavailable");
 assert.equal(decideExactOrderPersonLink({ ...order, connectionId: "foreign" }, "customer-123", [identity], people).status, "unavailable");
});
test("foreign organization person is denied even with matching identity", () => assert.deepEqual(decideExactOrderPersonLink(order, "customer-123", [identity], [{ id: "person-1", organizationId: "foreign" }]), { status: "unavailable", reason: "foreign_scope" }));
test("conflicting order relationship cannot be overwritten", () => assert.deepEqual(decideExactOrderPersonLink({ ...order, personId: "other" }, "customer-123", [identity], people), { status: "unavailable", reason: "conflicting_person" }));
test("ambiguous source identities require review", () => assert.deepEqual(decideExactOrderPersonLink(order, "customer-123", [identity, { ...identity, personId: "person-2" }], people), { status: "unavailable", reason: "ambiguous_identity" }));
test("missing person cannot be attached", () => assert.deepEqual(decideExactOrderPersonLink(order, "customer-123", [identity], []), { status: "unavailable", reason: "missing_person" }));
test("identity decision never changes attribution or source evidence", () => {
 const original = JSON.stringify({ order, identity, people });
 decideExactOrderPersonLink(order, "customer-123", [identity], people);
 assert.equal(JSON.stringify({ order, identity, people }), original);
});
