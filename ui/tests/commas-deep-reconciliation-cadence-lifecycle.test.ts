import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration=readFileSync(new URL("../../supabase/migrations/20260831045228_commas_deep_reconciliation_cadence_lifecycle.sql",import.meta.url),"utf8");
const scheduler=readFileSync(new URL("../../api/src/index.ts",import.meta.url),"utf8");
const queue=readFileSync(new URL("../../api/src/continuous-commerce-cloudflare.ts",import.meta.url),"utf8");
const runtime=readFileSync(new URL("../../api/continuous-runtime/src/index.ts",import.meta.url),"utf8");
const worker=readFileSync(new URL("../lib/commerce/commas-continuous-worker.ts",import.meta.url),"utf8");

test("cadence migration adds a durable database-managed schedule version",()=>{
  assert.match(migration,/add column schedule_version bigint not null default 1/);
  assert.match(migration,/new\.schedule_version := old\.schedule_version \+ 1/);
  assert.match(migration,/raise exception 'schedule version is managed'/);
  assert.doesNotMatch(migration,/last_enqueued_at[\s\S]{0,200}old\.last_enqueued_at/);
});

test("one-time initialization is exact-scope, version guarded, and audited",()=>{
  for(const contract of ["initialize_commas_deep_reconciliation_schedule_v1","p_organization_id","p_connection_id","p_provider_account_id","p_schedule_id","p_expected_schedule_version","p_requested_first_due_at","p_authenticated_identity_id","p_operator_reason","schedule already initialized","stale schedule version","commerce.deep_reconciliation_schedule_initialized"])assert.match(migration,new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  assert.match(migration,/c\.provider='commas'.*c\.status='connected'.*a\.status='active'/s);
  assert.match(migration,/set next_deep_reconciliation_at=p_requested_first_due_at/);
  assert.doesNotMatch(migration,/set next_deep_reconciliation_at\s*=\s*now\(\)/);
});

test("only a proven scheduled provider-history completion advances cadence atomically",()=>{
  for(const contract of ["complete_scheduled_commas_deep_reconciliation_v1","provider_history_boundary","scheduled_deep","schedule_id","schedule_version","last_deep_reconciliation_at=v_completed_at","next_deep_reconciliation_at=v_completed_at+deep_reconciliation_interval","commerce.deep_reconciliation_schedule_advanced"])assert.match(migration,new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  assert.match(migration,/v_run\.status <> 'running'/);
  assert.match(migration,/coalesce\(v_run\.warnings_count,0\) <> 0/);
  assert.match(migration,/coalesce\(v_run\.records_failed,0\) <> 0/);
  for(const rejected of ["bounded_deep_reconciliation_proof","stable_known_boundary"])assert.doesNotMatch(migration,new RegExp(`stopping_reason[^;]{0,80}'${rejected}'`));
});

test("scheduled message version survives scheduler queue runtime and worker",()=>{
  assert.match(scheduler,/schedule_version/);
  assert.match(scheduler,/v\$\{scheduleVersion\}:\$\{mode\}/);
  assert.match(queue,/schedule_version:job\.scheduleVersion/);
  assert.match(queue,/Number\.isSafeInteger\(v\.schedule_version\)/);
  assert.match(runtime,/scheduledDeepSchedule:message\.scheduled_deep===true\?\{scheduleId:message\.schedule_id!,scheduleVersion:message\.schedule_version!\}/);
  assert.match(worker,/p_expected_schedule_version:scheduledDeepSchedule!\.scheduleVersion/);
});

test("incomplete runs retain due cadence and ordinary sync stays isolated",()=>{
  assert.match(worker,/trueScheduledDeepSuccess=.*status==="completed"&&stoppingReason==="provider_history_boundary"&&!deeperReconciliationRequired&&warnings===0&&recordsFailed===0/);
  assert.match(worker,/trueScheduledDeepSuccess[\s\S]{0,600}complete_scheduled_commas_deep_reconciliation_v1[\s\S]{0,600}transition_commerce_sync_run/);
  assert.match(scheduler,/mode==="deep_reconciliation"\?`\$\{row\.id\}:v\$\{scheduleVersion\}/);
  assert.match(scheduler,/:`\$\{row\.id\}:\$\{mode\}:\$\{cadenceWindow\}`/);
  assert.match(worker,/boundedDeepProof\?priorState\?\.warnings/);
});

test("control operations are service-role-only SECURITY INVOKER",()=>{
  assert.equal((migration.match(/security invoker/gi)||[]).length,3);
  for(const role of ["public","anon","authenticated","authenticator"])assert.match(migration,new RegExp(`revoke all[^;]+${role}`,"i"));
  assert.equal((migration.match(/grant execute[^;]+to service_role/gi)||[]).length,2);
});
