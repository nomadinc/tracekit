import assert from "node:assert/strict";
import test from "node:test";
import { runNext29HistoricalDisputes } from "./connectors/next29/dispute-historical-sync.ts";
import { createNext29DisputePersistence } from "./connectors/next29/dispute-repository.ts";
import type { Next29EvidenceSink } from "./connectors/next29/types.ts";

function raw(id: string) { return { id, type: "chargeback", status: "open", amount: "67.00", currency: "USD", happened_at: "2026-08-02T00:00:00Z", order: "1001", transaction: "5001" }; }
function evidence(): Next29EvidenceSink & { writes: any[] } { const writes: any[] = []; return { writes, async putImmutable(input) { writes.push(input); return { storageReference: `mem://${input.sourceObjectId}`, payloadHash: `hash-${input.sourceObjectId}`, byteSize: input.payload.byteLength }; } }; }
function persistence() { const calls: any[] = []; return { calls, async beginRun(i:any){calls.push(["begin",i]);return{syncRunId:"run-1"}},async persistDispute(i:any){calls.push(["dispute",i])},async appendCheckpoint(i:any){calls.push(["checkpoint",i])},async completeRun(i:any){calls.push(["complete",i])},async failRun(i:any){calls.push(["fail",i])} }; }

test("29Next bounded dispute ingestion persists full detail evidence and canonical input", async () => {
  const sink = evidence(); const repo = persistence();
  const client = { apiVersion: "2024-04-01", async listDisputes(){return{results:[{id:77}],next:null,previous:null,providerRequestId:null,correlationId:"c",rateLimit:{limit:4,remaining:3,retryAfterMs:null}}}, async getDispute(id:any){return{item:raw(String(id)),providerRequestId:null,correlationId:"c"}} };
  const result = await runNext29HistoricalDisputes({ organizationId:"org",connectionId:"conn",providerAccountId:"acct",client,evidenceSink:sink,persistence:repo });
  assert.equal(result.records,1); assert.equal(sink.writes[0].sourceObjectType,"next29_dispute");
  const write=repo.calls.find(([k])=>k==="dispute")[1]; assert.equal(write.normalized.providerTransactionId,"5001");
});

test("29Next dispute ingestion returns durable resume cursor at bounds", async () => {
  const repo=persistence(); const client={apiVersion:"2024-04-01",async listDisputes(){return{results:[{id:1}],next:"https://demo.29next.store/api/admin/disputes/?cursor=next-1",previous:null,providerRequestId:null,correlationId:"c",rateLimit:{limit:4,remaining:3,retryAfterMs:null}}},async getDispute(id:any){return{item:raw(String(id)),providerRequestId:null,correlationId:"c"}}};
  const result=await runNext29HistoricalDisputes({organizationId:"org",connectionId:"conn",providerAccountId:"acct",client,evidenceSink:evidence(),persistence:repo,maxDisputes:1});
  assert.equal(result.hasMore,true); assert.equal(result.resumeCursor,"next-1");
});

test("29Next dispute ingestion fails closed on list detail identity mismatch", async () => {
  const repo=persistence(); const client={apiVersion:"2024-04-01",async listDisputes(){return{results:[{id:1}],next:null,previous:null,providerRequestId:null,correlationId:"c",rateLimit:{limit:4,remaining:3,retryAfterMs:null}}},async getDispute(){return{item:raw("2"),providerRequestId:null,correlationId:"c"}}};
  await assert.rejects(()=>runNext29HistoricalDisputes({organizationId:"org",connectionId:"conn",providerAccountId:"acct",client,evidenceSink:evidence(),persistence:repo}),/identity does not match/);
  assert.equal(repo.calls.filter(([k])=>k==="fail").length,1);
});

test("29Next dispute persistence stores API observation before direct reconciliation and lifecycle append", async () => {
  const calls:string[]=[];
  const p=createNext29DisputePersistence({
    async createHistoricalRun(){return{id:"run-1"}},
    async appendHistoricalCheckpoint(){},
    async finishHistoricalRun(){},
    async failHistoricalRun(){},
    async ensureDisputeEvidence(){calls.push("evidence");return{evidenceId:"ev"}},
    async ensureDisputeObservation(input){calls.push("observation");assert.equal(input.sourceKind,"api");assert.equal(input.providerDisputeId,"77");return{observationId:"obs-1"}},
    async resolveCanonicalOrder(input){calls.push("resolve");assert.equal(input.providerTransactionId,"5001");return{canonicalOrderId:"order-1",state:"matched" as const,matchedBy:"transaction" as const}},
    async upsertProviderDispute(input){calls.push("dispute");assert.equal(input.canonicalOrderId,"order-1");assert.equal(input.observationId,"obs-1");return{disputeId:"d-1",lifecycleChanged:true}},
    async appendDisputeLifecycle(input){calls.push("lifecycle");assert.equal(input.observationId,"obs-1")},
  });
  await p.persistDispute({organizationId:"org",connectionId:"conn",providerAccountId:"acct",syncRunId:"run-1",normalized:{providerDisputeId:"77",type:"chargeback",status:"open",resolution:null,resolutionOtherMessage:null,amount:67,currency:"USD",reportAmount:null,reportCurrency:null,arn:null,caseNumber:null,providerOrderId:"1001",providerTransactionId:"5001",sourceCreatedAt:null,happenedAt:"2026-08-02T00:00:00.000Z",metadata:{}},evidence:{storageReference:"mem",payloadHash:"hash",byteSize:1},rawDispute:raw("77")});
  assert.deepEqual(calls,["evidence","observation","resolve","dispute","lifecycle"]);
});
