import assert from"node:assert/strict";import test from"node:test";import{assessInspectEvidenceEnablementReadiness}from"../lib/mcp/action-enablement-readiness";import{M12_ACTION_CAPABILITIES,resolveM12ActionCapability,assessM12ActionBinding,resolveM12PlanCapability}from"../lib/mcp/action-capability-registry";
test("M13 Production canary completion is reflected in registry-backed readiness",()=>{const r=assessInspectEvidenceEnablementReadiness(),c=resolveM12ActionCapability("inspect_evidence");assert.equal(r.ready,true);assert.deepEqual(r.blockers,[]);assert.equal(r.executionAvailable,true);assert.equal(c?.executionAvailable,true);assert.equal(c?.mutationClass,"none");});
test("M13 completion preserves provider controlled proof boundaries",()=>{assertProviderBoundaries();});

function assertProviderBoundaries(){
 const commas=resolveM12ActionCapability("commas.webhook_test_delivery"),shopify=resolveM12ActionCapability("shopify.controlled_webhook_create_delete_proof");
 assert.equal(commas?.executionAvailable,false);assert.equal(shopify?.executionAvailable,true);assert.equal(shopify?.exposure,"controlled_proof_only");assert.equal(shopify?.recovery,"reversible");
 for(const c of [commas!,shopify!]){assert.equal(assessM12ActionBinding(c.operation).executionAvailable,false);const plan=resolveM12PlanCapability({proposedOperation:{type:c.operation},requiredPermission:c.requiredPermission,confirmation:{required:true}});assert.equal(plan.bound,false);assert.equal(plan.executionAvailable,false);}
}
