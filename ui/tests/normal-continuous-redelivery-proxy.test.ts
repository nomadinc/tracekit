import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route=readFileSync(new URL("../app/api/commerce/redeliver-normal-continuous-acceptance/route.ts",import.meta.url),"utf8");

test("fixed redelivery proxy requires authentication, active organization, permission, and same origin",()=>{assert.match(route,/resolution\.kind!=="authenticated"\|\|!resolution\.session\.activeOrganization/);assert.match(route,/requirePermission\(resolution\.session,"connectors\.manage"\)/);assert.match(route,/error instanceof AuthorizationDeniedError/);assert.match(route,/origin===new URL\(request\.url\)\.origin/);assert.match(route,/site==="same-origin"/)});
test("fixed redelivery proxy accepts only confirmation and sends no caller scope upstream",()=>{assert.match(route,/Object\.keys\(body\)\.length!==1/);assert.match(route,/body\.confirmation!==confirmation/);assert.match(route,/internal\/commerce\/redeliver-normal-continuous-acceptance/);assert.match(route,/body:JSON\.stringify\(\{confirmation\}\)/);assert.doesNotMatch(route,/body\.(run|run_id|organization|connection|provider|max_pages|per_page|mode)/)});
test("fixed redelivery proxy uses only server secret and sanitizes both response paths",()=>{assert.match(route,/process\.env\.TK_SECRET_KEY/);assert.doesNotMatch(route,/NEXT_PUBLIC_TK_SECRET_KEY/);assert.match(route,/safeCode\(payload\.code\)/);assert.match(route,/safeRunId\(payload\.run_id\)/);assert.doesNotMatch(route,/NextResponse\.json\(payload|error:payload|message:payload|details:payload|\.from\(|\.rpc\(|continuous_commerce|supabase|Commas/i)});
