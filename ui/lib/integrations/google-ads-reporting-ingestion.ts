import "server-only";
import { createHash } from "node:crypto";
import { runGoogleAdsReportingProof } from "./google-ads-reporting-proof";
import { marketingPersistenceRequest } from "./marketing-provider-repository";

type Row=Record<string,unknown>;
function stablePayload(row:{date:string;campaignId:string;campaignName:string;campaignStatus:string;impressions:number;clicks:number;costMicros:number;conversions:number;conversionValue:number}){
 return {date:row.date,campaignId:row.campaignId,campaignName:row.campaignName,campaignStatus:row.campaignStatus,impressions:row.impressions,clicks:row.clicks,costMicros:row.costMicros,conversions:row.conversions,conversionValue:row.conversionValue};
}
function hash(payload:unknown){return createHash("sha256").update(JSON.stringify(payload)).digest("hex")}
export async function ingestGoogleAdsReportingBounded(input:{organizationId:string;connectionId:string;days?:number}){
 const days=Math.min(7,Math.max(1,input.days||7));
 const selected=await marketingPersistenceRequest(`marketing_provider_accounts?organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}&provider=eq.google_ads&selected_for_sync=eq.true&status=eq.active`) as Row[];
 if(selected.length!==1)throw new Error("Exactly one Google Ads account must be selected for bounded ingestion.");
 const providerAccount=selected[0];
 const now=new Date(),windowEnd=now.toISOString().slice(0,10),windowStart=new Date(now.getTime()-(days-1)*86400000).toISOString().slice(0,10);
 const runs=await marketingPersistenceRequest("marketing_reporting_runs",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({account_id:providerAccount.account_id,organization_id:input.organizationId,connection_id:input.connectionId,provider_account_id:providerAccount.id,provider:"google_ads",mode:"manual",window_start:windowStart,window_end:windowEnd,status:"running"})}) as Row[];
 const runId=String(runs[0]?.id||"");if(!runId)throw new Error("Google Ads reporting run could not be created.");
 let proof;
 try{proof=await runGoogleAdsReportingProof({organizationId:input.organizationId,connectionId:input.connectionId,days});}
 catch(error){await marketingPersistenceRequest(`marketing_reporting_runs?id=eq.${encodeURIComponent(runId)}&organization_id=eq.${encodeURIComponent(input.organizationId)}`,{method:"PATCH",body:JSON.stringify({status:"failed",error_code:"provider_read_failed",completed_at:new Date().toISOString()})});throw error;}
 let evidenceCreated=0,evidenceReused=0,factsCreated=0,factsUpdated=0,factsUnchanged=0;
 for(const row of proof.rows){
  if(!row.date||!row.campaignId)continue;
  const raw=stablePayload(row),observationHash=hash(raw);
  let evidence=await marketingPersistenceRequest(`marketing_reporting_evidence?organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}&provider_account_id=eq.${encodeURIComponent(String(providerAccount.id))}&entity_type=eq.campaign_daily&provider_entity_id=eq.${encodeURIComponent(row.campaignId)}&report_date=eq.${encodeURIComponent(row.date)}&observation_hash=eq.${observationHash}&limit=1`) as Row[];
  if(!evidence[0]){
   evidence=await marketingPersistenceRequest("marketing_reporting_evidence",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({account_id:providerAccount.account_id,organization_id:input.organizationId,connection_id:input.connectionId,provider_account_id:providerAccount.id,provider:"google_ads",report_date:row.date,entity_type:"campaign_daily",provider_entity_id:row.campaignId,observation_hash:observationHash,raw_payload:raw})}) as Row[];
   evidenceCreated++;
  }else evidenceReused++;
  const evidenceId=String(evidence[0].id);
  const existing=await marketingPersistenceRequest(`marketing_campaign_daily_facts?organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}&provider_account_id=eq.${encodeURIComponent(String(providerAccount.id))}&provider_campaign_id=eq.${encodeURIComponent(row.campaignId)}&report_date=eq.${encodeURIComponent(row.date)}&limit=1`) as Row[];
  const fact={account_id:providerAccount.account_id,organization_id:input.organizationId,connection_id:input.connectionId,provider_account_id:providerAccount.id,provider:"google_ads",report_date:row.date,provider_campaign_id:row.campaignId,campaign_name:row.campaignName,campaign_status:row.campaignStatus,impressions:row.impressions,clicks:row.clicks,cost_micros:row.costMicros,conversions:row.conversions,conversion_value:row.conversionValue,currency:providerAccount.currency||null,source_evidence_id:evidenceId,source_observation_hash:observationHash,last_observed_at:new Date().toISOString(),updated_at:new Date().toISOString()};
  if(!existing[0]){
   await marketingPersistenceRequest("marketing_campaign_daily_facts",{method:"POST",body:JSON.stringify({...fact,first_observed_at:new Date().toISOString()})});factsCreated++;
  }else if(String(existing[0].source_observation_hash)===observationHash){factsUnchanged++;
  }else{await marketingPersistenceRequest(`marketing_campaign_daily_facts?id=eq.${encodeURIComponent(String(existing[0].id))}&organization_id=eq.${encodeURIComponent(input.organizationId)}`,{method:"PATCH",body:JSON.stringify(fact)});factsUpdated++;}
 }
 const completedAt=new Date().toISOString();
 await marketingPersistenceRequest(`marketing_reporting_runs?id=eq.${encodeURIComponent(runId)}&organization_id=eq.${encodeURIComponent(input.organizationId)}`,{method:"PATCH",body:JSON.stringify({status:"completed",provider_rows:proof.rowCount,evidence_created:evidenceCreated,evidence_reused:evidenceReused,facts_created:factsCreated,facts_updated:factsUpdated,facts_unchanged:factsUnchanged,completed_at:completedAt})});
 const checkpoints=await marketingPersistenceRequest(`marketing_reporting_checkpoints?organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}&provider_account_id=eq.${encodeURIComponent(String(providerAccount.id))}&resource=eq.campaign_daily&limit=1`) as Row[];
 const checkpoint={organization_id:input.organizationId,connection_id:input.connectionId,provider_account_id:providerAccount.id,provider:"google_ads",resource:"campaign_daily",last_successful_report_date:windowEnd,overlap_days:7,last_run_id:runId,last_success_at:completedAt,last_error_at:null,last_error_code:null,updated_at:completedAt};
 if(checkpoints[0])await marketingPersistenceRequest(`marketing_reporting_checkpoints?organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}&provider_account_id=eq.${encodeURIComponent(String(providerAccount.id))}&resource=eq.campaign_daily`,{method:"PATCH",body:JSON.stringify(checkpoint)});
 else await marketingPersistenceRequest("marketing_reporting_checkpoints",{method:"POST",body:JSON.stringify(checkpoint)});
 return {runId,accountLabel:proof.accountLabel,days,providerRows:proof.rowCount,evidenceCreated,evidenceReused,factsCreated,factsUpdated,factsUnchanged};
}
