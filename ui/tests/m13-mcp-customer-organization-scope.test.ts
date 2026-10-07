import assert from "node:assert/strict";
import test from "node:test";
import { mcpCustomerRepository } from "../lib/mcp/customer-repository";
test("MCP customer Core reads ignore legacy workspace hints and fail closed when canonical scope is absent",async()=>{
 const previousFetch=globalThis.fetch;const originalKey=process.env.TK_SECRET_KEY;const originalBase=process.env.TRACEKIT_API_BASE_URL;const urls:string[]=[];
 process.env.TK_SECRET_KEY="synthetic-local-test";process.env.TRACEKIT_API_BASE_URL="https://core.example.test";
 globalThis.fetch=async(url:any)=>{urls.push(String(url));return Response.json({customers:[]});};
 try{
  await mcpCustomerRepository.listCustomers({authenticated:true,organizationId:"stem",workspaceId:"foreign"} as any);
  assert.equal(new URL(urls[0]).searchParams.get("workspace_id"),"stem");
  await assert.rejects(()=>mcpCustomerRepository.listCustomers({authenticated:true,organizationId:"",workspaceId:"foreign"} as any),/scope_unavailable/);assert.equal(urls.length,1);
 }finally{globalThis.fetch=previousFetch;if(originalKey===undefined)delete process.env.TK_SECRET_KEY;else process.env.TK_SECRET_KEY=originalKey;if(originalBase===undefined)delete process.env.TRACEKIT_API_BASE_URL;else process.env.TRACEKIT_API_BASE_URL=originalBase;}
});
