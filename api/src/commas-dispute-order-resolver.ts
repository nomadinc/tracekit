/** Preparation only: no payload-field guesses, I/O, persistence or financial posting. */
export type DisputeOrderScope={organizationId:string;connectionId:string;providerAccountId:string};
export type DisputeOrderMapping=DisputeOrderScope & {
 kind:"numeric_transaction"|"public_order";sourceId:string;canonicalOrderId:string;
 active:boolean;authoritative:boolean;
};
export type DisputeOrderInput=DisputeOrderScope & {
 providerDisputeId:string;numericTransactionId?:unknown;publicOrderId?:unknown;
 evidenceVerified:boolean;lookupComplete:boolean;
};
export type DisputeOrderDecision={
 state:"exact"|"unresolved"|"conflict";reason:string;canonicalOrderId:string|null;
};
const sameScope=(a:DisputeOrderScope,b:DisputeOrderScope)=>
 a.organizationId===b.organizationId&&a.connectionId===b.connectionId&&a.providerAccountId===b.providerAccountId;
const decision=(state:DisputeOrderDecision["state"],reason:string,canonicalOrderId:string|null=null):DisputeOrderDecision=>({state,reason,canonicalOrderId});
function numericId(v:unknown){
 if(typeof v==="number")return Number.isSafeInteger(v)&&v>0?String(v):null;
 if(typeof v!=="string")return null;
 const s=v.trim();return /^[1-9][0-9]*$/.test(s)?s:null;
}
function publicId(v:unknown){
 if(typeof v!=="string")return null;
 const s=v.trim();return /^ORD-[A-Za-z0-9_-]{1,120}$/.test(s)?s:null;
}
const present=(v:unknown)=>v!==null&&v!==undefined&&v!=="";
export function resolveCommasDisputeOrder(input:DisputeOrderInput,mappings:DisputeOrderMapping[]):DisputeOrderDecision{
 if(!input.organizationId||!input.connectionId||!input.providerAccountId||!input.providerDisputeId.trim())
  return decision("unresolved","scope_or_dispute_identity_missing");
 if(!input.evidenceVerified)return decision("unresolved","verified_provider_evidence_required");
 if(!input.lookupComplete)return decision("unresolved","complete_scoped_lookup_required");
 if(mappings.some(m=>!sameScope(input,m)))return decision("conflict","lookup_scope_conflict");
 const numeric=numericId(input.numericTransactionId),ord=publicId(input.publicOrderId);
 if((present(input.numericTransactionId)&&!numeric)||(present(input.publicOrderId)&&!ord))
  return decision("unresolved","malformed_provider_order_identity");
 if(!numeric&&!ord)return decision("unresolved","provider_order_identity_missing");
 const identities:Array<[DisputeOrderMapping["kind"],string]>=[];
 if(numeric)identities.push(["numeric_transaction",numeric]);
 if(ord)identities.push(["public_order",ord]);
 const orders:string[]=[];
 for(const [kind,id] of identities){
  const relevant=mappings.filter(m=>m.kind===kind&&m.sourceId===id&&m.active);
  if(relevant.some(m=>!m.authoritative||!m.canonicalOrderId))return decision("unresolved","authoritative_mapping_required");
  const unique=new Set(relevant.map(m=>m.canonicalOrderId));
  if(unique.size>1)return decision("conflict","ambiguous_provider_order_mapping");
  if(unique.size===0)return decision("unresolved","provider_order_mapping_unavailable");
  orders.push([...unique][0]);
 }
 if(new Set(orders).size!==1)return decision("conflict","numeric_and_public_order_disagree");
 return decision("exact",identities.length===2?"both_provider_identifiers_agree":"single_provider_identifier",orders[0]);
}
export type CurrentDisputeOrderLink=DisputeOrderScope & {
 providerDisputeId:string;canonicalOrderId:string|null;reconciliationState:string;
};
/** Identity-only update plan. Caller must recheck under a lock/CAS before persisting. */
export function planCommasDisputeOrderLink(input:DisputeOrderInput,current:CurrentDisputeOrderLink,result:DisputeOrderDecision){
 if(!sameScope(input,current)||input.providerDisputeId!==current.providerDisputeId)
  return {state:"hold" as const,reason:"current_projection_identity_conflict",patch:null};
 if(result.state!=="exact"||!result.canonicalOrderId)return {state:"hold" as const,reason:result.reason,patch:null};
 if(current.canonicalOrderId&&current.canonicalOrderId!==result.canonicalOrderId)
  return {state:"hold" as const,reason:"existing_order_link_conflict",patch:null};
 if(current.canonicalOrderId===result.canonicalOrderId&&current.reconciliationState==="matched")
  return {state:"noop" as const,reason:"order_link_already_exact",patch:null};
 return {state:"link" as const,reason:"provider_order_identity_verified",
  patch:{matched_canonical_order_id:result.canonicalOrderId,reconciliation_state:"matched" as const}};
}
