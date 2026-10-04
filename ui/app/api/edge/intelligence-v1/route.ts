import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { validateEdgeIntelligenceV1 } from "@/lib/edge/intelligence-v1-validator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Credential = { id:string; organization_id:string; tenant_ref:string; token_hash:string };

function response(body:Record<string,unknown>,status=200){return NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}})}
function env(){
  const base=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,"");
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!key)throw new Error("persistence_unavailable");
  return{base,key};
}
async function rest(path:string,init:RequestInit={}){
  const {base,key}=env();
  const r=await fetch(base+"/rest/v1/"+path,{...init,cache:"no-store",headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",...init.headers}});
  const text=await r.text();
  if(!r.ok)throw new Error("persistence_failed_"+r.status);
  return text?JSON.parse(text):null;
}
function bearer(request:Request){
  const value=request.headers.get("authorization")||"";
  return value.startsWith("Bearer ")?value.slice(7).trim():"";
}
function hashToken(token:string){return createHash("sha256").update(token).digest("hex")}
function equalHash(a:string,b:string){
  if(a.length!==b.length)return false;
  return timingSafeEqual(Buffer.from(a),Buffer.from(b));
}

export async function POST(request:Request){
  try{
    const token=bearer(request);
    if(token.length<32)return response({ok:false,code:"unauthorized"},401);
    const tokenHash=hashToken(token);
    const rows=await rest("edge_intelligence_ingest_credentials?token_hash=eq."+encodeURIComponent(tokenHash)+"&status=eq.active&select=id,organization_id,tenant_ref,token_hash&limit=1") as Credential[];
    const credential=Array.isArray(rows)?rows[0]:undefined;
    if(!credential||!equalHash(credential.token_hash,tokenHash))return response({ok:false,code:"unauthorized"},401);

    const payload=await request.json().catch(()=>null);
    const validation=validateEdgeIntelligenceV1(payload,{tenantRef:credential.tenant_ref});
    if(!validation.ok)return response({ok:false,code:"invalid_edge_intelligence",errors:validation.errors},400);

    const result=await rest("rpc/ingest_edge_intelligence_v1",{method:"POST",body:JSON.stringify({p_organization_id:credential.organization_id,p_payload:validation.value})});
    await rest("edge_intelligence_ingest_credentials?id=eq."+encodeURIComponent(credential.id),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({last_used_at:new Date().toISOString()})}).catch(()=>undefined);
    return response({ok:true,outcome:result?.outcome,revision:result?.revision,currentRevision:result?.currentRevision},result?.outcome==="accepted"?201:200);
  }catch(error){
    console.error("edge_intelligence_v1_delivery_failed",{message:error instanceof Error?error.message:"unknown"});
    return response({ok:false,code:"delivery_unavailable"},503);
  }
}
