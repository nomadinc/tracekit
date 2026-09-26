import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";
import { requireTkidOriginManagement } from "@/lib/tkid/origin-authorization";

type Row=Record<string,unknown>;
const json=(body:Record<string,unknown>,status=200)=>NextResponse.json(body,{status});
function sameOrigin(request:Request){const origin=request.headers.get("origin"),site=request.headers.get("sec-fetch-site");return(!origin||origin===new URL(request.url).origin)&&(!site||site==="same-origin")}
async function scope(){const resolution=await resolveApplicationSession();if(resolution.kind!=="authenticated"||!resolution.session.activeOrganization)throw new Error("unavailable");requireTkidOriginManagement(resolution.session);return{session:resolution.session,organizationId:resolution.session.activeOrganization.id}}
async function ownedSource(organizationId:string,sourceId:string){const rows=await commercePersistenceRequest(`tkid_sources?organization_id=eq.${encodeURIComponent(organizationId)}&id=eq.${encodeURIComponent(sourceId)}&select=id&limit=1`)as Row[];return rows[0]||null}

export async function GET(request:Request,context:{params:Promise<{sourcePath:string[]}>}){
  try{const authorized=await scope(),path=(await context.params).sourcePath,sourceId=path[0],originId=new URL(request.url).searchParams.get("originId");if(path[1]!=="proof-status"||!sourceId||!originId||!await ownedSource(authorized.organizationId,sourceId))return json({ok:false,code:"resource_unavailable"},404);const rows=await commercePersistenceRequest("rpc/get_tkid_bounded_proof_status_v1",{method:"POST",body:JSON.stringify({p_organization_id:authorized.organizationId,p_source_id:sourceId,p_origin_id:originId})})as Row[];if(!rows[0])return json({ok:false,code:"resource_unavailable"},404);return json({ok:true,status:rows[0]})}catch{return json({ok:false,code:"resource_unavailable"},404)}
}

export async function POST(request:Request,context:{params:Promise<{sourcePath:string[]}>}){
  try{if(!sameOrigin(request))return json({ok:false,code:"request_verification_failed"},403);const authorized=await scope(),path=(await context.params).sourcePath,sourceId=path[0],action=path[1],body=await request.json().catch(()=>({}))as Record<string,unknown>;if(!sourceId||!await ownedSource(authorized.organizationId,sourceId)||!['start-ingestion','stop-ingestion'].includes(action))return json({ok:false,code:"resource_unavailable"},404);if(body.confirmation!=="set-tkid-source-ingestion-state"||typeof body.reason!=="string"||!body.reason.trim())return json({ok:false,code:"explicit_confirmation_required"},400);const correlationId=typeof body.correlationId==="string"&&body.correlationId.trim()?body.correlationId.trim():randomUUID(),state=action==="start-ingestion"?"enabled":"stopped";const rows=await commercePersistenceRequest("rpc/set_tkid_source_ingestion_state_v1",{method:"POST",body:JSON.stringify({p_organization_id:authorized.organizationId,p_source_id:sourceId,p_state:state,p_reason:body.reason.trim(),p_actor_user_id:authorized.session.user.id,p_correlation_id:correlationId,p_confirmation:body.confirmation})})as Row[];return json({ok:true,result:rows[0],correlationId})}catch{return json({ok:false,code:"resource_unavailable"},404)}
}
