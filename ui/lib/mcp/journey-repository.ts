import type { ProductionCustomerScope } from "@/lib/customers/types";
export type JourneyIntelligence={
 customerId:string; journeyId:string|null;
 chronology:Array<{eventId:string;eventType:string;occurredAt:string;sourcePlatform:string;role:string;observed:boolean;identifiers:Array<{type:string;value:string}>;relationships:Array<{type:string;id:string}>;provenance:{sourceConnector:string|null;sourceRecordId:string|null}}>;
 attribution:{status:"attributed"|"unresolved";affiliateId:string|null;offerId:string|null;source:string|null;primaryEvidenceEventIds:string[];corroboratingEventIds:string[];supportingEventIds:string[]};
 relationships:Array<{type:"customer_journey"|"journey_order"|"shared_transaction";fromId:string;toId:string;evidenceEventIds:string[];identifierType?:string;identifierValue?:string}>;
 commerce:Array<{orderId:string;amount:number|null;status:string;createdAt:string|null}>;
 evidenceLimits:string[];
};
function base(){return String(process.env.TRACEKIT_API_BASE_URL||process.env.NEXT_PUBLIC_API_BASE_URL||process.env.NEXT_PUBLIC_API_BASE||"http://127.0.0.1:8787").replace(/\/+$/,"");}
function secret(){return String(process.env.TK_SECRET_KEY||process.env.TRACEKIT_TK_SECRET||"").trim();}
async function get(path:string){const s=secret();if(!s)throw new Error("mcp_journey_repository_unavailable");const r=await fetch(`${base()}${path}`,{cache:"no-store",headers:{accept:"application/json","x-tk-secret":s}});const t=await r.text();let b:any={};try{b=t?JSON.parse(t):{};}catch{}if(!r.ok)throw new Error("mcp_journey_repository_failed");return b;}
function qs(s:ProductionCustomerScope,x:Record<string,unknown>={}){const p=new URLSearchParams({workspace_id:s.workspaceId});for(const[k,v]of Object.entries(x))if(v!==null&&v!==undefined&&v!=="")p.set(k,String(v));return p.toString();}
export const mcpJourneyRepository={
 async explain(s:ProductionCustomerScope,customerId:string,journeyId?:string):Promise<JourneyIntelligence|null>{
  if(!s.authenticated||!customerId)return null;
  const d=await get(`/v1/customers/${encodeURIComponent(customerId)}?${qs(s)}`);
  const journeys=Array.isArray(d.journeys)?d.journeys:[];const selected=journeyId?journeys.find((x:any)=>String(x?.id||"")===journeyId):journeys[0];if(!selected?.id)return{customerId,journeyId:null,chronology:[],attribution:{status:"unresolved",affiliateId:null,offerId:null,source:null,primaryEvidenceEventIds:[],corroboratingEventIds:[],supportingEventIds:[]},relationships:[],commerce:(d.orders||[]).map((o:any)=>({orderId:String(o?.order_id||o?.platform_order_id||""),amount:Number.isFinite(Number(o?.amount))?Number(o.amount):null,status:String(o?.status||"Unknown"),createdAt:o?.created_at?String(o.created_at):null})),evidenceLimits:["No canonical Journey was returned for this customer."]};
  const j=await get(`/v1/customers/${encodeURIComponent(customerId)}/journeys/${encodeURIComponent(selected.id)}?${qs(s,{limit:100})}`);
  const events=Array.isArray(j.events)?j.events:Array.isArray(j.activity)?j.activity:[];const credits=Array.isArray(j.attribution)?j.attribution:[];const credit=credits.find((x:any)=>x?.status==="attributed")||null;
  const chronology=events.map((e:any)=>{const tech=e?.technical_evidence||e?.technical||{};const id=String(e?.id||"");const identifiers=[e?.transaction_id?{type:"Transaction ID",value:String(e.transaction_id)}:null,e?.affiliate_id?{type:"Affiliate ID",value:String(e.affiliate_id)}:null,e?.offer_id?{type:"Offer ID",value:String(e.offer_id)}:null].filter(Boolean) as Array<{type:string;value:string}>;return{eventId:id,eventType:String(e?.event_type||e?.activity_type||"event"),occurredAt:String(e?.occurred_at||e?.event_time||"Not observed"),sourcePlatform:String(e?.source_platform||tech?.source_platform||"TraceKit"),role:String(e?.category||"evidence"),observed:!e?.system_derived,identifiers,relationships:[],provenance:{sourceConnector:tech?.source_connector?String(tech.source_connector):null,sourceRecordId:tech?.source_record_id?String(tech.source_record_id):null}};});
  const primary=credit?chronology.filter((e:any)=>e.role==="marketing_touchpoint"&&e.identifiers.some((i:any)=>(i.type==="Affiliate ID"&&credit?.affiliate_id&&i.value===String(credit.affiliate_id))||(i.type==="Offer ID"&&credit?.offer_id&&i.value===String(credit.offer_id)))).map((e:any)=>e.eventId):[];
  const corroborating=credit?chronology.filter((e:any)=>!primary.includes(e.eventId)&&e.identifiers.some((i:any)=>i.type==="Affiliate ID"&&credit?.affiliate_id&&i.value===String(credit.affiliate_id))).map((e:any)=>e.eventId):[];
  const supporting=[...primary,...corroborating];
  const orders=(d.orders||[]).map((o:any)=>({orderId:String(o?.order_id||o?.platform_order_id||""),amount:Number.isFinite(Number(o?.amount))?Number(o.amount):null,status:String(o?.status||"Unknown"),createdAt:o?.created_at?String(o.created_at):null}));
  const relationships:JourneyIntelligence["relationships"]=[{type:"customer_journey",fromId:customerId,toId:String(selected.id),evidenceEventIds:chronology.map((e:any)=>e.eventId)}];
  for(const o of orders)relationships.push({type:"journey_order",fromId:String(selected.id),toId:o.orderId,evidenceEventIds:chronology.filter((e:any)=>e.role==="commerce_event").map((e:any)=>e.eventId)});
  const tx=new Map<string,string[]>();for(const e of chronology)for(const i of e.identifiers)if(i.type==="Transaction ID"){const a=tx.get(i.value)||[];a.push(e.eventId);tx.set(i.value,a);}for(const [value,ids] of Array.from(tx.entries())) if(ids.length>1) relationships.push({type:"shared_transaction",fromId:ids[0],toId:ids[ids.length-1],evidenceEventIds:ids,identifierType:"Transaction ID",identifierValue:value});
  const limits=Array.isArray(d.customer_360?.evidence_limits)?d.customer_360.evidence_limits.map(String):[];if(!credit)limits.push("No attributed credit was returned for the selected Journey.");
  return{customerId,journeyId:String(selected.id),chronology,attribution:{status:credit?"attributed":"unresolved",affiliateId:credit?.affiliate_id?String(credit.affiliate_id):null,offerId:credit?.offer_id?String(credit.offer_id):null,source:credit?.source?String(credit.source):null,primaryEvidenceEventIds:primary,corroboratingEventIds:corroborating,supportingEventIds:supporting},relationships,commerce:orders,evidenceLimits:Array.from(new Set(limits))};
 }
};
