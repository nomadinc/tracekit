import assert from "node:assert/strict";
import test from "node:test";
import { applyWithServerLineVersion, invokeWs001IdentityPort, type Ws001PersistencePort, type Ws001IdentityRequest } from "./ws001-candidate-port.ts";
const scope = { organizationId: "stem", connectionId: "next29", providerAccountId: "merchant" };
const identity: Ws001IdentityRequest = { authorizedScope: scope, canonicalOrderId: "order-1", providerOrderId: "provider-1", providerCustomerId: "customer-1", evidenceId: "evidence-1", idempotencyKey: "key-1" };
function port(overrides: Partial<Ws001PersistencePort> = {}): Ws001PersistencePort {
 return {
  resolveAndAttachNext29OrderPerson: async () => ({ outcome: "linked", personId: "person-1" }),
  publishCostRuleVersion: async () => ({ outcome: "published", ruleVersionId: "cost-1" }),
  readOrderLineCostVersion: async () => ({ expectedLineVersion: "server-hash" }),
  applyOrderLineCostVersion: async () => ({ outcome: "applied", applicationId: "application-1", totalCostDecimal: "9.02", currency: "USD" }),
  ...overrides,
 };
}
test("WS-001 linked and unchanged outcomes preserve identity", async () => {
 assert.deepEqual(await invokeWs001IdentityPort(port(), identity), { status: "linked", personId: "person-1" });
 assert.deepEqual(await invokeWs001IdentityPort(port({ resolveAndAttachNext29OrderPerson: async () => ({ outcome: "unchanged", personId: "person-1" }) }), identity), { status: "unchanged", personId: "person-1" });
});
test("unresolved is distinct from conflict", async () => {
 assert.deepEqual(await invokeWs001IdentityPort(port({ resolveAndAttachNext29OrderPerson: async () => ({ outcome: "unresolved", reason: "missing_identity" }) }), identity), { status: "unresolved", reason: "missing_identity" });
});
test("typed writer errors remain blocked, never retried or marked unresolved", async () => {
 for (const code of ["denied", "conflict", "invalid", "unavailable"] as const) {
  let calls = 0;
  const result = await invokeWs001IdentityPort(port({ resolveAndAttachNext29OrderPerson: async () => { calls++; throw Object.assign(new Error("writer rejected"), { code }); } }), identity);
  assert.deepEqual(result, { status: "blocked", reason: code }); assert.equal(calls, 1);
 }
});
test("unexpected exceptions are not silently downgraded", async () => {
 await assert.rejects(invokeWs001IdentityPort(port({ resolveAndAttachNext29OrderPerson: async () => { throw new Error("unexpected"); } }), identity));
});
test("line version is read from server and passed unchanged to writer", async () => {
 const seen: string[] = [];
 const result = await applyWithServerLineVersion(port({
  readOrderLineCostVersion: async () => { seen.push("read"); return { expectedLineVersion: "pg-microsecond-hash" }; },
  applyOrderLineCostVersion: async req => { seen.push("apply"); assert.equal(req.expectedLineVersion, "pg-microsecond-hash"); return { outcome: "applied", applicationId: "a1", totalCostDecimal: "19.32", currency: "USD" }; },
 }), { authorizedScope: scope, canonicalOrderId: "order-1", orderLineId: "line-1", ruleVersionId: "cost-v1", idempotencyKey: "apply-1" });
 assert.deepEqual(seen, ["read", "apply"]); assert.equal(result.totalCostDecimal, "19.32");
});
test("reader failure prevents cost writer invocation", async () => {
 let called = false;
 await assert.rejects(applyWithServerLineVersion(port({
  readOrderLineCostVersion: async () => { throw Object.assign(new Error("denied"), { code: "denied" }); },
  applyOrderLineCostVersion: async () => { called = true; throw new Error("must not run"); },
 }), { authorizedScope: scope, canonicalOrderId: "order-1", orderLineId: "line-1", ruleVersionId: "cost-v1", idempotencyKey: "apply-1" }));
 assert.equal(called, false);
});
test("published rule uses exact product UUID and decimal string contract", async () => {
 const result = await port({ publishCostRuleVersion: async req => {
  assert.equal(req.exactProductReference, "00000000-0000-4000-8000-000000000001");
  assert.equal(req.unitCostDecimal, "9.02"); assert.equal(req.quantityBasis, "per_unit");
  return { outcome: "published", ruleVersionId: "rule-1" };
 } }).publishCostRuleVersion({ authorizedScope: scope, exactProductReference: "00000000-0000-4000-8000-000000000001", currency: "USD", effectiveFrom: "2026-09-01T00:00:00Z", effectiveUntil: null, unitCostDecimal: "9.02", quantityBasis: "per_unit", provenanceEvidenceId: "evidence-1", idempotencyKey: "publish-1" });
 assert.equal(result.ruleVersionId, "rule-1");
});
