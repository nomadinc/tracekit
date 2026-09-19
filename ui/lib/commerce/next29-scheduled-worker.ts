import "server-only";

import { randomUUID } from "node:crypto";
import { Next29Client } from "../../../api/src/connectors/next29/client.ts";
import { createNext29IncrementalControl } from "../../../api/src/connectors/next29/schedule-repository.ts";
import { createNext29ScheduledWorkerRepository } from "../../../api/src/connectors/next29/scheduled-worker-repository.ts";
import { runNext29ScheduledWorker } from "../../../api/src/connectors/next29/scheduled-worker.ts";
import type { Next29EvidenceSink } from "../../../api/src/connectors/next29/types.ts";
import { decodeCommerceCredentialKey, decryptCommerceCredential } from "./credential-crypto";
import { parseNext29ConnectionCredential } from "./next29-verifier";
import { createNext29RuntimePersistence, type ProductionCertificationContext } from "./next29-production-certification";
import { commercePersistenceRequest, SupabaseCommerceControlRepository } from "./supabase-control-repository";
import { SupabaseCommerceEvidenceStore } from "./supabase-evidence-store";

export async function runDueNext29Schedules(args: { limit?: number } = {}) {
  const rpc = async (name:string, body:Record<string,unknown>) => commercePersistenceRequest(`rpc/${name}`, {method:"POST",body:JSON.stringify(body)});
  const repository=createNext29ScheduledWorkerRepository({
    async ensureNext29Schedules(input){const r=await rpc("ensure_next29_resource_schedules",{p_connection_id:input.connectionId});const v:unknown=r[0];return typeof v==="number"?v:Number(v||0);},
    async listDueNext29Schedules(input){const rows=await rpc("list_due_next29_resource_schedules",{p_now:input.now,p_limit:input.limit});console.info("next29_scheduler_due_discovery",{now:input.now,limit:input.limit,count:rows.length,resources:rows.map((row)=>String(row.resource||"")).filter(Boolean)});return rows as any;},
  });
  return runNext29ScheduledWorker({
    repository,
    workerId:`next29-cron:${randomUUID()}`,
    dueLimit: Math.max(1,Math.min(3,Number(args.limit)||3)),
    bounds:{maxPagesPerResource:1,maxRecordsPerResource:50},
    async loadRuntime(target){
      const controlRepo=new SupabaseCommerceControlRepository();
      const connection=await controlRepo.connectionById(target.connectionId);
      if(!connection||connection.provider!=="next29"||connection.status!=="connected") throw new Error("29Next scheduled connection is unavailable.");
      const stored=await controlRepo.activeCredential(target.connectionId,target.organizationId);
      if(!stored?.encrypted||stored.revokedAt) throw new Error("29Next scheduled credential is unavailable.");
      const secret=await decryptCommerceCredential(stored.encrypted,decodeCommerceCredentialKey(process.env.COMMERCE_CREDENTIALS_ENC_KEY));
      const credential=parseNext29ConnectionCredential(secret);
      const client=new Next29Client({store:credential.store,accessToken:credential.accessToken,apiVersion:credential.apiVersion});
      const evidenceStore=new SupabaseCommerceEvidenceStore();
      const evidenceSink:Next29EvidenceSink={async putImmutable(item){const s=await evidenceStore.putImmutable({organizationId:item.organizationId,connectionId:item.connectionId,providerAccountId:item.providerAccountId,sourceObjectType:item.sourceObjectType,payload:item.payload,contentType:item.contentType});return {storageReference:s.storageReference,payloadHash:s.payloadHash,byteSize:s.byteSize};}};
      const context:ProductionCertificationContext={accountId:connection.accountId,organizationId:target.organizationId,connectionId:target.connectionId,providerAccountId:target.providerAccountId,environment:"production",client};
      const rows=await commercePersistenceRequest(`commerce_sync_schedules?connection_id=eq.${encodeURIComponent(target.connectionId)}&select=id,resource,enabled,activation_state`);
      const control=createNext29IncrementalControl({
        async claimSchedule(i){const found=rows.find(x=>x.resource===`next29_${i.resource}`);if(!found?.id)return null;const rr=await rpc("claim_next29_resource_schedule",{p_schedule_id:found.id,p_now:i.now,p_lease_owner:i.leaseOwner,p_lease_seconds:i.leaseSeconds});const row=rr[0];if(!row)return null;return {id:String(row.id),resource:String(row.resource),enabled:Boolean(row.enabled),successful_through_at:row.successful_through_at?String(row.successful_through_at):null,active_window_start_at:row.active_window_start_at?String(row.active_window_start_at):null,active_window_end_at:row.active_window_end_at?String(row.active_window_end_at):null,resume_cursor:row.resume_cursor?String(row.resume_cursor):null};},
        async heartbeatSchedule(i){const rr=await rpc("heartbeat_next29_resource_schedule",{p_schedule_id:i.scheduleId,p_lease_owner:i.leaseOwner,p_now:i.now,p_lease_seconds:i.leaseSeconds});const v:unknown=rr[0];return v===true||v==="true"||(typeof v==="object"&&v!==null&&((v as Record<string,unknown>).heartbeat_next29_resource_schedule===true||(v as Record<string,unknown>).heartbeat_next29_resource_schedule==="true"));},
        async finishSchedule(i){await rpc("finish_next29_resource_schedule",{p_schedule_id:i.scheduleId,p_lease_owner:i.leaseOwner,p_now:i.now,p_outcome:i.outcome,p_successful_through_at:i.successfulThrough,p_active_window_start_at:i.activeWindowStart,p_active_window_end_at:i.activeWindowEnd,p_resume_cursor:i.resumeCursor,p_error_code:null});},
        async failSchedule(i){await rpc("finish_next29_resource_schedule",{p_schedule_id:i.scheduleId,p_lease_owner:i.leaseOwner,p_now:i.now,p_outcome:"failed",p_successful_through_at:null,p_active_window_start_at:null,p_active_window_end_at:null,p_resume_cursor:null,p_error_code:i.errorCode});},
      });
      return {client,evidenceSink,persistence:createNext29RuntimePersistence(context),control};
    },
  });
}
