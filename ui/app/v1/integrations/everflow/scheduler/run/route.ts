import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { createCommerceControlPlane } from "@/lib/commerce/server-control-plane";
import { MemoryCommerceEvidenceStore } from "@/lib/commerce/evidence-store";
import { runDueEverflowSchedules } from "@/lib/integrations/everflow-scheduled-worker";

const headers=(requestId:string)=>({"x-tracekit-request-id":requestId});
function sameOrigin(request:Request){const origin=request.headers.get("origin"),fetchSite=request.headers.get("sec-fetch-site");return(!origin||origin===new URL(request.url).origin)&&(!fetchSite||fetchSite==="same-origin");}

export async function POST(request:Request){
 const requestId=randomUUID();
 try{
  if(!sameOrigin(request))return NextResponse.json({ok:false,message:"Request verification failed.",requestId},{status:403,headers:headers(requestId)});
  const resolution=await resolveApplicationSession();
  if(resolution.kind!=="authenticated"||!resolution.session.activeOrganization)return NextResponse.json({ok:false,message:"The requested resource is unavailable.",requestId},{status:404,headers:headers(requestId)});
  const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
  const connectionId=typeof body?.connectionId==="string"?body.connectionId.trim():"";
  if(!/^[0-9a-f-]{36}$/i.test(connectionId))return NextResponse.json({ok:false,message:"A valid Everflow connection is required.",requestId},{status:400,headers:headers(requestId)});
  const plane=createCommerceControlPlane({evidenceStore:new MemoryCommerceEvidenceStore()});
  const connection=await plane.getConnection(resolution.session,connectionId);
  if(connection.provider!=="everflow"||connection.status!=="connected"||connection.organizationId!==resolution.session.activeOrganization.id)return NextResponse.json({ok:false,message:"Everflow connection is unavailable.",requestId},{status:409,headers:headers(requestId)});
  const result=await runDueEverflowSchedules({connectionId,limit:1});
  return NextResponse.json({ok:true,...result,requestId},{headers:headers(requestId)});
 }catch(error){console.error("[TraceKit] everflow.scheduler.preview_failed",{requestId,error:error instanceof Error?error.message:"unknown"});return NextResponse.json({ok:false,message:"TraceKit could not run the Everflow scheduler.",requestId},{status:500,headers:headers(requestId)});}
}
