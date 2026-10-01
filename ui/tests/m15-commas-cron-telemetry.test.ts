import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route=readFileSync(new URL("../app/api/cron/commas-scheduler/route.ts",import.meta.url),"utf8");
const migration=readFileSync(new URL("../../supabase/migrations/20261001220000_commerce_cron_runtime_telemetry.sql",import.meta.url),"utf8");

test("Commas cron persists an invocation row before authorization branching",()=>{
  assert.match(route,/commercePersistenceRequest\("commerce_cron_runs"/);
  assert.ok(route.indexOf('commercePersistenceRequest("commerce_cron_runs"')<route.indexOf("if(!isAuthorized)"));
  assert.match(route,/authorized:isAuthorized/);
  assert.match(route,/scheduler_status:"not_authorized"/);
});

test("successful scheduler telemetry persists bounded dispatch counters",()=>{
  for(const field of["due_targets","attempted","completed","failed","deep_reconciliation_due","response_status"])assert.match(route,new RegExp(field));
  assert.match(route,/deployment_commit_sha/);
  assert.match(route,/deployment_git_ref/);
});

test("commerce cron telemetry is service-role only and indexed by provider/time",()=>{
  assert.match(migration,/create table if not exists public\.commerce_cron_runs/);
  assert.match(migration,/revoke all on table public\.commerce_cron_runs from public,anon,authenticated/);
  assert.match(migration,/grant select,insert,update on table public\.commerce_cron_runs to service_role/);
  assert.match(migration,/provider,started_at desc/);
});
