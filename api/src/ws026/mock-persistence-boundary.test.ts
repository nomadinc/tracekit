import assert from "node:assert/strict";
import test from "node:test";
import { requestExactIdentityLink, type PersistenceBoundary, type IdentityRequest, type IdentityOutcome } from "./mock-persistence-boundary.ts";
import type { ScopedOrder, ScopedCustomerIdentity } from "./exact-order-person-link.ts";
const scope = { organizationId: "stem", connectionId: "next29", providerAccountId: "merchant", actorId: "operator" };
const request: IdentityRequest = { authorizedScope: scope, canonicalOrderId: "order-1", providerOrderId: "provider-1", providerCustomerId: "customer-1", evidenceId: "evidence-1", idempotencyKey: "key-1" };
const order: ScopedOrder = { canonicalOrderId: "order-1", organizationId: "stem", connectionId: "next29", providerAccountId: "merchant", personId: null };
const identity: ScopedCustomerIdentity = { organizationId: "stem", connectionId: "next29", providerAccountId: "merchant", sourceType: "provider_customer_id", sourceId: "customer-1", personId: "person-1" };
const evidence = { order, identities: [identity], people: [{ id: "person-1", organizationId: "stem" }] };
function mockBoundary(identityWriter: (r: IdentityRequest) => Promise<IdentityOutcome>): PersistenceBoundary {
  return {
    resolveAndAttachNext29OrderPerson: identityWriter,
    publishCostRuleVersion: async () => ({ status: "unresolved", reason: "not_implemented" }),
    applyOrderLineCostVersion: async () => ({ status: "unresolved", reason: "not_implemented" }),
  };
}
test("mock boundary receives exact scoped request", async () => {
 let calls = 0;
 const result = await requestExactIdentityLink(mockBoundary(async r => {
   calls++; assert.deepEqual(r, request); return { status: "linked", personId: "person-1" };
 }), request, evidence);
 assert.equal(calls, 1); assert.deepEqual(result, { status: "linked", personId: "person-1" });
});
test("already-linked advisory decision delegates and receives unchanged", async () => {
 const result = await requestExactIdentityLink(mockBoundary(async () => ({ status: "unchanged", personId: "person-1" })),
   request, { ...evidence, order: { ...order, personId: "person-1" } });
 assert.equal(result.status, "unchanged");
});
test("missing evidence never calls writer", async () => {
 let calls = 0;
 const result = await requestExactIdentityLink(mockBoundary(async () => { calls++; return { status: "linked", personId: "person-1" }; }),
   { ...request, providerCustomerId: "" }, evidence);
 assert.deepEqual(result, { status: "unresolved", reason: "missing_identity" });
 assert.equal(calls, 0);
});
test("foreign tenant and conflicting identity fail before writer", async () => {
 let calls = 0;
 const writer = mockBoundary(async () => { calls++; return { status: "linked", personId: "person-1" }; });
 assert.equal((await requestExactIdentityLink(writer, { ...request, authorizedScope: { ...scope, organizationId: "other" } }, evidence)).status, "conflict");
 assert.equal((await requestExactIdentityLink(writer, request, { ...evidence, order: { ...order, personId: "other" } })).status, "conflict");
 assert.equal(calls, 0);
});
test("authoritative denial and idempotency conflict remain explicit", async () => {
 for (const reason of ["authorization_denied", "idempotency_conflict"] as const) {
   const result = await requestExactIdentityLink(mockBoundary(async () => ({ status: "conflict", reason })), request, evidence);
   assert.deepEqual(result, { status: "conflict", reason });
 }
});
test("mocked concurrency only verifies adapter propagation", async () => {
 let calls = 0;
 const writer = mockBoundary(async () => { calls++; return calls === 1 ? { status: "linked", personId: "person-1" } : { status: "unchanged", personId: "person-1" }; });
 const results = await Promise.all([requestExactIdentityLink(writer, request, evidence), requestExactIdentityLink(writer, request, evidence)]);
 assert.deepEqual(results.map(x => x.status).sort(), ["linked", "unchanged"]);
 assert.equal(calls, 2);
});
test("mock financial boundaries preserve explicit results", async () => {
 const boundary = mockBoundary(async () => ({ status: "unresolved", reason: "not_implemented" }));
 assert.deepEqual(await boundary.publishCostRuleVersion({ authorizedScope: scope, exactProductReference: "4", currency: "USD", effectiveFrom: "2026-09-01T00:00:00Z", effectiveUntil: null, unitCostDecimal: "9.02", quantityBasis: "package", provenance: "merchant", idempotencyKey: "cost-1" }), { status: "unresolved", reason: "not_implemented" });
 assert.deepEqual(await boundary.applyOrderLineCostVersion({ authorizedScope: scope, canonicalOrderId: "order-1", orderLineId: "line-1", expectedLineVersion: "v1", ruleVersionId: "cost-v1", idempotencyKey: "apply-1" }), { status: "unresolved", reason: "not_implemented" });
});
