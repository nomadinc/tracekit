import assert from "node:assert/strict";
import test from "node:test";

import { projectCoreCustomerRead } from "../lib/identity/core-read-projection";
import { ROLE_PERMISSIONS } from "../lib/identity/permissions";
import type { TraceKitSessionContext } from "../lib/identity/persistent-types";

function session(permissions: readonly string[]) {
  return {
    effectivePermissions: [...permissions],
  } as TraceKitSessionContext;
}

const authorized = session([
  "financials.view",
  "orders.view_financials",
]);

const restricted = session(
  ROLE_PERMISSIONS["client-read-only"]
);

test("authorized financial values remain available", () => {
  const result = projectCoreCustomerRead(
    {
      summary: { lifetime_revenue: 87.29 },
      orders: [{ order_id: "#1053", amount: 87.29 }],
    },
    authorized
  ) as any;

  assert.equal(result.summary.lifetime_revenue, 87.29);
  assert.equal(result.orders[0].amount, 87.29);
});

test("restricted financial values are removed before serialization", () => {
  const result = projectCoreCustomerRead(
    {
      summary: { lifetime_revenue: 87.29 },
      orders: [{ order_id: "#1053", amount: 87.29 }],
    },
    restricted
  ) as any;

  assert.equal(
    Object.hasOwn(result.summary, "lifetime_revenue"),
    false
  );

  assert.equal(
    Object.hasOwn(result.orders[0], "amount"),
    false
  );

  assert.equal(result.orders[0].order_id, "#1053");
});

test("authorized genuine zero remains zero", () => {
  const result = projectCoreCustomerRead(
    {
      summary: { lifetime_revenue: 0 },
      orders: [{ order_id: "zero-order", amount: 0 }],
    },
    authorized
  ) as any;

  assert.equal(result.summary.lifetime_revenue, 0);
  assert.equal(result.orders[0].amount, 0);
});

test("restricted genuine zero is still redacted", () => {
  const result = projectCoreCustomerRead(
    {
      summary: { lifetime_revenue: 0 },
      orders: [{ order_id: "zero-order", amount: 0 }],
    },
    restricted
  ) as any;

  assert.equal(
    Object.hasOwn(result.summary, "lifetime_revenue"),
    false
  );

  assert.equal(
    Object.hasOwn(result.orders[0], "amount"),
    false
  );
});
