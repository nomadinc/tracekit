import assert from 'node:assert/strict';
import test from 'node:test';
import { commercialTotals, orderEvidence, scopedOrder } from './commerce-customer-evidence';
const org='8f6bb14b-2126-49b8-bfdb-c60edbc3549b';
const order={workspace_id:org,organization_id:org,canonical_order_id:'15f0b290-aaad-4962-b1d6-42f69db3966c',platform_order_id:'next29:103104',connection_id:'connection',provider_account_id:'account',resolved_person_id:'person',gross_amount:'116.99',currency:'USD'};
function database(rows:Record<string,any[]>) { const calls:any[]=[]; return {calls,from(table:string){const filters:any[]=[];const chain:any={select(){return chain},eq(k:string,v:any){filters.push([k,v]);return chain},order(){return chain},limit(){return chain},maybeSingle(){return chain.then((r:any)=>({...r,data:r.data[0]||null}))},then(done:any){calls.push({table,filters});return Promise.resolve({data:(rows[table]||[]).filter(r=>filters.every(([k,v])=>r[k]===v)),error:null}).then(done)}};return chain}};}
test('exact purchase evidence is scoped by organization, canonical Order, connection and account',async()=>{
 const line={...order,id:'86446fa1-10dd-43d9-8de9-5d36162f0fb9',quantity:1,unit_amount:'116.99',gross_amount:'116.99',evidence_id:'82b81078-0b73-4c31-90bf-c4d380e09eda',metadata:{title:'20 Treatments (5)',provider_product_id:'8',provider_variant_id:'9',sku:null,private:'never expose'}};
 const event={id:'857d4b1f-5724-424e-8ca5-d777ec050119',workspace_id:org,person_id:'person',event_type:'purchase',journey_id:'bc1e677e-173c-51ad-b00c-e78b4ba77ef6',source_record_id:order.canonical_order_id,platform_order_id:order.platform_order_id};
 const db=database({commerce_order_lines:[line,{...line,id:'foreign',organization_id:'foreign'},{...line,id:'other-account',provider_account_id:'other'}],journey_events:[event,{...event,journey_id:'wrong',source_record_id:'another'}],journeys:[{id:event.journey_id,workspace_id:org,person_id:'person'}]});
 const result=await orderEvidence(db,org,order);
 assert.equal(result.journey_id,event.journey_id);assert.equal(result.lines.length,1);
 assert.deepEqual(result.lines[0],{id:line.id,organization_id:org,canonical_order_id:order.canonical_order_id,quantity:1,unit_amount:116.99,gross_amount:116.99,currency:'USD',evidence_id:line.evidence_id,product_name:'20 Treatments (5)',sku:null,provider_product_id:'8',provider_variant_id:'9'});
 assert.equal(JSON.stringify(result).includes('private'),false);
 assert.deepEqual(await orderEvidence(db,'foreign',order),{lines:[],journey_id:null});
});
test('ambiguous or foreign-person Journey cannot be substituted',async()=>{
 const base={workspace_id:org,person_id:'person',event_type:'purchase',source_record_id:order.canonical_order_id,platform_order_id:order.platform_order_id};
 const db=database({journey_events:[{...base,journey_id:'a'},{...base,journey_id:'b'}]});
 assert.equal((await orderEvidence(db,org,order)).journey_id,null);
});
test('canonical revenue deduplicates exact identities and fails closed for missing or mixed amounts',()=>{
 assert.deepEqual(commercialTotals([order,{...order}]),{amount:116.99,currency:'USD',count:1});
 assert.equal(commercialTotals([order,{...order,canonical_order_id:'two',currency:'EUR'}]).amount,null);
 assert.equal(commercialTotals([{...order,gross_amount:null}]).amount,null);
 assert.equal(commercialTotals([{...order,gross_amount:0}]).amount,0);
 assert.equal(commercialTotals([order,{...order,gross_amount:0}]).amount,null);
 assert.equal(scopedOrder({...order,business_context_id:'other'},org,'active'),false);
 assert.equal(scopedOrder({...order,business_context_id:null},org,'active'),true);
});
