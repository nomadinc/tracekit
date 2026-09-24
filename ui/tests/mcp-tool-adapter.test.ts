import assert from "node:assert/strict";
import test from "node:test";
import { TRACEKIT_MCP_TOOLS, callTraceKitMcpTool, mcpToolResult } from "../lib/mcp/tool-adapter";

test("M2 tool catalog is read-only and contains only approved tools",()=>{
 assert.deepEqual(TRACEKIT_MCP_TOOLS.map(t=>t.name),[
  "tracekit.list_customers","tracekit.get_customer","tracekit.list_orders","tracekit.get_order","tracekit.search"
 ]);
 assert.ok(TRACEKIT_MCP_TOOLS.every(t=>t.annotations.readOnlyHint && !t.annotations.destructiveHint));
});
test("M2 adapter dispatches normalized arguments",async()=>{
 const calls:any[]=[];
 const service:any={
  listCustomers:async(v:any)=>{calls.push(["customers",v]);return[];},
  getCustomer:async(v:any)=>{calls.push(["customer",v]);return null;},
  listOrders:async(v:any)=>{calls.push(["orders",v]);return[];},
  getOrder:async(v:any)=>{calls.push(["order",v]);return null;},
  search:async(q:any,v:any)=>{calls.push(["search",q,v]);return[];},
 };
 await callTraceKitMcpTool(service,"tracekit.list_orders",{customer_id:" c1 ",limit:10});
 await callTraceKitMcpTool(service,"tracekit.search",{query:" person ",limit:5});
 assert.deepEqual(calls,[["orders",{query:undefined,customerId:"c1",offerId:undefined,limit:10}],["search","person",{limit:5}]]);
});
test("M2 adapter rejects unknown tools, extra arguments, missing ids, and excessive limits",async()=>{
 const service:any={};
 await assert.rejects(()=>callTraceKitMcpTool(service,"tracekit.nope",{}),/tool_not_found/);
 await assert.rejects(()=>callTraceKitMcpTool(service,"tracekit.get_order",{}),/invalid_arguments/);
 await assert.rejects(()=>callTraceKitMcpTool(service,"tracekit.list_customers",{limit:51}),/invalid_arguments/);
 await assert.rejects(()=>callTraceKitMcpTool(service,"tracekit.list_customers",{unexpected:true}),/invalid_arguments/);
});
test("M2 result envelope provides text and structured content",()=>{
 const result=mcpToolResult({ok:true});
 assert.equal(result.content[0].text,'{"ok":true}');
 assert.deepEqual(result.structuredContent,{ok:true});
 assert.equal(result.isError,false);
});
