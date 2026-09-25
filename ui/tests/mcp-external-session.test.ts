import assert from "node:assert/strict";
import test from "node:test";
import { resolveMcpExternalSession } from "../lib/mcp/external-session";
import type { IdentityTenancyRepository } from "../lib/identity/persistent-repository";

function repository(overrides:Partial<IdentityTenancyRepository>={}):IdentityTenancyRepository {
 const membership:any={id:"mem",userId:"usr",accountId:"acct",organizationId:"org",role:"organization-admin",status:"active"};
 return {
  userByWorkOSId:async()=>({id:"usr",workosUserId:"w-user",primaryEmail:"u@example.test",displayName:"User",avatarUrl:null,status:"active"}),
  organizationByWorkOSId:async()=>({id:"org",owningAccountId:"acct",agencyId:null,workosOrganizationId:"w-org",name:"Org",status:"active"}),
  synchronizeUser:async()=>{throw new Error("not used");}, membershipsForUser:async()=>[membership], isEmptyInstallation:async()=>false,
  bootstrapFirstAdmin:async()=>{throw new Error("not used");}, accountById:async()=>({id:"acct",accountType:"client",name:"Account",status:"active"}),
  agencyByAccountId:async()=>null, organizationsForMembership:async()=>[{id:"org",owningAccountId:"acct",agencyId:null,workosOrganizationId:"w-org",name:"Org",status:"active"}],
  permissionOverrides:async()=>[],businessContexts:async()=>[],recordAuditEvent:async()=>{},
  ...overrides,
 } as IdentityTenancyRepository;
}
test("external MCP identity resolves only exact WorkOS user and organization membership",async()=>{
 const session=await resolveMcpExternalSession({workosUserId:"w-user",workosOrganizationId:"w-org"},repository());
 assert.equal(session?.user.id,"usr"); assert.equal(session?.activeOrganization?.id,"org"); assert.equal(session?.membership.id,"mem");
});
test("external MCP identity fails closed for unknown user or organization",async()=>{
 assert.equal(await resolveMcpExternalSession({workosUserId:"missing",workosOrganizationId:"w-org"},repository({userByWorkOSId:async()=>null})),null);
 assert.equal(await resolveMcpExternalSession({workosUserId:"w-user",workosOrganizationId:"missing"},repository({organizationByWorkOSId:async()=>null})),null);
});
test("external MCP identity fails closed when token organization is not the user's active membership",async()=>{
 const repo=repository({membershipsForUser:async()=>[{id:"other",userId:"usr",accountId:"acct",organizationId:"other-org",role:"organization-admin",status:"active"}]});
 assert.equal(await resolveMcpExternalSession({workosUserId:"w-user",workosOrganizationId:"w-org"},repo),null);
});

test("external MCP identity without org claim resolves exactly one active organization membership",async()=>{
 const session=await resolveMcpExternalSession({workosUserId:"w-user",workosOrganizationId:null},repository());
 assert.equal(session?.activeOrganization?.id,"org");
});
test("external MCP identity without org claim fails closed when organization membership is ambiguous",async()=>{
 const repo=repository({
  membershipsForUser:async()=>[
   {id:"m1",userId:"usr",accountId:"acct",organizationId:"org",role:"organization-admin",status:"active"},
   {id:"m2",userId:"usr",accountId:"acct",organizationId:"org-2",role:"organization-admin",status:"active"},
  ],
 });
 assert.equal(await resolveMcpExternalSession({workosUserId:"w-user",workosOrganizationId:null},repo),null);
});

test("external MCP session authorizes persistent contexts absent from mock metadata",async()=>{
 const persistent={id:"persistent-context",organizationId:"org",name:"Persistent Context",mark:"PC"};
 const session=await resolveMcpExternalSession({workosUserId:"w-user",workosOrganizationId:"w-org"},repository({businessContexts:async(membershipId,organizationId)=>{
  assert.equal(membershipId,"mem"); assert.equal(organizationId,"org"); return [persistent];
 }}));
 assert.deepEqual(session?.accessibleBusinessContexts,[persistent]);
 assert.equal(session?.activeBusinessContextId,"persistent-context");
});

test("external MCP session uses mock context data only as display decoration",async()=>{
 const session=await resolveMcpExternalSession({workosUserId:"w-user",workosOrganizationId:"w-org"},repository({
  businessContexts:async()=>[{id:"offer-bullseye",organizationId:"org",name:"Persistent Name",mark:"PN"}],
 }));
 assert.deepEqual(session?.accessibleBusinessContexts,[{id:"offer-bullseye",organizationId:"org",name:"Bullseye",mark:"B"}]);
 assert.equal(session?.activeBusinessContextId,"offer-bullseye");
});

test("external MCP session cannot activate a mock-only or missing persistent context",async()=>{
 const session=await resolveMcpExternalSession({workosUserId:"w-user",workosOrganizationId:"w-org"},repository({businessContexts:async()=>[]}));
 assert.deepEqual(session?.accessibleBusinessContexts,[]);
 assert.equal(session?.activeBusinessContextId,null);
});

test("external MCP session excludes contexts outside the selected organization",async()=>{
 const session=await resolveMcpExternalSession({workosUserId:"w-user",workosOrganizationId:"w-org"},repository({
  businessContexts:async()=>[{id:"offer-bullseye",organizationId:"other-org",name:"Other",mark:"O"}],
 }));
 assert.deepEqual(session?.accessibleBusinessContexts,[]);
 assert.equal(session?.activeBusinessContextId,null);
});

test("external MCP permission overrides retain deny precedence independently of context resolution",async()=>{
 const overrides:any[]=[
  {id:"allow",membershipId:"mem",capability:"admin.manage_feature_access",effect:"allow",organizationId:"org",resourceType:"tkid_origin_registry",resourceId:null},
  {id:"deny",membershipId:"mem",capability:"admin.manage_feature_access",effect:"deny",organizationId:"org",resourceType:"tkid_origin_registry",resourceId:null},
 ];
 const session=await resolveMcpExternalSession({workosUserId:"w-user",workosOrganizationId:"w-org"},repository({permissionOverrides:async()=>overrides}));
 assert.deepEqual(session?.permissionOverrides,overrides);
 assert.equal(session?.effectivePermissions.includes("admin.manage_feature_access"),false);
});
