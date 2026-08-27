import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { AuthorizationDeniedError, requirePermission } from "@/lib/identity/authorization-gateway";

const confirmation = "normal-continuous-shadow-acceptance";
const runIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function sameOrigin(request:Request){const origin=request.headers.get("origin"),site=request.headers.get("sec-fetch-site");return(!origin||origin===new URL(request.url).origin)&&(!site||site==="same-origin");}
function response(requestId:string,body:Record<string,unknown>,status:number){return NextResponse.json({...body,requestId},{status,headers:{"x-tracekit-request-id":requestId}});}

export async function POST(request:Request){
  const requestId=randomUUID();
  try {
    if(!sameOrigin(request))return response(requestId,{ok:false,code:"request_verification_failed"},403);
    const resolution=await resolveApplicationSession();
    if(resolution.kind!=="authenticated"||!resolution.session.activeOrganization)return response(requestId,{ok:false,code:"resource_unavailable"},404);
    requirePermission(resolution.session,"connectors.manage");
    const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
    if(!body||Object.keys(body).length!==1||body.confirmation!==confirmation)return response(requestId,{ok:false,code:"explicit_confirmation_required"},400);
    const apiBase=String(process.env.TRACEKIT_API_BASE_URL||process.env.NEXT_PUBLIC_API_BASE_URL||"").replace(/\/$/,"");
    const secret=String(process.env.TK_SECRET_KEY||"").trim();
    if(!apiBase||!secret)return response(requestId,{ok:false,code:"operator_proxy_unavailable"},503);
    const upstream=await fetch(`${apiBase}/internal/commerce/normal-continuous-acceptance`,{method:"POST",headers:{"content-type":"application/json","x-tk-secret":secret},body:JSON.stringify({confirmation,request_key:randomUUID()})});
    const payload=await upstream.json().catch(()=>({})) as Record<string,unknown>;
    const runId=typeof payload.run_id==="string"&&runIdPattern.test(payload.run_id)?payload.run_id:null;
    if(!upstream.ok)return response(requestId,{ok:false,status:upstream.status,code:"normal_acceptance_failed",run_id:runId},upstream.status>=500?502:409);
    return response(requestId,{ok:true,status:upstream.status,run_id:runId,normal_acceptance:payload.normal_acceptance===true,max_pages:payload.max_pages===3?3:null,per_page:payload.per_page===100?100:null},upstream.status===200?200:202);
  } catch(error) {
    if(error instanceof AuthorizationDeniedError)return response(requestId,{ok:false,code:"resource_unavailable"},404);
    return response(requestId,{ok:false,code:"normal_acceptance_failed"},500);
  }
}
