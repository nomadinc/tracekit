import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";
import { runDueCommasSchedules } from "@/lib/commerce/commas-scheduled-worker";

export const dynamic="force-dynamic";
export const maxDuration=300;

function authorized(request:Request){const secret=String(process.env.CRON_SECRET||"").trim();return Boolean(secret)&&request.headers.get("authorization")===`Bearer ${secret}`;}
function provenance(){return{deployment_commit_sha:String(process.env.VERCEL_GIT_COMMIT_SHA||"").trim()||null,deployment_git_ref:String(process.env.VERCEL_GIT_COMMIT_REF||"").trim()||null};}
function errorSummary(error:unknown){return error instanceof Error?error.message.slice(0,300):"unknown_error";}
async function patch(requestId:string,values:Record<string,unknown>){try{await commercePersistenceRequest(`commerce_cron_runs?request_id=eq.${encodeURIComponent(requestId)}`,{method:"PATCH",body:JSON.stringify({...values,updated_at:new Date().toISOString()})});}catch(error){console.error("commas_cron_telemetry_patch_failed",{requestId,error:errorSummary(error)});}}

export async function GET(request:Request){
  const requestId=randomUUID(),isAuthorized=authorized(request),deployment=provenance();
  try{await commercePersistenceRequest("commerce_cron_runs",{method:"POST",body:JSON.stringify({provider:"commas",request_id:requestId,authorized:isAuthorized,started_at:new Date().toISOString(),...deployment})});}
  catch(error){console.error("commas_cron_telemetry_insert_failed",{requestId,error:errorSummary(error),...deployment});}
  if(!isAuthorized){await patch(requestId,{completed_at:new Date().toISOString(),response_status:401,scheduler_status:"not_authorized"});return NextResponse.json({ok:false,message:"Unauthorized.",requestId},{status:401});}
  await patch(requestId,{scheduler_started_at:new Date().toISOString(),scheduler_status:"running"});
  try{
    const scheduler=await runDueCommasSchedules({limit:1});
    await patch(requestId,{scheduler_completed_at:new Date().toISOString(),scheduler_status:"completed",scheduler_error:null,due_targets:scheduler.dueTargets,attempted:scheduler.attempted,completed:scheduler.completed,failed:scheduler.failed,deep_reconciliation_due:scheduler.deepReconciliationDue,completed_at:new Date().toISOString(),response_status:200});
    console.info("commas_scheduler_tick",{requestId,dueTargets:scheduler.dueTargets,attempted:scheduler.attempted,completed:scheduler.completed,failed:scheduler.failed});
    return NextResponse.json({ok:true,scheduler,requestId});
  }catch(error){
    const message=errorSummary(error);
    await patch(requestId,{scheduler_completed_at:new Date().toISOString(),scheduler_status:"failed",scheduler_error:message,completed_at:new Date().toISOString(),response_status:500});
    console.error("commas_scheduler_failed",{requestId,message,...deployment});
    return NextResponse.json({ok:false,message:"TraceKit could not complete Commas scheduled work.",requestId},{status:500});
  }
}
