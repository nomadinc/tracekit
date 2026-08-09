import { randomUUID } from "node:crypto";
import { decodeCommerceCredentialKey, decryptCommerceCredential } from "./credential-crypto";
import { normalizeCommasTransaction } from "./commas-shadow-normalizer";
import { SupabaseCommerceEvidenceStore } from "./supabase-evidence-store-core";
import {
  COMMERCE_EVIDENCE_CONTRACT_VERSION, CONTINUOUS_NORMALIZER_VERSION, DEFAULT_OVERLAP_PAGES,
  advanceStability, classifySource, contentFingerprint, continuousStopDecision, detectProviderOrdering,
  firstContinuousPages, parseContinuousPage, rateLimitDelay, type ProviderOrdering, type SourceChange, type StabilityState,
} from "./continuous-intelligence";

type Row = Record<string, unknown>;
type RateLimit = { limit: number | null; remaining: number | null; reset: string | null };

export type ContinuousSyncResult = {
  runId:string; status:"completed"|"completed_with_warnings"; providerRequests:number; pagesScanned:number;
  recordsObserved:number; recordsNew:number; recordsUpdated:number; recordsUnchanged:number; recordsFailed:number;
  refundsNew:number; refundsUpdated:number; evidenceWrites:number; evidenceReuses:number; durationMs:number;
  averagePageDurationMs:number; retries:number; rateLimitStart:number|null; rateLimitEnd:number|null;
  stoppingReason:string; pageShiftDetected:boolean; deeperReconciliationRequired:boolean; ordering:ProviderOrdering;
};

function configuration() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,"");
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error("Continuous Commerce persistence is unavailable.");
  return {url,key};
}

async function db(path:string,init:RequestInit={}) {
  const {url,key}=configuration();
  const response=await fetch(`${url}/rest/v1/${path}`,{...init,cache:"no-store",headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json",Prefer:"return=representation",...init.headers}});
  if(!response.ok) throw new Error(`Continuous Commerce persistence failed (${response.status}).`);
  if(response.status===204)return [] as Row[];
  const value=await response.json() as unknown;
  return (Array.isArray(value)?value:[value]) as Row[];
}

const object=(value:unknown):Row|null=>value&&typeof value==="object"&&!Array.isArray(value)?value as Row:null;
const number=(value:unknown)=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;};
const sleep=(ms:number)=>new Promise((resolve)=>setTimeout(resolve,ms));
const bytea=(value:unknown)=>Uint8Array.from(Buffer.from(String(value).replace(/^\\x/,""),"hex"));

async function fetchProviderPage(secret:string,page:number,perPage:number,correlationId:string) {
  let lastStatus=0;
  for(let attempt=1;attempt<=3;attempt++) {
    try {
      const response=await fetch(`https://www.fanbasis.com/public-api/checkout-sessions/transactions?page=${page}&per_page=${perPage}`,{headers:{"x-api-key":secret,Accept:"application/json","x-correlation-id":correlationId},signal:AbortSignal.timeout(30_000)});
      lastStatus=response.status;
      const rateLimit:RateLimit={limit:number(response.headers.get("x-ratelimit-limit")),remaining:number(response.headers.get("x-ratelimit-remaining")),reset:response.headers.get("x-ratelimit-reset")};
      if(response.ok)return {bytes:new Uint8Array(await response.arrayBuffer()),rateLimit,attempts:attempt};
      if(![429,500,502,503,504].includes(response.status)) throw new Error("Commas rejected the continuous sync request.");
      await sleep(rateLimitDelay({status:response.status,retryAfterSeconds:number(response.headers.get("retry-after")),remaining:rateLimit.remaining,attempt}));
    } catch(error) {
      if(attempt===3)throw error;
      await sleep(rateLimitDelay({status:lastStatus,retryAfterSeconds:null,remaining:null,attempt}));
    }
  }
  throw new Error(`Commas continuous sync exhausted retries (${lastStatus||"network"}).`);
}

async function scopedConnection() {
  const connections=await db("commerce_provider_connections?provider=eq.commas&status=eq.connected&select=id,organization_id,account_id&limit=2");
  if(connections.length!==1)throw new Error("Continuous sync requires exactly one connected Commas Connection.");
  const connectionId=String(connections[0].id),organizationId=String(connections[0].organization_id),accountId=String(connections[0].account_id);
  const accounts=await db(`commerce_provider_accounts?connection_id=eq.${connectionId}&organization_id=eq.${organizationId}&status=eq.active&select=id&limit=2`);
  if(accounts.length!==1)throw new Error("Continuous sync requires one active Provider Account.");
  const providerAccountId=String(accounts[0].id);
  const credentials=await db(`commerce_provider_credentials?connection_id=eq.${connectionId}&organization_id=eq.${organizationId}&revoked_at=is.null&select=encryption_key_id,encryption_version,secret_iv,secret_ciphertext&limit=2`);
  if(credentials.length!==1)throw new Error("Continuous sync credential unavailable.");
  const keyId=process.env.COMMERCE_CREDENTIALS_KEY_ID,version=Number(process.env.COMMERCE_CREDENTIALS_ENCRYPTION_VERSION||"1"),credential=credentials[0];
  if(!keyId||credential.encryption_key_id!==keyId||Number(credential.encryption_version)!==version)throw new Error("Credential encryption configuration mismatch.");
  const secret=await decryptCommerceCredential({keyId,encryptionVersion:version,iv:bytea(credential.secret_iv),ciphertext:bytea(credential.secret_ciphertext)},decodeCommerceCredentialKey(process.env.COMMERCE_CREDENTIALS_ENC_KEY));
  return {connectionId,organizationId,accountId,providerAccountId,secret};
}

async function evidenceForPage(input:{organizationId:string;connectionId:string;providerAccountId:string;runId:string;page:number;perPage:number;bytes:Uint8Array}) {
  const store=new SupabaseCommerceEvidenceStore();
  const stored=await store.putImmutable({organizationId:input.organizationId,connectionId:input.connectionId,providerAccountId:input.providerAccountId,sourceObjectType:"transaction_page",payload:input.bytes,contentType:"application/json"});
  if(!await store.verifyHash({organizationId:input.organizationId,storageReference:stored.storageReference,payloadHash:stored.payloadHash})) throw new Error("Evidence hash verification failed.");
  const existing=await db(`commerce_evidence_records?storage_backend=eq.object_storage&storage_reference=eq.${encodeURIComponent(stored.storageReference)}&select=id&limit=1`);
  if(existing[0])return {evidenceId:String(existing[0].id),stored,reused:true};
  const rows=await db("commerce_evidence_records",{method:"POST",body:JSON.stringify({organization_id:input.organizationId,connection_id:input.connectionId,provider_account_id:input.providerAccountId,sync_run_id:input.runId,source_object_type:"transaction_page",source_object_id:`continuous:page:${input.page}:per_page:${input.perPage}`,payload_hash:stored.payloadHash,storage_backend:"object_storage",storage_reference:stored.storageReference,content_type:stored.contentType,byte_size:stored.byteSize,observed_at:new Date().toISOString(),normalizer_version:CONTINUOUS_NORMALIZER_VERSION,mapping_version:"unmapped-v1",pii_classification:"sensitive",retention_policy:COMMERCE_EVIDENCE_CONTRACT_VERSION,metadata:{immutable:true,continuous:true}})});
  return {evidenceId:String(rows[0].id),stored,reused:false};
}

function inFilter(values:string[]) { return `(${values.map((value)=>`"${value.replaceAll('"','')}"`).join(",")})`; }

async function priorMappings(connectionId:string,providerAccountId:string,type:string,ids:string[]) {
  if(!ids.length)return new Map<string,{payloadHash:string;mappingVersion:string}>();
  const rows=await db(`commerce_source_mappings?connection_id=eq.${connectionId}&provider_account_id=eq.${providerAccountId}&source_object_type=eq.${type}&source_object_id=in.${encodeURIComponent(inFilter(ids))}&select=source_object_id,payload_hash,mapping_version`);
  return new Map(rows.map((row)=>[String(row.source_object_id),{payloadHash:String(row.payload_hash),mappingVersion:String(row.mapping_version)}]));
}

async function ensureCheckpoint(input:{runId:string;organizationId:string;connectionId:string;providerAccountId:string;page:number;perPage:number}) {
  const existing=await db(`commerce_sync_checkpoints?sync_run_id=eq.${input.runId}&resource=eq.transactions&page=eq.${input.page}&per_page=eq.${input.perPage}&select=*&limit=1`);
  if(existing[0]) { await db(`commerce_sync_checkpoints?id=eq.${existing[0].id}`,{method:"PATCH",body:JSON.stringify({state:"running",updated_at:new Date().toISOString()})}); return existing[0]; }
  return (await db("commerce_sync_checkpoints",{method:"POST",body:JSON.stringify({sync_run_id:input.runId,organization_id:input.organizationId,connection_id:input.connectionId,provider_account_id:input.providerAccountId,resource:"transactions",page:input.page,per_page:input.perPage,state:"running"})}))[0];
}

async function audit(scope:{accountId:string;organizationId:string},action:string,runId:string,result:"success"|"failure",metadata:Record<string,unknown>={}) {
  await db("tracekit_audit_events",{method:"POST",body:JSON.stringify({actor_user_id:null,authenticated_identity_id:"background:commerce-worker",account_id:scope.accountId,organization_id:scope.organizationId,action,target_type:"commerce_sync_run",target_id:runId,result,correlation_id:runId,metadata})});
}

async function ensureReferenceInvestigationDependencies(scope:{accountId:string;organizationId:string;connectionId:string;providerAccountId:string}) {
  const investigations=await db(`tracekit_investigations?organization_id=eq.${scope.organizationId}&title=in.${encodeURIComponent(inFilter(["Accufy Chargeback Investigation","OTO2 Selective Dispute Analysis"]))}&select=id,title`);
  const products=await db(`commerce_provider_products?organization_id=eq.${scope.organizationId}&connection_id=eq.${scope.connectionId}&provider_account_id=eq.${scope.providerAccountId}&title=eq.${encodeURIComponent("OTO2-platinum")}&select=provider_product_id&limit=1`);
  for(const investigation of investigations) {
    const investigationId=String(investigation.id);
    const versions=await db(`tracekit_investigation_versions?organization_id=eq.${scope.organizationId}&investigation_id=eq.${investigationId}&order=version_number.desc&select=id,period_start,period_end&limit=1`);
    if(!versions[0])continue;
    const isChild=String(investigation.title)==="OTO2 Selective Dispute Analysis";
    if(isChild&&!products[0])continue;
    const entityId=isChild&&products[0]?String(products[0].provider_product_id):null;
    const existing=await db(`tracekit_investigation_dependencies?organization_id=eq.${scope.organizationId}&investigation_id=eq.${investigationId}&resource_type=eq.transactions&entity_type=${entityId?"eq.provider_product":"is.null"}&select=id&limit=1`);
    if(!existing[0])await db("tracekit_investigation_dependencies",{method:"POST",body:JSON.stringify({account_id:scope.accountId,organization_id:scope.organizationId,investigation_id:investigationId,resource_type:"transactions",entity_type:entityId?"provider_product":null,entity_id:entityId,period_start:versions[0].period_start??null,period_end:versions[0].period_end??null,dependency_version:"continuous-commerce-v1"})});
    const freshness=await db(`tracekit_investigation_freshness?organization_id=eq.${scope.organizationId}&investigation_id=eq.${investigationId}&select=investigation_id&limit=1`);
    if(!freshness[0])await db("tracekit_investigation_freshness",{method:"POST",body:JSON.stringify({account_id:scope.accountId,organization_id:scope.organizationId,investigation_id:investigationId,current_version_id:versions[0].id,freshness_status:"current",reasons:[]})});
  }
}

export async function runContinuousCommasSync(options:{mode?:"continuous"|"deep_reconciliation";maxPages?:number;overlapPages?:number;perPage?:number;paceMs?:number;requestKey?:string}={}):Promise<ContinuousSyncResult> {
  const mode=options.mode??"continuous",perPage=options.perPage??100,maxPages=mode==="deep_reconciliation"?options.maxPages??Number.MAX_SAFE_INTEGER:options.maxPages??8,overlapPages=options.overlapPages??DEFAULT_OVERLAP_PAGES,paceMs=options.paceMs??100;
  if(perPage<1||perPage>100||maxPages<1||overlapPages<1)throw new Error("Continuous sync bounds are invalid.");
  const scope=await scopedConnection(),owner=`commas-continuous-${randomUUID()}`,started=Date.now();
  await ensureReferenceInvestigationDependencies(scope);
  const key=options.requestKey??contentFingerprint({connectionId:scope.connectionId,providerAccountId:scope.providerAccountId,resource:"transactions",mode,bucket:new Date().toISOString().slice(0,16)});
  const enqueued=await db("rpc/enqueue_commerce_continuous_sync",{method:"POST",body:JSON.stringify({p_account_id:scope.accountId,p_organization_id:scope.organizationId,p_connection_id:scope.connectionId,p_provider_account_id:scope.providerAccountId,p_resource:"transactions",p_mode:mode,p_idempotency_key:key})});
  const runId=String(enqueued[0].id);
  const claimed=await db("rpc/claim_commerce_sync_run",{method:"POST",body:JSON.stringify({p_run_id:runId,p_organization_id:scope.organizationId,p_connection_id:scope.connectionId,p_lease_owner:owner,p_lease_seconds:900})});
  if(!claimed[0])throw new Error("Continuous sync lease unavailable.");
  await audit(scope,mode==="deep_reconciliation"?"commerce.deep_reconciliation_started":"commerce.continuous_sync_started",runId,"success",{resource:"transactions",mode}).catch(()=>{});
  const priorState=(await db(`commerce_continuous_sync_state?connection_id=eq.${scope.connectionId}&provider_account_id=eq.${scope.providerAccountId}&resource=eq.transactions&select=*&limit=1`))[0];
  const priorFingerprints=(object(priorState?.page_fingerprints)||{});
  let providerRequests=0,pagesScanned=0,recordsObserved=0,recordsNew=0,recordsUpdated=0,recordsUnchanged=0,recordsFailed=0,refundsNew=0,refundsUpdated=0,evidenceWrites=0,evidenceReuses=0,retries=0;
  let rateLimitStart:number|null=null,rateLimitEnd:number|null=null,providerTotalStart:number|null=null,providerTotalEnd:number|null=null,ordering:ProviderOrdering="unknown",stoppingReason="bounded_scan_limit",deeperReconciliationRequired=false;
  let stability:StabilityState={consecutiveStableKnownPages:0,pagesScanned:0,unseenRecords:0,changedRecords:0,pageShiftDetected:false};
  const pageDurations:number[]=[],fingerprints:Record<string,unknown>={...priorFingerprints},recentIds:string[]=[],changedRows:ReturnType<typeof normalizeCommasTransaction>[]=[],changedProductIds=new Set<string>();
  try {
    const queue:number[]=[1]; const queued=new Set(queue); let queueIndex=0;
    while(queueIndex<queue.length&&pagesScanned<maxPages) {
      const page=queue[queueIndex++],pageStarted=Date.now();
      const checkpoint=await ensureCheckpoint({...scope,runId,page,perPage});
      try {
        const fetched=await fetchProviderPage(scope.secret,page,perPage,owner); providerRequests++; retries+=fetched.attempts-1;
        rateLimitStart??=fetched.rateLimit.remaining;rateLimitEnd=fetched.rateLimit.remaining;
        const evidence=await evidenceForPage({...scope,runId,page,perPage,bytes:fetched.bytes}); evidence.reused?evidenceReuses++:evidenceWrites++;
        const parsed=parseContinuousPage(fetched.bytes); providerTotalStart??=parsed.totalItems;providerTotalEnd=parsed.totalItems;
        const timestamps=parsed.items.map((item)=>String(item.transaction_date));
        let metadataProbe=false;
        if(page===1) {
          ordering=detectProviderOrdering(timestamps);
          const planned=firstContinuousPages(ordering,parsed.totalPages,overlapPages);
          metadataProbe=ordering==="oldest_first"&&!planned.includes(1);
          for(const plannedPage of planned)if(!queued.has(plannedPage)){queue.push(plannedPage);queued.add(plannedPage);}
        }
        const normalized=parsed.items.map((item)=>normalizeCommasTransaction(item,{connectionId:scope.connectionId,providerAccountId:scope.providerAccountId}));
        const mappings=await priorMappings(scope.connectionId,scope.providerAccountId,"transaction",normalized.map((item)=>item.transaction_id));
        const knownIds=new Set(mappings.keys());
        const changes=normalized.map((item):SourceChange=>{const prior=mappings.get(item.transaction_id);return classifySource({priorPayloadHash:prior?.payloadHash,nextPayloadHash:item.payload_hash,priorNormalizerVersion:prior?.mappingVersion,nextNormalizerVersion:CONTINUOUS_NORMALIZER_VERSION});});
        const toNormalize=normalized.filter((_,index)=>changes[index]!=="source_identical");
        const refundIds=toNormalize.flatMap((item)=>item.refunds.map((refund)=>refund.refund_id));
        const refundMappings=await priorMappings(scope.connectionId,scope.providerAccountId,"refund",refundIds);
        for(const item of toNormalize)for(const refund of item.refunds){const prior=refundMappings.get(refund.refund_id);if(!prior)refundsNew++;else if(prior.payloadHash!==refund.payload_hash)refundsUpdated++;}
        if(toNormalize.length) {
          await db("rpc/normalize_commerce_transaction_page_v2",{method:"POST",body:JSON.stringify({p_organization_id:scope.organizationId,p_account_id:scope.accountId,p_connection_id:scope.connectionId,p_provider_account_id:scope.providerAccountId,p_evidence_id:evidence.evidenceId,p_records:toNormalize})});
          changedRows.push(...toNormalize);toNormalize.forEach((item)=>changedProductIds.add(item.product_id));
        }
        const newCount=changes.filter((change)=>change==="new").length,updatedCount=changes.filter((change)=>change==="source_changed"||change==="normalizer_changed").length,unchangedCount=changes.filter((change)=>change==="source_identical").length;
        recordsObserved+=normalized.length;recordsNew+=newCount;recordsUpdated+=updatedCount;recordsUnchanged+=unchangedCount;recentIds.push(...normalized.map((item)=>item.transaction_id));
        const fingerprint=contentFingerprint(parsed.items);fingerprints[String(page)]={content_hash:fingerprint,evidence_hash:evidence.stored.payloadHash,first_id:normalized[0]?.transaction_id??null,last_id:normalized.at(-1)?.transaction_id??null,observed_at:new Date().toISOString()};
        if(!metadataProbe)stability=advanceStability(stability,{page,totalPages:parsed.totalPages,totalItems:parsed.totalItems,ids:normalized.map((item)=>item.transaction_id),timestamps,fingerprint,knownIds,priorFingerprint:object(priorFingerprints[String(page)])?.content_hash?String(object(priorFingerprints[String(page)])!.content_hash):null},changes);
        pagesScanned++;pageDurations.push(Date.now()-pageStarted);
        await db(`commerce_sync_checkpoints?id=eq.${checkpoint.id}`,{method:"PATCH",body:JSON.stringify({state:"completed",source_total_items:parsed.totalItems,source_total_pages:parsed.totalPages,page_fingerprint:fingerprint,first_source_id:normalized[0]?.transaction_id??null,last_source_id:normalized.at(-1)?.transaction_id??null,completed_at:new Date().toISOString(),metadata:{duration_ms:pageDurations.at(-1),provider_attempts:fetched.attempts,rate_limit_remaining:fetched.rateLimit.remaining,new_records:newCount,updated_records:updatedCount,unchanged_records:unchangedCount,evidence_reused:evidence.reused}})});
        let decision=continuousStopDecision({state:stability,ordering,page,totalPages:parsed.totalPages,maxPages,rateLimitRemaining:fetched.rateLimit.remaining});
        if(mode==="deep_reconciliation"&&decision.reason==="stable_known_boundary") {
          decision=page>=maxPages?{stop:true,reason:"bounded_deep_reconciliation_proof",deeperReconciliationRequired:true}:parsed.totalPages!==null&&page>=parsed.totalPages?{stop:true,reason:"provider_history_boundary",deeperReconciliationRequired:false}:{stop:false,reason:null,deeperReconciliationRequired:false};
        }
        if(decision.stop){stoppingReason=decision.reason!;deeperReconciliationRequired=decision.deeperReconciliationRequired;break;}
        const next=ordering==="oldest_first"?page+1:page+1;if(parsed.hasMore&&!queued.has(next)){queue.push(next);queued.add(next);}
        await db("rpc/heartbeat_commerce_sync_run",{method:"POST",body:JSON.stringify({p_run_id:runId,p_organization_id:scope.organizationId,p_connection_id:scope.connectionId,p_lease_owner:owner,p_lease_seconds:900})});
        await sleep(fetched.rateLimit.remaining!==null&&fetched.rateLimit.remaining<100?5_000:paceMs);
      } catch(error) {
        recordsFailed++;
        await db(`commerce_sync_checkpoints?id=eq.${checkpoint.id}`,{method:"PATCH",body:JSON.stringify({state:"failed",retry_count:Number(checkpoint.retry_count||0)+1,metadata:{error_code:"continuous_page_failed",retryable:true}})}).catch(()=>{});
        throw error;
      }
    }
    const now=new Date().toISOString(),latestTransactionAt=changedRows.map((item)=>item.transaction_at).sort().at(-1)??(priorState?.latest_provider_transaction_at?String(priorState.latest_provider_transaction_at):null);
    const boundedDeepProof=mode==="deep_reconciliation"&&stoppingReason==="bounded_deep_reconciliation_proof";
    await db("commerce_continuous_sync_state?on_conflict=connection_id,provider_account_id,resource",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({account_id:scope.accountId,organization_id:scope.organizationId,connection_id:scope.connectionId,provider_account_id:scope.providerAccountId,resource:"transactions",last_attempted_at:now,last_successful_at:now,last_provider_observation_at:now,last_normalized_record_at:changedRows.length?now:priorState?.last_normalized_record_at??null,latest_provider_transaction_at:latestTransactionAt,provider_total_observed:providerTotalEnd,recent_source_ids:Array.from(new Set(recentIds)).slice(0,300),page_fingerprints:fingerprints,last_stability_boundary:boundedDeepProof?priorState?.last_stability_boundary??{}:{known_pages:stability.consecutiveStableKnownPages,pages_scanned:pagesScanned,page_shift_detected:stability.pageShiftDetected},last_stopping_reason:boundedDeepProof?priorState?.last_stopping_reason??null:stoppingReason,last_deep_reconciliation_at:mode==="deep_reconciliation"&&stoppingReason==="provider_history_boundary"?now:priorState?.last_deep_reconciliation_at??null,normalizer_version:CONTINUOUS_NORMALIZER_VERSION,evidence_contract_version:COMMERCE_EVIDENCE_CONTRACT_VERSION,status:boundedDeepProof?priorState?.status??"unknown":deeperReconciliationRequired?"degraded":"current",attribution_source_state:"unavailable",warnings:boundedDeepProof?priorState?.warnings??[]:deeperReconciliationRequired?[{code:"deep_reconciliation_required"}]:[],updated_at:now})});
    if(changedRows.length) {
      const newest=changedRows.map((item)=>item.transaction_at).sort().at(-1)!;
      await db("rpc/mark_investigation_new_evidence",{method:"POST",body:JSON.stringify({p_organization_id:scope.organizationId,p_resource_type:"transactions",p_entity_type:null,p_entity_id:null,p_observed_at:newest,p_reason:"new_or_changed_commerce_transaction"})});
      for(const productId of Array.from(changedProductIds))await db("rpc/mark_investigation_new_evidence",{method:"POST",body:JSON.stringify({p_organization_id:scope.organizationId,p_resource_type:"transactions",p_entity_type:"provider_product",p_entity_id:productId,p_observed_at:newest,p_reason:"product_commerce_evidence_changed"})});
    }
    const warnings=deeperReconciliationRequired?1:0,status=warnings?"completed_with_warnings":"completed";
    await db(`commerce_sync_runs?id=eq.${runId}`,{method:"PATCH",body:JSON.stringify({source_total_items:providerTotalEnd,pages_planned:null,pages_completed:pagesScanned,records_seen:recordsObserved,records_created:recordsNew,records_updated:recordsUpdated,records_unchanged:recordsUnchanged,records_failed:recordsFailed,warnings_count:warnings,provider_request_count:providerRequests,evidence_writes:evidenceWrites,evidence_reuses:evidenceReuses,provider_total_start:providerTotalStart,provider_total_end:providerTotalEnd,stopping_reason:stoppingReason,overlap_pages_scanned:pagesScanned,page_shift_detected:stability.pageShiftDetected,deeper_reconciliation_required:deeperReconciliationRequired,freshness_result:changedRows.length?"changed":"current",metadata:{normalizer_version:CONTINUOUS_NORMALIZER_VERSION,evidence_contract_version:COMMERCE_EVIDENCE_CONTRACT_VERSION,retries,rate_limit_start:rateLimitStart,rate_limit_end:rateLimitEnd,refunds_new:refundsNew,refunds_updated:refundsUpdated,ordering}})});
    await db("rpc/transition_commerce_sync_run",{method:"POST",body:JSON.stringify({p_run_id:runId,p_organization_id:scope.organizationId,p_connection_id:scope.connectionId,p_lease_owner:owner,p_transition:status,p_error_code:null,p_error_summary:null})});
    await audit(scope,mode==="deep_reconciliation"?"commerce.deep_reconciliation_completed":"commerce.continuous_sync_completed",runId,"success",{resource:"transactions",mode,pages_scanned:pagesScanned,records_new:recordsNew,records_updated:recordsUpdated,records_unchanged:recordsUnchanged,stopping_reason:stoppingReason}).catch(()=>{});
    return {runId,status,providerRequests,pagesScanned,recordsObserved,recordsNew,recordsUpdated,recordsUnchanged,recordsFailed,refundsNew,refundsUpdated,evidenceWrites,evidenceReuses,durationMs:Date.now()-started,averagePageDurationMs:pageDurations.length?Math.round(pageDurations.reduce((a,b)=>a+b,0)/pageDurations.length):0,retries,rateLimitStart,rateLimitEnd,stoppingReason,pageShiftDetected:stability.pageShiftDetected,deeperReconciliationRequired,ordering};
  } catch(error) {
    await db(`commerce_continuous_sync_state?on_conflict=connection_id,provider_account_id,resource`,{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({account_id:scope.accountId,organization_id:scope.organizationId,connection_id:scope.connectionId,provider_account_id:scope.providerAccountId,resource:"transactions",last_attempted_at:new Date().toISOString(),normalizer_version:CONTINUOUS_NORMALIZER_VERSION,evidence_contract_version:COMMERCE_EVIDENCE_CONTRACT_VERSION,status:"failed",attribution_source_state:"unavailable",warnings:[{code:"continuous_sync_failed"}],updated_at:new Date().toISOString()})}).catch(()=>{});
    await db("rpc/transition_commerce_sync_run",{method:"POST",body:JSON.stringify({p_run_id:runId,p_organization_id:scope.organizationId,p_connection_id:scope.connectionId,p_lease_owner:owner,p_transition:"failed",p_error_code:"continuous_sync_failed",p_error_summary:"Continuous Commerce sync stopped safely."})}).catch(()=>{});
    await audit(scope,mode==="deep_reconciliation"?"commerce.deep_reconciliation_failed":"commerce.continuous_sync_failed",runId,"failure",{resource:"transactions",mode,error_code:"continuous_sync_failed"}).catch(()=>{});
    throw error;
  }
}
