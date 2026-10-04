import "server-only";
import { marketingPersistenceRequest } from "./marketing-provider-repository";
import { runDueGoogleAdsReportingSchedules } from "./google-ads-scheduled-worker";
type Row=Record<string,unknown>;
export async function runGoogleAdsSchedulerOneShot(input:{organizationId:string;connectionId:string}){
 const schedules=await marketingPersistenceRequest(`marketing_reporting_schedules?organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}&provider=eq.google_ads&resource=eq.campaign_daily&limit=2`) as Row[];
 if(schedules.length!==1)throw new Error("Exactly one Google Ads reporting schedule is required.");
 const scheduleId=String(schedules[0].id);
 const armed=await marketingPersistenceRequest("rpc/arm_google_ads_campaign_daily_schedule_once",{method:"POST",body:JSON.stringify({p_schedule_id:scheduleId,p_now:new Date().toISOString()})});
 if(armed!==true)throw new Error("Google Ads reporting schedule could not be armed for one-shot proof.");
 let result:{due:number;claimed:number;completed:number;failed:number}|null=null,runnerError:unknown=null;
 try{result=await runDueGoogleAdsReportingSchedules({organizationId:input.organizationId,connectionId:input.connectionId,limit:1})}catch(error){runnerError=error}
 const disarmed=await marketingPersistenceRequest("rpc/disarm_google_ads_campaign_daily_schedule",{method:"POST",body:JSON.stringify({p_schedule_id:scheduleId,p_now:new Date().toISOString()})}).catch(()=>false);
 if(disarmed!==true)throw new Error("Google Ads one-shot proof could not restore the schedule to disabled state.");
 if(runnerError)throw runnerError;
 return {scheduleId,result,disarmed:true};
}
