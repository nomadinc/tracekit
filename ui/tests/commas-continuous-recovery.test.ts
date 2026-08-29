import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { evidenceOnlyCheckpointMetadata, evidenceOnlyLifetimeProgress, firstRecoverableContinuousPage, summarizeContinuousCheckpointProgress } from "../lib/commerce/commas-continuous-worker";

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
  assert.match(worker,/metadata:\{\.\.\.runMetadata/);
});

test("Evidence-only replay retains checkpoint lifetime accounting and records invocation work separately",()=>{
  const original={provider_attempts:1,new_records:67,updated_records:33,unchanged_records:0,evidence_reused:false,ordering_state:"unknown"};
  const replayed=evidenceOnlyCheckpointMetadata(original,{provider_attempts:0,new_records:0,updated_records:3,unchanged_records:97,evidence_reused:true,ordering_state:"newest_first"});
  assert.equal(replayed.provider_attempts,1);
  assert.equal(replayed.new_records,67);
  assert.equal(replayed.updated_records,33);
  assert.equal(replayed.unchanged_records,0);
  assert.equal(replayed.evidence_reused,false);
  assert.equal(replayed.ordering_state,"newest_first");
  assert.deepEqual({...replayed.evidence_only_replay as Record<string,unknown>,completed_at:undefined},{provider_attempts:0,new_records:0,updated_records:3,unchanged_records:97,evidence_reused:true,completed_at:undefined});
  assert.throws(()=>evidenceOnlyCheckpointMetadata({provider_attempts:1},{provider_attempts:0}),/requires lifetime checkpoint/);
});

test("Evidence-only terminalization preserves the claimed run lifetime counters across repeated replay",()=>{
  const lifetime={pages_completed:3,provider_request_count:3,records_seen:300,records_created:267,records_updated:33,records_unchanged:0,evidence_writes:3,evidence_reuses:0};
  const replayRollup={pagesCompleted:3,providerRequests:0,recordsSeen:300,recordsCreated:0,recordsUpdated:3,recordsUnchanged:297,evidenceWrites:0,evidenceReuses:3};
  const first=evidenceOnlyLifetimeProgress(lifetime,replayRollup);
  const second=evidenceOnlyLifetimeProgress({...lifetime,provider_request_count:first.providerRequests,records_seen:first.recordsSeen,records_created:first.recordsCreated,records_updated:first.recordsUpdated,records_unchanged:first.recordsUnchanged},replayRollup);
  assert.deepEqual(first,{pagesCompleted:3,providerRequests:3,recordsSeen:300,recordsCreated:267,recordsUpdated:33,recordsUnchanged:0,evidenceWrites:3,evidenceReuses:0});
  assert.deepEqual(second,first);
  assert.match(worker,/evidence_only_recovery_invocation:evidenceOnlyRecovery\?\{provider_requests:providerRequests/);
});

test("page completion rolls up from the in-memory checkpoint snapshot to reserve terminalization capacity",()=>{
  const loop=worker.slice(worker.indexOf("while(queueIndex<queue.length"),worker.indexOf("const now=new Date().toISOString()"));
  assert.match(loop,/checkpointRows\.findIndex/);
  assert.match(loop,/durableProgress=lifetimeProgress\|\|summarizeContinuousCheckpointProgress\(checkpointRows\)/);
  assert.doesNotMatch(loop,/summarizeContinuousCheckpointProgress\(await db\(/);
  assert.match(loop,/ordering_state:orderingObserver\.ordering/);
  assert.match(loop,/pagination_classification:orderingObserver\.paginationClassification/);
  assert.match(loop,/ordering_pages_observed:orderingObserver\.pagesObserved/);
  const terminal=worker.slice(worker.indexOf("const now=new Date().toISOString()"),worker.indexOf("const transitioned=",worker.indexOf("const now=new Date().toISOString()")));
  assert.match(terminal,/pages_completed:durableProgress\.pagesCompleted/);
  assert.match(terminal,/provider_request_count:durableProgress\.providerRequests/);
  assert.match(loop,/if\(!decision\.stop\) await db\(`commerce_sync_runs\?id=eq\.\$\{runId\}`/);
});

test("existing lease RPC safely reclaims only expired running runs",()=>{
  assert.match(claim,/r\.status='running' and r\.lease_expires_at<now\(\)/);
  assert.match(claim,/r\.cancelled_at is null/);
  assert.match(claim,/p_lease_owner/);
});
