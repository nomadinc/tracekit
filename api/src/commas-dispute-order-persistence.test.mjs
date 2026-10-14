import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
// Disposable test dependency only; no production dependency or connection.
const {PGlite}=await import(process.env.WS001_PGLITE_MODULE || '@electric-sql/pglite');
const sql=await readFile(new URL('../../docs/operations/prepared/commas-dispute-order-link.sql',import.meta.url),'utf8');
const org='00000000-0000-0000-0000-000000000001',connection='00000000-0000-0000-0000-000000000002',account='00000000-0000-0000-0000-000000000003';
const order='00000000-0000-0000-0000-000000000004',event='00000000-0000-0000-0000-000000000005',evidence='00000000-0000-0000-0000-000000000006',dispute='00000000-0000-0000-0000-000000000007';
const other='00000000-0000-0000-0000-000000000099',hash='a'.repeat(64);
async function fixture(){
 const db=new PGlite();
 await db.exec(`
 create role anon; create role authenticated; create role service_role;
 create table commerce_provider_disputes(id uuid primary key,organization_id uuid,connection_id uuid,provider_account_id uuid,provider_dispute_id text,matched_canonical_order_id uuid,reconciliation_state text,status text,amount numeric,fee numeric,currency text,fee_currency text,updated_at timestamptz,latest_event_id uuid,latest_evidence_id uuid,refund_relationships jsonb);
 create table commerce_dispute_webhook_events(id uuid primary key,organization_id uuid,connection_id uuid,provider_account_id uuid,provider_dispute_id text,event_type text,evidence_id uuid,payload_hash text,provider_event_id text,provider_updated_at timestamptz);
 create table commerce_evidence_records(id uuid primary key,organization_id uuid,connection_id uuid,provider_account_id uuid,payload_hash text,source_object_type text,source_object_id text,pii_classification text,deleted_at timestamptz);
 create table commerce_source_mappings(id uuid primary key,organization_id uuid,connection_id uuid,provider_account_id uuid,source_object_type text,source_object_id text,canonical_object_type text,canonical_object_id uuid,state text,unique(connection_id,provider_account_id,source_object_type,source_object_id));
 create table platform_orders(organization_id uuid,connection_id uuid,provider_account_id uuid,canonical_order_id uuid,person_id uuid,tkid text);
 `);
 await db.exec(sql);
 await db.query(`insert into commerce_provider_disputes values($1,$2,$3,$4,'dispute',null,'unmatched','won',49,15,null,'EUR','2026-10-14',$5,$6,'["refund"]')`,[dispute,org,connection,account,event,evidence]);
 await db.query(`insert into commerce_dispute_webhook_events values($1,$2,$3,$4,'dispute','dispute.updated',$5,$6,'event','2026-10-12')`,[event,org,connection,account,evidence,hash]);
 await db.query(`insert into commerce_evidence_records values($1,$2,$3,$4,$5,'commas_dispute_webhook','event','restricted',null)`,[evidence,org,connection,account,hash]);
 await db.query(`insert into ws001_dispute_preparation.verified_identity(event_id,evidence_id,payload_hash,numeric_transaction_id,public_order_id,verifier_version) values($1,$2,$3,'42','ORD-ABC','fixture-v1')`,[event,evidence,hash]);
 await db.query(`insert into commerce_source_mappings values(gen_random_uuid(),$1,$2,$3,'transaction','42','order',$4,'active'),(gen_random_uuid(),$1,$2,$3,'commas_public_transaction','ORD-ABC','order',$4,'active')`,[org,connection,account,order]);
 await db.query(`insert into platform_orders values($1,$2,$3,$4,null,null)`,[org,connection,account,order]);
 return db;
}
async function run(db,scope=[org,connection,account],id=event){return (await db.query('select ws001_dispute_preparation.link_order($1,$2,$3,$4,$5) result',[...scope,'dispute',id])).rows[0].result;}
async function withDb(fn){const db=await fixture();try{await fn(db);}finally{await db.close();}}
test('atomic identity link preserves terminal lifecycle financials and refund relationships',()=>withDb(async db=>{
 const before=(await db.query('select * from commerce_provider_disputes')).rows[0];
 assert.equal(await run(db),'linked');
 const after=(await db.query('select * from commerce_provider_disputes')).rows[0];
 assert.deepEqual(after,{...before,matched_canonical_order_id:order,reconciliation_state:'matched'});
 assert.equal((await db.query('select count(*)::int n from ws001_dispute_preparation.identity_audit')).rows[0].n,1);
 assert.equal(await run(db),'noop');
 assert.equal((await db.query('select count(*)::int n from ws001_dispute_preparation.identity_audit')).rows[0].n,1);
}));
test('all scope dimensions fail closed',()=>withDb(async db=>{
 for(let i=0;i<3;i++){const scope=[org,connection,account];scope[i]=other;assert.equal(await run(db,scope),'hold:dispute_missing');}
}));
test('event dispute identity conflict holds',()=>withDb(async db=>{
 await db.exec("update commerce_dispute_webhook_events set provider_dispute_id='another'");
 assert.equal(await run(db),'hold:event_scope_conflict');
}));
test('missing verified bytes attestation holds',()=>withDb(async db=>{
 await db.exec('truncate ws001_dispute_preparation.verified_identity');
 assert.equal(await run(db),'hold:verified_evidence_required');
}));
test('retained hash conflict and deleted evidence hold',()=>withDb(async db=>{
 await db.exec("update commerce_evidence_records set payload_hash=repeat('b',64)");
 assert.equal(await run(db),'hold:evidence_scope_conflict');
 await db.query('update commerce_evidence_records set payload_hash=$1,deleted_at=now()',[hash]);
 assert.equal(await run(db),'hold:evidence_scope_conflict');
}));
test('a supplied but unresolved second identifier prevents linking',()=>withDb(async db=>{
 await db.exec("delete from commerce_source_mappings where source_object_type='commas_public_transaction'");
 assert.equal(await run(db),'hold:public_mapping_unavailable');
}));
test('dual identifier disagreement holds',()=>withDb(async db=>{
 await db.query("update commerce_source_mappings set canonical_object_id=$1 where source_object_type='commas_public_transaction'",[other]);
 assert.equal(await run(db),'hold:identifiers_disagree');
}));
test('review and non-order mappings cannot qualify',()=>withDb(async db=>{
 await db.exec("update commerce_source_mappings set state='review_required' where source_object_type='transaction'");
 assert.equal(await run(db),'hold:numeric_mapping_unavailable');
 await db.exec("update commerce_source_mappings set state='active',canonical_object_type='person' where source_object_type='transaction'");
 assert.equal(await run(db),'hold:numeric_mapping_unavailable');
}));
test('linked order must belong to the same complete scope',()=>withDb(async db=>{
 await db.query('update platform_orders set provider_account_id=$1',[other]);
 assert.equal(await run(db),'hold:order_scope_conflict');
}));
test('existing order relationship cannot be repointed',()=>withDb(async db=>{
 await db.query('update commerce_provider_disputes set matched_canonical_order_id=$1',[other]);
 assert.equal(await run(db),'hold:existing_link_conflict');
}));
test('audit failure rolls back the identity mutation',()=>withDb(async db=>{
 await db.exec(`create function reject_audit() returns trigger language plpgsql as $$begin raise exception 'audit unavailable';end$$;
 create trigger reject_audit before insert on ws001_dispute_preparation.identity_audit for each row execute function reject_audit();`);
 await assert.rejects(run(db),/audit unavailable/);
 assert.equal((await db.query('select matched_canonical_order_id from commerce_provider_disputes')).rows[0].matched_canonical_order_id,null);
}));
test('audit is immutable and prepared functions have no public client grants',()=>withDb(async db=>{
 await run(db);
 await assert.rejects(db.exec('delete from ws001_dispute_preparation.identity_audit'),/immutable/);
 await assert.rejects(db.exec('truncate ws001_dispute_preparation.identity_audit'),/immutable/);
 for(const role of ['anon','authenticated','service_role']){
  const row=(await db.query("select has_function_privilege($1,'ws001_dispute_preparation.link_order(uuid,uuid,uuid,text,uuid)','execute') allowed",[role])).rows[0];
  assert.equal(row.allowed,false);
  for(const table of ['verified_identity','identity_audit']){
   assert.equal((await db.query('select has_table_privilege($1,$2,\'SELECT,INSERT,UPDATE,DELETE,TRUNCATE\') allowed',[role,`ws001_dispute_preparation.${table}`])).rows[0].allowed,false);
  }
 }
}));
test('single numeric or ORD identifier can link independently',()=>withDb(async db=>{
 // Owner-only fixture reset; verified enrollment has no runtime grants.
 await db.exec('truncate ws001_dispute_preparation.verified_identity');
 await db.query("insert into ws001_dispute_preparation.verified_identity(event_id,evidence_id,payload_hash,numeric_transaction_id,verifier_version) values($1,$2,$3,'42','fixture-v1')",[event,evidence,hash]);
 assert.equal(await run(db),'linked');
}));
test('single ORD identifier can link without a numeric mapping',()=>withDb(async db=>{
 await db.exec('truncate ws001_dispute_preparation.verified_identity');
 await db.query("insert into ws001_dispute_preparation.verified_identity(event_id,evidence_id,payload_hash,public_order_id,verifier_version) values($1,$2,$3,'ORD-ABC','fixture-v1')",[event,evidence,hash]);
 await db.exec("delete from commerce_source_mappings where source_object_type='transaction'");
 assert.equal(await run(db),'linked');
}));
test('payment intent cannot qualify as a transaction identifier',()=>withDb(async db=>{
 await db.exec('truncate ws001_dispute_preparation.verified_identity');
 await db.query("insert into ws001_dispute_preparation.verified_identity(event_id,evidence_id,payload_hash,numeric_transaction_id,verifier_version) values($1,$2,$3,'pi_42','fixture-v1')",[event,evidence,hash]);
 assert.equal(await run(db),'hold:malformed_identity');
}));
