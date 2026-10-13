import assert from"node:assert/strict";import test from"node:test";import{M12_ACTION_CAPABILITIES,resolveM12ActionCapability,assessM12ActionBinding,resolveM12PlanCapability}from"../lib/mcp/action-capability-registry";
test("M13 proven inspect_evidence exposure remains enabled after exact replay acceptance",()=>{const c=resolveM12ActionCapability("inspect_evidence");assert.equal(c?.provider,"tracekit");assert.equal(c?.mutationClass,"none");assert.equal(c?.targetKind,"journey_evidence");assert.equal(c?.exposure,"plan_only");assert.equal(c?.executionAvailable,true);assert.ok(c?.evidence.some(x=>x.includes("replay_same_result")));});
test("M13 restore preserves provider controlled proof boundaries",()=>{assertProviderBoundaries();});

function assertProviderBoundaries(){
 const commas=resolveM12ActionCapability("commas.webhook_test_delivery"),shopify=resolveM12ActionCapability("shopify.controlled_webhook_create_delete_proof");
 assert.equal(commas?.executionAvailable,false);assert.equal(shopify?.executionAvailable,true);assert.equal(shopify?.exposure,"controlled_proof_only");assert.equal(shopify?.recovery,"reversible");
 for(const c of [commas!,shopify!]){assert.equal(assessM12ActionBinding(c.operation).executionAvailable,false);const plan=resolveM12PlanCapability({proposedOperation:{type:c.operation},requiredPermission:c.requiredPermission,confirmation:{required:true}});assert.equal(plan.bound,false);assert.equal(plan.executionAvailable,false);}
}
