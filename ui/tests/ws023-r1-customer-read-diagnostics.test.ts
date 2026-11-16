import assert from "node:assert/strict";
import test from "node:test";
import { createScopedCoreProxy, customerDiagnosticRoute, type CustomerReadDiagnostic } from "../lib/identity/scoped-core-runtime";

const nh = "ab757103-4ad9-4fd8-a3f1-3f5adaee9b03";
const stem = "8f6bb14b-2126-49b8-bfdb-c60edbc3549b";
const person = "8129566a-4fc7-438d-ad6d-417ec3745358";
const session = (org: string, permissions: string[] = ["customers.view"]) => ({
  user: { id: "synthetic-actor", status: "active" },
  membership: { id: "synthetic-membership", status: "active", effectiveFrom: "2020-01-01T00:00:00Z" },
  activeOrganization: { id: org }, availableOrganizations: [{ id: org }],
  activeBusinessContextId: "client-" + org, effectivePermissions: permissions,
});
function fixture(org: string, options: { permissions?: string[]; response?: () => Promise<Response>; sink?: (event: CustomerReadDiagnostic) => void } = {}) {
  const events: CustomerReadDiagnostic[] = [], calls: URL[] = [];
  const proxy = createScopedCoreProxy({
    resolveSession: async () => ({ kind: "authenticated", session: session(org, options.permissions) as any }),
    apiBaseUrl: () => "https://core.synthetic", adminSecret: () => "synthetic",
    fetch: (async (input: any) => { calls.push(new URL(String(input))); return options.response ? options.response() : Response.json({ ok: true, customers: [] }); }) as typeof fetch,
    customerReadDiagnostic: options.sink || (event => events.push(event)),
  });
  const read = (path: string, project?: (body: any) => unknown) =>
    proxy.scopedCoreGet(path.startsWith("/api/customers/") ? "/v1/customers/" + path.split("?")[0].split("/").at(-1) : "/v1/customers", "https://ui.synthetic" + path, "customers.view", project);
  return { read, events, calls };
}
test("D1 matches exactly Customer List and single-segment Detail", () => {
  assert.equal(customerDiagnosticRoute("/api/customers"), "/api/customers");
  assert.equal(customerDiagnosticRoute("/api/customers/" + person), "/api/customers/:customerId");
  for (const path of ["/api/customer-orders", "/api/customers/a/extra", "/api/customers/", "/api/customers-extra", "/api/offers"])
    assert.equal(customerDiagnosticRoute(path), null);
});
test("NH and Stem authorized Customer List and Detail preserve scoped Core transport", async () => {
  for (const org of [nh, stem]) {
    const f = fixture(org);
    for (const path of ["/api/customers?limit=50", "/api/customers/" + person]) assert.equal((await f.read(path)).status, 200);
    assert.equal(f.calls.length, 2);
    assert.ok(f.calls.every(url => url.searchParams.get("workspace_id") === org));
    assert.equal(f.events.length, 0);
  }
});
test("invalid and foreign person IDs retain generic upstream 404", async () => {
  for (const id of ["invalid-person", "foreign-person"]) {
    const f = fixture(nh, { response: async () => Response.json({ private: "hidden" }, { status: 404 }) });
    const result = await f.read("/api/customers/" + id);
    assert.equal(result.status, 404);
    assert.deepEqual(result.body, { error: "The requested resource is unavailable." });
    assert.equal(f.events[0].stage, "core_upstream_status");
    assert.equal(f.events[0].upstreamStatus, 404);
  }
});
test("duplicate workspace hints and foreign workspace deny without Core transport", async () => {
  for (const query of ["workspace_id=" + nh + "&workspace_id=" + stem, "workspace_id=" + stem]) {
    const f = fixture(nh);
    assert.equal((await f.read("/api/customers?" + query)).status, 404);
    assert.equal(f.events[0].stage, "tenant_hint_mismatch");
    assert.equal(f.calls.length, 0);
  }
});
test("R1 Business Context query hints remain unchanged and are forwarded, not newly rejected", async () => {
  const f = fixture(nh);
  const result = await f.read("/api/customers?business_context_id=wrong&business_context_id=wrong2");
  assert.equal(result.status, 200);
  assert.deepEqual(f.calls[0].searchParams.getAll("business_context_id"), ["wrong", "wrong2"]);
  assert.equal(f.events.length, 0);
});
test("missing customers.view is denied with effective scope recorded", async () => {
  const f = fixture(nh, { permissions: [] });
  const result = await f.read("/api/customers");
  assert.equal(result.status, 404);
  assert.equal(f.calls.length, 0);
  assert.equal(f.events[0].stage, "session_scope");
  assert.equal(f.events[0].organizationId, nh);
  assert.equal(f.events[0].businessContextId, "client-" + nh);
});
test("transport failure and upstream 404 classify without changing response", async () => {
  const f = fixture(nh, { response: async () => { throw Error("secret private transport"); } });
  const result = await f.read("/api/customers");
  assert.equal(result.status, 503);
  assert.deepEqual(result.body, { error: "The requested data is unavailable." });
  assert.equal(f.events[0].stage, "core_transport");
});
test("projection exceptions are logged and rethrown with the original identity", async () => {
  const f = fixture(nh);
  const error = new Error("private projection failure");
  await assert.rejects(() => f.read("/api/customers/" + person, () => { throw error; }), e => e === error);
  assert.equal(f.events[0].stage, "projection_failure");
  assert.equal(f.events[0].upstreamStatus, 200);
});
test("sink exceptions never change Customer response; other routes are excluded", async () => {
  const f = fixture(nh, { response: async () => Response.json({}, { status: 404 }), sink: () => { throw Error("sink"); } });
  assert.equal((await f.read("/api/customers")).status, 404);
  const events: CustomerReadDiagnostic[] = [];
  const g = fixture(nh, { response: async () => Response.json({}, { status: 404 }), sink: e => events.push(e) });
  const other = await g.read("/api/customer-orders");
  assert.equal(other.status, 404);
  assert.equal(events.length, 0);
});
test("event fields are allowlisted, IDs redacted, and correlation differs by request", async () => {
  const f = fixture(nh, { response: async () => Response.json({}, { status: 404 }) });
  await f.read("/api/customers/" + person);
  await f.read("/api/customers/" + person);
  assert.equal(f.events.length, 2);
  for (const event of f.events) {
    assert.deepEqual(Object.keys(event).sort(), ["correlationId", "route", "deploymentId", "organizationId", "businessContextId", "stage", "upstreamStatus"].sort());
    assert.equal(event.route, "/api/customers/:customerId");
    assert.ok(!JSON.stringify(event).includes(person));
    assert.ok(!JSON.stringify(event).includes("synthetic-actor"));
  }
  assert.notEqual(f.events[0].correlationId, f.events[1].correlationId);
});
