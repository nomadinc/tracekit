export type GoogleSyncAccount={id:string;connectionId:string;externalId:string;isManager:boolean;eligibleForSpendSync:boolean;selectedForSync:boolean;status:string;loginCustomerIds:string[]};
type Window={since:string;until:string};
const DATE=/^\d{4}-\d{2}-\d{2}$/;
function date(v:string){if(!DATE.test(v))throw new Error("Invalid Google Ads sync date.");const d=new Date(v+"T00:00:00Z");if(Number.isNaN(d.getTime()))throw new Error("Invalid Google Ads sync date.");return d;}
function ymd(d:Date){return d.toISOString().slice(0,10);}
function add(v:string,n:number){const d=date(v);d.setUTCDate(d.getUTCDate()+n);return ymd(d);}
function windows(since:string,until:string,maxDays:number){const out:Window[]=[];let cur=since;while(cur<=until){const candidate=add(cur,maxDays-1);const end=candidate<until?candidate:until;out.push({since:cur,until:end});cur=add(end,1);}return out;}
function monthsAgo(asOf:string,months:number){const d=date(asOf);d.setUTCMonth(d.getUTCMonth()-months);return ymd(d);}

export function planGoogleAdsSync(input:{accounts:GoogleSyncAccount[];since:string;until:string;maxWindowDays?:number;overlapDays?:number;maxLookbackMonths?:number;asOf?:string}){
 date(input.since);date(input.until);if(input.since>input.until)throw new Error("Google Ads sync date range is invalid.");
 const maxWindowDays=input.maxWindowDays??31;if(!Number.isInteger(maxWindowDays)||maxWindowDays<1)throw new Error("Invalid Google Ads sync window.");
 const overlap=input.overlapDays??0;if(!Number.isInteger(overlap)||overlap<0)throw new Error("Invalid Google Ads overlap.");
 const effectiveSince=add(input.since,-overlap);
 if(input.maxLookbackMonths&&input.asOf&&effectiveSince<monthsAgo(input.asOf,input.maxLookbackMonths))throw new Error("Google Ads daily historical horizon exceeded.");
 const eligible=input.accounts.filter(a=>a.selectedForSync&&a.eligibleForSpendSync&&!a.isManager&&(a.status==="active"||a.status==="degraded"));
 if(!eligible.length)throw new Error("No selected spend-eligible Google Ads accounts.");
 const targets=eligible.map(a=>{const login=a.loginCustomerIds[0];if(!login)throw new Error("Google Ads manager context unavailable.");return {connectionId:a.connectionId,providerAccountId:a.id,customerId:a.externalId,loginCustomerId:login,windows:windows(effectiveSince,input.until,maxWindowDays)};});
 return {effectiveSince,until:input.until,targets};
}

export async function runGoogleAdsSyncPlan(input:{plan:ReturnType<typeof planGoogleAdsSync>;executeWindow:(x:{connectionId:string;providerAccountId:string;customerId:string;loginCustomerId:string;since:string;until:string})=>Promise<{seen:number;persisted:number}>}){
 const accounts:any[]=[];
 for(const target of input.plan.targets){let seen=0,persisted=0,status:"completed"|"failed"="completed",errorCode:string|null=null;
  try{for(const window of target.windows){const r=await input.executeWindow({...target,...window});seen+=r.seen;persisted+=r.persisted;}}
  catch(e:any){status="failed";errorCode=String(e?.code||e?.message||"google_ads_sync_failed").slice(0,120);}
  accounts.push({providerAccountId:target.providerAccountId,connectionId:target.connectionId,status,seen,persisted,errorCode});
 }
 return {accounts};
}
