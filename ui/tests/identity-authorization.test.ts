import assert from "node:assert/strict";
import test from "node:test";
import { accessibleBusinessContexts, accessibleOrganizations, authorize, authorizeShellVariant, effectivePermissions, normalizeSession, shellVariant } from "../lib/identity/authorization";
import { MOCK_IDENTITIES } from "../lib/identity/mock";

function identity(id: string) {
  const value = MOCK_IDENTITIES.find((candidate) => candidate.id === id);
  if (!value) throw new Error(`Missing mock identity: ${id}`);
  return value;
}

test("default roles resolve to typed permission collections", () => {
  assert.equal(effectivePermissions(identity("client-admin")).has("organizations.manage"), true);
  assert.equal(effectivePermissions(identity("client-read-only")).has("organizations.manage"), false);
  assert.equal(effectivePermissions(identity("platform-admin")).has("admin.manage_tenants"), true);
  assert.equal(effectivePermissions(identity("platform-admin")).has("admin.impersonate"), false);
});

test("shell variants follow Account type rather than role labels", () => {
  assert.equal(shellVariant(identity("platform-admin")), "product-admin");
  assert.equal(shellVariant(identity("agency-owner")), "agency");
  assert.equal(shellVariant(identity("client-analyst")), "client");
});

test("Agency and Client Organization access remains membership scoped", () => {
  assert.deepEqual(accessibleOrganizations(identity("agency-team")).map((organization) => organization.id), ["org-bullseye", "org-valuerx"]);
  assert.deepEqual(accessibleOrganizations(identity("client-admin")).map((organization) => organization.id), ["org-bullseye"]);
  assert.deepEqual(accessibleOrganizations(identity("platform-admin")), []);
});

test("Business Contexts are restricted to the active allowed Organization", () => {
  assert.deepEqual(accessibleBusinessContexts(identity("agency-team"), "org-valuerx").map((context) => context.id), ["offer-valuerx-individual", "offer-valuerx-family"]);
  assert.deepEqual(accessibleBusinessContexts(identity("client-admin"), "org-valuerx"), []);
});

test("session normalization removes inaccessible Organization and Business Context state", () => {
  const normalized = normalizeSession({ authenticated: true, developmentOnly: true, identity: identity("client-admin"), activeOrganizationId: "org-valuerx", activeBusinessContextId: "offer-valuerx-family" });
  assert.equal(normalized.activeOrganizationId, "org-bullseye");
  assert.equal(normalized.activeBusinessContextId, "offer-bullseye");
});

test("route authorization checks permission, Organization scope, and shell variant", () => {
  assert.equal(authorize(identity("client-read-only"), "organizations.manage", "org-bullseye").allowed, false);
  assert.equal(authorize(identity("agency-owner"), "offers.view", "org-petes").allowed, true);
  assert.equal(authorize(identity("agency-team"), "offers.view", "org-petes").allowed, false);
  assert.equal(authorizeShellVariant(identity("client-admin"), ["product-admin"]).allowed, false);
  assert.equal(authorizeShellVariant(identity("platform-admin"), ["product-admin"]).allowed, true);
});

test("persistent Organization UUIDs are authorized from membership scope without consulting mock IDs", () => {
  const persistentIdentity = {
    ...identity("client-admin"),
    membership: {
      ...identity("client-admin").membership,
      organizationIds: ["85b51415-3529-47d6-8a43-c39e39d492e8"],
    },
  };
  assert.equal(authorize(persistentIdentity, "offers.view", "85b51415-3529-47d6-8a43-c39e39d492e8").allowed, true);
  assert.equal(authorize(persistentIdentity, "offers.view", "org-bullseye").allowed, false);
});

test("each representative identity resolves the permissions that drive its navigation", () => {
  const can = (id: string, permission: Parameters<typeof authorize>[1]) => authorize(identity(id), permission).allowed;
  assert.equal(can("platform-admin", "admin.manage_tenants"), true);
  assert.equal(can("agency-owner", "users.view"), true);
  assert.equal(can("agency-owner", "organizations.manage"), true);
  assert.equal(can("agency-team", "users.view"), false);
  assert.equal(can("agency-team", "branding.view"), true);
  assert.equal(can("client-admin", "organizations.manage"), true);
  assert.equal(can("client-analyst", "organizations.manage"), false);
  assert.equal(can("client-read-only", "organizations.manage"), false);
  assert.equal(can("client-read-only", "offers.view"), true);
});
