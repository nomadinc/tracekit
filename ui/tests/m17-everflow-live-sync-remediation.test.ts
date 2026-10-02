import assert from"node:assert/strict";import test from"node:test";import{readFileSync}from"node:fs";
const live=readFileSync(new URL("../lib/mcp/m17-everflow-live-sync-remediation.ts",import.meta.url),"utf8"),adapter=readFileSync(new URL("../lib/mcp/tool-adapter.ts",import.meta.url),"utf8");
test("M17 live Everflow remediation derives only from authorized Connections experience",()=>{assert.match(live,/loadConnectionExperiences/);assert.match(live,/provider===\"everflow\"/);assert.match(live,/assessEverflowSyncRemediationEligibility/);});
test("M17 live Everflow remediation remains read only",()=>{assert.doesNotMatch(live,/sync-now|runEverflowScheduledChunk|POST|fetch\(/);assert.match(adapter,/tracekit\.inspect_everflow_sync_remediation/);});
test("M17 live Everflow remediation reports exact connection identity",()=>{assert.match(live,/connectionId:c\.id/);assert.match(live,/displayName:c\.displayName/);});
