import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createScopedCoreProxy } from "../lib/identity/scoped-core-runtime";
import { resolveEffectivePermissions } from "../lib/identity/persistent-authorization";
import { authorizeCustomerInvitation } from "../lib/identity/customer-invitation-policy";
import ts from "typescript";

// Pinned disposable PostgreSQL/WASM harness, installed separately from application deps.
// Command and exact version are recorded in the review report. No hosted DB is contacted.
const pgModule = process.env.WS021_PGLITE_MODULE;
assert.ok(pgModule, "Set WS021_PGLITE_MODULE to the pinned @electric-sql/pglite@0.5.15 module");
let db: any;
const sql = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
test.before(async () => {
  const { PGlite } = await import(pgModule);
  db = new PGlite();
  await db.exec(sql("./fixtures/ws021-onboarding.sql"));
  await db.exec(sql("../../supabase/migrations/20261007055158_ws021_platform_admin_provisioning.sql"));
  await db.exec(sql("../../supabase/migrations/20261007055014_ws020_customer_invitations.sql"));
  await db.exec(sql("../../supabase/migrations/20261007174059_ws020_invitation_email_delivery.sql"));
  await db.exec(sql("../../supabase/migrations/20261105162517_ws021_client_context_orders_only_onboarding.sql"));
  await db.exec("set role service_role");
});
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const nh = id(201), foreign = id(202), admin = id(1), customer = id(2);
const row = async (q: string, args: unknown[] = []) => (await db.query(q, args)).rows[0];
const prepare = (account = id(102), org = nh, actor = admin, subject = "fixture-admin") => row("select public.ws021_prepare_client_context($1,$2,'fixture',$3,$4) as value", [actor, subject, account, org]);
let context: string, invitation: string, membership: string;
const issue = (email = "customer@example.test", contexts = [context]) => row("select public.ws021_issue_orders_only_invitation($1,'fixture-admin','fixture',$2,$3,$4,$5,$6) as value", [admin,id(401),id(501),nh,email,contexts]);
const accept = (verified: boolean, actor = customer, subject = "fixture-customer") => row("select public.tracekit_customer_invitation('accept',$1,$2,'fixture',$3,p_email_verified=>$4) as value", [actor,subject,invitation,verified]);

test("existing-client workspace repair preserves identity and is idempotent", async () => {
  const before = JSON.stringify((await db.query("select * from tracekit_accounts order by id")).rows);
  const orgs = JSON.stringify((await db.query("select * from tracekit_organizations order by id")).rows);
  context = (await prepare()).value;
  assert.equal((await prepare()).value, context);
  assert.equal((await row("select count(*)::int as n from tracekit_business_contexts where organization_id=$1", [nh])).n, 1);
  assert.equal(JSON.stringify((await db.query("select * from tracekit_accounts order by id")).rows), before);
  assert.equal(JSON.stringify((await db.query("select * from tracekit_organizations order by id")).rows), orgs);
});
test("workspace repair rejects foreign ownership, missing identity and non-admin", async () => {
  await assert.rejects(prepare(id(103),nh));
  await assert.rejects(prepare(id(102),nh,admin,"wrong-subject"));
  await assert.rejects(prepare(id(102),nh,customer,"fixture-customer"));
  assert.equal((await row("select count(*)::int as n from tracekit_business_contexts")).n, 1);
});
test("restricted invitation checks contexts and current permission authority", async () => {
  await assert.rejects(issue("customer@example.test", ["foreign-context"]));
  await db.query("insert into tracekit_permission_overrides(membership_id,capability,effect,reason) values($1,'users.manage_permissions','deny','fixture')",[id(401)]);
  await assert.rejects(issue());
  await db.query("delete from tracekit_permission_overrides where membership_id=$1",[id(401)]);
  const result = (await issue()).value;
  assert.equal(result.ok,true); invitation = result.id;
  assert.equal((await issue()).value.id,invitation);
  assert.equal((await row("select count(*)::int as n from tracekit_orders_only_invitations")).n,1);
});
test("unverified or wrong identity cannot accept; no membership created", async () => {
  assert.equal((await accept(false)).value.ok,false);
  assert.equal((await accept(true,id(3),"fixture-other")).value.ok,false);
  assert.equal((await row("select count(*)::int as n from tracekit_memberships where organization_id=$1",[nh])).n,0);
});
test("restricted invitation cannot be attached to a foreign membership", async () => {
  await assert.rejects(db.query("insert into tracekit_memberships(user_id,organization_id,role_id,invitation_id) values($1,$2,$3,$4)",[customer,foreign,id(302),invitation]));
  assert.equal((await row("select count(*)::int as n from tracekit_memberships where user_id=$1",[customer])).n,0);
});
test("failed financial-denial persistence rolls back the entire acceptance", async () => {
  await db.exec("reset role; alter table tracekit_permission_overrides add constraint fixture_failure check(capability<>'orders.view_financials'); set role service_role");
  await assert.rejects(accept(true));
  assert.equal((await row("select count(*)::int as n from tracekit_memberships where organization_id=$1",[nh])).n,0);
  assert.equal((await row("select status from tracekit_invitations where id=$1",[invitation])).status,"pending");
  await db.exec("reset role; alter table tracekit_permission_overrides drop constraint fixture_failure; set role service_role");
});
test("verified acceptance atomically assigns only selected context and both denials", async () => {
  const result = (await accept(true)).value; assert.equal(result.ok,true); membership=result.id;
  const grants=(await db.query("select organization_id,business_context_id from tracekit_business_context_access where membership_id=$1",[membership])).rows;
  assert.deepEqual(grants,[{organization_id:nh,business_context_id:context}]);
  const overrides=(await db.query("select capability,effect from tracekit_permission_overrides where membership_id=$1 order by capability",[membership])).rows;
  assert.deepEqual(overrides,[{capability:"financials.view",effect:"deny"},{capability:"orders.view_financials",effect:"deny"}]);
  assert.equal((await accept(true)).value.ok,false);
  assert.equal((await row("select count(*)::int as n from tracekit_users")).n,3);
});

async function session() {
  const m=await row("select m.*,r.role_key from tracekit_memberships m join tracekit_roles r on r.id=m.role_id where m.id=$1",[membership]);
  const member:any={id:m.id,userId:m.user_id,organizationId:m.organization_id,accountId:m.account_id,role:m.role_key,status:m.status,effectiveFrom:m.effective_from.toISOString(),effectiveUntil:null};
  const overrides=(await db.query("select capability,effect from tracekit_permission_overrides where membership_id=$1",[membership])).rows;
  return {user:{id:customer,status:"active"},externalWorkosUserId:"fixture-customer",membership:member,activeAccount:{id:id(102)},activeOrganization:{id:nh},availableOrganizations:[{id:nh}],effectivePermissions:Array.from(resolveEffectivePermissions(member,overrides))} as any;
}
test("database-derived customer permissions drive actual Orders route/redaction and tenant denial", async () => {
  const s=await session(); assert.ok(s.effectivePermissions.includes("orders.view"));
  assert.equal(s.effectivePermissions.includes("financials.view"),false);
  assert.equal(s.effectivePermissions.includes("orders.view_financials"),false);
  const calls:string[]=[];
  const proxy=createScopedCoreProxy({resolveSession:async()=>({kind:"authenticated",session:await session()}),apiBaseUrl:()=>"https://core.example.test",adminSecret:()=>"fixture",fetch:async(input)=>{calls.push(String(input));return Response.json({ok:true,orders:[{order:{id:"fixture-order",gross_amount:25}}]});}});
  // Compile and execute the unchanged production route with only its network/session
  // boundary injected. This exercises its real gross_amount redaction, not a copy.
  const compiled=ts.transpileModule(sql("../app/api/customer-orders/route.ts"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const mod:{exports:any}={exports:{}};
  new Function("require","module","exports",compiled)((name:string)=>{
    if(name==="next/server")return {NextResponse:{json:(body:unknown,options:ResponseInit)=>Response.json(body,options)}};
    if(name==="@/lib/identity/scoped-core-proxy")return proxy;
    throw new Error(`Unexpected route import ${name}`);
  },mod,mod.exports);
  const response=await mod.exports.GET(new Request("https://ui.example.test/api/customer-orders"));
  assert.equal(response.status,200); const body=await response.json();
  assert.equal(body.orders[0].order.gross_amount,undefined);
  assert.equal(new URL(calls[0]).searchParams.get("workspace_id"),nh);
  for(const hint of [`workspace_id=${foreign}`,"workspace_id=default",`workspace_id=${nh}&workspace_id=${foreign}`]){
    const denied=await mod.exports.GET(new Request(`https://ui.example.test/api/customer-orders?${hint}`));assert.equal(denied.status,404);
  }
  assert.equal(calls.length,1);
  assert.equal((await proxy.scopedCoreGet("/v1/financial-reconciliation","https://ui.example.test/api/financial-reconciliation","financials.view")).status,404);
  await db.query("update tracekit_memberships set status='removed' where id=$1",[membership]);
  assert.equal((await mod.exports.GET(new Request("https://ui.example.test/api/customer-orders"))).status,404);
});
test("ordinary invitation retains existing role behavior; protected policy has no public API", async () => {
  const invited=(await row("select public.tracekit_invitation_delivery('issue',$1,'fixture-admin','fixture',$2,$3,$4,'other@example.test',$5) as value",[admin,id(401),nh,id(502),[context]])).value;
  const accepted=(await row("select public.tracekit_customer_invitation('accept',$1,'fixture-other','fixture',$2,p_email_verified=>true) as value",[id(3),invited.id])).value;
  assert.equal(accepted.ok,true);
  assert.equal((await row("select count(*)::int as n from tracekit_permission_overrides where membership_id=$1",[accepted.id])).n,0);
  await db.exec("reset role; set role authenticated");
  await assert.rejects(db.query("select * from tracekit_orders_only_invitations"));
  await assert.rejects(prepare());
  await db.exec("reset role; set role service_role");
});
test("inactive existing contexts require review and are never replaced or reactivated", async () => {
  await db.query("insert into tracekit_business_contexts(id,account_id,organization_id,name,status) values('inactive-context',$1,$2,'Paused workspace','inactive')",[id(103),foreign]);
  await assert.rejects(prepare(id(103),foreign));
  assert.equal((await row("select count(*)::int as n from tracekit_business_contexts where organization_id=$1",[foreign])).n,1);
  assert.equal((await row("select status from tracekit_business_contexts where id='inactive-context'")).status,"inactive");
});
test("invitation policy keeps role and context checks", () => {
  const s:any={user:{id:admin,status:"active"},membership:{id:id(401),userId:admin,status:"active",role:"platform-owner",effectiveFrom:"2020-01-01"},activeOrganization:{id:nh},availableOrganizations:[{id:nh}],effectivePermissions:["users.invite"],accessibleBusinessContexts:[{id:context,organizationId:nh}]};
  assert.equal(authorizeCustomerInvitation(s,{organizationId:nh,role:"client-read-only",intendedEmail:" customer@example.test ",businessContextIds:[context]}).intendedEmail,"customer@example.test");
  assert.throws(()=>authorizeCustomerInvitation(s,{organizationId:nh,role:"organization-admin",intendedEmail:"customer@example.test",businessContextIds:[context]}));
  assert.throws(()=>authorizeCustomerInvitation(s,{organizationId:nh,role:"client-read-only",intendedEmail:"customer@example.test",businessContextIds:[]}));
});
test("real acceptance route selects only the successfully accepted organization and clears stale context", async () => {
  const compiled=ts.transpileModule(sql("../app/api/invitations/route.ts"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  let result:any={ok:true,organizationId:nh};
  const changes:any[]=[]; const mod:{exports:any}={exports:{}};
  new Function("require","module","exports",compiled)((name:string)=>{
    if(name==="next/server")return {NextResponse:{json:(body:unknown,options:ResponseInit)=>{const r:any=Response.json(body,options);r.cookies={set:(...args:any[])=>changes.push(["set",...args]),delete:(...args:any[])=>changes.push(["delete",...args])};return r;}}};
    if(name==="node:crypto")return {randomUUID:()=>id(999)};
    if(name.endsWith("/application-session"))return {resolveAuthenticatedPersistentIdentity:async()=>({user:{id:customer,status:"active"},externalWorkosUserId:"fixture-customer",emailVerified:true})};
    if(name.endsWith("/supabase-identity-repository"))return {SupabaseIdentityTenancyRepository:class {async customerInvitation(){return result;}}};
    if(name.endsWith("/active-organization-cookie"))return {ACTIVE_ORGANIZATION_COOKIE:"fixture-org",sealActiveOrganization:(value:unknown)=>JSON.stringify(value)};
    if(name.endsWith("/active-business-context-cookie"))return {ACTIVE_BUSINESS_CONTEXT_COOKIE:"fixture-context"};
    // Other imports belong to the separate issuance branches, not this request.
    return {};
  },mod,mod.exports);
  const request=()=>new Request("https://ui.example.test/api/invitations",{method:"POST",headers:{origin:"https://ui.example.test","content-type":"application/json"},body:JSON.stringify({operation:"accept",invitationId:invitation})});
  assert.equal((await mod.exports.POST(request())).status,200);
  assert.equal(changes[0][0],"delete");assert.equal(changes[0][1],"fixture-context");
  assert.equal(changes[1][1],"fixture-org");
  const sealed=JSON.parse(changes[1][2]); assert.equal(sealed.userId,customer);assert.equal(sealed.organizationId,nh);
  assert.equal(changes[1][3].httpOnly,true);assert.equal(changes[1][3].sameSite,"lax");
  changes.length=0;result={ok:false,organizationId:foreign};
  assert.equal((await mod.exports.POST(request())).status,404);assert.deepEqual(changes,[]);
});
test.after(async()=>{await db.close();});
