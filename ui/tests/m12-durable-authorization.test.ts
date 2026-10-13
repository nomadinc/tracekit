import {withDurableStore} from "./fixtures/m12-durable-store";
import {orchestrateInspectEvidence} from "../lib/mcp/action-orchestration";
import assert from"node:assert/strict";import test from"node:test";import{readFileSync}from"node:fs";
const repo=readFileSync(new URL("../lib/mcp/action-authorization-repository.ts",import.meta.url),"utf8"),orchestration=readFileSync(new URL("../lib/mcp/action-orchestration.ts",import.meta.url),"utf8");
test("M12 durable authorization is service-role persistence backed",()=>{assert.match(repo,/SUPABASE_SERVICE_ROLE_KEY/);assert.match(repo,/mcp_action_authorizations/);assert.match(repo,/consume_mcp_action_authorization/);});
test("M12 authorization issuance binds immutable envelope identity and audit keys",()=>{for(const token of["envelope_identity:envelope.envelopeIdentity","idempotency_key:envelope.idempotencyKey","audit_correlation_id:envelope.auditCorrelationId","organization_id:envelope.organizationId"])assert.match(repo,new RegExp(token.replace(/[.]/g,"\\.")));});
test("M12 unregistered capability rejects before any durable authorization request",async()=>{
 await withDurableStore(async store=>{
  const x=await orchestrateInspectEvidence({user:{id:"user-1"},activeOrganization:{id:"org-1"},effectivePermissions:["customers.view","actions.execute"]} as any,{plan:{proposedOperation:{type:"provider.request"},requiredPermission:"customers.view",confirmation:{required:true},target:{customerId:"c",journeyId:"j"}},planIdentity:"p",confirmation:{confirmationId:"confirm",confirmedAt:"2026-09-28T01:30:00Z",confirmedPlanIdentity:"p",confirmedCustomerId:"c",confirmedJourneyId:"j"},requestedAt:"2026-09-28T01:30:00Z"} as any);
  assert.equal(x.reason,"governance_gate_failed");assert.equal(x.governance.capabilityBound,false);assert.equal(store.calls.length,0);
 });
});
test("M12 consumption uses database atomic RPC rather than caller authorization state",()=>{assert.match(orchestration,/consumeMcpActionAuthorization/);assert.doesNotMatch(orchestration,/authorization:AuthorizationConsumptionRecord/);});
