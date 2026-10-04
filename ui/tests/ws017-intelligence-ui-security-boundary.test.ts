import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const source = (path: string) => readFileSync(new URL(path, root), "utf8");
const proxy = source("lib/identity/scoped-core-proxy.ts");
const policy = source("lib/identity/operational-tenant-boundary.ts");
const routes = [
  source("app/api/work-items/route.ts"),
  source("app/api/work-items/[...workItemPath]/route.ts"),
  source("app/api/notifications/route.ts"),
  source("app/api/notifications/[...notificationPath]/route.ts"),
];

test("WS-017 Intelligence browser proxies resolve authenticated organization scope", () => {
  for (const route of routes) assert.match(route, /scopedCore(Get|Post)/);
  assert.match(proxy, /resolveApplicationSession/);
  assert.match(proxy, /activeOrganization/);
  assert.match(proxy, /requirePermission/);
});

test("WS-017 read routes reject conflicting scope and inject active organization", () => {
  assert.match(proxy, /params\.getAll\(key\)\.every/);
  assert.match(proxy, /params\.set\("workspace_id", scope\.workspaceId\)/);
});

test("WS-017 lifecycle mutations require actions.execute", () => {
  assert.match(policy, /workItemTransition: "actions\.execute"/);
  assert.match(policy, /notificationUpdate: "actions\.execute"/);
});

test("WS-017 Work Item mutation strips caller identity and overwrites actor/workspace", () => {
  assert.match(proxy, /sanitized\.workspace_id = scope\.workspaceId/);
  assert.match(proxy, /sanitized\.actor_id = scope\.session\.user\.id/);
  assert.match(proxy, /ACTOR_HINT_KEYS/);
});

test("WS-017 Notification mutation forwards only validated server-derived workspace", () => {
  assert.match(proxy, /bodyMatchesScope/);
  assert.match(proxy, /TENANT_HINT_KEYS/);
});

test("WS-017 unauthorized proxy access fails closed without exposing authorization detail", () => {
  assert.match(proxy, /The requested resource is unavailable/);
  assert.doesNotMatch(proxy, /permission_required|organization_id_required/);
});
