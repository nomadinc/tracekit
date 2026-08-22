import assert from "node:assert/strict";
import test from "node:test";
import { resolveDefaultLanding } from "../lib/identity/default-landing";
import type { Permission, Role } from "../lib/identity/permissions";

function session(role: Role, permissions: Permission[], businessContexts = 0) {
  return {
    role,
    effectivePermissions: permissions,
    accessibleBusinessContexts: Array.from({ length: businessContexts }, (_, index) => ({ id: `ctx-${index}` })) as never[],
  };
}

test("analyst lands on Mission Control when a Business Context is accessible", () => {
  assert.equal(resolveDefaultLanding(session("analyst-operator", ["customers.view"], 1)), "/");
});

test("analyst without Business Context falls back to Customers", () => {
  assert.equal(resolveDefaultLanding(session("analyst-operator", ["customers.view", "orders.view"])), "/customers");
});

test("finance without Business Context prefers Money", () => {
  assert.equal(resolveDefaultLanding(session("finance", ["financials.view", "orders.view"])), "/money");
});

test("customer support without Business Context prefers Customers", () => {
  assert.equal(resolveDefaultLanding(session("customer-support", ["customers.view", "orders.view"])), "/customers");
});

test("resolver skips denied preferred destinations", () => {
  assert.equal(resolveDefaultLanding(session("analyst-operator", ["orders.view"])), "/orders");
});

test("resolver uses access-pending when no preferred destination is authorized", () => {
  assert.equal(resolveDefaultLanding(session("analyst-operator", [])), "/access-pending");
});
