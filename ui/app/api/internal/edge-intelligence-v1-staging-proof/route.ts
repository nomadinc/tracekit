import{randomUUID}from"node:crypto";import{readFileSync}from"node:fs";import{NextResponse}from"next/server";import{resolveApplicationSession}from"@/lib/identity/application-session";import{requirePermission,AuthorizationDeniedError}from"@/lib/identity/authorization-gateway";
export const runtime="nodejs";
const STAGING_REF="joahiwgidfbzwzyslrbq";
function out(body:Record<string,unknown>,status=200){return NextResponse.json(body,{status});}
function sameOrigin(r:Request){const o=r.headers.get("origin"),s=r.headers.get("sec-fetch-site");return(!o||o===new URL(r.url).origin)&&(!s||s==="same-origin");}
async function rest(base:string,key:string,path:string,init:RequestInit={}){const r=await fetch(base+"/rest/v1/"+path,{...init,headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",...init.headers}});const text=await r.text();if(!r.ok)throw new Error(path+" "+r.status+" "+text.slice(0,240));return text?JSON.parse(text):null;}
async function rejected(fn:()=>Promise<unknown>){try{await fn();return false}catch{return true}}
export async function POST(request:Request){
 try{
  if(process.env.VERCEL_ENV==="production")return out({ok:false,code:"staging_only"},404);
  const base=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,""),key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!key)return out({ok:false,code:"staging_environment_unavailable"},503);
  const ref=new URL(base).hostname.split(".")[0];if(ref!==STAGING_REF)return out({ok:false,code:"wrong_staging_project"},409);
  if(!sameOrigin(request))return out({ok:false,code:"request_verification_failed"},403);
  const resolution=await resolveApplicationSession();if(resolution.kind!=="authenticated"||!resolution.session.activeOrganization)return out({ok:false,code:"resource_unavailable"},404);requirePermission(resolution.session,"actions.execute");
  const body=await request.json().catch(()=>({})) as Record<string,unknown>;if(body.confirm!==true)return out({ok:false,code:"explicit_confirmation_required"},400);
  const fixture=JSON.parse(readFileSync(new URL("../../../../tests/fixtures/edge-intelligence-v1.examples.json",import.meta.url),"utf8")).scenarios.normalResidential;
  const orgs=await rest(base,key,"tracekit_organizations?select=id&order=created_at.asc&limit=2");if(!Array.isArray(orgs)||orgs.length<2)return out({ok:false,code:"two_staging_organizations_required"},409);
  const suffix=randomUUID().replaceAll("-","").slice(0,12),orgA=orgs[0].id,orgB=orgs[1].id,basePayload={...fixture,tenantRef:"tenant_staging_"+suffix,observationId:"obs_staging_"+suffix,sessionRef:"session_staging_"+suffix,eventRef:"event_staging_"+suffix};
  const rpc=(org:string,payload:any)=>rest(base,key,"rpc/ingest_edge_intelligence_v1",{method:"POST",body:JSON.stringify({p_organization_id:org,p_payload:payload})});
  const first=await rpc(orgA,basePayload),duplicate=await rpc(orgA,basePayload);
  const rev2={...basePayload,revision:2,previousRevision:1,updatedAt:new Date(Date.parse(basePayload.updatedAt)+1000).toISOString(),status:"PARTIAL"};
  const newer=await rpc(orgA,rev2),late=await rpc(orgA,basePayload);
  const conflict=await rejected(()=>rpc(orgA,{...rev2,status:"COMPLETE"})),breakingVersion=await rejected(()=>rpc(orgA,{...basePayload,observationId:"obs_version_"+suffix,schemaVersion:"2.0"})),routingFirewall=await rejected(()=>rpc(orgA,{...basePayload,observationId:"obs_route_"+suffix,intelligence:{...basePayload.intelligence,routingDecision:"money"}})),tenantB=await rpc(orgB,basePayload);
  const q="tenant_ref=eq."+encodeURIComponent(basePayload.tenantRef)+"&observation_id=eq."+encodeURIComponent(basePayload.observationId),current=await rest(base,key,"edge_intelligence_current?select=organization_id,revision&"+q),rows=await rest(base,key,"edge_intelligence_observations?select=organization_id,revision&"+q+"&order=revision.asc");
  const pass=first.outcome==="accepted"&&duplicate.outcome==="duplicate"&&newer.outcome==="accepted"&&late.outcome==="duplicate"&&conflict&&breakingVersion&&routingFirewall&&tenantB.outcome==="accepted"&&current.length===2&&rows.length===3&&current.find((x:any)=>x.organization_id===orgA)?.revision===2&&current.find((x:any)=>x.organization_id===orgB)?.revision===1;
  return out({ok:pass,project:STAGING_REF,first:first.outcome,duplicate:duplicate.outcome,newer:newer.outcome,lateExistingRevision:late.outcome,conflictRejected:conflict,breakingVersionRejected:breakingVersion,routingFirewallRejected:routingFirewall,tenantIsolation:tenantB.outcome==="accepted",current,immutableRows:rows.length},pass?200:500);
 }catch(error){if(error instanceof AuthorizationDeniedError)return out({ok:false,code:"resource_unavailable"},404);return out({ok:false,code:"staging_proof_failed",detail:error instanceof Error?error.message:"unknown"},500)}
}