import { SOURCE_COLUMNS } from './manifest.ts';
import { ReportingDenied, type Claims } from './client.ts';
const forbidden = /^(raw|raw_json|payload|metadata|policy_snapshot|candidate_person_ids|attribution_window_config)$/;
const financialColumn = /^(amount|total_revenue|gross_amount|receipt_total|product_subtotal|shipping_amount|tax_amount|credit_amount|attributed_amount|commission_rate|commission_amount)$/;
export function financial(c:Readonly<Claims>){return c.role==='tk_stg_financial_reader'&&['financials.view','orders.view_financials'].every(p=>c.permissions.includes(p));}
export function guardedReportingFetch(c:Readonly<Claims>,publishableKey:string,token:string,transport:typeof fetch,revalidate:()=>Promise<void>):typeof fetch {
 return async(input,options)=>{
  const request=new Request(input,options),u=new URL(request.url),table=u.pathname.replace('/rest/v1/',''),spec=Object.hasOwn(SOURCE_COLUMNS,table)?(SOURCE_COLUMNS as any)[table]:undefined;
  if(u.origin!=='https://joahiwgidfbzwzyslrbq.supabase.co'||request.method!=='GET'||!u.pathname.startsWith('/rest/v1/')||!spec||u.pathname.includes('/rpc/')||c.organization_id!==c.workspace_id)throw new ReportingDenied();
  if(table==='profit_daily_rollups'&&!financial(c))throw new ReportingDenied();
  if(table==='affiliate_commissions'&&!financial(c))return Response.json([]);
  if(table==='tracekit_customer_order_read_model'&&!c.permissions.includes('orders.view'))return Response.json([]);
  const select=u.searchParams.get('select');if(!select)throw new ReportingDenied();
  const columns=select.split(',').filter(Boolean);
  if(columns.some(column=>!/^([a-z_]+:)?[a-z_]+$/.test(column)||!spec.columns.includes(column.split(':').at(-1))))throw new ReportingDenied();
  const chosen=columns.filter(x=>!forbidden.test(x.split(':').at(-1)!)&&(financial(c)||!financialColumn.test(x.split(':').at(-1)!)));
  if(!chosen.includes('workspace_id'))chosen.push('workspace_id');if(spec.organizationColumn&&!chosen.includes(spec.organizationColumn))chosen.push(spec.organizationColumn);
  u.searchParams.set('select',chosen.join(','));
  for(const k of ['workspace_id','organization_id']){
   const expected=k==='workspace_id'?c.workspace_id:c.organization_id;
   if(u.searchParams.has(k)&&u.searchParams.getAll(k).some(v=>v!==`eq.${expected}`))throw new ReportingDenied();
  }
  u.searchParams.set('workspace_id',`eq.${c.workspace_id}`);if(spec.organizationColumn)u.searchParams.set('organization_id',`eq.${c.organization_id}`);
  await revalidate();let response:Response;
  try{response=await transport(u,{method:'GET',cache:'no-store',redirect:'error',headers:{apikey:publishableKey,authorization:`Bearer ${token}`,accept:'application/json','accept-profile':'public',...(request.headers.get('range')?{range:request.headers.get('range')!}:{})}});}catch{throw new ReportingDenied(503)}
  if(response.headers.get('x-tracekit-db-login')!=='authenticator'||response.headers.get('x-tracekit-db-session-authorization')!=='authenticator'||response.headers.get('x-tracekit-db-role')!==c.role)throw new ReportingDenied(503);
  if(!response.ok)throw new ReportingDenied(response.status===401||response.status===403?403:503);
  const body=await response.json();if(!Array.isArray(body)||body.length>5000)throw new ReportingDenied(503);
  for(const row of body)if(row.workspace_id!==c.workspace_id||(spec.organizationColumn&&row.organization_id!==c.organization_id))throw new ReportingDenied();
  await revalidate();
  // Only selected keys survive even if an upstream view unexpectedly broadens.
  const rows=body.map(row=>Object.fromEntries(chosen.map(column=>{const key=column.split(':')[0];return [key,row[key]??null]})));
  return Response.json(rows,{headers:{'cache-control':'no-store',...(response.headers.get('content-range')?{'content-range':response.headers.get('content-range')!}:{})}});
 };
}
