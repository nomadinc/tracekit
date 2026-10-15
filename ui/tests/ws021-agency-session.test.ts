import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
const nativeRequire = createRequire(import.meta.url);

test("persisted agency session uses assigned clients, agency account and agency role", async () => {
  let requested: string | null = null;
  let agencyActive = true;
  const lookups: string[] = [];
  class Repository {
    async synchronizeUser() { return { id: "user", primaryEmail: "agency@example.test", displayName: "Agency member", status: "active" }; }
    async membershipsForUser() { return [{ id: "member", userId: "user", accountId: "agency-account", organizationId: null, role: "agency-read-only", status: "active" }]; }
    async accountById(id: string) { assert.equal(id,"agency-account"); return {id, accountType:"agency",name:"Agency",status:"active"}; }
    async agencyByAccountId() { return {id:"agency",accountId:"agency-account",name:"Agency",status:agencyActive ? "active" : "suspended"}; }
    async organizationsForMembership(_membership: unknown, agency: unknown) { assert.ok(agency); return [{id:"assigned",name:"Assigned client",owningAccountId:"client-account",status:"active"},{id:"suspended",name:"Suspended",owningAccountId:"other-account",status:"suspended"}]; }
    async permissionOverrides() { return []; }
    async businessContexts(member: string, organization: string) { lookups.push(`${member}:${organization}`); return [{id:"workspace",organizationId:organization,name:"Allowed workspace"}]; }
    async recordAuditEvent() {}
  }
  const output = await build({entryPoints:[new URL("../lib/identity/application-session.ts",import.meta.url).pathname],bundle:true,write:false,platform:"node",format:"cjs",external:["@workos-inc/authkit-nextjs","next/headers"],plugins:[{name:"session-mocks",setup(b){b.onResolve({filter:/supabase-identity-repository|active-organization-cookie/},args=>({path:args.path.includes("supabase") ? "repository" : "organization-cookie",external:true}));}}]});
  const mocks: Record<string, unknown> = {
    repository:{SupabaseIdentityTenancyRepository:Repository},
    "organization-cookie":{ACTIVE_ORGANIZATION_COOKIE:"active-org",readActiveOrganization:()=>requested},
    "@workos-inc/authkit-nextjs":{withAuth:async()=>({user:{id:"provider-user",email:"agency@example.test",emailVerified:true}})},
    "next/headers":{headers:async()=>({get:()=>null}),cookies:async()=>({get:()=>undefined,has:()=>false})},
  };
  const module={exports:{} as any};
  runInNewContext(output.outputFiles[0].text,{module,exports:module.exports,require:(name:string)=>name in mocks ? mocks[name] : nativeRequire(name),process:{env:{NODE_ENV:"production",WORKOS_CLIENT_ID:"configured",WORKOS_API_KEY:"configured",WORKOS_COOKIE_PASSWORD:"test-only-secret-with-at-least-32-characters"}},console,structuredClone,URL,Date,Buffer,setTimeout});
  for (requested of [null,"assigned","foreign","suspended"]) {
    const result=await module.exports.resolveApplicationSession();
    assert.equal(result.kind,"authenticated");
    assert.equal(result.session.activeAccount.id,"agency-account");
    assert.equal(result.session.role,"agency-read-only");
    assert.equal(result.session.activeOrganization.id,"assigned");
    assert.deepEqual(Array.from(result.session.availableOrganizations,(o:any)=>o.id),["assigned"]);
    assert.equal(result.session.effectivePermissions.includes("admin.manage_tenants"),false);
    assert.equal(result.session.accessibleBusinessContexts.length,1);
  }
  assert.equal(lookups.every(value=>value==="member:assigned"),true);
  agencyActive=false;
  const result=await module.exports.resolveApplicationSession();
  assert.equal(result.kind,"no-membership");
});
