import type {DisputeOrderScope} from './commas-dispute-order-resolver.ts';
/** Disconnected read contract. Caller authorizes the person before fetching scoped rows. */
export type PreparedCustomerOrder=DisputeOrderScope & {
 canonicalOrderId:string;resolvedPersonId:string|null;journeyId:string|null;tkid:string|null;
};
export type PreparedCustomerDispute=DisputeOrderScope & {
 id:string;providerDisputeId:string;canonicalOrderId:string|null;reconciliationState:string;identityAuditVerified:boolean;
 status:string|null;principal:string|null;principalCurrency:string|null;principalCurrencySource:string|null;
 fee:string|null;feeCurrency:string|null;feeCurrencySource:string|null;
 evidenceId:string;observedAt:string|null;
};
const scoped=(a:DisputeOrderScope,b:DisputeOrderScope)=>a.organizationId===b.organizationId&&a.connectionId===b.connectionId&&a.providerAccountId===b.providerAccountId;
const principalSources=new Set(['provider_payload.currency','workbook.Currency']);
const feeSources=new Set(['provider_payload.fee_currency','workbook.Fee Currency']);
const currency=(code:string|null,source:string|null,sources:Set<string>)=>code&&/^[A-Z]{3}$/.test(code)&&source&&sources.has(source)?code:null;
export function preparedCustomerDisputes(scope:DisputeOrderScope,personId:string,orders:PreparedCustomerOrder[],disputes:PreparedCustomerDispute[]){
 if(!personId||!scope.organizationId||!scope.connectionId||!scope.providerAccountId)throw new Error('customer_scope_required');
 if(orders.some(o=>!scoped(scope,o))||disputes.some(d=>!scoped(scope,d)))throw new Error('customer_lookup_scope_conflict');
 const linked=new Map<string,PreparedCustomerOrder>();
 for(const order of orders){
  if(order.resolvedPersonId!==personId)continue;
  if(linked.has(order.canonicalOrderId))throw new Error('ambiguous_customer_order');
  linked.set(order.canonicalOrderId,order);
 }
 const seen=new Set<string>();
 return disputes.flatMap(d=>{
  if(d.reconciliationState!=='matched'||!d.identityAuditVerified||!d.canonicalOrderId)return [];
  const order=linked.get(d.canonicalOrderId);if(!order)return [];
  const identity=`${d.providerAccountId}:${d.providerDisputeId}`;
  if(seen.has(identity))throw new Error('duplicate_dispute_projection');seen.add(identity);
  return [{id:d.id,providerDisputeId:d.providerDisputeId,canonicalOrderId:d.canonicalOrderId,
   journeyId:order.journeyId,trackingIdentityAvailable:Boolean(order.tkid),status:d.status,
   principal:{amount:d.principal,currency:currency(d.principalCurrency,d.principalCurrencySource,principalSources)},
   fee:{amount:d.fee,currency:currency(d.feeCurrency,d.feeCurrencySource,feeSources)},
   walletLoss:null,evidenceId:d.evidenceId,observedAt:d.observedAt,matchAuthority:'exact_provider_identity' as const}];
 });
}

/** Principal exposure only. Not an order loss, fee total, refund total or wallet ledger. */
export function preparedSourceExposure(rows:Array<{disputeId:string;source:string|null;principal:string|null;currency:string|null;currencySource:string|null;exactOrderMatch:boolean}>){
 const seen=new Set<string>();
 const groups=new Map<string,{source:string|null;currency:string|null;disputes:number;principalUnits:bigint;scale:number;unknownAmountCount:number}>();
 for(const row of rows){
  if(!row.disputeId.trim())throw new Error('dispute_identity_required');
  if(!row.exactOrderMatch)throw new Error('exact_order_match_required');
  if(seen.has(row.disputeId))throw new Error('duplicate_dispute_projection');seen.add(row.disputeId);
  const code=currency(row.currency,row.currencySource,principalSources);
  const key=JSON.stringify([row.source,code]);
  const group=groups.get(key)||{source:row.source,currency:code,disputes:0,principalUnits:BigInt(0),scale:0,unknownAmountCount:0};
  group.disputes++;
  if(!code||row.principal===null||!/^\d{1,100}(?:\.\d{1,100})?$/.test(row.principal))group.unknownAmountCount++;
  else {
   const [whole,fraction='']=row.principal.split('.');
   const scale=Math.max(group.scale,fraction.length);
   group.principalUnits=group.principalUnits*BigInt(10)**BigInt(scale-group.scale)+BigInt(whole+fraction)*BigInt(10)**BigInt(scale-fraction.length);
   group.scale=scale;
  }
  groups.set(key,group);
 }
 return [...groups.values()].map(g=>{
  const digits=String(g.principalUnits).padStart(g.scale+1,'0');
  const known=g.currency?(g.scale?`${digits.slice(0,-g.scale)}.${digits.slice(-g.scale)}`:digits):null;
  return {source:g.source,currency:g.currency,disputes:g.disputes,
   principalAmount:g.unknownAmountCount?null:known,knownPrincipalAmount:known,
   unknownAmountCount:g.unknownAmountCount,financialScope:'disputed_principal' as const,walletLoss:null};
 });
}
