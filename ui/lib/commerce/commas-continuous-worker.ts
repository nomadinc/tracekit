import { randomUUID } from "node:crypto";
import { buildContinuousWorkerRequestInit } from "./continuous-worker-request";
import { decodeHex } from "./web-encoding.ts";
import { decodeCommerceCredentialKey, decryptCommerceCredential } from "./credential-crypto";
import { normalizeCommasTransaction } from "./commas-shadow-normalizer";
import { SupabaseCommerceEvidenceStore } from "./supabase-evidence-store-core";
import {
  COMMERCE_EVIDENCE_CONTRACT_VERSION, CONTINUOUS_NORMALIZER_VERSION, DEFAULT_OVERLAP_PAGES,
  advanceStability, classifySource, contentFingerprint, continuousRequestBounds, continuousStopDecision, detectProviderOrdering,
  firstContinuousPages, initialOrderingObserver, isExpectedNewestFirstHeadInsertion, observeOrderingPage, parseContinuousPage, rateLimitDelay, type OrderingObserverState,
  type ProviderOrdering, type SourceChange, type StabilityState,
} from "./continuous-intelligence";

type Row = Record<string, unknown>;
type RateLimit = { limit: number | null; remaining: number | null; reset: string | null };
export const COMMAS_QUOTA_OBSERVATION_MAX_AGE_MS = 15 * 60 * 1000;
export function isFreshCommasQuotaObservation(observedAt: string | null | undefined, now = Date.now()) {
  const timestamp = observedAt ? Date.parse(observedAt) : NaN;
  return Number.isFinite(timestamp) && timestamp <= now && now - timestamp <= COMMAS_QUOTA_OBSERVATION_MAX_AGE_MS;
}

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

export type CommercePersistenceDiagnostic = { status:number; code:string; message:string; detail:string; hint:string; table:string; operation:string };
const safePersistenceText=(value:unknown)=>String(value??"")
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,"[redacted-email]")
  .replace(/Bearer\s+\S+/gi,"[redacted-auth]")
  .replace(/[^a-zA-Z0-9_.:() /-]/g,"_").slice(0,160);
export function persistenceDiagnostic(status:number,path:string,method:string,body:Row):CommercePersistenceDiagnostic {
  return {
    status,
    code:safePersistenceText(body.code||body.error_code||"http_error")||"http_error",
    message:safePersistenceText(body.message), detail:safePersistenceText(body.details||body.detail), hint:safePersistenceText(body.hint),
    table:path.split("?",1)[0].slice(0,120), operation:String(method||"GET").toUpperCase(),
  };
}

async function db(path:string,init:RequestInit={}) {
  const {url,key}=configuration();
  const response=await fetch(`${url}/rest/v1/${path}`,buildContinuousWorkerRequestInit(key,init));
  if(!response.ok) {
    let body:Row={};
    try { body=object(await response.json())??{}; } catch { /* preserve the HTTP failure when the body is not JSON */ }
    const diagnostic=persistenceDiagnostic(response.status,path,String(init.method||"GET"),body);
    const error=new Error(`Continuous Commerce persistence failed (${response.status}): ${diagnostic.code}`) as Error & { persistence?: typeof diagnostic };
    error.persistence=diagnostic;
    throw error;
  }
  if(response.status===204)return [] as Row[];
  const value=await response.json() as unknown;
  return (Array.isArray(value)?value:[value]) as Row[];
}

const object=(value:unknown):Row|null=>value&&typeof value==="object"&&!Array.isArray(value)?value as Row:null;
const number=(value:unknown)=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;};
const sleep=(ms:number)=>new Promise((resolve)=>setTimeout(resolve,ms));
const bytea=(value:unknown)=>decodeHex(String(value));

export type ContinuousCheckpointProgress = {
  pagesCompleted: number;
  providerRequests: number;
  recordsSeen: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsUnchanged: number;
  evidenceWrites: number;
  evidenceReuses: number;
};

export function summarizeContinuousCheckpointProgress(rows: Row[]): ContinuousCheckpointProgress {
  return rows.filter((row)=>String(row.state||"")==="completed").reduce<ContinuousCheckpointProgress>((total,row)=>{
    const metadata=object(row.metadata)||{};
    const created=number(metadata.new_records)??0;
    const updated=number(metadata.updated_records)??0;
    const unchanged=number(metadata.unchanged_records)??0;
    return {
      pagesCompleted: total.pagesCompleted+1,
      providerRequests: total.providerRequests+(number(metadata.provider_attempts)??0),
      recordsSeen: total.recordsSeen+created+updated+unchanged,
      recordsCreated: total.recordsCreated+created,
      recordsUpdated: total.recordsUpdated+updated,
      recordsUnchanged: total.recordsUnchanged+unchanged,
      evidenceWrites: total.evidenceWrites+(metadata.evidence_reused===true?0:1),
      evidenceReuses: total.evidenceReuses+(metadata.evidence_reused===true?1:0),
    };
  },{pagesCompleted:0,providerRequests:0,recordsSeen:0,recordsCreated:0,recordsUpdated:0,recordsUnchanged:0,evidenceWrites:0,evidenceReuses:0});
}

const lifetimeCheckpointFields = ["provider_attempts","new_records","updated_records","unchanged_records","evidence_reused"] as const;
export function evidenceOnlyCheckpointMetadata(existingValue:unknown,replayValue:Row):Row {
  const existing=object(existingValue)||{};
  for(const field of lifetimeCheckpointFields)if(existing[field]===undefined)throw new Error(`Evidence-only recovery requires lifetime checkpoint ${field}.`);
  return {...replayValue,...Object.fromEntries(lifetimeCheckpointFields.map((field)=>[field,existing[field]])),evidence_only_replay:{provider_attempts:number(replayValue.provider_attempts)??0,new_records:number(replayValue.new_records)??0,updated_records:number(replayValue.updated_records)??0,unchanged_records:number(replayValue.unchanged_records)??0,evidence_reused:replayValue.evidence_reused===true,completed_at:new Date().toISOString()}};
}

export function evidenceOnlyLifetimeProgress(runValue:unknown,checkpointProgress:ContinuousCheckpointProgress):ContinuousCheckpointProgress {
  const run=object(runValue)||{};
  const read=(field:string,fallback:number)=>number(run[field])??fallback;
  return {pagesCompleted:read("pages_completed",checkpointProgress.pagesCompleted),providerRequests:read("provider_request_count",checkpointProgress.providerRequests),recordsSeen:read("records_seen",checkpointProgress.recordsSeen),recordsCreated:read("records_created",checkpointProgress.recordsCreated),recordsUpdated:read("records_updated",checkpointProgress.recordsUpdated),recordsUnchanged:read("records_unchanged",checkpointProgress.recordsUnchanged),evidenceWrites:read("evidence_writes",checkpointProgress.evidenceWrites),evidenceReuses:read("evidence_reuses",checkpointProgress.evidenceReuses)};
}

export function firstRecoverableContinuousPage(rows: Row[]): number|null {
  const pages=rows.filter((row)=>String(row.state||"")==="running").map((row)=>Number(row.page)).filter((page)=>Number.isInteger(page)&&page>0);
  return pages.length?Math.min(...pages):null;
}

async function fetchProviderPage(secret:string,page:number,perPage:number,correlationId:string,maxAttempts=3) {
  let lastStatus=0;
  for(let attempt=1;attempt<=maxAttempts;attempt++) {
    try {
      const response=await fetch(`https://www.fanbasis.com/public-api/checkout-sessions/transactions?page=${page}&per_page=${perPage}`,{headers:{"x-api-key":secret,Accept:"application/json","x-correlation-id":correlationId},signal:AbortSignal.timeout(30_000)});
      lastStatus=response.status;
      const rateLimit:RateLimit={limit:number(response.headers.get("x-ratelimit-limit")),remaining:number(response.headers.get("x-ratelimit-remaining")),reset:response.headers.get("x-ratelimit-reset")};
      if(response.ok)return {bytes:new Uint8Array(await response.arrayBuffer()),rateLimit,attempts:attempt};
      if(![429,500,502,503,504].includes(response.status)) throw new Error("Commas rejected the continuous sync request.");
      await sleep(rateLimitDelay({status:response.status,retryAfterSeconds:number(response.headers.get("retry-after")),remaining:rateLimit.remaining,attempt}));
    } catch(error) {
      if(attempt===maxAttempts)throw error;
      await sleep(rateLimitDelay({status:lastStatus,retryAfterSeconds:null,remaining:null,attempt}));
    }
  }
  throw new Error(`Commas continuous sync exhausted retries (${lastStatus||"network"}).`);
}

export const STRANDED_RECOVERY_RUN_ID = "9c8731d7-1dae-4844-a7ce-0b6fccea170e";
export const FIXED_REDELIVERY_RUN_ID = "1f01c739-f609-4cf8-aff1-b2a5891ddd8a";
export const FIXED_REDELIVERY_CONNECTION_ID = "ea1c2313-6120-4692-84c5-ec3562e7dcf6";
export const FIXED_REDELIVERY_PROVIDER_ACCOUNT_ID = "0369c701-717f-4c34-b230-8341bcdb7e65";

export function fixedRedeliveryQuotaEligibility(input:{run:any;scope:{organizationId:string;connectionId:string;providerAccountId:string};checkpoints:any[];conflictingRuns:any[];markers:any[];schedule:any;paused:any[];liveActivation:any[];schedulerControls:any[]}){
  const run=input.run||{},metadata=object(run.metadata)||{},schedule=input.schedule||{};
  return run.id===FIXED_REDELIVERY_RUN_ID
    && run.organization_id===input.scope.organizationId
    && run.connection_id===FIXED_REDELIVERY_CONNECTION_ID
    && run.connection_id===input.scope.connectionId
    && run.provider_account_id===FIXED_REDELIVERY_PROVIDER_ACCOUNT_ID
    && run.provider_account_id===input.scope.providerAccountId
    && run.status==="queued" && run.mode==="continuous" && run.sync_type==="transactions"
    && run.started_at==null && run.completed_at==null && run.lease_owner==null && run.lease_expires_at==null
    && Number(run.pages_completed)===0 && Number(run.provider_request_count)===0 && Number(run.records_seen)===0
    && metadata.normal_acceptance===true && metadata.normal_acceptance_follow_up==="five_page"
    && metadata.follow_up_of==="b1547be9-31aa-4487-9c08-796f6fc49005"
    && metadata.shadow_only===true && metadata.acceptance_cycle===true && metadata.dispatch_source==="operator_one_shot"
    && Number(metadata.max_pages)===5 && Number(metadata.per_page)===100
    && run.scheduler_idempotency_key===`operator-normal-continuous-acceptance-5:${String(metadata.request_key||"")}`
    && input.checkpoints.length===0 && input.conflictingRuns.length===0 && input.markers.length===0
    && schedule.enabled===false && schedule.sync_frequency==="hourly" && schedule.activation_state!=="paused"
    && input.paused.length===0 && input.liveActivation.length===0 && input.schedulerControls.length===0;
}

export async function runFixedRedeliveryQuotaRefresh(options:{confirm:boolean}){
  if(!options.confirm)throw new Error("Fixed redelivery quota refresh requires explicit confirmation.");
  if(process.env.TRACEKIT_COMMERCE_KILL_SWITCH!=="enabled")throw new Error("Commerce kill switch blocks the fixed redelivery quota refresh.");
  if(process.env.TRACEKIT_COMMERCE_SCHEDULER_ENABLED!=="false")throw new Error("Fixed redelivery quota refresh requires the scheduler to remain disabled.");
  const scope=await scopedConnection();
  if(scope.connectionId!==FIXED_REDELIVERY_CONNECTION_ID||scope.providerAccountId!==FIXED_REDELIVERY_PROVIDER_ACCOUNT_ID)throw new Error("Fixed redelivery quota scope mismatch.");
  const [runs,checkpoints,conflictingRuns,markers,schedules,paused,liveActivation,schedulerControls]=await Promise.all([
    db(`commerce_sync_runs?id=eq.${FIXED_REDELIVERY_RUN_ID}&organization_id=eq.${scope.organizationId}&connection_id=eq.${scope.connectionId}&select=*&limit=1`),
    db(`commerce_sync_checkpoints?sync_run_id=eq.${FIXED_REDELIVERY_RUN_ID}&select=id&limit=1`),
    db(`commerce_sync_runs?organization_id=eq.${scope.organizationId}&connection_id=eq.${scope.connectionId}&status=in.(queued,running,paused)&id=neq.${FIXED_REDELIVERY_RUN_ID}&select=id&limit=1`),
    db(`commerce_normal_acceptance_redelivery_markers?run_id=eq.${FIXED_REDELIVERY_RUN_ID}&select=run_id,claimed_at,queue_dispatched_at&limit=1`),
    db(`commerce_sync_schedules?organization_id=eq.${scope.organizationId}&connection_id=eq.${scope.connectionId}&provider_account_id=eq.${scope.providerAccountId}&resource=eq.transactions&select=enabled,activation_state,sync_frequency&limit=2`),
    db(`commerce_connection_pauses?organization_id=eq.${scope.organizationId}&connection_id=eq.${scope.connectionId}&paused=eq.true&select=connection_id&limit=1`),
    db(`commerce_repository_activation?organization_id=eq.${scope.organizationId}&mode=in.(live,live_beta)&select=organization_id&limit=1`),
    db("tracekit_production_controls?capability=eq.commerce_scheduler&activation_state=eq.enabled&select=id&limit=1"),
  ]);
  const run=runs[0],runSnapshot=JSON.stringify(run);
  if(runs.length!==1||schedules.length!==1||!fixedRedeliveryQuotaEligibility({run,scope,checkpoints,conflictingRuns,markers,schedule:schedules[0],paused,liveActivation,schedulerControls}))throw new Error("Fixed redelivery quota scope is not eligible.");
  const fetched=await fetchProviderPage(scope.secret,1,1,`commas-fixed-redelivery-quota-${randomUUID()}`,1);
  const observedAt=new Date().toISOString(),quotaSource="operator_quota_probe_fixed_redelivery";
  await persistCommasQuotaObservation({accountId:scope.accountId,organizationId:scope.organizationId,connectionId:scope.connectionId,providerAccountId:scope.providerAccountId,quotaLimit:fetched.rateLimit.limit,quotaRemaining:fetched.rateLimit.remaining,quotaReset:fetched.rateLimit.reset,observedAt,quotaSource});
  const after=(await db(`commerce_sync_runs?id=eq.${FIXED_REDELIVERY_RUN_ID}&select=*&limit=1`))[0];
  if(JSON.stringify(after)!==runSnapshot)throw new Error("Fixed redelivery target changed during quota refresh.");
  return {provider:"commas",connectionId:scope.connectionId,providerAccountId:scope.providerAccountId,runId:FIXED_REDELIVERY_RUN_ID,providerRequests:1,quotaLimit:fetched.rateLimit.limit,quotaRemaining:fetched.rateLimit.remaining,quotaReset:fetched.rateLimit.reset,observedAt,source:quotaSource};
}

export async function runCommasQuotaProbe(options: { connectionId: string; confirm: boolean; forStrandedRecovery?: boolean }) {
  const expectedConnectionId = "ea1c2313-6120-4692-84c5-ec3562e7dcf6";
  if (!options.confirm) throw new Error("Commas quota probe requires explicit confirmation.");
  if (options.connectionId !== expectedConnectionId) throw new Error("Quota probe is restricted to the approved Commas connection.");
  if (process.env.TRACEKIT_COMMERCE_KILL_SWITCH !== "enabled") throw new Error("Commerce kill switch blocks the quota probe.");
  const scope = await scopedConnection();
  if (scope.connectionId !== expectedConnectionId) throw new Error("Quota probe connection scope mismatch.");
  const paused = await db(`commerce_connection_pauses?organization_id=eq.${scope.organizationId}&connection_id=eq.${scope.connectionId}&paused=eq.true&select=connection_id&limit=1`);
  if (paused.length) throw new Error("Quota probe connection is paused.");
  if (options.forStrandedRecovery) {
    const stranded = (await db(`commerce_sync_runs?id=eq.${STRANDED_RECOVERY_RUN_ID}&organization_id=eq.${scope.organizationId}&connection_id=eq.${scope.connectionId}&select=id,provider_account_id,status,mode,sync_type,lease_expires_at,metadata&limit=1`))[0];
    const metadata = object(stranded?.metadata) || {};
    const checkpoints = await db(`commerce_sync_checkpoints?sync_run_id=eq.${STRANDED_RECOVERY_RUN_ID}&resource=eq.transactions&select=page,state&order=page.asc`);
    const lowestIncomplete = checkpoints.filter((row)=>String(row.state || "") !== "completed").map((row)=>Number(row.page)).filter((page)=>Number.isInteger(page) && page > 0).sort((a,b)=>a-b)[0] ?? null;
    const evidence = await db(`commerce_evidence_records?sync_run_id=eq.${STRANDED_RECOVERY_RUN_ID}&source_object_type=eq.transaction_page&source_object_id=eq.continuous%3Apage%3A4%3Aper_page%3A100&select=id&limit=1`);
    const leaseExpired = Date.parse(String(stranded?.lease_expires_at || "")) < Date.now();
    const approved = stranded?.id === STRANDED_RECOVERY_RUN_ID
      && stranded.provider_account_id === scope.providerAccountId
      && stranded.status === "running"
      && stranded.mode === "continuous"
      && stranded.sync_type === "transactions"
      && leaseExpired
      && metadata.dispatch_source === "operator_one_shot"
      && metadata.acceptance_cycle === true
      && metadata.shadow_only === true
      && Number(metadata.max_pages) === 8
      && Number(metadata.per_page) === 100
      && metadata.operator_recovery_dispatched !== true
      && lowestIncomplete === 4
      && evidence.length === 1;
    if (!approved) throw new Error("Stranded recovery quota scope is not eligible.");
    const conflictingRuns = await db(`commerce_sync_runs?organization_id=eq.${scope.organizationId}&connection_id=eq.${scope.connectionId}&status=in.(queued,running,paused)&id=neq.${STRANDED_RECOVERY_RUN_ID}&select=id&limit=1`);
    if (conflictingRuns.length) throw new Error("Stranded recovery quota has a conflicting run.");
  } else {
    const activeRuns = await db(`commerce_sync_runs?organization_id=eq.${scope.organizationId}&connection_id=eq.${scope.connectionId}&status=in.(queued,running,paused)&select=id&limit=1`);
    if (activeRuns.length) throw new Error("Quota probe has a conflicting active run.");
  }
  const liveActivation = await db(`commerce_repository_activation?organization_id=eq.${scope.organizationId}&mode=in.(live,live_beta)&select=organization_id&limit=1`);
  if (liveActivation.length) throw new Error("Quota probe is blocked by live repository activation.");
  const fetched = await fetchProviderPage(scope.secret, 1, 1, `commas-quota-probe-${randomUUID()}`, 1);
  const observedAt = new Date().toISOString();
  const quotaSource: "operator_quota_probe_stranded_recovery" | "operator_quota_probe" = options.forStrandedRecovery
    ? "operator_quota_probe_stranded_recovery"
    : "operator_quota_probe";
  await persistCommasQuotaObservation({
    accountId:scope.accountId, organizationId:scope.organizationId, connectionId:scope.connectionId,
    providerAccountId:scope.providerAccountId, quotaLimit:fetched.rateLimit.limit,
    quotaRemaining:fetched.rateLimit.remaining, quotaReset:fetched.rateLimit.reset, observedAt,
    quotaSource,
  });
  return { provider: "commas", connectionId: scope.connectionId, providerAccountId: scope.providerAccountId, providerRequests: 1, quotaLimit: fetched.rateLimit.limit, quotaRemaining: fetched.rateLimit.remaining, quotaReset: fetched.rateLimit.reset, observedAt, source: quotaSource };
}

type QuotaObservation = {
  accountId:string; organizationId:string; connectionId:string; providerAccountId:string;
  quotaLimit:number|null; quotaRemaining:number|null; quotaReset:string|null; observedAt:string; quotaSource?:string;
};
type PersistenceRequest = (path:string, init?:RequestInit)=>Promise<Row[]>;

/** Persist an already-observed quota without ever refetching the provider. */
export async function persistCommasQuotaObservation(input:QuotaObservation, request:PersistenceRequest=db) {
  const quota={quota_limit:input.quotaLimit,quota_remaining:input.quotaRemaining,quota_reset:input.quotaReset,quota_observed_at:input.observedAt,quota_source:input.quotaSource||"operator_quota_probe",updated_at:input.observedAt};
  const scopeQuery=`commerce_continuous_sync_state?organization_id=eq.${input.organizationId}&connection_id=eq.${input.connectionId}&provider_account_id=eq.${input.providerAccountId}&resource=eq.transactions&select=id&limit=1`;
  const updated=await request(scopeQuery,{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify(quota)});
  if(updated.length)return {mode:"updated_existing" as const};
  const row={
    account_id:input.accountId,organization_id:input.organizationId,connection_id:input.connectionId,provider_account_id:input.providerAccountId,
    resource:"transactions",normalizer_version:CONTINUOUS_NORMALIZER_VERSION,evidence_contract_version:COMMERCE_EVIDENCE_CONTRACT_VERSION,
    status:"unknown",attribution_source_state:"unavailable",recent_source_ids:[],page_fingerprints:{},last_stability_boundary:{},warnings:[],...quota,
  };
  await request("commerce_continuous_sync_state",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(row)});
  return {mode:"created_state" as const};
}

async function scopedConnection(expected?:{organizationId:string;connectionId:string;providerAccountId:string}) {
  const connections=await db("commerce_provider_connections?provider=eq.commas&status=eq.connected&select=id,organization_id,account_id&limit=2");
  if(connections.length!==1)throw new Error("Continuous sync requires exactly one connected Commas Connection.");
  const connectionId=String(connections[0].id),organizationId=String(connections[0].organization_id),accountId=String(connections[0].account_id);
  const accounts=await db(`commerce_provider_accounts?connection_id=eq.${connectionId}&organization_id=eq.${organizationId}&status=eq.active&select=id&limit=2`);
  if(accounts.length!==1)throw new Error("Continuous sync requires one active Provider Account.");
  const providerAccountId=String(accounts[0].id);
  if(expected&&(`${expected.organizationId}:${expected.connectionId}:${expected.providerAccountId}`!==`${organizationId}:${connectionId}:${providerAccountId}`))throw new Error("Continuous sync provider scope does not match the scheduler request.");
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

async function replayEvidenceForPage(input:{organizationId:string;connectionId:string;providerAccountId:string;runId:string;page:number;perPage:number}) {
  const sourceObjectId=`continuous:page:${input.page}:per_page:${input.perPage}`;
  const rows=await db(`commerce_evidence_records?sync_run_id=eq.${encodeURIComponent(input.runId)}&source_object_type=eq.transaction_page&source_object_id=eq.${encodeURIComponent(sourceObjectId)}&select=id,payload_hash,storage_reference,content_type,byte_size&limit=1`);
  const row=rows[0];
  if(!row) return null;
  const storageReference=String(row.storage_reference||"");
  const payloadHash=String(row.payload_hash||"");
  if(!storageReference||!payloadHash) throw new Error("Existing Commerce Evidence reference is incomplete.");
  const store=new SupabaseCommerceEvidenceStore();
  const payload=await store.getAuthorized({organizationId:input.organizationId,storageReference});
  if(!payload) throw new Error("Existing Commerce Evidence could not be read for recovery.");
  if(!(await store.verifyHash({organizationId:input.organizationId,storageReference,payloadHash}))) throw new Error("Existing Commerce Evidence hash verification failed.");
  return {evidenceId:String(row.id),bytes:payload,reused:true,stored:{storageBackend:"protected_object_storage",storageReference,contentType:String(row.content_type||"application/json"),byteSize:Number(row.byte_size||payload.byteLength),payloadHash}};
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

export async function runContinuousCommasSync(options:{mode?:"continuous"|"deep_reconciliation";maxPages?:number;overlapPages?:number;perPage?:number;paceMs?:number;requestKey?:string;bootstrap?:boolean;evidenceOnlyRecovery?:boolean;expectedScope?:{organizationId:string;connectionId:string;providerAccountId:string}}={}):Promise<ContinuousSyncResult> {
  const mode=options.mode??"continuous",bootstrap=options.bootstrap===true,evidenceOnlyRecovery=options.evidenceOnlyRecovery===true;
  if(evidenceOnlyRecovery&&(mode!=="continuous"||options.maxPages!==3||options.perPage!==100))throw new Error("Evidence-only recovery bounds are invalid.");
  const bounds=continuousRequestBounds({bootstrap,mode,maxPages:options.maxPages,perPage:options.perPage,overlapPages:options.overlapPages});
  const {perPage,maxPages,overlapPages}=bounds,paceMs=options.paceMs??100;
  if(perPage<1||perPage>100||maxPages<1||overlapPages<1)throw new Error("Continuous sync bounds are invalid.");
  const scope=await scopedConnection(options.expectedScope),owner=`commas-continuous-${randomUUID()}`,started=Date.now();
  await ensureReferenceInvestigationDependencies(scope);
  const key=options.requestKey??contentFingerprint({connectionId:scope.connectionId,providerAccountId:scope.providerAccountId,resource:"transactions",mode,bucket:new Date().toISOString().slice(0,16)});
  const enqueued=await db("rpc/enqueue_commerce_continuous_sync",{method:"POST",body:JSON.stringify({p_account_id:scope.accountId,p_organization_id:scope.organizationId,p_connection_id:scope.connectionId,p_provider_account_id:scope.providerAccountId,p_resource:"transactions",p_mode:mode,p_idempotency_key:key})});
  const runId=String(enqueued[0].id);
  let claimed:any;
  try { claimed=await db("rpc/claim_commerce_sync_run",{method:"POST",body:JSON.stringify({p_run_id:runId,p_organization_id:scope.organizationId,p_connection_id:scope.connectionId,p_lease_owner:owner,p_lease_seconds:900})}); }
  catch(error) { console.log("[TraceKit] commerce lease acquisition failed",{event:"commerce.lease.acquire_failed",errorCode:String((error as Error)?.message||"lease_error").replace(/[^a-zA-Z0-9_.-]/g,"_").slice(0,80)}); throw error; }
  if(!claimed[0]) { console.log("[TraceKit] commerce lease acquisition failed",{event:"commerce.lease.acquire_failed",errorCode:"lease_unavailable"}); throw new Error("Continuous sync lease unavailable."); }
  console.log("[TraceKit] commerce lease acquired",{event:"commerce.lease.acquired"});
  const runMetadata=object(claimed[0].metadata)||{};
  if(bootstrap)await db(`commerce_sync_runs?id=eq.${runId}`,{method:"PATCH",body:JSON.stringify({metadata:{account_id:scope.accountId,quota_bootstrap_attempted:true,quota_bootstrap_state:"pending"}})});
  await audit(scope,mode==="deep_reconciliation"?"commerce.deep_reconciliation_started":"commerce.continuous_sync_started",runId,"success",{resource:"transactions",mode}).catch(()=>{});
  const priorState=(await db(`commerce_continuous_sync_state?connection_id=eq.${scope.connectionId}&provider_account_id=eq.${scope.providerAccountId}&resource=eq.transactions&select=*&limit=1`))[0];
  const priorFingerprints=(object(priorState?.page_fingerprints)||{});
  const priorRecentIds=Array.isArray(priorState?.recent_source_ids)?priorState.recent_source_ids.map(String):[];
  let providerRequests=0,pagesScanned=0,recordsObserved=0,recordsNew=0,recordsUpdated=0,recordsUnchanged=0,recordsFailed=0,refundsNew=0,refundsUpdated=0,evidenceWrites=0,evidenceReuses=0,retries=0;
  let rateLimitStart:number|null=null,rateLimitEnd:number|null=null,rateLimitReset:string|null=null,providerTotalStart:number|null=null,providerTotalEnd:number|null=null,ordering:ProviderOrdering="unknown",stoppingReason="bounded_scan_limit",deeperReconciliationRequired=false;
  let orderingObserver:OrderingObserverState=initialOrderingObserver();
  let stability:StabilityState={consecutiveStableKnownPages:0,pagesScanned:0,unseenRecords:0,changedRecords:0,pageShiftDetected:false};
  const pageDurations:number[]=[],fingerprints:Record<string,unknown>={...priorFingerprints},recentIds:string[]=[],changedRows:ReturnType<typeof normalizeCommasTransaction>[]=[],changedProductIds=new Set<string>();
  try {
    let checkpointRows=await db(`commerce_sync_checkpoints?sync_run_id=eq.${runId}&resource=eq.transactions&select=page,state,metadata&order=page.asc`);
    const lifetimeProgress=evidenceOnlyRecovery?evidenceOnlyLifetimeProgress(claimed[0],summarizeContinuousCheckpointProgress(checkpointRows)):null;
    let durableProgress=lifetimeProgress||summarizeContinuousCheckpointProgress(checkpointRows);
    const recoveryPage=firstRecoverableContinuousPage(checkpointRows);
    const queue:number[]=[recoveryPage??1]; const queued=new Set(queue); let queueIndex=0;
    while(queueIndex<queue.length&&pagesScanned<maxPages) {
      const page=queue[queueIndex++],pageStarted=Date.now();
      const checkpoint=await ensureCheckpoint({...scope,runId,page,perPage});
      try {
        const replayed=evidenceOnlyRecovery||String(checkpoint.state||"")==="running"?await replayEvidenceForPage({...scope,runId,page,perPage}):null;
        if(evidenceOnlyRecovery&&!replayed)throw new Error("Evidence-only recovery requires persisted page Evidence.");
        const fetched=replayed?null:await fetchProviderPage(scope.secret,page,perPage,owner,bootstrap?1:3);
        if(fetched){ providerRequests++; retries+=fetched.attempts-1; rateLimitStart??=fetched.rateLimit.remaining;rateLimitEnd=fetched.rateLimit.remaining;rateLimitReset=fetched.rateLimit.reset; }
        const pageBytes=replayed?.bytes||fetched!.bytes;
        const pageRateLimit=replayed?{remaining:null as number|null,attempts:0}:{remaining:fetched!.rateLimit.remaining,attempts:fetched!.attempts};
        if(bootstrap&&fetched)await db(`commerce_sync_runs?id=eq.${runId}`,{method:"PATCH",body:JSON.stringify({metadata:{account_id:scope.accountId,quota_bootstrap_attempted:true,quota_bootstrap_state:fetched.rateLimit.remaining===null?"unknown":"observed",rate_limit_start:rateLimitStart,rate_limit_end:rateLimitEnd,rate_limit_reset:rateLimitReset}})});
        const evidence=replayed||await evidenceForPage({...scope,runId,page,perPage,bytes:pageBytes}); evidence.reused?evidenceReuses++:evidenceWrites++;
        const parsed=parseContinuousPage(pageBytes); providerTotalStart??=parsed.totalItems;providerTotalEnd=parsed.totalItems;
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
        orderingObserver=observeOrderingPage(orderingObserver,{page,direction:page===1?ordering:(orderingObserver.pagesObserved===0?"unknown":detectProviderOrdering(timestamps)),firstTimestamp:timestamps[0]??null,lastTimestamp:timestamps.at(-1)??null,firstSourceId:normalized[0]?.transaction_id??null,lastSourceId:normalized.at(-1)?.transaction_id??null,ids:normalized.map((item)=>item.transaction_id),fingerprint});
        ordering=orderingObserver.ordering;
        if(!metadataProbe)stability=advanceStability(stability,{page,totalPages:parsed.totalPages,totalItems:parsed.totalItems,ids:normalized.map((item)=>item.transaction_id),timestamps,fingerprint,knownIds,priorFingerprint:object(priorFingerprints[String(page)])?.content_hash?String(object(priorFingerprints[String(page)])!.content_hash):null,expectedNewestFirstHeadInsertion:ordering==="newest_first"&&isExpectedNewestFirstHeadInsertion(priorRecentIds,recentIds)},changes);
        pagesScanned++;pageDurations.push(Date.now()-pageStarted);
        const replayMetadata={duration_ms:pageDurations.at(-1),provider_attempts:pageRateLimit.attempts,rate_limit_remaining:fetched?.rateLimit.remaining??null,new_records:newCount,updated_records:updatedCount,unchanged_records:unchangedCount,evidence_reused:evidence.reused,ordering_state:orderingObserver.ordering,pagination_classification:orderingObserver.paginationClassification,boundary_overlap_count:orderingObserver.boundaryOverlapCount,ordering_pages_observed:orderingObserver.pagesObserved};
        const completedMetadata=evidenceOnlyRecovery?evidenceOnlyCheckpointMetadata(checkpoint.metadata,replayMetadata):replayMetadata;
        await db(`commerce_sync_checkpoints?id=eq.${checkpoint.id}`,{method:"PATCH",body:JSON.stringify({state:"completed",source_total_items:parsed.totalItems,source_total_pages:parsed.totalPages,page_fingerprint:fingerprint,first_source_id:normalized[0]?.transaction_id??null,last_source_id:normalized.at(-1)?.transaction_id??null,completed_at:new Date().toISOString(),metadata:completedMetadata})});
        const checkpointIndex=checkpointRows.findIndex((row)=>String(row.page)===String(page));
        const completedRow={...checkpoint,state:"completed",metadata:completedMetadata};
        if(checkpointIndex>=0)checkpointRows[checkpointIndex]=completedRow;else checkpointRows.push(completedRow);
        durableProgress=lifetimeProgress||summarizeContinuousCheckpointProgress(checkpointRows);
        let decision=continuousStopDecision({state:stability,ordering,page,totalPages:parsed.totalPages,maxPages,rateLimitRemaining:pageRateLimit.remaining});
        if(mode==="deep_reconciliation"&&decision.reason==="stable_known_boundary") {
          decision=page>=maxPages?{stop:true,reason:"bounded_deep_reconciliation_proof",deeperReconciliationRequired:true}:parsed.totalPages!==null&&page>=parsed.totalPages?{stop:true,reason:"provider_history_boundary",deeperReconciliationRequired:false}:{stop:false,reason:null,deeperReconciliationRequired:false};
        }
        if(orderingObserver.paginationClassification === "pagination_instability") decision={stop:true,reason:"provider_ordering_unverified",deeperReconciliationRequired:true};
        // The terminal patch below carries the same durable counters plus the
        // final state. Avoid spending one more subrequest on a duplicate
        // counter rollup when this page exhausts the invocation bound.
        if(!decision.stop) await db(`commerce_sync_runs?id=eq.${runId}`,{method:"PATCH",body:JSON.stringify({pages_completed:durableProgress.pagesCompleted,records_seen:durableProgress.recordsSeen,records_created:durableProgress.recordsCreated,records_updated:durableProgress.recordsUpdated,records_unchanged:durableProgress.recordsUnchanged,provider_request_count:durableProgress.providerRequests,evidence_writes:durableProgress.evidenceWrites,evidence_reuses:durableProgress.evidenceReuses})});
        if(decision.stop){stoppingReason=decision.reason!;deeperReconciliationRequired=decision.deeperReconciliationRequired;break;}
        const next=ordering==="oldest_first"?page+1:page+1;if(parsed.hasMore&&!queued.has(next)){queue.push(next);queued.add(next);}
        await db("rpc/heartbeat_commerce_sync_run",{method:"POST",body:JSON.stringify({p_run_id:runId,p_organization_id:scope.organizationId,p_connection_id:scope.connectionId,p_lease_owner:owner,p_lease_seconds:900})});
        await sleep(pageRateLimit.remaining!==null&&pageRateLimit.remaining<100?5_000:paceMs);
      } catch(error) {
        recordsFailed++;
        await db(`commerce_sync_checkpoints?id=eq.${checkpoint.id}`,{method:"PATCH",body:JSON.stringify({state:"failed",retry_count:Number(checkpoint.retry_count||0)+1,metadata:{error_code:"continuous_page_failed",retryable:true}})}).catch(()=>{});
        throw error;
      }
    }
    const now=new Date().toISOString(),latestTransactionAt=changedRows.map((item)=>item.transaction_at).sort().at(-1)??(priorState?.latest_provider_transaction_at?String(priorState.latest_provider_transaction_at):null);
    const boundedDeepProof=mode==="deep_reconciliation"&&stoppingReason==="bounded_deep_reconciliation_proof";
    await db("commerce_continuous_sync_state?on_conflict=connection_id,provider_account_id,resource",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({account_id:scope.accountId,organization_id:scope.organizationId,connection_id:scope.connectionId,provider_account_id:scope.providerAccountId,resource:"transactions",last_attempted_at:now,last_successful_at:now,last_provider_observation_at:now,last_normalized_record_at:changedRows.length?now:priorState?.last_normalized_record_at??null,latest_provider_transaction_at:latestTransactionAt,provider_total_observed:providerTotalEnd,recent_source_ids:Array.from(new Set(recentIds)).slice(0,300),page_fingerprints:fingerprints,last_stability_boundary:boundedDeepProof?priorState?.last_stability_boundary??{}:{known_pages:stability.consecutiveStableKnownPages,pages_scanned:pagesScanned,page_shift_detected:stability.pageShiftDetected,ordering_state:orderingObserver.ordering,pagination_classification:orderingObserver.paginationClassification,boundary_overlap_count:orderingObserver.boundaryOverlapCount},last_stopping_reason:boundedDeepProof?priorState?.last_stopping_reason??null:stoppingReason,last_deep_reconciliation_at:mode==="deep_reconciliation"&&stoppingReason==="provider_history_boundary"?now:priorState?.last_deep_reconciliation_at??null,normalizer_version:CONTINUOUS_NORMALIZER_VERSION,evidence_contract_version:COMMERCE_EVIDENCE_CONTRACT_VERSION,status:boundedDeepProof?priorState?.status??"unknown":deeperReconciliationRequired?"degraded":"current",attribution_source_state:"unavailable",warnings:boundedDeepProof?priorState?.warnings??[]:deeperReconciliationRequired?[{code:"deep_reconciliation_required"}]:[],updated_at:now})});
    if(changedRows.length) {
      const newest=changedRows.map((item)=>item.transaction_at).sort().at(-1)!;
      await db("rpc/mark_investigation_new_evidence",{method:"POST",body:JSON.stringify({p_organization_id:scope.organizationId,p_resource_type:"transactions",p_entity_type:null,p_entity_id:null,p_observed_at:newest,p_reason:"new_or_changed_commerce_transaction"})});
      for(const productId of Array.from(changedProductIds))await db("rpc/mark_investigation_new_evidence",{method:"POST",body:JSON.stringify({p_organization_id:scope.organizationId,p_resource_type:"transactions",p_entity_type:"provider_product",p_entity_id:productId,p_observed_at:newest,p_reason:"product_commerce_evidence_changed"})});
    }
    const warnings=deeperReconciliationRequired?1:0,status=warnings?"completed_with_warnings":"completed";
    await db(`commerce_sync_runs?id=eq.${runId}`,{method:"PATCH",body:JSON.stringify({source_total_items:providerTotalEnd,pages_planned:null,pages_completed:durableProgress.pagesCompleted,records_seen:durableProgress.recordsSeen,records_created:durableProgress.recordsCreated,records_updated:durableProgress.recordsUpdated,records_unchanged:durableProgress.recordsUnchanged,records_failed:evidenceOnlyRecovery?(number(claimed[0].records_failed)??0):recordsFailed,warnings_count:warnings,provider_request_count:durableProgress.providerRequests,evidence_writes:durableProgress.evidenceWrites,evidence_reuses:durableProgress.evidenceReuses,provider_total_start:providerTotalStart,provider_total_end:providerTotalEnd,stopping_reason:stoppingReason,overlap_pages_scanned:pagesScanned,page_shift_detected:stability.pageShiftDetected,deeper_reconciliation_required:deeperReconciliationRequired,freshness_result:changedRows.length?"changed":"current",metadata:{...runMetadata,normalizer_version:CONTINUOUS_NORMALIZER_VERSION,evidence_contract_version:COMMERCE_EVIDENCE_CONTRACT_VERSION,retries,rate_limit_start:rateLimitStart,rate_limit_end:rateLimitEnd,rate_limit_reset:rateLimitReset,quota_bootstrap_attempted:bootstrap,quota_bootstrap_state:bootstrap?(rateLimitEnd===null?"unknown":"observed"):undefined,refunds_new:refundsNew,refunds_updated:refundsUpdated,ordering,ordering_state:orderingObserver.ordering,pagination_classification:orderingObserver.paginationClassification,boundary_overlap_count:orderingObserver.boundaryOverlapCount,ordering_pages_observed:orderingObserver.pagesObserved,evidence_only_recovery_invocation:evidenceOnlyRecovery?{provider_requests:providerRequests,pages_scanned:pagesScanned,records_seen:recordsObserved,records_created:recordsNew,records_updated:recordsUpdated,records_unchanged:recordsUnchanged,evidence_reuses:evidenceReuses}:undefined}})});
    const transitioned=await db("rpc/transition_commerce_sync_run",{method:"POST",body:JSON.stringify({p_run_id:runId,p_organization_id:scope.organizationId,p_connection_id:scope.connectionId,p_lease_owner:owner,p_transition:status,p_error_code:null,p_error_summary:null})});
    const transitionApplied = (transitioned as unknown as unknown[])[0] === true;
    console.log("[TraceKit] commerce run transition",{event:"commerce.run.transition",result:transitionApplied?"succeeded":"not_applied",status});
    await audit(scope,mode==="deep_reconciliation"?"commerce.deep_reconciliation_completed":"commerce.continuous_sync_completed",runId,"success",{resource:"transactions",mode,pages_scanned:pagesScanned,records_new:recordsNew,records_updated:recordsUpdated,records_unchanged:recordsUnchanged,stopping_reason:stoppingReason}).catch(()=>{});
    return {runId,status,providerRequests,pagesScanned,recordsObserved,recordsNew,recordsUpdated,recordsUnchanged,recordsFailed,refundsNew,refundsUpdated,evidenceWrites,evidenceReuses,durationMs:Date.now()-started,averagePageDurationMs:pageDurations.length?Math.round(pageDurations.reduce((a,b)=>a+b,0)/pageDurations.length):0,retries,rateLimitStart,rateLimitEnd,stoppingReason,pageShiftDetected:stability.pageShiftDetected,deeperReconciliationRequired,ordering};
  } catch(error) {
    await db(`commerce_continuous_sync_state?on_conflict=connection_id,provider_account_id,resource`,{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({account_id:scope.accountId,organization_id:scope.organizationId,connection_id:scope.connectionId,provider_account_id:scope.providerAccountId,resource:"transactions",last_attempted_at:new Date().toISOString(),normalizer_version:CONTINUOUS_NORMALIZER_VERSION,evidence_contract_version:COMMERCE_EVIDENCE_CONTRACT_VERSION,status:"failed",attribution_source_state:"unavailable",warnings:[{code:"continuous_sync_failed"}],updated_at:new Date().toISOString()})}).catch(()=>{});
    await db("rpc/transition_commerce_sync_run",{method:"POST",body:JSON.stringify({p_run_id:runId,p_organization_id:scope.organizationId,p_connection_id:scope.connectionId,p_lease_owner:owner,p_transition:"failed",p_error_code:"continuous_sync_failed",p_error_summary:"Continuous Commerce sync stopped safely."})}).then((transitioned)=>{const transitionApplied=(transitioned as unknown as unknown[])[0]===true;console.log("[TraceKit] commerce run transition",{event:"commerce.run.transition",result:transitionApplied?"succeeded":"not_applied",status:"failed"});}).catch((error)=>console.log("[TraceKit] commerce run transition failed",{event:"commerce.run.transition_failed",errorCode:String((error as Error)?.message||"transition_error").replace(/[^a-zA-Z0-9_.-]/g,"_").slice(0,80)}));
    await audit(scope,mode==="deep_reconciliation"?"commerce.deep_reconciliation_failed":"commerce.continuous_sync_failed",runId,"failure",{resource:"transactions",mode,error_code:"continuous_sync_failed"}).catch(()=>{});
    throw error;
  }
}
