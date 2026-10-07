import assert from "node:assert/strict";
import test from "node:test";
import { resolveInvitationTargetAccess } from "../lib/identity/invitation-target-access";
import { authorizeCustomerInvitation } from "../lib/identity/customer-invitation-policy";
import { ROLE_PERMISSIONS } from "../lib/identity/permissions";
import type { TraceKitSessionContext } from "../lib/identity/persistent-types";
const membership = {id:"member",userId:"operator",accountId:"platform",organizationId:null,role:"platform-owner",status:"active"};
const session = {user:{id:"operator",status:"active"},membership,role:"platform-owner",effectivePermissions:[...ROLE_PERMISSIONS["platform-owner"]],availableOrganizations:[],accessibleBusinessContexts:[],activeOrganization:null,activeBusinessContextId:null,assurance:{impersonated:false}} as unknown as TraceKitSessionContext;
const organization = {id:"stem",name:"Stem Labs",owningAccountId:"client",status:"active"};
function repo(overrides: Record<string,unknown> = {}) {
 let reads=0;
 return {reads:()=>reads,value:{membershipsForUser:async()=>[membership],permissionOverrides:async()=>[],accountById:async(id:string)=>({id,accountType:id==="platform"?"platform":"client",status:"active"}),allActiveOrganizations:async()=>{reads++;return [organization]},activeBusinessContextsForOrganization:async()=>[{id:"stem-context",name:"Stem Labs",organizationId:"stem"},{id:"foreign-context",name:"Foreign",organizationId:"foreign"}],...overrides} as any};
}
test("platform invitation scope is persisted and request-only",async()=>{
 const target=await resolveInvitationTargetAccess(session,repo().value,"stem");
 assert.deepEqual(target.accessibleBusinessContexts.map(c=>c.id),["stem-context"]);
 assert.equal(target.activeOrganization,null);assert.equal(target.activeBusinessContextId,null);assert.equal(target.assurance,session.assurance);
 assert.deepEqual(session.availableOrganizations,[]);assert.deepEqual(session.accessibleBusinessContexts,[]);
 const input={organizationId:"stem",role:"client-read-only",intendedEmail:"customer@example.test",businessContextIds:["stem-context"]};
 assert.equal(authorizeCustomerInvitation(target,input).role,"client-read-only");
 assert.throws(()=>authorizeCustomerInvitation(target,{...input,businessContextIds:["foreign-context"]}));
 assert.throws(()=>authorizeCustomerInvitation(target,{...input,role:"organization-owner"}));
});
test("persisted denial and ineffective memberships prevent catalog reads",async()=>{
 for(const overrides of [{permissionOverrides:async()=>[{capability:"users.invite",effect:"deny"}]},{permissionOverrides:async()=>[{capability:"admin.manage_tenants",effect:"deny"}]},...[{status:"removed"},{effectiveUntil:"2000-01-01"},{effectiveFrom:"2999-01-01"},{effectiveUntil:"invalid"}].map(change=>({membershipsForUser:async()=>[{...membership,...change}]}))]){
  const repository=repo(overrides);await assert.rejects(resolveInvitationTargetAccess(session,repository.value,"stem"));assert.equal(repository.reads(),0);
 }
});
test("unknown and inactive target organizations or accounts fail closed",async()=>{
 await assert.rejects(resolveInvitationTargetAccess(session,repo().value,"foreign"));
 await assert.rejects(resolveInvitationTargetAccess(session,repo({allActiveOrganizations:async()=>[{...organization,status:"suspended"}]}).value,"stem"));
 for(const change of [{status:"suspended"},{accountType:"agency"}]) await assert.rejects(resolveInvitationTargetAccess(session,repo({accountById:async(id:string)=>id==="platform"?{id,accountType:"platform",status:"active"}:{id,accountType:"client",status:"active",...change}}).value,"stem"));
});
test("customer scopes never expand or query platform catalog",async()=>{
 const customer={...session,membership:{...session.membership,role:"organization-owner",organizationId:"stem"},effectivePermissions:["users.invite"],availableOrganizations:[{id:"stem"}],accessibleBusinessContexts:[{id:"stem-context",organizationId:"stem"}]} as TraceKitSessionContext;
 const repository=repo();assert.equal(await resolveInvitationTargetAccess(customer,repository.value,"stem"),customer);
 await assert.rejects(resolveInvitationTargetAccess(customer,repository.value,"foreign"));assert.equal(repository.reads(),0);
 await assert.rejects(resolveInvitationTargetAccess({...customer,effectivePermissions:[...ROLE_PERMISSIONS["client-read-only"]]},repository.value,"stem"));
});
