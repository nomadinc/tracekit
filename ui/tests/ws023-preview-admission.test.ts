import assert from 'node:assert/strict';
import test from 'node:test';
import { ws023CorePreviewPath } from '../lib/identity/ws023-preview-policy';
import { GET } from '../app/api/ws023-core/[...readPath]/route';
import { previewCoreFetch } from '../lib/identity/preview-core-transport';
import { createScopedCoreProxy } from '../lib/identity/scoped-core-runtime';
import { projectCoreCustomerRead } from '../lib/identity/core-read-projection';
import { previewDatabaseFetch } from '../../api/src/ws023-readonly-handler';
test('shared Core preview is unavailable in production and rejects missing or foreign database bindings before transport',async()=>{
 const keys=['VERCEL_ENV','TRACEKIT_WS023_READONLY_CORE_PREVIEW','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY'] as const;
 const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('unexpected database access')};
 const request=new Request('https://preview.vercel.app/api/ws023-core/v1/customer-orders');
 try {
  delete process.env.SUPABASE_SECRET_KEY;process.env.VERCEL_ENV='production';process.env.TRACEKIT_WS023_READONLY_CORE_PREVIEW='enabled';assert.equal((await GET(request)).status,404);
  process.env.VERCEL_ENV='preview';process.env.TRACEKIT_WS023_READONLY_CORE_PREVIEW='disabled';assert.equal((await GET(request)).status,404);
  process.env.TRACEKIT_WS023_READONLY_CORE_PREVIEW='enabled';process.env.NEXT_PUBLIC_SUPABASE_URL='https://foreign.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic';assert.equal((await GET(request)).status,503);
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://uoeosoiegatlqtzemsfv.supabase.co';delete process.env.SUPABASE_SERVICE_ROLE_KEY;assert.equal((await GET(request)).status,503);assert.equal(calls,0);
 }finally{globalThis.fetch=original;for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
});
test('preview entry executes the real Supabase client with exact read filters and canonical evidence',async()=>{
 const keys=['VERCEL_ENV','TRACEKIT_WS023_READONLY_CORE_PREVIEW','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY','TK_SECRET_KEY','TRACEKIT_USE_STAGING_CORE_CREDENTIAL'] as const;
 const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]])),original=globalThis.fetch;
 const org='8f6bb14b-2126-49b8-bfdb-c60edbc3549b',canonical='15f0b290-aaad-4962-b1d6-42f69db3966c',journey='bc1e677e-173c-51ad-b00c-e78b4ba77ef6';
 const order={workspace_id:org,organization_id:org,canonical_order_id:canonical,connection_id:'connection',provider_account_id:'account',resolved_person_id:'person',platform_order_id:'next29:103104',gross_amount:'116.99',tax_amount:'0',shipping_amount:null,currency:'USD'};
 const calls:URL[]=[];
 globalThis.fetch=async(input:any,init:any)=>{
  const req=new Request(input,init),url=new URL(req.url);assert.equal(req.method,'GET');assert.equal(req.headers.get('apikey'),'sb_secret_synthetic-test-only');assert.equal(req.headers.get('authorization'),null);calls.push(url);
  const table=url.pathname.split('/').at(-1);assert.equal(url.searchParams.get(table==='journeys'?'workspace_id':table==='journey_events'?'workspace_id':'organization_id'),'eq.'+org);
  if(table==='tracekit_customer_order_read_model')return Response.json([order]);
  if(table==='commerce_order_lines'){assert.equal(url.searchParams.get('canonical_order_id'),'eq.'+canonical);assert.equal(url.searchParams.get('connection_id'),'eq.connection');assert.equal(url.searchParams.get('provider_account_id'),'eq.account');return Response.json([{...order,id:'line',quantity:'1',unit_amount:'116.99',evidence_id:'evidence',metadata:{title:'20 Treatments (5)',provider_product_id:'8',provider_variant_id:'9',sku:null}}]);}
  if(table==='journey_events')return Response.json([{workspace_id:org,person_id:'person',source_record_id:canonical,platform_order_id:'next29:103104',journey_id:journey}]);
  if(table==='journeys')return Response.json([{id:journey}]);
  if(table==='commerce_relationship_projection_v3')return Response.json([]);
  throw new Error('Unexpected table '+table);
 };
 try{
  Object.assign(process.env,{VERCEL_ENV:'preview',TRACEKIT_WS023_READONLY_CORE_PREVIEW:'enabled',NEXT_PUBLIC_SUPABASE_URL:'https://uoeosoiegatlqtzemsfv.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_synthetic-test-only',SUPABASE_SERVICE_ROLE_KEY:'eyJstale.legacy.jwt',TK_SECRET_KEY:'synthetic-core-only',TRACEKIT_USE_STAGING_CORE_CREDENTIAL:'disabled'});
  const res=await GET(new Request(`https://preview.vercel.app/api/ws023-core/v1/customer-orders?workspace_id=${org}&order_id=next29%3A103104&limit=1`,{headers:{'x-tk-secret':'synthetic-core-only'}}));
  assert.equal(res.status,200);const body:any=await res.json();assert.equal(body.orders[0].order.canonical_journey_id,journey);assert.equal(body.order_lines[0].product_name,'20 Treatments (5)');assert.equal(body.order_lines[0].unit_amount,116.99);assert.ok(calls.length>=5);
 }finally{globalThis.fetch=original;for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
});

test('Core middleware exemption is limited to the explicitly enabled Preview path',()=>{
 const enabled={VERCEL_ENV:'preview',TRACEKIT_WS023_READONLY_CORE_PREVIEW:'enabled'};
 assert.equal(ws023CorePreviewPath('/api/ws023-core/v1/customer-orders',enabled),true);
 for(const pathname of ['/api/customer-orders','/api/customers/person','/api/ws023-core-other/v1/customer-orders','/orders'])assert.equal(ws023CorePreviewPath(pathname,enabled),false);
 assert.equal(ws023CorePreviewPath('/api/ws023-core/v1/customer-orders',{...enabled,VERCEL_ENV:'production'}),false);
 assert.equal(ws023CorePreviewPath('/api/ws023-core/v1/customer-orders',{...enabled,TRACEKIT_WS023_READONLY_CORE_PREVIEW:'disabled'}),false);
});

test('direct Preview transport retains customer, Core, tenant and read-only boundaries without self-fetch',async()=>{
 const keys=['VERCEL_ENV','VERCEL_URL','TRACEKIT_WS023_READONLY_CORE_PREVIEW','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SECRET_KEY','TK_SECRET_KEY','TRACEKIT_USE_STAGING_CORE_CREDENTIAL'] as const;
 const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]])),original=globalThis.fetch;
 const org='8f6bb14b-2126-49b8-bfdb-c60edbc3549b',canonical='15f0b290-aaad-4962-b1d6-42f69db3966c',journey='bc1e677e-173c-51ad-b00c-e78b4ba77ef6';
 const base='https://transport-test.vercel.app/api/ws023-core';
 const path=`${base}/v1/customer-orders?workspace_id=${org}&order_id=next29%3A103104&limit=1`;
 const order={workspace_id:org,organization_id:org,business_context_id:'active',canonical_order_id:canonical,connection_id:'connection',provider_account_id:'account',resolved_person_id:'person',platform_order_id:'next29:103104',gross_amount:'116.99',currency:'USD',profit:99,processor_fee:7};
 const calls:Request[]=[];
 const session:any={user:{id:'existing-user',status:'active'},membership:{id:'existing-member',status:'active',effectiveFrom:'2020-01-01T00:00:00Z'},activeOrganization:{id:org},availableOrganizations:[{id:org}],activeBusinessContextId:'active',effectivePermissions:['orders.view','customers.view','financials.view']};
 const gateway=(resolution:any={kind:'authenticated',session})=>createScopedCoreProxy({resolveSession:async()=>resolution,apiBaseUrl:()=>base,adminSecret:()=>process.env.TK_SECRET_KEY!,fetch:previewCoreFetch});
 globalThis.fetch=async(input:any,init:any)=>{
  const request=new Request(input,init),url=new URL(request.url);calls.push(request);
  assert.equal(url.origin,'https://uoeosoiegatlqtzemsfv.supabase.co','no HTTP self-fetch or third-party transport');
  assert.equal(request.method,'GET');assert.equal(request.headers.get('apikey'),'sb_secret_synthetic-test-only');
  assert.equal(request.headers.get('x-tk-secret'),null);assert.equal(request.headers.get('x-vercel-protection-bypass'),null);
  const table=url.pathname.split('/').at(-1);
  if(table==='tracekit_customer_order_read_model')return Response.json([order]);
  if(table==='commerce_order_lines')return Response.json([{...order,id:'line',quantity:'1',unit_amount:'116.99',evidence_id:'evidence',metadata:{title:'20 Treatments (5)',provider_product_id:'8',provider_variant_id:'9'}}]);
  if(table==='journey_events')return Response.json([{workspace_id:org,person_id:'person',source_record_id:canonical,platform_order_id:'next29:103104',journey_id:journey}]);
  if(table==='journeys')return Response.json([{id:journey}]);
  if(table==='commerce_relationship_projection_v3')return Response.json([]);
  throw new Error('Unexpected database table '+table);
 };
 try {
  Object.assign(process.env,{VERCEL_ENV:'preview',VERCEL_URL:'transport-test.vercel.app',TRACEKIT_WS023_READONLY_CORE_PREVIEW:'enabled',NEXT_PUBLIC_SUPABASE_URL:'https://uoeosoiegatlqtzemsfv.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_synthetic-test-only',TK_SECRET_KEY:'synthetic-core-only',TRACEKIT_USE_STAGING_CORE_CREDENTIAL:'disabled'});
  const response:any=await gateway().scopedCoreGet('/v1/customer-orders',`https://transport-test.vercel.app/api/customer-orders?workspace_id=${org}&order_id=next29%3A103104&limit=1`,'orders.view',projectCoreCustomerRead);
  assert.equal(response.status,200);assert.equal(response.body.orders[0].order.gross_amount,'116.99');
  assert.equal(response.body.orders[0].order.canonical_order_id,canonical);assert.equal(response.body.orders[0].order.canonical_journey_id,journey);
  assert.equal(response.body.order_lines[0].product_name,'20 Treatments (5)');assert.equal(response.body.order_lines[0].unit_amount,116.99);
  assert.equal(response.body.orders[0].order.profit,undefined);assert.equal(response.body.orders[0].order.processor_fee,undefined);assert.ok(calls.length>=5);
  const readCalls=calls.length;
  for(const resolution of [{kind:'unauthenticated'},{kind:'authenticated',session:{...session,effectivePermissions:[]}}])assert.equal((await gateway(resolution).scopedCoreGet('/v1/customer-orders','https://transport-test.vercel.app/api/customer-orders','orders.view')).status,404);
  for(const query of ['workspace_id=foreign','business_context_id=foreign','business_context_id=active&business_context_id=foreign'])assert.equal((await gateway().scopedCoreGet('/v1/customer-orders',`https://transport-test.vercel.app/api/customer-orders?${query}`,'orders.view')).status,404);
  for(const headers of [{},{'x-tk-secret':'invalid'}])assert.equal((await previewCoreFetch(path,{headers})).status,401);
  assert.equal((await previewCoreFetch(`${base}/v1/customer-orders?workspace_id=foreign`,{headers:{'x-tk-secret':'synthetic-core-only'}})).status,404);
  assert.equal((await previewCoreFetch(`${base}/v1/customers/not-a-uuid/journeys/not-a-uuid?workspace_id=${org}`,{headers:{'x-tk-secret':'synthetic-core-only'}})).status,404);
  for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal((await previewCoreFetch(path,{method,headers:{'x-tk-secret':'synthetic-core-only'}})).status,405);
  for(const url of ['https://foreign.example/api/ws023-core/v1/customers','https://transport-test.vercel.app/api/ws023-core-other/v1/customers'])assert.equal((await previewCoreFetch(url,{headers:{'x-tk-secret':'synthetic-core-only'}})).status,404);
  delete process.env.VERCEL_URL;assert.equal((await previewCoreFetch(path)).status,404);
  assert.equal(calls.length,readCalls,'denials never reach the database or an external origin');
  const database=previewDatabaseFetch('https://uoeosoiegatlqtzemsfv.supabase.co',globalThis.fetch);
  await assert.rejects(database('https://uoeosoiegatlqtzemsfv.supabase.co/rest/v1/commerce_order_lines',{method:'POST',body:'{}'}),/denied/);
  await assert.rejects(database('https://uoeosoiegatlqtzemsfv.supabase.co/rest/v1/rpc/mutate'),/denied/);
  assert.equal(calls.length,readCalls);
 }finally{globalThis.fetch=original;for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
});

test('Production and disabled Preview transport retain the existing HTTP path',async()=>{
 const keys=['VERCEL_ENV','TRACEKIT_WS023_READONLY_CORE_PREVIEW'] as const;
 const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]])),original=globalThis.fetch;
 const calls:string[]=[];globalThis.fetch=async(input:any)=>{calls.push(String(input));return Response.json({existing:true});};
 try{
  for(const env of [{VERCEL_ENV:'production',TRACEKIT_WS023_READONLY_CORE_PREVIEW:'enabled'},{VERCEL_ENV:'preview',TRACEKIT_WS023_READONLY_CORE_PREVIEW:'disabled'}]){
   Object.assign(process.env,env);const response=await previewCoreFetch('https://existing-core.example/v1/customers');assert.equal(response.status,200);
  }
  assert.deepEqual(calls,['https://existing-core.example/v1/customers','https://existing-core.example/v1/customers']);
 }finally{globalThis.fetch=original;for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
});
