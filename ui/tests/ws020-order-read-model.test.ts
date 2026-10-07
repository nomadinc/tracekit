import assert from "node:assert/strict";
import test from "node:test";
import { ProductionOrderRepository } from "../lib/orders/production-repository";
test("Orders consume every canonical page including exact provider identities without inventing contacts",async()=>{
 const originalFetch=globalThis.fetch;
 const requests:string[]=[];
 globalThis.fetch=async (input:any)=>{
   const url=new URL(String(input),'https://app.example.test');requests.push(url.pathname);
   assert.equal(url.searchParams.get('workspace_id'),'tenant');
   const offset=Number(url.searchParams.get('offset')||0);
   const count=offset===0?17:9;
   return Response.json({orders:Array.from({length:count},(_,i)=>({order:{platform_order_id:`next29:${offset+i}`,order_id:String(offset+i),person_id:offset===0?'direct':null,evidence_id:'retained',status:'paid',gross_amount:0},customer:{id:offset===0?'direct':'exact-provider'},identity_state:offset===0?'linked':'exact_provider_identity'})),next_offset:offset===0?17:null});
 };
 try {
   const rows=await new ProductionOrderRepository().listOrders({authenticated:true,workspaceId:'tenant',organizationId:'tenant',businessContextId:'context',session:{}},{});
   assert.equal(rows.length,26);assert.equal(rows.filter(row=>row.customerId==='exact-provider').length,9);
   assert.ok(rows.every(row=>row.customerEmail===''&&row.customerPhone===''));
   assert.ok(rows.every(row=>row.revenue===0&&row.revenueAvailable===true));
   assert.deepEqual(requests,['/api/customer-orders','/api/customer-orders']);
 } finally {globalThis.fetch=originalFetch;}
});
