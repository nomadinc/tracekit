import assert from "node:assert/strict";
import test from "node:test";
import { accessibleBusinessContexts, accessibleOrganizations, normalizeSession, satisfiesPermissionRequirement, shellVariant } from "../lib/identity/authorization";
import { developmentSessionFor, resolveDevelopmentIdentity, withDevelopmentIdentity } from "../lib/identity/development-state";
import { MOCK_IDENTITIES } from "../lib/identity/mock";
import { NAVIGATION_POLICY } from "../lib/identity/navigation-policy";
import { shellOverlayReducer } from "../lib/shell/overlay-state";
import { runUserMenuSignOut, shouldShowDevelopmentIdentityNotice, userMenuContext, userMenuSignOutAction } from "../lib/shell/user-menu-context";

function identity(id: string) {
  const value = MOCK_IDENTITIES.find((candidate) => candidate.id === id);
  if (!value) throw new Error(`Missing mock identity: ${id}`);
  return value;
}

test("command palette opens, toggles, and closes for every dismissal event", () => {
  assert.equal(shellOverlayReducer("none", { type: "open-search" }), "search");
  assert.equal(shellOverlayReducer("none", { type: "toggle-search" }), "search");
  assert.equal(shellOverlayReducer("search", { type: "toggle-search" }), "none");
  for (const type of ["escape", "outside", "selection", "navigation", "identity-change", "organization-change", "business-context-change"] as const) {
    assert.equal(shellOverlayReducer("search", { type }), "none");
  }
});

test("the trigger open event remains open until a distinct outside event occurs", () => {
  const opened = shellOverlayReducer("none", { type: "open-search" });
  assert.equal(opened, "search");
  assert.equal(shellOverlayReducer(opened, { type: "outside" }), "none");
});

test("search and avatar menu are mutually exclusive and avatar cleanup is deterministic", () => {
  assert.equal(shellOverlayReducer("user-menu", { type: "open-search" }), "search");
  assert.equal(shellOverlayReducer("search", { type: "open-user-menu" }), "user-menu");
  assert.equal(shellOverlayReducer("user-menu", { type: "toggle-user-menu" }), "none");
  assert.equal(shellOverlayReducer("user-menu", { type: "escape" }), "none");
  assert.equal(shellOverlayReducer("user-menu", { type: "outside" }), "none");
  assert.equal(shellOverlayReducer("user-menu", { type: "organization-change" }), "none");
});

test("query identity wins, navigation preserves it, and persisted identity is the fallback", () => {
  assert.equal(resolveDevelopmentIdentity("agency-owner", "client-admin").id, "agency-owner");
  assert.equal(resolveDevelopmentIdentity(null, "client-read-only").id, "client-read-only");
  assert.equal(withDevelopmentIdentity("/offers?workspace_id=default", "agency-owner"), "/offers?workspace_id=default&dev_identity=agency-owner");
  assert.equal(withDevelopmentIdentity("/offers#profit", "client-admin"), "/offers?dev_identity=client-admin#profit");
});

test("switching between Client and Platform identities clears incompatible scope", () => {
  const client = developmentSessionFor(identity("client-admin"));
  assert.equal(client.activeOrganizationId, "org-bullseye");
  const platform = developmentSessionFor(identity("platform-admin"), client);
  assert.equal(platform.activeOrganizationId, null);
  assert.equal(platform.activeBusinessContextId, null);
  const clientAgain = developmentSessionFor(identity("client-admin"), platform);
  assert.equal(clientAgain.activeOrganizationId, "org-bullseye");
  assert.equal(clientAgain.activeBusinessContextId, "offer-bullseye");
});

test("invalid Organization and Business Context values normalize without throwing", () => {
  const normalized = normalizeSession({ authenticated: true, developmentOnly: true, identity: identity("agency-team"), activeOrganizationId: "missing", activeBusinessContextId: "missing" });
  assert.equal(normalized.activeOrganizationId, "org-bullseye");
  assert.equal(normalized.activeBusinessContextId, "offer-bullseye");
});

test("user menu context is variant-specific", () => {
  for (const id of ["client-admin", "agency-owner", "platform-admin"]) {
    const session = developmentSessionFor(identity(id));
    const organizations = accessibleOrganizations(session.identity);
    const contexts = accessibleBusinessContexts(session.identity, session.activeOrganizationId);
    const context = userMenuContext(session, organizations, contexts, shellVariant(session.identity));
    if (id === "client-admin") {
      assert.equal(context.activeOrganization, "Bullseye Health");
      assert.equal(context.activeAgency, null);
      assert.equal(context.platformScope, null);
    } else if (id === "agency-owner") {
      assert.equal(context.activeAgency, "Northstar Growth");
      assert.equal(context.activeOrganization, "Bullseye Health");
      assert.equal(context.platformScope, null);
    } else {
      assert.equal(context.platformScope, "TraceKit Platform");
      assert.equal(context.activeOrganization, null);
      assert.equal(context.activeBusinessContext, null);
    }
  }
});

test("development identity notice follows the resolved session origin", () => {
  const reviewSession = developmentSessionFor(identity("client-admin"));
  assert.equal(shouldShowDevelopmentIdentityNotice(reviewSession), true);
  assert.equal(
    shouldShowDevelopmentIdentityNotice({
      ...reviewSession,
      developmentOnly: false,
      identity: {
        ...reviewSession.identity,
        id: "persistent-user-id",
        name: "Anthony McCabe",
        email: "anthony@example.test",
      },
    }),
    false,
  );
});

test("persistent sessions expose real sign-out without opening the placeholder drawer", () => {
  const persistentSession = {
    ...developmentSessionFor(identity("client-admin")),
    developmentOnly: false,
  };
  const action = userMenuSignOutAction(persistentSession);
  assert.deepEqual(action, { kind: "navigate", label: "Sign Out", href: "/auth/sign-out" });
  const events: string[] = [];
  runUserMenuSignOut(action, {
    closeMenu: () => events.push("close"),
    navigate: (href) => events.push(`navigate:${href}`),
    openPlaceholder: () => events.push("placeholder"),
  });
  assert.deepEqual(events, ["close", "navigate:/auth/sign-out"]);
});

test("development review sessions retain the non-mutating sign-out placeholder", () => {
  const action = userMenuSignOutAction(developmentSessionFor(identity("client-admin")));
  assert.equal(action.kind, "placeholder");
  assert.equal(action.label, "Sign Out — placeholder");
  const events: string[] = [];
  runUserMenuSignOut(action, {
    closeMenu: () => events.push("close"),
    navigate: () => events.push("navigate"),
    openPlaceholder: () => events.push("placeholder"),
  });
  assert.deepEqual(events, ["close", "placeholder"]);
});

test("every registered navigation destination resolves to an allowed or denied policy outcome", () => {
  for (const candidate of MOCK_IDENTITIES) {
    const variant = shellVariant(candidate);
    const destinations = NAVIGATION_POLICY[variant];
    assert.ok(destinations.length > 0);
    for (const destination of destinations) {
      assert.match(destination.href, /^\//);
      const outcome = destination.permission ? satisfiesPermissionRequirement(candidate, destination.permission) : true;
      assert.equal(typeof outcome, "boolean");
    }
  }
});
