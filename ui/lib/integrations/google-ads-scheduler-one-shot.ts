import "server-only";
import { marketingPersistenceRequest } from "./marketing-provider-repository";
import { runDueGoogleAdsReportingSchedules } from "./google-ads-scheduled-worker";
type Row=Record<string,unknown>;
function rpcBoolean(value:unknown,key:string){
 if(value===true)return true;
 if(Array.isArray(value)){const first=value[0] as Row|boolean|undefined;if(first===true)return true;if(first&&typeof first==="object"){if(first[key]===true)return true;const values=Object.values(first);if(values.length===1&&values[0]===true)return true}}
 return false;
}
export async function runGoogleAdsSchedulerOneShot(input:{organizationId:string;connectionId:string}){
 const schedules=await marketingPersistenceRequest(`marketing_reporting_schedules?organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}&provider=eq.google_ads&resource=eq.campaign_daily&limit=2`) as Row[];
 if(schedules.length!==1)throw new Error("Exactly one Google Ads reporting schedule is required.");
 const scheduleId=String(schedules[0].id);
 let armed=false,result:{due:number;claimed:number;completed:number;failed:number}|null=null,operationError:unknown=null;
 try{
  const armResponse=await marketingPersistenceRequest("rpc/arm_google_ads_campaign_daily_schedule_once",{method:"POST",body:JSON.stringify({p_schedule_id:scheduleId,p_now:new Date().toISOString()})});
  armed=rpcBoolean(armResponse,"arm_google_ads_campaign_daily_schedule_once");
  if(!armed)throw new Error("Google Ads reporting schedule could not be armed for one-shot proof.");
  result=await runDueGoogleAdsReportingSchedules({organizationId:input.organizationId,connectionId:input.connectionId,limit:1});
 }catch(error){operationError=error}
 let disarmed=!armed;
 if(armed){
  const disarmResponse=await marketingPersistenceRequest("rpc/disarm_google_ads_campaign_daily_schedule",{method:"POST",body:JSON.stringify({p_schedule_id:scheduleId,p_now:new Date().toISOString()})}).catch(()=>null);
  disarmed=rpcBoolean(disarmResponse,"disarm_google_ads_campaign_daily_schedule");
 }
 if(!disarmed)throw new Error("Google Ads one-shot proof could not restore the schedule to disabled state.");
 if(operationError)throw operationError;
 return {scheduleId,result,disarmed:true};
}
