import assert from 'node:assert/strict';
import test from 'node:test';
import { createPreviewHandler,previewDatabaseFetch } from './ws023-readonly-preview';
const env:any={TK_SECRET_KEY:'synthetic-only'};
test('preview denies unauthenticated, foreign organization, non-read routes and mutations before any database access',async()=>{
 let calls=0;const handler=createPreviewHandler(()=>{calls++;throw new Error('unexpected database access')});
 assert.equal((await handler(new Request('https://preview.test/v1/customer-orders'),env)).status,401);
 for(const method of ['POST','PUT','PATCH','DELETE']) assert.equal((await handler(new Request('https://preview.test/v1/customer-orders',{method,headers:{'x-tk-secret':'synthetic-only'}}),env)).status,405);
 assert.equal((await handler(new Request('https://preview.test/v1/customer-orders?workspace_id=foreign',{headers:{'x-tk-secret':'synthetic-only'}}),env)).status,404);
 assert.equal(calls,0);
});
test('database transport permits only GET on exact read tables and pinned origin',async()=>{
 let calls=0;const read=previewDatabaseFetch('https://db.supabase.co',async()=>{calls++;return Response.json([])});
 await read('https://db.supabase.co/rest/v1/commerce_order_lines');
 for(const url of ['https://foreign.test/rest/v1/commerce_order_lines','https://db.supabase.co/rest/v1/rpc/mutate','https://db.supabase.co/rest/v1/platform_orders','https://db.supabase.co/auth/v1/users']) await assert.rejects(read(url),/denied/);
 await assert.rejects(read('https://db.supabase.co/rest/v1/commerce_order_lines',{method:'POST',body:'{}'}),/denied/);
 assert.equal(calls,1);
});
