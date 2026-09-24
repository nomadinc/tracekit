import assert from "node:assert/strict";
import test from "node:test";
import { bearerToken, mcpWwwAuthenticate, TRACEKIT_MCP_RESOURCE } from "../lib/mcp/bearer-auth";

test("M3 bearer parser accepts only bearer authorization",()=>{
 assert.equal(bearerToken(new Request("https://x",{headers:{authorization:"Bearer abc.def.ghi"}})),"abc.def.ghi");
 assert.equal(bearerToken(new Request("https://x",{headers:{authorization:"Basic abc"}})),null);
});
test("M3 MCP resource and OAuth challenge use canonical production endpoint",()=>{
 assert.equal(TRACEKIT_MCP_RESOURCE,"https://app.trace-kit.io/api/mcp");
 assert.match(mcpWwwAuthenticate(),/resource_metadata="https:\/\/app\.trace-kit\.io\/\.well-known\/oauth-protected-resource"/);
});
