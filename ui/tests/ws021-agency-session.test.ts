import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
const nativeRequire = createRequire(import.meta.url);

test("persisted agency session uses assigned clients, agency account and agency role", async () => {
  let requested: string | null = null;
  let agencyActive = true;
  let requestedAccount: string | null = null;
  let mixed = false;
  let clientActive = true;
  const lookups: string[] = [];
  class Repository {
    async synchronizeUser() { return { id: "user", primaryEmail: "agency@example.test", displayName: "Agency member", status: "active" }; }
    async membershipsForUser() { return [...(mixed ? [{ id: "direct", userId: "user", accountId: null, organizationId: "direct-org", role: "client-read-only", status: "active" }] : []), { id: "member", userId: "user", accountId: "agency-account", organizationId: null, role: "agency-read-only", status: "active" }]; }
    async accountById(id: string) { assert.ok(["agency-account", "client-account"].includes(id)); return {id, accountType:id === "agency-account" ? "agency" : "client",name:"Account",status:id === "client-account" && !clientActive ? "suspended" : "active"}; }
    async agencyByAccountId() { return {id:"agency",accountId:"agency-account",name:"Agency",status:agencyActive ? "active" : "suspended"}; }
    async organizationsForMembership(_membership: unknown, agency: unknown) { if (!agency) return [{id:"direct-org",name:"Direct client",owningAccountId:"client-account",status:"active"}]; return [{id:"assigned",name:"Assigned client",owningAccountId:"client-account",status:"active"},{id:"suspended",name:"Suspended",owningAccountId:"other-account",status:"suspended"}]; }
    async permissionOverrides() { return []; }
    async businessContexts(member: string, organization: string) { lookups.push(`${member}:${organization}`); return [{id:"workspace",organizationId:organization,name:"Allowed workspace"}]; }
    async recordAuditEvent() {}
  }
  const output = await build({entryPoints:[new URL("../lib/identity/application-session.ts",import.meta.url).pathname],bundle:true,write:false,platform:"node",format:"cjs",external:["@workos-inc/authkit-nextjs","next/headers"],plugins:[{name:"session-mocks",setup(b){b.onResolve({filter:/supabase-identity-repository|active-organization-cookie|active-account-cookie/},args=>({path:args.path.includes("supabase") ? "repository" : args.path.includes("active-account") ? "account-cookie" : "organization-cookie",external:true}));}}]});
  const mocks: Record<string, unknown> = {
    repository:{SupabaseIdentityTenancyRepository:Repository},
    "account-cookie":{ACTIVE_ACCOUNT_COOKIE:"active-account",readActiveAccount:()=>requestedAccount},
    "organization-cookie":{ACTIVE_ORGANIZATION_COOKIE:"active-org",readActiveOrganization:()=>requested},
    "@workos-inc/authkit-nextjs":{withAuth:async()=>({user:{id:"provider-user",email:"agency@example.test",emailVerified:true}})},
    "next/headers":{headers:async()=>({get:()=>null}),cookies:async()=>({get:()=>undefined,has:()=>false})},
  };
  const bundledModule={exports:{} as any};
  runInNewContext(output.outputFiles[0].text,{module:bundledModule,exports:bundledModule.exports,require:(name:string)=>name in mocks ? mocks[name] : nativeRequire(name),process:{env:{NODE_ENV:"production",WORKOS_CLIENT_ID:"configured",WORKOS_API_KEY:"configured",WORKOS_COOKIE_PASSWORD:"test-only-secret-with-at-least-32-characters"}},console,structuredClone,URL,Date,Buffer,setTimeout});
  for (requested of [null,"assigned","foreign","suspended"]) {
    const result=await bundledModule.exports.resolveApplicationSession();
    assert.equal(result.kind,"authenticated");
    assert.equal(result.session.activeAccount.id,"agency-account");
    assert.equal(result.session.role,"agency-read-only");
    assert.equal(result.session.activeOrganization.id,"assigned");
    assert.deepEqual(Array.from(result.session.availableOrganizations,(o:any)=>o.id),["assigned"]);
    assert.equal(result.session.effectivePermissions.includes("admin.manage_tenants"),false);
    assert.equal(result.session.accessibleBusinessContexts.length,1);
  }
  assert.equal(lookups.every(value=>value==="member:assigned"),true);
  clientActive=false;
  const suspendedClient=await bundledModule.exports.resolveApplicationSession();
  assert.equal(suspendedClient.kind,"authenticated");
  assert.equal(suspendedClient.session.activeAccount.id,"agency-account");
  assert.equal(suspendedClient.session.activeOrganization,null);
  assert.equal(suspendedClient.session.availableOrganizations.length,0);
  assert.equal(suspendedClient.session.accessibleBusinessContexts.length,0);
  clientActive=true;
  mixed=true;
  requested="direct-org";
  requestedAccount="agency-account";
  const mixedSession=await bundledModule.exports.resolveApplicationSession();
  assert.equal(mixedSession.session.activeAccount.id,"agency-account");
  assert.equal(mixedSession.session.role,"agency-read-only");
  assert.equal(mixedSession.session.activeOrganization.id,"assigned");
  agencyActive=false;
  const result=await bundledModule.exports.resolveApplicationSession();
  assert.equal(result.kind,"no-membership");
});
