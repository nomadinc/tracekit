import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {validateRetainedCoverageProof,WS001_RETAINED_COVERAGE_PROOF,certifyRetainedEverflowCoverage} from "../lib/integrations/everflow-retained-coverage-proof";
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const bytesHash=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");

test("retained proof validates exact commitments, tenant, unchanged execution, reporting scope and original capture times",async()=>{
 const known=WS001_RETAINED_COVERAGE_PROOF,now=Date.parse('2026-10-13T00:10:00Z');
 const input:any={...known,run:{id:known.runId,status:'failed',lease_owner:null,metadata:{from:'2026-10-01 00:00:00',to:'2026-10-11 23:59:59'},records_seen:11600,pages_completed:63},actorUserId:'actor',accountId:'account',correlationId:'correlation'};
 const rows=[['conversion',hash('normalized'),hash('raw')]];
 const commitments={identitySetSha256:hash(rows.map(x=>x[0])),normalizedVersionSetSha256:hash(rows.map(x=>x.slice(0,2))),rawVersionSetSha256:hash(rows.map(x=>[x[0],x[2]]))};
 const captures=[{startedAt:'2026-10-12T23:37:00Z',completedAt:'2026-10-12T23:38:00Z'},{startedAt:'2026-10-12T23:38:01Z',completedAt:'2026-10-12T23:39:00Z'}].map(x=>({...x,...commitments,sourceTotal:1,pages:1}));
 const proof={certificate:{...known,...commitments,importId:known.runId,version:1,kind:'source_identity_coverage',state:'certified',actorUserId:'actor',verifierVersion:'ws001-source-coverage-v1',normalizerVersion:'everflow-conversion-v1',customerFinancialAcceptance:'not_certified',historicalExecutionStatus:'failed',historicalCountersPreserved:true,query:{networkId:'3453',timezoneId:80,currencyId:'USD',...input.run.metadata,showConversions:true,showEvents:true,filters:[],searchTerms:[]},sourceTotal:1,captures,certifiedAt:'2026-10-12T23:39:01Z'},sourceRows:rows,originalExecution:input.run,comparison:{sourceIdentitiesMatched:1,normalizedDifferences:0,missingSourceIdentities:[],rawVersionDifferences:1,differences:[{classification:'provider_event_count_metadata_drift'}]}};
 const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));const bytes=encode(proof);
 assert.equal(validateRetainedCoverageProof(bytes,input,bytesHash(bytes),now).certificate.sourceTotal,1);
 assert.throws(()=>validateRetainedCoverageProof(bytes,input,'0'.repeat(64),now));
 const changes=[(p:any)=>p.certificate.organizationId='other',(p:any)=>p.certificate.identitySetSha256='forged',(p:any)=>p.sourceRows.push([...p.sourceRows[0]]),(p:any)=>p.certificate.captures[1].rawVersionSetSha256='forged',(p:any)=>p.certificate.captures[0].completedAt='2026-10-13T00:20:00Z',(p:any)=>p.certificate.captures[0].completedAt='2026-10-12T23:38:02Z',(p:any)=>p.originalExecution.pages_completed=64,(p:any)=>p.certificate.query.timezoneId=79,(p:any)=>p.comparison.differences[0].classification='source_field_change_requires_review'];
 for(const change of changes){const p=structuredClone(proof);change(p);const b=encode(p);assert.throws(()=>validateRetainedCoverageProof(b,input,bytesHash(b),now));}
 assert.throws(()=>validateRetainedCoverageProof(bytes,input,bytesHash(bytes),now+24*60*60*1000));
 let reads=0,writes=0;
 await assert.rejects(certifyRetainedEverflowCoverage({...input,organizationId:'other'},{db:async()=>{writes++;return[]},store:{async getAuthorized(){reads++;return bytes}} as any,now:()=>now}));assert.equal(reads,0);assert.equal(writes,0);
 await assert.rejects(certifyRetainedEverflowCoverage(input,{db:async()=>{writes++;return[]},store:{async getAuthorized(){reads++;return bytes}} as any,now:()=>now}));assert.equal(reads,1);assert.equal(writes,0);
});
