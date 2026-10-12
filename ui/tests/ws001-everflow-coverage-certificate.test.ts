import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { MemoryCommerceEvidenceStore } from "../lib/commerce/evidence-store";
import { certifyEverflowCoverage } from "../lib/integrations/everflow-coverage-certificate";

const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
test("certificate requires two identical source reads and verified local evidence before any write",async()=>{
 const row:[string,string,string]=["source","a".repeat(64),"b".repeat(64)];
 const capture:any={sourceTotal:1,uniqueIdentities:1,rows:[row],pages:1,query:{},startedAt:"2026-10-12T00:00:00Z",completedAt:"2026-10-12T00:00:01Z",identitySetSha256:hash([row[0]]),normalizedVersionSetSha256:hash([row.slice(0,2)]),rawVersionSetSha256:hash([[row[0],row[2]]])};
 for(const failure of ["none","source_changed","missing","normalized","unreviewed_raw","running"]){
  const writes:any[]=[];let reads=0;
  const comparison:any={sourceIdentitiesMatched:1,missingSourceIdentities:failure==="missing"?["source"]:[],normalizedDifferences:failure==="normalized"?1:0,rawVersionDifferences:1,differences:[{classification:failure==="unreviewed_raw"?"source_field_change_requires_review":"provider_event_count_metadata_drift"}]};
  const dependencies:any={store:new MemoryCommerceEvidenceStore(),capture:async()=>{reads++;return failure==="source_changed"&&reads===2?{...capture,identitySetSha256:"changed"}:capture;},createAudit:async()=>({async onPage(){},result:()=>comparison,protectedSnapshots:()=>[]}),db:async(path:string,init:any)=>{writes.push({path,init});if(path.startsWith("commerce_evidence_records"))return[{id:"evidence"}];return[JSON.parse(init.body).p_certificate];}};
  const input:any={apiKey:"never-return",networkId:"3453",organizationId:"tenant",connectionId:"connection",providerAccountId:"provider",actorUserId:"actor",accountId:"account",correlationId:"correlation",run:{id:"original",status:failure==="running"?"running":"failed",metadata:{from:"2026-10-01 00:00:00",to:"2026-10-11 23:59:59"},records_seen:11600,pages_completed:63}};
  if(failure!=="none"){await assert.rejects(certifyEverflowCoverage(input,dependencies));assert.equal(writes.length,0);continue;}
  const cert=await certifyEverflowCoverage(input,dependencies);assert.equal(reads,2);assert.equal(cert.customerFinancialAcceptance,"not_certified");assert.equal(cert.historicalExecutionStatus,"failed");assert.equal(cert.historicalCountersPreserved,true);assert.equal(input.run.records_seen,11600);
  assert.deepEqual(writes.map(w=>w.path),["commerce_evidence_records?on_conflict=connection_id,provider_account_id,source_object_type,source_object_id,payload_hash","rpc/certify_everflow_source_coverage"]);assert.doesNotMatch(JSON.stringify(cert),/never-return/);
 }
});

test("atomic certificate verifies commitments and tenant evidence, preserves failed diagnostics/counters, and is idempotent",async()=>{
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table commerce_sync_runs(id uuid primary key,organization_id uuid,connection_id uuid,provider_account_id uuid,sync_type text,status text,metadata jsonb,lease_owner text,records_seen int,pages_completed int,last_error_code text);
 create table commerce_provider_connections(id uuid,organization_id uuid,account_id uuid,provider text,status text);
 create table commerce_provider_accounts(id uuid,organization_id uuid,connection_id uuid,status text,provisional bool,external_id text);
 create table commerce_evidence_records(id uuid primary key,organization_id uuid,connection_id uuid,provider_account_id uuid,sync_run_id uuid,source_object_type text,source_object_id text,payload_hash text,deleted_at timestamptz,metadata jsonb);
 create table everflow_conversion_events(source_identity text,conversion_id text,payload_hash text,evidence_id uuid,organization_id uuid,connection_id uuid,provider_account_id uuid,conversion_at timestamptz,network_id text,currency text);
 create table tracekit_audit_events(actor_user_id uuid,account_id uuid,organization_id uuid,action text,target_type text,target_id text,result text,correlation_id text,metadata jsonb);`);
 await db.exec(readFileSync(new URL('../../supabase/migrations/20261012231715_ws001_everflow_source_coverage_certification.sql',import.meta.url),'utf8'));
 const ids=Array.from({length:8},(_,i)=>`00000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`);const [run,org,conn,provider,actor,account,sourceEvidence,certEvidence]=ids;
 const metadata={from:"2026-10-01 00:00:00",to:"2026-10-11 23:59:59",next_page:64,retry_page:42,total_count:22307};const manifest=[["source","a".repeat(64)]];
 await db.query(`insert into commerce_sync_runs values($1,$2,$3,$4,'everflow_conversions_historical','failed',$5,null,11600,63,'original_error')`,[run,org,conn,provider,metadata]);
 await db.query(`insert into commerce_provider_connections values($1,$2,$3,'everflow','connected')`,[conn,org,account]);await db.query(`insert into commerce_provider_accounts values($1,$2,$3,'active',false,'3453')`,[provider,org,conn]);
 await db.query(`insert into commerce_evidence_records values($1,$2,$3,$4,$5,'everflow_conversion','source',$6,null,$7),($8,$2,$3,$4,$5,'everflow_source_coverage_certification',$5::text,$9,null,'{}')`,[sourceEvidence,org,conn,provider,run,"b".repeat(64),{normalizedPayloadHash:"a".repeat(64)},certEvidence,"c".repeat(64)]);
 await db.query(`insert into everflow_conversion_events values('source','source',$1,$2,$3,$4,$5,'2026-10-02T04:00:00Z','3453','USD')`,["a".repeat(64),sourceEvidence,org,conn,provider]);
 const capture={identitySetSha256:hash(["source"]),normalizedVersionSetSha256:hash(manifest),rawVersionSetSha256:"d".repeat(64)};
 const cert={kind:"source_identity_coverage",state:"certified",organizationId:org,connectionId:conn,providerAccountId:provider,actorUserId:actor,importId:run,customerFinancialAcceptance:"not_certified",query:{from:metadata.from,to:metadata.to,timezoneId:80,currencyId:"USD",networkId:"3453",showConversions:true,showEvents:true,filters:[],searchTerms:[]},sourceTotal:1,...capture,captures:[capture,capture],artifact:{payloadHash:"c".repeat(64)}};
 const call=(certificate:any=cert,sourceManifest:any=manifest)=>db.query(`select certify_everflow_source_coverage($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) certificate`,[run,org,conn,provider,actor,account,"correlation",metadata,certificate,sourceManifest,certEvidence]);
 await assert.rejects(call({...cert,identitySetSha256:"0".repeat(64)}),/commitment invalid/);
 await db.query(`update commerce_evidence_records set organization_id=$1 where id=$2`,[actor,sourceEvidence]);await assert.rejects(call(),/coverage changed or incomplete/);await db.query(`update commerce_evidence_records set organization_id=$1 where id=$2`,[org,sourceEvidence]);
 await call();await call();
 const result:any=(await db.query(`select * from commerce_sync_runs`)).rows[0];assert.equal(result.status,"failed");assert.equal(result.records_seen,11600);assert.equal(result.pages_completed,63);assert.equal(result.last_error_code,"original_error");assert.equal(result.metadata.next_page,64);assert.equal(result.metadata.retry_page,42);assert.equal(result.metadata.source_coverage_certification.state,"certified");assert.equal((await db.query(`select * from tracekit_audit_events`)).rows.length,1);
 const privileges:any=(await db.query(`select has_function_privilege('anon','certify_everflow_source_coverage(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,jsonb,uuid)','execute') anon,has_function_privilege('authenticated','certify_everflow_source_coverage(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,jsonb,uuid)','execute') authenticated`)).rows[0];assert.equal(privileges.anon,false);assert.equal(privileges.authenticated,false);await db.close();
});
