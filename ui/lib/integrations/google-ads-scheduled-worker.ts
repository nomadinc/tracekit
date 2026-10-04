import "server-only";
import { randomUUID } from "node:crypto";
import { marketingPersistenceRequest } from "./marketing-provider-repository";
import { ingestGoogleAdsReportingBounded } from "./google-ads-reporting-ingestion";
type Row=Record<string,unknown>;

export async function runDueGoogleAdsReportingSchedules(input:{organizationId?:string;connectionId?:string;limit?:number}={}){
 const limit=Math.min(3,Math.max(1,input.limit||1)),now=new Date().toISOString();
 const filters=["provider=eq.google_ads","resource=eq.campaign_daily","enabled=eq.true","activation_state=eq.enabled","sync_frequency=neq.manual",`next_run_at=lte.${encodeURIComponent(now)}`];
 if(input.organizationId)filters.push(`organization_id=eq.${encodeURIComponent(input.organizationId)}`);
 if(input.connectionId)filters.push(`connection_id=eq.${encodeURIComponent(input.connectionId)}`);
 const due=await marketingPersistenceRequest(`marketing_reporting_schedules?${filters.join("&")}&order=next_run_at.asc&limit=${limit}`) as Row[];
 let claimed=0,completed=0,failed=0;
 for(const schedule of due){
  const owner=`google-ads-${randomUUID()}`,scheduleId=String(schedule.id);
  const rows=await marketingPersistenceRequest("rpc/claim_google_ads_campaign_daily_schedule",{method:"POST",body:JSON.stringify({p_schedule_id:scheduleId,p_now:new Date().toISOString(),p_lease_owner:owner,p_lease_seconds:900})}) as Row[];
  if(!rows[0])continue;claimed++;
  try{
   await ingestGoogleAdsReportingBounded({organizationId:String(schedule.organization_id),connectionId:String(schedule.connection_id),days:7});
   await marketingPersistenceRequest("rpc/finish_google_ads_campaign_daily_schedule",{method:"POST",body:JSON.stringify({p_schedule_id:scheduleId,p_lease_owner:owner,p_now:new Date().toISOString(),p_outcome:"completed"})});completed++;
  }catch{
   await marketingPersistenceRequest("rpc/finish_google_ads_campaign_daily_schedule",{method:"POST",body:JSON.stringify({p_schedule_id:scheduleId,p_lease_owner:owner,p_now:new Date().toISOString(),p_outcome:"failed"})}).catch(()=>null);failed++;
  }
 }
 return {due:due.length,claimed,completed,failed};
}
