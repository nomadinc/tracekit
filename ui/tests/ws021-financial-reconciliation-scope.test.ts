import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createScopedCoreProxy } from "../lib/identity/scoped-core-runtime";
import { financialReconciliationQuery } from "../lib/financial-reconciliation";
import { projectCoreCustomerRead } from "../lib/identity/core-read-projection";

const clientPath = "ui/app/(app)/dashboard/financial-reconciliation/financial-reconciliation-client.tsx";
const client = readFileSync(new URL("../app/(app)/dashboard/financial-reconciliation/financial-reconciliation-client.tsx", import.meta.url), "utf8");
const original = execFileSync("git", ["show", `57eaec27b4b5022ec5ba5e81c0cdcb3182c150f3:${clientPath}`], { cwd: new URL("../..", import.meta.url), encoding: "utf8" });

// Execute the real page's request argument, rather than a separately copied URL.
function pageQuery(source: string) {
  const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "financialReconciliationQuery") expression = node.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(expression);
  return financialReconciliationQuery(runInNewContext(`(${expression.getText(ast)})`, {
    WORKSPACE_ID: "default", range: { from: "2026-09-01", to: "2026-09-30" }, platform: "shopify",
    account: "", eventType: "all", state: "all", confidence: "all", needsReview: false,
  }));
}
function gateway(organization: string, permissions = ["orders.view", "financials.view", "orders.view_financials"], upstream = Response.json({ ok: true, partial: false, items: [] })) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const session: any = {
    user: { id: "test-user", status: "active" },
    membership: { id: "test-member", userId: "test-user", role: "client-read-only", status: "active", effectiveFrom: "2020-01-01T00:00:00Z", organizationId: organization },
    activeOrganization: { id: organization }, availableOrganizations: [{ id: organization }],
    effectivePermissions: permissions,
  };
  const proxy = createScopedCoreProxy({ resolveSession: async () => ({ kind: "authenticated", session }),
    apiBaseUrl: () => "https://core.example.test", adminSecret: () => "synthetic-local-test",
    fetch: async (input, init) => { calls.push({ url: String(input), init }); return upstream.clone(); } });
  return { proxy, session, calls };
}
const financial = ["financials.view", "orders.view_financials"] as const;
for (const organization of ["8f6bb14b-2126-49b8-bfdb-c60edbc3549b", "ab757103-4ad9-4fd8-a3f1-3f5adaee9b03"]) {
  test(`original default-workspace request rejects before transport for ${organization}`, async () => {
    const x = gateway(organization);
    assert.equal((await x.proxy.scopedCoreGet("/v1/financial-reconciliation", "https://ui.example.test" + pageQuery(original), financial)).status, 404);
    assert.equal(x.calls.length, 0);
  });
  test(`corrected real page request uses server-selected organization ${organization}`, async () => {
    const x = gateway(organization);
    const query = pageQuery(client);
    assert.equal(new URL(query, "https://ui.example.test").searchParams.has("workspace_id"), false);
    assert.equal((await x.proxy.scopedCoreGet("/v1/financial-reconciliation", "https://ui.example.test" + query, financial)).status, 200);
    const upstream = new URL(x.calls[0].url);
    assert.equal(upstream.pathname, "/v1/financial-reconciliation");
    assert.deepEqual(upstream.searchParams.getAll("workspace_id"), [organization]);
    assert.equal(upstream.searchParams.get("from"), "2026-09-01");
    assert.equal(upstream.searchParams.get("platform"), "shopify");
  });
}
test("filters and mutation body never assert a browser tenant", () => {
  const ast = ts.createSourceFile("page.tsx", client, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const tenantKeys = new Set(["workspace_id", "workspaceId", "organization_id", "organizationId"]);
  function visit(node: ts.Node) {
    if (ts.isPropertyAssignment(node)) assert.equal(tenantKeys.has(node.name.getText(ast).replace(/["']/g, "")), false);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(client.includes("WORKSPACE_ID"), false);
});
test("foreign, default and duplicate scope substitutions remain denied", async () => {
  for (const hints of ["workspace_id=default", "organization_id=foreign", "workspace_id=stem&workspace_id=foreign"]) {
    const x = gateway("stem");
    assert.equal((await x.proxy.scopedCoreGet("/v1/financial-reconciliation", `https://ui.example.test/api/financial-reconciliation?${hints}`, financial)).status, 404);
    assert.equal(x.calls.length, 0);
  }
});
test("aggregate-only customer permission cannot read details or submit decisions", async () => {
  const x = gateway("stem", ["orders.view", "financials.view"]);
  assert.equal((await x.proxy.scopedCoreGet("/v1/financial-reconciliation", "https://ui.example.test/api/financial-reconciliation", financial)).status, 404);
  assert.equal((await x.proxy.scopedCorePost("/v1/financial-reconciliation/matches", new Request("https://ui.example.test/api/financial-reconciliation/matches", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), ["financials.reconcile", "orders.view_financials"])).status, 404);
  assert.equal(x.calls.length, 0);
});
test("authorized decision gets tenant and actor from server without browser hints", async () => {
  const x = gateway("stem", [...financial, "financials.reconcile"]);
  const result = await x.proxy.scopedCorePost("/v1/financial-reconciliation/matches", new Request("https://ui.example.test/api/financial-reconciliation/matches", { method: "POST", headers: { "content-type": "application/json", origin: "https://ui.example.test" }, body: JSON.stringify({ financial_event_id: "fixture", decision_type: "ignore", reason: "test", idempotency_key: "local-test" }) }), ["financials.reconcile", "orders.view_financials"], { includeActor: true });
  assert.equal(result.status, 200);
  const body = JSON.parse(String(x.calls[0].init?.body));
  assert.equal(body.workspace_id, "stem"); assert.equal(body.actor_id, "test-user");
});
test("unavailable stays unavailable, genuine zero and partial evidence survive redaction", async () => {
  const x = gateway("stem", [...financial], Response.json({ ok: true, partial: true, partial_reason: "bounded source", items: [{ amount: 0, email: "private@example.test", raw: { secret: "excluded" } }] }));
  const result: any = await x.proxy.scopedCoreGet("/v1/financial-reconciliation", "https://ui.example.test/api/financial-reconciliation", financial, projectCoreCustomerRead);
  assert.equal(result.body.partial, true); assert.equal(result.body.items[0].amount, 0);
  assert.equal(result.body.items[0].email, undefined); assert.equal(result.body.items[0].raw, undefined);
  const failed = gateway("stem", [...financial], Response.json({ error: "private provider detail" }, { status: 503 }));
  const denied = await failed.proxy.scopedCoreGet("/v1/financial-reconciliation", "https://ui.example.test/api/financial-reconciliation", financial);
  assert.equal(denied.status, 503); assert.equal("summary" in denied.body, false);
});
