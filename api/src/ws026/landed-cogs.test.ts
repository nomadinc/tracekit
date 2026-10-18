import assert from "node:assert/strict";
import test from "node:test";
import { calculateLandedCogs, type CostLine, type CostRule } from "./landed-cogs.ts";
const rule: CostRule = { id: "v1", organizationId: "stem", connectionId: "shopify", providerAccountId: "account", providerProductId: "4-treatments", currency: "USD", effectiveFrom: "2026-09-01T00:00:00Z", effectiveTo: "2026-11-01T00:00:00Z", packageCostCents: 902 };
const line: CostLine = { organizationId: "stem", connectionId: "shopify", providerAccountId: "account", providerProductId: "4-treatments", currency: "USD", occurredAt: "2026-10-15T00:00:00Z", quantity: 1 };
test("exact product, tenant and historical cost", () => assert.deepEqual(calculateLandedCogs(line, [rule]), { status: "ready", amountCents: 902, ruleId: "v1", quantity: 1 }));
test("multi-unit order uses integer cents", () => assert.deepEqual(calculateLandedCogs({ ...line, quantity: 3 }, [rule]), { status: "ready", amountCents: 2706, ruleId: "v1", quantity: 3 }));
test("effective-date boundary preserves historical version", () => {
 const v2 = { ...rule, id: "v2", effectiveFrom: rule.effectiveTo!, effectiveTo: null, packageCostCents: 1050 };
 assert.equal(calculateLandedCogs(line, [rule, v2]).status, "ready");
 assert.deepEqual(calculateLandedCogs({ ...line, occurredAt: v2.effectiveFrom }, [rule, v2]), { status: "ready", amountCents: 1050, ruleId: "v2", quantity: 1 });
});
test("foreign organization and provider account denied", () => {
 assert.deepEqual(calculateLandedCogs({ ...line, organizationId: "foreign" }, [rule]), { status: "unavailable", reason: "missing_rule" });
 assert.deepEqual(calculateLandedCogs({ ...line, providerAccountId: "foreign" }, [rule]), { status: "unavailable", reason: "missing_rule" });
});
test("missing mapping is not zero", () => assert.deepEqual(calculateLandedCogs(line, []), { status: "unavailable", reason: "missing_rule" }));
test("overlapping rules refuse ambiguous costs", () => assert.deepEqual(calculateLandedCogs(line, [rule, { ...rule, id: "duplicate" }]), { status: "unavailable", reason: "ambiguous_rule" }));
test("invalid quantities are refused", () => assert.deepEqual(calculateLandedCogs({ ...line, quantity: 0 }, [rule]), { status: "unavailable", reason: "invalid_input" }));
test("repeat application is deterministic and input is unchanged", () => {
 const before = JSON.stringify({ line, rule });
 assert.deepEqual(calculateLandedCogs(line, [rule]), calculateLandedCogs(line, [rule]));
 assert.equal(JSON.stringify({ line, rule }), before);
});

test("Stem Labs approved landed package costs remain per package, not per treatment", () => {
  const packages = [
    ["4-treatments", 902],
    ["12-treatments", 1932],
    ["20-treatments", 2801],
    ["eye-patches", 350],
  ] as const;
  for (const [providerProductId, packageCostCents] of packages) {
    const actual = calculateLandedCogs({ ...line, providerProductId, quantity: 1 }, [{ ...rule, providerProductId, packageCostCents }]);
    assert.deepEqual(actual, { status: "ready", amountCents: packageCostCents, ruleId: "v1", quantity: 1 });
  }
});
test("rejects malformed dates, reversed effective intervals and fractional costs", () => {
  assert.deepEqual(calculateLandedCogs(line, [{ ...rule, effectiveFrom: "yesterday" }]), { status: "unavailable", reason: "invalid_rule" });
  assert.deepEqual(calculateLandedCogs(line, [{ ...rule, effectiveTo: "2026-08-01T00:00:00Z" }]), { status: "unavailable", reason: "invalid_rule" });
  assert.deepEqual(calculateLandedCogs(line, [{ ...rule, packageCostCents: 9.02 }]), { status: "unavailable", reason: "invalid_rule" });
  assert.deepEqual(calculateLandedCogs({ ...line, occurredAt: "October 15" }, [rule]), { status: "unavailable", reason: "invalid_input" });
});
test("rejects unsafe integer overflow", () => {
  assert.deepEqual(calculateLandedCogs({ ...line, quantity: Number.MAX_SAFE_INTEGER }, [rule]), { status: "unavailable", reason: "amount_overflow" });
});
test("rejects currency mismatch and foreign connection without fallback", () => {
  assert.deepEqual(calculateLandedCogs({ ...line, currency: "EUR" }, [rule]), { status: "unavailable", reason: "missing_rule" });
  assert.deepEqual(calculateLandedCogs({ ...line, connectionId: "other" }, [rule]), { status: "unavailable", reason: "missing_rule" });
});
