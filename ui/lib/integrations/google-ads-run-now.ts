import { planGoogleAdsSync,type GoogleSyncAccount } from "./google-ads-sync-orchestrator";

type Counters={seen:number;created:number;updated:number;unchanged:number;evidenceCreated:number;costsCreated:number;costsUpdated:number};
export async function runGoogleAdsManualSyncCertification(input:{
 organizationId:string;requestedByUserId:string;accounts:GoogleSyncAccount[];since:string;until:string;
 createRun:(x:any)=>Promise<{id:string}>;fetchReport:(x:any)=>Promise<{rows:any[];requestIds:string[];pages:number}>;
 persistRows:(x:any)=>Promise<Counters>;checkpoint:(x:any)=>Promise<void>;finishRun:(x:any)=>Promise<void>;
 scheduleMutation?:()=>Promise<void>;
}){
 const plan=planGoogleAdsSync({accounts:input.accounts,since:input.since,until:input.until,maxWindowDays:31});
 const results:any[]=[];
 for(const target of plan.targets){
  const run=await input.createRun({organizationId:input.organizationId,connectionId:target.connectionId,providerAccountId:target.providerAccountId,requestedByUserId:input.requestedByUserId,mode:"incremental"});
  const total={seen:0,created:0,updated:0,unchanged:0,failed:0,evidenceCreated:0,costsCreated:0,costsUpdated:0};let status:"completed"|"failed"="completed";let errorCode:string|undefined;
  try{
   for(const window of target.windows){
    const report=await input.fetchReport({customerId:target.customerId,loginCustomerId:target.loginCustomerId,since:window.since,until:window.until,providerAccountId:target.providerAccountId});
    const persisted=await input.persistRows({organizationId:input.organizationId,connectionId:target.connectionId,providerAccountId:target.providerAccountId,syncRunId:run.id,rawRows:report.rows});
    total.seen+=persisted.seen;total.created+=persisted.created;total.updated+=persisted.updated;total.unchanged+=persisted.unchanged;total.evidenceCreated+=persisted.evidenceCreated;total.costsCreated+=persisted.costsCreated;total.costsUpdated+=persisted.costsUpdated;
    await input.checkpoint({organizationId:input.organizationId,connectionId:target.connectionId,providerAccountId:target.providerAccountId,runId:run.id,since:window.since,until:window.until,seen:persisted.seen,persisted:persisted.created+persisted.updated+persisted.unchanged,failed:0,requestIds:report.requestIds});
   }
  }catch(e:any){status="failed";total.failed+=1;errorCode=String(e?.code||e?.message||"google_ads_sync_failed").slice(0,120);}
  await input.finishRun({organizationId:input.organizationId,providerAccountId:target.providerAccountId,runId:run.id,status,seen:total.seen,created:total.created,updated:total.updated,unchanged:total.unchanged,failed:total.failed,errorCode});
  results.push({providerAccountId:target.providerAccountId,runId:run.id,status,...total,errorCode:errorCode||null});
 }
 return {accounts:results};
}
