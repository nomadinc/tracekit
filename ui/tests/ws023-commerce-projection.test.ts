import assert from 'node:assert/strict';
import test from 'node:test';
import { projectCoreCustomerRead } from '../lib/identity/core-read-projection';
import { observedOrderLines } from '../lib/orders/observed-lines';
import { parseCustomerDeepLink,customerDeepLinkHref } from '../lib/customers/deep-link';
import { ROLE_PERMISSIONS } from '../lib/identity/permissions';
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
