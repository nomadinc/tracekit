import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { identityMode, identityProviderInitialization, resolveIdentitySource } from "../lib/identity/identity-mode";
import { resolveEffectivePermissions, permissionDecision, selectSessionMembership } from "../lib/identity/persistent-authorization";
import { validateInvitationAcceptance } from "../lib/identity/invitations";
import { redactAuditMetadata } from "../lib/identity/persistent-repository";
import { serializeSessionForClient, type PermissionOverride, type PersistentMembership, type TraceKitSessionContext } from "../lib/identity/persistent-types";
import { readActiveOrganization, sealActiveOrganization } from "../lib/identity/active-organization-cookie";
import { canAccessFinancialData, canAccessSensitiveCustomerData, requireActiveMembership, requireAuthenticatedUser, requireOrganizationAccess, requirePermission, requireResourceScope } from "../lib/identity/authorization-gateway";
import { authorizeOrganizationSwitch } from "../lib/identity/organization-switching";
import type { IdentityTenancyRepository } from "../lib/identity/persistent-repository";
import { isProtectedApplicationPath, isPublicAuthenticationPath, isStaticAssetPath, shouldBlockLegacyRealDataProxy } from "../lib/identity/route-security";
import { resolveMockRepositoryScope } from "../lib/identity/mock-repository-scope";
import { MockOfferRepository } from "../lib/offers/mock-repository";
import { MockCustomerRepository } from "../lib/customers/mock-repository";
import { MockOrderRepository } from "../lib/orders/mock-repository";
import { MockMissionControlRepository, scopeMissionControlSnapshot } from "../lib/mission-control/mock-repository";
import { withDevelopmentIdentity, withSessionDevelopmentIdentity } from "../lib/identity/development-state";

const membership: PersistentMembership = { id: "mem_01", userId: "usr_01", accountId: "acct_01", organizationId: "org_01", role: "organization-admin", status: "active" };
const deny: PermissionOverride = { id: "over_01", membershipId: membership.id, capability: "offers.view", effect: "deny", organizationId: null, resourceType: null, resourceId: null };

function session(): TraceKitSessionContext {
  return {
    user: { id: "usr_01", workosUserId: "user_workos", primaryEmail: "owner@example.test", displayName: "Owner", avatarUrl: null, status: "active" },
    externalWorkosUserId: "user_workos",
    activeAccount: { id: "acct_01", accountType: "client", name: "Example", status: "active" },
    activeAgency: null,
    activeOrganization: { id: "org_01", name: "Example", mark: "EX", accountId: "acct_01" },
    availableOrganizations: [{ id: "org_01", name: "Example", mark: "EX", accountId: "acct_01" }],
    membership,
    role: membership.role,
    effectivePermissions: Array.from(resolveEffectivePermissions(membership, [])),
    permissionOverrides: [],
    accessibleBusinessContexts: [{ id: "offer_01", organizationId: "org_01", name: "Example Offer", mark: "EO" }],
    activeBusinessContextId: "offer_01",
    assurance: { authenticationMethod: "password", impersonated: false },
    correlationId: "req_01",
  };
}

test("production mode rejects development identity activation", () => {
  assert.equal(identityMode({ NODE_ENV: "production", TRACEKIT_IDENTITY_MODE: "development", TRACEKIT_ENABLE_DEV_IDENTITIES: "true" } as NodeJS.ProcessEnv), "workos");
  assert.equal(identityMode({ NODE_ENV: "development", TRACEKIT_IDENTITY_MODE: "development", TRACEKIT_ENABLE_DEV_IDENTITIES: "true" } as NodeJS.ProcessEnv), "development");
});

test("a real WorkOS session always wins over local development identity state", () => {
  assert.equal(resolveIdentitySource({ hasRealSession: true, developmentEnabled: true, providerConfigured: true }), "persistent");
  assert.equal(resolveIdentitySource({ hasRealSession: false, developmentEnabled: true, providerConfigured: true }), "development");
  assert.equal(resolveIdentitySource({ hasRealSession: false, developmentEnabled: false, providerConfigured: true }), "none");
  assert.equal(resolveIdentitySource({ hasRealSession: false, developmentEnabled: false, providerConfigured: false }), "provider-unavailable");
});

test("persistent shell identity cannot be overridden by dev_identity or persisted mock state", () => {
  const applicationSession = readFileSync(new URL("../lib/identity/application-session.ts", import.meta.url), "utf8");
  assert.match(applicationSession, /developmentEnabled && !hasWorkOSSession/);
  const provider = readFileSync(new URL("../components/identity/identity-provider.tsx", import.meta.url), "utf8");
  assert.match(provider, /identityProviderInitialization\(initialSession\)/);
  assert.match(provider, /const persistent = initialization\.persistent/);
  assert.match(provider, /if \(persistent\) return;[\s\S]*setDevelopmentIdentity/);
  const shell = readFileSync(new URL("../components/identity/authenticated-app-shell.tsx", import.meta.url), "utf8");
  assert.match(shell, /resolution\.kind === "no-membership"/);
  assert.match(shell, /initialSession=\{resolution\.legacySession\}/);
});

test("persistent initial session is ready and never initializes development state", () => {
  assert.deepEqual(identityProviderInitialization({ developmentOnly: false }), {
    persistent: true,
    ready: true,
    initializeDevelopment: false,
  });
  assert.deepEqual(identityProviderInitialization(), {
    persistent: false,
    ready: false,
    initializeDevelopment: true,
  });
  const provider = readFileSync(
    new URL("../components/identity/identity-provider.tsx", import.meta.url),
    "utf8",
  );
  assert.match(provider, /if \(!initializeDevelopment\) return;[\s\S]*window\.localStorage/);
});

test("persistent user IDs are never encoded as development identity state", () => {
  assert.equal(
    withDevelopmentIdentity("/offers?v=1", "usr_persistent_01"),
    "/offers?v=1",
  );
  assert.match(
    withDevelopmentIdentity("/offers?v=1", "client-admin"),
    /dev_identity=client-admin/,
  );
});

test("persistent navigation is canonical while development review preserves identity", () => {
  const persistentSession = {
    ...session(),
    authenticated: true,
    developmentOnly: false,
    identity: {
      id: "usr_persistent_01",
      name: "Owner",
      email: "owner@example.test",
      title: "organization-admin",
      membership: {
        id: "mem_01",
        accountId: "acct_01",
        accountName: "Example",
        accountType: "client" as const,
        role: "organization-admin" as const,
        organizationIds: ["org_01"],
      },
    },
    activeOrganizationId: "org_01",
  };
  assert.equal(
    withSessionDevelopmentIdentity("/offers", persistentSession),
    "/offers",
  );
  assert.equal(
    withSessionDevelopmentIdentity(
      "/offers",
      { ...persistentSession, developmentOnly: true, identity: { ...persistentSession.identity, id: "client-admin" } },
    ),
    "/offers?dev_identity=client-admin",
  );
  const sidebar = readFileSync(
    new URL("../components/layout/production-sidebar.tsx", import.meta.url),
    "utf8",
  );
  const palette = readFileSync(
    new URL("../components/shared/command-palette.tsx", import.meta.url),
    "utf8",
  );
  assert.match(sidebar, /withSessionDevelopmentIdentity\(item\.href, session\)/);
  assert.match(palette, /withSessionDevelopmentIdentity\(withWorkspace\(item\.href\), session\)/);
});

test("persistent Organization UUID resolves to the mock repository scope only through Business Context", () => {
  const session = {
    authenticated: true,
    developmentOnly: false,
    identity: {
      id: "user-1",
      name: "Anthony McCabe",
      email: "anthony@example.test",
      title: "organization-admin",
      membership: {
        id: "membership-1",
        accountId: "account-uuid",
        accountName: "Bullseye Health",
        accountType: "client" as const,
        role: "organization-admin" as const,
        organizationIds: ["85b51415-3529-47d6-8a43-c39e39d492e8"],
      },
    },
    activeOrganizationId: "85b51415-3529-47d6-8a43-c39e39d492e8",
    activeBusinessContextId: "offer-bullseye",
  };
  const scope = resolveMockRepositoryScope(session);
  assert.equal(scope.persistentOrganizationId, "85b51415-3529-47d6-8a43-c39e39d492e8");
  assert.equal(scope.mockOrganizationId, "org-bullseye");
  assert.deepEqual(scope.accessibleOfferIds, ["offer-bullseye"]);
  assert.equal(session.identity.membership.organizationIds.includes("org-bullseye"), false);
});

test("persistent Bullseye scope returns matching Workspace and search records only", async () => {
  const persistentOrganizationId = "70000000-0000-0000-0000-000000000002";
  const session = {
    authenticated: true,
    developmentOnly: false,
    identity: {
      id: "5cc87ba8-e70e-420f-a4f4-ae36833118d7",
      name: "Anthony McCabe",
      email: "anthony@example.test",
      title: "organization-admin",
      membership: {
        id: "membership-anthony",
        accountId: "70000000-0000-0000-0000-000000000001",
        accountName: "Bullseye Health",
        accountType: "client" as const,
        role: "organization-admin" as const,
        organizationIds: [persistentOrganizationId],
      },
    },
    activeOrganizationId: persistentOrganizationId,
    activeBusinessContextId: "offer-bullseye",
  };
  const scope = resolveMockRepositoryScope(session);
  const offers = new MockOfferRepository();
  const customers = new MockCustomerRepository();
  const orders = new MockOrderRepository();
  const mission = scopeMissionControlSnapshot(await new MockMissionControlRepository().getMissionControl(), scope);
  assert.ok(mission);

  assert.deepEqual((await offers.listOffers(scope)).map((item) => item.id), ["offer-bullseye"]);
  assert.deepEqual((await customers.listCustomers(scope)).map((item) => item.id), ["cust-123", "cust-124"]);
  assert.deepEqual((await orders.listOrders(scope)).map((item) => item.id), ["ord-123", "ord-124", "ord-125", "ord-127", "ord-128"]);
  assert.deepEqual(mission.businesses.map((item) => item.businessContextId), ["offer-bullseye"]);
  assert.ok(mission.attention.every((item) => item.businessContextId === "offer-bullseye"));

  const searchResults = [
    ...(await offers.search(scope, "Bullseye")),
    ...(await customers.search(scope, "John")),
    ...(await orders.search(scope, "TK-10482")),
  ];
  assert.ok(searchResults.length >= 3);
  assert.equal(searchResults.some((item) => item.href.includes("valuerx") || item.href.includes("cust-vrx") || item.href.includes("ord-vrx")), false);
  assert.equal(await offers.loadWorkspace(scope, "offer-valuerx-individual"), null);
  assert.equal(await customers.loadWorkspace(scope, "cust-vrx-1"), null);
  assert.equal(await orders.loadWorkspace(scope, "ord-vrx-1"), null);
});

test("unknown persistent Organization or Business Context produces a closed repository scope", async () => {
  const identity = {
    id: "user-unknown",
    name: "Unknown",
    email: "unknown@example.test",
    title: "organization-admin",
    membership: {
      id: "membership-unknown",
      accountId: "account-unknown",
      accountName: "Unknown",
      accountType: "client" as const,
      role: "organization-admin" as const,
      organizationIds: ["known-org"],
    },
  };
  const unknownOrganization = resolveMockRepositoryScope({ authenticated: true, developmentOnly: false, identity, activeOrganizationId: "unknown-org", activeBusinessContextId: "offer-bullseye" });
  const unknownContext = resolveMockRepositoryScope({ authenticated: true, developmentOnly: false, identity, activeOrganizationId: "known-org", activeBusinessContextId: "unknown-offer" });
  const repository = new MockOfferRepository();
  assert.deepEqual(await repository.listOffers(unknownOrganization), []);
  assert.deepEqual(await repository.listOffers(unknownContext), []);
});

test("role permissions are capabilities and an explicit deny wins", () => {
  assert.equal(resolveEffectivePermissions(membership, []).has("offers.view"), true);
  assert.equal(permissionDecision(membership, [deny], "offers.view").allowed, false);
  const allowAfterDeny = [...([deny] as PermissionOverride[]), { ...deny, id: "over_02", effect: "allow" as const }];
  assert.equal(permissionDecision(membership, allowAfterDeny, "offers.view").allowed, false);
});

test("an additional Product/Admin Account membership cannot displace the Organization session", () => {
  const platform = { ...membership, id: "membership-platform", accountId: "account-platform", organizationId: null, role: "platform-admin" as const };
  assert.equal(selectSessionMembership([platform, membership])?.id, membership.id);
  assert.equal(selectSessionMembership([platform])?.id, platform.id);
});

test("suspended membership has no permissions", () => {
  assert.equal(resolveEffectivePermissions({ ...membership, status: "suspended" }, []).size, 0);
});

test("organization and capability checks deny without disclosing existence", () => {
  assert.equal(requireAuthenticatedUser(session()).id, "usr_01");
  assert.equal(requireActiveMembership(session()).id, "mem_01");
  assert.equal(requireOrganizationAccess(session(), "org_01").id, "org_01");
  assert.equal(requireResourceScope(session(), "org_01", "offers.view").id, "org_01");
  assert.throws(() => requireOrganizationAccess(session(), "org_other"), /unavailable/);
  assert.throws(() => requirePermission({ ...session(), effectivePermissions: [] }, "offers.view"), /unavailable/);
  assert.throws(() => requireAuthenticatedUser(null), /unavailable/);
  assert.throws(() => requireActiveMembership({ ...session(), membership: { ...membership, status: "suspended" } }), /unavailable/);
  assert.equal(canAccessSensitiveCustomerData(session()), true);
  assert.equal(canAccessSensitiveCustomerData({ ...session(), effectivePermissions: [] }), false);
  assert.equal(canAccessFinancialData(session()), true);
  assert.equal(canAccessFinancialData({ ...session(), effectivePermissions: [] }), false);
});

test("invitation validates intended identity, expiry, and replay", () => {
  const invitation = { id: "inv_01", intendedEmail: "person@example.test", status: "pending" as const, expiresAt: "2099-01-01T00:00:00.000Z", targetAccountId: null, targetOrganizationId: "org_01", requestedRole: "analyst-operator", acceptedByUserId: null };
  assert.equal(validateInvitationAcceptance(invitation, "PERSON@example.test").accepted, true);
  assert.equal(validateInvitationAcceptance({ ...invitation, expiresAt: "2020-01-01T00:00:00.000Z" }, invitation.intendedEmail).reason, "expired");
  assert.equal(validateInvitationAcceptance({ ...invitation, status: "accepted" }, invitation.intendedEmail).reason, "already_accepted");
  assert.equal(validateInvitationAcceptance(invitation, "other@example.test").reason, "identity_mismatch");
});

test("safe session serialization excludes external identity and override details", () => {
  const serialized = serializeSessionForClient(session()) as unknown as Record<string, unknown>;
  assert.equal("externalWorkosUserId" in serialized, false);
  assert.equal("permissionOverrides" in serialized, false);
});

test("audit metadata redacts protected values", () => {
  assert.deepEqual(redactAuditMetadata({ reason: "review", email: "person@example.test", accessToken: "secret" }), { reason: "review", email: "[REDACTED]", accessToken: "[REDACTED]" });
});

test("active Organization cookie is signed, user-bound, and expiring", () => {
  const previous = process.env.WORKOS_COOKIE_PASSWORD;
  process.env.WORKOS_COOKIE_PASSWORD = "12345678901234567890123456789012";
  try {
    const value = sealActiveOrganization({ userId: "usr_01", organizationId: "org_01", expiresAt: 2000 });
    assert.equal(readActiveOrganization(value, "usr_01", 1000), "org_01");
    assert.equal(readActiveOrganization(value, "usr_02", 1000), null);
    assert.equal(readActiveOrganization(value, "usr_01", 3000), null);
    assert.equal(readActiveOrganization(`${value}x`, "usr_01", 1000), null);
  } finally {
    if (previous === undefined) delete process.env.WORKOS_COOKIE_PASSWORD; else process.env.WORKOS_COOKIE_PASSWORD = previous;
  }
});

test("Organization switching revalidates scope, clears Business Context, and audits success", async () => {
  const auditEvents: Array<{ action: string; organizationId: string | null }> = [];
  const repository = {
    recordAuditEvent: async (event: { action: string; organizationId: string | null }) => { auditEvents.push(event); },
  } as unknown as IdentityTenancyRepository;
  const allowed = await authorizeOrganizationSwitch(session(), "org_01", repository);
  assert.equal(allowed.organization.id, "org_01");
  assert.equal(allowed.activeBusinessContextId, null);
  assert.equal(allowed.clearInvestigationState, true);
  assert.equal(auditEvents[0]?.action, "organization.switched");
  assert.equal(auditEvents[0]?.organizationId, "org_01");
  await assert.rejects(authorizeOrganizationSwitch(session(), "org_other", repository), /unavailable/);
  assert.equal(auditEvents.length, 1);
});

test("production routes are protected while auth and static assets remain public", () => {
  for (const path of ["/", "/offers", "/customers", "/orders", "/money", "/operations", "/settings", "/clients", "/reports", "/team", "/branding", "/platform/organizations"]) assert.equal(isProtectedApplicationPath(path), true);
  assert.equal(isPublicAuthenticationPath("/auth/sign-in"), true);
  assert.equal(isPublicAuthenticationPath("/auth/callback"), true);
  assert.equal(isPublicAuthenticationPath("/auth/sign-out"), true);
  assert.equal(isPublicAuthenticationPath("/auth/signed-out"), true);
  assert.equal(isStaticAssetPath("/_next/static/chunks/app.js"), true);
  assert.equal(isStaticAssetPath("/_next/static/css/app/layout.css"), true);
  assert.equal(isStaticAssetPath("/_next/image?url=%2Flogo.png&w=64&q=75"), true);
  assert.equal(isStaticAssetPath("/_next/webpack-hmr"), true);
  assert.equal(isStaticAssetPath("/fonts/tracekit.woff"), true);
  assert.equal(isStaticAssetPath("/chunks/app.js.map"), true);
  assert.equal(isStaticAssetPath("/images/logo.avif"), true);
  assert.equal(isStaticAssetPath("/robots.txt"), true);
  assert.equal(isStaticAssetPath("/manifest.webmanifest"), true);
  assert.equal(isProtectedApplicationPath("/_next/static/chunks/app.js"), false);
  const middleware = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
  assert.match(middleware, /\(\?!_next\//);
  assert.match(middleware, /js\|map\|woff\|woff2/);
});

test("the sign-out route delegates active and missing sessions to AuthKit's safe cookie and provider flow", () => {
  const route = readFileSync(new URL("../app/auth/sign-out/route.ts", import.meta.url), "utf8");
  assert.match(route, /resolution\.kind === "authenticated"/);
  assert.match(route, /signOut\(\{ returnTo: "\/auth\/signed-out" \}\)/);
  assert.doesNotMatch(route, /dev_identity|developmentOnly/);
  assert.equal(isPublicAuthenticationPath("/auth/sign-out"), true);
  assert.equal(isPublicAuthenticationPath("/auth/signed-out"), true);
});

test("explicit local identity mode bypasses AuthKit initialization before provider configuration is read", () => {
  const middleware = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
  const developmentBypass = middleware.indexOf("if (explicitDevelopmentReview)");
  const authkitInitialization = middleware.indexOf("return authkitMiddleware(");
  assert.notEqual(developmentBypass, -1);
  assert.ok(authkitInitialization > developmentBypass);
  assert.match(middleware, /requestedDevelopmentIdentity/);
  assert.match(middleware, /developmentIdentityById/);
});

test("real-data mode blocks privileged legacy proxies regardless of caller workspace_id", () => {
  assert.equal(shouldBlockLegacyRealDataProxy("/api/customers?workspace_id=other", true), true);
  assert.equal(shouldBlockLegacyRealDataProxy("/api/session/organization", true), false);
  assert.equal(shouldBlockLegacyRealDataProxy("/api/health", true), false);
  assert.equal(shouldBlockLegacyRealDataProxy("/api/customers", false), false);
});
