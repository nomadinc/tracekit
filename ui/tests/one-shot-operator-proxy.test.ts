import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/api/commerce/one-shot-shadow/route.ts", import.meta.url), "utf8");

test("one-shot operator proxy uses authenticated same-origin RBAC", () => {
  assert.match(route, /sameOrigin\(request\)/);
  assert.match(route, /resolveApplicationSession\(\)/);
  assert.match(route, /requirePermission\(resolution\.session, "connectors\.manage"\)/);
  assert.match(route, /AuthorizationDeniedError/);
});

test("one-shot proxy fixes scope and bounds server-side", () => {
  assert.match(route, /ea1c2313-6120-4692-84c5-ec3562e7dcf6/);
  assert.match(route, /body\.confirmation !== confirmation/);
  assert.match(route, /resource: "transactions"/);
  assert.match(route, /mode: "continuous"/);
  assert.match(route, /max_pages: 8/);
  assert.match(route, /per_page: 100/);
  assert.match(route, /const requestKey = randomUUID\(\)/);
  assert.doesNotMatch(route, /body\.connection_id|body\.resource|body\.mode|body\.max_pages|body\.per_page/);
});

test("secret is server-only and the response is sanitized", () => {
  assert.match(route, /process\.env\.TK_SECRET_KEY/);
  assert.match(route, /"x-tk-secret": secret/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_TK_SECRET_KEY|localStorage|console\.(log|error)/);
  assert.doesNotMatch(route, /NextResponse\.json\(payload/);
  assert.match(route, /run_id: typeof payload\.run_id === "string"/);
  assert.match(route, /safeCode\(payload\.error \|\| payload\.code/);
});

test("proxy does not mutate scheduler, schedule, activation, or provider state", () => {
  assert.doesNotMatch(route, /commerce_sync_schedules.*(update|insert|delete)|tracekit_production_controls|commerce_repository_activation/);
  assert.doesNotMatch(route, /fanbasis|public-api|continuous_commerce\.send|CONTINUOUS_COMMERCE_RUNTIME/);
});

test("stranded-run recovery proxy is authenticated, confirmation-bound, and server-only",()=>{
  const recovery=readFileSync(new URL("../app/api/commerce/recover-stranded-one-shot/route.ts",import.meta.url),"utf8");
  assert.match(recovery,/sameOrigin\(request\)/);
  assert.match(recovery,/resolveApplicationSession\(\)/);
  assert.match(recovery,/requirePermission\(resolution\.session, "connectors\.manage"\)/);
  assert.match(recovery,/recover-stranded-commas-one-shot/);
  assert.match(recovery,/internal\/commerce\/recover-stranded-one-shot/);
  assert.match(recovery,/process\.env\.TK_SECRET_KEY/);
  assert.doesNotMatch(recovery,/NEXT_PUBLIC_TK_SECRET_KEY|localStorage|console\.(log|error)|request\.body\.run/);
  assert.match(recovery,/operator_recovery: payload\.operator_recovery === true/);
});
