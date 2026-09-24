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
  permissionOverrides:async()=>[],businessContextIds:async()=>[],recordAuditEvent:async()=>{},
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
