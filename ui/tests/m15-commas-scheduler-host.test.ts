import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const worker=readFileSync(new URL("../lib/commerce/commas-scheduled-worker.ts",import.meta.url),"utf8");
const route=readFileSync(new URL("../app/api/cron/commas-scheduler/route.ts",import.meta.url),"utf8");
const vercel=readFileSync(new URL("../vercel.json",import.meta.url),"utf8");

test("M15 Commas scheduler is protected and durably invoked",()=>{
  assert.match(route,/CRON_SECRET/);
  assert.match(route,/runDueCommasSchedules\(\{limit:1\}\)/);
  assert.match(vercel,/\/api\/cron\/commas-scheduler/);
  assert.match(vercel,/\*\/5 \* \* \* \*/);
});

test("initial M15 host dispatches only due continuous shadow work",()=>{
  assert.match(worker,/next_overlap_at/);
  assert.match(worker,/mode:"continuous"/);
  assert.match(worker,/expectedScope:\{organizationId,connectionId,providerAccountId\}/);
  assert.match(worker,/deepReconciliationDue/);
  assert.doesNotMatch(worker,/mode:"deep_reconciliation"/);
});

test("scheduler requires tenant production control and no connection pause",()=>{
  assert.match(worker,/tracekit_production_controls\?organization_id=eq/);
  assert.match(worker,/capability=eq\.commerce_scheduler&activation_state=eq\.enabled/);
  assert.match(worker,/commerce_connection_pauses\?organization_id=eq/);
  assert.match(worker,/controls\.length!==1\|\|pauses\.length>0/);
});

test("successful cycle advances only overlap schedule and records completion",()=>{
  assert.match(worker,/nextScheduleTimes/);
  assert.match(worker,/completed:"continuous"/);
  assert.match(worker,/next_overlap_at:next\.nextOverlapAt/);
  assert.match(worker,/last_completed_at:new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(worker,/next_deep_reconciliation_at:next/);
});
