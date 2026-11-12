import assert from 'node:assert/strict';
import test from 'node:test';
import { projectCoreCustomerRead } from '../lib/identity/core-read-projection';
import { observedOrderLines } from '../lib/orders/observed-lines';
import { parseCustomerDeepLink,customerDeepLinkHref } from '../lib/customers/deep-link';
import { ROLE_PERMISSIONS } from '../lib/identity/permissions';
import { formatObservedMoney } from '../lib/reporting/observed-money';
test('customer commerce summary keeps its currency through customer-read serialization',()=>{
 for(const currency of ['USD','CAD']){
  const body:any=projectCoreCustomerRead({summary:{lifetime_revenue:116.99,revenue_currency:currency,attributed_revenue:9,profit_currency:currency}},{effectivePermissions:ROLE_PERMISSIONS['client-read-only']} as any);
  assert.equal(body.summary.revenue_currency,currency);
  assert.notEqual(formatObservedMoney(body.summary.lifetime_revenue,body.summary.revenue_currency||null),'Unavailable');
  assert.equal('attributed_revenue' in body.summary,false);assert.equal('profit_currency' in body.summary,false);
 }
});
test('customer read retains canonical commercial amounts and nulls without extending financial authority',()=>{
 const session:any={effectivePermissions:ROLE_PERMISSIONS['client-read-only']};
 const body:any=projectCoreCustomerRead({orders:[{amount:116.99,product_subtotal:116.99,tax_amount:0,shipping_amount:null,net_profit:42,payment_reference:null,raw_json:{email:'secret@example.test'},order_lines:[{gross_amount:116.99,unit_amount:116.99,sku:null}]}],summary:{lifetime_revenue:116.99,attributed_revenue:4}},session);
 assert.equal(body.orders[0].amount,116.99);assert.equal(body.orders[0].tax_amount,0);assert.equal(body.orders[0].shipping_amount,null);assert.equal(body.summary.lifetime_revenue,116.99);
 assert.equal('net_profit' in body.orders[0],false);assert.equal('raw_json' in body.orders[0],false);assert.equal('attributed_revenue' in body.summary,false);assert.equal(body.orders[0].order_lines[0].unit_amount,116.99);
});
test('line adapter consumes safe Core projection and preserves unknown fields',()=>{
 const line={id:'line',canonical_order_id:'order',organization_id:'org',product_name:'20 Treatments (5)',provider_product_id:'8',provider_variant_id:'9',quantity:1,unit_amount:116.99,gross_amount:116.99,currency:'USD',sku:null,evidence_id:'evidence'};
 assert.deepEqual(observedOrderLines([line,{...line,organization_id:'foreign'}],'order','org'),[{id:'line',name:'20 Treatments (5)',sku:null,providerProductId:'8',providerVariantId:'9',quantity:1,unitAmount:116.99,grossAmount:116.99,currency:'USD',evidenceId:'evidence'}]);
});
test('exact Journey navigation survives URL serialization',()=>{
 const state=parseCustomerDeepLink('?customer_id=person&journey_id=bc1e677e-173c-51ad-b00c-e78b4ba77ef6&focus=journey');
 assert.equal(parseCustomerDeepLink(customerDeepLinkHref(state).split('?')[1]).journeyId,state.journeyId);
});
test('commerce allowance cannot leak into arbitrary nested financial objects',()=>{
 const result:any=projectCoreCustomerRead({orders:[{amount:116.99,attribution:{amount:50},net_profit:10}]},{effectivePermissions:ROLE_PERMISSIONS['client-read-only']} as any);
 assert.deepEqual(result,{orders:[{amount:116.99,attribution:{}}]});
});

test('an explicit empty or contradictory Core commerce proof cannot fall back to an overlapping provider key',async()=>{
 const { exactRelatedOrder } = await import('../lib/reporting/order-relationship');
 const order={canonical_order_id:'order',platform_order_id:'next29:103104',organization_id:'org',workspace_id:'org',connection_id:'connection',provider_account_id:'account',platform:'next29'};
 assert.equal(exactRelatedOrder({event_type:'purchase',source_record_id:'foreign-order',platform_order_id:order.platform_order_id,commerce:[]},[order]),null);
 assert.equal(exactRelatedOrder({event_type:'purchase',source_record_id:'order',platform_order_id:order.platform_order_id,canonical_order_id:'foreign-order',commerce:[order]},[order]),null);
 assert.equal(exactRelatedOrder({event_type:'purchase',source_record_id:'order',platform_order_id:order.platform_order_id,commerce:[order]},[order]),order);
});

test('Purchase inspector rejects unresolved or foreign Core proofs instead of borrowing local Order evidence',async()=>{
 const { productionCustomerRepository } = await import('../lib/customers/production-repository');
 const previousFetch=globalThis.fetch, previousWindow=(globalThis as any).window;
 const scope:any={authenticated:true,workspaceId:'org',organizationId:'org',businessContextId:null,session:{}};
 const local={organization_id:'org',workspace_id:'org',canonical_order_id:'order',platform:'next29',platform_order_id:'next29:103104',order_id:'103104',amount:116.99,currency:'USD',connection_id:'connection',provider_account_id:'account',order_lines:[{product_name:'LOCAL PRODUCT'}]};
 const foreign={...local,organization_id:'foreign',workspace_id:'foreign',canonical_order_id:'foreign-order',order_lines:[{product_name:'FOREIGN PRODUCT'}]};
 (globalThis as any).window={};
 try{
  for(const commerce of [[],[foreign]]){
   globalThis.fetch=async(input:any)=>{
    const path=new URL(String(input),'https://preview.test').pathname;
    return Response.json(path.includes('/journeys/')?{journey:{id:'journey'},events:[{id:'purchase',event_type:'purchase',journey_id:'journey',source_record_id:'foreign-order',platform_order_id:local.platform_order_id,related_order_id:local.platform_order_id,commerce}],page:{has_more:false}}:{customer:{id:'person'},canonical_journey_id:'journey',journeys:[{id:'journey'}],orders:[local],summary:{}});
   };
   const snapshot=await productionCustomerRepository.loadWorkspace(scope,'person');assert.ok(snapshot);
   assert.ok(!snapshot.journey[0].relationships.some(relationship=>relationship.type==='Order'));
   const inspector=await productionCustomerRepository.loadDrawer(scope,'person','event:purchase');assert.ok(inspector);
   assert.ok(inspector.facts.some(fact=>fact.label==='Canonical Order'&&fact.value==='Unavailable'));
   assert.ok(!JSON.stringify(inspector).includes('LOCAL PRODUCT'));assert.ok(!JSON.stringify(inspector).includes('FOREIGN PRODUCT'));
  }
 }finally{globalThis.fetch=previousFetch;(globalThis as any).window=previousWindow;}
});
