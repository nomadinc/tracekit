import assert from "node:assert/strict";
import test from "node:test";
import { TraceKitMcpActionService } from "../lib/mcp/action-service";
import { resolveEffectivePermissions } from "../lib/identity/persistent-authorization";
import type { TraceKitSessionContext } from "../lib/identity/persistent-types";

function session(): TraceKitSessionContext {
  const membership: any = { id: "m", userId: "u", accountId: "a", organizationId: "stem", role: "client-read-only", status: "active" };
  return { user: { id: "u", status: "active" }, membership, activeOrganization: { id: "stem" }, availableOrganizations: [{ id: "stem" }], effectivePermissions: [...resolveEffectivePermissions(membership, [])] } as TraceKitSessionContext;
}
const methods = ["prepareSyntheticAcceptanceFixture", "prepareInspectEvidence", "confirmInspectEvidence", "inspectEvidence", "prepareApprovedCommasTestDelivery", "prepareCommasTestDelivery", "confirmCommasTestDelivery", "prepareApprovedShopifyControlledProof", "prepareShopifyControlledProof", "confirmShopifyControlledProof", "executeShopifyControlledProof", "executeCommasTestDelivery"] as const;

test("client-read-only cannot reach persistence or provider calls through any MCP action method", async () => {
  const previous = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("must not access persistence or provider"); };
  try {
    const service = new TraceKitMcpActionService(session());
    for (const method of methods) await assert.rejects(() => (service[method] as any).call(service, {}, "plan"), /requested resource is unavailable/, method);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = previous; }
});

test("forged action permission cannot bypass expired membership or unavailable organization", async () => {
  for (const identity of [
    { ...session(), effectivePermissions: ["actions.execute"], availableOrganizations: [] },
    { ...session(), effectivePermissions: ["actions.execute"], membership: { ...session().membership!, effectiveUntil: "2020-01-01T00:00:00Z" } },
    { ...session(), effectivePermissions: ["actions.execute"], user: { ...session().user, status: "suspended" } },
  ]) {
    const service = new TraceKitMcpActionService(identity as TraceKitSessionContext);
    for (const method of methods) await assert.rejects(() => (service[method] as any).call(service, {}, "plan"), /requested resource is unavailable/);
  }
});
