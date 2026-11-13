import assert from 'node:assert/strict';
import test from 'node:test';
import { projectCoreCustomerRead } from '../lib/identity/core-read-projection';
import { observedOrderLines } from '../lib/orders/observed-lines';
import { parseCustomerDeepLink,customerDeepLinkHref } from '../lib/customers/deep-link';
import { ROLE_PERMISSIONS } from '../lib/identity/permissions';
test('monetary commerce fields require both financial permissions, including nested lines and summaries',()=>{
 const source={orders:[{order_id:'order',status:'Paid',amount:116.99,gross_amount:116.99,product_subtotal:116.99,tax_amount:0,shipping_amount:null,net_profit:42,raw_json:{secret:'private'},order_lines:[{product_name:'Product',quantity:1,gross_amount:116.99,unit_amount:116.99,sku:null}]}],summary:{lifetime_revenue:116.99,revenue_currency:'USD',attributed_revenue:4}};
 const nhPermissions=ROLE_PERMISSIONS['client-read-only'].filter(permission=>!new Set<string>(['financials.view','orders.view_financials']).has(permission));
 for(const permissions of [nhPermissions,[],['orders.view'],['financials.view'],['orders.view_financials']]){
  const body:any=projectCoreCustomerRead(source,{effectivePermissions:permissions} as any);
  assert.deepEqual(body,{orders:[{order_id:'order',status:'Paid',order_lines:[{product_name:'Product',quantity:1,sku:null}]}],summary:{}});
 }
 const authorized:any=projectCoreCustomerRead(source,{effectivePermissions:['financials.view','orders.view_financials']} as any);
 assert.equal(authorized.orders[0].gross_amount,116.99);assert.equal(authorized.orders[0].tax_amount,0);assert.equal(authorized.orders[0].shipping_amount,null);
 assert.equal(authorized.orders[0].order_lines[0].unit_amount,116.99);assert.equal(authorized.summary.lifetime_revenue,116.99);
 assert.equal('raw_json' in authorized.orders[0],false);
});
test('line adapter consumes safe Core projection and preserves unknown fields',()=>{
 const line={id:'line',canonical_order_id:'order',organization_id:'org',product_name:'20 Treatments (5)',provider_product_id:'8',provider_variant_id:'9',quantity:1,unit_amount:116.99,gross_amount:116.99,currency:'USD',sku:null,evidence_id:'evidence'};
 assert.deepEqual(observedOrderLines([line,{...line,organization_id:'foreign'}],'order','org'),[{id:'line',name:'20 Treatments (5)',sku:null,providerProductId:'8',providerVariantId:'9',quantity:1,unitAmount:116.99,grossAmount:116.99,currency:'USD',evidenceId:'evidence'}]);
});
test('exact Journey navigation survives URL serialization',()=>{
 const state=parseCustomerDeepLink('?customer_id=person&journey_id=bc1e677e-173c-51ad-b00c-e78b4ba77ef6&focus=journey');
 assert.equal(parseCustomerDeepLink(customerDeepLinkHref(state).split('?')[1]).journeyId,state.journeyId);
});
test('financial denial applies to arbitrary nested commerce objects',()=>{
 const result:any=projectCoreCustomerRead({orders:[{amount:116.99,attribution:{amount:50},net_profit:10}]},{effectivePermissions:ROLE_PERMISSIONS['client-read-only']} as any);
 assert.deepEqual(result,{orders:[{attribution:{}}]});
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
