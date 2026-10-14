// Native PostgreSQL only. Never substitutes PGlite or silently skips.
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';
import {setup,org,connection,account,order,event,dispute,other} from './commas-concurrency-fixture.mjs';
const url=process.env.WS001_CONCURRENCY_DB_URL;
if(!url||process.env.WS001_CONCURRENCY_DISPOSABLE!=='1')throw new Error('local disposable PostgreSQL URL and attestation required');
const parsed=new URL(url);
if(!['postgres:','postgresql:'].includes(parsed.protocol)||!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))throw new Error('local disposable PostgreSQL required');
const {Client}=await import(process.env.WS001_PG_MODULE||'pg');
const connect=async connectionString=>{const c=new Client({connectionString,connectionTimeoutMillis:5000});await c.connect();return c;};
const admin=await connect(url),name=`ws001_dispute_${randomUUID().replaceAll('-','')}`;
const linkSql=await readFile(new URL('../docs/operations/prepared/commas-dispute-order-link.sql',import.meta.url),'utf8');
let a,b;let created=false;
try{
 await admin.query(`create database ${name}`);created=true;
 parsed.pathname=`/${name}`;a=await connect(parsed.href);b=await connect(parsed.href);
 await admin.query("do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role;end if;end$$");
 const db={exec:s=>a.query(s),query:(s,p)=>a.query(s,p)};await setup(db,linkSql);
 await b.query("set lock_timeout='5s'; set statement_timeout='10s'");
 const call=(c,eventId=event)=>c.query('select ws001_dispute_preparation.link_order($1,$2,$3,$4,$5) result',[org,connection,account,'dispute',eventId]);
 const blocked=async()=>{
  const until=Date.now()+3000;
  while(Date.now()<until){const r=await admin.query("select wait_event_type from pg_stat_activity where pid=$1",[b.processID]);if(r.rows[0]?.wait_event_type==='Lock')return;await new Promise(r=>setTimeout(r,25));}
  throw new Error('second PostgreSQL session did not demonstrably block');
 };
 await a.query('begin');assert.equal((await call(a)).rows[0].result,'linked');
 const duplicate=call(b);await blocked();await a.query('commit');assert.equal((await duplicate).rows[0].result,'noop');
 assert.equal((await a.query('select count(*)::int n from ws001_dispute_preparation.identity_audit')).rows[0].n,1);
 console.log('PASS: concurrent duplicate waits and produces one audited link');
 const event2=randomUUID(),evidence2=randomUUID();
 await a.query("insert into commerce_evidence_records select $1,organization_id,connection_id,provider_account_id,payload_hash,source_object_type,'event2',pii_classification,deleted_at from commerce_evidence_records limit 1",[evidence2]);
 await a.query("insert into commerce_dispute_webhook_events select $1,organization_id,connection_id,provider_account_id,provider_dispute_id,event_type,$2,payload_hash,'event2',provider_updated_at from commerce_dispute_webhook_events limit 1",[event2,evidence2]);
 await a.query("insert into ws001_dispute_preparation.verified_identity(event_id,evidence_id,payload_hash,numeric_transaction_id,public_order_id,verifier_version) select $1,$2,payload_hash,numeric_transaction_id,public_order_id,verifier_version from ws001_dispute_preparation.verified_identity limit 1",[event2,evidence2]);
 await a.query("update commerce_provider_disputes set reconciliation_state='review',status='under_review'");
 await a.query('begin');assert.equal((await call(a,event2)).rows[0].result,'linked');
 const lifecycle=b.query("update commerce_provider_disputes set status='won' where id=$1 and latest_event_id=$2 returning matched_canonical_order_id",[dispute,event]);
 await blocked();await a.query('commit');assert.equal((await lifecycle).rows[0].matched_canonical_order_id,order);
 console.log('PASS: concurrent lifecycle update preserves identity and its CAS authority');
 await a.query('begin');await call(a);
 const mapping=b.query("update commerce_source_mappings set canonical_object_id=$1 where source_object_type='transaction'",[other]);
 await blocked();await a.query('rollback');await mapping;
 assert.equal((await call(a)).rows[0].result,'hold:identifiers_disagree');
 console.log('PASS: mapping replacement waits and fresh disagreement holds');
}finally{
 if(a){await a.query('rollback').catch(()=>{});await a.end();}if(b)await b.end();
 if(created)await admin.query(`drop database ${name}`);await admin.end();
}
