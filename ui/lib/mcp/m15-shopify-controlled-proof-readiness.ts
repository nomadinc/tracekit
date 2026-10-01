import{decodeCommerceCredentialKey,decryptCommerceCredential}from"@/lib/commerce/credential-crypto";
import{supabaseAuthHeaders}from"@/lib/commerce/supabase-auth";
import{parseShopifyConnectionCredential}from"@/lib/commerce/shopify-verifier";
import{listTraceKitShopifyWebhookSubscriptions,SHOPIFY_PROOF_ONLY_TOPIC}from"@/lib/commerce/shopify-webhook-registration";
import type{TraceKitSessionContext}from"@/lib/identity/persistent-types";

type Row=Record<string,unknown>;
const STEM_ORG="8f6bb14b-2126-49b8-bfdb-c60edbc3549b";
const CONNECTION="d69a93dd-98ed-46fd-b486-1a39fb8388dd";
const SHOP="izkfvg-k0.myshopify.com";
function cfg(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,""),key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error("shopify_readiness_persistence_unavailable");return{url,key};}
async function db(path:string){const{url,key}=cfg(),r=await fetch(`${url}/rest/v1/${path}`,{headers:supabaseAuthHeaders(key),cache:"no-store"});if(!r.ok)throw new Error("shopify_readiness_persistence_read_failed");const v=await r.json();return(Array.isArray(v)?v:[v])as Row[];}
const bytes=(v:unknown)=>Uint8Array.from(Buffer.from(String(v).replace(/^\\x/,""),"hex"));

export async function inspectShopifyControlledProofReadiness(session:TraceKitSessionContext,appOrigin?:string){
 const org=session.activeOrganization!;
 let normalizedOrigin="";try{const u=new URL(String(appOrigin||""));if(u.protocol==="https:"&&!u.username&&!u.password&&!u.pathname.replace(/\\/g,"/").replace(/^\\/$/,"")&&!u.search&&!u.hash)normalizedOrigin=u.origin;}catch{}
 const callbackUrl=normalizedOrigin?`${normalizedOrigin}/api/webhooks/shopify`:"";
 const out={activeOrganizationId:org.id,activeOrganizationName:org.name||null,expectedOrganizationId:STEM_ORG,connectedApprovedShopifyConnections:0,activeCredentials:0,credentialEnvelopeMatched:false,credentialDecryptSucceeded:false,shopCredentialParsed:false,shopDomainMatched:false,approvedShop:SHOP,callbackUrlConfigured:Boolean(normalizedOrigin),approvedCallback:callbackUrl,subscriptionReadSucceeded:false,tracekitSubscriptionCount:0,proofOnlyTopic:SHOPIFY_PROOF_ONLY_TOPIC,proofOnlyTopicMatches:0,proofOnlyTopicAvailable:false,createReadBackPrimitive:true,deleteAbsencePrimitive:true,recoveryMode:"same_execution_exact_created_subscription",ready:false};
 if(org.id!==STEM_ORG)return out;
 const connections=await db(`commerce_provider_connections?id=eq.${CONNECTION}&provider=eq.shopify&status=eq.connected&organization_id=eq.${encodeURIComponent(org.id)}&select=id,organization_id&limit=2`);
 out.connectedApprovedShopifyConnections=connections.length;if(connections.length!==1)return out;
 const credentials=await db(`commerce_provider_credentials?connection_id=eq.${CONNECTION}&organization_id=eq.${encodeURIComponent(org.id)}&revoked_at=is.null&select=encryption_key_id,encryption_version,secret_iv,secret_ciphertext&limit=2`);
 out.activeCredentials=credentials.length;if(credentials.length!==1)return out;
 const row=credentials[0],keyId=process.env.COMMERCE_CREDENTIALS_KEY_ID,version=Number(process.env.COMMERCE_CREDENTIALS_ENCRYPTION_VERSION||"1");
 out.credentialEnvelopeMatched=Boolean(keyId&&String(row.encryption_key_id)===keyId&&Number(row.encryption_version)===version);if(!out.credentialEnvelopeMatched)return out;
 let raw:string;try{raw=await decryptCommerceCredential({keyId:keyId!,encryptionVersion:version,iv:bytes(row.secret_iv),ciphertext:bytes(row.secret_ciphertext)},decodeCommerceCredentialKey(process.env.COMMERCE_CREDENTIALS_ENC_KEY));out.credentialDecryptSucceeded=true;}catch{return out;}
 let credential;try{credential=parseShopifyConnectionCredential(raw);out.shopCredentialParsed=true;}catch{return out;}
 out.shopDomainMatched=credential.shopDomain===SHOP;if(!out.shopDomainMatched||!out.callbackUrlConfigured)return out;
 try{const subs=await listTraceKitShopifyWebhookSubscriptions({credential,callbackUrl});out.subscriptionReadSucceeded=true;out.tracekitSubscriptionCount=subs.length;out.proofOnlyTopicMatches=subs.filter(s=>s.topic===SHOPIFY_PROOF_ONLY_TOPIC).length;out.proofOnlyTopicAvailable=out.proofOnlyTopicMatches===0;}catch{return out;}
 out.ready=out.proofOnlyTopicAvailable&&out.createReadBackPrimitive&&out.deleteAbsencePrimitive;
 return out;
}
