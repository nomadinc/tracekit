import type { OrderRepository } from "./repository";
import type {
  OrderDeepLinkState, OrderDrawerRecord, OrderListFilter, OrderSearchResult,
  OrderSummary, OrderTimelineEvent, OrderWorkspaceSnapshot,
} from "./types";
import { normalizeOrderDeepLink, orderDeepLinkHref } from "./deep-link";
import { withDevelopmentIdentity } from "@/lib/identity/development-state";

type ProductionScope = {
  authenticated: boolean;
  workspaceId: string;
  organizationId: string | null;
  businessContextId: string | null;
  session: any;
};

async function readJson(res: Response) {
  const text = await res.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text.slice(0, 300) }; }
  if (!res.ok) throw new Error(body?.message || body?.error || `Order request failed (${res.status})`);
  return body;
}
async function get(path: string) {
  return readJson(await fetch(path, { method: "GET", cache: "no-store", headers: { accept: "application/json" } }));
}
const qs = (scope: ProductionScope, extra: Record<string, unknown> = {}) => {
  const p = new URLSearchParams({ workspace_id: scope.workspaceId });
  for (const [k,v] of Object.entries(extra)) if (v !== null && v !== undefined && v !== "") p.set(k, String(v));
  return p.toString();
};
const num = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;
const when = (v: unknown) => {
  const s = String(v || "").trim(); if (!s) return "Not observed";
  const d = new Date(s); return Number.isFinite(d.getTime()) ? d.toLocaleString() : s;
};
function status(v: unknown): OrderSummary["status"] {
  const s = String(v || "").toLowerCase();
  if (/chargeback|dispute/.test(s)) return "Chargeback";
  if (/refund|return|void|cancel/.test(s)) return "Refunded";
  if (/pending|open/.test(s)) return "Pending";
  return "Paid";
}
function orderId(row: any) { return String(row?.platform_order_id || row?.order_id || row?.id || ""); }
function summary(row: any, customer: any, scope: ProductionScope): OrderSummary {
  const id = orderId(row);
  return {
    id,
    organizationId: scope.organizationId || "",
    offerId: String(row?.everflow_offer_id || row?.offer_id || ""),
    customerId: String(customer?.id || ""),
    number: String(row?.order_id || row?.platform_order_id || id),
    customerName: String(customer?.display_name || customer?.primary_email || customer?.id || "Customer"),
    customerEmail: String(customer?.primary_email || ""),
    customerPhone: String(customer?.primary_phone || ""),
    sensitiveMasked: false,
    scenario: "Production order",
    date: when(row?.created_at || row?.order_ts),
    status: status(row?.status),
    profitStatus: "Estimated",
    profit: null,
    revenue: num(row?.amount ?? row?.gross_amount),
    trackingHealth: "Unknown",
    shippingLoss: false, highFee: false, highAffiliate: false,
  };
}
async function customerDetail(scope: ProductionScope, customerId: string) {
  return get(`/api/customers/${encodeURIComponent(customerId)}?${qs(scope)}`);
}
function event(row: any, order: OrderSummary): OrderTimelineEvent {
  const tech = row?.technical_evidence || row?.technical || {};
  const id = String(row?.id || crypto.randomUUID());
  const label = String(row?.title || row?.event_type || row?.activity_type || "Evidence").replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());
  const identifiers = [
    row?.transaction_id ? { id: `${id}:transaction`, type: "Transaction ID", value: String(row.transaction_id), eventId: id } : null,
    row?.affiliate_id ? { id: `${id}:affiliate`, type: "Affiliate ID", value: String(row.affiliate_id), eventId: id } : null,
    row?.offer_id ? { id: `${id}:offer`, type: "Offer ID", value: String(row.offer_id), eventId: id } : null,
  ].filter(Boolean) as any[];
  return {
    id, label, timestamp: when(row?.event_time || row?.occurred_at),
    status: /refund|chargeback/i.test(label) ? "Negative" : "Observed",
    confidence: row?.system_derived ? "Derived from retained evidence" : "Observed evidence",
    originalUrl: String(row?.url || row?.display_fields?.url || ""), referrer: "", destinationUrl: "",
    queryParameters: {}, identifiers, redirects: [], diagnostics: [],
    evidence: Object.entries(tech).filter(([,v])=>v !== null && v !== undefined && typeof v !== "object").slice(0,8).map(([k,v])=>`${k}: ${String(v)}`),
    relationships: [{ type: "Order", id: order.id, label: order.number }],
  };
}

export class ProductionOrderRepository {
  async listOrders(scope: ProductionScope, filter: OrderListFilter = {}): Promise<OrderSummary[]> {
    if (!scope.authenticated || !scope.workspaceId) return [];
    if (filter.customerId) {
      const d = await customerDetail(scope, filter.customerId);
      let rows = (Array.isArray(d.orders) ? d.orders : []).map((r:any)=>summary(r,d.customer,scope));
      // A Customer → Order deep link may carry Journey-attributed Offer context even
      // when the commerce Order did not supply an offer_id. Do not filter that
      // canonical Order out by an attribution-only Offer.
      if (filter.offerId) rows = rows.filter((r:OrderSummary)=>!r.offerId || r.offerId === filter.offerId);
      if (filter.query) { const q=filter.query.toLowerCase(); rows=rows.filter((r:OrderSummary)=>`${r.number} ${r.customerName} ${r.customerEmail}`.toLowerCase().includes(q)); }
      return rows;
    }
    const list = await get(`/api/customers?${qs(scope,{limit:25})}`);
    const details = await Promise.all((list.customers || []).slice(0,25).map((r:any)=>customerDetail(scope,String(r?.customer?.id||"")).catch(()=>null)));
    let rows = details.filter(Boolean).flatMap((d:any)=>(d.orders||[]).map((r:any)=>summary(r,d.customer,scope)));
    if (filter.offerId) rows = rows.filter((r:OrderSummary)=>r.offerId === filter.offerId);
    return rows;
  }
  async resolveOrder(scope: ProductionScope, id: string) {
    const rows = await this.listOrders(scope,{});
    const r = rows.find(x=>x.id===id || x.number===id);
    return r ? { organizationId:r.organizationId, businessContextId:r.offerId || scope.businessContextId || "", orderId:r.id } : null;
  }
  async loadWorkspace(scope: ProductionScope, id: string): Promise<OrderWorkspaceSnapshot|null> {
    const list = await get(`/api/customers?${qs(scope,{limit:50})}`);
    let detail:any=null, raw:any=null;
    for (const item of (list.customers||[])) {
      const cid=String(item?.customer?.id||""); if(!cid) continue;
      const d=await customerDetail(scope,cid).catch(()=>null); if(!d) continue;
      const found=(d.orders||[]).find((r:any)=>orderId(r)===id || String(r?.order_id||"")===id);
      if(found){detail=d;raw=found;break;}
    }
    if(!detail||!raw) return null;
    const o=summary(raw,detail.customer,scope);
    const journeys=Array.isArray(detail.journeys)?detail.journeys:[];
    let jd:any=null;
    if(journeys[0]?.id) jd=await get(`/api/customers/${encodeURIComponent(o.customerId)}/journeys/${encodeURIComponent(journeys[0].id)}?${qs(scope,{limit:100})}`).catch(()=>null);
    const rows=Array.isArray(jd?.events)?jd.events:Array.isArray(jd?.activity)?jd.activity:[];
    const timeline: OrderTimelineEvent[] = rows.map((r:any)=>event(r,o));
    const credits=Array.isArray(jd?.attribution)?jd.attribution:[];
    const credit=credits.find((c:any)=>c?.status==="attributed")||{};
    const affiliate=credit?.affiliate_id ? `Affiliate ${credit.affiliate_id}` : "Not observed";
    const offer=credit?.offer_id ? `Offer ${credit.offer_id}` : "Not observed";
    return {
      order:o,
      commercial:{mainProduct:"Not available from current Order read model",orderBumps:[],upsells:[],shippingCharged:0,taxCollected:0,discounts:0,quantity:0},
      ledger:[],
      shipping:{charged:0,actual:0,packaging:0,margin:0},
      processorFee:{processor:"Not available",pricingRule:"Not available",percentageRate:0,fixedFee:0,currency:"USD",captures:[],expectedFee:0,observedFee:0,variance:0,settlementStatus:"Not available"},
      attribution:{trafficSource:affiliate,affiliate,campaign:"Not observed",creative:"Not observed",offerUrl:offer,landingPage:"Not observed",clickPurchaseDelta:"Not calculated"},
      timeline, identifiers:timeline.flatMap(x=>x.identifiers),
      relatedCustomer:{id:o.customerId,name:o.customerName},
      relatedOffer:{id:String(credit?.offer_id||""),name:offer},
      trackingExplanation: timeline.length ? "Retained production Journey evidence is available." : "No canonical Journey evidence was returned for this Order.",
      waitingOn:["Authoritative Order profit read model"], intelligence:[],
    };
  }
  async loadTimeline(scope: ProductionScope,id:string){return (await this.loadWorkspace(scope,id))?.timeline||[];}
  async loadDrawer(scope: ProductionScope,id:string,drawerId:string):Promise<OrderDrawerRecord|null>{
    const w=await this.loadWorkspace(scope,id); if(!w)return null;
    const [kind,key]=drawerId.split(":",2);
    if(kind==="event"||kind==="timeline-event"){
      const e=w.timeline.find(x=>x.id===key); if(!e)return null;
      return {id:drawerId,mode:"journey",title:e.label,question:"What happened, and what retained production evidence supports it?",summary:`${e.status} · ${e.confidence}`,status:e.status,facts:[{label:"Timestamp",value:e.timestamp},{label:"Evidence state",value:e.status}],originalUrl:e.originalUrl,identifiers:e.identifiers,diagnostics:e.diagnostics,evidence:e.evidence.length?e.evidence:["Retained Journey event"],relationships:e.relationships};
    }
    return null;
  }
  async search(scope: ProductionScope,query:string):Promise<OrderSearchResult[]>{
    const rows=await this.listOrders(scope,{query}); return rows.slice(0,12).map(r=>({id:`order:${r.id}`,type:"Order",title:r.number,subtitle:r.customerName,value:r.id,href:withDevelopmentIdentity(orderDeepLinkHref({orderId:r.id,customerId:r.customerId}),scope.session.identity.id)}));
  }
  async resolveDeepLink(scope: ProductionScope,state:OrderDeepLinkState){
    const list=await this.listOrders(scope,{offerId:state.offerId,customerId:state.customerId});
    const snap=state.orderId?await this.loadWorkspace(scope,state.orderId):null;
    return normalizeOrderDeepLink(state,list,snap);
  }
}
export const productionOrderRepository = new ProductionOrderRepository();
