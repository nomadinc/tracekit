import "server-only";
import { commercePersistenceRequest } from "./supabase-control-repository";
import { SupabaseCommerceEvidenceStore } from "./supabase-evidence-store-core";
import type { CommerceEvidenceStore } from "./evidence-store";
import { parseContinuousPage } from "./continuous-intelligence";
import { normalizeCommasTransaction } from "./commas-shadow-normalizer";

export class CustomerSourceAuditError extends Error { constructor(readonly code:string){super(code);} }
type Row=Record<string,any>;
const stop=()=>{throw new CustomerSourceAuditError("customer_source_evidence_unverified");};

/** Retained evidence only. No provider requests, contact disclosures, or database writes. */
export async function auditCustomerSourceEvidence(scope:{organizationId:string;connectionId:string;providerAccountId:string;externalMerchantIdentityVerified:boolean},dependencies:{db?:typeof commercePersistenceRequest;store?:CommerceEvidenceStore}={}) {
  const db=dependencies.db||commercePersistenceRequest;
  const store=dependencies.store||new SupabaseCommerceEvidenceStore();
  const people=await db(`people?organization_id=eq.${scope.organizationId}&or=(primary_phone.is.null,display_name.is.null)&select=id,organization_id,primary_phone,display_name&order=id.asc&limit=151`);
  if(people.length>150)throw new CustomerSourceAuditError("customer_source_audit_candidate_bound");
  if(people.some(person=>person.organization_id!==scope.organizationId||!/^[0-9a-f-]{36}$/i.test(String(person.id))))stop();
  const orders:Row[]=[];
  for(let offset=0;offset<people.length;offset+=50){
    const ids=people.slice(offset,offset+50).map(person=>person.id);
    let after=0;
    for(let page=0;page<5;page++){
      const batch=await db(`platform_orders?organization_id=eq.${scope.organizationId}&connection_id=eq.${scope.connectionId}&provider_account_id=eq.${scope.providerAccountId}&person_id=in.(${ids.join(",")})&select=id,person_id,canonical_order_id,platform_order_id,evidence_id&order=id.asc&limit=1000${after?`&id=gt.${after}`:""}`);
      orders.push(...batch);
      if(orders.length>5000)throw new CustomerSourceAuditError("customer_source_audit_order_bound");
      if(batch.length<1000)break;
      after=Number(batch[batch.length-1].id);if(!Number.isSafeInteger(after)||after<1)stop();
      if(page===4)throw new CustomerSourceAuditError("customer_source_audit_order_bound");
    }
  }
  const evidenceIds=Array.from(new Set(orders.map(order=>String(order.evidence_id||""))));
  if(evidenceIds.some(id=>!/^[0-9a-f-]{36}$/i.test(id)))stop();
  const metadata=new Map<string,Row>();
  for(let offset=0;offset<evidenceIds.length;offset+=50){
    const records=await db(`commerce_evidence_records?organization_id=eq.${scope.organizationId}&connection_id=eq.${scope.connectionId}&provider_account_id=eq.${scope.providerAccountId}&id=in.(${evidenceIds.slice(offset,offset+50).join(",")})&deleted_at=is.null&select=id,organization_id,connection_id,provider_account_id,source_object_type,storage_reference,payload_hash&limit=50`);
    for(const record of records){if(record.organization_id!==scope.organizationId||record.connection_id!==scope.connectionId||record.provider_account_id!==scope.providerAccountId||metadata.has(String(record.id)))stop();metadata.set(String(record.id),record);}
  }
  const pages=new Map<string,Map<string,Row>>();
  for(const id of evidenceIds){
    const record=metadata.get(id);if(!record)stop();
    const prefix=`commerce-evidence/${scope.organizationId}/${scope.connectionId}/${scope.providerAccountId}/`;
    if(!String(record!.storage_reference).startsWith(prefix)||!/^[a-f0-9]{64}$/.test(String(record!.payload_hash)))stop();
    const bytes=await store.getAuthorized({organizationId:scope.organizationId,storageReference:String(record!.storage_reference)});
    if(!bytes||!await store.verifyHash({organizationId:scope.organizationId,storageReference:String(record!.storage_reference),payloadHash:String(record!.payload_hash)}))stop();
    const parsed=parseContinuousPage(bytes!);const byId=new Map<string,Row>();
    for(const item of parsed.items){const sourceId=String(item.id);if(byId.has(sourceId))stop();byId.set(sourceId,item);}
    pages.set(id,byId);
  }
  const cases:Row[]=[];
  for(const person of people){
    const owned=orders.filter(order=>order.person_id===person.id);
    if(!owned.length)continue;
    const phones=new Set<string>();const names=new Set<string>();let invalidPhone=false;
    const references:Row[]=[];
    for(const order of owned){
      const prefix=`commas:${scope.connectionId}:${scope.providerAccountId}:`;
      if(!String(order.platform_order_id).startsWith(prefix))stop();
      const transactionId=String(order.platform_order_id).slice(prefix.length);
      const source=pages.get(String(order.evidence_id))?.get(transactionId);if(!source)stop();
      const normalized=normalizeCommasTransaction(source!,scope);
      if(normalized.person_id!==person.id||normalized.canonical_order_id!==order.canonical_order_id)stop();
      if(normalized.customer_phone)phones.add(normalized.customer_phone);
      if(normalized.customer_name)names.add(normalized.customer_name);
      if(String(source!.fan?.phone||"").trim()&&!normalized.customer_phone)invalidPhone=true;
      references.push({canonicalOrderId:order.canonical_order_id,evidenceId:order.evidence_id,transactionId,payloadHash:metadata.get(String(order.evidence_id))!.payload_hash});
    }
    const missingPhone=!String(person.primary_phone||"").trim(),missingName=!String(person.display_name||"").trim();
    cases.push({personId:person.id,missingStoredPhone:missingPhone,missingStoredName:missingName,retainedSourceOrders:owned.length,phoneAssessment:!missingPhone?"not_missing":phones.size>1?"conflicting_retained_source_phones":phones.size===1?"usable_phone_in_retained_source":invalidPhone?"source_phone_not_normalizable":"phone_absent_from_retained_source",nameAssessment:!missingName?"not_missing":names.size>1?"conflicting_retained_source_names":names.size===1?"name_in_retained_source":"name_absent_from_retained_source",references});
  }
  const counts:Record<string,number>={};for(const item of cases)for(const key of [item.phoneAssessment,item.nameAssessment])if(key!=="not_missing")counts[key]=(counts[key]||0)+1;
  return {readOnly:true,providerRequests:0,writes:0,scope,candidates:cases.length,retainedOrdersVerified:orders.length,evidencePagesVerified:evidenceIds.length,assessments:counts,cases,contactValuesIncluded:false,sourcePopulationLimitation:"Retained transaction evidence only; current provider customer profiles and external merchant identity require separate verification."};
}
