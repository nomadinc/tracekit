import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PRODUCTION_V1_RELEASE_REQUIREMENTS } from "../lib/mcp/production-v1-acceptance";

const root = new URL("..", import.meta.url);
const source = (path: string) => readFileSync(new URL(path, root), "utf8");

test("M4.2b first-party route derives tenant and actor and rejects all caller fields", () => {
  const route = source("app/api/work-items/acceptance-fixtures/ws019-m4-2/route.ts");
  const proxy = source("lib/identity/scoped-core-proxy.ts") + source("lib/identity/scoped-core-runtime.ts");
  assert.match(route, /OPERATIONAL_ACCESS_POLICY\.workItemTransition/);
  assert.match(route, /includeActor: true/);
  assert.match(route, /includeCorrelation: true/);
  assert.match(route, /rejectCallerScopeHints: true/);
  assert.match(route, /allowedCallerKeys: \[\]/);
  assert.match(proxy, /resolveApplicationSession/);
  assert.match(proxy, /requireResourceScope\(resolution\.session, resolution\.session\.activeOrganization\.id, capability\)/);
  assert.match(proxy, /sanitized\.workspace_id = scope\.workspaceId/);
  assert.match(proxy, /sanitized\.actor_id = scope\.session\.user\.id/);
  assert.match(proxy, /sanitized\.correlation_id = scope\.session\.correlationId/);
  assert.match(proxy, /options\.rejectCallerScopeHints && suppliedScopeHints/);
});

test("M4.2b exposes no general Work Item creation route and keeps production transition evidence incomplete", () => {
  const collection = source("app/api/work-items/route.ts");
  const fixture = source("app/api/work-items/acceptance-fixtures/ws019-m4-2/route.ts");
  assert.doesNotMatch(collection, /export async function POST/);
  assert.match(fixture, /ws019-m4-2/);
  assert.ok(PRODUCTION_V1_RELEASE_REQUIREMENTS.includes("authorized_work_item_transitions"));
});
