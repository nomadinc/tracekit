import assert from "node:assert/strict";
import test from "node:test";
import { createScopedCoreProxy, type CustomerReadDiagnostic } from "../lib/identity/scoped-core-runtime";

const nh = "ab757103-4ad9-4fd8-a3f1-3f5adaee9b03";
const stem = "8f6bb14b-2126-49b8-bfdb-c60edbc3549b";
const context = "client-" + nh;
const person = "8129566a-4fc7-438d-ad6d-417ec3745358";
const session = (org: string, bc: string | null = null, permissions = ["customers.view"]) => ({
  user: { id: "test-actor", status: "active" },
  membership: { id: "test-membership", status: "active", effectiveFrom: "2020-01-01T00:00:00Z" },
  activeOrganization: { id: org },
  activeBusinessContextId: bc,
  availableOrganizations: [{ id: org }],
  effectivePermissions: permissions,
});
function harness(org: string, bc: string | null = null, permissions = ["customers.view"], fetcher: typeof fetch = async () => Response.json({ ok: true })) {
  const events: CustomerReadDiagnostic[] = [];
  const calls: URL[] = [];
  const gateway = createScopedCoreProxy({
    resolveSession: async () => ({ kind: "authenticated", session: session(org, bc, permissions) as any }),
    apiBaseUrl: () => "https://core.example",
    adminSecret: () => "synthetic-test-secret",
    fetch: (async (input: any) => { calls.push(new URL(String(input))); return fetcher(input); }) as typeof fetch,
    customerReadDiagnostic: event => events.push(event),
  });
  const read = (route: string, project?: (body: any) => unknown) =>
    gateway.scopedCoreGet(route.startsWith("/api/customers/") ? "/v1/customers/" + route.split("?")[0].split("/").at(-1) : "/v1/customers",
      "https://app.example" + route, "customers.view", project);
  return { events, calls, read };
}
test("authorized NH and Stem Customer List and Detail use only the active workspace", async () => {
  for (const org of [nh, stem]) {
    const h = harness(org, org === nh ? context : "stem-context");
    for (const route of ["/api/customers", "/api/customers/" + person]) {
      const result = await h.read(route + "?workspace_id=" + org);
      assert.equal(result.status, 200);
    }
    assert.equal(h.events.length, 0);
    assert.equal(h.calls.length, 2);
    assert.ok(h.calls.every(url => url.searchParams.get("workspace_id") === org));
  }
});
test("invalid and foreign customer IDs remain generic upstream denials", async () => {
  for (const id of ["not-a-person", "foreign-person-id"]) {
    const h = harness(nh, context, ["customers.view"], async () => Response.json({ error: "private upstream reason" }, { status: 404 }));
    const result = await h.read("/api/customers/" + id);
    assert.equal(result.status, 404);
    assert.deepEqual(result.body, { error: "The requested resource is unavailable." });
    assert.equal(h.events[0].stage, "core_upstream_status");
    assert.equal(h.events[0].upstreamStatus, 404);
  }
});
test("wrong tenant and wrong Business Context reject before transport", async () => {
  for (const [query, stage] of [["workspace_id=" + stem, "tenant_hint_mismatch"], ["business_context_id=wrong", "business_context_mismatch"]] as const) {
    const h = harness(nh, context);
    const result = await h.read("/api/customers?" + query);
    assert.equal(result.status, 404);
    assert.equal(h.calls.length, 0);
    assert.equal(h.events[0].stage, stage);
    assert.equal(h.events[0].organizationId, nh);
    assert.equal(h.events[0].businessContextId, context);
  }
});
test("missing customers.view denies before Core", async () => {
  const h = harness(nh, context, []);
  assert.equal((await h.read("/api/customers")).status, 404);
  assert.equal(h.events[0].stage, "session_scope");
  assert.equal(h.calls.length, 0);
});
test("transport and projection failures are classified with generic bodies", async () => {
  const transport = harness(nh, context, ["customers.view"], async () => { throw Error("private transport error"); });
  const a = await transport.read("/api/customers");
  assert.equal(a.status, 503);
  assert.equal(transport.events[0].stage, "core_transport");
  const projection = harness(nh, context);
  const b = await projection.read("/api/customers/" + person, () => { throw Error("private projection error"); });
  assert.equal(b.status, 503);
  assert.equal(projection.events[0].stage, "projection_failure");
  assert.equal(projection.events[0].upstreamStatus, 200);
  assert.ok(!JSON.stringify([a.body,b.body,transport.events,projection.events]).includes("private"));
});
test("diagnostics redact IDs and use a stable per-request correlation ID", async () => {
  const h = harness(nh, context);
  await h.read("/api/customers/" + person + "?business_context_id=wrong");
  await h.read("/api/customers/" + person + "?business_context_id=wrong");
  assert.equal(h.events.length, 2);
  for (const event of h.events) {
    assert.equal(event.route, "/api/customers/:customerId");
    assert.match(event.correlationId, /^[0-9a-f-]{36}$/);
    assert.equal(event.organizationId, nh);
    assert.equal(event.businessContextId, context);
    assert.ok(!JSON.stringify(event).includes(person));
    assert.ok(!JSON.stringify(event).includes("test-actor"));
  }
  assert.notEqual(h.events[0].correlationId, h.events[1].correlationId);
});
