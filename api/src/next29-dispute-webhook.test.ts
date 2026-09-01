import assert from "node:assert/strict";
import test from "node:test";
import { createNext29DisputeWebhookHandler } from "./connectors/next29/dispute-webhook.ts";

const base = { organizationId:"org",connectionId:"conn",providerAccountId:"acct",eventId:"evt-1",eventType:"dispute.updated",apiVersion:"2024-04-01",object:"dispute",data:{id:77},evidence:{storageReference:"mem://evt",payloadHash:"hash",byteSize:10} };

test("29Next dispute webhook refreshes current provider detail before canonical processing", async () => {
  const calls:any[]=[];
  const handler=createNext29DisputeWebhookHandler({client:{async getDispute(id:any){calls.push(["get",id]);return{item:{id:77,type:"chargeback",status:"resolved",resolution:"won",amount:"67",currency:"USD",transaction:5001,order:"1001"},providerRequestId:null,correlationId:"c"}}},process:async(input)=>{calls.push(["process",input])}});
  await handler(base as any);
  assert.equal(calls[0][1],"77");
  assert.equal(calls[1][1].normalized.status,"resolved");
  assert.equal(calls[1][1].normalized.resolution,"won");
  assert.equal(calls[1][1].webhookEvidence.payloadHash,"hash");
});

test("29Next dispute webhook fails closed when webhook and current detail identities disagree", async () => {
  let processed=false;
  const handler=createNext29DisputeWebhookHandler({client:{async getDispute(){return{item:{id:78,type:"chargeback",status:"open"},providerRequestId:null,correlationId:"c"}}},process:async()=>{processed=true}});
  await assert.rejects(()=>handler(base as any),/identity does not match/);
  assert.equal(processed,false);
});
