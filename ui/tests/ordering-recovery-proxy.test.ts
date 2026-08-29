import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/api/commerce/recover-ordering-evidence-only/route.ts", import.meta.url), "utf8");

test("ordering evidence recovery proxy requires session, organization, permission, and same origin", () => {
  assert.match(route, /sameOrigin\(request\)/);
  assert.match(route, /resolveApplicationSession\(\)/);
  assert.match(route, /activeOrganization/);
  assert.match(route, /requirePermission\(resolution\.session, "connectors\.manage"\)/);
  assert.match(route, /request_verification_failed/);
  assert.match(route, /AuthorizationDeniedError/);
});

test("ordering evidence recovery proxy fixes confirmation, scope, and upstream path server-side", () => {
  assert.match(route, /recover-ordering-evidence-only/);
  assert.match(route, /fdf97cb1-222c-4fb3-b02d-b4502a3f85a9/);
  assert.match(route, /internal\/commerce\/recover-ordering-evidence-only/);
  assert.doesNotMatch(route, /body\.run|body\.connection|body\.organization|body\.max_pages|body\.per_page/);
  assert.match(route, /body: JSON\.stringify\(\{ confirmation \}\)/);
});

test("ordering evidence recovery proxy keeps credentials server-only and sanitizes responses", () => {
  assert.match(route, /process\.env\.TK_SECRET_KEY/);
  assert.match(route, /"x-tk-secret": secret/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_TK_SECRET_KEY|console\.(log|error)|NextResponse\.json\(payload/);
  assert.match(route, /safeCode\(payload\.code\)/);
  assert.match(route, /safeRunId\(payload\.run_id\)/);
  assert.match(route, /evidence_only_recovery: payload\.evidence_only_recovery === true/);
  assert.doesNotMatch(route, /commercePersistenceRequest|\.from\(|\.rpc\(|continuous_commerce|public-api|Commas/i);
});
