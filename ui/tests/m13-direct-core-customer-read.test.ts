import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../lib/customers/production-repository.ts",import.meta.url),"utf8");
test("M13 server customer reads use authoritative authenticated scope directly against Core",()=>{assert.ok(source.includes("scope?.authenticated"));assert.ok(source.includes('params.set("workspace_id",scope.organizationId)'));assert.ok(source.includes('"x-tk-secret":secret'));assert.ok(source.includes("TRACEKIT_API_BASE_URL"));});
test("M13 server customer reads do not nested-fetch session-protected Next API",()=>{assert.ok(source.includes('replace(/^\\/api\\/customers/,"/v1/customers")'));assert.equal(source.includes("TRACEKIT_APP_BASE_URL"),false);assert.equal(source.includes("VERCEL_URL"),false);});
test("M13 browser customer repository retains same-origin Next API path",()=>{assert.ok(source.includes('typeof window!=="undefined"'));assert.ok(source.includes("return readJson(await fetch(path"));});
test("M13 all production repository reads pass governed scope",()=>{for(const line of source.split("\n").filter(x=>x.includes("await get(`")))assert.ok(line.includes(",scope)"),line);});
