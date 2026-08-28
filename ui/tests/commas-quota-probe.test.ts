import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { COMMAS_QUOTA_OBSERVATION_MAX_AGE_MS, FIXED_REDELIVERY_CONNECTION_ID, FIXED_REDELIVERY_PROVIDER_ACCOUNT_ID, FIXED_REDELIVERY_RUN_ID, fixedRedeliveryQuotaEligibility, isFreshCommasQuotaObservation, persistCommasQuotaObservation, persistenceDiagnostic } from "../lib/commerce/commas-continuous-worker.ts";

test("quota observation freshness is explicit and fail-closed", () => {
  const now = Date.parse("2026-08-24T12:00:00.000Z");
  assert.equal(COMMAS_QUOTA_OBSERVATION_MAX_AGE_MS, 15 * 60 * 1000);
  assert.equal(isFreshCommasQuotaObservation("2026-08-24T11:50:01.000Z", now), true);
  assert.equal(isFreshCommasQuotaObservation("2026-08-24T11:44:59.000Z", now), false);
  assert.equal(isFreshCommasQuotaObservation(null, now), false);
});

test("quota probe is one-request, state-only, and never enters normalization", () => {
  const source = readFileSync(new URL("../lib/commerce/commas-continuous-worker.ts", import.meta.url), "utf8");
  const start = source.indexOf("export async function runCommasQuotaProbe");
  const end = source.indexOf("async function scopedConnection", start);
  const probe = source.slice(start, end);
  assert.match(probe, /fetchProviderPage\(scope\.secret, 1, 1/);
  assert.match(probe, /providerRequests: 1/);
  assert.match(probe, /operator_quota_probe/);
  assert.doesNotMatch(probe, /normalizeCommasTransaction|evidenceForPage|commerce_sync_runs.*POST|enqueue_commerce/);
});

test("stranded recovery quota mode is explicit and fixed-scope",()=>{
  const source=readFileSync(new URL("../lib/commerce/commas-continuous-worker.ts",import.meta.url),"utf8");
  const probe=source.slice(source.indexOf("export async function runCommasQuotaProbe"),source.indexOf("async function scopedConnection"));
  assert.match(probe,/forStrandedRecovery/);
  assert.match(source,/STRANDED_RECOVERY_RUN_ID = "9c8731d7-1dae-4844-a7ce-0b6fccea170e"/);
  assert.match(probe,/operator_recovery_dispatched/);
  assert.match(probe,/continuous%3Apage%3A4%3Aper_page%3A100/);
  assert.match(probe,/status=in\.\(queued,running,paused\).*id=neq\.\$\{STRANDED_RECOVERY_RUN_ID\}/);
  assert.match(probe,/operator_quota_probe_stranded_recovery/);
  assert.match(readFileSync(new URL("../scripts/probe-commas-quota.ts",import.meta.url),"utf8"),/--for-stranded-recovery/);
  assert.doesNotMatch(probe,/commerce_sync_runs.*POST|normalizeCommasTransaction|evidenceForPage|enqueue_commerce/);
});

test("fixed redelivery quota refresh excludes only its pristine target and has no dispatch or run mutation",()=>{
  const source=readFileSync(new URL("../lib/commerce/commas-continuous-worker.ts",import.meta.url),"utf8");
  const fixed=source.slice(source.indexOf("export async function runFixedRedeliveryQuotaRefresh"),source.indexOf("export async function runCommasQuotaProbe"));
  assert.match(fixed,/status=in\.\(queued,running,paused\)&id=neq\.\$\{FIXED_REDELIVERY_RUN_ID\}/);
  assert.match(fixed,/commerce_normal_acceptance_redelivery_markers/);
  assert.match(fixed,/fetchProviderPage\(scope\.secret,1,1,[\s\S]*,1\)/);
  assert.match(fixed,/operator_quota_probe_fixed_redelivery/);
  assert.match(fixed,/JSON\.stringify\(after\)!==runSnapshot/);
  assert.equal(fixed.match(/fetchProviderPage\(/g)?.length,1);
  assert.doesNotMatch(fixed,/continuous_commerce|\.send\(|normalizeCommasTransaction|evidenceForPage|commerce_sync_runs.*(?:POST|PATCH|DELETE)|claim_normal_acceptance_redelivery/);
  const generic=source.slice(source.indexOf("export async function runCommasQuotaProbe"),source.indexOf("type QuotaObservation"));
  assert.match(generic,/status=in\.\(queued,running,paused\)&select=id&limit=1/);
  assert.match(generic,/Quota probe has a conflicting active run/);
  assert.doesNotMatch(generic,/FIXED_REDELIVERY_RUN_ID/);
});

test("fixed redelivery quota eligibility rejects every unsafe production-state variant",()=>{
  const scope={organizationId:"org",connectionId:FIXED_REDELIVERY_CONNECTION_ID,providerAccountId:FIXED_REDELIVERY_PROVIDER_ACCOUNT_ID};
  const run={id:FIXED_REDELIVERY_RUN_ID,organization_id:"org",connection_id:FIXED_REDELIVERY_CONNECTION_ID,provider_account_id:FIXED_REDELIVERY_PROVIDER_ACCOUNT_ID,status:"queued",mode:"continuous",sync_type:"transactions",started_at:null,completed_at:null,lease_owner:null,lease_expires_at:null,pages_completed:0,provider_request_count:0,records_seen:0,scheduler_idempotency_key:"operator-normal-continuous-acceptance-5:key",metadata:{normal_acceptance:true,normal_acceptance_follow_up:"five_page",follow_up_of:"b1547be9-31aa-4487-9c08-796f6fc49005",shadow_only:true,acceptance_cycle:true,dispatch_source:"operator_one_shot",max_pages:5,per_page:100,request_key:"key"}};
  const base={run,scope,checkpoints:[],conflictingRuns:[],markers:[],schedule:{enabled:false,sync_frequency:"hourly",activation_state:"disabled"},paused:[],liveActivation:[],schedulerControls:[]};
  assert.equal(fixedRedeliveryQuotaEligibility(base),true);
  for(const patch of [{status:"running"},{started_at:"now"},{lease_owner:"worker"},{lease_expires_at:"later"},{provider_request_count:1},{records_seen:1},{metadata:{...run.metadata,max_pages:3}},{metadata:{...run.metadata,normal_acceptance:false}}])assert.equal(fixedRedeliveryQuotaEligibility({...base,run:{...run,...patch}}),false);
  for(const patch of [{checkpoints:[{}]},{conflictingRuns:[{}]},{markers:[{}]},{paused:[{}]},{liveActivation:[{}]},{schedulerControls:[{}]},{schedule:{...base.schedule,enabled:true}}])assert.equal(fixedRedeliveryQuotaEligibility({...base,...patch}),false);
});

test("078 recovery RPC consumes the same fresh quota floor used by the probe",()=>{
  const migration=readFileSync(new URL("../../supabase/migrations/078_requeue_stranded_operator_one_shot.sql",import.meta.url),"utf8");
  assert.match(migration,/quota_observed_at is not null and quota_observed_at >= now\(\) - interval '15 minutes'/);
  assert.match(migration,/v_quota - 8 < coalesce\(v_schedule\.quota_minimum_remaining,1000\)/);
});

test("quota observation updates the existing continuous state row without an upsert insert", async () => {
  const calls: Array<{path:string;init?:RequestInit}> = [];
  const result = await persistCommasQuotaObservation({accountId:"a",organizationId:"o",connectionId:"c",providerAccountId:"p",quotaLimit:10000,quotaRemaining:9980,quotaReset:"2026-08-24T13:00:00Z",observedAt:"2026-08-24T12:00:00Z"}, async (path,init) => {
    calls.push({path,init});
    return [{id:"state"}];
  });
  assert.equal(result.mode, "updated_existing");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init?.method, "PATCH");
  assert.match(calls[0].path, /connection_id=eq\.c/);
  assert.match(String(calls[0].init?.body), /quota_remaining/);
});

test("quota observation creates a schema-complete state row only when absent", async () => {
  const calls: Array<{path:string;init?:RequestInit}> = [];
  const result = await persistCommasQuotaObservation({accountId:"a",organizationId:"o",connectionId:"c",providerAccountId:"p",quotaLimit:null,quotaRemaining:9980,quotaReset:null,observedAt:"2026-08-24T12:00:00Z"}, async (path,init) => {
    calls.push({path,init});
    return calls.length === 1 ? [] : [{id:"created"}];
  });
  assert.equal(result.mode, "created_state");
  assert.equal(calls.length, 2);
  const body = JSON.parse(String(calls[1].init?.body)) as Record<string, unknown>;
  assert.equal(body.normalizer_version, "commas-transaction-v1");
  assert.equal(body.evidence_contract_version, "commerce-provider-raw-v1");
  assert.deepEqual(body.recent_source_ids, []);
  assert.deepEqual(body.warnings, []);
});

test("persistence diagnostics are sanitized and quota persistence does not refetch", () => {
  const source = readFileSync(new URL("../lib/commerce/commas-continuous-worker.ts", import.meta.url), "utf8");
  const persistenceStart = source.indexOf("export async function persistCommasQuotaObservation");
  const persistence = source.slice(persistenceStart, source.indexOf("async function scopedConnection", persistenceStart));
  assert.doesNotMatch(persistence, /fetchProviderPage|fetch\(/);
  assert.match(source, /status:response\.status/);
  assert.match(source, /code:safePersistenceText\(body\.code/);
  assert.match(source, /table:path\.split/);
});

test("PostgREST failures expose only bounded persistence diagnostics", () => {
  const diagnostic = persistenceDiagnostic(400, "commerce_continuous_sync_state?on_conflict=connection_id,provider_account_id,resource", "POST", {
    code: "PGRST204", message: "Column was not found", details: "schema cache", hint: "refresh schema",
    secret: "must-not-appear", email: "person@example.com",
  });
  assert.deepEqual(diagnostic, {
    status:400, code:"PGRST204", message:"Column was not found", detail:"schema cache", hint:"refresh schema",
    table:"commerce_continuous_sync_state", operation:"POST",
  });
  assert.doesNotMatch(JSON.stringify(diagnostic), /secret|example\.com/);
});
