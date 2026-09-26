import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { buildGoogleAdsManagementState } from "@/lib/integrations/google-ads-management";
import { resolveGoogleAdsRefreshToken } from "@/lib/integrations/google-ads-credential";
import { refreshGoogleAccessToken,GOOGLE_ADS_API_VERSION } from "@/lib/integrations/google-ads-oauth";
import { fetchGoogleAdDailyReport } from "@/lib/integrations/google-ads-reporting-client";
import { persistGoogleAdDailyRows } from "@/lib/integrations/google-ads-reporting-persistence";
import { createGoogleSyncRun,completeGoogleSyncWindow,finishGoogleSyncRun } from "@/lib/integrations/google-ads-sync-control";
import { runGoogleAdsManualSyncCertification } from "@/lib/integrations/google-ads-run-now";
const h=(id:string)=>({"x-tracekit-request-id":id});
function flatten(nodes:any[]):any[]{return nodes.flatMap(n=>[n,...flatten(n.children||[])]);}
export async function POST(request:Request){const requestId=randomUUID();try{
 const r=await resolveApplicationSession();if(r.kind!=="authenticated"||!r.session.activeOrganization||!r.session.effectivePermissions.includes("connectors.manage"))return NextResponse.json({ok:false,message:"The requested resource is unavailable.",requestId},{status:404,headers:h(requestId)});
 const body=await request.json() as any;const connectionId=String(body.connectionId||""),since=String(body.since||""),until=String(body.until||"");if(!/^[0-9a-f-]{36}$/i.test(connectionId))return NextResponse.json({ok:false,message:"A valid Google Ads connection is required.",requestId},{status:400,headers:h(requestId)});
 const state=await buildGoogleAdsManagementState({organizationId:r.session.activeOrganization.id});const connection=state.connections.find((x:any)=>x.id===connectionId);if(!connection)return NextResponse.json({ok:false,message:"The requested resource is unavailable.",requestId},{status:404,headers:h(requestId)});
 const accounts=flatten(connection.accounts).map((a:any)=>({id:a.id,connectionId,externalId:a.externalId,isManager:a.isManager,eligibleForSpendSync:a.eligibleForSpendSync,selectedForSync:a.selectedForSync,status:a.status,loginCustomerIds:Array.isArray(a.metadata?.google?.loginCustomerIds)?a.metadata.google.loginCustomerIds:[]}));
 const refreshToken=await resolveGoogleAdsRefreshToken({organizationId:r.session.activeOrganization.id,connectionId});
 const token=await refreshGoogleAccessToken({refreshToken,clientId:String(process.env.GOOGLE_ADS_CLIENT_ID||""),clientSecret:String(process.env.GOOGLE_ADS_CLIENT_SECRET||"")});
 const result=await runGoogleAdsManualSyncCertification({organizationId:r.session.activeOrganization.id,requestedByUserId:r.session.user.id,accounts,since,until,
  createRun:async x=>{const row=await createGoogleSyncRun(x);const id=String((row as any).id||"");if(!id)throw new Error("google_ads_sync_run_missing_id");return{id};},fetchReport:x=>fetchGoogleAdDailyReport({...x,accessToken:token.accessToken}),
  persistRows:x=>persistGoogleAdDailyRows({...x,apiVersion:GOOGLE_ADS_API_VERSION}),
  checkpoint:async x=>{await completeGoogleSyncWindow(x);},finishRun:async x=>{await finishGoogleSyncRun(x);},
 });
 return NextResponse.json({ok:true,...result,requestId},{headers:h(requestId)});
}catch(e:any){return NextResponse.json({ok:false,message:String(e?.message||"Google Ads manual sync failed."),requestId},{status:400,headers:h(requestId)});}}
