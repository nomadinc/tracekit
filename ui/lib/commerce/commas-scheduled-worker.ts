import { commercePersistenceRequest } from "./supabase-control-repository";
import { runContinuousCommasSync } from "./commas-continuous-worker";
import { nextScheduleTimes } from "./continuous-scheduler";

type Row=Record<string,unknown>;
const rows=async(path:string,init:RequestInit={})=>commercePersistenceRequest(path,init) as Promise<Row[]>;
const isoMinute=(value:Date)=>value.toISOString().slice(0,16);
function intervalMinutes(value:unknown,fallback:number){const text=String(value||"");const match=text.match(/^(?:(\d+) days? )?(\d{2}):(\d{2}):(\d{2})$/);if(!match)return fallback;return Number(match[1]||0)*1440+Number(match[2])*60+Number(match[3])+Number(match[4])/60;}

export async function runDueCommasSchedules(input:{limit?:number;now?:Date}={}){
  const now=input.now??new Date(),limit=Math.max(1,Math.min(input.limit??1,3));
  const schedules=await rows(`commerce_sync_schedules?resource=eq.transactions&enabled=eq.true&activation_state=eq.enabled&order=next_overlap_at.asc&limit=${limit}`);
  let dueTargets=0,attempted=0,completed=0,failed=0,deepReconciliationDue=0;
  const results:Array<Record<string,unknown>>=[];
  for(const schedule of schedules){
    const organizationId=String(schedule.organization_id),connectionId=String(schedule.connection_id),providerAccountId=String(schedule.provider_account_id);
    const controls=await rows(`tracekit_production_controls?organization_id=eq.${encodeURIComponent(organizationId)}&capability=eq.commerce_scheduler&activation_state=eq.enabled&select=id,metadata&limit=1`);
    const pauses=await rows(`commerce_connection_pauses?organization_id=eq.${encodeURIComponent(organizationId)}&connection_id=eq.${encodeURIComponent(connectionId)}&paused=eq.true&select=connection_id&limit=1`);
    const overlapDue=Boolean(schedule.next_overlap_at&&Date.parse(String(schedule.next_overlap_at))<=now.getTime());
    const deepDue=Boolean(schedule.next_deep_reconciliation_at&&Date.parse(String(schedule.next_deep_reconciliation_at))<=now.getTime());
    if(deepDue)deepReconciliationDue++;
    if(!overlapDue||controls.length!==1||pauses.length>0)continue;
    dueTargets++;attempted++;
    const scheduleVersion=Number(schedule.schedule_version||1),requestKey=`commas-schedule:${String(schedule.id)}:v${scheduleVersion}:continuous:${isoMinute(now)}`;
    try{
      const result=await runContinuousCommasSync({mode:"continuous",requestKey,expectedScope:{organizationId,connectionId,providerAccountId}});
      const next=nextScheduleTimes({now,overlapMinutes:Math.max(1,Math.round(intervalMinutes(schedule.overlap_interval,15))),deepDays:7,completed:"continuous"});
      await rows(`commerce_sync_schedules?id=eq.${encodeURIComponent(String(schedule.id))}&organization_id=eq.${encodeURIComponent(organizationId)}`,{method:"PATCH",body:JSON.stringify({next_overlap_at:next.nextOverlapAt,last_enqueued_at:now.toISOString(),last_completed_at:new Date().toISOString(),last_error_code:null})});
      completed++;results.push({scheduleId:schedule.id,status:"completed",runId:result.runId,stoppingReason:result.stoppingReason,providerRequests:result.providerRequests,pagesScanned:result.pagesScanned,deepReconciliationDue:deepDue});
    }catch(error){
      failed++;const code=error instanceof Error?error.message.slice(0,120):"unknown_error";
      await rows(`commerce_sync_schedules?id=eq.${encodeURIComponent(String(schedule.id))}&organization_id=eq.${encodeURIComponent(organizationId)}`,{method:"PATCH",body:JSON.stringify({last_failed_at:new Date().toISOString(),last_error_code:code})}).catch(()=>[]);
      results.push({scheduleId:schedule.id,status:"failed",error:code,deepReconciliationDue:deepDue});
    }
  }
  return{dueTargets,attempted,completed,failed,deepReconciliationDue,results};
}
