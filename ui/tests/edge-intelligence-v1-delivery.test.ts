import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { POST } from "../app/api/edge/intelligence-v1/route";

const migration = readFileSync(new URL("../../supabase/migrations/20261004040000_edge_intelligence_v1_delivery_credentials.sql", import.meta.url), "utf8");
const fixture = JSON.parse(readFileSync(new URL("./fixtures/edge-intelligence-v1.examples.json", import.meta.url), "utf8")).scenarios.normalResidential;
const valid = () => structuredClone(fixture);
const token = "ws023_synthetic_test_credential_0123456789abcdef";
const hash = createHash("sha256").update(token).digest("hex");
function request(payload: unknown, bearer = token) {
  return new Request("https://offline.invalid/api/edge/intelligence-v1", {
    method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+bearer},
    body:JSON.stringify(payload)
  });
}
async function mock<T>(fetcher:(url:string,init:RequestInit)=>Promise<Response>,run:(logs:unknown[][])=>Promise<T>):Promise<T> {
  const originalFetch=globalThis.fetch, originalError=console.error;
  const base=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const logs:unknown[][]=[];
  process.env.NEXT_PUBLIC_SUPABASE_URL="https://offline-supabase.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY="synthetic-test-only-service-role";
  globalThis.fetch=(async (input:RequestInfo|URL,init?:RequestInit)=>fetcher(String(input),init??{})) as typeof fetch;
  console.error=(...args:unknown[])=>{logs.push(args);};
  try{return await run(logs);}
  finally{
    globalThis.fetch=originalFetch;console.error=originalError;
    if(base===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=base;
    if(key===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=key;
  }
}
const response=(body:unknown,status=200)=>Response.json(body,{status});
test("credential storage schema retains hashed tenant-scoped credentials",()=>{
  assert.match(migration,/organization_id uuid not null references public\.tracekit_organizations/);
  assert.match(migration,/tenant_ref text not null/);
  assert.match(migration,/token_hash text not null unique/);
  assert.match(migration,/enable row level security/);
});
test("short or missing bearer is denied without persistence calls",async()=>{
  for(const bearer of ["","short"]){
    let calls=0;
    await mock(async()=>{calls++;throw Error("unexpected_fetch");},async()=>{
      const result=await POST(request(valid(),bearer));
      assert.equal(result.status,401);
      assert.deepEqual(await result.json(),{ok:false,code:"unauthorized"});
      assert.equal(calls,0);
    });
  }
});
test("persistence HTTP errors are classified without leaking provider content",async()=>{
  await mock(async()=>response({message:"synthetic_secret_provider_marker"},503),async logs=>{
    const result=await POST(request(valid()));
    assert.equal(result.status,503);
    const body=await result.text();
    assert.deepEqual(JSON.parse(body),{ok:false,code:"delivery_unavailable"});
    assert.doesNotMatch(body,/synthetic_secret_provider_marker|service.role|token_hash/i);
    assert.doesNotMatch(JSON.stringify(logs),/synthetic_secret_provider_marker/);
  });
});
test("unexpected persistence exception redacts HTTP response and logs",async()=>{
  const marker="ws023_sensitive_exception_credential";
  await mock(async()=>{throw Error(marker);},async logs=>{
    const result=await POST(request(valid()));
    assert.equal(result.status,503);
    assert.deepEqual(await result.json(),{ok:false,code:"delivery_unavailable"});
    assert.doesNotMatch(JSON.stringify(logs),new RegExp(marker));
  });
});
test("Model B denies credential A against active tenant B before ingest",async()=>{
  const foreign=valid();foreign.tenantRef="tenant_fixture_b";
  let ingestions=0;
  await mock(async url=>{
    if(url.includes("edge_intelligence_service_credentials?"))return response([{id:"credential-a",token_hash:hash,tenant_ref:"tenant_fixture_a",organization_id:"org-a"}]);
    if(url.includes("edge_intelligence_tenant_bindings?"))return response([{tenant_ref:"tenant_fixture_b",organization_id:"org-b"}]);
    if(url.includes("rpc/ingest_edge_intelligence_v1")){ingestions++;return response({outcome:"accepted",revision:1});}
    return response(null);
  },async()=>{
    const result=await POST(request(foreign));
    assert.equal(result.status,403,"wrong-tenant credential must be denied");
    assert.equal(ingestions,0,"foreign-tenant payload must never reach persistence");
  });
});
test("missing tenant binding denies before ingest",async()=>{
  let ingestions=0;
  await mock(async url=>{
    if(url.includes("edge_intelligence_service_credentials?"))return response([{id:"credential-a",token_hash:hash,tenant_ref:"tenant_fixture_a",organization_id:"org-a"}]);
    if(url.includes("edge_intelligence_tenant_bindings?"))return response([]);
    if(url.includes("rpc/ingest_edge_intelligence_v1"))ingestions++;
    return response(null);
  },async()=>{
    const result=await POST(request(valid()));
    assert.equal(result.status,403);
    assert.equal(ingestions,0);
  });
});
for (const scenario of [
  {name:"missing tenant identity", tenantRef:undefined},
  {name:"substituted tenant identity", tenantRef:"tenant_fixture_b"}
]) {
  test(`${scenario.name} cannot reach ingestion`,async()=>{
    const payload=valid();
    if(scenario.tenantRef===undefined)delete payload.tenantRef;
    else payload.tenantRef=scenario.tenantRef;

    let ingestions=0;
    await mock(async url=>{
      if(url.includes("edge_intelligence_service_credentials?"))
        return response([{id:"credential-a",token_hash:hash,tenant_ref:"tenant_fixture_a",organization_id:"org-a"}]);
      if(url.includes("edge_intelligence_tenant_bindings?"))
        return response([{tenant_ref:"tenant_fixture_b",organization_id:"org-b"}]);
      if(url.includes("rpc/ingest_edge_intelligence_v1")){
        ingestions++;
        return response({outcome:"accepted",revision:1});
      }
      return response(null);
    },async()=>{
      const result=await POST(request(payload));
      assert.notEqual(result.status,201);
      assert.equal(ingestions,0);
    });
  });
}
