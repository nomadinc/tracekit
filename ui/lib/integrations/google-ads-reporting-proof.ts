import "server-only";
import { decodeCommerceCredentialKey, decryptCommerceCredential } from "@/lib/commerce/credential-crypto";
import { GOOGLE_ADS_API_VERSION, refreshGoogleAccessToken } from "./google-ads-oauth";
import { googleAdsConfiguration } from "./google-ads-connection";
import { marketingPersistenceRequest } from "./marketing-provider-repository";

type Row = Record<string, unknown>;
function bytes(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("\\x")) throw new Error("Encrypted Google Ads credential is unavailable.");
  return new Uint8Array(Buffer.from(value.slice(2), "hex"));
}
export async function runGoogleAdsReportingProof(input:{organizationId:string;connectionId:string;days?:number;fetcher?:typeof fetch}) {
  const days=Math.min(30,Math.max(1,input.days||7));
  const [accounts,credentials]=await Promise.all([
    marketingPersistenceRequest(`marketing_provider_accounts?organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}&provider=eq.google_ads&selected_for_sync=eq.true&status=eq.active`),
    marketingPersistenceRequest(`marketing_provider_credentials?organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}&credential_type=eq.oauth_refresh_token&revoked_at=is.null&limit=1`),
  ]) as Row[][];
  if(accounts.length!==1)throw new Error("Exactly one Google Ads account must be selected for this bounded proof.");
  const credential=credentials[0];if(!credential)throw new Error("Google Ads credential is unavailable.");
  const key=decodeCommerceCredentialKey(process.env.COMMERCE_CREDENTIALS_ENC_KEY);
  const refreshToken=await decryptCommerceCredential({keyId:String(credential.encryption_key_id),encryptionVersion:Number(credential.encryption_version),iv:bytes(credential.secret_iv),ciphertext:bytes(credential.secret_ciphertext)},key);
  const cfg=googleAdsConfiguration();
  let access;
  try { access=await refreshGoogleAccessToken({refreshToken,clientId:cfg.clientId,clientSecret:cfg.clientSecret,fetcher:input.fetcher}); }
  catch { throw new Error("google_ads_oauth_refresh_failed"); }
  const developerToken=String(process.env.GOOGLE_ADS_DEVELOPER_TOKEN||"").trim();
  if(!developerToken)throw new Error("google_ads_developer_token_missing");
  const customerId=String(accounts[0].provider_account_external_id);
  const googleMetadata=(accounts[0].metadata as {google?:{loginCustomerIds?:unknown}}|null)?.google;
  const loginIds=Array.isArray(googleMetadata?.loginCustomerIds)?googleMetadata.loginCustomerIds.filter((id):id is string=>typeof id==="string"&&/^\\d{10}$/.test(id)):[];
  const loginCustomerId=loginIds.find(id=>id!==customerId);
  const query=[
    "SELECT segments.date, campaign.id, campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value",
    "FROM campaign",
    `WHERE segments.date DURING LAST_${days}_DAYS`,
    "ORDER BY segments.date DESC, campaign.id",
  ].join(" ");
  const response=await (input.fetcher||fetch)(`https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:searchStream`,{method:"POST",cache:"no-store",headers:{Authorization:`Bearer ${access.accessToken}`,"developer-token":developerToken,...(loginCustomerId?{"login-customer-id":loginCustomerId}:{}),"Content-Type":"application/json"},body:JSON.stringify({query})});
  const payload=await response.json().catch(()=>null) as Array<{results?:Array<{segments?:{date?:string};campaign?:{id?:string;name?:string;status?:string};metrics?:Record<string,unknown>}>}>|null;
  if(!response.ok||!Array.isArray(payload)){
    const errorBody=payload as unknown as {error?:{status?:string;code?:number;details?:Array<{errors?:Array<{errorCode?:Record<string,string>}>}>}}|null;
    const providerStatus=String(errorBody?.error?.status||"unknown").replace(/[^A-Za-z0-9_]/g,"").slice(0,48);
    const providerCode=Number(errorBody?.error?.code)||response.status;
    const category=Object.keys(errorBody?.error?.details?.[0]?.errors?.[0]?.errorCode||{})[0]||"unknown";
    console.error("google_ads_reporting_provider_failure",{httpStatus:response.status,providerStatus,providerCode,category:category.slice(0,48)});
    throw new Error(`google_ads_reporting_http_${response.status}_${providerStatus}`);
  }
  const rows=payload.flatMap(batch=>batch.results||[]).map(row=>({date:String(row.segments?.date||""),campaignId:String(row.campaign?.id||""),campaignName:String(row.campaign?.name||""),campaignStatus:String(row.campaign?.status||""),impressions:Number(row.metrics?.impressions||0),clicks:Number(row.metrics?.clicks||0),costMicros:Number(row.metrics?.costMicros||0),conversions:Number(row.metrics?.conversions||0),conversionValue:Number(row.metrics?.conversionsValue||0)}));
  return {accountLabel:accounts[0].provider_account_label?String(accounts[0].provider_account_label):"Google Ads account",days,rowCount:rows.length,totalCostMicros:rows.reduce((n,row)=>n+row.costMicros,0),totalImpressions:rows.reduce((n,row)=>n+row.impressions,0),totalClicks:rows.reduce((n,row)=>n+row.clicks,0),rows:rows.slice(0,100)};
}
