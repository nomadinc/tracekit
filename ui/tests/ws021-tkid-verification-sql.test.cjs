const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{PGlite}=require('@electric-sql/pglite');
const sql=fs.readFileSync(path.join(__dirname,'../../supabase/review/ws021_tkid_issue_verification.sql'),'utf8');
const org='00000000-0000-4000-8000-000000000001',account='00000000-0000-4000-8000-000000000002',source='00000000-0000-4000-8000-000000000003',origin='00000000-0000-4000-8000-000000000004',actor='00000000-0000-4000-8000-000000000005';
async function fixture(){
 const d=new PGlite();await d.exec(`
 CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
 CREATE TABLE tkid_sources(id uuid,organization_id uuid,account_id uuid,business_context_id text,status text,capture_mode text);
 CREATE TABLE tkid_source_origins(id uuid primary key,organization_id uuid,account_id uuid,business_context_id text,source_id uuid,canonical_origin text,role text,lifecycle_status text,verification_state text,verified_at timestamptz,updated_at timestamptz);
 CREATE TABLE tkid_origin_verifications(id uuid default gen_random_uuid(),organization_id uuid,source_id uuid,origin_id uuid,record_name text,token_digest text check(token_digest ~ '^[a-f0-9]{64}$'),token_hint text,expires_at timestamptz,executor_context text,state text default 'issued',issued_at timestamptz default now(),superseded_at timestamptz);
 CREATE UNIQUE INDEX live_challenge ON tkid_origin_verifications(origin_id) WHERE state='issued';
 CREATE TABLE tracekit_audit_events(actor_user_id uuid,account_id uuid,organization_id uuid,action text,target_type text,target_id text,result text,permission_evaluated text,correlation_id text,metadata jsonb);
 INSERT INTO tkid_sources VALUES('${source}','${org}','${account}','context','shadow','stopped');
 INSERT INTO tkid_source_origins VALUES('${origin}','${org}','${account}','context','${source}','https://lp1.shopstemlabs.com','frontend','pending','unissued',null,now());
 `);await d.exec(sql);return d;
}
async function issue(d,organization=org){return d.query('select tkid_issue_origin_verification($1,$2,$3,$4,$5,$6,$7,$8,$9) result',[organization,account,'context',origin,actor,'_tracekit.lp1.shopstemlabs.com','a'.repeat(64),'test1234',actor]);}
test('atomic issuance, 24-hour expiry and blocked replay leave one challenge and audit; tracking unchanged',async()=>{const d=await fixture();try{
 const r=(await issue(d)).rows[0].result;assert.equal(r.record_name,'_tracekit.lp1.shopstemlabs.com');
 const remaining=Date.parse(r.expires_at)-Date.now();assert.ok(remaining>86300000&&remaining<=86410000);
 await assert.rejects(issue(d),e=>e.code==='TK409');
 for(const table of ['tkid_origin_verifications','tracekit_audit_events'])assert.equal((await d.query('select count(*)::int n from '+table)).rows[0].n,1);
 assert.deepEqual((await d.query('select status,capture_mode from tkid_sources')).rows[0],{status:'shadow',capture_mode:'stopped'});
 assert.equal((await d.query('select verification_state from tkid_source_origins')).rows[0].verification_state,'issued');
 }finally{await d.close();}});
test('audit failure rolls back challenge insertion and origin status',async()=>{const d=await fixture();try{
 await d.exec('alter table tracekit_audit_events add check(false)');
 await assert.rejects(issue(d));assert.equal((await d.query('select count(*)::int n from tkid_origin_verifications')).rows[0].n,0);
 assert.equal((await d.query('select verification_state from tkid_source_origins')).rows[0].verification_state,'unissued');
 }finally{await d.close();}});
test('foreign organization denied with zero writes',async()=>{const d=await fixture();try{
 await assert.rejects(issue(d,actor),e=>e.code==='TK404');assert.equal((await d.query('select count(*)::int n from tkid_origin_verifications')).rows[0].n,0);
 }finally{await d.close();}});
test('expired prior challenge supersedes within same atomic transaction',async()=>{const d=await fixture();try{
 await issue(d);await d.exec("update tkid_origin_verifications set expires_at=now()-interval '1 minute'");
 await issue(d);assert.equal((await d.query("select count(*)::int n from tkid_origin_verifications where state='issued'")).rows[0].n,1);
 assert.equal((await d.query("select count(*)::int n from tkid_origin_verifications where state='superseded'")).rows[0].n,1);
 }finally{await d.close();}});
