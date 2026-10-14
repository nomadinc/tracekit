import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.WS001_PGLITE_MODULE||'@electric-sql/pglite');
const root=new URL('../../docs/operations/prepared/',import.meta.url);
const linkSql=await readFile(new URL('commas-dispute-order-link.sql',root),'utf8');
const readSql=await readFile(new URL('commas-customer-dispute-read.sql',root),'utf8');
const org='00000000-0000-0000-0000-000000000001',person='00000000-0000-0000-0000-000000000002',connection='00000000-0000-0000-0000-000000000003',account='00000000-0000-0000-0000-000000000004',order='00000000-0000-0000-0000-000000000005',dispute='00000000-0000-0000-0000-000000000006';
const other='00000000-0000-0000-0000-000000000099';
async function fixture(fn){const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table people(id uuid,organization_id uuid,workspace_id text,status text);
 create table commerce_provider_disputes(id uuid,organization_id uuid,connection_id uuid,provider_account_id uuid,provider_dispute_id text,matched_canonical_order_id uuid,reconciliation_state text,status text,amount numeric,fee numeric,currency text,currency_source text,fee_currency text,fee_currency_source text);
 create table commerce_dispute_webhook_events(id uuid);
 create table commerce_source_mappings(id uuid);
 create table platform_orders(canonical_order_id uuid,organization_id uuid,connection_id uuid,provider_account_id uuid,workspace_id text,person_id uuid,tkid text);
 create view tracekit_customer_order_read_model as select *,person_id resolved_person_id from platform_orders;
 `);
 await db.exec(linkSql);await db.exec(readSql);
 await db.query("insert into people values($1,$2,$3,'active')",[person,org,org]);
 await db.query("insert into platform_orders values($1,$2,$3,$4,$5,$6,null)",[order,org,connection,account,org,person]);
 await db.query("insert into commerce_provider_disputes values($1,$2,$3,$4,'d',$5,'matched','won',49,15,'USD',null,'EUR','provider_payload.fee_currency')",[dispute,org,connection,account,order]);
 await db.query("insert into ws001_dispute_preparation.identity_audit(organization_id,connection_id,provider_account_id,dispute_id,provider_dispute_id,event_id,evidence_id,payload_hash,canonical_order_id,previous_reconciliation_state,verifier_version) values($1,$2,$3,$4,'d',$4,$4,repeat('a',64),$5,'unmatched','fixture')",[org,connection,account,dispute,order]);
 await fn(db);
 }finally{await db.close();}}
const read=async db=>(await db.query('select read_commas_customer_disputes_prepared($1,$2) result',[org,person])).rows[0].result;
test('database read preserves independent unknown currency and excludes contact and wallet data',()=>fixture(async db=>{
 const result=await read(db);assert.equal(result.rows.length,1);assert.equal(result.rows[0].principalCurrency,null);assert.equal(result.rows[0].feeCurrency,'EUR');assert.equal(result.rows[0].trackingIdentityAvailable,false);
 assert.deepEqual(Object.keys(result.rows[0]).sort(),['canonicalOrderId','feeAmount','feeCurrency','id','principalAmount','principalCurrency','providerDisputeId','status','trackingIdentityAvailable'].sort());
}));
test('database read requires matching identity audit and all order scope dimensions',()=>fixture(async db=>{
 for(const field of ['organization_id','connection_id','provider_account_id']){
  const original={organization_id:org,connection_id:connection,provider_account_id:account}[field];
  await db.query(`update platform_orders set ${field}=$1`,[other]);assert.equal((await read(db)).rows.length,0);
  await db.query(`update platform_orders set ${field}=$1`,[original]);
 }
 await db.exec("update commerce_provider_disputes set reconciliation_state='review'");assert.equal((await read(db)).rows.length,0);
 await db.exec("update commerce_provider_disputes set reconciliation_state='matched',provider_dispute_id='unverified'");assert.equal((await read(db)).rows.length,0);
}));
test('foreign person denial and bounded keyset pagination are enforced by the database',()=>fixture(async db=>{
 await assert.rejects(db.query('select read_commas_customer_disputes_prepared($1,$2)',[org,other]),/customer_not_found/);
 await assert.rejects(db.query('select read_commas_customer_disputes_prepared($1,$2,null,101)',[org,person]),/scope_invalid/);
 assert.equal((await db.query('select read_commas_customer_disputes_prepared($1,$2,$3,1) result',[org,person,dispute])).rows[0].result.rows.length,0);
 for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("select has_function_privilege($1,'read_commas_customer_disputes_prepared(uuid,uuid,uuid,integer)','execute') allowed",[role])).rows[0].allowed,false);
}));
