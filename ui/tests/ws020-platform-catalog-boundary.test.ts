import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { readAuthorizedPlatformCatalog, requirePersistedPlatformAccess } from "../lib/identity/platform-catalog-access";
import { ROLE_PERMISSIONS } from "../lib/identity/permissions";
import type { TraceKitSessionContext } from "../lib/identity/persistent-types";

const membership: any = { id: "platform-member", userId: "operator", accountId: "platform-account", organizationId: null, role: "platform-owner", status: "active" };
function session(): TraceKitSessionContext { return { user: { id: "operator", status: "active" }, membership, effectivePermissions: [...ROLE_PERMISSIONS["platform-owner"]] } as TraceKitSessionContext; }
function repository(overrides: any = {}) {
  let reads = 0;
  return { reads: () => reads, value: { membershipsForUser: async () => [membership], accountById: async () => ({ id: "platform-account", accountType: "platform", status: "active" }), permissionOverrides: async () => [], allActiveOrganizations: async () => { reads++; return [{ id: "foreign", name: "Foreign Tenant", owningAccountId: "foreign-account" }]; }, ...overrides } as any };
}
test("ordinary customer landing cannot fetch or serialize the global catalog even with a forged platform capability", async () => {
  for (const effectivePermissions of [[...ROLE_PERMISSIONS["client-read-only"]], [...ROLE_PERMISSIONS["platform-owner"]]]) {
    const identity = { ...session(), user: { id: "customer", status: "active" }, membership: { ...membership, userId: "customer", role: "client-read-only", organizationId: "stem", accountId: "stem-account" }, effectivePermissions } as TraceKitSessionContext;
    const repo = repository({ membershipsForUser: async () => { throw new Error("ordinary customer must not query platform membership"); } });
    assert.deepEqual(await readAuthorizedPlatformCatalog(identity, repo.value), []); assert.equal(repo.reads(), 0);
  }
});
test("platform catalog requires matching persisted identity, role, account, current dates and capability", async () => {
  const invalid = [
    { membershipsForUser: async () => [] },
    ...[{ userId: "foreign" }, { role: "platform-admin" }, { accountId: "foreign" }, { organizationId: "stem" }, { status: "removed" }, { effectiveUntil: "2020-01-01" }, { effectiveFrom: "2999-01-01" }, { effectiveUntil: "invalid" }].map(change => ({ membershipsForUser: async () => [{ ...membership, ...change }] })),
    { accountById: async () => ({ accountType: "client", status: "active" }) },
    { accountById: async () => ({ accountType: "platform", status: "suspended" }) },
    { permissionOverrides: async () => [{ effect: "deny", capability: "admin.manage_tenants" }] },
  ];
  for (const overrides of invalid) { const repo = repository(overrides); assert.deepEqual(await readAuthorizedPlatformCatalog(session(), repo.value), []); assert.equal(repo.reads(), 0); }
  const repo = repository(); assert.equal((await readAuthorizedPlatformCatalog(session(), repo.value))[0].id, "foreign"); assert.equal(repo.reads(), 1);
});
test("Admin Client View requires persisted impersonation permission separately from catalog access", async () => {
  const identity = { ...session(), membership: { ...membership, role: "platform-admin" }, effectivePermissions: [...ROLE_PERMISSIONS["platform-admin"]] } as TraceKitSessionContext;
  await assert.rejects(requirePersistedPlatformAccess(identity, repository().value, "admin.impersonate"), /unavailable/);
  await requirePersistedPlatformAccess(session(), repository().value, "admin.impersonate");
});
test("shell and direct platform route enforce persisted catalog guard before global data serialization", () => {
  const shell = readFileSync(new URL("../components/identity/authenticated-app-shell.tsx", import.meta.url), "utf8");
  assert.ok(shell.includes("await readAuthorizedPlatformCatalog(resolution.session")); assert.ok(!shell.includes(".allActiveOrganizations()"));
  const page = readFileSync(new URL("../app/(app)/platform/page.tsx", import.meta.url), "utf8"); assert.ok(page.indexOf("await requirePersistedPlatformAccess") < page.indexOf("repository.allActiveOrganizations()"));
  const support = readFileSync(new URL("../app/api/session/admin-view/route.ts", import.meta.url), "utf8");
  assert.equal(support.split('await requirePersistedPlatformAccess(resolution.session, repository, "admin.impersonate")').length - 1, 2);
  assert.equal(support.split("if (!sameOrigin(request))").length - 1, 2);
});
