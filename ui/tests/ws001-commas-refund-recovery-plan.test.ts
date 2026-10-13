import test from "node:test";
import assert from "node:assert/strict";
import { planCommasRefundRecovery, type RefundRecoveryCandidate } from "../lib/commerce/commas-refund-recovery-plan.ts";
const scope={organizationId:"org",connectionId:"connection",providerAccountId:"account"};
const valid:RefundRecoveryCandidate={...scope,observationId:"observation",refundIdentity:"hashid",canonicalOrderId:"order",status:"success",orderMatchState:"exact_ord",evidenceVerified:true,sellerCost:"12.30",creatorAmount:"12.00",processorFee:"0.30",currencyContractVerified:true,financialDisposition:"not_excluded",numericRefundIdentity:"42",identityBridgeVerified:true,existingWebhookLedgerRows:0,existingEmbeddedLedgerRows:0};
test("absent authoritative identity bridge blocks even with matching order and amounts",()=>{
 const p=planCommasRefundRecovery(scope,[{...valid,numericRefundIdentity:null,identityBridgeVerified:false}]);
 assert.equal(p.ready,0);assert.equal(p.writes,0);assert.equal(p.ownershipEpochChanged,false);
 assert.deepEqual(p.rows[0].blockers,["provider_refund_identity_bridge_required"]);
});
test("scope leakage and ambiguous identity bridges reject the entire plan",()=>{
 assert.throws(()=>planCommasRefundRecovery(scope,[{...valid,providerAccountId:"other"}]),/scope/);
 assert.throws(()=>planCommasRefundRecovery(scope,[valid,{...valid,observationId:"second",refundIdentity:"second"}]),/Ambiguous/);
});
test("pending refunds, invalid evidence and existing effects cannot qualify",()=>{
 for(const patch of [{status:"pending"},{evidenceVerified:false},{existingEmbeddedLedgerRows:1},{existingWebhookLedgerRows:1},{currencyContractVerified:false}])
  assert.equal(planCommasRefundRecovery(scope,[{...valid,...patch}]).ready,0);
});
test("money arithmetic is exact and component double counting is rejected",()=>{
 assert.equal(planCommasRefundRecovery(scope,[valid]).ready,1);
 assert.equal(planCommasRefundRecovery(scope,[{...valid,sellerCost:"12.60"}]).ready,0);
 assert.equal(planCommasRefundRecovery(scope,[{...valid,processorFee:""}]).ready,0);
});
test("duplicate observations and oversized unbounded requests reject",()=>{
 assert.throws(()=>planCommasRefundRecovery(scope,[valid,valid]),/Duplicate/);
 assert.throws(()=>planCommasRefundRecovery(scope,[]),/1–100/);
 assert.throws(()=>planCommasRefundRecovery(scope,Array(101).fill(valid)),/1–100/);
});

test("test-data exclusions and missing exclusion checks block even with authoritative identity proof",()=>{
 for(const financialDisposition of ["excluded_test_data","unchecked",undefined] as const){
  const p=planCommasRefundRecovery(scope,[{...valid,financialDisposition} as RefundRecoveryCandidate]);
  assert.equal(p.ready,0);assert.equal(p.writes,0);
  assert.deepEqual(p.rows[0].blockers,[financialDisposition==="excluded_test_data"?"test_data_excluded":"financial_exclusion_check_required"]);
 }
});
