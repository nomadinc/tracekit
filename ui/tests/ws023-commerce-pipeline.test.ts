import assert from 'node:assert/strict';
import test from 'node:test';
import { getCustomerDetail, getCustomerJourneyDetail, listCustomerOrders } from '../../api/src/customer-explorer';
import { ProductionOrderRepository } from '../lib/orders/production-repository';
import { productionCustomerRepository } from '../lib/customers/production-repository';
import { projectCoreCustomerRead } from '../lib/identity/core-read-projection';
import { ROLE_PERMISSIONS } from '../lib/identity/permissions';
const org='8f6bb14b-2126-49b8-bfdb-c60edbc3549b',person='c1e3833d-b565-46b7-8414-6476edce9e4c',journey='bc1e677e-173c-51ad-b00c-e78b4ba77ef6',canonical='15f0b290-aaad-4962-b1d6-42f69db3966c',eventId='857d4b1f-5724-424e-8ca5-d777ec050119';
const order={workspace_id:org,organization_id:org,connection_id:'connection',provider_account_id:'account',canonical_order_id:canonical,platform:'next29',platform_order_id:'next29:103104',order_id:'103104',resolved_person_id:person,identity_resolution:'linked',gross_amount:'116.99',product_subtotal:'116.99',tax_amount:'0',shipping_amount:null,currency:'USD',order_ts:'2026-11-01T12:00:00Z',status_norm:'Paid',payment_reference:null,transaction_id:null,tkid:null,everflow_transaction_id:null};
function database(){
 const rows:Record<string,any[]>={journey_attribution_credits:[{id:'other-credit',workspace_id:org,person_id:person,journey_id:journey,conversion_event_id:'different-purchase',status:'attributed',source:'Other purchase',model:'first_touch',credit_amount:'12'}],people:[{id:person,workspace_id:org,organization_id:org,display_name:'Reference customer',status:'active'}],journeys:[{id:'unrelated-newest',workspace_id:org,person_id:person},{id:journey,workspace_id:org,person_id:person,started_at:'2026-11-01T00:00:00Z'}],tracekit_customer_order_read_model:[order,{...order,organization_id:'foreign'}],journey_events:[{id:eventId,workspace_id:org,person_id:person,journey_id:journey,event_type:'purchase',event_time:order.order_ts,source_record_id:canonical,platform_order_id:order.platform_order_id,source_platform:'next29',amount:'116.99',currency:'USD',metadata:{}}],commerce_order_lines:[{...order,id:'86446fa1-10dd-43d9-8de9-5d36162f0fb9',quantity:1,unit_amount:'116.99',evidence_id:'82b81078-0b73-4c31-90bf-c4d380e09eda',metadata:{title:'20 Treatments (5)',provider_product_id:'8',provider_variant_id:'9',sku:null}}]};
 return {from(table:string){let result=[...(rows[table]||[])];const chain:any={select(){return chain},eq(k:string,v:any){result=result.filter(r=>r[k]===v);return chain},in(k:string,v:any[]){result=result.filter(r=>v.includes(r[k]));return chain},order(){return chain},or(){return chain},limit(n:number){result=result.slice(0,n);return chain},range(a:number,b:number){result=result.slice(a,b+1);return chain},gte(){return chain},lte(){return chain},maybeSingle(){return Promise.resolve({data:result.length===1?result[0]:null,error:null})},then(done:any){return Promise.resolve({data:result,error:null}).then(done)}};return chain;}};
}
test('Core → customer-read projection → Order, Customer and Purchase adapters agree on the exact purchase',async()=>{
 const originalFetch=globalThis.fetch, originalWindow=(globalThis as any).window;
 (globalThis as any).window={};
 const db=database();const session:any={effectivePermissions:ROLE_PERMISSIONS['client-read-only'].filter(permission=>!new Set<string>(['financials.view','orders.view_financials']).has(permission))};
 globalThis.fetch=async(input:any)=>{
  const url=new URL(String(input),'https://preview.example.test');const parts=url.pathname.split('/').filter(Boolean);let body:any;
  try {
   if(parts[1]==='customer-orders') body=await listCustomerOrders(db,{workspace_id:org,offset:0,limit:100,order_id:url.searchParams.get('order_id')||undefined});
   else if(parts[3]==='journeys') body=await getCustomerJourneyDetail(db,{workspace_id:org,person_id:parts[2],journey_id:parts[4],limit:100,cursor:null});
   else body=await getCustomerDetail(db,{workspace_id:org,person_id:parts[2],journey_id:url.searchParams.get('journey_id')});
   return Response.json(projectCoreCustomerRead(body,session));
  }catch{return Response.json({error:'unavailable'},{status:404});}
 };
 const scope:any={authenticated:true,workspaceId:org,organizationId:org,businessContextId:null,session:{}};
 try{
  const repo=new ProductionOrderRepository();const list=await repo.listOrders(scope,{});assert.equal(list.length,1);assert.equal(list[0].revenue,null);
  const detail=await repo.loadWorkspace(scope,'next29:103104');assert.equal(detail?.canonicalOrderId,canonical);assert.equal(detail?.canonicalJourneyId,journey);assert.equal(detail?.order.revenue,null);assert.equal(detail?.observedTotals?.tax,null);assert.equal(detail?.observedTotals?.shipping,null);assert.equal(detail?.order.profit,null);assert.equal(detail?.attribution.trafficSource,'Not observed');assert.equal(detail?.order.trackingHealth,'Incomplete');
  assert.equal(detail?.observedLines?.[0].name,'20 Treatments (5)');assert.equal(detail?.observedLines?.[0].providerVariantId,'9');assert.equal(detail?.observedLines?.[0].sku,null);
  const customer=await productionCustomerRepository.loadWorkspace(scope,person);assert.equal(customer?.lifetimeRevenue,null);assert.equal(customer?.lifetimeRevenueAvailable,false);assert.equal(customer?.journeyId,journey);assert.equal(customer?.orders.length,1);
  const inspector=await productionCustomerRepository.loadDrawer(scope,person,`event:${eventId}`);assert.ok(inspector);assert.ok(inspector.facts.some(f=>f.label==='Canonical Order'&&f.value===canonical));assert.ok(inspector.facts.some(f=>f.label==='Product'&&f.value==='20 Treatments (5)'));assert.ok(inspector.facts.some(f=>f.label==='Payment reference'&&f.value==='Unavailable'));assert.ok(inspector.facts.some(f=>f.label==='Acquisition'&&f.value==='Unmatched'));assert.ok(inspector.links?.some(link=>link.href.includes(journey)));
  await assert.rejects(productionCustomerRepository.loadWorkspace({...scope,journeyId:'unavailable'},person));
  assert.equal(await repo.loadWorkspace(scope,'next29:foreign'),null);
  const originalAmount = order.gross_amount;
  (order as any).gross_amount = null;
  try {
    const missingOrder = await repo.loadWorkspace(scope,'next29:103104');
    const missingCustomer = await productionCustomerRepository.loadWorkspace(scope,person);
    assert.equal(missingOrder?.order.revenue,null);assert.equal(missingOrder?.order.revenueAvailable,false);
    assert.equal(missingCustomer?.lifetimeRevenue,null);assert.equal(missingCustomer?.orders[0].amount,null);
  } finally { order.gross_amount = originalAmount; }

 }finally{globalThis.fetch=originalFetch;(globalThis as any).window=originalWindow;}
});
