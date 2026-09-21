import { createHash } from "node:crypto";
import { compareCommasAttributionToEverflow, normalizeCommasAttributionEvent } from "../../api/src/commas-provider-attribution";

const ORGANIZATION_ID="5f1de64a-1b37-40bb-81c8-32197eda0b41";
const CONNECTION_ID="ea1c2313-6120-4692-84c5-ec3562e7dcf6";
const PROVIDER_ACCOUNT_ID="0369c701-717f-4c34-b230-8341bcdb7e65";
const FIELDS=["affiliate_id","sub1","sub4","ef_transaction_id","transaction_id","tid","c1"] as const;
type Row=Record<string,unknown>;
const asObject=(value:unknown):Row=>value&&typeof value==="object"&&!Array.isArray(value)?value as Row:{};

function configuration(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,"");
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error("Supabase configuration unavailable");
  return {url,key,headers:{apikey:key,...(key.startsWith("sb_secret_")?{}:{Authorization:`Bearer ${key}`}),Accept:"application/json"}};
}

async function main(){
  const apply=process.argv.includes("--apply");
  const {url,headers}=configuration();
  async function read(path:string){const response=await fetch(`${url}/rest/v1/${path}`,{headers});if(!response.ok)throw new Error(`Read ${path.split("?")[0]} HTTP ${response.status}`);return await response.json() as Row[];}
  const observations=await read(`commerce_provider_attribution_observations?select=id,evidence_id,payload_hash,provider_event_id,provider_event_type,payment_public_transaction_id,normalizer_version&organization_id=eq.${ORGANIZATION_ID}&connection_id=eq.${CONNECTION_ID}&provider_account_id=eq.${PROVIDER_ACCOUNT_ID}&provider_event_type=eq.product.purchased&normalizer_version=eq.commas-provider-attribution-v1&order=created_at.asc&limit=500`);
  if(observations.length>200)throw new Error("Evidence replay exceeds incident bound");
  const evidenceIds=observations.map(row=>String(row.evidence_id));
  const evidence=new Map<string,Row>();
  for(let i=0;i<evidenceIds.length;i+=50){
    const rows=await read(`commerce_evidence_records?select=id,payload_hash,storage_reference,pii_classification,source_object_type,deleted_at&id=in.(${evidenceIds.slice(i,i+50).join(",")})`);
    for(const row of rows)evidence.set(String(row.id),row);
  }
  const prepared:Array<{observation:Row;parameters:Row;comparison:Row;tid:string|null}>=[];
  const presence=Object.fromEntries(FIELDS.map(field=>[field,0])) as Record<string,number>;
  const aliases:Record<string,number>={all_agree:0,single_alias:0,conflict:0,none:0};
  for(const observation of observations){
    const record=evidence.get(String(observation.evidence_id));
    if(!record||record.pii_classification!=="restricted"||record.source_object_type!=="commas_attribution_webhook"||record.deleted_at!==null||record.payload_hash!==observation.payload_hash)throw new Error("Restricted Evidence identity mismatch");
    const reference=String(record.storage_reference||"");if(!reference.startsWith("commerce-evidence/"))throw new Error("Unexpected Evidence reference");
    const storagePath=reference.slice("commerce-evidence/".length).split("/").map(encodeURIComponent).join("/");
    const response=await fetch(`${url}/storage/v1/object/commerce-evidence/${storagePath}`,{headers});
    if(!response.ok)throw new Error(`Evidence HTTP ${response.status}`);
    const raw=new Uint8Array(await response.arrayBuffer());
    const hash=createHash("sha256").update(raw).digest("hex");
    if(hash!==observation.payload_hash)throw new Error("Evidence byte hash mismatch");
    const normalized=normalizeCommasAttributionEvent(JSON.parse(new TextDecoder().decode(raw)));
    if(!normalized||normalized.eventType!=="product.purchased"||normalized.providerEventId!==observation.provider_event_id||normalized.paymentPublicTransactionId!==observation.payment_public_transaction_id)throw new Error("Observed event identity mismatch");
    const p=normalized.parameters;
    const parameters:Row={affiliate_id:p.affiliateId,sub1:p.sub1,sub4:p.sub4,ef_transaction_id:p.efTransactionId,transaction_id:p.transactionId,tid:p.tid,c1:p.c1,alias_state:p.aliasState,restricted_metadata:p.restrictedMetadata};
    for(const field of FIELDS)if(parameters[field])presence[field]++;
    aliases[p.aliasState]++;
    const tid=p.aliasState==="conflict"?null:p.efTransactionId||p.transactionId||p.tid||p.c1;
    prepared.push({observation,parameters,comparison:{state:"no_commas_tid",matched_fields:[],conflicting_fields:[]},tid});
  }
  const tids=Array.from(new Set(prepared.map(item=>item.tid).filter((value):value is string=>Boolean(value))));
  const everflow=new Map<string,Row[]>();
  for(let i=0;i<tids.length;i+=40){
    const values=tids.slice(i,i+40).map(encodeURIComponent).join(",");
    for(const table of ["everflow_click_events","everflow_conversion_events"]){
      const rows=await read(`${table}?select=transaction_id,affiliate_id,sub1,sub4&organization_id=eq.${ORGANIZATION_ID}&transaction_id=in.(${values})&limit=500`);
      for(const row of rows){const tid=String(row.transaction_id);everflow.set(tid,[...(everflow.get(tid)||[]),row]);}
    }
  }
  const comparisonCounts:Record<string,number>={exact_match:0,partial_match:0,conflict:0,no_everflow_record:0,no_commas_tid:0};
  for(const item of prepared){
    const p=asObject(item.parameters),rows=item.tid?everflow.get(item.tid)||[]:[];
    const unique=Array.from(new Map(rows.map(row=>[JSON.stringify([row.transaction_id,row.affiliate_id,row.sub1,row.sub4]),row])).values());
    const comparison=unique.length>1?{state:"conflict" as const,matched_fields:[],conflicting_fields:["ambiguous_everflow_identity"]}:compareCommasAttributionToEverflow({affiliateId:p.affiliate_id as string|null,sub1:p.sub1 as string|null,sub4:p.sub4 as string|null,efTransactionId:p.ef_transaction_id as string|null,transactionId:p.transaction_id as string|null,tid:p.tid as string|null,c1:p.c1 as string|null,tkid:p.tkid as string|null,aliasState:p.alias_state as "all_agree"|"single_alias"|"conflict"|"none",restrictedMetadata:p.restricted_metadata as any},unique[0]??null);
    item.comparison=comparison;comparisonCounts[comparison.state]++;
  }
  const summary={mode:apply?"apply":"dry_run",observations:prepared.length,evidenceHashesVerified:prepared.length,presence,aliasStates:aliases,everflowComparison:comparisonCounts};
  if(!apply){console.log(JSON.stringify(summary));return;}
  const results:Record<string,number>={exact:0,unmatched:0,ambiguous:0,malformed:0,journeyCreated:0};
  for(const item of prepared){
    const response=await fetch(`${url}/rest/v1/rpc/reconcile_commas_provider_observation_v2`,{method:"POST",headers:{...headers,"content-type":"application/json"},body:JSON.stringify({p_observation_id:item.observation.id,p_evidence_payload_hash:item.observation.payload_hash,p_provider_event_id:item.observation.provider_event_id,p_payment_public_transaction_id:item.observation.payment_public_transaction_id,p_parameters:item.parameters,p_everflow_comparison:item.comparison})});
    if(!response.ok)throw new Error(`Reconciliation RPC HTTP ${response.status}`);
    const rows=await response.json() as Row[];const row=Array.isArray(rows)?rows[0]:asObject(rows);
    if(!row||!row.parameters_updated)throw new Error("Reconciliation result invalid");
    results[String(row.match_state)]++;if(row.journey_created)results.journeyCreated++;
  }
  console.log(JSON.stringify({...summary,results}));
}
void main().catch(error=>{console.error(error instanceof Error?error.message:"Commas Evidence reconciliation failed");process.exitCode=1});
