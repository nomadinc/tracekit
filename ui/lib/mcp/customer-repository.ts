import type { CustomerListFilter, CustomerSearchResult, CustomerSummary, CustomerWorkspaceSnapshot, ProductionCustomerScope } from "@/lib/customers/types";
import { productionCustomerRepository } from "@/lib/customers/production-repository";

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
    // Detail mapping remains shared with the production repository for now; M3 live proof only exercises list/search.
    // Fail closed rather than loop back through the public UI API from the server runtime.
    void scope; void customerId; void productionCustomerRepository;
    throw new Error("mcp_customer_detail_not_yet_server_adapted");
  },
};
