import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route=readFileSync(new URL("../app/api/commerce/normal-continuous-acceptance/route.ts",import.meta.url),"utf8");

test("normal acceptance proxy is WorkOS, organization, permission, and same-origin protected",()=>{
  assert.match(route,/sameOrigin\(request\)/);
  assert.match(route,/resolveApplicationSession\(\)/);
  assert.match(route,/activeOrganization/);
  assert.match(route,/requirePermission\(resolution\.session,"connectors\.manage"\)/);
  assert.match(route,/AuthorizationDeniedError/);
});

test("normal acceptance proxy accepts only confirmation and fixes the upstream contract",()=>{
  assert.match(route,/Object\.keys\(body\)\.length!==1/);
  assert.match(route,/normal-continuous-shadow-acceptance/);
  assert.match(route,/internal\/commerce\/normal-continuous-acceptance/);
  assert.match(route,/request_key:randomUUID\(\)/);
  assert.doesNotMatch(route,/body\.(run|organization|connection|provider_account|max_pages|per_page)/);
});

test("normal acceptance proxy keeps the secret server-side and sanitizes responses",()=>{
  assert.match(route,/process\.env\.TK_SECRET_KEY/);
  assert.match(route,/"x-tk-secret":secret/);
  assert.doesNotMatch(route,/NEXT_PUBLIC_TK_SECRET_KEY|NextResponse\.json\(payload|console\.(log|error)/);
  assert.match(route,/code:"normal_acceptance_failed"/);
  assert.match(route,/runIdPattern/);
  assert.match(route,/payload\.max_pages===5\?5:null/);
});
