import assert from"node:assert/strict";
import test from"node:test";
import{readFileSync}from"node:fs";
import{M12_ACTION_CAPABILITIES,resolveM12ActionCapability}from"../lib/mcp/action-capability-registry";
import{assessM16ProviderActionExposure}from"../lib/mcp/provider-action-contract";
import{listTraceKitMcpTools}from"../lib/mcp/tool-adapter";
import{assessIntelligenceAction,assessIntelligenceEvaluation,PRODUCTION_V1_ACTION_MATRIX,PRODUCTION_V1_EVIDENCE_STAGES,productionV1ActionEnvironmentKey}from"../lib/mcp/production-v1-policy";
import{evaluateProductionV1Acceptance,PRODUCTION_V1_RELEASE_REQUIREMENTS,PRODUCTION_V1_SCENARIOS}from"../lib/mcp/production-v1-acceptance";

const root=new URL("..",import.meta.url);
const source=(path:string)=>readFileSync(new URL(path,root),"utf8");

test("M4 freezes the Production V1 provider/action matrix and unknown operations fail closed",()=>{
  assert.deepEqual(PRODUCTION_V1_ACTION_MATRIX.map(({provider,operation,classification,executable})=>({provider,operation,classification,executable})),[
    {provider:"shopify",operation:"shopify.controlled_webhook_create_delete_proof",classification:"production_proven",executable:true},
    {provider:"shopify",operation:"repair_ingestion_webhooks",classification:"read_only_finding",executable:false},
    {provider:"everflow",operation:"bounded_manual_sync",classification:"read_only_finding",executable:false},
    {provider:"everflow",operation:"generic_provider_mutation",classification:"not_supported",executable:false},
    {provider:"commas",operation:"commas.webhook_test_delivery",classification:"engineering_ready_not_live_proven",executable:false},
    {provider:"commas",operation:"create_webhook_subscription",classification:"not_supported",executable:false},
  ]);
  assert.equal(assessIntelligenceAction("unknown.operation",{}).reason,"operation_not_in_production_v1_matrix");
  assert.equal(assessIntelligenceAction("commas.webhook_test_delivery",{[productionV1ActionEnvironmentKey("commas.webhook_test_delivery")]:"enabled"}).allowed,false);
});

test("M4 safe-disable hierarchy defaults certified Shopify on and fails closed on disables or invalid values",()=>{
  const operation="shopify.controlled_webhook_create_delete_proof";
  assert.equal(assessIntelligenceAction(operation,{}).allowed,true);
  for(const [key,reason]of[
    ["TRACEKIT_INTELLIGENCE_MUTATIONS","intelligence_mutations_disabled"],
    ["TRACEKIT_INTELLIGENCE_PROVIDER_SHOPIFY","provider_action_family_disabled"],
    [productionV1ActionEnvironmentKey(operation),"provider_action_disabled"],
  ]as const)assert.equal(assessIntelligenceAction(operation,{[key]:"disabled"}).reason,reason);
  for(const key of["TRACEKIT_INTELLIGENCE_MUTATIONS","TRACEKIT_INTELLIGENCE_PROVIDER_SHOPIFY",productionV1ActionEnvironmentKey(operation)])assert.match(assessIntelligenceAction(operation,{[key]:"surprise"}).reason,/invalid/);
  assert.equal(assessIntelligenceEvaluation({TRACEKIT_INTELLIGENCE_EVALUATION:"disabled"}).allowed,false);
  assert.equal(assessIntelligenceEvaluation({TRACEKIT_INTELLIGENCE_EVALUATION:"surprise"}).allowed,false);
});

test("M4 exposes Shopify and suppresses Commas in capability and MCP discovery",()=>{
  const shopify=resolveM12ActionCapability("shopify.controlled_webhook_create_delete_proof")!;
  const commas=resolveM12ActionCapability("commas.webhook_test_delivery")!;
  assert.equal(assessM16ProviderActionExposure(shopify).exposed,true);
  assert.equal(assessM16ProviderActionExposure(commas).exposed,false);
  assert.equal(commas.executionAvailable,false);
  const adapter=source("lib/mcp/tool-adapter.ts");
  assert.doesNotMatch(adapter,/name:"tracekit\.(prepare|confirm|execute)_commas_test_delivery"/);
  assert.match(adapter,/name:"tracekit\.execute_shopify_controlled_proof"/);
});

test("M4 mutation, provider and action disables remove Shopify mutation tools",()=>{
  const mutationNames=(env:Record<string,string>)=>listTraceKitMcpTools(env).map(tool=>tool.name).filter(name=>name.includes("shopify_controlled_proof")&&!name.includes("inspect"));
  assert.deepEqual(mutationNames({}),["tracekit.execute_shopify_controlled_proof","tracekit.prepare_shopify_controlled_proof","tracekit.confirm_shopify_controlled_proof"]);
  assert.deepEqual(mutationNames({TRACEKIT_INTELLIGENCE_MUTATIONS:"disabled"}),[]);
  assert.deepEqual(mutationNames({TRACEKIT_INTELLIGENCE_PROVIDER_SHOPIFY:"disabled"}),[]);
  assert.deepEqual(mutationNames({TRACEKIT_INTELLIGENCE_ACTION_SHOPIFY_CONTROLLED_WEBHOOK_CREATE_DELETE_PROOF:"disabled"}),[]);
});

test("M4 Commas prepare, confirm and execute fail before persistence or provider access",()=>{
  const service=source("lib/mcp/action-service.ts"),prepare=service.split("async prepareApprovedCommasTestDelivery")[1].split("async prepareCommasTestDelivery")[0],confirm=service.split("async confirmCommasTestDelivery")[1].split("async prepareApprovedShopifyControlledProof")[0],execute=service.split("async executeCommasTestDelivery")[1];
  assert.ok(prepare.indexOf("assessIntelligenceAction")<prepare.indexOf("resolveApprovedCommasTestDeliveryTarget"));
  assert.ok(confirm.indexOf("assessIntelligenceAction")<confirm.indexOf("confirmMcpActionIntent"));
  assert.ok(execute.indexOf("assessIntelligenceAction")<execute.indexOf("resolveCommasTestDeliveryConfirmation"));
});

test("M4 direct and shared Commas mutation routes reject before target/provider work",()=>{
  const direct=source("app/api/actions/commas/webhook-test-delivery/route.ts"),prepare=source("app/api/actions/provider-prepare/route.ts"),confirm=source("app/api/actions/provider-confirm/route.ts");
  assert.ok(direct.indexOf("assessIntelligenceAction")<direct.indexOf("request.json"));
  assert.ok(direct.indexOf("action_not_available")<direct.lastIndexOf("listCommasWebhookSubscriptions"));
  assert.doesNotMatch(prepare,/commas\.webhook_test_delivery|prepareApprovedCommasTestDelivery/);
  assert.doesNotMatch(confirm,/commas\.webhook_test_delivery|confirmCommasTestDelivery/);
});

test("M4 suppresses the legacy direct Shopify bypass while retaining governed exposure",()=>{
  const direct=source("app/api/actions/shopify/controlled-webhook-proof/route.ts");
  assert.match(direct,/governed_action_required/);
  assert.doesNotMatch(direct,/createTraceKitShopifyWebhookSubscription|deleteTraceKitShopifyWebhookSubscription|resolveCredentialForExecution/);
  assert.match(source("app/api/actions/provider-prepare/route.ts"),/prepareApprovedShopifyControlledProof/);
});

test("M4 evaluation disable preserves the finding but prevents actionable remediation",async()=>{
  const{shopifyRemediationSignal}=await import("../lib/mcp/m17-provider-remediation-signals");
  const signal=shopifyRemediationSignal({connectionId:"connection-1",state:"remediation_available",reason:"repair available",observedAt:"2026-10-04T00:00:00Z",evidence:{findingId:"finding-1"}},{TRACEKIT_INTELLIGENCE_EVALUATION:"disabled"});
  assert.equal(signal.state,"blocked");assert.equal(signal.actionRequired,false);assert.equal(signal.evidence.findingId,"finding-1");
});

test("M4 policy gates do not gate historical lifecycle repositories",()=>{
  for(const file of["lib/mcp/action-intent-repository.ts","lib/mcp/action-execution-result-repository.ts","lib/mcp/m15-shopify-recovery-repository.ts"])assert.doesNotMatch(source(file),/assessIntelligenceAction|TRACEKIT_INTELLIGENCE_/);
});

test("M4 evaluator certifies M3's bounded proof without declaring Production V1 ready",()=>{
  const manifest=JSON.parse(source("../docs/workstreams/evidence/WS-019_M3_SHOPIFY_PRODUCTION_ACCEPTANCE.json"));
  const result=evaluateProductionV1Acceptance(manifest);
  assert.equal(result.controlledAction.certifiable,true);
  assert.equal(result.productionV1Ready,false);
  assert.deepEqual(result.missingReleaseRequirements,[...PRODUCTION_V1_RELEASE_REQUIREMENTS]);
});

test("M4 evaluator requires every controlled-action and cross-cutting release gate",()=>{
  const stages=Object.fromEntries(PRODUCTION_V1_EVIDENCE_STAGES.map(stage=>[stage,[`evidence:${stage}`]]));
  const scenarios=PRODUCTION_V1_SCENARIOS.map(scenario=>({scenario,passed:true,evidenceRefs:[`evidence:${scenario}`],observedAt:"2026-10-04T00:00:00Z"}));
  const releaseRequirements=Object.fromEntries(PRODUCTION_V1_RELEASE_REQUIREMENTS.map(requirement=>[requirement,{status:"pass",evidenceRefs:[`evidence:${requirement}`]}]));
  const result=evaluateProductionV1Acceptance({organizationId:"org-1",actionOperation:"shopify.controlled_webhook_create_delete_proof",stages,scenarios,releaseRequirements}as any);
  assert.equal(result.controlledAction.certifiable,true);assert.equal(result.productionV1Ready,true);assert.deepEqual(result.missingReleaseRequirements,[]);
  assert.equal(M12_ACTION_CAPABILITIES.filter(item=>item.mutationClass!=="none"&&item.executionAvailable).map(item=>item.operation).join(","),"shopify.controlled_webhook_create_delete_proof");
});
