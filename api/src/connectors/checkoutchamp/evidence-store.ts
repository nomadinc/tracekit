import { createHash } from "node:crypto";
import type { CheckoutChampTransactionEvidence } from "./transaction-evidence.ts";

type Scope={organizationId:string;connectionId:string;providerAccountId:string};
type Config={url:string;serviceRoleKey:string;fetchImpl?:typeof fetch};

export function createCheckoutChampTransactionEvidenceStore(config:Config){
 const request=createRequest(config);
 return async function persist(scope:Scope,row:CheckoutChampTransactionEvidence){
   const payload=JSON.stringify(row.raw);
   const hash=createHash("sha256").update(payload).digest("hex");
   const observedAt=new Date().toISOString();
   const evidenceRows=await request<any[]>("commerce_evidence_records?select=id",{
     method:"POST",headers:{Prefer:"return=representation"},
     body:JSON.stringify({
       organization_id:scope.organizationId,connection_id:scope.connectionId,provider_account_id:scope.providerAccountId,
       source_object_type:"checkoutchamp_transaction",source_object_id:row.providerTransactionId,payload_hash:hash,
       storage_backend:"inline_managed",storage_reference:`checkoutchamp:transaction:${row.providerTransactionId}:${hash}`,
       content_type:"application/json",byte_size:new TextEncoder().encode(payload).byteLength,
       observed_at:observedAt,pii_classification:"restricted",retention_policy:"commerce_source_evidence_v1",
       normalizer_version:"checkoutchamp-transaction-v1",mapping_version:"checkoutchamp-transaction-v1",
       metadata:{provider:"checkoutchamp",raw_payload_preserved:true}
     })
   });
   const evidenceId=evidenceRows[0]?.id;if(!evidenceId)throw new Error("Checkout Champ evidence record was not created.");
   await request("commerce_managed_evidence_payloads?on_conflict=evidence_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({evidence_id:evidenceId,organization_id:scope.organizationId,payload:row.raw})});
   await request("commerce_transaction_relationship_evidence?on_conflict=connection_id,provider_account_id,provider_transaction_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({
     organization_id:scope.organizationId,connection_id:scope.connectionId,provider_account_id:scope.providerAccountId,evidence_id:evidenceId,
     provider:"checkoutchamp",provider_order_id:row.providerOrderId||row.actualOrderId||"unresolved",
     provider_transaction_id:row.providerTransactionId,parent_provider_transaction_id:row.parentProviderTransactionId,
     transaction_type:row.transactionType,transaction_status:row.transactionStatus,actual_order_id:row.actualOrderId,
     client_order_id:row.clientOrderId,billing_cycle_number:row.billingCycleNumber,funnel_reference_id:row.funnelReferenceId,
     metadata:{relationship_source:"transactions.query.parentTxnId",order_resolution:row.providerOrderId?"provider_order_id":"unresolved"}
   })});
   await request("commerce_attribution_evidence?on_conflict=connection_id,provider_account_id,source_object_type,source_object_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({
     organization_id:scope.organizationId,connection_id:scope.connectionId,provider_account_id:scope.providerAccountId,evidence_id:evidenceId,
     provider:"checkoutchamp",source_object_type:"transaction",source_object_id:row.providerTransactionId,
     affiliate_id:row.attribution.affiliateId,explicit_everflow_transaction_id:row.attribution.explicitEverflowTransactionId,
     custom1:row.attribution.custom1,custom2:row.attribution.custom2,custom3:row.attribution.custom3,
     utm_source:row.attribution.utmSource,utm_campaign:row.attribution.utmCampaign,funnel_reference_id:row.funnelReferenceId,
     classification_status:row.attribution.explicitEverflowTransactionId?"confirmed_everflow":"raw",
     metadata:{custom_fields_classified:false}
   })});
   return {evidenceId,payloadHash:hash};
 };
}
function createRequest(config:Config){const base=config.url.replace(/\/+$/,"");const f=config.fetchImpl||fetch;return async<T=unknown>(path:string,init:RequestInit={})=>{const r=await f(`${base}/rest/v1/${path}`,{...init,headers:{apikey:config.serviceRoleKey,Authorization:`Bearer ${config.serviceRoleKey}`,"Content-Type":"application/json",...(init.headers||{})}});if(!r.ok)throw new Error(`Checkout Champ evidence persistence failed (${r.status}): ${(await r.text()).slice(0,500)}`);if(r.status===204)return undefined as T;const t=await r.text();return (t?JSON.parse(t):undefined) as T;};}
