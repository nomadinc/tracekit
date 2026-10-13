import "server-only";
import { randomUUID } from "node:crypto";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";
import { SupabaseCommerceEvidenceStore } from "@/lib/commerce/supabase-evidence-store-core";
import type { CommerceEvidenceStore, StoredEvidence } from "@/lib/commerce/evidence-store";
import { captureEverflowSourceInventory, EverflowInventoryError } from "./everflow-source-inventory";
import { createEverflowRawVersionAudit } from "./everflow-raw-version-audit";

export async function certifyEverflowCoverage(input: {
  apiKey:string;networkId:string;organizationId:string;connectionId:string;providerAccountId:string;
  actorUserId:string;accountId:string;correlationId:string;run:Record<string,any>;
}, dependencies: {capture?:typeof captureEverflowSourceInventory;createAudit?:typeof createEverflowRawVersionAudit;db?:typeof commercePersistenceRequest;store?:CommerceEvidenceStore}={}) {
  const capture=dependencies.capture||captureEverflowSourceInventory;
  const db=dependencies.db||commercePersistenceRequest;
  const store=dependencies.store||new SupabaseCommerceEvidenceStore();
  if(input.run.status!=="failed"||input.run.lease_owner) throw new EverflowInventoryError("everflow_certification_request_not_eligible");
  if(input.run.metadata?.source_coverage_certification) return input.run.metadata.source_coverage_certification;
  const audit=await (dependencies.createAudit||createEverflowRawVersionAudit)(input,db);
  const args={apiKey:input.apiKey,networkId:input.networkId,from:String(input.run.metadata?.from||""),to:String(input.run.metadata?.to||""),timezoneId:80,currencyId:"USD"};
  const first=await capture({...args,onPage:audit.onPage});
  const second=await capture(args);
  if(second.uniqueIdentities<1||first.sourceTotal!==second.sourceTotal||first.identitySetSha256!==second.identitySetSha256||first.normalizedVersionSetSha256!==second.normalizedVersionSetSha256||first.rawVersionSetSha256!==second.rawVersionSetSha256||JSON.stringify(first.rows)!==JSON.stringify(second.rows)) throw new EverflowInventoryError("everflow_certification_source_changed");
  const comparison=audit.result();
  if(comparison.missingSourceIdentities.length||comparison.normalizedDifferences||comparison.sourceIdentitiesMatched!==second.uniqueIdentities||comparison.differences.some(row=>!["serialization_only","provider_event_count_metadata_drift"].includes(row.classification))) throw new EverflowInventoryError("everflow_certification_evidence_requires_review");
  const summarize=(value:typeof first)=>({startedAt:value.startedAt,completedAt:value.completedAt,pages:value.pages,sourceTotal:value.sourceTotal,identitySetSha256:value.identitySetSha256,normalizedVersionSetSha256:value.normalizedVersionSetSha256,rawVersionSetSha256:value.rawVersionSetSha256});
  const base={version:1,kind:"source_identity_coverage",state:"certified",certifiedAt:new Date().toISOString(),actorUserId:input.actorUserId,importId:input.run.id,organizationId:input.organizationId,connectionId:input.connectionId,providerAccountId:input.providerAccountId,query:second.query,sourceTotal:second.uniqueIdentities,identitySetSha256:second.identitySetSha256,normalizedVersionSetSha256:second.normalizedVersionSetSha256,rawVersionSetSha256:second.rawVersionSetSha256,captures:[summarize(first),summarize(second)],rawVersionDifferences:comparison.rawVersionDifferences,rawVersionClassification:"only_serialization_or_provider_event_count_metadata_drift",historicalExecutionStatus:input.run.status,historicalCountersPreserved:true,customerFinancialAcceptance:"not_certified",verifierVersion:"ws001-source-coverage-v1",normalizerVersion:"everflow-conversion-v1"};
  // The protected artifact retains current raw variants; existing event/evidence relationships stay intact.
  const artifactBytes=new TextEncoder().encode(JSON.stringify({certificate:base,sourceRows:second.rows,comparison,rawVersionSnapshots:audit.protectedSnapshots(),originalExecution:input.run}));
  const stored=await store.putImmutable({organizationId:input.organizationId,connectionId:input.connectionId,providerAccountId:input.providerAccountId,sourceObjectType:"everflow_source_coverage_certification",payload:artifactBytes,contentType:"application/json"});
  if(!await store.verifyHash({organizationId:input.organizationId,storageReference:stored.storageReference,payloadHash:stored.payloadHash})) throw new EverflowInventoryError("everflow_certification_artifact_unverified");
  return commitCoverageProof(input,base,stored,second.rows.map(row=>[row[0],row[1]]),db);
}

export async function commitCoverageProof(input:Parameters<typeof certifyEverflowCoverage>[0],base:Record<string,any>,stored:StoredEvidence,manifest:Array<[string,string]>,db:typeof commercePersistenceRequest) {
  const evidenceId=randomUUID();
  const evidence=await db("commerce_evidence_records?on_conflict=connection_id,provider_account_id,source_object_type,source_object_id,payload_hash",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=representation"},body:JSON.stringify({id:evidenceId,organization_id:input.organizationId,connection_id:input.connectionId,provider_account_id:input.providerAccountId,sync_run_id:input.run.id,source_object_type:"everflow_source_coverage_certification",source_object_id:input.run.id,payload_hash:stored.payloadHash,storage_backend:"object_storage",storage_reference:stored.storageReference,content_type:stored.contentType,byte_size:stored.byteSize,observed_at:base.certifiedAt,normalizer_version:"manifest-v1",mapping_version:"ws001-source-coverage-v1",pii_classification:"sensitive",retention_policy:"commerce-provider-raw-v1",metadata:{immutable:true,sourceCoverageOnly:true}})});
  if(evidence.length!==1)throw new EverflowInventoryError("everflow_certification_artifact_record_unverified");
  const certificate={...base,artifact:{evidenceId:String(evidence[0].id),payloadHash:stored.payloadHash,storageReference:stored.storageReference}};
  const result=await db("rpc/certify_everflow_source_coverage",{method:"POST",body:JSON.stringify({p_run_id:input.run.id,p_organization_id:input.organizationId,p_connection_id:input.connectionId,p_provider_account_id:input.providerAccountId,p_actor_user_id:input.actorUserId,p_account_id:input.accountId,p_correlation_id:input.correlationId,p_expected_metadata:input.run.metadata,p_certificate:certificate,p_manifest:manifest,p_evidence_id:String(evidence[0].id)})});
  if(!result[0]||result[0].state!=="certified")throw new EverflowInventoryError("everflow_certification_not_committed");
  return result[0];
}
