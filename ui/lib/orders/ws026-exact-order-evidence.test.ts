import assert from "node:assert/strict";
import test from "node:test";
import { hasExactOrderIdentity } from "./production-repository.ts";
const order = { id: "canonical-12", number: "12" };
const scope = { organizationId: "stem", workspaceId: "stem" };
test("order 12 cannot match order 3129", () => {
 assert.equal(hasExactOrderIdentity({ order_id: "3129", organization_id: "stem", workspace_id: "stem" }, order, scope), false);
});
test("exact scoped order identity is accepted", () => {
 assert.equal(hasExactOrderIdentity({ order_id: "12", organization_id: "stem", workspace_id: "stem" }, order, scope), true);
});
test("foreign tenant cannot establish order identity", () => {
 assert.equal(hasExactOrderIdentity({ order_id: "12", organization_id: "other", workspace_id: "stem" }, order, scope), false);
});
test("mismatched provider order ID cannot establish link", () => {
 assert.equal(hasExactOrderIdentity({ platform_order_id: "provider-3129", organization_id: "stem" }, order, scope), false);
});
test("untrusted technical metadata and labels cannot establish order identity", () => {
 assert.equal(hasExactOrderIdentity({ technical: { order_id: "12" }, title: "Order 12" }, order, scope), false);
});
