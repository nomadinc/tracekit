import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { auditHistoryPagination, auditHistoryScope } from "../lib/identity/audit-history";
import { ACTOR_HINT_KEYS, callerHintsMatch, OPERATIONAL_ACCESS_POLICY, TENANT_HINT_KEYS } from "../lib/identity/operational-tenant-boundary";
import { ROLE_PERMISSIONS } from "../lib/identity/permissions";
import { PRODUCTION_V1_RELEASE_REQUIREMENTS } from "../lib/mcp/production-v1-acceptance";

const root = new URL("..", import.meta.url);
const source = (path: string) => readFileSync(new URL(path, root), "utf8");

test("M4.2 preserves the authoritative execution and audit role policy", () => {
  for (const role of ["platform-owner", "platform-admin", "organization-owner"] as const) assert.ok(ROLE_PERMISSIONS[role].includes("actions.execute"));
  for (const role of ["organization-admin", "agency-owner", "agency-admin", "team-member", "client-read-only"] as const) assert.equal(ROLE_PERMISSIONS[role].includes("actions.execute" as never), false);
  for (const role of ["platform-owner", "platform-admin", "organization-owner", "organization-admin", "support", "billing", "read-only-operations"] as const) assert.ok(ROLE_PERMISSIONS[role].includes("audit_logs.view"));
});

test("M4.2 operational permissions are explicit and do not broaden provider execution", () => {
  assert.deepEqual(OPERATIONAL_ACCESS_POLICY, { workItemRead: "organizations.view", workItemTransition: "actions.execute", notificationRead: "organizations.view", notificationUpdate: "actions.execute", auditRead: "audit_logs.view" });
});

test("M4.2 rejects foreign malformed tenant and spoofed actor hints", () => {
  const org = "8f6bb14b-2126-49b8-bfdb-c60edbc3549b", actor = "user-1";
  assert.equal(callerHintsMatch({ workspace_id: org }, TENANT_HINT_KEYS, org), true);
  assert.equal(callerHintsMatch({ workspace_id: "foreign" }, TENANT_HINT_KEYS, org), false);
  assert.equal(callerHintsMatch({ organizationId: "not-a-uuid" }, TENANT_HINT_KEYS, org), false);
  assert.equal(callerHintsMatch({ actor_id: "attacker" }, ACTOR_HINT_KEYS, actor), false);
});

test("M4.2 Work Item and Notification routes derive scope and actor before the admin-secret boundary", () => {
  const proxy = source("lib/identity/scoped-core-proxy.ts");
  for (const route of ["app/api/work-items/route.ts", "app/api/work-items/[...workItemPath]/route.ts", "app/api/notifications/route.ts", "app/api/notifications/[...notificationPath]/route.ts"]) {
    assert.match(source(route), /scopedCore(Get|Post)/);
  }
  assert.match(proxy, /resolveApplicationSession/);
  assert.match(proxy, /params\.getAll\(key\)\.every/);
  assert.match(proxy, /params\.set\("workspace_id", scope\.workspaceId\)/);
  assert.match(proxy, /sanitized\.workspace_id = scope\.workspaceId/);
  assert.match(proxy, /sanitized\.actor_id = scope\.session\.user\.id/);
  assert.ok(proxy.indexOf("queryMatchesScope(params") < proxy.indexOf("const secret = adminSecret()"));
  assert.ok(proxy.lastIndexOf("bodyMatchesScope") < proxy.lastIndexOf("const secret = adminSecret()"));
});

test("M4.2 foreign object IDs remain non-disclosing under server workspace scope", () => {
  const core = source("../api/src/work-items.ts");
  assert.match(core, /eq\("workspace_id", workspaceId\)\.eq\("id", workItemId\)/);
  assert.match(core, /error\.status = 404/);
  assert.match(core, /work_item_not_found/);
});

test("M4.2 Work Item transitions retain graph checks and authenticated activity actor", () => {
  const core = source("../api/src/work-items.ts"), route = source("app/api/work-items/[...workItemPath]/route.ts");
  assert.match(core, /Only open Work Items can be acknowledged/);
  assert.match(core, /Only open or acknowledged Work Items can be started/);
  assert.match(core, /Only active Work Items can be resolved/);
  assert.match(core, /Only resolved or dismissed Work Items can be reopened/);
  assert.match(route, /workItemTransition, \{ includeActor: true \}/);
});

test("M4.2 audit view is permission bounded paginated and Admin Client View tenant-scoped", () => {
  const session = { effectivePermissions: ["audit_logs.view"], activeOrganization: { id: "org-1" }, activeAccount: { id: "platform-1", accountType: "platform" } } as any;
  assert.deepEqual(auditHistoryScope(session), { accountId: "platform-1", organizationId: "org-1", platformWide: false });
  assert.deepEqual(auditHistoryPagination(new URLSearchParams("limit=999&cursor=-2")), { limit: 100, cursor: 0 });
  const route = source("app/api/audit-events/route.ts");
  assert.match(route, /auditHistoryScope\(resolution\.session\)/);
  assert.doesNotMatch(route, /searchParams\.get\(["'](?:organization|workspace)/);
  assert.match(source("components/identity/audit-history.tsx"), /AccessBoundary permission="audit_logs\.view"/);
});

test("M4.2 release evaluator exposes each production evidence gate independently", () => {
  for (const gate of ["permission_rbac", "tenant_negative_reads", "tenant_negative_mutations", "authorized_work_item_transitions", "audit_visibility"]) assert.ok(PRODUCTION_V1_RELEASE_REQUIREMENTS.includes(gate as any));
});
