import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { marketingPersistenceRequest } from "@/lib/integrations/marketing-provider-repository";
import { runDueGoogleAdsReportingSchedules } from "@/lib/integrations/google-ads-scheduled-worker";

export const dynamic="force-dynamic";
export const maxDuration=300;
const VERSION="google-ads-daily-canary-v1";
function authorized(request:Request){const secret=String(process.env.CRON_SECRET||"").trim();return Boolean(secret)&&request.headers.get("authorization")===`Bearer ${secret}`}
function provenance(){return {deployment_commit_sha:String(process.env.VERCEL_GIT_COMMIT_SHA||"").trim()||null,deployment_git_ref:String(process.env.VERCEL_GIT_COMMIT_REF||"").trim()||null}}
async function patch(requestId:string,body:Record<string,unknown>){await marketingPersistenceRequest(`marketing_cron_runs?request_id=eq.${encodeURIComponent(requestId)}`,{method:"PATCH",body:JSON.stringify({...body,...provenance(),updated_at:new Date().toISOString()})}).catch(()=>null)}
export async function GET(request:Request){
 const requestId=randomUUID();
 if(!authorized(request))return NextResponse.json({ok:false,message:"Unauthorized.",requestId},{status:401});
 await marketingPersistenceRequest("marketing_cron_runs",{method:"POST",body:JSON.stringify({provider:"google_ads",request_id:requestId,authorized:true,started_at:new Date().toISOString(),scheduler_status:"running",...provenance()})}).catch(()=>null);
 try{
  const result=await runDueGoogleAdsReportingSchedules({limit:1});
  await patch(requestId,{scheduler_completed_at:new Date().toISOString(),scheduler_status:"completed",due_targets:result.due,claimed:result.claimed,completed:result.completed,failed:result.failed,response_status:200});
  return NextResponse.json({ok:true,schedulerVersion:VERSION,...result,requestId});
 }catch(error){
  await patch(requestId,{scheduler_completed_at:new Date().toISOString(),scheduler_status:"failed",scheduler_error:error instanceof Error?error.message.slice(0,300):"unknown_error",response_status:500});
  return NextResponse.json({ok:false,message:"TraceKit could not complete Google Ads scheduled reporting.",schedulerVersion:VERSION,requestId},{status:500});
 }
}
