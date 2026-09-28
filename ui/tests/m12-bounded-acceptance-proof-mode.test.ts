import assert from"node:assert/strict";import test from"node:test";import{readFileSync}from"node:fs";
const source=readFileSync(new URL("../lib/mcp/action-orchestration.ts",import.meta.url),"utf8"),proof=readFileSync(new URL("../lib/mcp/action-acceptance-proof.ts",import.meta.url),"utf8");
test("M12 normal orchestration remains disabled unless registry or exact proof authorization permits",()=>{assert.ok(source.includes("!capability.executionAvailable&&!proof.allowed"));assert.ok(source.includes('reason:"capability_execution_disabled"'));});
test("M12 acceptance proof cannot authorize Commas Shopify or provider mutation",()=>{for(const token of['c?.operation==="inspect_evidence"','c.provider==="tracekit"','c.targetKind==="journey_evidence"','c.mutationClass==="none"','c.executionAvailable===false'])assert.ok(proof.includes(token));});
test("M12 acceptance proof does not mutate registry exposure",()=>{assert.doesNotMatch(proof,/executionAvailable\s*=|M12_ACTION_CAPABILITIES\s*\[/);});
