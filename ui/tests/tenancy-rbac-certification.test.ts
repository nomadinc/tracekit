import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ROLE_PERMISSIONS } from "../lib/identity/permissions";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const source = (relative: string) => readFileSync(`${repoRoot}/${relative}`, "utf8");

test("read-only agency and client roles cannot manage connectors", () => {
  assert.equal(ROLE_PERMISSIONS["agency-read-only"].includes("connectors.manage"), false);
  assert.equal(ROLE_PERMISSIONS["client-read-only"].includes("connectors.manage"), false);
  assert.equal(ROLE_PERMISSIONS["agency-read-only"].includes("customers.view"), true);
  assert.equal(ROLE_PERMISSIONS["agency-read-only"].includes("orders.view"), true);
  assert.equal(ROLE_PERMISSIONS["client-read-only"].includes("customers.view"), true);
  assert.equal(ROLE_PERMISSIONS["client-read-only"].includes("orders.view"), true);
});

test("organization switching is authorized before the active organization cookie is written", () => {
  const route = source("ui/app/api/session/organization/route.ts");
  const authorizeIndex = route.indexOf("authorizeOrganizationSwitch");
  const sealIndex = route.indexOf("sealActiveOrganization");
  assert.ok(authorizeIndex >= 0);
  assert.ok(sealIndex > authorizeIndex);
  assert.match(route, /catch\s*\{[\s\S]*status:\s*404/);
});

test("customer list route discards caller workspace scope and forces the active organization", () => {
  const route = source("ui/app/api/customers/route.ts");
  assert.match(route, /requirePermission\(resolution\.session, "customers\.view"\)/);
  assert.match(route, /url\.searchParams\.delete\("workspace_id"\)/);
  assert.match(route, /url\.searchParams\.delete\("workspaceId"\)/);
  assert.match(route, /url\.searchParams\.set\("workspace_id", organizationId\)/);
});

test("customer detail route also forces the active organization workspace", () => {
  const route = source("ui/app/api/customers/[...customerPath]/route.ts");
  assert.match(route, /requirePermission\(resolution\.session, "customers\.view"\)/);
  assert.match(route, /url\.searchParams\.delete\("workspace_id"\)/);
  assert.match(route, /url\.searchParams\.delete\("workspaceId"\)/);
  assert.match(route, /url\.searchParams\.set\("workspace_id", organizationId\)/);
});

test("orders route always scopes by active organization and workspace before object filters", () => {
  const route = source("ui/app/api/orders/route.ts");
  assert.match(route, /requirePermission\(resolution\.session, "orders\.view"\)/);
  assert.match(route, /organization_id=eq\.\$\{encodeURIComponent\(organizationId\)\}/);
  assert.match(route, /workspace_id=eq\.\$\{encodeURIComponent\(organizationId\)\}/);
  assert.match(route, /platform_order_id=eq\.\$\{encodeURIComponent\(orderId\)\}/);
});

test("commerce write authorization denials remain generic 404 responses", () => {
  const route = source("ui/app/api/commerce/[...commercePath]/route.ts");
  assert.match(route, /AuthorizationDeniedError/);
  assert.match(route, /error instanceof AuthorizationDeniedError/);
  assert.match(route, /failure\(requestId, 404, "resource_unavailable", "The requested resource is unavailable\."\)/);
  assert.doesNotMatch(
    route,
    /if \(error instanceof AuthorizationDeniedError\)[\s\S]{0,180}failure\(requestId, 500/,
  );
});

test("direct client sessions remain organization scoped while account context is derived", () => {
  const session = source("ui/lib/identity/application-session.ts");
  assert.match(session, /membership\.organizationId \? await repository\.organizationsForMembership\(membership, null\) : \[\]/);
  assert.match(session, /membership\.accountId \|\| directlyScopedOrganizations\[0\]\?\.owningAccountId/);
  assert.match(session, /organizations = organizationRecords\.map/);
});
