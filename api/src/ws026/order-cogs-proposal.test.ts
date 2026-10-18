import assert from "node:assert/strict";
import test from "node:test";
import { proposeOrderLandedCogs, type OrderCostLine } from "./order-cogs-proposal.ts";
import type { CostRule } from "./landed-cogs.ts";

const base: OrderCostLine = { canonicalOrderId: "order-1", canonicalOrderLineId: "line-1",
  organizationId: "stem", connectionId: "next29", providerAccountId: "merchant",
  providerProductId: "4", currency: "USD", occurredAt: "2026-10-15T00:00:00Z", quantity: 1 };
const rule: CostRule = { id: "cost-v1", organizationId: "stem", connectionId: "next29",
  providerAccountId: "merchant", providerProductId: "4", currency: "USD",
  effectiveFrom: "2026-09-01T00:00:00Z", effectiveTo: null, packageCostCents: 902 };
test("retains per-line rule provenance for multi-product order", () => {
  const second = { ...base, canonicalOrderLineId: "line-2", providerProductId: "5", quantity: 2 };
  const result = proposeOrderLandedCogs([base, second], [rule, { ...rule, id: "cost-v2", providerProductId: "5", packageCostCents: 1932 }]);
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.totalCents, 4766);
  assert.deepEqual(result.lines.map(l => [l.ruleId, l.amountCents]), [["cost-v1", 902], ["cost-v2", 3864]]);
});
test("rejects mixed tenants, orders and currencies", () => {
  assert.equal(proposeOrderLandedCogs([base, { ...base, canonicalOrderLineId: "line-2", organizationId: "other" }], [rule]).status, "unavailable");
  assert.equal(proposeOrderLandedCogs([base, { ...base, canonicalOrderLineId: "line-2", canonicalOrderId: "other" }], [rule]).status, "unavailable");
  assert.equal(proposeOrderLandedCogs([base, { ...base, canonicalOrderLineId: "line-2", currency: "EUR" }], [rule]).status, "unavailable");
});
test("duplicate order line cannot double count COGS", () => {
  assert.deepEqual(proposeOrderLandedCogs([base, base], [rule]), { status: "unavailable", reason: "duplicate_line" });
});
test("missing cost blocks full order proposal rather than silently treating as zero", () => {
  const result = proposeOrderLandedCogs([base, { ...base, canonicalOrderLineId: "line-2", providerProductId: "unknown" }], [rule]);
  assert.equal(result.status, "unavailable");
  if (result.status === "unavailable") assert.equal(result.reason, "line_unavailable");
});
test("proposal is pure and deterministic", () => {
  const snapshot = JSON.stringify({ base, rule });
  assert.deepEqual(proposeOrderLandedCogs([base], [rule]), proposeOrderLandedCogs([base], [rule]));
  assert.equal(JSON.stringify({ base, rule }), snapshot);
});
test("rejects empty order", () => assert.deepEqual(proposeOrderLandedCogs([], [rule]), { status: "unavailable", reason: "invalid_order" }));
