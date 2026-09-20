import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { CommasClient } from "../../../../../../api/src/connectors/commas/client";
import { auditCommasRawTransaction } from "../../../../../../api/src/connectors/commas/raw-evidence-audit";
import { decodeCommerceCredentialKey, decryptCommerceCredential } from "@/lib/commerce/credential-crypto";
import { supabaseAuthHeaders } from "@/lib/commerce/supabase-auth";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { AuthorizationDeniedError, requirePermission } from "@/lib/identity/authorization-gateway";

type Row=Record<string,unknown>;
const HARD_MAX=10;
function sameOrigin(request:Request){const origin=request.headers.get("origin"),site=request.headers.get("sec-fetch-site");return(!origin||origin===new URL(request.url).origin)&&(!site||site==="same-origin");}
function response(requestId:string,body:Record<string,unknown>,status:number){return NextResponse.json({...body,requestId},{status,headers:{"x-tracekit-request-id":requestId}});}
function config(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,""),key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error("Persistence unavailable.");return{url,key};}
async function db(path:string){const{url,key}=config();const r=await fetch(`${url}/rest/v1/${path}`,{headers:supabaseAuthHeaders(key),cache:"no-store"});if(!r.ok)throw new Error("Audit lookup failed.");const v=await r.json();return(Array.isArray(v)?v:[v]) as Row[];}
const bytes=(v:unknown)=>Uint8Array.from(Buffer.from(String(v).replace(/^\\x/,""),"hex"));

export async function POST(request:Request){
 const requestId=randomUUID();
 try{
  if(!sameOrigin(request))return response(requestId,{ok:false,code:"request_verification_failed"},403);
  const resolution=await resolveApplicationSession();
  if(resolution.kind!=="authenticated"||!resolution.session.activeOrganization)return response(requestId,{ok:false,code:"resource_unavailable"},404);
  requirePermission(resolution.session,"connectors.manage");
  const body=await request.json().catch(()=>({})) as Row;
  const max=Number(body.max??10);if(!Number.isInteger(max)||max<1||max>HARD_MAX)return response(requestId,{ok:false,code:"invalid_bound"},400);
  const org=resolution.session.activeOrganization.id;
  const connections=await db(`commerce_provider_connections?provider=eq.commas&status=eq.connected&organization_id=eq.${encodeURIComponent(org)}&select=id,organization_id&limit=2`);
  if(connections.length!==1)return response(requestId,{ok:false,code:"commas_connection_unavailable"},409);
  const connectionId=String(connections[0].id);
  const credentials=await db(`commerce_provider_credentials?connection_id=eq.${connectionId}&organization_id=eq.${encodeURIComponent(org)}&revoked_at=is.null&select=encryption_key_id,encryption_version,secret_iv,secret_ciphertext&limit=2`);
  if(credentials.length!==1)return response(requestId,{ok:false,code:"commas_credential_unavailable"},409);
  const row=credentials[0],keyId=process.env.COMMERCE_CREDENTIALS_KEY_ID,version=Number(process.env.COMMERCE_CREDENTIALS_ENCRYPTION_VERSION||"1");
  if(!keyId||String(row.encryption_key_id)!==keyId||Number(row.encryption_version)!==version)return response(requestId,{ok:false,code:"credential_envelope_mismatch"},503);
  const secret=await decryptCommerceCredential({keyId,encryptionVersion:version,iv:bytes(row.secret_iv),ciphertext:bytes(row.secret_ciphertext)},decodeCommerceCredentialKey(process.env.COMMERCE_CREDENTIALS_ENC_KEY));
  const client=new CommasClient({apiKey:secret,environment:"production"});
  const page=await client.listTransactions({page:1,perPage:max},{correlationId:`commas-admin-readonly-audit-${requestId}`});
  const items=page.items.slice(0,max);
  return response(requestId,{ok:true,mode:"read_only",providerRequests:1,sourceTransactions:items.length,writes:0,checkpointsAdvanced:false,observations:items.map(item=>auditCommasRawTransaction(item as Row))},200);
 }catch(error){
  if(error instanceof AuthorizationDeniedError)return response(requestId,{ok:false,code:"resource_unavailable"},404);
  return response(requestId,{ok:false,code:"commas_readonly_audit_failed"},500);
 }
}
