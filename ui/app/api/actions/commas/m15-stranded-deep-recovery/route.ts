import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { AuthorizationDeniedError, requirePermission } from "@/lib/identity/authorization-gateway";
import { M15_STRANDED_DEEP_ORGANIZATION_ID, runM15StrandedDeepEvidenceRecovery } from "@/lib/commerce/commas-continuous-worker";

export const dynamic="force-dynamic";
export const maxDuration=300;
const CONFIRMATION="recover-m15-stranded-deep-evidence";

function sameOrigin(request:Request){const origin=request.headers.get("origin"),site=request.headers.get("sec-fetch-site");return(!origin||origin===new URL(request.url).origin)&&(!site||site==="same-origin");}
function response(requestId:string,body:Record<string,unknown>,status:number){return NextResponse.json({...body,requestId},{status,headers:{"x-tracekit-request-id":requestId}});}

export async function POST(request:Request){
  const requestId=randomUUID();
  try{
    if(!sameOrigin(request))return response(requestId,{ok:false,code:"request_verification_failed"},403);
    const resolution=await resolveApplicationSession();
    if(resolution.kind!=="authenticated"||resolution.session.activeOrganization?.id!==M15_STRANDED_DEEP_ORGANIZATION_ID)return response(requestId,{ok:false,code:"resource_unavailable"},404);
    requirePermission(resolution.session,"actions.execute");
    const body=await request.json().catch(()=>({})) as Record<string,unknown>;
    if(body.confirmation!==CONFIRMATION)return response(requestId,{ok:false,code:"explicit_confirmation_required"},400);
    const result=await runM15StrandedDeepEvidenceRecovery({confirm:true});
    return response(requestId,{ok:true,recovery:result},200);
  }catch(error){
    if(error instanceof AuthorizationDeniedError)return response(requestId,{ok:false,code:"resource_unavailable"},404);
    const message=error instanceof Error?error.message.slice(0,200):"unknown_error";
    console.error("m15_stranded_deep_recovery_failed",{requestId,message});
    return response(requestId,{ok:false,code:"m15_stranded_deep_recovery_failed"},409);
  }
}
