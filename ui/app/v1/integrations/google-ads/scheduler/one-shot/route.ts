import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { runGoogleAdsSchedulerOneShot } from "@/lib/integrations/google-ads-scheduler-one-shot";
const headers=(id:string)=>({"x-tracekit-request-id":id});
function sameOrigin(request:Request){const origin=request.headers.get("origin"),site=request.headers.get("sec-fetch-site");return(!origin||origin===new URL(request.url).origin)&&(!site||site==="same-origin");}
export async function POST(request:Request){
 const requestId=randomUUID();
 try{
  if(!sameOrigin(request))return NextResponse.json({ok:false,message:"Request verification failed.",requestId},{status:403,headers:headers(requestId)});
  const resolution=await resolveApplicationSession();
  if(resolution.kind!=="authenticated"||!resolution.session.activeOrganization||!resolution.session.effectivePermissions.includes("connectors.manage"))return NextResponse.json({ok:false,message:"The requested resource is unavailable.",requestId},{status:404,headers:headers(requestId)});
  const body=await request.json().catch(()=>null) as {connectionId?:unknown}|null,connectionId=typeof body?.connectionId==="string"?body.connectionId.trim():"";
  if(!/^[0-9a-f-]{36}$/i.test(connectionId))return NextResponse.json({ok:false,message:"A valid Google Ads connection is required.",requestId},{status:400,headers:headers(requestId)});
  const proof=await runGoogleAdsSchedulerOneShot({organizationId:resolution.session.activeOrganization.id,connectionId});
  return NextResponse.json({ok:true,...proof,requestId},{headers:headers(requestId)});
 }catch{return NextResponse.json({ok:false,message:"TraceKit could not complete the Google Ads one-shot scheduler proof.",requestId},{status:500,headers:headers(requestId)})}
}
