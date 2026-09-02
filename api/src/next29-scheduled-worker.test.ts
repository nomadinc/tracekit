import assert from "node:assert/strict";
import test from "node:test";
import { runNext29ScheduledWorker } from "./connectors/next29/scheduled-worker.ts";

function page(){return{results:[],next:null,previous:null,providerRequestId:null,correlationId:"c",rateLimit:{limit:4,remaining:3,retryAfterMs:null}}}
function persistence(){return{async beginRun(){return{syncRunId:"run"}},async persistOrder(){},async persistSubscription(){},async persistDispute(){},async appendCheckpoint(){},async completeRun(){},async failRun(){}}}
function runtime(claimed=true, reads:{n:number}={n:0}){const p:any=persistence();return{client:{apiVersion:"2024-04-01",async listOrders(){reads.n++;return page()},async getOrder(){throw new Error("unused")},async listSubscriptions(){reads.n++;return page()},async getSubscription(){throw new Error("unused")},async listDisputes(){reads.n++;return page()},async getDispute(){throw new Error("unused")}},evidenceSink:{async putImmutable(input:any){return{storageReference:"mem://x",payloadHash:"h",byteSize:input.payload.byteLength}}},persistence:{orders:p,subscriptions:p,disputes:p},control:{async claim(){return{claimed,scheduleId:"s",enabled:claimed,successfulThrough:null,activeWindowStart:null,activeWindowEnd:null,resumeCursor:null}},async heartbeat(){return true},async finish(){},async fail(){}}} as any}
const target={scheduleId:"s",organizationId:"org",connectionId:"conn",providerAccountId:"acct",resource:"orders" as const};

test("29Next scheduled worker discovers due target and runs bounded incremental cycle",async()=>{
  let ensured=0;const reads={n:0};
  const result=await runNext29ScheduledWorker({workerId:"worker-1",now:()=>"2026-09-01T20:00:00Z",repository:{async ensureSchedules(){ensured++;return 3},async listDue(){return[target]}},async loadRuntime(){return runtime(true,reads)}});
  assert.equal(ensured,1);assert.equal(reads.n,1);assert.equal(result.completed,1);assert.equal(result.failed,0);assert.equal(result.ensuredSchedules,3);
});

test("29Next scheduled worker performs no provider read when discovered target loses claim race",async()=>{
  const reads={n:0};
  const result=await runNext29ScheduledWorker({workerId:"worker-1",now:()=>"2026-09-01T20:00:00Z",repository:{async ensureSchedules(){return 0},async listDue(){return[target]}},async loadRuntime(){return runtime(false,reads)}});
  assert.equal(reads.n,0);assert.equal(result.notClaimed,1);assert.equal(result.completed,0);
});

test("29Next scheduled worker isolates one target failure and continues remaining due work",async()=>{
  const second={...target,scheduleId:"s2",providerAccountId:"acct2"};let loads=0;
  const result=await runNext29ScheduledWorker({workerId:"worker-1",now:()=>"2026-09-01T20:00:00Z",repository:{async ensureSchedules(){return 0},async listDue(){return[target,second]}},async loadRuntime(t){loads++;if(t.providerAccountId==="acct")throw new TypeError("credential unavailable");return runtime(true)}});
  assert.equal(loads,2);assert.equal(result.failed,1);assert.equal(result.completed,1);assert.equal(result.results[0]?.errorCode,"TypeError");
});

test("29Next scheduled worker de-duplicates due targets and rejects unsafe batch bounds before execution",async()=>{
  let loads=0;
  const result=await runNext29ScheduledWorker({workerId:"worker-1",now:()=>"2026-09-01T20:00:00Z",repository:{async ensureSchedules(){return 0},async listDue(){return[target,{...target,scheduleId:"duplicate"}]}},async loadRuntime(){loads++;return runtime(true)}});
  assert.equal(loads,1);assert.equal(result.dueTargets,1);
  await assert.rejects(()=>runNext29ScheduledWorker({workerId:"worker-1",dueLimit:101,repository:{async ensureSchedules(){throw new Error("should not run")},async listDue(){return[]}},async loadRuntime(){return runtime(true)}}),/between 1 and 100/);
});
