import { inspectRefundIdentityBridge } from "@/lib/commerce/commas-refund-detail-inspector";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { CommasClient } from "../../../../../../api/src/connectors/commas/client";
import { auditCommasRawTransaction } from "../../../../../../api/src/connectors/commas/raw-evidence-audit";
import { decodeCommerceCredentialKey, decryptCommerceCredential } from "@/lib/commerce/credential-crypto";
import { supabaseAuthHeaders } from "@/lib/commerce/supabase-auth";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { AuthorizationDeniedError, requirePermission } from "@/lib/identity/authorization-gateway";

export const maxDuration=300;
export const dynamic="force-dynamic";
type Row=Record<string,unknown>;
const HARD_MAX=10;
function sameOrigin(request:Request){const origin=request.headers.get("origin"),site=request.headers.get("sec-fetch-site");return(!origin||origin===new URL(request.url).origin)&&(!site||site==="same-origin");}
function response(requestId:string,body:Record<string,unknown>,status:number){return NextResponse.json({...body,requestId},{status,headers:{"x-tracekit-request-id":requestId,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});}
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

export async function GET(request:Request){
 const requestId=randomUUID();
 try{
  if(!sameOrigin(request))return response(requestId,{ok:false,code:"request_verification_failed"},403);
  const resolution=await resolveApplicationSession();
  if(resolution.kind!=="authenticated"||!resolution.session.activeOrganization)return response(requestId,{ok:false,code:"resource_unavailable"},404);
  requirePermission(resolution.session,"connectors.manage");requirePermission(resolution.session,"imports.manage");
  const org=resolution.session.activeOrganization.id;
  if(org!=="c98d44be-5f7f-41a2-a9d3-ae67a811a872")return response(requestId,{ok:false,code:"resource_unavailable"},404);
  const connectionId="8030cf89-88f3-433f-99ec-c2083c4e5698",providerAccountId="dd3506d5-3417-4086-8623-9f8ec6b81694";
  const connections=await db(`commerce_provider_connections?id=eq.${connectionId}&organization_id=eq.${org}&provider=eq.commas&status=eq.connected&select=id&limit=2`);
  const accounts=await db(`commerce_provider_accounts?id=eq.${providerAccountId}&connection_id=eq.${connectionId}&organization_id=eq.${org}&status=eq.active&select=id&limit=2`);
  if(connections.length!==1||accounts.length!==1)throw new Error("scope");
  const ids=["YE2xY","zpRA2","1w2qq","ADwrj","Z63yg","9rlBz","W6Zvo","QWQm5","pYEVm"];
  const observations=await db(`commerce_refund_created_observations?organization_id=eq.${org}&connection_id=eq.${connectionId}&provider_account_id=eq.${providerAccountId}&provider_refund_hashid=in.(${ids.join(",")})&select=id,provider_refund_hashid,original_payment_id,canonical_order_id&limit=10`);
  if(observations.length!==9||new Set(observations.map(o=>o.provider_refund_hashid)).size!==9)throw new Error("cohort");
  const credentials=await db(`commerce_provider_credentials?connection_id=eq.${connectionId}&organization_id=eq.${org}&revoked_at=is.null&select=encryption_key_id,encryption_version,secret_iv,secret_ciphertext&limit=2`);
  if(credentials.length!==1)throw new Error("credentials");
  const row=credentials[0],keyId=process.env.COMMERCE_CREDENTIALS_KEY_ID,version=Number(process.env.COMMERCE_CREDENTIALS_ENCRYPTION_VERSION||"1");
  if(!keyId||String(row.encryption_key_id)!==keyId||Number(row.encryption_version)!==version)throw new Error("envelope");
  const secret=await decryptCommerceCredential({keyId,encryptionVersion:version,iv:bytes(row.secret_iv),ciphertext:bytes(row.secret_ciphertext)},decodeCommerceCredentialKey(process.env.COMMERCE_CREDENTIALS_ENC_KEY));
  const client=new CommasClient({apiKey:secret,environment:"production",maxAttempts:1,timeoutMs:15000});
  const results:unknown[]=[];
  for(const o of observations){
   const orders=await db(`platform_orders?organization_id=eq.${org}&connection_id=eq.${connectionId}&provider_account_id=eq.${providerAccountId}&canonical_order_id=eq.${o.canonical_order_id}&select=transaction_id&limit=2`);
   if(orders.length!==1||!/^\d+$/.test(String(orders[0].transaction_id)))throw new Error("parent");
   const transactionId=String(orders[0].transaction_id);
   try{
    const detail=await client.getTransaction(transactionId,{correlationId:`refund-detail-${requestId}-${o.id}`});
    results.push({observationId:o.id,...inspectRefundIdentityBridge(detail.item as Row,transactionId,String(o.original_payment_id),String(o.provider_refund_hashid))});
   }catch{results.push({observationId:o.id,state:"provider_detail_unavailable"});}
  }
  return response(requestId,{ok:true,mode:"read_only",writes:0,checkpointsAdvanced:false,results},200);
 }catch(error){
  return response(requestId,{ok:false,code:error instanceof AuthorizationDeniedError?"resource_unavailable":"refund_detail_inspection_unavailable"},409);
 }
}
