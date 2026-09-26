import "server-only";
import { decodeCommerceCredentialKey,decryptCommerceCredential } from "@/lib/commerce/credential-crypto";
import { marketingPersistenceRequest } from "./marketing-provider-repository";
function bytes(v:unknown){return Uint8Array.from(Buffer.from(String(v||"").replace(/^\\x/,""),"hex"));}
export async function resolveGoogleAdsRefreshToken(input:{organizationId:string;connectionId:string}){
 const rows=await marketingPersistenceRequest(`marketing_provider_credentials?organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}&credential_type=eq.oauth_refresh_token&revoked_at=is.null&order=created_at.desc&limit=1`);
 const row=rows[0];if(!row)throw new Error("google_ads_reauthorization_required");
 const key=decodeCommerceCredentialKey(process.env.MARKETING_CREDENTIALS_ENC_KEY);
 return decryptCommerceCredential({keyId:String(row.encryption_key_id),encryptionVersion:Number(row.encryption_version),iv:bytes(row.secret_iv),ciphertext:bytes(row.secret_ciphertext)},key);
}
