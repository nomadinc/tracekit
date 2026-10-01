import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const scheduler=readFileSync(new URL("../src/index.ts",import.meta.url),"utf8");

test("scheduled deep eligibility is independent of overlap last_enqueued cadence",()=>{
  const start=scheduler.indexOf("const overlapDue =",scheduler.indexOf("async eligibleJobs(now)"));
  const end=scheduler.indexOf("const mode =",start);
  assert.ok(start>0&&end>start);
  const block=scheduler.slice(start,end);
  assert.match(block,/overlapDue[\s\S]*isSyncScheduleDue/);
  assert.match(block,/deepDue = Boolean\(row\.next_deep_reconciliation_at/);
  const deepExpression=block.slice(block.indexOf("const deepDue"),block.indexOf("if (!overlapDue"));
  assert.doesNotMatch(deepExpression,/isSyncScheduleDue|last_enqueued_at/);
});

test("overlap cadence remains gated by last_enqueued_at",()=>{
  const start=scheduler.indexOf("const overlapDue =",scheduler.indexOf("async eligibleJobs(now)"));
  const block=scheduler.slice(start,scheduler.indexOf("const deepDue",start));
  assert.match(block,/isSyncScheduleDue\(\{ frequency: row\.sync_frequency, lastEnqueuedAt: row\.last_enqueued_at, now \}\)/);
});
