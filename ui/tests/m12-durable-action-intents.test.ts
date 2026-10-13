import assert from"node:assert/strict";import test from"node:test";import{readFileSync}from"node:fs";
const sql=readFileSync(new URL("../../supabase/migrations/20260928023029_mcp_action_intents_confirmations.sql",import.meta.url),"utf8"),repo=readFileSync(new URL("../lib/mcp/action-intent-repository.ts",import.meta.url),"utf8");
test("M12 durable action references are service-role only",()=>{assert.match(sql,/enable row level security/g);assert.match(sql,/revoke all on table public\.mcp_action_intents from anon,authenticated/);assert.match(sql,/revoke all on table public\.mcp_action_confirmations from anon,authenticated/);assert.match(sql,/grant select,insert on table public\.mcp_action_intents to service_role/);});
test("M12 intent retains exact server plan target operation actor and audit identity",()=>{for(const token of["organization_id","actor_user_id","plan_identity","customer_id","journey_id","operation","plan jsonb","audit_correlation_id","expires_at"])assert.ok(sql.includes(token),token);assert.match(sql,/check\(operation='inspect_evidence'\)/);});
test("M12 confirmation is bound to exact durable intent and actor",()=>{assert.match(sql,/intent_id uuid not null references public\.mcp_action_intents\(intent_id\) on delete restrict/);assert.match(sql,/unique\(intent_id,actor_user_id\)/);});
test("M12 confirmation resolution is organization actor and expiry scoped",()=>{for(const token of["c.organization_id=p_organization_id","c.actor_user_id=p_actor_user_id","i.organization_id=p_organization_id","i.actor_user_id=p_actor_user_id","i.expires_at>p_requested_at","c.expires_at>p_requested_at"])assert.ok(sql.includes(token),token);});
test("M12 repository issues opaque ids server side and uses service role",()=>{assert.match(repo,/randomUUID/);assert.match(repo,/SUPABASE_SERVICE_ROLE_KEY/);assert.match(repo,/resolve_mcp_action_confirmation/);});

test("M12 durable confirmation rejects foreign tenant, foreign actor and expired references in isolated SQL",async()=>{
 const {PGlite}=await import("@electric-sql/pglite");
 const db=new PGlite();
 const org="00000000-0000-0000-0000-000000000001",actor="00000000-0000-0000-0000-000000000002",foreign="00000000-0000-0000-0000-000000000003",intent="00000000-0000-0000-0000-000000000004",confirmation="00000000-0000-0000-0000-000000000005";
 try{
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec(sql);
  await db.query("insert into mcp_action_intents(intent_id,organization_id,actor_user_id,plan_identity,customer_id,journey_id,operation,plan,audit_correlation_id,issued_at,expires_at) values($1,$2,$3,'plan-1','customer-1','journey-1','inspect_evidence','{}','audit-1','2026-09-28T01:00:00Z','2026-09-28T02:00:00Z')",[intent,org,actor]);
  await db.query("insert into mcp_action_confirmations(confirmation_id,intent_id,organization_id,actor_user_id,confirmed_at,expires_at) values($1,$2,$3,$4,'2026-09-28T01:00:00Z','2026-09-28T02:00:00Z')",[confirmation,intent,org,actor]);
  const resolve=(tenant:string,user:string,at="2026-09-28T01:30:00Z")=>db.query("select * from resolve_mcp_action_confirmation($1,$2,$3,$4)",[confirmation,tenant,user,at]);
  assert.equal((await resolve(org,actor)).rows.length,1);
  assert.equal((await resolve(foreign,actor)).rows.length,0);
  assert.equal((await resolve(org,foreign)).rows.length,0);
  assert.equal((await resolve(org,actor,"2026-09-28T02:00:00Z")).rows.length,0);
 }finally{await db.close();}
});
