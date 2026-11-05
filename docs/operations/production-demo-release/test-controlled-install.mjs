// Disposable PostgreSQL/WASM only. Never connects to a provider/database URL.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const modulePath=process.env.WS021_PGLITE_MODULE;
assert.ok(modulePath,'Use the separately pinned @electric-sql/pglite@0.5.15 module');
const {PGlite}=await import(modulePath);
const root=new URL('../../../',import.meta.url);
const text=(path)=>readFileSync(new URL(path,root),'utf8');
const installer=readFileSync(new URL('controlled-install.sql',import.meta.url),'utf8');
async function fixture(){
 const db=new PGlite();
 let setup=text('ui/tests/fixtures/ws021-onboarding.sql');
 const replacements={
  '00000000-0000-4000-8000-000000000102':'26a6eabb-2ddc-4b0d-8bf2-ce61c2ca700f',
  '00000000-0000-4000-8000-000000000201':'ab757103-4ad9-4fd8-a3f1-3f5adaee9b03',
  '00000000-0000-4000-8000-000000000002':'92575f17-e049-4069-ab57-52c196994e6b',
  'fixture-customer':'user_01M4Y67KBET8XEQQGTR9Z9AK03',
  'customer@example.test':'spongant@mac.com',
 };
 for(const [a,b] of Object.entries(replacements))setup=setup.replaceAll(a,b);
 await db.exec(setup);
 for(const path of ['20261007055158_ws021_platform_admin_provisioning.sql','20261007055014_ws020_customer_invitations.sql','20261007174059_ws020_invitation_email_delivery.sql'])await db.exec(text('supabase/migrations/'+path));
 await db.exec('create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text,created_by text,idempotency_key text,rollback text[])');
 return db;
}
async function counts(db){return (await db.query("select (select count(*)::int from tracekit_accounts) accounts,(select count(*)::int from tracekit_organizations) organizations,(select count(*)::int from tracekit_business_contexts) contexts,(select count(*)::int from tracekit_memberships) memberships,(select count(*)::int from tracekit_invitations) invitations,(select count(*)::int from tracekit_permission_overrides) overrides")).rows[0];}
let db;
test.before(async()=>{db=await fixture();});
test.after(async()=>{await db?.close();});
test('controlled install commits exact objects and history without tenant enrollment',async()=>{
 const before=await counts(db);await db.exec(installer);
 assert.deepEqual(await counts(db),before);
 assert.equal((await db.query('select count(*)::int n from supabase_migrations.schema_migrations')).rows[0].n,1);
});
test('second controlled install skips immutable DDL and creates no duplicate rows',async()=>{
 const before=await counts(db);await db.exec(installer);
 assert.deepEqual(await counts(db),before);
 assert.equal((await db.query('select count(*)::int n from supabase_migrations.schema_migrations')).rows[0].n,1);
});
test('mismatched migration ledger fails closed and preserves installed state',async()=>{
 await db.exec("update supabase_migrations.schema_migrations set statements=array['wrong body']");
 const before=await counts(db);await assert.rejects(db.exec(installer));await db.exec('rollback');
 assert.deepEqual(await counts(db),before);
 assert.equal((await db.query("select to_regprocedure('public.ws021_prepare_client_context(uuid,text,text,uuid,uuid)') is not null present")).rows[0].present,true);
});
test('application runtime principal cannot install schema objects',async()=>{
 const other=await fixture();try{
  await other.exec('set role service_role');await assert.rejects(other.exec(installer));
  await other.exec('rollback; reset role');
  assert.equal((await other.query("select to_regclass('public.tracekit_orders_only_invitations') present")).rows[0].present,null);
 }finally{await other.close();}
});
test('failure after initial DDL rolls back all new objects and migration history',async()=>{
 const other=await fixture();try{
  await other.exec("create function public.fixture_abort_table() returns event_trigger language plpgsql as $$begin raise exception 'forced installation failure';end$$; create event trigger fixture_abort on ddl_command_start when tag in ('CREATE TABLE') execute function public.fixture_abort_table()");
  await assert.rejects(other.exec(installer));await other.exec('rollback');
  assert.equal((await other.query("select to_regprocedure('public.ws021_prepare_client_context(uuid,text,text,uuid,uuid)') present")).rows[0].present,null);
  assert.equal((await other.query('select count(*)::int n from supabase_migrations.schema_migrations')).rows[0].n,0);
 }finally{await other.close();}
});
