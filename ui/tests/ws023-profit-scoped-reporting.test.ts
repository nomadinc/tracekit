import assert from "node:assert/strict";
import test from "node:test";

import { createScopedCoreProxy } from "../lib/identity/scoped-core-runtime";
import { resolveEffectivePermissions } from "../lib/identity/persistent-authorization";
import type { TraceKitSessionContext } from "../lib/identity/persistent-types";

const permission = [
  "financials.view",
  "orders.view_financials",
] as const;

function session(detailed = false): TraceKitSessionContext {
  const membership: any = {
    id: "membership",
    userId: "user",
    accountId: "account",
    organizationId: "stem",
    role: "client-read-only",
    status: "active",
    effectiveFrom: "2020-01-01T00:00:00Z",
  };

  const effectivePermissions = [
    ...resolveEffectivePermissions(membership, []),
  ];

  if (detailed) {
    effectivePermissions.push("orders.view_financials" as any);
  }

  return {
    user: { id: "user", status: "active" },
    membership,
    activeOrganization: { id: "stem", name: "Stem Labs" },
    availableOrganizations: [{ id: "stem", name: "Stem Labs" }],
    activeAccount: { id: "account" },
    effectivePermissions,
  } as TraceKitSessionContext;
}

function harness(resolution: any) {
  const calls: Array<{ url: string; init: RequestInit }> = [];

  const gateway = createScopedCoreProxy({
    resolveSession: async () => resolution,
    apiBaseUrl: () => "https://core.example.test",
    adminSecret: () => "synthetic-local-test",
    fetch: async (url: any, init: any) => {
      calls.push({ url: String(url), init });

      return Response.json({
        ok: true,
        gross_revenue: 87.29,
        refunds: 0,
        chargebacks: 0,
        net_profit: null,
      });
    },
  });

  return { gateway, calls };
}

test("unauthenticated Profit requests are denied before Core", async () => {
  const h = harness({ kind: "unauthenticated" });

  const result = await h.gateway.scopedCoreGet(
    "/v1/profit/summary",
    "https://ui.example.test/api/profit/summary",
    permission
  );

  assert.equal(result.status, 404);
  assert.equal(h.calls.length, 0);
});

test("client-read-only cannot access detailed Profit", async () => {
  const h = harness({
    kind: "authenticated",
    session: session(false),
  });

  const result = await h.gateway.scopedCoreGet(
    "/v1/profit/summary",
    "https://ui.example.test/api/profit/summary",
    permission
  );

  assert.equal(result.status, 404);
  assert.equal(h.calls.length, 0);
});

test("authorized Profit request uses authenticated organization", async () => {
  const h = harness({
    kind: "authenticated",
    session: session(true),
  });

  const result = await h.gateway.scopedCoreGet(
    "/v1/profit/summary",
    "https://ui.example.test/api/profit/summary?from=2026-10-01&to=2026-10-31&currency=USD",
    permission
  );

  assert.equal(result.status, 200);
  assert.equal(h.calls.length, 1);

  const url = new URL(h.calls[0].url);

  assert.equal(url.pathname, "/v1/profit/summary");
  assert.equal(url.searchParams.get("workspace_id"), "stem");
  assert.equal(url.searchParams.get("from"), "2026-10-01");
  assert.equal(url.searchParams.get("to"), "2026-10-31");
  assert.equal(url.searchParams.get("currency"), "USD");

  assert.equal((result.body as any).net_profit, null);
});

test("foreign workspace is denied before Core", async () => {
  const h = harness({
    kind: "authenticated",
    session: session(true),
  });

  const result = await h.gateway.scopedCoreGet(
    "/v1/profit/summary",
    "https://ui.example.test/api/profit/summary?workspace_id=foreign",
    permission
  );

  assert.equal(result.status, 404);
  assert.equal(h.calls.length, 0);
});

test("conflicting duplicate workspace hints are denied", async () => {
  const h = harness({
    kind: "authenticated",
    session: session(true),
  });

  const result = await h.gateway.scopedCoreGet(
    "/v1/profit/summary",
    "https://ui.example.test/api/profit/summary?workspace_id=stem&workspace_id=foreign",
    permission
  );

  assert.equal(result.status, 404);
  assert.equal(h.calls.length, 0);
});

test("Core transport failure remains unavailable", async () => {
  const gateway = createScopedCoreProxy({
    resolveSession: async () => ({
      kind: "authenticated",
      session: session(true),
    }),
    apiBaseUrl: () => "https://core.example.test",
    adminSecret: () => "synthetic-local-test",
    fetch: async () => {
      throw new Error("offline test failure");
    },
  });

  const result = await gateway.scopedCoreGet(
    "/v1/profit/summary",
    "https://ui.example.test/api/profit/summary",
    permission
  );

  assert.equal(result.status, 503);
});
