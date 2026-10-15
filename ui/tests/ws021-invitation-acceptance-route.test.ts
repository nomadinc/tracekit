import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
const nativeRequire = createRequire(import.meta.url);

test("explicit invitation acceptance selects only the organization returned by persisted acceptance", async () => {
  let allowed = true;
  let agencyTarget = false;
  let verified = true;
  const calls: Record<string, unknown>[] = [];
  class Repository {
    async customerInvitation(parameters: Record<string, unknown>) {
      calls.push(parameters);
      return { ok: allowed && parameters.p_email_verified === true, organizationId: agencyTarget ? null : "accepted-organization", accountId: agencyTarget ? "agency-account" : null };
    }
  }
  const output = await build({ entryPoints: [new URL("../app/api/invitations/route.ts", import.meta.url).pathname], bundle: true, write: false, platform: "node", format: "cjs", plugins: [{ name: "route-mocks", setup(b) {
    b.onResolve({ filter: /application-session|supabase-identity-repository|workos-invitation-delivery|active-organization-cookie|active-account-cookie|next\/server/ }, args => ({ path: args.path.split("/").pop()!, external: true }));
  } }] });
  const mocks: Record<string, unknown> = {
    "application-session": { resolveAuthenticatedPersistentIdentity: async () => ({ user: { id: "persistent-user", status: "active" }, externalWorkosUserId: "provider-user", emailVerified: verified }) },
    "supabase-identity-repository": { SupabaseIdentityTenancyRepository: Repository },
    "workos-invitation-delivery": {},
    "active-account-cookie": { ACTIVE_ACCOUNT_COOKIE: "active-account", sealActiveAccount: (payload: unknown) => JSON.stringify(payload) },
    "active-organization-cookie": { ACTIVE_ORGANIZATION_COOKIE: "active-org", sealActiveOrganization: (payload: unknown) => JSON.stringify(payload) },
    server: { NextResponse: { json: (body: unknown, options?: {status?: number}) => ({ body, status: options?.status ?? 200, cookies: { values: [] as unknown[], set(...args: unknown[]) { this.values.push(args); } } }) } },
  };
  const bundledModule = { exports: {} as any };
  runInNewContext(output.outputFiles[0].text, { module: bundledModule, exports: bundledModule.exports, require: (name: string) => name in mocks ? mocks[name] : nativeRequire(name), process: {env: {NODE_ENV: "production"}}, URL, Date, console });
  const request = (extra = {}) => new Request("https://app.example.test/api/invitations", { method: "POST", headers: {origin: "https://app.example.test", "content-type": "application/json"}, body: JSON.stringify({ operation: "accept", invitationId: "invitation", ...extra }) });
  const success = await bundledModule.exports.POST(request());
  assert.equal(success.status, 200);
  const [name, value, options] = success.cookies.values.find((entry: any[]) => entry[0] === "active-org");
  assert.equal(name, "active-org");
  assert.equal(JSON.parse(value).userId, "persistent-user");
  assert.equal(JSON.parse(value).organizationId, "accepted-organization");
  assert.equal(options.httpOnly, true);
  assert.equal(options.secure, true);
  assert.equal(success.cookies.values.find((entry: any[]) => entry[0] === "tracekit-active-business-context")[2].maxAge, 0);
  agencyTarget = true;
  const agency = await bundledModule.exports.POST(request());
  assert.equal(agency.status, 200);
  const selectedAccount = agency.cookies.values.find((entry: any[]) => entry[0] === "active-account");
  assert.equal(JSON.parse(selectedAccount[1]).accountId, "agency-account");
  assert.equal(JSON.parse(selectedAccount[1]).userId, "persistent-user");
  assert.equal(agency.cookies.values.find((entry: any[]) => entry[0] === "active-org")[2].maxAge, 0);
  agencyTarget = false;
  allowed = false;
  const denied = await bundledModule.exports.POST(request());
  assert.equal(denied.status, 404);
  assert.equal(denied.cookies.values.length, 0);
  allowed = true; verified = false;
  assert.equal((await bundledModule.exports.POST(request())).status, 404);
  const count = calls.length;
  assert.equal((await bundledModule.exports.POST(request({ organizationId: "foreign" }))).status, 404);
  assert.equal(calls.length, count);
});

test("agency invitation API binds the account, role and selected workspaces before sending", async () => {
  const calls: Record<string, unknown>[]=[];
  let sends=0;
  class Repository {
    async invitationDelivery(p: Record<string, unknown>) {
      calls.push(p);
      return p.p_operation === "finish" ? {ok:true} : {ok:true,id:"invitation",email:"recipient@example.test",expiresAt:"2999-01-01",claimed:true,state:"sending",attemptId:"attempt"};
    }
  }
  const output=await build({entryPoints:[new URL("../app/api/invitations/route.ts",import.meta.url).pathname],bundle:true,write:false,platform:"node",format:"cjs",plugins:[{name:"agency-route-mocks",setup(b){b.onResolve({filter:/application-session|supabase-identity-repository|workos-invitation-delivery|invitation-target-access|next\/server/},args=>({path:args.path.split("/").pop()!,external:true}));}}]});
  const mocks:Record<string,unknown>={
    "application-session":{resolveApplicationSession:async()=>({kind:"authenticated",session:{user:{id:"operator"},externalWorkosUserId:"provider",correlationId:"request",membership:{id:"member"}}})},
    "supabase-identity-repository":{SupabaseIdentityTenancyRepository:Repository},
    "workos-invitation-delivery":{sendWorkOSInvitation:async(email:string)=>{sends++;return {id:"invitation_provider",email,state:"pending",organizationId:null};}},
    "invitation-target-access":{resolveAgencyInvitationTargetAccess:async()=>[{id:"allowed",organizationId:"assigned"}]},
    server:{NextResponse:{json:(body:unknown,options?:{status?:number})=>({body,status:options?.status??200})}},
  };
  const bundledModule={exports:{} as any};
  runInNewContext(output.outputFiles[0].text,{module:bundledModule,exports:bundledModule.exports,require:(name:string)=>name in mocks?mocks[name]:nativeRequire(name),process:{env:{NODE_ENV:"production"}},URL,Date,console});
  const input={operation:"issue",accountId:"agency",role:"agency-read-only",intendedEmail:"recipient@example.test",businessContextIds:["allowed","allowed"]};
  const request=(change={})=>new Request("https://app.example.test/api/invitations",{method:"POST",headers:{origin:"https://app.example.test","content-type":"application/json"},body:JSON.stringify({...input,...change})});
  const result=await bundledModule.exports.POST(request());
  assert.equal(result.status,201);assert.equal(sends,1);
  assert.equal(calls[0].p_account_id,"agency");assert.equal(calls[0].p_organization_id,undefined);
  assert.deepEqual(Array.from(calls[0].p_context_ids as string[]),["allowed"]);
  assert.equal(calls[1].p_operation,"finish");
  for(const change of [{role:"agency-owner"},{organizationId:"foreign"},{businessContextIds:["foreign"]},{businessContextIds:[]}]) assert.equal((await bundledModule.exports.POST(request(change))).status,404);
  assert.equal(sends,1);assert.equal(calls.length,2);
});
