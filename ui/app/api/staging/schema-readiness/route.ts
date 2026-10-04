import {NextResponse} from"next/server";
export const runtime="nodejs";export const dynamic="force-dynamic";
function response(body:Record<string,unknown>,status=200){return NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});}
function env(){const base=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,""),key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!base||!key)throw new Error("persistence_unavailable");return{base,key};}
export async function GET(request:Request){
 if(process.env.NODE_ENV==="production"&&!new URL(request.url).hostname.includes("staging"))return response({ok:false,code:"not_available"},404);
 try{
  const{base,key}=env(),r=await fetch(base+"/rest/v1/rpc/tracekit_runtime_schema_readiness_v1",{method:"POST",cache:"no-store",headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"},body:"{}"}),text=await r.text();
  if(!r.ok)return response({ok:false,code:"schema_readiness_unavailable",status:r.status},503);
  const readiness=text?JSON.parse(text):null;
  return response({ok:Boolean(readiness?.ok),code:readiness?.ok?"staging_schema_ready":"staging_schema_drift",readiness},readiness?.ok?200:503);
 }catch{return response({ok:false,code:"schema_readiness_unavailable"},503);}
}
