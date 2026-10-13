import {TRACEKIT_MCP_TOOLS,callTraceKitMcpTool} from "../lib/mcp/tool-adapter";
import type {TraceKitMcpReadService} from "../lib/mcp/read-service";
import assert from"node:assert/strict";import test from"node:test";import{readFileSync}from"node:fs";
const d=readFileSync(new URL("../lib/mcp/provider-action-discovery.ts",import.meta.url),"utf8"),a=readFileSync(new URL("../lib/mcp/tool-adapter.ts",import.meta.url),"utf8");
test("M16 provider action discovery is contract and readiness backed",()=>{assert.match(d,/assessM16ProviderActionExposure/);assert.match(d,/inspectCommasTestDeliveryReadiness/);assert.match(d,/inspectShopifyControlledProofReadiness/);assert.match(d,/server_resolved_exact_target/);assert.match(d,/session\.effectivePermissions\.includes/);});
test("M16 discovery cannot prepare confirm authorize or execute",()=>{assert.doesNotMatch(d,/issue.*Intent|confirmMcp|issueMcpActionAuthorization|consumeMcpActionAuthorization|resolveDurableExecutionGate|orchestrate|createTraceKit|deleteTraceKit/i);});
test("M16 discovery MCP tool is read only and caller blind",async()=>{
 const tool=TRACEKIT_MCP_TOOLS.find(tool=>tool.name==="tracekit.discover_provider_actions");assert.ok(tool);
 assert.deepEqual(tool.inputSchema,{type:"object",properties:{},additionalProperties:false});
 assert.deepEqual(tool.annotations,{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false});
 let calls=0;const result={organizationId:"session-organization",actions:[]};
 const service={discoverProviderActions:async()=>{calls++;return result;}} as unknown as TraceKitMcpReadService;
 assert.equal(await callTraceKitMcpTool(service,tool.name,{}),result);assert.equal(calls,1);
 for(const key of ["provider","target","shopDomain","callbackUrl","subscriptionId","eventType","organizationId","tenant","credentials","apiKey","operation","intent_id","confirmation_id","requested_at","consumption_id","idempotency_key","executionAvailable"]){
  await assert.rejects(callTraceKitMcpTool(service,tool.name,{[key]:"caller-selected"}),/invalid_arguments/);
 }
 assert.equal(calls,1,"caller arguments must be rejected before discovery delegation");
});
test("M16 discovery does not merge provider readiness across organizations",()=>{assert.match(d,/inspectCommasTestDeliveryReadiness\(session\)/);assert.match(d,/inspectShopifyControlledProofReadiness\(session,appOrigin\)/);assert.match(d,/organizationId:session\.activeOrganization!/);});
test("M16 discovery touched TypeScript sources contain no escaped newline artifacts",()=>{for(const file of["../lib/mcp/provider-action-discovery.ts","../lib/mcp/read-service.ts","../lib/mcp/tool-adapter.ts"]){const s=readFileSync(new URL(file,import.meta.url),"utf8");assert.doesNotMatch(s,/\\\\n/);}});
test("M16 discovery handoff names only caller-blind prepare tools",()=>{assert.match(d,/tracekit\.prepare_commas_test_delivery/);assert.match(d,/tracekit\.prepare_shopify_controlled_proof/);assert.match(d,/arguments:\{\}/);assert.doesNotMatch(d,/nextStep:[\s\S]{0,250}(?:shopDomain|callbackUrl|subscriptionId|eventType|credential|externalId)/);assert.doesNotMatch(d,/tracekit\.execute_/);});
