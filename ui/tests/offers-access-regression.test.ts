import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { requireResourceScope } from "../lib/identity/authorization-gateway";
import { resolveEffectivePermissions } from "../lib/identity/persistent-authorization";
import type {
  PersistentMembership,
  TraceKitSessionContext,
} from "../lib/identity/persistent-types";

const organizationId = "5f1de64a-1b37-40bb-81c8-32197eda0b41";
const membership: PersistentMembership = {
  id: "membership-owner",
  userId: "user-owner",
  accountId: "account-owner",
  organizationId,
  role: "organization-owner",
  status: "active",
};

function ownerSession(
  overrides: Partial<TraceKitSessionContext> = {},
): TraceKitSessionContext {
  return {
    user: {
      id: "user-owner",
      workosUserId: "workos-owner",
      primaryEmail: "owner@example.test",
      displayName: "Owner",
      avatarUrl: null,
      status: "active",
    },
    externalWorkosUserId: "workos-owner",
    activeAccount: {
      id: "account-owner",
      accountType: "client",
      name: "Owner account",
      status: "active",
    },
    activeAgency: null,
    activeOrganization: {
      id: organizationId,
      name: "Organization",
      mark: "OR",
      accountId: "account-owner",
    },
    availableOrganizations: [
      {
        id: organizationId,
        name: "Organization",
        mark: "OR",
        accountId: "account-owner",
      },
    ],
    membership,
    role: membership.role,
    effectivePermissions: Array.from(resolveEffectivePermissions(membership, [])),
    permissionOverrides: [],
    accessibleBusinessContexts: [],
    activeBusinessContextId: null,
    assurance: { authenticationMethod: null, impersonated: false },
    correlationId: "request-owner",
    ...overrides,
  };
}

test("active organization owner receives role capabilities even when persisted role permissions are empty", () => {
  const permissions = resolveEffectivePermissions(membership, []);
  assert.equal(permissions.has("offers.view"), true);
  assert.equal(permissions.has("offers.manage"), true);
  assert.equal(
    requireResourceScope(ownerSession(), organizationId, "offers.view").id,
    organizationId,
  );
});

test("canonical Offer route is session-derived, permission protected, and tenant scoped", () => {
  const route = readFileSync(
    new URL("../app/api/offers/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /resolveApplicationSession\(\)/);
  assert.match(
    route,
    /requireResourceScope\(resolution\.session, organizationId, "offers\.view"\)/,
  );
  assert.match(route, /resolution\.session\.activeOrganization\.id/);
  assert.match(
    route,
    /canonical_offers\?organization_id=eq\.\$\{encodeURIComponent\(organizationId\)\}&status=eq\.active/,
  );
  assert.doesNotMatch(route, /searchParams|get\("organizationId"\)|request\.json/);
  assert.match(route, /code: "resource_unavailable"/);
  assert.doesNotMatch(route, /error\.message|String\(error\)/);
});

test("inactive membership and wrong active organization fail closed", () => {
  const inactive = {
    ...membership,
    status: "suspended" as const,
  };
  assert.throws(
    () =>
      requireResourceScope(
        ownerSession({
          membership: inactive,
          effectivePermissions: Array.from(resolveEffectivePermissions(inactive, [])),
        }),
        organizationId,
        "offers.view",
      ),
    /unavailable/,
  );
  assert.throws(
    () => requireResourceScope(ownerSession(), "another-organization", "offers.view"),
    /unavailable/,
  );
});

test("persistent Offers use canonical catalog while development keeps reviewed mock workspace", () => {
  const workspace = readFileSync(
    new URL("../components/offers/offer-workspace.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    workspace,
    /session\.developmentOnly \? \([\s\S]*<OfferWorkspaceContent \/>[\s\S]*<PersistentOfferCatalog \/>/,
  );
  assert.match(workspace, /fetch\("\/api\/offers"/);
  assert.match(workspace, /Canonical Offers/);
  assert.match(workspace, /offer\.name/);
  assert.match(workspace, /offer\.businessContextId/);
});

test("Offers page retains Product Mapping Review and guarded mapping mutations", () => {
  const page = readFileSync(
    new URL("../app/(app)/offers/page.tsx", import.meta.url),
    "utf8",
  );
  const review = readFileSync(
    new URL("../components/offers/commerce-product-mapping-review.tsx", import.meta.url),
    "utf8",
  );
  const mappingRoute = readFileSync(
    new URL("../app/api/commerce/product-mappings/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(page, /<CommerceProductMappingReview \/>/);
  assert.match(review, /permission="offers\.manage"/);
  assert.match(mappingRoute, /requirePermission\(r\.session,"offers\.manage"\)/);
  assert.match(mappingRoute, /sameOrigin\(request\)/);
  assert.match(mappingRoute, /expectedMappingVersion/);
});
