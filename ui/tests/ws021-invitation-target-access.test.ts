import assert from "node:assert/strict";
import test from "node:test";
import { resolveInvitationTargetAccess, resolveAgencyInvitationTargetAccess } from "../lib/identity/invitation-target-access";
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

test("agency invitation targets require active assigned clients, explicit workspace grants and invitation authority",async()=>{
 const previous=process.env.TRACEKIT_TENANT_INVITATIONS_ENABLED;
 process.env.TRACEKIT_TENANT_INVITATIONS_ENABLED="true";
 try {
  const agencySession={...session,role:"agency-admin",membership:{...membership,accountId:"agency-account",role:"agency-admin"},effectivePermissions:["users.invite"],permissionOverrides:[]} as unknown as TraceKitSessionContext;
  const repository={...repo().value,accountById:async(id:string)=>({id,accountType:id==="agency-account"?"agency":"client",status:"active"}),agencyByAccountId:async()=>({id:"agency",accountId:"agency-account",status:"active"}),organizationsForMembership:async()=>[organization],businessContexts:async()=>[{id:"allowed",name:"Allowed",organizationId:"stem"},{id:"foreign",name:"Foreign",organizationId:"foreign"}]};
  assert.deepEqual((await resolveAgencyInvitationTargetAccess(agencySession,repository,"agency-account")).map(c=>c.id),["allowed"]);
  await assert.rejects(resolveAgencyInvitationTargetAccess(agencySession,repository,"other-agency"));
  await assert.rejects(resolveAgencyInvitationTargetAccess({...agencySession,role:"agency-read-only"},repository,"agency-account"));
  await assert.rejects(resolveAgencyInvitationTargetAccess({...agencySession,effectivePermissions:[]},repository,"agency-account"));
  await assert.rejects(resolveAgencyInvitationTargetAccess(agencySession,{...repository,agencyByAccountId:async()=>({status:"suspended"})},"agency-account"));
  assert.equal((await resolveAgencyInvitationTargetAccess(agencySession,{...repository,organizationsForMembership:async()=>[]},"agency-account")).length,0);
  assert.equal((await resolveAgencyInvitationTargetAccess(agencySession,{...repository,accountById:async(id:string)=>({id,accountType:id==="agency-account"?"agency":"client",status:id==="client"?"suspended":"active"})},"agency-account")).length,0);
  process.env.TRACEKIT_TENANT_INVITATIONS_ENABLED="false";
  await assert.rejects(resolveAgencyInvitationTargetAccess(agencySession,repository,"agency-account"));
 } finally { if(previous===undefined) delete process.env.TRACEKIT_TENANT_INVITATIONS_ENABLED; else process.env.TRACEKIT_TENANT_INVITATIONS_ENABLED=previous; }
});
