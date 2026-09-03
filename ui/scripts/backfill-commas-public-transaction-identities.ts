import { createHash } from "node:crypto";
import { mergeOrdBackfillSummary, nextOrdBackfillCursor, normalizeOrdBackfillBatchSize, publicTransactionMappingRecordsFromPage } from "../lib/commerce/commas-public-transaction-backfill";

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
const afterObservedAt=arg("--after-observed-at"),afterId=arg("--after-evidence-id");
if(Boolean(afterObservedAt)!==Boolean(afterId))throw new Error("Both cursor fields are required together.");
const headers={apikey:key,Authorization:`Bearer ${key}`};
async function json(path:string,init:RequestInit={}){const response=await fetch(`${url}${path}`,{...init,headers:{...headers,"content-type":"application/json",...(init.headers||{})}});if(!response.ok)throw new Error(`Supabase request failed (${response.status}).`);return response.status===204?null:response.json()}

async function main(){
  const cursor=afterObservedAt?`&or=${encodeURIComponent(`(observed_at.gt.${afterObservedAt},and(observed_at.eq.${afterObservedAt},id.gt.${afterId}))`)}`:"";
  const path=`/rest/v1/commerce_evidence_records?organization_id=eq.${organizationId}&connection_id=eq.${connectionId}&provider_account_id=eq.${providerAccountId}&source_object_type=eq.transaction_page&deleted_at=is.null&select=id,observed_at,storage_reference,payload_hash&order=observed_at.asc,id.asc&limit=${batchSize}${cursor}`;
  const evidenceRows=await json(path) as Array<any>;let summary:Record<string,number>={};
  for(const evidence of evidenceRows){
    const storagePath=String(evidence.storage_reference).replace(/^commerce-evidence\//,"").split("/").map(encodeURIComponent).join("/");
    const response=await fetch(`${url}/storage/v1/object/commerce-evidence/${storagePath}`,{headers});if(!response.ok)throw new Error(`Evidence unavailable (${response.status}).`);
    const bytes=new Uint8Array(await response.arrayBuffer());const hash=createHash("sha256").update(bytes).digest("hex");if(hash!==evidence.payload_hash)throw new Error("Evidence hash mismatch.");
    const records=publicTransactionMappingRecordsFromPage(JSON.parse(new TextDecoder().decode(bytes)),{connectionId,providerAccountId});
    const result=await json("/rest/v1/rpc/upsert_commas_public_transaction_mappings_v1",{method:"POST",body:JSON.stringify({p_organization_id:organizationId,p_connection_id:connectionId,p_provider_account_id:providerAccountId,p_evidence_id:evidence.id,p_records:records,p_dry_run:!write})}) as Array<any>;
    summary=mergeOrdBackfillSummary(summary,result[0]||{});
  }
  console.log(JSON.stringify({dry_run:!write,evidence_pages_scanned:evidenceRows.length,...summary,next_cursor:nextOrdBackfillCursor(evidenceRows)},null,2));
}
void main().catch((error)=>{console.error(error instanceof Error?error.message:"ORD backfill failed.");process.exitCode=1});
