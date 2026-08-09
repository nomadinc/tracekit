// @ts-ignore Node-only protected import boundary.
import { createHash } from "node:crypto";
// @ts-ignore Node-only protected import boundary.
import { createReadStream } from "node:fs";
import { parse } from "fast-csv";

export const EVERFLOW_REPORT_HEADERS = "conversion_status,date,click_date,delta_hours,network_offer_id,network_offer_name,network_affiliate_id,network_affiliate_name,revenue,payout,conversion_user_ip,session_user_ip,transaction_id,adv1,adv2,adv3,adv4,adv5,brand,browser,carrier,country,device_type,error_code,error_message,event_name,email,notes,platform,sub1,sub2,sub3,sub5,order_id,order_number,isp,referer,app_id,dma,network_offer_url_id,offer_url,attribution_method,adv6,adv7,adv8,adv9,adv10,sub6,sub7,sub8,sub9,sub10,account_manager_id,account_manager_name,android_id,android_id_md5,android_id_sha1,network_advertiser_id,network_advertiser_name,category_id,category_name,city,conversion_id,is_cookie_based,country_code,coupon_code,network_offer_creative_id,creative,currency_id,google_ad_id,google_ad_id_md5,google_ad_id_sha1,http_user_agent,idfa_md5,idfa_sha1,idfa,is_event_protected,is_scrub,language,network_id,network_offer_group_id,network_offer_group_name,order_line_items,origin,os_version,affiliate_manager_id,affiliate_manager_name,payout_type,is_fired_pixel,previous_network_offer_id,previous_network_offer_name,previous_transaction_id,project_id,region,network_offer_payout_revenue_id,revenue_type,sale_amount,network_campaign_id,network_campaign_name,source_id,sub4,type,is_view_through".split(",");

export type EverflowHistoricalEvent = {
  sourceRow: number; sourceIdentity: string; transactionId: string | null; conversionId: string;
  emailNormalized: string | null; conversionAt: string; clickAt: string | null; deltaHours: number | null;
  affiliateId: string | null; affiliateName: string | null; sub1: string | null; sub2: string | null; sub3: string | null; sub4: string | null; sub5: string | null;
  offerId: string | null; offerName: string | null; eventName: string | null; revenue: number | null; saleAmount: number | null;
  sessionIpHash: string | null; conversionIpHash: string | null; isp: string | null; country: string | null; region: string | null; city: string | null;
  device: string | null; browser: string | null; platform: string | null; osVersion: string | null; userAgent: string | null;
  campaignId: string | null; campaignName: string | null; creativeId: string | null; creative: string | null; sourceId: string | null;
  status: string | null; attributionMethod: string | null;
};

const nullable=(value:unknown)=>{const v=String(value??"").trim();return v||null;};
const numeric=(value:unknown)=>{const v=nullable(value);if(v===null)return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const date=(value:unknown)=>{const v=nullable(value);if(v===null)return null;const d=new Date(v);return Number.isNaN(d.valueOf())?null:d.toISOString();};
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");

export function normalizeEverflowRow(row:Record<string,string>,sourceRow:number,reportHash:string):EverflowHistoricalEvent {
  const conversionAt=date(row.date);const conversionId=nullable(row.conversion_id);
  if(!conversionAt||!conversionId)throw new Error("Everflow row is missing required conversion identity or timestamp.");
  const transactionId=nullable(row.transaction_id);const email=nullable(row.email)?.toLowerCase()??null;
  return {sourceRow,sourceIdentity:hash(JSON.stringify({reportHash,sourceRow,conversionId,transactionId,event:row.event_name,date:row.date})),transactionId,conversionId,
    emailNormalized:email,conversionAt,clickAt:date(row.click_date),deltaHours:numeric(row.delta_hours),affiliateId:nullable(row.network_affiliate_id),affiliateName:nullable(row.network_affiliate_name),
    sub1:nullable(row.sub1),sub2:nullable(row.sub2),sub3:nullable(row.sub3),sub4:nullable(row.sub4),sub5:nullable(row.sub5),offerId:nullable(row.network_offer_id),offerName:nullable(row.network_offer_name),eventName:nullable(row.event_name),revenue:numeric(row.revenue),saleAmount:numeric(row.sale_amount),
    sessionIpHash:nullable(row.session_user_ip)?hash(row.session_user_ip):null,conversionIpHash:nullable(row.conversion_user_ip)?hash(row.conversion_user_ip):null,isp:nullable(row.isp),country:nullable(row.country),region:nullable(row.region),city:nullable(row.city),device:nullable(row.device_type),browser:nullable(row.browser),platform:nullable(row.platform),osVersion:nullable(row.os_version),userAgent:nullable(row.http_user_agent),
    campaignId:nullable(row.network_campaign_id),campaignName:nullable(row.network_campaign_name),creativeId:nullable(row.network_offer_creative_id),creative:nullable(row.creative),sourceId:nullable(row.source_id),status:nullable(row.conversion_status),attributionMethod:nullable(row.attribution_method)};
}

export async function parseEverflowHistoricalReport(input:{filePath:string;reportHash:string;onEvent:(event:EverflowHistoricalEvent)=>void|Promise<void>;maxRows?:number}) {
  let headers:string[]=[];let rows=0;let rejected=0;const rejectionCodes=new Map<string,number>();
  await new Promise<void>((resolve,reject)=>{
    const stream=parse({headers:(observed)=>{headers=observed.map((value)=>String(value??""));if(headers.length!==EVERFLOW_REPORT_HEADERS.length||headers.some((v,i)=>v!==EVERFLOW_REPORT_HEADERS[i]))throw new Error("Everflow report headers do not match the approved schema.");return headers;},strictColumnHandling:true,ignoreEmpty:true,trim:false});
    stream.on("data",async(row:Record<string,string>)=>{stream.pause();try{if(input.maxRows&&rows+rejected>=input.maxRows)throw new Error("Everflow report exceeded configured row bound.");const event=normalizeEverflowRow(row,rows+rejected+2,input.reportHash);await input.onEvent(event);rows++;}catch(error){const code=error instanceof Error?error.message:"invalid_row";rejectionCodes.set(code,(rejectionCodes.get(code)||0)+1);rejected++;}finally{stream.resume();}});
    stream.on("data-invalid",()=>{rejected++;rejectionCodes.set("column_count_mismatch",(rejectionCodes.get("column_count_mismatch")||0)+1);});stream.on("error",reject);stream.on("end",()=>resolve());createReadStream(input.filePath).pipe(stream);
  });
  return {headers,rows,rejected,rejectionCodes:Object.fromEntries(rejectionCodes)};
}
