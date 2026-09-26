#!/usr/bin/env bash
set -euo pipefail

proof_db_url="${TRACEKIT_LOCAL_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
proof_tmp_dir="$(mktemp -d)"
trap 'rm -rf "$proof_tmp_dir"' EXIT

psql "$proof_db_url" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
insert into public.tracekit_accounts(id,account_type,name)
values('a6200000-0000-4000-8000-000000000001','client','Concurrent Proof Account');
insert into public.tracekit_organizations(id,owning_account_id,name)
values('a6200000-0000-4000-8000-000000000002','a6200000-0000-4000-8000-000000000001','Concurrent Proof Org');
insert into public.tracekit_business_contexts(id,account_id,organization_id,name)
values('concurrent-proof-context','a6200000-0000-4000-8000-000000000001','a6200000-0000-4000-8000-000000000002','Concurrent Proof Context');
insert into public.tkid_sources(id,account_id,organization_id,business_context_id,public_source_id,environment,status,allowed_origins,abuse_adapter,proof_max_journeys,proof_max_events,proof_starts_at,proof_ends_at,ingestion_state)
values('a6200000-0000-4000-8000-000000000003','a6200000-0000-4000-8000-000000000001','a6200000-0000-4000-8000-000000000002','concurrent-proof-context','tksrc_concurrentproof01','production','shadow',array['https://proof.example'],'supabase_fixed_window_v1',1,1,'2026-09-26T00:00:00Z','2026-09-28T00:00:00Z','enabled');
insert into public.tkid_source_origins(id,account_id,organization_id,business_context_id,source_id,canonical_origin,role,lifecycle_status,verification_state,verified_at)
values('a6200000-0000-4000-8000-000000000004','a6200000-0000-4000-8000-000000000001','a6200000-0000-4000-8000-000000000002','concurrent-proof-context','a6200000-0000-4000-8000-000000000003','https://proof.example','frontend','active','verified','2026-09-25T00:00:00Z');
SQL

claim_sql_prefix="select decision from public.claim_tkid_proof_capacity_v1('a6200000-0000-4000-8000-000000000002','a6200000-0000-4000-8000-000000000003','a6200000-0000-4000-8000-000000000004','bootstrap'"
psql "$proof_db_url" -At -v ON_ERROR_STOP=1 -c "$claim_sql_prefix,'a6200000-0000-4000-8000-000000000010','a6200000-0000-4000-8000-000000000011','a6200000-0000-4000-8000-000000000012',null,'2026-09-26T01:00:00Z');" >"$proof_tmp_dir/one" &
proof_pid_one=$!
psql "$proof_db_url" -At -v ON_ERROR_STOP=1 -c "$claim_sql_prefix,'a6200000-0000-4000-8000-000000000020','a6200000-0000-4000-8000-000000000021','a6200000-0000-4000-8000-000000000022',null,'2026-09-26T01:00:00Z');" >"$proof_tmp_dir/two" &
proof_pid_two=$!
wait "$proof_pid_one"
wait "$proof_pid_two"

sort "$proof_tmp_dir/one" "$proof_tmp_dir/two" >"$proof_tmp_dir/decisions"
expected=$'accepted\njourney_budget_exhausted'
actual="$(<"$proof_tmp_dir/decisions")"
if [[ "$actual" != "$expected" ]]; then
  echo "unexpected concurrent decisions: $actual" >&2
  exit 1
fi

count="$(psql "$proof_db_url" -At -v ON_ERROR_STOP=1 -c "select count(*) from public.tkid_proof_journey_claims where source_id='a6200000-0000-4000-8000-000000000003';")"
if [[ "$count" != "1" ]]; then
  echo "concurrent journey budget overshot: $count" >&2
  exit 1
fi

journey_id="$(psql "$proof_db_url" -At -v ON_ERROR_STOP=1 -c "select journey_id from public.tkid_proof_journey_claims where source_id='a6200000-0000-4000-8000-000000000003';")"
event_claim_sql_prefix="select decision from public.claim_tkid_proof_capacity_v1('a6200000-0000-4000-8000-000000000002','a6200000-0000-4000-8000-000000000003','a6200000-0000-4000-8000-000000000004','event','$journey_id',null,null"
psql "$proof_db_url" -At -v ON_ERROR_STOP=1 -c "$event_claim_sql_prefix,'a6200000-0000-4000-8000-000000000030','2026-09-26T01:00:00Z');" >"$proof_tmp_dir/event-one" &
proof_event_pid_one=$!
psql "$proof_db_url" -At -v ON_ERROR_STOP=1 -c "$event_claim_sql_prefix,'a6200000-0000-4000-8000-000000000040','2026-09-26T01:00:00Z');" >"$proof_tmp_dir/event-two" &
proof_event_pid_two=$!
wait "$proof_event_pid_one"
wait "$proof_event_pid_two"

sort "$proof_tmp_dir/event-one" "$proof_tmp_dir/event-two" >"$proof_tmp_dir/event-decisions"
actual="$(<"$proof_tmp_dir/event-decisions")"
if [[ "$actual" != $'accepted\nevent_budget_exhausted' ]]; then
  echo "unexpected concurrent event decisions: $actual" >&2
  exit 1
fi

event_count="$(psql "$proof_db_url" -At -v ON_ERROR_STOP=1 -c "select count(*) from public.tkid_proof_event_claims where source_id='a6200000-0000-4000-8000-000000000003';")"
if [[ "$event_count" != "1" ]]; then
  echo "concurrent event budget overshot: $event_count" >&2
  exit 1
fi

psql "$proof_db_url" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
delete from public.tkid_proof_rejection_evidence where source_id='a6200000-0000-4000-8000-000000000003';
delete from public.tkid_proof_event_claims where source_id='a6200000-0000-4000-8000-000000000003';
delete from public.tkid_proof_journey_claims where source_id='a6200000-0000-4000-8000-000000000003';
delete from public.tkid_source_origins where id='a6200000-0000-4000-8000-000000000004';
delete from public.tkid_sources where id='a6200000-0000-4000-8000-000000000003';
delete from public.tracekit_business_contexts where id='concurrent-proof-context';
delete from public.tracekit_organizations where id='a6200000-0000-4000-8000-000000000002';
delete from public.tracekit_accounts where id='a6200000-0000-4000-8000-000000000001';
SQL

echo "PASS: concurrent journey and event claims each accepted exactly one reservation"
