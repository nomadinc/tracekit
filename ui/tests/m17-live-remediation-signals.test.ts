import assert from"node:assert/strict";import test from"node:test";import{readFileSync}from"node:fs";
const live=readFileSync(new URL("../lib/mcp/m17-live-remediation-signals.ts",import.meta.url),"utf8"),adapter=readFileSync(new URL("../lib/mcp/tool-adapter.ts",import.meta.url),"utf8");
test("M17 live remediation signal view composes proven provider inspectors",()=>{assert.match(live,/inspectLiveShopifyWebhookRemediation/);assert.match(live,/inspectLiveEverflowSyncRemediation/);assert.match(live,/shopifyRemediationSignal/);assert.match(live,/everflowRemediationSignal/);});
test("M17 aggregate actionRequired derives only from provider signals",()=>{assert.match(live,/signals\.some\(s=>s\.actionRequired\)/);assert.doesNotMatch(live,/actionRequired:true/);});
test("M17 remediation signal inspection remains read only",()=>{assert.match(adapter,/tracekit\.inspect_remediation_signals/);assert.doesNotMatch(live,/prepare|confirm|execute|sync-now|createTraceKit|deleteTraceKit|POST/);});
