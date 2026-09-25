import type { CustomerListFilter, CustomerSearchResult, CustomerSummary, CustomerWorkspaceSnapshot, ProductionCustomerScope } from "@/lib/customers/types";


function apiBaseUrl() {
  return String(process.env.TRACEKIT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8787").replace(/\/+$/, "");
}
function adminSecret() {
  return String(process.env.TK_SECRET_KEY || process.env.TRACEKIT_TK_SECRET || "").trim();
}
async function coreGet(path:string) {
  const secret=adminSecret();
  if(!secret) throw new Error("mcp_customer_repository_unavailable");
  const res=await fetch(`${apiBaseUrl()}${path}`,{method:"GET",cache:"no-store",headers:{accept:"application/json","x-tk-secret":secret}});
  const text=await res.text();
  let body:any={};
  try{body=text?JSON.parse(text):{};}catch{body={};}
  if(!res.ok) throw new Error("mcp_customer_repository_failed");
  return body;
}
function qs(scope:ProductionCustomerScope,extra:Record<string,unknown>={}) {
  const p=new URLSearchParams({workspace_id:scope.workspaceId});
  for(const [k,v] of Object.entries(extra)) if(v!==null&&v!==undefined&&v!=="") p.set(k,String(v));
  return p.toString();
}
function summary(row:any,scope:ProductionCustomerScope):CustomerSummary {
  const c=row?.customer||{};
  const source=row?.attributed_source?.affiliate_id?`Affiliate ${row.attributed_source.affiliate_id}`:row?.attributed_source?.source||row?.source_systems?.[0]||"No retained acquisition source";
  const raw=String(row?.last_activity_at||"").trim(); const d=raw?new Date(raw):null;
  return {id:String(c.id||""),organizationId:scope.organizationId||"",offerIds:[],name:String(c.display_name||c.primary_email||c.primary_phone||c.id||"Unresolved customer"),email:String(c.primary_email||""),phone:String(c.primary_phone||""),sensitiveMasked:false,profit:0,profitStatus:"Estimated",profitAvailable:false,lastActivity:d&&Number.isFinite(d.getTime())?d.toLocaleString():(raw||"Not observed"),status:String(row?.identity_status||c.status||"Unknown"),trackingHealth:row?.has_attribution?"Healthy":"Incomplete",repeat:Number(row?.order_count||0)>1,refunded:false,interferenceLikely:false,journeyPreview:`${Number(row?.journey_count||0)} journey(s) · ${Number(row?.order_count||0)} order(s) · ${source}`};
}
export const mcpCustomerRepository = {
  async listCustomers(scope:ProductionCustomerScope,filter:CustomerListFilter={}):Promise<CustomerSummary[]> {
    if(!scope.authenticated) return [];
    const body=await coreGet(`/v1/customers?${qs(scope,{search:filter.query,limit:50})}`);
    let rows=(body.customers||[]).map((row:any)=>summary(row,scope));
    if(filter.state==="repeat") rows=rows.filter((row:CustomerSummary)=>row.repeat);
    return rows;
  },
  async search(scope:ProductionCustomerScope,query:string):Promise<CustomerSearchResult[]> {
    const rows=await this.listCustomers(scope,{query});
    return rows.map((row:CustomerSummary)=>({id:row.id,type:"customer",title:row.name,subtitle:row.journeyPreview,value:row.id,href:`/customers?v=1&customer_id=${encodeURIComponent(row.id)}`}));
  },
  async loadWorkspace(scope:ProductionCustomerScope,customerId:string):Promise<CustomerWorkspaceSnapshot|null> {
    if(!scope.authenticated||!customerId) return null;
    const detail=await coreGet(`/v1/customers/${encodeURIComponent(customerId)}?${qs(scope)}`);
    const journeys=Array.isArray(detail.journeys)?detail.journeys:[];
    const selected=journeys[0]||null;
    let journey:any=null;
    if(selected?.id) journey=await coreGet(`/v1/customers/${encodeURIComponent(customerId)}/journeys/${encodeURIComponent(selected.id)}?${qs(scope,{limit:100})}`);
    const listLike={customer:detail.customer,last_activity_at:detail.summary?.last_seen_at,journey_count:detail.summary?.total_journeys,order_count:detail.summary?.total_orders,has_attribution:Array.isArray(detail.attribution)&&detail.attribution.some((x:any)=>x?.status==="attributed"),identity_status:detail.summary?.identity_status,source_systems:detail.summary?.source_systems||[]};
    const customer=summary(listLike,scope);
    const rawOrders=Array.isArray(detail.orders)?detail.orders:[];
    const orders=rawOrders.map((row:any)=>({id:String(row?.order_id||row?.platform_order_id||""),number:String(row?.order_id||row?.platform_order_id||"Order"),date:String(row?.created_at||"Not observed"),amount:Number(row?.amount||0),profit:null,profitStatus:"Estimated" as const,profitAvailable:false,status:String(row?.status||"Unknown"),refunded:/refund|return|void|chargeback/i.test(String(row?.status||"")),offerId:String(row?.offer_id||""),offerName:row?.offer_id?`Offer ${row.offer_id}`:"Offer evidence unavailable",trackingHealth:"Unknown" as const}));
    const events=Array.isArray(journey?.events)?journey.events:Array.isArray(journey?.activity)?journey.activity:[];
    return {customer,lifetimeRevenue:Number(detail.summary?.lifetime_revenue||0),customerSince:String(detail.summary?.first_seen_at||"Not observed"),firstTouch:String(detail.customer_360?.acquisition?.first_attributed_source?.source||"No retained attribution conclusion"),lastPurchase:orders[0]?.date||"No linked purchase",journeyId:String(selected?.id||"No canonical journey"),journey:events.map((row:any)=>({id:String(row?.id||""),name:String(row?.title||row?.event_type||"Event"),timestamp:String(row?.occurred_at||row?.event_time||"Not observed"),domain:String(row?.source_platform||"TraceKit"),role:String(row?.category||row?.event_type||"evidence"),status:row?.system_derived?"Derived":"Observed",confidence:"Retained evidence",trackingHealth:"Unknown" as const,trackingStatus:row?.system_derived?"Derived":"Observed",originalUrl:String(row?.display_fields?.url||row?.url||""),referrer:"",destinationUrl:"",queryParameters:{},identifiers:[],redirects:[],diagnostics:[],relationships:[],explanation:{conclusion:String(row?.summary||row?.title||"Evidence recorded."),reason:"Retained production evidence.",evidence:[]}})),orders,offers:[],privacySignals:[],trackingExplanation:events.length?"Production Journey evidence is available.":"No canonical Journey events are available for this customer."};
  },
};
