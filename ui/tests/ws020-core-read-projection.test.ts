import assert from "node:assert/strict";
import test from "node:test";
import { projectCoreCustomerRead } from "../lib/identity/core-read-projection";
import { ROLE_PERMISSIONS } from "../lib/identity/permissions";
import type { TraceKitSessionContext } from "../lib/identity/persistent-types";

function session(permissions: readonly string[]) { return { effectivePermissions: [...permissions] } as TraceKitSessionContext; }
test("client-read-only can read commerce identifiers but cannot read nested financial or sensitive details", () => {
  const permissions = ROLE_PERMISSIONS["client-read-only"];
  assert.ok(permissions.includes("financials.view"));
  assert.ok(permissions.includes("connectors.view"));
  assert.ok(!permissions.includes("orders.view_financials"));
  assert.deepEqual(projectCoreCustomerRead({ customer_id: "person", email: "private@example.test", orders: [{ order_id: "order", gross_amount: 12, status: "COMPLETED", raw_json: { secret: "provider" } }], journey: { phone: "123", revenue: 12, identifiers: ["private@example.test"] } }, session(permissions)), { customer_id: "person", orders: [{ order_id: "order", status: "COMPLETED" }], journey: {} });
});
test("detailed financial access requires both permissions and still excludes raw provider payloads", () => {
  const body = { gross_amount: 0, email: "private@example.test", raw_json: { email: "private@example.test" } };
  assert.deepEqual(projectCoreCustomerRead(body, session(["financials.view"])), {});
  assert.deepEqual(projectCoreCustomerRead(body, session(["financials.view", "orders.view_financials", "customers.view_sensitive_data"])), { gross_amount: 0, email: "private@example.test" });
});

test("restricted financial values in narrative strings and primary identity containers are removed", () => {
  assert.deepEqual(projectCoreCustomerRead({ title: "Order $12.00, refund 4.00 USD", primary_identifier: { type: "phone", value: "123" }, price: 12 }, session(ROLE_PERMISSIONS["client-read-only"])), { title: "Order Restricted, refund Restricted" });
});
