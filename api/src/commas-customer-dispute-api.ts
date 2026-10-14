/** Prepared integration. Default remains disabled; no request or environment toggle. */
export const PREPARED_CUSTOMER_DISPUTES_ENABLED = false;
type RpcClient={rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>};
type Scope={organizationId:string;personId:string};
const uuid=(v:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export async function readPreparedCustomerDisputes(db:RpcClient,scope:Scope,options:{enabled?:boolean;after?:string|null;limit?:number}={}){
 if(!options.enabled)return {state:'disabled' as const,rows:[],nextCursor:null};
 if(!uuid(scope.organizationId)||!uuid(scope.personId)||options.after&&!uuid(options.after))throw new Error('customer_dispute_scope_invalid');
 const limit=options.limit??50;
 if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('customer_dispute_limit_invalid');
 const {data,error}=await db.rpc('read_commas_customer_disputes_prepared',{p_org:scope.organizationId,p_person:scope.personId,p_after:options.after??null,p_limit:limit});
 if(error||!data||typeof data!=='object'||Array.isArray(data))throw new Error('customer_dispute_read_unavailable');
 const result=data as {rows?:unknown;nextCursor?:unknown};
 if(!Array.isArray(result.rows)||result.rows.length>limit)throw new Error('customer_dispute_contract_invalid');
 const rows=result.rows.map((value:unknown)=>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('customer_dispute_contract_invalid');
  const row=value as Record<string,unknown>;
  if(!uuid(String(row.id))||!uuid(String(row.canonicalOrderId))||typeof row.providerDisputeId!=='string')throw new Error('customer_dispute_contract_invalid');
  const currency=(value:unknown)=>typeof value==='string'&&/^[A-Z]{3}$/.test(value)?value:null;
  const amount=(value:unknown)=>typeof value==='string'&&/^\d+(?:\.\d+)?$/.test(value)?value:null;
  return {id:row.id,providerDisputeId:row.providerDisputeId,canonicalOrderId:row.canonicalOrderId,
   journeyId:null,trackingIdentityAvailable:row.trackingIdentityAvailable===true,
   status:typeof row.status==='string'?row.status:null,
   principal:{amount:amount(row.principalAmount),currency:currency(row.principalCurrency)},
   fee:{amount:amount(row.feeAmount),currency:currency(row.feeCurrency)},
   walletLoss:null,matchAuthority:'exact_provider_identity' as const};
 });
 if(result.nextCursor!==null&&result.nextCursor!==undefined&&!uuid(String(result.nextCursor)))throw new Error('customer_dispute_contract_invalid');
 return {state:'available' as const,rows,nextCursor:typeof result.nextCursor==='string'?result.nextCursor:null};
}
