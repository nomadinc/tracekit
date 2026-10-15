import type {DisputeOrderScope} from './commas-dispute-order-resolver.ts';
import {preparedSourceExposure} from './commas-dispute-customer-read-preparation.ts';
export const SOURCE_REPORT_DIMENSIONS=['affiliate','source','sub1','sub2','sub3','sub4','sub5'] as const;
type Dimension=typeof SOURCE_REPORT_DIMENSIONS[number];
export type SourceReportOrder=DisputeOrderScope & {id:string;orderedAt:string;attribution:Partial<Record<Dimension,{value:string;evidenceId:string;authority:'observed'|'exact'}>>};
export type SourceReportDispute=DisputeOrderScope & {id:string;orderId:string;identityAuditVerified:boolean;principal:string|null;currency:string|null;currencySource:string|null;fee:string|null;feeCurrency:string|null;feeCurrencySource:string|null};
const scoped=(a:DisputeOrderScope,b:DisputeOrderScope)=>a.organizationId===b.organizationId&&a.connectionId===b.connectionId&&a.providerAccountId===b.providerAccountId;
/** Order-cohort incidence, not dispute-event-period counts or realized wallet loss. */
export function buildPreparedSourceDisputeReport(scope:DisputeOrderScope,orders:SourceReportOrder[],disputes:SourceReportDispute[],coverage:{from:string;to:string;ordersComplete:boolean;disputesComplete:boolean;observedThrough:string}){
 const from=Date.parse(coverage.from),to=Date.parse(coverage.to),observed=Date.parse(coverage.observedThrough);
 if(!scope.organizationId||!scope.connectionId||!scope.providerAccountId||!Number.isFinite(from)||!Number.isFinite(to)||from>=to||!Number.isFinite(observed)||observed<to)throw new Error('report_scope_or_window_invalid');
 if(orders.some(o=>!scoped(scope,o))||disputes.some(d=>!scoped(scope,d)))throw new Error('report_scope_conflict');
 const cohort=new Map<string,SourceReportOrder>();const allIds=new Set<string>();
 for(const order of orders){
  if(!order.id||allIds.has(order.id))throw new Error('duplicate_or_missing_order_identity');allIds.add(order.id);
  const time=Date.parse(order.orderedAt);if(!Number.isFinite(time))throw new Error('order_time_unavailable');
  if(time>=from&&time<to)cohort.set(order.id,order);
 }
 const ids=new Set<string>();const exact:SourceReportDispute[]=[];let unresolved=0,outside=0;
 for(const dispute of disputes){
  if(!dispute.id||ids.has(dispute.id))throw new Error('duplicate_or_missing_dispute_identity');ids.add(dispute.id);
  if(!dispute.identityAuditVerified){unresolved++;continue;}
  if(!cohort.has(dispute.orderId)){if(allIds.has(dispute.orderId))outside++;else unresolved++;continue;}exact.push(dispute);
 }
 const complete=coverage.ordersComplete&&coverage.disputesComplete&&unresolved===0;
 const dimensions=SOURCE_REPORT_DIMENSIONS.map(dimension=>{
  const groups=new Map<string|null,{orderIds:Set<string>;disputes:SourceReportDispute[]}>();
  const valueFor=(order:SourceReportOrder)=>{const a=order.attribution[dimension];return a?.value&&a.evidenceId&&['observed','exact'].includes(a.authority)?a.value:null;};
  for(const order of cohort.values()){
   const value=valueFor(order),g=groups.get(value)||{orderIds:new Set<string>(),disputes:[]};g.orderIds.add(order.id);groups.set(value,g);
  }
  for(const dispute of exact)groups.get(valueFor(cohort.get(dispute.orderId)!))!.disputes.push(dispute);
  return {dimension,groups:[...groups].map(([value,g])=>{
   const affected=new Set(g.disputes.map(d=>d.orderId));
   const amounts=(fee:boolean)=>preparedSourceExposure(g.disputes.map(d=>({disputeId:d.id,source:value,principal:fee?d.fee:d.principal,currency:fee?d.feeCurrency:d.currency,
    // Reuse decimal aggregation only after independent fee provenance qualification.
    currencySource:fee?(d.feeCurrencySource==='provider_payload.fee_currency'||d.feeCurrencySource==='workbook.Fee Currency'?'provider_payload.currency':null):d.currencySource,exactOrderMatch:true}))).map(({currency,disputes,principalAmount,knownPrincipalAmount,unknownAmountCount})=>({currency,events:disputes,amount:principalAmount,knownAmount:knownPrincipalAmount,unknownAmountCount}));
   return {value,orders:g.orderIds.size,affectedOrders:affected.size,disputeEvents:g.disputes.length,
    orderDisputeRate:complete&&g.orderIds.size?affected.size/g.orderIds.size:null,
    principalByCurrency:amounts(false),feesByCurrency:amounts(true),walletLoss:null};
  })};
 });
 return {scope,cohort:{from:coverage.from,toExclusive:coverage.to,observedThrough:coverage.observedThrough},coverage:{complete,unresolvedDisputes:unresolved,outsideCohortDisputes:outside},dimensions,financialScope:'disputed_principal_and_descriptive_fees' as const,walletLoss:null};
}
