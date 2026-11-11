const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const esbuild=require('esbuild');
const {PGlite}=require('@electric-sql/pglite');
const sql=fs.readFileSync(path.join(__dirname,'../../supabase/review/ws021_stem_first_offer.sql'),'utf8');
const org='8f6bb14b-2126-49b8-bfdb-c60edbc3549b',account='4dcad1a0-48af-4c5c-8b32-15c1c89ccd1d',product='498c8cb0-56d1-42fe-80bb-cddfb4abcea0',conn='4e644c93-7839-4a82-8470-1c6f25825f26',pa='e7c2b1e5-8465-4341-8f8c-89bc05cca367',actor='00000000-0000-4000-8000-000000000001',cor='00000000-0000-4000-8000-000000000002';
async function db(){
 const d=new PGlite();
 await d.exec(`
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE TABLE tracekit_users(id uuid primary key,status text);
 CREATE TABLE tracekit_organizations(id uuid primary key,owning_account_id uuid,status text);
 CREATE TABLE tracekit_business_contexts(id text primary key,organization_id uuid,account_id uuid,status text);
 CREATE TABLE commerce_provider_connections(id uuid primary key,organization_id uuid,account_id uuid);
 CREATE TABLE commerce_provider_products(id uuid primary key,organization_id uuid,connection_id uuid,provider_account_id uuid,provider_product_id text,title text,mapping_status text,mapping_version text,canonical_offer_id uuid,offer_step_id uuid,offer_variant_id uuid,business_context_id text,reviewed_by_user_id uuid,reviewed_at timestamptz,updated_at timestamptz);
 CREATE TABLE platform_orders(canonical_order_id uuid primary key,organization_id uuid,connection_id uuid,provider_account_id uuid,platform text,provider_order_id text,raw_json jsonb,raw jsonb);
 CREATE TABLE canonical_offers(id uuid primary key,account_id uuid,organization_id uuid,business_context_id text,name text,status text);
 CREATE TABLE offer_steps(id uuid primary key,organization_id uuid,canonical_offer_id uuid references canonical_offers(id),role text,sequence int,label text);
 CREATE TABLE commerce_product_mapping_decisions(id uuid primary key default gen_random_uuid(),organization_id uuid,connection_id uuid,provider_account_id uuid,provider_product_id uuid,previous_state text,resulting_state text,business_context_id text,canonical_offer_id uuid,offer_step_id uuid,offer_variant_id uuid,mapping_version text,decided_by_user_id uuid,reason text,correlation_id text);
 CREATE TABLE tracekit_audit_events(actor_user_id uuid,account_id uuid,organization_id uuid,action text,target_type text,target_id text,result text,permission_evaluated text,correlation_id text,metadata jsonb);
 INSERT INTO tracekit_users VALUES('${actor}','active');
 INSERT INTO tracekit_organizations VALUES('${org}','${account}','active');
 INSERT INTO tracekit_business_contexts VALUES('stem-labs-8f6bb14b','${org}','${account}','active');
 INSERT INTO commerce_provider_connections VALUES('${conn}','${org}','${account}');
 INSERT INTO commerce_provider_products(id,organization_id,connection_id,provider_account_id,provider_product_id,title,mapping_status)
 VALUES('${product}','${org}','${conn}','${pa}','8','20 Treatments (5)','observed');
 INSERT INTO platform_orders VALUES('15f0b290-aaad-4962-b1d6-42f69db3966c','${org}','${conn}','${pa}','next29','103104','{"lines":[{"id":2443,"product_id":8,"quantity":1,"product_title":"20 Treatments (5)","is_upsell":false}]}',null);
 `);
 await d.exec(sql);
 return d;
}
const call=d=>d.query('select ws021_activate_stem_first_offer($1::uuid,$2::text) as result',[actor,cor]);
test('actual SQL creates one Offer, step, guarded mapping decision and audit; repeat is idempotent',async()=>{
 const d=await db(); try{
 const first=(await call(d)).rows[0].result;assert.equal(first.replayed,false);
 const again=(await call(d)).rows[0].result;assert.equal(again.replayed,true);assert.equal(first.mappingId,again.mappingId);
 for(const t of ['canonical_offers','offer_steps','commerce_product_mapping_decisions','tracekit_audit_events'])assert.equal((await d.query('select count(*)::int n from '+t)).rows[0].n,1);
 assert.equal((await d.query('select canonical_order_id::text id from platform_orders')).rows[0].id,'15f0b290-aaad-4962-b1d6-42f69db3966c');
 }finally{await d.close();}
});
for(const [name,change] of [
 ['foreign context',"update tracekit_business_contexts set organization_id='00000000-0000-4000-8000-000000000009'"],
 ['wrong provider account',"update commerce_provider_products set provider_account_id='00000000-0000-4000-8000-000000000009'"],
 ['stale mapping',"update commerce_provider_products set mapping_version='another'"],
 ['wrong source line',`update platform_orders set raw_json='{"lines":[{"id":2444}]}'`],
 ['existing equivalent offer',`insert into canonical_offers values('00000000-0000-4000-8000-000000000009','${account}','${org}','stem-labs-8f6bb14b','Stem Labs — 20 Treatments (5)','active')`],
 ['audit failure',`alter table tracekit_audit_events add constraint fail_audit check(false)`],
])test(name+' rejects and leaves no mapping/step',async()=>{const d=await db();try{await d.exec(change);await assert.rejects(call(d));assert.equal((await d.query('select count(*)::int n from commerce_product_mapping_decisions')).rows[0].n,0);assert.equal((await d.query('select count(*)::int n from offer_steps')).rows[0].n,0);if(name!=='existing equivalent offer')assert.equal((await d.query('select count(*)::int n from canonical_offers')).rows[0].n,0);}finally{await d.close();}});
async function routeHarness(session,result=[{ok:true,offerId:'offer',mappingId:'decision',replayed:false}]) {
 let calls=[];
 const built=await esbuild.build({entryPoints:[path.join(__dirname,'../app/api/commerce/product-mappings/approved-stem-offer/route.ts')],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'mock-io',setup(b){
 b.onResolve({filter:/^next\/server$/},()=>({path:'next',namespace:'mock'}));
 b.onResolve({filter:/^@\/lib\/identity\/application-session$/},()=>({path:'session',namespace:'mock'}));
 b.onResolve({filter:/^@\/lib\/commerce\/supabase-control-repository$/},()=>({path:'repo',namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='next'?'exports.NextResponse={json:(body,init)=>({body,...init})};':a.path==='session'?'exports.resolveApplicationSession=async()=>global.__ws021Session;':'exports.CommercePersistenceError=class extends Error {}; exports.commercePersistenceRequest=async(...args)=>{global.__ws021Calls.push(args);return global.__ws021Result;};',loader:'js'}));
 }}]});
 const mod={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,mod,mod.exports);
 global.__ws021Session=session;global.__ws021Calls=calls;global.__ws021Result=result;
 return {POST:mod.exports.POST,calls};
}
const session=()=>({kind:'authenticated',session:{
 user:{id:actor,status:'active'},activeOrganization:{id:org},activeAccount:{id:account},
 availableOrganizations:[{id:org}],membership:{status:'active'},
 effectivePermissions:['offers.manage'],accessibleBusinessContexts:[{id:'stem-labs-8f6bb14b'}]
}});
function req(body={confirmation:'activate-approved-stem-product-8'},origin='https://app.example.test'){
 return new Request('https://app.example.test/api/commerce/product-mappings/approved-stem-offer',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
}
test('actual API caller dispatches one atomic RPC with server actor and correlation',async()=>{
 const h=await routeHarness(session());const r=await h.POST(req());assert.equal(r.status,201);assert.equal(h.calls.length,1);
 assert.equal(h.calls[0][0],'rpc/ws021_activate_stem_first_offer');assert.equal(JSON.parse(h.calls[0][1].body).p_actor_id,actor);
});
for(const name of ['unauthenticated','client-read-only','foreign organization','missing context','extra product override','cross origin']){
 test('actual API denies '+name+' before catalog dispatch',async()=>{
 const s=session();let body,origin;
 if(name==='unauthenticated')s.kind='unauthenticated';
 if(name==='client-read-only')s.session.effectivePermissions=['offers.view'];
 if(name==='foreign organization')s.session.activeOrganization.id='other';
 if(name==='missing context')s.session.accessibleBusinessContexts=[];
 if(name==='extra product override')body={confirmation:'activate-approved-stem-product-8',productId:'37'};
 if(name==='cross origin')origin='https://other.example.test';
 const h=await routeHarness(s);const r=await h.POST(req(body,origin));assert.ok([400,403,404].includes(r.status));assert.equal(h.calls.length,0);
 });
}
test('other observed products remain unmapped',async()=>{const d=await db();try{
 await d.exec(`insert into commerce_provider_products(id,organization_id,connection_id,provider_account_id,provider_product_id,title,mapping_status) values('00000000-0000-4000-8000-000000000037','${org}','${conn}','${pa}','37','Eye patches','observed')`);
 await call(d);
 const p=(await d.query("select mapping_status,canonical_offer_id from commerce_provider_products where provider_product_id='37'")).rows[0];
 assert.equal(p.mapping_status,'observed');assert.equal(p.canonical_offer_id,null);
 }finally{await d.close();}});
test('anonymous runtime cannot execute the bounded catalog action',async()=>{const d=await db();try{
 await d.exec('set role anon');await assert.rejects(call(d),e=>e.code==='42501');await d.exec('reset role');
 assert.equal((await d.query('select count(*)::int n from canonical_offers')).rows[0].n,0);
 }finally{await d.close();}});

test('actual API accepts normalized idempotent RPC response without redispatch',async()=>{
 const h=await routeHarness(session(),[{ok:true,offerId:'offer',mappingId:'decision',replayed:true}]);
 const r=await h.POST(req());assert.equal(r.status,200);assert.equal(h.calls.length,1);assert.equal(r.body.replayed,true);
});
for(const result of [[],[{}],[{ok:true,offerId:'offer',mappingId:'decision'},{ok:true,offerId:'other',mappingId:'other'}]]){
 test('actual API rejects malformed or multiple RPC rows without retry',async()=>{
 const h=await routeHarness(session(),result);const r=await h.POST(req());assert.equal(r.status,502);assert.equal(h.calls.length,1);
 });
}
