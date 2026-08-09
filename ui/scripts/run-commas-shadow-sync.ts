import { decodeCommerceCredentialKey, decryptCommerceCredential } from "../lib/commerce/credential-crypto";
import { normalizeCommasTransaction } from "../lib/commerce/commas-shadow-normalizer";
import { SupabaseCommerceEvidenceStore } from "../lib/commerce/supabase-evidence-store-core";

type Row = Record<string, unknown>;
const PER_PAGE = 100;
const LEASE_SECONDS = 900;
const PACE_MS = 100;
const NORMALIZER_VERSION = "commas-transaction-v1";

function config() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,""); const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error("Shadow Sync persistence configuration unavailable.");
  return {url,key};
}
async function db(path:string,init:RequestInit={}) { const {url,key}=config(); const response=await fetch(`${url}/rest/v1/${path}`,{...init,headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json",Prefer:"return=representation",...init.headers}}); if(!response.ok) throw new Error(`Shadow Sync persistence failed (${response.status}).`); if(response.status===204)return [] as Row[]; const value=await response.json() as unknown; return (Array.isArray(value)?value:[value]) as Row[]; }
const sleep=(ms:number)=>new Promise((resolve)=>setTimeout(resolve,ms));
const bytea=(value:unknown)=>Uint8Array.from(Buffer.from(String(value).replace(/^\\x/,""),"hex"));
const obj=(value:unknown):Row|null=>value&&typeof value==="object"&&!Array.isArray(value)?value as Row:null;

function parsePage(bytes:Uint8Array) {
  const root=JSON.parse(new TextDecoder().decode(bytes)) as Row; const nested=obj(root.data);
  const items=[root.transactions,root.data,root.items,nested?.transactions,nested?.data].find(Array.isArray) as Row[]|undefined;
  if(!items||items.some((item)=>!obj(item)||item.id==null)) throw new Error("Unexpected Commas Transaction page schema.");
  const pagination=obj(nested?.pagination)||obj(root.pagination)||obj(root.meta)||nested||{};
  const number=(...values:unknown[])=>{for(const value of values){const parsed=Number(value);if(Number.isFinite(parsed))return parsed;}return null;};
  const currentPage=number(pagination.current_page,pagination.currentPage)??1;
  const totalPages=number(pagination.total_pages,pagination.last_page,pagination.totalPages);
  const totalItems=number(pagination.total_items,pagination.total,pagination.totalItems);
  const explicit=pagination.has_more??pagination.has_next_page??pagination.hasMore;
  const hasMore=typeof explicit==="boolean"?explicit:totalPages!==null?currentPage<totalPages:Boolean(pagination.next_page_url);
  return {items,pagination:{currentPage,totalPages,totalItems,hasMore}};
}

async function fetchPage(secret:string,page:number,correlationId:string) {
  let lastStatus=0;
  for(let attempt=1;attempt<=3;attempt++){
    try {
      const response=await fetch(`https://www.fanbasis.com/public-api/checkout-sessions/transactions?page=${page}&per_page=${PER_PAGE}`,{headers:{"x-api-key":secret,Accept:"application/json","x-correlation-id":correlationId},signal:AbortSignal.timeout(30_000)});
      lastStatus=response.status;
      if(response.ok){const bytes=new Uint8Array(await response.arrayBuffer());return {bytes,rateLimit:{limit:response.headers.get("x-ratelimit-limit"),remaining:response.headers.get("x-ratelimit-remaining"),reset:response.headers.get("x-ratelimit-reset")},attempts:attempt};}
      if(![429,500,502,503,504].includes(response.status)) throw new Error("Commas rejected the Shadow Sync request.");
      const retryAfter=Number(response.headers.get("retry-after")); await sleep(Number.isFinite(retryAfter)&&retryAfter>0?Math.min(retryAfter*1000,30_000):Math.min(500*2**(attempt-1),5_000));
    } catch(error){if(attempt===3)throw error;await sleep(Math.min(500*2**(attempt-1),5_000));}
  }
  throw new Error(`Commas Shadow Sync exhausted retries (${lastStatus||"network"}).`);
}

async function evidenceMetadata(input:{organizationId:string;connectionId:string;providerAccountId:string;runId:string;page:number;stored:{storageReference:string;payloadHash:string;contentType:string;byteSize:number}}){
  const existing=await db(`commerce_evidence_records?storage_backend=eq.object_storage&storage_reference=eq.${encodeURIComponent(input.stored.storageReference)}&select=id&limit=1`); if(existing[0])return String(existing[0].id);
  const rows=await db("commerce_evidence_records",{method:"POST",body:JSON.stringify({organization_id:input.organizationId,connection_id:input.connectionId,provider_account_id:input.providerAccountId,sync_run_id:input.runId,source_object_type:"transaction_page",source_object_id:`page:${input.page}:per_page:${PER_PAGE}`,payload_hash:input.stored.payloadHash,storage_backend:"object_storage",storage_reference:input.stored.storageReference,content_type:input.stored.contentType,byte_size:input.stored.byteSize,observed_at:new Date().toISOString(),normalizer_version:NORMALIZER_VERSION,mapping_version:"unmapped-v1",pii_classification:"sensitive",retention_policy:"commerce-provider-raw-v1",metadata:{immutable:true}})}); return String(rows[0].id);
}

async function main(){
  if(!process.argv.includes("--confirm-full-shadow"))throw new Error("Full Shadow Sync requires explicit confirmation.");
  const resumeArg=process.argv.find((arg)=>arg.startsWith("--run-id="))?.slice(9); const overlapPages=Number(process.argv.find((arg)=>arg.startsWith("--overlap-pages="))?.slice(16)||0);if(overlapPages<0||overlapPages>10)throw new Error("Overlap page bound is invalid."); const repositoryOwner=`commas-shadow-${crypto.randomUUID()}`; const store=new SupabaseCommerceEvidenceStore();
  const connections=await db("commerce_provider_connections?provider=eq.commas&status=eq.connected&select=id,organization_id,account_id&limit=2"); if(connections.length!==1)throw new Error("Full Shadow Sync requires exactly one connected Commas Connection.");
  const connectionId=String(connections[0].id),organizationId=String(connections[0].organization_id),accountId=String(connections[0].account_id);
  const accounts=await db(`commerce_provider_accounts?connection_id=eq.${connectionId}&organization_id=eq.${organizationId}&status=eq.active&select=id&limit=2`);if(accounts.length!==1)throw new Error("Full Shadow Sync requires one active Provider Account."); const providerAccountId=String(accounts[0].id);
  const credentials=await db(`commerce_provider_credentials?connection_id=eq.${connectionId}&organization_id=eq.${organizationId}&revoked_at=is.null&select=encryption_key_id,encryption_version,secret_iv,secret_ciphertext&limit=2`);if(credentials.length!==1)throw new Error("Full Shadow Sync credential unavailable.");
  const keyId=process.env.COMMERCE_CREDENTIALS_KEY_ID,version=Number(process.env.COMMERCE_CREDENTIALS_ENCRYPTION_VERSION||"1"),credential=credentials[0];if(!keyId||credential.encryption_key_id!==keyId||Number(credential.encryption_version)!==version)throw new Error("Credential encryption configuration mismatch.");
  const secret=await decryptCommerceCredential({keyId,encryptionVersion:version,iv:bytea(credential.secret_iv),ciphertext:bytea(credential.secret_ciphertext)},decodeCommerceCredentialKey(process.env.COMMERCE_CREDENTIALS_ENC_KEY));
  let run:Row;
  if(resumeArg){const rows=await db(`commerce_sync_runs?id=eq.${encodeURIComponent(resumeArg)}&organization_id=eq.${organizationId}&connection_id=eq.${connectionId}&select=*&limit=1`);if(!rows[0])throw new Error("Requested Shadow Sync Run unavailable.");run=rows[0];}
  else {[run]=await db("commerce_sync_runs",{method:"POST",body:JSON.stringify({organization_id:organizationId,connection_id:connectionId,provider_account_id:providerAccountId,sync_type:"transactions",mode:overlapPages?"reconciliation":"shadow",metadata:{normalizer_version:NORMALIZER_VERSION,per_page:PER_PAGE,overlap_pages:overlapPages||null}})});}
  const runId=String(run.id); console.log(JSON.stringify({event:"shadow_sync_started",runId}));
  const claimed=await db("rpc/claim_commerce_sync_run",{method:"POST",body:JSON.stringify({p_run_id:runId,p_organization_id:organizationId,p_connection_id:connectionId,p_lease_owner:repositoryOwner,p_lease_seconds:LEASE_SECONDS})});if(!claimed[0])throw new Error("Shadow Sync lease unavailable.");
  const completedRows=await db(`commerce_sync_checkpoints?sync_run_id=eq.${runId}&resource=eq.transactions&state=eq.completed&select=page,page_fingerprint&order=page.asc`); const completed=new Map(completedRows.map((row)=>[Number(row.page),String(row.page_fingerprint)]));
  let page=1,pagesCompleted=completed.size,recordsSeen=0,recordsCreated=0,recordsUpdated=0,retries=0,warnings=0,providerRequests=0,totalPages:number|null=null,totalItems:number|null=null; const seenIds=new Set<string>(); const started=Date.now();
  try{
    while(totalPages===null||page<=totalPages){
      if(completed.has(page)){page++;continue;}
      const existingCheckpoint=await db(`commerce_sync_checkpoints?sync_run_id=eq.${runId}&resource=eq.transactions&page=eq.${page}&per_page=eq.${PER_PAGE}&select=*&limit=1`);
      let checkpoint=existingCheckpoint[0]; if(!checkpoint){[checkpoint]=await db("commerce_sync_checkpoints",{method:"POST",body:JSON.stringify({sync_run_id:runId,organization_id:organizationId,connection_id:connectionId,provider_account_id:providerAccountId,resource:"transactions",page,per_page:PER_PAGE,state:"running"})});}else await db(`commerce_sync_checkpoints?id=eq.${checkpoint.id}`,{method:"PATCH",body:JSON.stringify({state:"running",updated_at:new Date().toISOString()})});
      const pageStart=Date.now();
      const prior=await db(`commerce_evidence_records?sync_run_id=eq.${runId}&source_object_type=eq.transaction_page&source_object_id=eq.${encodeURIComponent(`page:${page}:per_page:${PER_PAGE}`)}&deleted_at=is.null&select=id,storage_reference,payload_hash,content_type,byte_size&limit=1`);
      let evidenceId:string,stored:{storageReference:string;payloadHash:string;contentType:string;byteSize:number},pageBytes:Uint8Array,providerAttempts=0,rateRemaining:number|null=null;
      if(prior[0]){evidenceId=String(prior[0].id);stored={storageReference:String(prior[0].storage_reference),payloadHash:String(prior[0].payload_hash),contentType:String(prior[0].content_type),byteSize:Number(prior[0].byte_size)};const replay=await store.getAuthorized({organizationId,storageReference:stored.storageReference});if(!replay||!await store.verifyHash({organizationId,storageReference:stored.storageReference,payloadHash:stored.payloadHash}))throw new Error("Stored Evidence replay integrity failed.");pageBytes=replay;}
      else {const fetched=await fetchPage(secret,page,repositoryOwner);providerRequests++;providerAttempts=fetched.attempts;retries+=fetched.attempts-1;rateRemaining=fetched.rateLimit.remaining?Number(fetched.rateLimit.remaining):null;pageBytes=fetched.bytes;stored=await store.putImmutable({organizationId,connectionId,providerAccountId,sourceObjectType:"transaction_page",payload:pageBytes,contentType:"application/json"});if(!await store.verifyHash({organizationId,storageReference:stored.storageReference,payloadHash:stored.payloadHash}))throw new Error("Evidence hash verification failed.");evidenceId=await evidenceMetadata({organizationId,connectionId,providerAccountId,runId,page,stored});}
      const parsed=parsePage(pageBytes);totalPages=parsed.pagination.totalPages??totalPages;totalItems=parsed.pagination.totalItems??totalItems;
      const ids=parsed.items.map((item)=>String(item.id));const repeated=ids.filter((id)=>seenIds.has(id)).length;if(repeated>Math.max(2,Math.floor(ids.length*.1)))throw new Error("Major Commas pagination instability detected.");if(repeated)warnings+=repeated;ids.forEach((id)=>seenIds.add(id));
      const normalized=parsed.items.map((item)=>normalizeCommasTransaction(item,{connectionId,providerAccountId}));
      const results=await db("rpc/normalize_commerce_transaction_page_v2",{method:"POST",body:JSON.stringify({p_organization_id:organizationId,p_account_id:accountId,p_connection_id:connectionId,p_provider_account_id:providerAccountId,p_evidence_id:evidenceId,p_records:normalized})});const result=results[0]||{};
      recordsSeen+=Number(result.records_seen||0);recordsCreated+=Number(result.orders_created||0);recordsUpdated+=Number(result.orders_updated||0);pagesCompleted++;
      await db(`commerce_sync_checkpoints?id=eq.${checkpoint.id}`,{method:"PATCH",body:JSON.stringify({state:"completed",source_total_items:totalItems,source_total_pages:totalPages,page_fingerprint:stored.payloadHash,first_source_id:ids[0]||null,last_source_id:ids.at(-1)||null,completed_at:new Date().toISOString(),metadata:{duration_ms:Date.now()-pageStart,provider_attempts:providerAttempts,rate_limit_remaining:rateRemaining,replayed_evidence:providerAttempts===0}})});
      await db(`commerce_sync_runs?id=eq.${runId}`,{method:"PATCH",body:JSON.stringify({source_total_items:totalItems,pages_planned:totalPages,pages_completed:pagesCompleted,records_seen:recordsSeen,records_created:recordsCreated,records_updated:recordsUpdated,warnings_count:warnings,metadata:{normalizer_version:NORMALIZER_VERSION,per_page:PER_PAGE,provider_requests:providerRequests,retries,last_page_duration_ms:Date.now()-pageStart}})});
      await db("rpc/heartbeat_commerce_sync_run",{method:"POST",body:JSON.stringify({p_run_id:runId,p_organization_id:organizationId,p_connection_id:connectionId,p_lease_owner:repositoryOwner,p_lease_seconds:LEASE_SECONDS})});
      if(page%25===0)console.log(JSON.stringify({event:"shadow_sync_progress",runId,page,pagesPlanned:totalPages,recordsSeen,recordsCreated,recordsUpdated,warnings}));
      if(rateRemaining!==null&&rateRemaining<100)await sleep(5_000);else await sleep(PACE_MS); if(!parsed.pagination.hasMore||(overlapPages&&page>=overlapPages))break;page++;
    }
    await db("rpc/transition_commerce_sync_run",{method:"POST",body:JSON.stringify({p_run_id:runId,p_organization_id:organizationId,p_connection_id:connectionId,p_lease_owner:repositoryOwner,p_transition:warnings?"completed_with_warnings":"completed",p_error_code:null,p_error_summary:null})});
    console.log(JSON.stringify({event:"shadow_sync_completed",runId,pagesCompleted,recordsSeen,recordsCreated,recordsUpdated,warnings,providerRequests,retries,durationMs:Date.now()-started}));
  }catch(error){await db("rpc/transition_commerce_sync_run",{method:"POST",body:JSON.stringify({p_run_id:runId,p_organization_id:organizationId,p_connection_id:connectionId,p_lease_owner:repositoryOwner,p_transition:"failed",p_error_code:"shadow_sync_failed",p_error_summary:"Shadow Sync stopped safely."})}).catch(()=>{});throw error;}
}
void main();
