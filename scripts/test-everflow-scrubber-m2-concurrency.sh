#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "unique" ]]; then
  SCRUBBER_SEQUENCE="$2"
  psql "$SCRUBBER_TEST_URL" -v ON_ERROR_STOP=1 -qAt <<SQL >/dev/null
select conversion_id from public.decide_everflow_scrubber_conversion_v1(
  gen_random_uuid(), '00000000-0000-4000-8000-000000000004',
  encode(sha256(convert_to('unique-${SCRUBBER_SEQUENCE}', 'utf8')), 'hex'),
  'tid-${SCRUBBER_SEQUENCE}', '52', '107', 'ORD-${SCRUBBER_SEQUENCE}', 'purchase',
  null, null, 10, 'USD', '1.2.3.4', null, null, true,
  ((${SCRUBBER_SEQUENCE} * 2654435761::bigint) % 10000)::numeric / 10000,
  jsonb_build_object('sequence', ${SCRUBBER_SEQUENCE}), jsonb_build_object('transaction_id', 'tid-${SCRUBBER_SEQUENCE}')
);
SQL
  exit 0
fi

if [[ "${1:-}" == "duplicate" ]]; then
  SCRUBBER_SEQUENCE="$2"
  psql "$SCRUBBER_TEST_URL" -v ON_ERROR_STOP=1 -qAt <<SQL >/dev/null
select conversion_id from public.decide_everflow_scrubber_conversion_v1(
  gen_random_uuid(), '00000000-0000-4000-8000-000000000004',
  encode(sha256(convert_to('duplicate-key', 'utf8')), 'hex'),
  'duplicate-tid', '52', '107', 'DUP-1', 'purchase',
  null, null, 10, 'USD', '1.2.3.4', null, null, true, 0.5,
  jsonb_build_object('duplicate_delivery', ${SCRUBBER_SEQUENCE}), jsonb_build_object('transaction_id', 'duplicate-tid')
);
SQL
  exit 0
fi

SCRUBBER_TEST_DB="tracekit_scrubber_m2_${$}"
SCRUBBER_ADMIN_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
SCRUBBER_TEST_URL="postgresql://postgres:postgres@127.0.0.1:54322/${SCRUBBER_TEST_DB}"
SCRUBBER_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cleanup() {
  dropdb --if-exists --force --maintenance-db="$SCRUBBER_ADMIN_URL" "$SCRUBBER_TEST_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

createdb --maintenance-db="$SCRUBBER_ADMIN_URL" "$SCRUBBER_TEST_DB"
psql "$SCRUBBER_TEST_URL" -v ON_ERROR_STOP=1 <<'SQL'
create extension if not exists pgcrypto;
create table public.commerce_provider_accounts (
  id uuid not null,
  organization_id uuid not null,
  connection_id uuid not null,
  primary key (id),
  unique (organization_id, connection_id, id)
);
SQL

psql "$SCRUBBER_TEST_URL" -v ON_ERROR_STOP=1 -f "$SCRUBBER_ROOT/supabase/migrations/20260909171315_everflow_external_conversion_scrubber_v1.sql" >/dev/null
psql "$SCRUBBER_TEST_URL" -v ON_ERROR_STOP=1 -f "$SCRUBBER_ROOT/supabase/migrations/20260909171935_everflow_scrubber_atomic_decision_v1.sql" >/dev/null

psql "$SCRUBBER_TEST_URL" -v ON_ERROR_STOP=1 <<'SQL'
insert into public.commerce_provider_accounts(id, organization_id, connection_id)
values ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002');
insert into public.everflow_scrubber_settings(organization_id, connection_id, provider_account_id, global_pass_rate)
values ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003',0.5);
insert into public.everflow_scrubber_sources(id, organization_id, connection_id, source_key, display_name, token_sha256)
values ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','m2_test','M2 Test',repeat('a',64));
SQL

export SCRUBBER_TEST_URL
seq 1 64 | xargs -P 16 -I '{}' "$0" unique '{}'

# Twenty simultaneous deliveries of one logical conversion must produce one
# conversion, one controller increment, and twenty ingress-attempt records.
seq 1 20 | xargs -P 20 -I '{}' "$0" duplicate '{}'

psql "$SCRUBBER_TEST_URL" -v ON_ERROR_STOP=1 <<'SQL'
update public.everflow_scrubber_settings set scrubbing_enabled=false;
select conversion_id from public.decide_everflow_scrubber_conversion_v1(
  gen_random_uuid(), '00000000-0000-4000-8000-000000000004', repeat('b',64),
  'bypass-tid', '52', '107', 'BYPASS-1', 'purchase', null, null, 10, 'USD',
  '1.2.3.4', null, null, true, 0.5, '{"path":"bypass"}', '{"transaction_id":"bypass-tid"}'
);
update public.everflow_scrubber_settings set scrubbing_enabled=true;
select conversion_id from public.decide_everflow_scrubber_conversion_v1(
  gen_random_uuid(), '00000000-0000-4000-8000-000000000004', repeat('c',64),
  'lead-tid', '52', '107', 'LEAD-1', 'lead', null, null, 10, 'USD',
  '1.2.3.4', null, null, false, 0.5, '{"path":"non_eligible"}', '{"transaction_id":"lead-tid"}'
);
select * from public.record_everflow_scrubber_mock_forward_v1(
  (select id from public.everflow_scrubber_conversions where transaction_id='bypass-tid'),
  'retryable_failure', null, null, 'mock_timeout', now() + interval '1 minute'
);

do $$
declare
  v_period public.everflow_scrubber_periods%rowtype;
  v_conversions bigint;
  v_attempts bigint;
  v_duplicate_conversions bigint;
  v_duplicate_attempts bigint;
  v_bypass public.everflow_scrubber_conversions%rowtype;
  v_non_eligible public.everflow_scrubber_conversions%rowtype;
begin
  select * into strict v_period from public.everflow_scrubber_periods
    where network_offer_id='52' and network_affiliate_id='107' and ended_at is null;
  select count(*) into v_conversions from public.everflow_scrubber_conversions;
  select count(*) into v_attempts from public.everflow_scrubber_ingress_attempts;
  select count(*) into v_duplicate_conversions from public.everflow_scrubber_conversions
    where transaction_id='duplicate-tid';
  select count(*) into v_duplicate_attempts from public.everflow_scrubber_ingress_attempts
    where conversion_id=(select id from public.everflow_scrubber_conversions where transaction_id='duplicate-tid');
  select * into strict v_bypass from public.everflow_scrubber_conversions where transaction_id='bypass-tid';
  select * into strict v_non_eligible from public.everflow_scrubber_conversions where transaction_id='lead-tid';
  if v_period.eligible_count <> 65 then raise exception 'eligible_count %, expected 65', v_period.eligible_count; end if;
  if v_period.eligible_count <> v_period.passed_count + v_period.scrubbed_count then raise exception 'period counters do not reconcile'; end if;
  if v_conversions <> 67 then raise exception 'conversion count %, expected 67', v_conversions; end if;
  if v_attempts <> 86 then raise exception 'attempt count %, expected 86', v_attempts; end if;
  if v_duplicate_conversions <> 1 or v_duplicate_attempts <> 20 then raise exception 'duplicate arbitration failed'; end if;
  if v_bypass.decision_reason <> 'PASS_GLOBAL_BYPASS' or v_bypass.rule_period_id is not null then raise exception 'bypass failed'; end if;
  if v_non_eligible.decision_reason <> 'PASS_NON_ELIGIBLE_EVENT' or v_non_eligible.rule_period_id is not null then raise exception 'non-eligible path failed'; end if;
  if v_bypass.decision <> 'PASS' or v_bypass.forward_status <> 'retry' or v_bypass.forward_attempt_count <> 1 or v_bypass.next_retry_at is null then raise exception 'retry state failed'; end if;
  if has_function_privilege('anon', 'public.decide_everflow_scrubber_conversion_v1(uuid,uuid,text,text,text,text,text,text,text,text,numeric,text,inet,text,text,boolean,numeric,jsonb,jsonb,timestamptz)', 'EXECUTE') then raise exception 'anon can execute decision function'; end if;
  if has_function_privilege('authenticated', 'public.decide_everflow_scrubber_conversion_v1(uuid,uuid,text,text,text,text,text,text,text,text,numeric,text,inet,text,text,boolean,numeric,jsonb,jsonb,timestamptz)', 'EXECUTE') then raise exception 'authenticated can execute decision function'; end if;
  if not has_function_privilege('service_role', 'public.decide_everflow_scrubber_conversion_v1(uuid,uuid,text,text,text,text,text,text,text,text,numeric,text,inet,text,text,boolean,numeric,jsonb,jsonb,timestamptz)', 'EXECUTE') then raise exception 'service role cannot execute decision function'; end if;
  if exists (select 1 from pg_class where relname like 'everflow_scrubber_%' and relkind='r' and not relrowsecurity) then raise exception 'scrubber table without RLS'; end if;
  raise notice 'ATOMIC DECISION PASS';
  raise notice 'CONCURRENCY PASS: eligible=%, passed=%, scrubbed=%, attempts=%',
    v_period.eligible_count, v_period.passed_count, v_period.scrubbed_count, v_attempts;
  raise notice 'DUPLICATE SUPPRESSION PASS';
  raise notice 'BYPASS PASS';
  raise notice 'NON-ELIGIBLE PATH PASS';
  raise notice 'RETRY-STATE PASS';
  raise notice 'DATABASE SECURITY PASS';
end $$;
SQL
