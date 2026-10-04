import "server-only";
import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";
import { buildGoogleAuthorizationUrl, createGoogleOAuthState, exchangeGoogleAuthorizationCode, GOOGLE_ADS_OAUTH_SCOPE, verifyGoogleOAuthState } from "./google-ads-oauth";
import { GoogleAdsApiError, listGoogleAccessibleCustomers } from "./google-ads-client";
import { fetchGoogleCustomerClientHierarchy } from "./google-ads-customer-client";
import { fetchGoogleCustomerProfile, GoogleAdsProfileError } from "./google-ads-profile-client";
import { discoverGoogleCustomerHierarchy } from "./google-ads-hierarchy-client";
import { persistGoogleConnectionAuthorization, persistGoogleDiscoveredAccounts } from "./google-ads-persistence";

export class GoogleAdsConnectionError extends Error {
  constructor(readonly code: string, message: string, readonly httpStatus = 400) { super(message); }
}
function required(name:string){const v=String(process.env[name]||"").trim();if(!v)throw new GoogleAdsConnectionError("google_ads_configuration_unavailable","Google Ads connection configuration is unavailable.",503);return v;}
export function googleAdsConfiguration(){
 const clientId=required("GOOGLE_ADS_CLIENT_ID"),clientSecret=required("GOOGLE_ADS_CLIENT_SECRET"),redirectUri=required("GOOGLE_ADS_OAUTH_REDIRECT_URI"),stateSecret=required("GOOGLE_ADS_OAUTH_STATE_SECRET");
 let redirect:URL;try{redirect=new URL(redirectUri);}catch{throw new GoogleAdsConnectionError("google_ads_configuration_unavailable","Google Ads connection configuration is unavailable.",503);}
 if(redirect.protocol!=="https:"&&redirect.hostname!=="localhost"&&redirect.hostname!=="127.0.0.1")throw new GoogleAdsConnectionError("google_ads_configuration_unavailable","Google Ads connection configuration is unavailable.",503);
 if(stateSecret.length<32)throw new GoogleAdsConnectionError("google_ads_configuration_unavailable","Google Ads connection configuration is unavailable.",503);
 return {clientId,clientSecret,redirectUri:redirect.toString(),stateSecret};
}
function manager(session:TraceKitSessionContext){if(!session.activeOrganization||!session.effectivePermissions.includes("connectors.manage"))throw new GoogleAdsConnectionError("resource_unavailable","The requested resource is unavailable.",404);return session.activeOrganization;}
export function startGoogleAdsOAuth(session:TraceKitSessionContext){
 const org=manager(session),cfg=googleAdsConfiguration(),setupRequestId=crypto.randomUUID();
 const state=createGoogleOAuthState({organizationId:org.id,accountId:session.activeAccount.id,setupRequestId,returnPath:"/connections",issuedAtMs:Date.now()},cfg.stateSecret);
 return {state,url:buildGoogleAuthorizationUrl({clientId:cfg.clientId,redirectUri:cfg.redirectUri,state})};
}
export async function completeGoogleAdsOAuth(input:{session:TraceKitSessionContext;state:string;code:string}){
 const org=manager(input.session),cfg=googleAdsConfiguration();
 let state;
 try { state=verifyGoogleOAuthState(input.state,cfg.stateSecret); } catch { throw new GoogleAdsConnectionError("google_ads_oauth_state_invalid","Google Ads authorization could not be verified.",403); }
 if(state.organizationId!==org.id||state.accountId!==input.session.activeAccount.id||state.returnPath!=="/connections")throw new GoogleAdsConnectionError("google_ads_oauth_state_invalid","Google Ads authorization could not be verified.",403);
 let token;
 try { token=await exchangeGoogleAuthorizationCode({code:input.code,clientId:cfg.clientId,clientSecret:cfg.clientSecret,redirectUri:cfg.redirectUri}); } catch { throw new GoogleAdsConnectionError("google_ads_token_exchange_failed","Google Ads authorization token exchange could not be completed.",502); }
 if(!token.scope.split(/\s+/).includes(GOOGLE_ADS_OAUTH_SCOPE))throw new GoogleAdsConnectionError("google_ads_required_permission_missing","Google did not grant Google Ads access.",403);
 let accessible: string[];
 try {
  accessible = await listGoogleAccessibleCustomers({accessToken:token.accessToken});
 } catch (error) {
  if (error instanceof GoogleAdsApiError) {
   throw new GoogleAdsConnectionError(`google_ads_api_${error.operation}_${error.httpStatus}_${error.apiStatus}`, "Google Ads account discovery could not be completed.", 502);
  }
  throw error;
 }
 let discovery;
 try {
  let profiles;
  try {
   profiles = await Promise.all(accessible.map((customerId) => fetchGoogleCustomerProfile({ accessToken: token.accessToken, customerId })));
  } catch (error) {
   if (error instanceof GoogleAdsProfileError) {
    throw new GoogleAdsConnectionError(`google_ads_profile_query_${error.httpStatus}_${error.apiStatus}`, "Google Ads customer profile discovery could not be completed.", 502);
   }
   throw error;
  }
  const directAdvertisers = profiles.filter((profile) => !profile.manager);
  const managerIds = profiles.filter((profile) => profile.manager).map((profile) => profile.customerId);
  const managerDiscovery = managerIds.length
    ? await discoverGoogleCustomerHierarchy({accessibleCustomerIds:managerIds,fetchHierarchy:async({targetCustomerId,loginCustomerId})=>(await fetchGoogleCustomerClientHierarchy({accessToken:token.accessToken,targetCustomerId,loginCustomerId})).rows})
    : { accounts: [] };
  const directAccounts = directAdvertisers.map((profile) => ({
    customerId: profile.customerId,
    parentCustomerId: null,
    accountType: "advertiser" as const,
    hierarchyDepth: 0,
    isManager: false,
    eligibleForSpendSync: true,
    descriptiveName: profile.descriptiveName,
    currencyCode: profile.currencyCode,
    timeZone: profile.timeZone,
    loginCustomerIds: [profile.customerId],
  }));
  const byId = new Map([...managerDiscovery.accounts, ...directAccounts].map((account) => [account.customerId, account]));
  discovery = { accounts: Array.from(byId.values()) };
 } catch (error) {
  if (error instanceof GoogleAdsConnectionError) throw error;
  throw new GoogleAdsConnectionError("google_ads_hierarchy_discovery_failed", "Google Ads account hierarchy discovery could not be completed.", 502);
 }
 const identity=accessible.slice().sort().join(",")||"no-accessible-customers";
 let connection;
 try {
  connection = await persistGoogleConnectionAuthorization({accountId:input.session.activeAccount.id,organizationId:org.id,providerIdentityId:identity,displayName:"Google Ads",refreshToken:token.refreshToken,grantedScopes:token.scope.split(/\s+/).filter(Boolean)});
 } catch {
  throw new GoogleAdsConnectionError("google_ads_connection_persistence_failed", "Google Ads connection could not be persisted.", 503);
 }
 let accounts;
 try {
  accounts = await persistGoogleDiscoveredAccounts({accountId:input.session.activeAccount.id,organizationId:org.id,connectionId:connection.id,accounts:discovery.accounts});
 } catch {
  throw new GoogleAdsConnectionError("google_ads_account_persistence_failed", "Google Ads account discovery could not be persisted.", 503);
 }
 return {connectionId:connection.id,discoveredAccountCount:accounts.length};
}
