import "server-only";
import { createHash } from "node:crypto";
import { normalizeGoogleAdDailyRow } from "./google-ads-reporting";
import { marketingPersistenceRequest } from "./marketing-provider-repository";

type Row = Record<string, any>;
export type GoogleReportingTransport = (path:string, init?:RequestInit)=>Promise<Row[]>;
const NORMALIZER_VERSION="google-ads-daily-v1";
const COST_VERSION="google-ads-cost-micros-v1";
function stable(v:any):string { if(Array.isArray(v)) return `[${v.map(stable).join(",")}]`; if(v&&typeof v==="object") return `{${Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${stable(x)}`).join(",")}}`; return JSON.stringify(v); }
function hash(v:any){return createHash("sha256").update(stable(v)).digest("hex");}

async function hierarchy(input:any, transport:GoogleReportingTransport, observedAt:string){
  const common={organization_id:input.organizationId,connection_id:input.connectionId,provider_account_id:input.providerAccountId,provider:"google_ads",first_observed_at:observedAt,last_observed_at:observedAt,normalizer_version:NORMALIZER_VERSION,api_version:input.apiVersion,metadata:{}};
  async function ensure(table:string,idColumn:string,id:string,body:Row){
    const found=await transport(`${table}?organization_id=eq.${encodeURIComponent(input.organizationId)}&provider_account_id=eq.${encodeURIComponent(input.providerAccountId)}&${idColumn}=eq.${encodeURIComponent(id)}&limit=1`);
    if(found[0]){await transport(`${table}?id=eq.${encodeURIComponent(found[0].id)}&organization_id=eq.${encodeURIComponent(input.organizationId)}`,{method:"PATCH",body:JSON.stringify({...body,last_observed_at:observedAt,updated_at:observedAt})});return found[0];}
    const rows=await transport(table,{method:"POST",body:JSON.stringify({...common,...body})}); if(!rows[0]) throw new Error("Google hierarchy persistence failed."); return rows[0];
  }
  const c=await ensure("marketing_campaigns","provider_campaign_id",input.row.campaignId,{provider_campaign_id:input.row.campaignId,name:input.row.campaignName,effective_status:input.row.campaignStatus,currency:input.row.currency});
  const g=await ensure("marketing_ad_groups","provider_ad_group_id",input.row.adGroupId,{campaign_id:c.id,provider_ad_group_id:input.row.adGroupId,name:input.row.adGroupName,effective_status:input.row.adGroupStatus,currency:input.row.currency});
  const a=await ensure("marketing_ads","provider_ad_id",input.row.adId,{campaign_id:c.id,ad_group_id:g.id,provider_ad_id:input.row.adId,name:input.row.adName,effective_status:input.row.adStatus});
  return {campaign:c,adGroup:g,ad:a};
}

export async function persistGoogleAdDailyRows(input:{organizationId:string;connectionId:string;providerAccountId:string;syncRunId:string;apiVersion:string;rawRows:any[];transport?:GoogleReportingTransport;observedAt?:string}){
 const transport=input.transport||marketingPersistenceRequest; const observedAt=input.observedAt||new Date().toISOString();
 const out={seen:0,created:0,updated:0,unchanged:0,evidenceCreated:0,costsCreated:0,costsUpdated:0};
 for(const raw of input.rawRows){out.seen++; const row=normalizeGoogleAdDailyRow(raw); const ids=await hierarchy({ ...input,row },transport,observedAt); const payloadHash=hash(raw);
  const sourceId=`${row.customerId}:${row.adId}:${row.reportDate}`;
  const evidence=await transport("marketing_evidence_records?on_conflict=connection_id,provider_account_id,source_object_type,source_object_id,payload_hash",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=representation"},body:JSON.stringify({organization_id:input.organizationId,connection_id:input.connectionId,provider_account_id:input.providerAccountId,sync_run_id:input.syncRunId,provider:"google_ads",source_object_type:"ad_daily",source_object_id:sourceId,source_endpoint:"googleAds.search",source_report_date:row.reportDate,payload_hash:payloadHash,storage_backend:"inline_json",inline_payload:raw,api_version:input.apiVersion,normalizer_version:NORMALIZER_VERSION,observed_at:observedAt,metadata:{google:{customerId:row.customerId,loginCustomerId:raw?.tracekitGoogleContext?.loginCustomerId||null,requestId:raw?.tracekitGoogleContext?.requestId||null,costMicros:row.costMicros}}})}); if(evidence[0])out.evidenceCreated++;
  const reportingKey=hash({provider:"google_ads",grain:"ad_daily",apiVersion:input.apiVersion});
  const facts=await transport(`marketing_performance_daily?organization_id=eq.${encodeURIComponent(input.organizationId)}&provider_account_id=eq.${encodeURIComponent(input.providerAccountId)}&report_date=eq.${row.reportDate}&entity_level=eq.ad&provider_entity_id=eq.${row.adId}&reporting_key=eq.${reportingKey}&limit=1`);
  const normalized={currency:row.currency,spend:row.spend,impressions:row.impressions,clicks:row.clicks,last_observed_at:observedAt,payload_hash:payloadHash,normalizer_version:NORMALIZER_VERSION,api_version:input.apiVersion,sync_run_id:input.syncRunId,metadata:{google:{customerId:row.customerId,loginCustomerId:raw?.tracekitGoogleContext?.loginCustomerId||null,requestId:raw?.tracekitGoogleContext?.requestId||null,customerTimeZone:row.customerTimeZone,costMicros:row.costMicros}},updated_at:observedAt};
  let fact:any;
  if(facts[0]&&facts[0].payload_hash===payloadHash){const rs=await transport(`marketing_performance_daily?id=eq.${facts[0].id}&organization_id=eq.${input.organizationId}`,{method:"PATCH",body:JSON.stringify({last_observed_at:observedAt,sync_run_id:input.syncRunId,updated_at:observedAt})});fact=rs[0]||facts[0];out.unchanged++;}
  else if(facts[0]){const rs=await transport(`marketing_performance_daily?id=eq.${facts[0].id}&organization_id=eq.${input.organizationId}`,{method:"PATCH",body:JSON.stringify(normalized)});fact=rs[0]||{...facts[0],...normalized};out.updated++;}
  else {const rs=await transport("marketing_performance_daily",{method:"POST",body:JSON.stringify({...normalized,organization_id:input.organizationId,connection_id:input.connectionId,provider_account_id:input.providerAccountId,provider:"google_ads",report_date:row.reportDate,entity_level:"ad",campaign_id:ids.campaign.id,ad_group_id:ids.adGroup.id,ad_id:ids.ad.id,provider_entity_id:row.adId,reporting_key:reportingKey,first_observed_at:observedAt})});fact=rs[0];out.created++;}
  const costs=await transport(`marketing_costs?organization_id=eq.${encodeURIComponent(input.organizationId)}&source_performance_fact_id=eq.${fact.id}&cost_type=eq.ad_spend&calculation_version=eq.${COST_VERSION}&limit=1`);
  const costBody={amount:row.spend,currency:row.currency,campaign_id:ids.campaign.id,ad_group_id:ids.adGroup.id,ad_id:ids.ad.id,last_calculated_at:observedAt,metadata:{google:{costMicros:row.costMicros}},updated_at:observedAt};
  if(costs[0]){if(String(costs[0].amount)!==row.spend){await transport(`marketing_costs?id=eq.${costs[0].id}&organization_id=eq.${input.organizationId}`,{method:"PATCH",body:JSON.stringify(costBody)});out.costsUpdated++;}}
  else {await transport("marketing_costs",{method:"POST",body:JSON.stringify({...costBody,organization_id:input.organizationId,connection_id:input.connectionId,provider_account_id:input.providerAccountId,provider:"google_ads",cost_date:row.reportDate,cost_type:"ad_spend",source_performance_fact_id:fact.id,source_type:"provider_reported",allocation_status:"unallocated",first_calculated_at:observedAt,calculation_version:COST_VERSION})});out.costsCreated++;}
 } return out;
}
