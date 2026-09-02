import assert from "node:assert/strict";
import test from "node:test";
import { next29IncrementalQuery, next29IncrementalWindow, runNext29IncrementalCycle } from "./connectors/next29/incremental-runtime.ts";

function emptyPage() { return { results: [], next: null, previous: null, providerRequestId: null, correlationId: "c", rateLimit: { limit: 4, remaining: 3, retryAfterMs: null } }; }
function persistence() { return { async beginRun(){return{syncRunId:"run"}},async persistOrder(){},async persistSubscription(){},async persistDispute(){},async appendCheckpoint(){},async completeRun(){},async failRun(){} }; }
function allPersistence() { const p:any=persistence(); return { orders:p, subscriptions:p, disputes:p }; }
function sink() { return { async putImmutable(input:any){return{storageReference:"mem://x",payloadHash:"h",byteSize:input.payload.byteLength}} }; }
function heartbeat(){return Promise.resolve(true)}

const scope={organizationId:"org",connectionId:"conn",providerAccountId:"acct"};

test("29Next incremental queries use documented date-range filters", () => {
  assert.deepEqual(next29IncrementalQuery("orders","2026-08-30T12:00:00Z","2026-09-01T12:00:00Z"),{date_placed_from:"2026-08-30",date_placed_to:"2026-09-01"});
  assert.deepEqual(next29IncrementalQuery("subscriptions","2026-08-30T12:00:00Z","2026-09-01T12:00:00Z"),{date_from:"2026-08-30",date_to:"2026-09-01"});
  assert.deepEqual(next29IncrementalQuery("disputes","2026-08-30T12:00:00Z","2026-09-01T12:00:00Z"),{dispute_date_from:"2026-08-30",dispute_date_to:"2026-09-01"});
});

test("29Next incremental window overlaps prior success and caps stale catch-up", () => {
  const overlap=next29IncrementalWindow({successfulThrough:"2026-08-31T12:00:00Z",now:"2026-09-01T12:00:00Z",overlapDays:1,maxCatchupDays:7});
  assert.equal(overlap.start,"2026-08-30T12:00:00.000Z");
  const capped=next29IncrementalWindow({successfulThrough:"2026-07-01T00:00:00Z",now:"2026-09-01T12:00:00Z",overlapDays:1,maxCatchupDays:7});
  assert.equal(capped.start,"2026-08-25T12:00:00.000Z");
});

test("29Next incremental cycle performs no provider read without a claimed enabled schedule", async () => {
  let reads=0;
  const client:any={apiVersion:"2024-04-01",async listOrders(){reads++;return emptyPage()},async getOrder(){throw new Error("unused")},async listSubscriptions(){throw new Error("unused")},async getSubscription(){throw new Error("unused")},async listDisputes(){throw new Error("unused")},async getDispute(){throw new Error("unused")}};
  const result=await runNext29IncrementalCycle({...scope,client,evidenceSink:sink(),persistence:allPersistence(),resources:["orders"],leaseOwner:"worker-1",now:()=>"2026-09-01T12:00:00Z",control:{async claim(){return{claimed:false,scheduleId:"s",enabled:false,successfulThrough:null,activeWindowStart:null,activeWindowEnd:null,resumeCursor:null}},heartbeat,async finish(){throw new Error("unused")},async fail(){throw new Error("unused")}}});
  assert.equal(reads,0); assert.equal(result.resources.orders?.status,"not_claimed");
});

test("29Next incremental completion advances successful-through and passes date query", async () => {
  let query:any=null; let finished:any=null;
  const client:any={apiVersion:"2024-04-01",async listOrders(input:any){query=input.query;return emptyPage()},async getOrder(){throw new Error("unused")},async listSubscriptions(){throw new Error("unused")},async getSubscription(){throw new Error("unused")},async listDisputes(){throw new Error("unused")},async getDispute(){throw new Error("unused")}};
  const result=await runNext29IncrementalCycle({...scope,client,evidenceSink:sink(),persistence:allPersistence(),resources:["orders"],leaseOwner:"worker-1",now:()=>"2026-09-01T12:00:00Z",control:{async claim(){return{claimed:true,scheduleId:"s",enabled:true,successfulThrough:"2026-08-31T12:00:00Z",activeWindowStart:null,activeWindowEnd:null,resumeCursor:null}},heartbeat,async finish(input:any){finished=input},async fail(){throw new Error("unused")}}});
  assert.deepEqual(query,{date_placed_from:"2026-08-30",date_placed_to:"2026-09-01"});
  assert.equal(finished.successfulThrough,"2026-09-01T12:00:00.000Z"); assert.equal(finished.resumeCursor,null); assert.equal(result.resources.orders?.status,"completed");
});

test("29Next incremental incomplete cycle preserves fixed window and resume cursor without advancing success", async () => {
  let finished:any=null;
  const client:any={apiVersion:"2024-04-01",async listOrders(){return{...emptyPage(),next:"https://demo.29next.store/api/admin/orders/?cursor=next-1"}},async getOrder(){throw new Error("unused")},async listSubscriptions(){throw new Error("unused")},async getSubscription(){throw new Error("unused")},async listDisputes(){throw new Error("unused")},async getDispute(){throw new Error("unused")}};
  const result=await runNext29IncrementalCycle({...scope,client,evidenceSink:sink(),persistence:allPersistence(),resources:["orders"],bounds:{maxPagesPerResource:1,maxRecordsPerResource:100},leaseOwner:"worker-1",now:()=>"2026-09-01T12:00:00Z",control:{async claim(){return{claimed:true,scheduleId:"s",enabled:true,successfulThrough:"2026-08-31T12:00:00Z",activeWindowStart:null,activeWindowEnd:null,resumeCursor:null}},heartbeat,async finish(input:any){finished=input},async fail(){throw new Error("unused")}}});
  assert.equal(finished.outcome,"incomplete"); assert.equal(finished.successfulThrough,"2026-08-31T12:00:00Z"); assert.equal(finished.resumeCursor,"next-1"); assert.equal(finished.activeWindowStart,"2026-08-30T12:00:00.000Z"); assert.equal(result.resources.orders?.status,"incomplete");
});

test("29Next incremental failure releases through failure control without advancing checkpoint", async () => {
  let failed:any=null; let finishCalls=0;
  const client:any={apiVersion:"2024-04-01",async listOrders(){throw new Error("provider down")},async getOrder(){throw new Error("unused")},async listSubscriptions(){throw new Error("unused")},async getSubscription(){throw new Error("unused")},async listDisputes(){throw new Error("unused")},async getDispute(){throw new Error("unused")}};
  await assert.rejects(()=>runNext29IncrementalCycle({...scope,client,evidenceSink:sink(),persistence:allPersistence(),resources:["orders"],leaseOwner:"worker-1",now:()=>"2026-09-01T12:00:00Z",control:{async claim(){return{claimed:true,scheduleId:"s",enabled:true,successfulThrough:"2026-08-31T12:00:00Z",activeWindowStart:null,activeWindowEnd:null,resumeCursor:null}},heartbeat,async finish(){finishCalls++},async fail(input:any){failed=input}}}),/provider down/);
  assert.equal(finishCalls,0); assert.equal(failed.scheduleId,"s"); assert.equal(failed.errorCode,"Error");
});

test("29Next incremental cycle fails before provider read when lease heartbeat is lost", async()=>{
  let reads=0;
  const client:any={apiVersion:"2024-04-01",async listOrders(){reads++;return emptyPage()},async getOrder(){throw new Error("unused")},async listSubscriptions(){throw new Error("unused")},async getSubscription(){throw new Error("unused")},async listDisputes(){throw new Error("unused")},async getDispute(){throw new Error("unused")}};
  await assert.rejects(()=>runNext29IncrementalCycle({...scope,client,evidenceSink:sink(),persistence:allPersistence(),resources:["orders"],leaseOwner:"worker-1",now:()=>"2026-09-01T12:00:00Z",control:{async claim(){return{claimed:true,scheduleId:"s",enabled:true,successfulThrough:null,activeWindowStart:null,activeWindowEnd:null,resumeCursor:null}},async heartbeat(){return false},async finish(){throw new Error("unused")},async fail(){throw new Error("unused")}}}),/heartbeat failed/);
  assert.equal(reads,0);
});
