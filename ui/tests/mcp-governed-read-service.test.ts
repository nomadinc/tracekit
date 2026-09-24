import assert from "node:assert/strict";
import test from "node:test";
import { authorizeMcpRead, projectCustomerSummary, projectOrderSummary } from "../lib/mcp/governed-read-service";
import { resolveEffectivePermissions } from "../lib/identity/persistent-authorization";
import type { PersistentMembership, TraceKitSessionContext } from "../lib/identity/persistent-types";

const membership: PersistentMembership = { id:"mem",userId:"usr",accountId:"acct",organizationId:"org-a",role:"organization-admin",status:"active" };
function session(role=membership.role): TraceKitSessionContext {
 const m={...membership,role};
 return {user:{id:"usr",workosUserId:"w",primaryEmail:"owner@example.test",displayName:"Owner",avatarUrl:null,status:"active"},externalWorkosUserId:"w",activeAccount:{id:"acct",accountType:"client",name:"A",status:"active"},activeAgency:null,activeOrganization:{id:"org-a",name:"A",mark:"A",accountId:"acct"},availableOrganizations:[{id:"org-a",name:"A",mark:"A",accountId:"acct"}],membership:m,role,effectivePermissions:Array.from(resolveEffectivePermissions(m,[])),permissionOverrides:[],accessibleBusinessContexts:[],activeBusinessContextId:null,assurance:{authenticationMethod:"password",impersonated:false},correlationId:"corr"};
}
test("MCP scope is derived from authorized session and rejects cross-tenant scope",()=>{
 const s=session();
 assert.equal(authorizeMcpRead(s,"customers.view").organizationId,"org-a");
 assert.throws(()=>authorizeMcpRead(s,"customers.view","org-b"),/unavailable/);
});
test("MCP scope rejects missing capability",()=>{
 assert.throws(()=>authorizeMcpRead(session("read-only-operations"),"customers.view"),/unavailable/);
});
test("customer projection masks sensitive data without sensitive permission",()=>{
 const s=session("client-read-only");
 const out=projectCustomerSummary(s,{id:"c",organizationId:"org-a",offerIds:[],name:"Person",email:"person@example.test",phone:"555",sensitiveMasked:false,profit:0,profitStatus:"Estimated",lastActivity:"now",status:"Known",trackingHealth:"Unknown",repeat:false,refunded:false,interferenceLikely:false,journeyPreview:""});
 assert.equal(out.email,"••••"); assert.equal(out.phone,"••••"); assert.equal(out.sensitiveMasked,true);
});
test("order projection removes financial and sensitive fields without capabilities",()=>{
 const s=session("customer-support");
 const out=projectOrderSummary(s,{id:"o",organizationId:"org-a",offerId:"",customerId:"c",number:"1",customerName:"Person",customerEmail:"person@example.test",customerPhone:"555",sensitiveMasked:false,scenario:"",date:"",status:"Paid",profitStatus:"Estimated",profit:10,revenue:100,trackingHealth:"Unknown",shippingLoss:false,highFee:false,highAffiliate:false});
 assert.equal(out.customerEmail,"••••"); assert.equal(out.revenue,0); assert.equal(out.profit,null);
});
