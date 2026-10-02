import assert from"node:assert/strict";import test from"node:test";import{readFileSync}from"node:fs";
const k=readFileSync(new URL("../lib/mcp/durable-execution-gate.ts",import.meta.url),"utf8");
const a=readFileSync(new URL("../lib/mcp/action-authorization-repository.ts",import.meta.url),"utf8");
const e=readFileSync(new URL("../lib/mcp/action-execution-result-repository.ts",import.meta.url),"utf8");
test("M16 durable execution kernel owns provider-neutral authorization and replay decisions",()=>{assert.match(k,/findMcpActionAuthorization/);assert.match(k,/issueMcpActionAuthorization/);assert.match(k,/consumeMcpActionAuthorization/);assert.match(k,/readMcpExecutionResult/);assert.match(k,/replay_same_result/);assert.match(k,/replay_result_unavailable/);assert.match(k,/authorization_rejected/);});
test("M16 kernel contains no provider target credential mutation or recovery knowledge",()=>{assert.doesNotMatch(k,/shopify|commas|credential|webhook|subscription|rollback|recovery|fetch\(/i);});
test("M16 leaves durable authorization and execution-result repositories unchanged",()=>{assert.match(a,/consume_mcp_action_authorization/);assert.match(e,/mcp_action_execution_results/);});
