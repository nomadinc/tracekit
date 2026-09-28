import assert from"node:assert/strict";import test from"node:test";import{readFileSync}from"node:fs";
const source=readFileSync(new URL("../lib/customers/production-repository.ts",import.meta.url),"utf8");
test("M13 server-side customer repository resolves relative internal API through explicit app origin",()=>{assert.match(source,/TRACEKIT_APP_BASE_URL/);assert.match(source,/VERCEL_URL/);assert.match(source,/customer_repository_server_origin_unavailable/);assert.match(source,/fetch\(requestUrl\(path\)/);});
test("M13 browser customer reads remain relative same-origin",()=>{assert.match(source,/typeof window !== "undefined"\) return path/);});
test("M13 customer repository does not route internal API through Journey external API base",()=>{assert.doesNotMatch(source,/TRACEKIT_API_BASE_URL|NEXT_PUBLIC_API_BASE/);});
