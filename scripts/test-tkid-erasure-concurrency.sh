#!/usr/bin/env bash
set -euo pipefail

erasure_db_url="${TRACEKIT_LOCAL_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
erasure_tmp_dir="$(mktemp -d)"
trap 'rm -rf "$erasure_tmp_dir"' EXIT

psql "$erasure_db_url" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
insert into public.tracekit_accounts(id,account_type,name,status) values('d6300000-0000-4000-8000-000000000001','client','Concurrent Erasure Account','active');
insert into public.tracekit_organizations(id,owning_account_id,name,status) values('d6300000-0000-4000-8000-000000000002','d6300000-0000-4000-8000-000000000001','Concurrent Erasure Org','active');
insert into public.tracekit_business_contexts(id,account_id,organization_id,name,status) values('concurrent-erasure-context','d6300000-0000-4000-8000-000000000001','d6300000-0000-4000-8000-000000000002','Concurrent Erasure','active');
insert into public.tkid_sources(id,account_id,organization_id,business_context_id,public_source_id,environment,status,allowed_origins) values('d6300000-0000-4000-8000-000000000003','d6300000-0000-4000-8000-000000000001','d6300000-0000-4000-8000-000000000002','concurrent-erasure-context','tksrc_concurrenterase01','production','shadow',array['https://erase.example']);
insert into public.tkid_journeys(id,account_id,organization_id,business_context_id,source_id,started_at,expires_at,state,privacy_mode,source_version,normalizer_version) values('d6300000-0000-4000-8000-000000000004','d6300000-0000-4000-8000-000000000001','d6300000-0000-4000-8000-000000000002','concurrent-erasure-context','d6300000-0000-4000-8000-000000000003','2026-09-01','2026-09-01 01:00','completed','essential','v1','v1');
insert into public.tkid_privacy_execution_controls(organization_id,source_id,execution_state) values('d6300000-0000-4000-8000-000000000002','d6300000-0000-4000-8000-000000000003','enabled');
insert into public.tkid_erasure_runs(id,organization_id,source_id,journey_id,policy_id,actor_context,reason_code,status,next_attempt_at) values('d6300000-0000-4000-8000-000000000005','d6300000-0000-4000-8000-000000000002','d6300000-0000-4000-8000-000000000003','d6300000-0000-4000-8000-000000000004','tkerase_concurrency','retention_worker','retention_expired','queued','2026-09-26');
SQL

claim_sql="select coalesce((select run_id::text from public.claim_tkid_erasure_run_v1"
psql "$erasure_db_url" -At -v ON_ERROR_STOP=1 -c "$claim_sql('erasure-worker-a','2026-09-26 01:00')), 'none');" >"$erasure_tmp_dir/one" &
pid_one=$!
psql "$erasure_db_url" -At -v ON_ERROR_STOP=1 -c "$claim_sql('erasure-worker-b','2026-09-26 01:00')), 'none');" >"$erasure_tmp_dir/two" &
pid_two=$!
wait "$pid_one"
wait "$pid_two"

claimed="$(sort "$erasure_tmp_dir/one" "$erasure_tmp_dir/two")"
expected=$'d6300000-0000-4000-8000-000000000005\nnone'
if [[ "$claimed" != "$expected" ]]; then
  echo "unexpected concurrent erasure claims: $claimed" >&2
  exit 1
fi

run_count="$(psql "$erasure_db_url" -At -v ON_ERROR_STOP=1 -c "select count(*) from public.tkid_erasure_runs where id='d6300000-0000-4000-8000-000000000005' and status='running' and lease_owner in ('erasure-worker-a','erasure-worker-b');")"
if [[ "$run_count" != "1" ]]; then
  echo "erasure run was not exclusively leased: $run_count" >&2
  exit 1
fi

psql "$erasure_db_url" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
delete from public.tkid_erasure_runs where id='d6300000-0000-4000-8000-000000000005';
delete from public.tkid_privacy_execution_controls where organization_id='d6300000-0000-4000-8000-000000000002' and source_id='d6300000-0000-4000-8000-000000000003';
delete from public.tkid_journeys where id='d6300000-0000-4000-8000-000000000004';
delete from public.tkid_sources where id='d6300000-0000-4000-8000-000000000003';
delete from public.tracekit_business_contexts where id='concurrent-erasure-context';
delete from public.tracekit_organizations where id='d6300000-0000-4000-8000-000000000002';
delete from public.tracekit_accounts where id='d6300000-0000-4000-8000-000000000001';
SQL

echo "PASS: concurrent erasure workers leased the run exactly once"
