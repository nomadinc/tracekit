import { createHash } from "node:crypto";
import { analyzeOrdFrozenCohort, COMMAS_ORD_BACKFILL_MAPPING_PAGE_SIZE, compareOrdBackfillCursors, evidenceRangeQuery, evidenceRowCursor, normalizeOrdBackfillBatchSize, ordFrozenBaselineFingerprint, ordFrozenBaselineMaterial, publicTransactionMappingRecordsFromPage, validateOrdBackfillWindow, type ExistingSourceMapping, type OrdEvidenceRow, type OrdMappingRecord } from "../lib/commerce/commas-public-transaction-backfill";

const required=(name:string)=>{const value=String(process.env[name]||"").trim();if(!value)throw new Error(`${name} is required.`);return value};
const arg=(name:string)=>{const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]||null:null};
const url=required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/,"");
const key=required("SUPABASE_SERVICE_ROLE_KEY");
const organizationId=required("TRACEKIT_COMMERCE_ORGANIZATION_ID");
const connectionId=required("TRACEKIT_COMMERCE_CONNECTION_ID");
const providerAccountId=required("TRACEKIT_COMMERCE_PROVIDER_ACCOUNT_ID");
const write=process.argv.includes("--write");
if(write&&!process.argv.includes("--confirm-write-commas-public-transaction-identities"))throw new Error("Write mode requires --confirm-write-commas-public-transaction-identities.");
const batchSize=normalizeOrdBackfillBatchSize(arg("--batch-size"));
const window=validateOrdBackfillWindow({afterObservedAt:arg("--after-observed-at"),afterEvidenceId:arg("--after-evidence-id"),throughObservedAt:arg("--through-observed-at"),throughEvidenceId:arg("--through-evidence-id"),write});
const expectedBaseline=arg("--expected-baseline-sha256");
if(write&&(!expectedBaseline||!/^[0-9a-f]{64}$/i.test(expectedBaseline)))throw new Error("Write mode requires --expected-baseline-sha256 from the complete frozen dry run.");
const headers={apikey:key,Authorization:`Bearer ${key}`};
async function json(path:string,init:RequestInit={}){const response=await fetch(`${url}${path}`,{...init,headers:{...headers,"content-type":"application/json",...(init.headers||{})}});if(!response.ok)throw new Error(`Supabase request failed (${response.status}).`);return response.status===204?null:response.json()}

async function evidenceRows(){
  const rows:OrdEvidenceRow[]=[];let after=window.after,batches=0;
  while(true){
    const range=evidenceRangeQuery({after,through:window.through});
    const path=`/rest/v1/commerce_evidence_records?organization_id=eq.${organizationId}&connection_id=eq.${connectionId}&provider_account_id=eq.${providerAccountId}&source_object_type=eq.transaction_page&deleted_at=is.null&select=id,observed_at,storage_reference,payload_hash&order=observed_at.asc,id.asc&limit=${batchSize}${range}`;
    const batch=await json(path) as OrdEvidenceRow[];if(!batch.length)break;batches+=1;rows.push(...batch);
    const last=evidenceRowCursor(batch.at(-1)!);if(window.through&&compareOrdBackfillCursors(last,window.through)>=0)break;
    after=last;if(batch.length<batchSize)break;
  }
  return {rows,batches};
}

async function sourceMappings(sourceObjectType:"transaction"|"commas_public_transaction"){
  const rows:ExistingSourceMapping[]=[];let offset=0;
  while(true){
    const path=`/rest/v1/commerce_source_mappings?organization_id=eq.${organizationId}&connection_id=eq.${connectionId}&provider_account_id=eq.${providerAccountId}&source_object_type=eq.${sourceObjectType}&select=source_object_id,canonical_object_id,state&order=source_object_id.asc&limit=${COMMAS_ORD_BACKFILL_MAPPING_PAGE_SIZE}&offset=${offset}`;
    const batch=await json(path) as ExistingSourceMapping[];rows.push(...batch);if(batch.length<COMMAS_ORD_BACKFILL_MAPPING_PAGE_SIZE)break;offset+=batch.length;
  }
  return rows;
}

class EvidenceHashMismatch extends Error {}
async function retainedPage(evidence:OrdEvidenceRow,onHashChecked:()=>void){
  const storagePath=String(evidence.storage_reference).replace(/^commerce-evidence\//,"").split("/").map(encodeURIComponent).join("/");
  const response=await fetch(`${url}/storage/v1/object/commerce-evidence/${storagePath}`,{headers});if(!response.ok)throw new Error(`Evidence unavailable (${response.status}).`);
  const bytes=new Uint8Array(await response.arrayBuffer());const hash=createHash("sha256").update(bytes).digest("hex");onHashChecked();
  if(hash!==evidence.payload_hash)throw new EvidenceHashMismatch("Evidence hash mismatch.");
  const records=publicTransactionMappingRecordsFromPage(JSON.parse(new TextDecoder().decode(bytes)),{connectionId,providerAccountId});
  if(records.length>500)throw new Error("Evidence page exceeds the 500 transaction RPC bound.");
  return records;
}

async function main(){
  const selected=await evidenceRows();const pages:Array<{evidence:OrdEvidenceRow;records:OrdMappingRecord[]}>=[];let hashChecked=0,hashFailures=0;
  for(const evidence of selected.rows){try{const records=await retainedPage(evidence,()=>{hashChecked+=1});pages.push({evidence,records})}catch(error){if(!(error instanceof EvidenceHashMismatch))throw error;hashFailures+=1;console.error(JSON.stringify({event:"commas_ord_evidence_integrity_failure",evidence_id:evidence.id,error:error.message}))}}
  const records=pages.flatMap(page=>page.records),[numericMappings,ordMappings]=await Promise.all([sourceMappings("transaction"),sourceMappings("commas_public_transaction")]);
  const metrics=analyzeOrdFrozenCohort({records,numericMappings,ordMappings,evidenceHashChecked:hashChecked,evidenceHashFailures:hashFailures});
  const fingerprint=ordFrozenBaselineFingerprint(ordFrozenBaselineMaterial({scope:{organizationId,connectionId,providerAccountId},window,evidence:selected.rows,records,numericMappings,ordMappings,metrics}));
  const base={dry_run:!write,scope:{organization_id:organizationId,connection_id:connectionId,provider_account_id:providerAccountId},lower_cursor:window.after,upper_horizon:window.through,baseline_sha256:fingerprint,evidence_batches:selected.batches,evidence_pages_scanned:selected.rows.length,...metrics,next_cursor:null};
  if(!metrics.acceptance_safe){console.log(JSON.stringify(base,null,2));throw new Error("Frozen ORD cohort failed preflight; no mappings were written.")}
  if(write&&fingerprint!==expectedBaseline?.toLowerCase()){console.log(JSON.stringify(base,null,2));throw new Error("Frozen ORD baseline fingerprint does not match --expected-baseline-sha256; no mappings were written.")}
  let rpcSummary:Record<string,number>={};
  for(const page of pages){
    const result=await json("/rest/v1/rpc/upsert_commas_public_transaction_mappings_v1",{method:"POST",body:JSON.stringify({p_organization_id:organizationId,p_connection_id:connectionId,p_provider_account_id:providerAccountId,p_evidence_id:page.evidence.id,p_records:page.records,p_dry_run:!write})}) as Array<Record<string,unknown>>;
    for(const [name,value] of Object.entries(result[0]||{}))rpcSummary[name]=Number(rpcSummary[name]||0)+Number(value||0);
  }
  const postOrdMappings=write?await sourceMappings("commas_public_transaction"):ordMappings;
  console.log(JSON.stringify({...base,rpc_batches:pages.length,rpc_summary:rpcSummary,written_mappings:Number(rpcSummary.mappings_written||0),total_scoped_ord_mappings:postOrdMappings.length},null,2));
}
void main().catch((error)=>{console.error(error instanceof Error?error.message:"ORD backfill failed.");process.exitCode=1});
