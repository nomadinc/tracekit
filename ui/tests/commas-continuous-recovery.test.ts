import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { firstRecoverableContinuousPage, summarizeContinuousCheckpointProgress } from "../lib/commerce/commas-continuous-worker";

const worker=readFileSync(new URL("../lib/commerce/commas-continuous-worker.ts",import.meta.url),"utf8");
const claim=readFileSync(new URL("../../supabase/migrations/050_continuous_commerce_intelligence_v1.sql",import.meta.url),"utf8");

test("continuous recovery starts at the first incomplete checkpoint and reuses verified Evidence",()=>{
  assert.match(worker,/firstRecoverableContinuousPage\(checkpointRows\)/);
  assert.match(worker,/String\(checkpoint\.state\|\|\"\"\)==="running"\?await replayEvidenceForPage/);
  assert.match(worker,/store\.verifyHash\(\{organizationId:input\.organizationId,storageReference,payloadHash\}\)/);
  assert.match(worker,/provider_attempts:pageRateLimit\.attempts/);
  assert.equal(firstRecoverableContinuousPage([{page:1,state:"completed"},{page:2,state:"running"},{page:4,state:"running"}]),2);
});

test("completed checkpoint rollup makes interrupted progress visible without terminal-only counters",()=>{
  const progress=summarizeContinuousCheckpointProgress([
    {state:"completed",metadata:{provider_attempts:1,new_records:100,updated_records:0,unchanged_records:0,evidence_reused:false}},
    {state:"completed",metadata:{provider_attempts:0,new_records:0,updated_records:0,unchanged_records:100,evidence_reused:true}},
    {state:"running",metadata:{}},
  ]);
  assert.deepEqual(progress,{pagesCompleted:2,providerRequests:1,recordsSeen:200,recordsCreated:100,recordsUpdated:0,recordsUnchanged:100,evidenceWrites:1,evidenceReuses:1});
  assert.match(worker,/pages_completed:durableProgress\.pagesCompleted/);
  assert.match(worker,/records_seen:durableProgress\.recordsSeen/);
});

test("existing lease RPC safely reclaims only expired running runs",()=>{
  assert.match(claim,/r\.status='running' and r\.lease_expires_at<now\(\)/);
  assert.match(claim,/r\.cancelled_at is null/);
  assert.match(claim,/p_lease_owner/);
});
