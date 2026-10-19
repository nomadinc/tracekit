import assert from "node:assert/strict";
import test from "node:test";
import { hasExactOrderIdentity, type OrderIdentityScope } from "./production-repository.ts";
const scope: OrderIdentityScope = { organizationId:"stem", workspaceId:"stem", provider:"next29", connectionId:"conn1", providerAccountId:"account1" };
const order = { ...scope, canonicalOrderId:"canonical-12", providerOrderId:"12" };
const evidence = { organization_id:"stem", workspace_id:"stem", source_platform:"next29", connection_id:"conn1", provider_account_id:"account1", provider_order_id:"12" };
test("exact provider ID with complete scope matches",()=>assert.equal(hasExactOrderIdentity(evidence,order,scope),true));
test("order 12 never matches 3129",()=>assert.equal(hasExactOrderIdentity({...evidence,provider_order_id:"3129"},order,scope),false));
test("foreign organization with matching ID denied",()=>assert.equal(hasExactOrderIdentity({...evidence,organization_id:"foreign"},order,scope),false));
test("foreign workspace with matching ID denied",()=>assert.equal(hasExactOrderIdentity({...evidence,workspace_id:"foreign"},order,scope),false));
test("identical ID different provider denied",()=>assert.equal(hasExactOrderIdentity({...evidence,source_platform:"shopify"},order,scope),false));
test("identical ID different connection denied",()=>assert.equal(hasExactOrderIdentity({...evidence,connection_id:"conn2"},order,scope),false));
test("identical ID different provider account denied",()=>assert.equal(hasExactOrderIdentity({...evidence,provider_account_id:"account2"},order,scope),false));
test("canonical/provider namespace collision denied",()=>assert.equal(hasExactOrderIdentity({...evidence,provider_order_id:null,canonical_order_id:"12"},order,scope),false));
test("display order number is not authoritative",()=>assert.equal(hasExactOrderIdentity({...evidence,provider_order_id:null,order_id:"12",platform_order_id:"12"},order,scope),false));
test("missing tenant and provider evidence fails closed",()=>{
 for(const key of ["organization_id","workspace_id","source_platform","connection_id","provider_account_id"]){
  assert.equal(hasExactOrderIdentity({...evidence,[key]:undefined},order,scope),false);
 }
 assert.equal(hasExactOrderIdentity(evidence,order,{...scope,connectionId:""}),false);
});
test("canonical evidence matches only canonical namespace",()=>assert.equal(hasExactOrderIdentity({...evidence,provider_order_id:null,canonical_order_id:"canonical-12"},order,scope),true));
test("untrusted metadata and labels cannot establish identity",()=>assert.equal(hasExactOrderIdentity({...evidence,provider_order_id:null,technical:{order_id:"12"},title:"Order 12"},order,scope),false));

test("contradictory provider ID rejects matching canonical ID",()=>assert.equal(hasExactOrderIdentity({...evidence,canonical_order_id:"canonical-12",provider_order_id:"foreign"},order,scope),false));
test("contradictory canonical ID rejects matching provider ID",()=>assert.equal(hasExactOrderIdentity({...evidence,canonical_order_id:"foreign"},order,scope),false));
test("legitimate provider-only match remains valid",()=>assert.equal(hasExactOrderIdentity(evidence,order,scope),true));
test("legitimate canonical-only match remains valid",()=>assert.equal(hasExactOrderIdentity({...evidence,provider_order_id:null,canonical_order_id:"canonical-12"},order,scope),true));
