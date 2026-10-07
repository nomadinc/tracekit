import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SCHEDULED_DEEP_INVOCATION_REQUEST_MAX, scheduledDeepInvocationCeiling } from "../lib/commerce/scheduled-deep-contract";

const scheduler=readFileSync(new URL("../../api/src/index.ts",import.meta.url),"utf8");
const worker=readFileSync(new URL("../lib/commerce/commas-continuous-worker.ts",import.meta.url),"utf8");
const migration=readFileSync(new URL("../../supabase/migrations/20261001222109_m15_resumable_scheduled_deep_chunks.sql",import.meta.url),"utf8");
const completionIdentityMigration=readFileSync(new URL("../../supabase/migrations/20261002040259_fix_scheduled_deep_completion_identity.sql",import.meta.url),"utf8");

test("M15 deep chunks have a strict per-invocation provider ceiling",()=>{
  assert.equal(SCHEDULED_DEEP_INVOCATION_REQUEST_MAX,40);
  assert.equal(scheduledDeepInvocationCeiling(800,0),40);
  assert.equal(scheduledDeepInvocationCeiling(800,40),80);
  assert.equal(scheduledDeepInvocationCeiling(800,790),800);
  assert.equal(scheduledDeepInvocationCeiling(800,800),800);
});

test("deep due state cannot be starved by overlap last_enqueued cadence",()=>{
  const start=scheduler.indexOf("const overlapDue =",scheduler.indexOf("async eligibleJobs(now)"));
  const end=scheduler.indexOf("const mode =",start);
  const block=scheduler.slice(start,end);
  assert.match(block,/overlapDue[\s\S]*isSyncScheduleDue/);
  const deep=block.slice(block.indexOf("const deepDue"),block.indexOf("if (!overlapDue"));
  assert.doesNotMatch(deep,/isSyncScheduleDue|last_enqueued_at/);
});

test("scheduled deep identity remains stable and paused run is redispatchable",()=>{
  assert.match(scheduler,/scheduleVersion\}:\$\{mode\}/);
  assert.match(scheduler,/String\(existing\.status\)==="paused"\?"reserved":"duplicate"/);
  assert.match(scheduler,/neq\("scheduler_idempotency_key",message\.scheduler_identity\)/);
});

test("worker resumes after highest completed page and pauses at chunk boundary",()=>{
  assert.match(worker,/scheduledDeepResumePage=scheduledDeepSchedule&&completedPages\.length\?Math\.max\(\.\.\.completedPages\)\+1:1/);
  assert.match(worker,/scheduledDeepInvocationCeilingValue/);
  assert.match(worker,/stoppingReason="scheduled_deep_chunk_boundary"/);
  assert.match(worker,/rpc\/pause_commerce_sync_run/);
  assert.match(worker,/\["bounded_deep_reconciliation_proof","scheduled_deep_chunk_boundary"\]\.includes\(stoppingReason\)/);
});

test("pause RPC is lease-owner safe and non-terminal",()=>{
  assert.match(migration,/status=\'paused\'/);
  assert.match(migration,/status=\'running\'/);
  assert.match(migration,/lease_owner=p_lease_owner/);
  assert.match(migration,/lease_owner=null/);
  assert.doesNotMatch(migration,/completed_at\s*=/);
});


test("derived investigation invalidation cannot fail a durably checkpointed chunk",()=>{
  const start=worker.indexOf("if(changedRows.length)");
  const end=worker.indexOf("const scheduledDeepChunkBoundary",start);
  assert.ok(start>0&&end>start);
  const block=worker.slice(start,end);
  assert.match(block,/try\s*\{/);
  assert.match(block,/mark_investigation_new_evidence/);
  assert.match(block,/commerce\.investigation\.invalidation_failed/);
  assert.match(block,/catch\s*\{/);
});


test("scheduled deep chunk preserves normal continuous boundary state",()=>{
  const start=worker.indexOf('commerce_continuous_sync_state?on_conflict=connection_id,provider_account_id,resource');
  const end=worker.indexOf('if(changedRows.length)',start);
  assert.ok(start>0&&end>start);
  const block=worker.slice(start,end);
  assert.match(block,/recent_source_ids:boundedDeepProof\?priorState\?\.recent_source_ids\?\?\[\]/);
  assert.match(block,/page_fingerprints:boundedDeepProof\?priorState\?\.page_fingerprints\?\?\{\}/);
  assert.match(block,/last_stability_boundary:boundedDeepProof\?priorState\?\.last_stability_boundary/);
  assert.match(block,/status:boundedDeepProof\?priorState\?\.status/);
  assert.match(block,/warnings:boundedDeepProof\?priorState\?\.warnings/);
});


test("scheduled deep conservative stops remain resumable",()=>{
  assert.match(worker,/scheduledDeepResumableStop=Boolean\(scheduledDeepSchedule\)&&deeperReconciliationRequired&&stoppingReason!=="bounded_deep_reconciliation_proof"/);
  const start=worker.indexOf("const trueScheduledDeepSuccess");
  const end=worker.indexOf("const transitionApplied",start);
  assert.ok(start>0&&end>start);
  const block=worker.slice(start,end);
  assert.match(block,/scheduledDeepResumableStop/);
  assert.match(block,/rpc\/pause_commerce_sync_run/);
  assert.match(block,/p_reason:stoppingReason/);
});


test("deep completion accepts exactly the stable resumable scheduler identity",()=>{
  assert.match(scheduler,/scheduleVersion\}:\$\{mode\}/);
  assert.match(completionIdentityMigration,/v_expected_identity := p_schedule_id::text\|\|':v'\|\|p_expected_schedule_version::text\|\|':deep_reconciliation'/);
  assert.match(completionIdentityMigration,/scheduler_idempotency_key is distinct from v_expected_identity/);
  assert.doesNotMatch(completionIdentityMigration,/deep_reconciliation:'|v_expected_identity_prefix|like v_expected_identity/);
});
