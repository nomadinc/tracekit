import "server-only";
import {createHash} from "node:crypto";
import {isDeepStrictEqual} from "node:util";
import {commercePersistenceRequest} from "@/lib/commerce/supabase-control-repository";
import {SupabaseCommerceEvidenceStore} from "@/lib/commerce/supabase-evidence-store-core";
import type {CommerceEvidenceStore} from "@/lib/commerce/evidence-store";
import {EverflowInventoryError} from "./everflow-source-inventory";
import {commitCoverageProof,certifyEverflowCoverage} from "./everflow-coverage-certificate";

// Exact immutable proof produced by the authorized WS-001 verifier before registration failed.
export const WS001_RETAINED_COVERAGE_PROOF={runId:"c4ab5bbd-2455-4bbd-adc0-f39b08427e21",organizationId:"c98d44be-5f7f-41a2-a9d3-ae67a811a872",connectionId:"3532796e-8091-4f54-bf18-4ccd96ccea07",providerAccountId:"30ad7f42-9230-45d0-bba4-aa1b176094c2",networkId:"3453",payloadHash:"fb79740ee70dc8436cee67194193ad4fd32e1a62a4f5d731763d0962fd0f068e"} as const;
const stop=()=>{throw new EverflowInventoryError("everflow_retained_coverage_proof_unverified");};
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Registers existing proof only: zero provider requests, zero source-event writes. */
export async function certifyRetainedEverflowCoverage(input:Omit<Parameters<typeof certifyEverflowCoverage>[0],"apiKey">,dependencies:{db?:typeof commercePersistenceRequest;store?:CommerceEvidenceStore;now?:()=>number}={}) {
 const known=WS001_RETAINED_COVERAGE_PROOF;
 if(input.run.id!==known.runId||input.organizationId!==known.organizationId||input.connectionId!==known.connectionId||input.providerAccountId!==known.providerAccountId||input.networkId!==known.networkId||input.run.status!=="failed"||input.run.lease_owner)stop();
 if(input.run.metadata?.source_coverage_certification)return input.run.metadata.source_coverage_certification;
 const store=dependencies.store||new SupabaseCommerceEvidenceStore(),db=dependencies.db||commercePersistenceRequest,now=(dependencies.now||Date.now)();
 const storageReference=`commerce-evidence/${known.organizationId}/${known.connectionId}/${known.providerAccountId}/everflow_source_coverage_certification/${known.payloadHash}`;
 const bytes=await store.getAuthorized({organizationId:known.organizationId,storageReference});
 const verified=validateRetainedCoverageProof(bytes||new Uint8Array(),input,known.payloadHash,now),base=verified.certificate;
 const certificate={...base,certifiedAt:new Date(now).toISOString(),sourceObservedAt:base.captures[1].completedAt,certificationMethod:"retained_complete_source_captures",retainedProofCreatedAt:base.certifiedAt,providerRequestsDuringRegistration:0};
 return commitCoverageProof({...input,apiKey:""},certificate,{storageBackend:"protected_object_storage",storageReference,contentType:"application/json",byteSize:bytes!.byteLength,payloadHash:known.payloadHash},verified.manifest,db);
}

export function validateRetainedCoverageProof(bytes:Uint8Array,input:Omit<Parameters<typeof certifyEverflowCoverage>[0],"apiKey">,expectedPayloadHash:string,now:number) {
 const known=WS001_RETAINED_COVERAGE_PROOF;
 if(bytes.byteLength>10*1024*1024||createHash("sha256").update(bytes).digest("hex")!==expectedPayloadHash)stop();
 let proof:any;try{proof=JSON.parse(new TextDecoder().decode(bytes));}catch{stop();}
 const base=proof.certificate,rows=proof.sourceRows,comparison=proof.comparison;
 if(!base||base.kind!=="source_identity_coverage"||base.version!==1||base.state!=="certified"||base.importId!==known.runId||base.organizationId!==known.organizationId||base.connectionId!==known.connectionId||base.providerAccountId!==known.providerAccountId||base.actorUserId!==input.actorUserId||base.verifierVersion!=="ws001-source-coverage-v1"||base.normalizerVersion!=="everflow-conversion-v1"||base.customerFinancialAcceptance!=="not_certified"||base.historicalExecutionStatus!=="failed"||base.historicalCountersPreserved!==true||!isDeepStrictEqual(proof.originalExecution,input.run))stop();
 if(base.query?.networkId!==known.networkId||base.query?.timezoneId!==80||base.query?.currencyId!=="USD"||base.query?.from!==input.run.metadata?.from||base.query?.to!==input.run.metadata?.to||base.query?.showConversions!==true||base.query?.showEvents!==true||!isDeepStrictEqual(base.query?.filters,[])||!isDeepStrictEqual(base.query?.searchTerms,[]))stop();
 if(!Array.isArray(rows)||rows.length<1||rows.length>25000||rows.length!==base.sourceTotal||rows.some(row=>!Array.isArray(row)||row.length!==3||!/^[a-zA-Z0-9_-]{1,160}$/.test(row[0])||row.slice(1).some((value:unknown)=>typeof value!=="string"||!/^[a-f0-9]{64}$/.test(value)))||new Set(rows.map(row=>row[0])).size!==rows.length)stop();
 const sorted=[...rows].sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
 const commitments={identitySetSha256:hash(sorted.map(row=>row[0])),normalizedVersionSetSha256:hash(sorted.map(row=>row.slice(0,2))),rawVersionSetSha256:hash(sorted.map(row=>[row[0],row[2]]))};
 if(!Array.isArray(base.captures)||base.captures.length!==2)stop();
 for(const capture of base.captures){
  if(capture.sourceTotal!==rows.length||capture.pages!==Math.ceil(rows.length/1000)||Object.entries(commitments).some(([key,value])=>base[key]!==value||capture[key]!==value))stop();
  const start=Date.parse(capture.startedAt),end=Date.parse(capture.completedAt);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start>end||end>now||now-end>24*60*60*1000)stop();
 }
 if(Date.parse(base.captures[0].completedAt)>Date.parse(base.captures[1].startedAt)||!comparison||comparison.sourceIdentitiesMatched!==rows.length||comparison.normalizedDifferences!==0||!isDeepStrictEqual(comparison.missingSourceIdentities,[])||!Array.isArray(comparison.differences)||comparison.differences.length!==comparison.rawVersionDifferences||comparison.differences.some((row:any)=>!["serialization_only","provider_event_count_metadata_drift"].includes(row.classification)))stop();
 return {certificate:base,manifest:sorted.map((row:any)=>[row[0],row[1]] as [string,string])};
}
