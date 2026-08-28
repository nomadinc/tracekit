import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { AuthorizationDeniedError, requirePermission } from "@/lib/identity/authorization-gateway";

const confirmation = "redeliver-normal-continuous-acceptance";
const RUN_ID = "1f01c739-f609-4cf8-aff1-b2a5891ddd8a";
const allowedCodes = new Set(["explicit_redelivery_confirmation_required","normal_acceptance_redelivery_controls_blocked","normal_acceptance_redelivery_queue_unavailable","normal_acceptance_redelivery_claim_rejected","normal_acceptance_redelivery_claim_invalid","normal_acceptance_redelivery_post_claim_rejected","normal_acceptance_redelivery_dispatch_ambiguous"]);
function sameOrigin(request:Request){const origin=request.headers.get("origin"),site=request.headers.get("sec-fetch-site");return(!origin||origin===new URL(request.url).origin)&&(!site||site==="same-origin")}
function response(requestId:string,body:Record<string,unknown>,status:number){return NextResponse.json({...body,requestId},{status,headers:{"x-tracekit-request-id":requestId}})}
function safeCode(value:unknown){const code=String(value||"");return allowedCodes.has(code)?code:"normal_acceptance_redelivery_failed"}
function safeRunId(value:unknown){return value===RUN_ID?RUN_ID:null}

export async function POST(request:Request){
  const requestId=randomUUID();
  try{
    if(!sameOrigin(request))return response(requestId,{ok:false,code:"request_verification_failed"},403);
    const resolution=await resolveApplicationSession();
    if(resolution.kind!=="authenticated"||!resolution.session.activeOrganization)return response(requestId,{ok:false,code:"resource_unavailable"},404);
    requirePermission(resolution.session,"connectors.manage");
    const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
    if(!body||Object.keys(body).length!==1||body.confirmation!==confirmation)return response(requestId,{ok:false,code:"explicit_confirmation_required"},400);
    const apiBase=String(process.env.TRACEKIT_API_BASE_URL||process.env.NEXT_PUBLIC_API_BASE_URL||"").replace(/\/$/,"");
    const secret=String(process.env.TK_SECRET_KEY||"").trim();
    if(!apiBase||!secret)return response(requestId,{ok:false,code:"operator_proxy_unavailable"},503);
    const upstream=await fetch(`${apiBase}/internal/commerce/redeliver-normal-continuous-acceptance`,{method:"POST",headers:{"content-type":"application/json","x-tk-secret":secret},body:JSON.stringify({confirmation})});
    const payload=await upstream.json().catch(()=>({})) as Record<string,unknown>;
    const runId=safeRunId(payload.run_id);
    if(!upstream.ok)return response(requestId,{ok:false,status:upstream.status,code:safeCode(payload.code),run_id:runId},upstream.status>=500?502:409);
    return response(requestId,{ok:true,status:upstream.status,run_id:runId,normal_acceptance:payload.normal_acceptance===true,redelivery:payload.redelivery===true,max_pages:payload.max_pages===5?5:null,per_page:payload.per_page===100?100:null},202);
  }catch(error){
    if(error instanceof AuthorizationDeniedError)return response(requestId,{ok:false,code:"resource_unavailable"},404);
    return response(requestId,{ok:false,code:"normal_acceptance_redelivery_failed"},500);
  }
}
