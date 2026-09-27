#!/usr/bin/env bash
set -euo pipefail

recovery_db_url="${TRACEKIT_LOCAL_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
recovery_tmp_dir="$(mktemp -d)"
trap 'rm -rf "$recovery_tmp_dir"' EXIT

psql "$recovery_db_url" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
insert into public.tracekit_accounts(id,account_type,name,status) values('d6400000-0000-4000-8000-000000000001','client','Concurrent Recovery Account','active');
insert into public.tracekit_organizations(id,owning_account_id,name,status) values('d6400000-0000-4000-8000-000000000002','d6400000-0000-4000-8000-000000000001','Concurrent Recovery Org','active');
insert into public.tracekit_business_contexts(id,account_id,organization_id,name,status) values('concurrent-recovery-context','d6400000-0000-4000-8000-000000000001','d6400000-0000-4000-8000-000000000002','Concurrent Recovery','active');
insert into public.tkid_sources(id,account_id,organization_id,business_context_id,public_source_id,environment,status,allowed_origins,proof_max_journeys,proof_max_events,proof_starts_at,proof_ends_at,ingestion_state) values('d6400000-0000-4000-8000-000000000003','d6400000-0000-4000-8000-000000000001','d6400000-0000-4000-8000-000000000002','concurrent-recovery-context','tksrc_concurrentrecover1','production','shadow',array['https://recovery-concurrency.example'],50,1000,'2026-09-26','2026-09-28','stopped');
insert into public.tkid_source_origins(id,account_id,organization_id,business_context_id,source_id,canonical_origin,role,lifecycle_status,verification_state,verified_at) values('d6400000-0000-4000-8000-000000000004','d6400000-0000-4000-8000-000000000001','d6400000-0000-4000-8000-000000000002','concurrent-recovery-context','d6400000-0000-4000-8000-000000000003','https://recovery-concurrency.example','frontend','active','verified','2026-09-25');
insert into public.tkid_journeys(id,account_id,organization_id,business_context_id,source_id,started_origin_id,started_origin,started_at,expires_at,state,completeness,privacy_mode,source_version,normalizer_version) values('d6400000-0000-4000-8000-000000000005','d6400000-0000-4000-8000-000000000001','d6400000-0000-4000-8000-000000000002','concurrent-recovery-context','d6400000-0000-4000-8000-000000000003','d6400000-0000-4000-8000-000000000004','https://recovery-concurrency.example','2026-09-26 01:00','2026-09-26 03:00','active','partial','essential','tkid-sdk-v1','tkid-normalizer-v1');
insert into public.tkid_browser_sessions(id,organization_id,journey_id,source_id,started_at,last_seen_at,expires_at) values('d6400000-0000-4000-8000-000000000006','d6400000-0000-4000-8000-000000000002','d6400000-0000-4000-8000-000000000005','d6400000-0000-4000-8000-000000000003','2026-09-26 01:00','2026-09-26 01:00','2026-09-26 01:30');
insert into public.tkid_proof_event_claims(id,organization_id,source_id,origin_id,journey_id,event_id,claimed_at) values('d6400000-0000-4000-8000-000000000007','d6400000-0000-4000-8000-000000000002','d6400000-0000-4000-8000-000000000003','d6400000-0000-4000-8000-000000000004','d6400000-0000-4000-8000-000000000005','d6400000-0000-4000-8000-000000000008','2026-09-26 01:01');
with payload as (
  select jsonb_build_object('event_id','d6400000-0000-4000-8000-000000000008','event_name','journey_started','schema_version',1,'occurred_at','2026-09-26T01:01:00.000Z','journey_id','d6400000-0000-4000-8000-000000000005','browser_session_id','d6400000-0000-4000-8000-000000000006','privacy_mode','essential','received_at','2026-09-26T01:01:01.000Z','normalizer_version','tkid-normalizer-v1') value
)
insert into public.tkid_event_evidence(id,organization_id,source_id,origin_id,observed_origin,event_id,evidence_hash,schema_version,bounded_payload,received_at)
select 'd6400000-0000-4000-8000-000000000009','d6400000-0000-4000-8000-000000000002','d6400000-0000-4000-8000-000000000003','d6400000-0000-4000-8000-000000000004','https://recovery-concurrency.example','d6400000-0000-4000-8000-000000000008',encode(extensions.digest(public.tkid_canonical_json_v1(value-'received_at'-'normalizer_version'),'sha256'),'hex'),1,value,'2026-09-26T01:01:01.000Z' from payload;
SQL

recovery_sql="select recovery_state from public.recover_interrupted_tkid_event_v1('d6400000-0000-4000-8000-000000000002','d6400000-0000-4000-8000-000000000003','d6400000-0000-4000-8000-000000000008','concurrent recovery'"
psql "$recovery_db_url" -At -v ON_ERROR_STOP=1 -c "$recovery_sql,'recovery-race-a','recover-interrupted-tkid-event');" >"$recovery_tmp_dir/one" &
pid_one=$!
psql "$recovery_db_url" -At -v ON_ERROR_STOP=1 -c "$recovery_sql,'recovery-race-b','recover-interrupted-tkid-event');" >"$recovery_tmp_dir/two" &
pid_two=$!
wait "$pid_one"
wait "$pid_two"

states="$(sort "$recovery_tmp_dir/one" "$recovery_tmp_dir/two")"
if [[ "$states" != $'already_recovered\nrecovered' ]]; then
  echo "unexpected concurrent recovery states: $states" >&2
  exit 1
fi

counts="$(psql "$recovery_db_url" -At -v ON_ERROR_STOP=1 -c "select concat((select count(*) from public.tkid_events where id='d6400000-0000-4000-8000-000000000008'),':',(select count(*) from public.tkid_proof_event_claims where event_id='d6400000-0000-4000-8000-000000000008'),':',(select count(*) from public.tkid_event_evidence where event_id='d6400000-0000-4000-8000-000000000008'),':',(select count(*) from public.tracekit_audit_events where action='tkid.event_persistence_recovered' and target_id='d6400000-0000-4000-8000-000000000008'));" )"
if [[ "$counts" != "1:1:1:1" ]]; then
  echo "concurrent recovery duplicated durable state: $counts" >&2
  exit 1
fi

psql "$recovery_db_url" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
delete from public.tracekit_audit_events where target_id='d6400000-0000-4000-8000-000000000008';
delete from public.tkid_events where id='d6400000-0000-4000-8000-000000000008';
delete from public.tkid_event_evidence where id='d6400000-0000-4000-8000-000000000009';
delete from public.tkid_proof_event_claims where id='d6400000-0000-4000-8000-000000000007';
delete from public.tkid_browser_sessions where id='d6400000-0000-4000-8000-000000000006';
delete from public.tkid_journeys where id='d6400000-0000-4000-8000-000000000005';
delete from public.tkid_source_origins where id='d6400000-0000-4000-8000-000000000004';
delete from public.tkid_sources where id='d6400000-0000-4000-8000-000000000003';
delete from public.tracekit_business_contexts where id='concurrent-recovery-context';
delete from public.tracekit_organizations where id='d6400000-0000-4000-8000-000000000002';
delete from public.tracekit_accounts where id='d6400000-0000-4000-8000-000000000001';
SQL

echo "PASS: concurrent interrupted-event recovery inserted and audited exactly once"
