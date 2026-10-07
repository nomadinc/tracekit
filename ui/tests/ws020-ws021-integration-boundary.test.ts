import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
test("combined platform routes use canonical persisted capability checks", () => {
  const bridge = source("../lib/platform/platform-access.ts");
  assert.ok(bridge.includes('requirePersistedPlatformAccess(session, repository, "admin.manage_tenants")'));
  assert.ok(bridge.includes("requirePersistedPlatformAccess(session, repository, permission)"));
  assert.ok(!bridge.includes("commercePersistenceRequest"));
  const route = source("../app/api/platform/admin/route.ts");
  assert.ok(route.indexOf("requireSameOrigin(request)") < route.indexOf("request.json()"));
  assert.ok(route.indexOf('assertCanonicalPlatformMembership(session, "organizations.manage")') < route.indexOf('adminRpc(session, "ws021_create_client"'));
  assert.ok(route.includes('assertCanonicalPlatformMembership(session, body.action === "remove" ? "users.remove" : "users.manage_permissions")'));
  assert.ok(source("../lib/platform/admin-server.ts").includes("assertCanonicalPlatformMembership(resolution.session, permission)"));
});
test("combined Admin Client View retains separate impersonation authorization and support label", () => {
  const route = source("../app/api/session/admin-view/route.ts");
  assert.equal(route.split('requirePersistedPlatformAccess(resolution.session, repository, "admin.impersonate")').length - 1, 2);
  assert.equal(route.split("if (!sameOrigin(request))").length - 1, 2);
  const banner = source("../components/platform/admin-client-view-banner.tsx");
  assert.ok(banner.includes("ADMIN VIEW"));
  assert.ok(banner.includes("support access"));
  assert.ok(banner.includes('method: "DELETE"'));
});
