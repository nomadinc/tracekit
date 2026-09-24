import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("MCP customer repository uses TraceKit Core directly, not relative UI fetches",()=>{
 const source=readFileSync(new URL("../lib/mcp/customer-repository.ts",import.meta.url),"utf8");
 assert.match(source,/TRACEKIT_API_BASE_URL/);
 assert.match(source,/x-tk-secret/);
 assert.match(source,/\/v1\/customers/);
 assert.doesNotMatch(source,/fetch\(\s*["'`]\/api\/customers/);
});
test("MCP server is wired to the server-native customer repository",()=>{
 const source=readFileSync(new URL("../lib/mcp/server.ts",import.meta.url),"utf8");
 assert.match(source,/mcpCustomerRepository/);
 assert.doesNotMatch(source,/productionCustomerRepository/);
});
