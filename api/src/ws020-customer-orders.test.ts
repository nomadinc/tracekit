import assert from "node:assert/strict";
import test from "node:test";
import { listCustomerOrders, matchCustomerExplorerRoute } from "./customer-explorer.ts";
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
