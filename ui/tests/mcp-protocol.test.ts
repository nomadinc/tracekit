import assert from "node:assert/strict";
import test from "node:test";
import { handleTraceKitMcpMessage, TRACEKIT_MCP_PROTOCOL_VERSION } from "../lib/mcp/protocol";

const service:any={
 listCustomers:async()=>[{id:"c1"}], getCustomer:async()=>null,
 listOrders:async()=>[], getOrder:async()=>null, search:async()=>[],
};
test("MCP initialize advertises tools capability and protocol version",async()=>{
 const result:any=await handleTraceKitMcpMessage(service,{jsonrpc:"2.0",id:1,method:"initialize",params:{}});
 assert.equal(result.result.protocolVersion,TRACEKIT_MCP_PROTOCOL_VERSION);
 assert.equal(result.result.capabilities.tools.listChanged,false);
});
test("MCP tools/list exposes only approved read-only tools",async()=>{
 const result:any=await handleTraceKitMcpMessage(service,{jsonrpc:"2.0",id:2,method:"tools/list"});
 assert.equal(result.result.tools.length,5);
 assert.ok(result.result.tools.every((tool:any)=>tool.annotations.readOnlyHint===true));
});
test("MCP tools/call dispatches through governed service adapter",async()=>{
 const result:any=await handleTraceKitMcpMessage(service,{jsonrpc:"2.0",id:3,method:"tools/call",params:{name:"tracekit.list_customers",arguments:{limit:1}}});
 assert.equal(result.result.isError,false);
 assert.deepEqual(result.result.structuredContent,[{id:"c1"}]);
});
test("MCP protocol rejects malformed and unknown methods without leaking internals",async()=>{
 const malformed:any=await handleTraceKitMcpMessage(service,{id:1,method:"tools/list"});
 assert.equal(malformed.error.code,-32600);
 const unknown:any=await handleTraceKitMcpMessage(service,{jsonrpc:"2.0",id:2,method:"resources/list"});
 assert.equal(unknown.error.code,-32601);
});
test("MCP governed denial becomes generic tool error",async()=>{
 const denied={...service,getOrder:async()=>{throw new Error("The requested resource is unavailable.");}};
 const result:any=await handleTraceKitMcpMessage(denied,{jsonrpc:"2.0",id:4,method:"tools/call",params:{name:"tracekit.get_order",arguments:{order_id:"other-tenant"}}});
 assert.equal(result.result.isError,true);
 assert.equal(result.result.content[0].text,"The requested resource is unavailable.");
});

test("M4 protocol keeps internal failures generic and unavailable resources non-specific",async()=>{
 const failing:any={listCustomers:async()=>{throw new Error("database password secret");},getCustomer:async()=>{throw new Error("access_denied");},listOrders:async()=>[],getOrder:async()=>null,search:async()=>[]};
 const internal:any=await handleTraceKitMcpMessage(failing,{jsonrpc:"2.0",id:20,method:"tools/call",params:{name:"tracekit.list_customers",arguments:{limit:5}}});
 assert.equal(internal.result.isError,true); assert.equal(internal.result.content[0].text,"TraceKit could not complete the request."); assert.doesNotMatch(JSON.stringify(internal),/password secret/);
 const denied:any=await handleTraceKitMcpMessage(failing,{jsonrpc:"2.0",id:21,method:"tools/call",params:{name:"tracekit.get_customer",arguments:{customer_id:"foreign"}}});
 assert.equal(denied.result.isError,true); assert.equal(denied.result.content[0].text,"The requested resource is unavailable.");
});
test("M4 protocol rejects unknown arguments before tool execution",async()=>{
 let called=false; const svc:any={listCustomers:async()=>{called=true;return[];}};
 const out:any=await handleTraceKitMcpMessage(svc,{jsonrpc:"2.0",id:22,method:"tools/call",params:{name:"tracekit.list_customers",arguments:{limit:5,organization_id:"foreign"}}});
 assert.equal(out.error.code,-32602); assert.equal(called,false);
});
