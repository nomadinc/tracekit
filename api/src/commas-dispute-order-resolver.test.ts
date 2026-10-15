import test from "node:test";
import assert from "node:assert/strict";
import {resolveCommasDisputeOrder as resolve,planCommasDisputeOrderLink as plan,type DisputeOrderInput,type DisputeOrderMapping} from "./commas-dispute-order-resolver.ts";
const scope={organizationId:"org",connectionId:"connection",providerAccountId:"account"};
const input:DisputeOrderInput={...scope,providerDisputeId:"dispute",numericTransactionId:"42",publicOrderId:"ORD-ABC",evidenceVerified:true,lookupComplete:true};
const numeric:DisputeOrderMapping={...scope,kind:"numeric_transaction",sourceId:"42",canonicalOrderId:"order",active:true,authoritative:true};
const ord:DisputeOrderMapping={...numeric,kind:"public_order",sourceId:"ORD-ABC"};
const current={...scope,providerDisputeId:"dispute",canonicalOrderId:null,reconciliationState:"unmatched"};
test("two explicit identifiers must independently resolve to the same order",()=>{
 assert.equal(resolve(input,[numeric,ord]).state,"exact");
 assert.equal(resolve(input,[numeric,{...ord,canonicalOrderId:"other"}]).state,"conflict");
 assert.equal(resolve(input,[numeric]).state,"unresolved");
});
test("either identifier can qualify independently when the other is absent",()=>{
 assert.equal(resolve({...input,publicOrderId:null},[numeric]).canonicalOrderId,"order");
 assert.equal(resolve({...input,numericTransactionId:null},[ord]).canonicalOrderId,"order");
});
test("payment intent is not an accepted transaction identifier",()=>{
 assert.equal(resolve({...input,numericTransactionId:"pi_42",publicOrderId:null},[numeric]).state,"unresolved");
 assert.equal(resolve({...input,numericTransactionId:null,publicOrderId:null},[]).reason,"provider_order_identity_missing");
});
test("organization connection and provider account isolation all fail closed",()=>{
 for(const key of ["organizationId","connectionId","providerAccountId"] as const)
  assert.equal(resolve(input,[{...numeric,[key]:"other"},ord]).reason,"lookup_scope_conflict");
});
test("ambiguous mappings cannot create an exact relationship",()=>{
 assert.equal(resolve(input,[numeric,{...numeric,canonicalOrderId:"other"},ord]).state,"conflict");
 assert.equal(resolve(input,[numeric,numeric,ord]).state,"exact");
});
test("unverified evidence incomplete lookups and heuristic mappings do not qualify",()=>{
 assert.equal(resolve({...input,evidenceVerified:false},[numeric,ord]).state,"unresolved");
 assert.equal(resolve({...input,lookupComplete:false},[numeric,ord]).state,"unresolved");
 assert.equal(resolve(input,[{...numeric,authoritative:false},ord]).state,"unresolved");
 assert.equal(resolve(input,[{...numeric,active:false},ord]).state,"unresolved");
});
test("malformed and unsafe numeric identifiers are not rounded or guessed",()=>{
 for(const id of [Number.MAX_SAFE_INTEGER+1,42.5,0,"042","42x",{},true])
  assert.equal(resolve({...input,numericTransactionId:id},[numeric,ord]).state,"unresolved");
 assert.equal(resolve({...input,numericTransactionId:42},[numeric,ord]).state,"exact");
 assert.equal(resolve({...input,publicOrderId:"abc"},[numeric,ord]).state,"unresolved");
});
test("identity-only enrichment does not emit status amounts currency or wallet changes",()=>{
 const before={...current,status:"won",amount:49,fee:15,currency:null};
 const copy=JSON.stringify(before);const p=plan(input,before,[numeric,ord]);
 assert.equal(p.state,"link");
 assert.deepEqual(p.patch,{matched_canonical_order_id:"order",reconciliation_state:"matched"});
 assert.equal(JSON.stringify(before),copy);
});
test("repeated and duplicate delivery produces a noop once linked",()=>{
 const linked={...current,canonicalOrderId:"order",reconciliationState:"matched"};
 assert.equal(plan(input,linked,[numeric,ord]).state,"noop");
 assert.equal(plan(input,linked,[numeric,numeric,ord]).state,"noop");
});
test("existing exact or suggested relationships cannot silently move to another order",()=>{
 assert.equal(plan(input,{...current,canonicalOrderId:"other"},[numeric,ord]).reason,"existing_order_link_conflict");
});
test("dispute identity and current projection tenancy must agree",()=>{
 assert.equal(plan(input,{...current,providerDisputeId:"other"},[numeric,ord]).state,"hold");
 assert.equal(plan(input,{...current,organizationId:"other"},[numeric,ord]).state,"hold");
 assert.equal(plan({...input,lookupComplete:false},current,[]).state,"hold");
});

test("planner resolves current evidence rather than reusing a prior exact decision",()=>{
 assert.equal(resolve(input,[numeric,ord]).state,"exact");
 for(const changed of [
  {...input,evidenceVerified:false},
  {...input,lookupComplete:false},
  {...input,numericTransactionId:"43"},
  {...input,publicOrderId:"ORD-OTHER"},
 ]) assert.equal(plan(changed,current,[numeric,ord]).state,"hold");
});
test("planner rejects every current projection scope mismatch",()=>{
 for(const key of ["organizationId","connectionId","providerAccountId"] as const)
  assert.equal(plan(input,{...current,[key]:"other"},[numeric,ord]).reason,"current_projection_identity_conflict");
});
test("older and equal identity evidence cannot modify terminal lifecycle or financial state",()=>{
 for(const status of ["won","lost"]) for(const evidenceAt of [10,20]){
  const before={...current,status,updatedAt:20,principal:49,fee:15,currency:null,feeCurrency:"EUR",walletLoss:null,refundIds:["refund"]};
  const event={...input,evidenceAt};
  const copy=JSON.stringify(before);
  assert.deepEqual(plan(event,before,[numeric,ord]).patch,{matched_canonical_order_id:"order",reconciliation_state:"matched"});
  assert.equal(JSON.stringify(before),copy);
 }
});
