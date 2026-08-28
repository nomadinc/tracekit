import "server-only";
import { randomUUID } from "node:crypto";
import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";
import { SupabaseCommerceControlRepository, commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";
import { decodeCommerceCredentialKey, decryptCommerceCredential } from "@/lib/commerce/credential-crypto";
import { syncEverflowConversions } from "./everflow-conversions";
import { captureEverflowConversionBaseline, finalizeEverflowConversionRunMetrics } from "./everflow-conversion-run-metrics";
import { captureEverflowFinancialBaseline, persistEverflowEventReversalHistory } from "./everflow-event-reversals";
import { projectEverflowFinancialEffects } from "./everflow-financial-projection";
import { everflowIncrementalWindow, loadEverflowIncrementalState, markEverflowIncrementalAttempt, markEverflowIncrementalChunkSuccess, markEverflowIncrementalFailure } from "./everflow-incremental";

type ScheduleRow={id:string;account_id:string;organization_id:string;connection_id:string;provider_account_id:string;resource:string;enabled:boolean;activation_state:string;next_overlap_at:string|null;last_enqueued_at:string|null;updated_at:string;sync_frequency:string|null};
type SchedulerScope={accountId:string;organizationId:string;connectionId:string;providerAccountId:string;now?:Date};
const schedulerSession={} as TraceKitSessionContext;
const repo=new SupabaseCommerceControlRepository();
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function credentialKey(){const id=process.env.COMMERCE_CREDENTIALS_KEY_ID,version=Number(process.env.COMMERCE_CREDENTIALS_ENCRYPTION_VERSION||"1");if(!id||!Number.isInteger(version)||version<1)throw new Error("Commerce credential encryption is unavailable.");return{bytes:decodeCommerceCredentialKey(process.env.COMMERCE_CREDENTIALS_ENC_KEY),id,version};}

function servicePlane(scope:SchedulerScope){
 const key=credentialKey();
 const connection=async(id:string)=>{if(id!==scope.connectionId)throw new Error("Everflow scheduler scope mismatch.");const row=await repo.connectionById(id);if(!row||row.organizationId!==scope.organizationId||row.provider!=="everflow"||row.status!=="connected")throw new Error("Everflow connection is unavailable.");return row;};
 return{
  async getConnection(_s:TraceKitSessionContext,id:string){return connection(id);},
  async listProviderAccounts(_s:TraceKitSessionContext,id:string){await connection(id);return repo.listProviderAccounts(id,scope.organizationId);},
  async resolveCredentialForExecution(_s:TraceKitSessionContext,id:string){await connection(id);const value=await repo.activeCredential(id,scope.organizationId);if(!value?.encrypted||value.revokedAt)throw new Error("The commerce credential is unavailable.");return decryptCommerceCredential(value.encrypted,key.bytes);},
  async createSyncRun(_s:TraceKitSessionContext,id:string,providerAccountId:string,mode:string,syncType:string){await connection(id);if(providerAccountId!==scope.providerAccountId)throw new Error("Everflow scheduler provider account mismatch.");return repo.createSyncRun({organizationId:scope.organizationId,connectionId:id,providerAccountId,syncType,mode,leaseOwner:null,leaseExpiresAt:null});},
  async claimSyncRun(_s:TraceKitSessionContext,id:string,runId:string,owner:string,leaseSeconds:number){await connection(id);return repo.claimSyncRun({runId,organizationId:scope.organizationId,connectionId:id,owner,leaseSeconds});},
  async heartbeatSyncRun(_s:TraceKitSessionContext,id:string,runId:string,owner:string,leaseSeconds:number){return repo.heartbeatSyncRun({runId,organizationId:scope.organizationId,connectionId:id,owner,leaseSeconds});},
  async completeSyncRun(_s:TraceKitSessionContext,id:string,runId:string,owner:string,withWarnings=false){return repo.transitionSyncRun({runId,organizationId:scope.organizationId,connectionId:id,owner,transition:withWarnings?"completed_with_warnings":"completed"});},
  async failSyncRun(_s:TraceKitSessionContext,id:string,runId:string,owner:string,errorCode:string,safeSummary:string){return repo.transitionSyncRun({runId,organizationId:scope.organizationId,connectionId:id,owner,transition:"failed",errorCode,errorSummary:safeSummary.slice(0,500)});},
  async beginCheckpoint(_s:TraceKitSessionContext,id:string,input:Record<string,unknown>){await connection(id);return repo.beginCheckpoint({...input,organizationId:scope.organizationId,connectionId:id} as never);},
  async completeCheckpoint(_s:TraceKitSessionContext,id:string,checkpointId:string,pageFingerprint:string){return repo.updateCheckpoint(checkpointId,scope.organizationId,id,{state:"completed",pageFingerprint});},
  async failCheckpoint(_s:TraceKitSessionContext,id:string,checkpointId:string,retryCount:number){return repo.updateCheckpoint(checkpointId,scope.organizationId,id,{state:"failed",retryCount});},
  async resolveSourceMapping(_s:TraceKitSessionContext,id:string,providerAccountId:string,sourceObjectType:string,sourceObjectId:string){await connection(id);return repo.sourceMapping(id,providerAccountId,sourceObjectType,sourceObjectId);},
  async createOrObserveSourceMapping(_s:TraceKitSessionContext,id:string,input:Record<string,unknown>){await connection(id);const canonicalType=String(input.canonicalObjectType||""),canonicalId=String(input.canonicalObjectId||"");if(!await repo.canonicalTargetExists(scope.organizationId,canonicalType,canonicalId))throw new Error("Canonical mapping target is unavailable.");return repo.upsertSourceMapping({...input,organizationId:scope.organizationId,connectionId:id} as never);},
 };
}

async function persistedCount(connectionId:string){const size=1000;let offset=0,total=0;while(true){const rows=await commercePersistenceRequest(`everflow_conversion_events?connection_id=eq.${encodeURIComponent(connectionId)}&ingestion_method=eq.api&select=id&order=id.asc&limit=${size}&offset=${offset}`);total+=rows.length;if(rows.length<size)return total;offset+=size;}}

export async function runEverflowScheduledChunk(scope:SchedulerScope){
 if(![scope.accountId,scope.organizationId,scope.connectionId,scope.providerAccountId].every(value=>uuid.test(value)))throw new Error("Everflow scheduler scope is invalid.");
 const now=scope.now||new Date(),state=await loadEverflowIncrementalState(scope),window=everflowIncrementalWindow({now,lastSuccessfulAt:state.lastSuccessfulAt,boundary:state.boundary});
 await markEverflowIncrementalAttempt({...scope,attemptedAt:now.toISOString(),window});let stage="baseline";
 try{
  const beforeCount=await persistedCount(scope.connectionId),baseline=await captureEverflowConversionBaseline(scope.connectionId),financialBaseline=await captureEverflowFinancialBaseline(scope.connectionId);stage="provider_sync";
  const result=await syncEverflowConversions({plane:servicePlane(scope) as never,session:schedulerSession,organizationId:scope.organizationId,connectionId:scope.connectionId,from:window.from,to:window.to});stage="run_metrics";
  const afterCount=await persistedCount(scope.connectionId);await commercePersistenceRequest(`commerce_sync_runs?id=eq.${encodeURIComponent(result.syncRunId)}&organization_id=eq.${encodeURIComponent(scope.organizationId)}&connection_id=eq.${encodeURIComponent(scope.connectionId)}`,{method:"PATCH",body:JSON.stringify({pages_completed:result.pages,records_seen:result.seen,provider_request_count:result.pages})});
  const changeMetrics=await finalizeEverflowConversionRunMetrics({connectionId:scope.connectionId,syncRunId:result.syncRunId,baseline});if(changeMetrics.created!==Math.max(0,afterCount-beforeCount))throw new Error("Everflow conversion change metrics were inconsistent.");stage="state_history";
  const eventEffects=await persistEverflowEventReversalHistory({organizationId:scope.organizationId,connectionId:scope.connectionId,syncRunId:result.syncRunId,providerAccountId:result.providerAccountId,baseline:financialBaseline});stage="financial_projection";
  const financialProjection=await projectEverflowFinancialEffects({organizationId:scope.organizationId,connectionId:scope.connectionId,syncRunId:result.syncRunId});stage="cursor_commit";const completedAt=new Date().toISOString();
  const progress=await markEverflowIncrementalChunkSuccess({...scope,completedAt,syncRunId:result.syncRunId,from:window.from,to:window.to,targetTo:window.targetTo,overlapDays:window.overlapDays,bootstrap:window.bootstrap,seen:result.seen});return{ok:true,window,progress,result,changeMetrics,eventEffects,financialProjection};
 }catch(error){await markEverflowIncrementalFailure({...scope,failedAt:new Date().toISOString(),warningCode:`everflow_scheduled_${stage}_failed`}).catch(()=>undefined);throw error;}
}

function cadenceMinutes(value:string|null){switch(value){case"5_minutes":return 5;case"15_minutes":return 15;case"30_minutes":return 30;default:return 60;}}
export async function dueEverflowSchedules(now=new Date(),connectionId?:string):Promise<ScheduleRow[]>{const filter=connectionId?`&connection_id=eq.${encodeURIComponent(connectionId)}`:"";return await commercePersistenceRequest(`commerce_sync_schedules?resource=eq.everflow_conversions&enabled=eq.true&activation_state=eq.enabled&next_overlap_at=lte.${encodeURIComponent(now.toISOString())}${filter}&select=id,account_id,organization_id,connection_id,provider_account_id,resource,enabled,activation_state,next_overlap_at,last_enqueued_at,updated_at,sync_frequency&order=next_overlap_at.asc&limit=10`) as unknown as ScheduleRow[];}
async function claimSchedule(schedule:ScheduleRow,now:Date){const rows=await commercePersistenceRequest(`commerce_sync_schedules?id=eq.${encodeURIComponent(schedule.id)}&updated_at=eq.${encodeURIComponent(schedule.updated_at)}`,{method:"PATCH",body:JSON.stringify({last_enqueued_at:now.toISOString(),updated_at:now.toISOString()})});return rows.length===1;}
async function reschedule(schedule:ScheduleRow,complete:boolean,now:Date){const next=complete?new Date(now.getTime()+cadenceMinutes(schedule.sync_frequency)*60_000):new Date(now.getTime()+60_000);await commercePersistenceRequest(`commerce_sync_schedules?id=eq.${encodeURIComponent(schedule.id)}`,{method:"PATCH",body:JSON.stringify({next_overlap_at:next.toISOString(),updated_at:new Date().toISOString()})});}

export async function runDueEverflowSchedules(input:{now?:Date;limit?:number;connectionId?:string}={}){const now=input.now||new Date(),limit=Math.max(1,Math.min(5,input.limit||1)),due=await dueEverflowSchedules(now,input.connectionId),results:Array<Record<string,unknown>>=[];for(const schedule of due.slice(0,limit)){if(!await claimSchedule(schedule,now)){results.push({scheduleId:schedule.id,status:"claim_lost"});continue;}try{const result=await runEverflowScheduledChunk({accountId:schedule.account_id,organizationId:schedule.organization_id,connectionId:schedule.connection_id,providerAccountId:schedule.provider_account_id,now});await reschedule(schedule,result.progress.windowComplete,now);results.push({scheduleId:schedule.id,status:"completed",windowComplete:result.progress.windowComplete,syncRunId:result.result.syncRunId,seen:result.result.seen});}catch(error){await commercePersistenceRequest(`commerce_sync_schedules?id=eq.${encodeURIComponent(schedule.id)}`,{method:"PATCH",body:JSON.stringify({next_overlap_at:new Date(now.getTime()+5*60_000).toISOString(),updated_at:new Date().toISOString()})}).catch(()=>undefined);results.push({scheduleId:schedule.id,status:"failed",error:error instanceof Error?error.message:"everflow_scheduled_failed"});}}return{due:due.length,processed:results.length,results,requestId:randomUUID()};}
