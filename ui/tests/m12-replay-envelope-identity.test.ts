import {withDurableStore} from "./fixtures/m12-durable-store";
import {orchestrateInspectEvidence} from "../lib/mcp/action-orchestration";
import type {GovernedActionPlan} from "../lib/mcp/journey-repository";
const plan:GovernedActionPlan={recommendationId:"rec-1",recommendationType:"inspect_identifier_propagation",state:"confirmation_required",stateReason:"test",mode:"plan_only",target:{customerId:"customer-1",journeyId:"journey-1",boundaries:[]},requiredPermission:"customers.view",confirmation:{required:true,reason:"test"},prerequisites:[],proposedOperation:{type:"inspect_evidence",description:"inspect"},expectedPostconditions:[],verification:[],rollback:{available:false,reason:"read-only"},audit:{required:true,action:"mcp.tool.plan_action"},evidence:{supportingEventIds:[],uncertainty:[]}};
import assert from"node:assert/strict";import test from"node:test";import{readFileSync}from"node:fs";
const repo=readFileSync(new URL("../lib/mcp/action-authorization-repository.ts",import.meta.url),"utf8"),orch=readFileSync(new URL("../lib/mcp/action-orchestration.ts",import.meta.url),"utf8");
test("M12 authorization persists exact envelope createdAt for deterministic replay identity",()=>{assert.ok(repo.includes("envelope_created_at:envelope.createdAt"));assert.ok(repo.includes("envelopeCreatedAt:r.envelope_created_at"));});
test("M12 replay rebuilds exact persisted envelope identity under organization scope",async()=>{
 await withDurableStore(async store=>{
  const session={user:{id:"user-1"},activeOrganization:{id:"org-1"},effectivePermissions:["customers.view","actions.execute"]} as any;
  const input={plan,planIdentity:"plan-1",confirmation:{confirmationId:"confirm-1",confirmedAt:"2026-09-28T01:25:00Z",confirmedPlanIdentity:"plan-1",confirmedCustomerId:"customer-1",confirmedJourneyId:"journey-1"},requestedAt:"2026-09-28T01:30:00Z",consumptionId:"consume-1",idempotencyKey:"idem-1",auditCorrelationId:"audit-1",expiresAt:"2026-09-28T02:00:00Z",verificationEvidence:[]};
  const first=await orchestrateInspectEvidence(session,input);assert.equal(first.reason,"completed");
  const authorizationId=store.authorizations[0].authorization_id;
  const replay=await orchestrateInspectEvidence(session,{...input,authorizationId,requestedAt:"2026-09-28T01:45:00Z",consumptionId:"consume-2"});
  assert.equal(replay.reason,"replay_same_result");assert.equal(replay.envelope?.createdAt,first.envelope?.createdAt);assert.equal(replay.envelope?.envelopeIdentity,first.envelope?.envelopeIdentity);assert.deepEqual(replay.execution,first.execution);assert.equal(store.authorizations.length,1);assert.equal(store.results.length,1);
  const read=store.calls.find(c=>c.url.searchParams.get("authorization_id")===`eq.${authorizationId}`);assert.equal(read?.url.searchParams.get("organization_id"),"eq.org-1");
  for(const changed of [{idempotencyKey:"foreign"},{auditCorrelationId:"foreign"},{planIdentity:"foreign",confirmation:{...input.confirmation,confirmedPlanIdentity:"foreign"}}]){const rejected=await orchestrateInspectEvidence(session,{...input,...changed,authorizationId});assert.equal(rejected.reason,"authorization_provenance_failed");}
  const foreign=await orchestrateInspectEvidence({...session,activeOrganization:{id:"org-2"}},{...input,authorizationId});assert.equal(foreign.reason,"authorization_provenance_failed");
  store.results.length=0;const missing=await orchestrateInspectEvidence(session,{...input,authorizationId});assert.equal(missing.reason,"replay_result_unavailable");assert.equal(store.results.length,0);
 });
});
test("M12 consumed replay may outlive original confirmation freshness but must retain exact confirmation binding",()=>{assert.ok(orch.includes("confirmationMatches"));assert.ok(orch.includes("confirmationMatches&&(replayCandidate||confirmationFresh)"));});
test("M12 new execution still requires fresh confirmation",()=>{assert.ok(orch.includes('replayAuthorization?.state==="consumed"&&Boolean(replayAuthorization.envelopeCreatedAt)'));assert.ok(orch.includes("replayCandidate||confirmationFresh"));});

test("M12 legacy authorizations are not given fabricated envelope timestamps",()=>{assert.doesNotMatch(repo,/envelopeCreatedAt:r\.consumed_at/);});
