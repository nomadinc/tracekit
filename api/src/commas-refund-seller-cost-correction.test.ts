import test from "node:test";
import assert from "node:assert/strict";
import { COMMAS_REFUND_CORRECTION_LEDGER_TYPE, COMMAS_REFUND_CORRECTION_POLICY, isCommasRefundSellerCostCorrection, planCommasRefundSellerCostCorrection } from "./commas-refund-seller-cost-correction.ts";

test("plans positive append-only reversal for legacy seller-cost overstatement", () => {
  const plan = planCommasRefundSellerCostCorrection({ providerRefundId:"125133",buyerAmount:67,creatorAmount:60,processorFee:2,providerRefundCost:62,legacyRefundAmount:-67,legacyRefundFeeAmount:-2 });
  assert.equal(plan.legacySellerLoss,69); assert.equal(plan.providerSellerLoss,62); assert.equal(plan.correctionAmount,7);
  assert.equal(plan.requiresCorrection,true); assert.equal(plan.currency,"USD"); assert.equal(plan.policyVersion,COMMAS_REFUND_CORRECTION_POLICY);
  assert.equal(plan.ledgerType,COMMAS_REFUND_CORRECTION_LEDGER_TYPE);
  assert.match(plan.idempotencyKey,/^reversal:commas-refund-seller-cost-correction-v1:/);
});

test("equivalent legacy economics require no correction",()=>{
 const plan=planCommasRefundSellerCostCorrection({providerRefundId:"same",buyerAmount:60,creatorAmount:60,processorFee:2,providerRefundCost:62,legacyRefundAmount:-60,legacyRefundFeeAmount:-2});
 assert.equal(plan.correctionAmount,0); assert.equal(plan.requiresCorrection,false);
});

test("fails closed on provider component non-conservation or legacy understatement",()=>{
 assert.throws(()=>planCommasRefundSellerCostCorrection({providerRefundId:"bad",buyerAmount:60,creatorAmount:50,processorFee:2,providerRefundCost:60,legacyRefundAmount:-60,legacyRefundFeeAmount:-2}),/components_do_not_conserve/);
 assert.throws(()=>planCommasRefundSellerCostCorrection({providerRefundId:"under",buyerAmount:40,creatorAmount:50,processorFee:2,providerRefundCost:52,legacyRefundAmount:-40,legacyRefundFeeAmount:-2}),/understated/);
});

test("recognizes only scoped Commas correction reversals",()=>{
 assert.equal(isCommasRefundSellerCostCorrection({ledger_type:"reversal",platform:"commas",meta:{policy_version:COMMAS_REFUND_CORRECTION_POLICY}}),true);
 assert.equal(isCommasRefundSellerCostCorrection({ledger_type:"refund",platform:"commas",meta:{policy_version:COMMAS_REFUND_CORRECTION_POLICY}}),false);
 assert.equal(isCommasRefundSellerCostCorrection({ledger_type:"reversal",platform:"shopify",meta:{policy_version:COMMAS_REFUND_CORRECTION_POLICY}}),false);
});
