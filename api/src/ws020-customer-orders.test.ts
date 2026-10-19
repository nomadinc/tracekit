import assert from "node:assert/strict";
import test from "node:test";
import { listCustomerOrders, matchCustomerExplorerRoute, compactOrder, resolveOrderReadAuthority } from "./customer-explorer.ts";
function store(rows: any[], failure=false) {
 const filters: Array<[string, unknown]> = [];
 const chain: any = { select(value:string){ assert.ok(!/raw_json|customer_email|customer_phone/.test(value));return chain; }, eq(key:string,value:unknown){filters.push([key,value]);return chain;},order(){return chain;},range(start:number,end:number){return Promise.resolve({data:rows.filter(row=>filters.every(([key,value])=>row[key]===value)).slice(start,end+1),error:failure?{message:"private"}:null});} };
 return {from(name:string){assert.equal(name,"tracekit_customer_order_read_model");return chain;},filters};
}
test("canonical order read includes unresolved evidence and enforces both tenant columns",async()=>{
 const base={workspace_id:"tenant",organization_id:"tenant",person_id:null,platform_order_id:"next29:1",evidence_id:"retained"};
 const db=store([base,{...base,organization_id:"foreign"},{...base,workspace_id:"foreign"}]);
 const result=await listCustomerOrders(db,{workspace_id:"tenant",offset:0,limit:50});
 assert.equal(result.orders.length,1);assert.equal(result.orders[0].customer,null);assert.equal(result.orders[0].identity_state,"unresolved");assert.equal(result.orders[0].order.evidence_id,"retained");
 assert.deepEqual(db.filters,[['workspace_id','tenant'],['organization_id','tenant']]);
});
test("order pagination is independent of customers and retains deterministic next page",async()=>{
 const rows=Array.from({length:26},(_,i)=>({workspace_id:"tenant",organization_id:"tenant",person_id:i<17?"person":null,platform_order_id:String(i)}));
 const first=await listCustomerOrders(store(rows),{workspace_id:"tenant",offset:0,limit:17});
 const second=await listCustomerOrders(store(rows),{workspace_id:"tenant",offset:first.next_offset!,limit:17});
 assert.equal(first.orders.length,17);assert.equal(second.orders.length,9);assert.equal(second.next_offset,null);assert.ok(second.orders.every((row:any)=>row.customer===null));
});
test("order read failure is unavailable and route is GET-only",async()=>{
 await assert.rejects(listCustomerOrders(store([],true),{workspace_id:"tenant",offset:0,limit:50}),/unavailable/);
 assert.equal(matchCustomerExplorerRoute("GET","/v1/customer-orders")?.kind,"customer_orders");
 assert.equal(matchCustomerExplorerRoute("POST","/v1/customer-orders")?.kind,"method_not_allowed");
});

const scopedOrder = {workspace_id:"tenant",organization_id:"tenant",canonical_order_id:"canonical-12",connection_id:"conn",provider_account_id:"account",provider_order_id:"12",platform:"next29",platform_order_id:"next29:12",order_id:"display-12",gross_amount:0,currency:"EUR"};
function authorityStore(overrides:Record<string,any[]>={}) {
 const tables:Record<string,any[]>={tracekit_customer_order_read_model:[scopedOrder],commerce_provider_connections:[{id:"conn",organization_id:"tenant",provider:"next29"}],commerce_provider_accounts:[{id:"account",organization_id:"tenant",connection_id:"conn"}],...overrides};
 const reads:Array<{table:string;select:string;filters:Array<[string,unknown]>}>=[];
 return {reads,from(table:string){const r={table,select:"",filters:[] as Array<[string,unknown]>};reads.push(r);
 const result=()=>({data:(tables[table]||[]).filter(row=>r.filters.every(([k,v])=>row[k]===v)).map(row=>Object.fromEntries(r.select.split(",").filter(k=>k in row).map(k=>[k,row[k]]))),error:null});
 const q:any={select(s:string){r.select=s;assert.doesNotMatch(s,/raw|metadata|credential|token|secret/);return q;},eq(k:string,v:unknown){r.filters.push([k,v]);return q;},order(){return q;},limit(){return Promise.resolve(result());},range(){return Promise.resolve(result());}};return q;}};
}
test("actual order SELECT supplies distinct persisted namespaces and scoped provider authority",async()=>{
 const db=authorityStore();const result=await listCustomerOrders(db,{workspace_id:"tenant",offset:0,limit:50});const o=result.orders[0].order;
 assert.equal(o.canonical_order_id,"canonical-12");assert.equal(o.provider_order_id,"12");assert.equal(o.platform_order_id,"next29:12");assert.equal(o.order_id,"display-12");assert.equal(o.source_platform,"next29");
 assert.equal(o.connection_id,"conn");assert.equal(o.provider_account_id,"account");assert.equal(o.gross_amount,0);
 for(const r of db.reads)assert.ok(r.filters.some(([k,v])=>k==="organization_id"&&v==="tenant"));
 assert.ok(db.reads.find(r=>r.table==="commerce_provider_accounts")!.filters.some(([k,v])=>k==="connection_id"&&v==="conn"));
});
test("historical identifiers stay null and display identifiers cannot fill them",async()=>{
 const [o]=await resolveOrderReadAuthority(authorityStore(),"tenant",[{workspace_id:"tenant",organization_id:"tenant",platform:"next29",platform_order_id:"12",order_id:"12"}]);
 for(const k of ["canonical_order_id","provider_order_id","connection_id","provider_account_id","source_platform"])assert.equal(o[k],null);
});
test("foreign, missing, ambiguous and conflicting provider authority fails closed",async()=>{
 const cases:Array<Record<string,any[]>>=[{commerce_provider_connections:[]},{commerce_provider_accounts:[]},
 {commerce_provider_connections:[{id:"conn",organization_id:"foreign",provider:"next29"}]},
 {commerce_provider_accounts:[{id:"account",organization_id:"tenant",connection_id:"foreign"}]},
 {commerce_provider_accounts:[{id:"other",organization_id:"tenant",connection_id:"conn"}]},
 {commerce_provider_connections:[{id:"conn",organization_id:"tenant",provider:"shopify"}]},
 {commerce_provider_connections:[{id:"conn",organization_id:"tenant",provider:"next29"},{id:"conn",organization_id:"tenant",provider:"next29"}]}];
 for(const config of cases){const [o]=await resolveOrderReadAuthority(authorityStore(config),"tenant",[scopedOrder]);assert.equal(o.source_platform,null);assert.equal(o.provider_order_id,"12");}
 for(const patch of [{organization_id:"foreign"},{workspace_id:"foreign"},{connection_id:null},{provider_account_id:null},{connection_id:"foreign"},{provider_account_id:"foreign"}]){
  const [o]=await resolveOrderReadAuthority(authorityStore(),"tenant",[{...scopedOrder,...patch}]);assert.equal(o.source_platform,null);
 }
});
test("identical provider order numbers in different accounts do not share authority",async()=>{
 const [a,b]=await resolveOrderReadAuthority(authorityStore(),"tenant",[scopedOrder,{...scopedOrder,connection_id:"other",provider_account_id:"other"}]);
 assert.equal(a.source_platform,"next29");assert.equal(b.source_platform,null);assert.equal(b.provider_order_id,a.provider_order_id);
});
test("independent complete provider accounts retain equal provider IDs without conflating namespaces",async()=>{
 const db=authorityStore({commerce_provider_connections:[{id:"conn",organization_id:"tenant",provider:"next29"},{id:"shop",organization_id:"tenant",provider:"shopify"}],commerce_provider_accounts:[{id:"account",organization_id:"tenant",connection_id:"conn"},{id:"shop-account",organization_id:"tenant",connection_id:"shop"}]});
 const [a,b]=await resolveOrderReadAuthority(db,"tenant",[scopedOrder,{...scopedOrder,platform:"shopify",connection_id:"shop",provider_account_id:"shop-account",canonical_order_id:"other-canonical"}]);
 assert.equal(a.provider_order_id,b.provider_order_id);assert.equal(a.source_platform,"next29");assert.equal(b.source_platform,"shopify");assert.notEqual(a.canonical_order_id,b.canonical_order_id);
});
test("compact customer order allows scoped identity but excludes raw payloads and secret extensions",async()=>{
 const [row]=await resolveOrderReadAuthority(authorityStore(),"tenant",[{...scopedOrder,raw_json:{secret:"synthetic-protected"},credential:"synthetic-protected"}]);
 const o=compactOrder(row);assert.equal(o.source_platform,"next29");assert.equal(o.canonical_order_id,"canonical-12");assert.equal(o.amount,0);assert.equal(o.currency,"EUR");assert.ok(!JSON.stringify(o).includes("synthetic-protected"));
 assert.ok(!("journey_id" in o));
});
