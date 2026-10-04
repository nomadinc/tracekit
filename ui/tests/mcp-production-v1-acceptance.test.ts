import assert from "node:assert/strict";
import test from "node:test";
import { assessIntelligenceAction, assessIntelligenceEvaluation, PRODUCTION_V1_ACTION_MATRIX, PRODUCTION_V1_EVIDENCE_STAGES, PRODUCTION_V1_NOTIFICATION_CONTRACT } from "../lib/mcp/production-v1-policy";
import { evaluateProductionV1Acceptance, projectIntelligenceLifecycle, PRODUCTION_V1_SCENARIOS } from "../lib/mcp/production-v1-acceptance";

test("M2 freezes the controlled Production V1 provider/action matrix",()=>{
  assert.equal(PRODUCTION_V1_ACTION_MATRIX.find(x=>x.operation==="shopify.controlled_webhook_create_delete_proof")?.classification,"production_proven");
  assert.equal(PRODUCTION_V1_ACTION_MATRIX.find(x=>x.operation==="bounded_manual_sync")?.executable,false);
  assert.equal(PRODUCTION_V1_ACTION_MATRIX.find(x=>x.operation==="commas.webhook_test_delivery")?.classification,"engineering_ready_not_live_proven");
  assert.equal(assessIntelligenceAction("everflow.generic_write",{}).allowed,false);
  assert.equal(assessIntelligenceAction("commas.webhook_test_delivery",{}).allowed,false);
});

test("M2 safe-disable gates fail closed without removing reads or evidence",()=>{
  assert.deepEqual(assessIntelligenceEvaluation({TRACEKIT_INTELLIGENCE_EVALUATION:"disabled"}),{allowed:false,reason:"intelligence_evaluation_disabled"});
  assert.equal(assessIntelligenceAction("shopify.controlled_webhook_create_delete_proof",{TRACEKIT_INTELLIGENCE_MUTATIONS:"disabled"}).reason,"intelligence_mutations_disabled");
  assert.equal(assessIntelligenceAction("shopify.controlled_webhook_create_delete_proof",{TRACEKIT_INTELLIGENCE_PROVIDER_SHOPIFY:"disabled"}).reason,"provider_action_family_disabled");
  assert.equal(assessIntelligenceAction("shopify.controlled_webhook_create_delete_proof",{TRACEKIT_INTELLIGENCE_ACTION_SHOPIFY_CONTROLLED_WEBHOOK_CREATE_DELETE_PROOF:"disabled"}).reason,"provider_action_disabled");
});

test("M2 acceptance manifest requires every release-evidence stage and scenario",()=>{
  const stages=Object.fromEntries(PRODUCTION_V1_EVIDENCE_STAGES.map(stage=>[stage,[`evidence:${stage}`]]));
  const scenarios=PRODUCTION_V1_SCENARIOS.map(scenario=>({scenario,passed:true,evidenceRefs:[`evidence:${scenario}`],observedAt:"2026-10-03T00:00:00Z"}));
  const pass=evaluateProductionV1Acceptance({organizationId:"org-1",actionOperation:"shopify.controlled_webhook_create_delete_proof",stages,scenarios});
  assert.equal(pass.certifiable,true);
  const fail=evaluateProductionV1Acceptance({organizationId:"org-1",actionOperation:"shopify.controlled_webhook_create_delete_proof",stages:{},scenarios:[]});
  assert.equal(fail.certifiable,false);assert.equal(fail.missingStages.length,11);assert.equal(fail.missingScenarios.length,13);
});

test("M2 lifecycle projection preserves durable finding through resolution or failure ordering",()=>{
  const history=projectIntelligenceLifecycle([
    {kind:"verification",id:"verify-1",occurredAt:"2026-10-03T00:04:00Z",evidenceRef:"result:1"},
    {kind:"finding",id:"finding-1",occurredAt:"2026-10-03T00:00:00Z",evidenceRef:"work-item:1"},
    {kind:"confirmation",id:"confirm-1",occurredAt:"2026-10-03T00:02:00Z",evidenceRef:"confirmation:1"},
  ]);
  assert.deepEqual(history.map(x=>x.kind),["finding","confirmation","verification"]);
});

test("M2 notification contract uses Notification Center for each minimum event",()=>{
  assert.equal(PRODUCTION_V1_NOTIFICATION_CONTRACT.length,6);
  assert.ok(PRODUCTION_V1_NOTIFICATION_CONTRACT.every(item=>item.channel==="notification_center"&&item.dedupe));
});
