import { GOOGLE_ADS_API_VERSION } from "./google-ads-oauth";
import { normalizeGoogleCustomerId } from "./google-ads-account-discovery";
import { buildGoogleAdDailyQuery } from "./google-ads-reporting";

type SearchResponse={results?:any[];nextPageToken?:string};

export async function fetchGoogleAdDailyReport(input:{accessToken:string;customerId:string;loginCustomerId:string;since:string;until:string;fetcher?:typeof fetch;maxPages?:number}){
 const customerId=normalizeGoogleCustomerId(input.customerId); const loginCustomerId=normalizeGoogleCustomerId(input.loginCustomerId);
 const fetcher=input.fetcher||fetch; const maxPages=input.maxPages??100; const query=buildGoogleAdDailyQuery(input.since,input.until);
 const rows:any[]=[]; const requestIds:string[]=[]; let pageToken:string|undefined; let pages=0;
 do{
  if(pages>=maxPages) throw new Error("Google Ads reporting page bound exceeded.");
  const body:any={query}; if(pageToken)body.pageToken=pageToken;
  const response=await fetcher(`https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:search`,{method:"POST",cache:"no-store",headers:{Authorization:`Bearer ${input.accessToken}`,"Content-Type":"application/json","login-customer-id":loginCustomerId},body:JSON.stringify(body)});
  const requestId=response.headers.get("request-id"); if(requestId)requestIds.push(requestId);
  const payload=await response.json().catch(()=>({})) as SearchResponse;
  if(!response.ok) throw new Error("google_ads_daily_report_failed");
  for(const raw of Array.isArray(payload.results)?payload.results:[]) rows.push({...raw,tracekitGoogleContext:{requestId:requestId||null,loginCustomerId,customerId}});
  pageToken=typeof payload.nextPageToken==="string"&&payload.nextPageToken?payload.nextPageToken:undefined; pages++;
 }while(pageToken);
 return {customerId,loginCustomerId,rows,requestIds,pages,since:input.since,until:input.until};
}
