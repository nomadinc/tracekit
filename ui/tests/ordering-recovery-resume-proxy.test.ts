import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/api/commerce/resume-ordering-evidence-only/route.ts", import.meta.url), "utf8");

test("reserved recovery resume proxy rejects unauthenticated, organization-less, unauthorized, and cross-origin requests", () => {
  assert.match(route, /if \(!sameOrigin\(request\)\).*request_verification_failed.*403/);
  assert.match(route, /resolution\.kind !== "authenticated" \|\| !resolution\.session\.activeOrganization/);
  assert.match(route, /resource_unavailable.*404/);
  assert.match(route, /requirePermission\(resolution\.session, "connectors\.manage"\)/);
  assert.match(route, /error instanceof AuthorizationDeniedError/);
  assert.match(route, /origin === new URL\(request\.url\)\.origin/);
  assert.match(route, /site === "same-origin"/);
});

test("reserved recovery resume proxy accepts only its exact confirmation and fixed upstream path", () => {
  assert.match(route, /Object\.keys\(body\)\.length !== 1/);
  assert.match(route, /body\.confirmation !== confirmation/);
  assert.match(route, /explicit_confirmation_required/);
  assert.match(route, /internal\/commerce\/resume-ordering-evidence-only/);
  assert.match(route, /body: JSON\.stringify\(\{ confirmation \}\)/);
  assert.doesNotMatch(route, /body\.(run|run_id|organization|org_id|connection|connection_id|provider|provider_account|scope|max_pages|per_page)/);
  assert.doesNotMatch(route, /recover-ordering-evidence-only/);
});

test("reserved recovery resume proxy keeps the Worker secret server-side and makes no direct data or provider calls", () => {
  assert.match(route, /process\.env\.TK_SECRET_KEY/);
  assert.match(route, /"x-tk-secret": secret/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_TK_SECRET_KEY/);
  assert.doesNotMatch(route, /\.from\(|\.rpc\(|continuous_commerce|public-api|fanbasis|Commas|supabase/i);
});

test("reserved recovery resume proxy sanitizes success and failure responses", () => {
  assert.match(route, /safeCode\(payload\.code\)/);
  assert.match(route, /safeRunId\(payload\.run_id\)/);
  assert.match(route, /allowedCodes\.has\(code\)/);
  assert.match(route, /upstream\.status >= 500 \? 502 : 409/);
  assert.match(route, /evidence_only_recovery: payload\.evidence_only_recovery === true/);
  assert.match(route, /provider_requests: payload\.provider_requests === 0 \? 0 : null/);
  assert.doesNotMatch(route, /NextResponse\.json\(payload|error: payload|message: payload|details: payload|console\.(log|error)/);
});
