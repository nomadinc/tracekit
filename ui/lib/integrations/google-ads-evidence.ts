import "server-only";
import { marketingPersistenceRequest } from "./marketing-provider-repository";

type Row=Record<string,any>;
export type GoogleEvidenceTransport=(path:string,init?:RequestInit)=>Promise<Row[]>;

export function googleEvidenceFromRow(row:Row){
 const google=row.metadata?.google&&typeof row.metadata.google==="object"?row.metadata.google:{};
 return {
  id:String(row.id), sourceObjectId:String(row.source_object_id||""), reportDate:row.source_report_date?String(row.source_report_date):null,
  observedAt:String(row.observed_at||""), payloadHash:String(row.payload_hash||""), apiVersion:String(row.api_version||""),
  normalizerVersion:String(row.normalizer_version||""), syncRunId:row.sync_run_id?String(row.sync_run_id):null,
  customerId:google.customerId?String(google.customerId):null, loginCustomerId:google.loginCustomerId?String(google.loginCustomerId):null,
  requestId:google.requestId?String(google.requestId):null, costMicros:google.costMicros?String(google.costMicros):null,
  payload:row.inline_payload??null, readOnly:true as const,
 };
}

export async function listGoogleEvidenceHistory(input:{organizationId:string;connectionId:string;providerAccountId:string;sourceObjectId:string;transport?:GoogleEvidenceTransport}){
 const transport=input.transport||marketingPersistenceRequest;
 const rows=await transport(`marketing_evidence_records?organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}&provider_account_id=eq.${encodeURIComponent(input.providerAccountId)}&provider=eq.google_ads&source_object_type=eq.ad_daily&source_object_id=eq.${encodeURIComponent(input.sourceObjectId)}&deleted_at=is.null&order=observed_at.desc`);
 return rows.map(googleEvidenceFromRow);
}
