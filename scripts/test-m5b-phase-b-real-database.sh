#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
url="${NEXT_PUBLIC_SUPABASE_URL:-http://127.0.0.1:54321}"
key="${SUPABASE_SERVICE_ROLE_KEY:-}"
db_url="${TRACEKIT_M5B_TEST_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
if [[ "$url" != "http://127.0.0.1:"* && "$url" != "http://localhost:"* ]]; then echo "Refusing non-local Supabase URL" >&2; exit 2; fi
if [[ "${TRACEKIT_M5B_TEST_DISPOSABLE:-}" != "1" || -z "$key" ]]; then echo "Disposable attestation and local service key are required" >&2; exit 2; fi
psql "$db_url" -v ON_ERROR_STOP=1 <<'SQL'
truncate public.mcp_action_notification_states,public.mcp_action_execution_results,public.mcp_action_authorizations,public.mcp_action_confirmations,public.mcp_shopify_mutation_recovery,public.mcp_action_intents cascade;
grant select,insert on public.mcp_action_intents,public.mcp_action_execution_results to service_role;
grant select on public.mcp_action_confirmations to service_role;
revoke insert on public.mcp_action_confirmations from service_role;
grant select,insert,update on public.mcp_action_authorizations,public.mcp_shopify_mutation_recovery,public.mcp_action_notification_states to service_role;
grant select on public.work_items,public.work_item_activity,public.mcp_external_action_audit,public.mcp_external_mutation_audit to service_role;
SQL

# Reproduce the production defect under the exact pre-repair security mode.
psql "$db_url" -v ON_ERROR_STOP=1 <<'SQL'
alter function public.create_ws019_m44_phase_b_fixture(uuid,uuid) security invoker;
alter function public.resolve_ws019_m44_phase_b_awaiting(uuid,uuid) security invoker;
SQL
status="$(curl -sS -o /tmp/tracekit-m5b-phase-b-pre-repair.json -w '%{http_code}' \
  -X POST "$url/rest/v1/rpc/create_ws019_m44_phase_b_fixture" \
  -H "apikey: $key" -H "Authorization: Bearer $key" -H 'Content-Type: application/json' \
  --data '{"p_organization_id":"8f6bb14b-2126-49b8-bfdb-c60edbc3549b","p_actor_user_id":"40000000-0000-4000-8000-000000000002"}')"
test "$status" = "403"
rg -q 'permission denied for table mcp_action_confirmations' /tmp/tracekit-m5b-phase-b-pre-repair.json
psql "$db_url" -v ON_ERROR_STOP=1 -Atc "select count(*) from public.mcp_action_intents where intent_id::text like 'b4400000-0000-4000-8000-00000000000%';" | rg -qx '0'

# Apply the forward repair exactly as production would, then prove the table
# privilege remains denied before exercising the successful fixed fixture.
psql "$db_url" -v ON_ERROR_STOP=1 -f "$repo_root/supabase/migrations/20261007175026_ws019_m44_phase_b_confirmation_boundary_repair.sql"
psql "$db_url" -v ON_ERROR_STOP=1 <<'SQL'
do $proof$
begin
  if has_table_privilege('service_role','public.mcp_action_confirmations','insert') then
    raise exception 'service_role retained direct confirmation INSERT';
  end if;
  if not (select prosecdef from pg_proc where oid='public.create_ws019_m44_phase_b_fixture(uuid,uuid)'::regprocedure)
     or not (select prosecdef from pg_proc where oid='public.resolve_ws019_m44_phase_b_awaiting(uuid,uuid)'::regprocedure)
     or (select prosecdef from pg_proc where oid='public.resolve_ws019_m44_phase_b_recovery(uuid,uuid)'::regprocedure) then
    raise exception 'fixture function security modes are invalid';
  end if;
  if (select proowner <> 'postgres'::regrole::oid from pg_proc where oid='public.create_ws019_m44_phase_b_fixture(uuid,uuid)'::regprocedure)
     or (select proowner <> 'postgres'::regrole::oid from pg_proc where oid='public.resolve_ws019_m44_phase_b_awaiting(uuid,uuid)'::regprocedure) then
    raise exception 'privileged fixture functions have an unexpected owner';
  end if;
  if has_function_privilege('public','public.create_ws019_m44_phase_b_fixture(uuid,uuid)','execute')
     or has_function_privilege('anon','public.create_ws019_m44_phase_b_fixture(uuid,uuid)','execute')
     or has_function_privilege('authenticated','public.create_ws019_m44_phase_b_fixture(uuid,uuid)','execute')
     or has_function_privilege('authenticator','public.create_ws019_m44_phase_b_fixture(uuid,uuid)','execute') then
    raise exception 'untrusted role can execute fixed fixture creation';
  end if;
end
$proof$;
SQL
if psql "$db_url" -v ON_ERROR_STOP=1 -c "set role service_role; insert into public.mcp_action_confirmations(confirmation_id,intent_id,organization_id,actor_user_id,confirmed_at,expires_at) values('aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000002','8f6bb14b-2126-49b8-bfdb-c60edbc3549b','40000000-0000-4000-8000-000000000002',clock_timestamp(),clock_timestamp()+interval '1 minute');" >/tmp/tracekit-m5b-direct-insert.out 2>&1; then
  echo 'service_role direct confirmation INSERT unexpectedly succeeded' >&2
  exit 3
fi
rg -q 'permission denied for table mcp_action_confirmations' /tmp/tracekit-m5b-direct-insert.out
cd "$repo_root/ui"
TMPDIR=/tmp NODE_OPTIONS="${NODE_OPTIONS:-} --conditions=react-server" NEXT_PUBLIC_SUPABASE_URL="$url" SUPABASE_SERVICE_ROLE_KEY="$key" ./node_modules/.bin/tsx scripts/validate-m5b-phase-b-real-database.ts
cd "$repo_root"

# Manufacture incompatible deterministic state only as the disposable database
# owner, then prove the service-role fixture RPC fails closed and does not repair
# or overwrite it.
psql "$db_url" -v ON_ERROR_STOP=1 -c "update public.mcp_action_intents set plan=jsonb_set(plan,'{namespace}','\"incompatible\"'::jsonb) where intent_id='b4400000-0000-4000-8000-000000000001';" >/dev/null
status="$(curl -sS -o /tmp/tracekit-m5b-phase-b-incompatible.json -w '%{http_code}' \
  -X POST "$url/rest/v1/rpc/create_ws019_m44_phase_b_fixture" \
  -H "apikey: $key" -H "Authorization: Bearer $key" -H 'Content-Type: application/json' \
  --data '{"p_organization_id":"8f6bb14b-2126-49b8-bfdb-c60edbc3549b","p_actor_user_id":"40000000-0000-4000-8000-000000000002"}')"
test "$status" = "400"
rg -q 'acceptance fixture incompatible' /tmp/tracekit-m5b-phase-b-incompatible.json
psql "$db_url" -v ON_ERROR_STOP=1 -Atc "select plan->>'namespace' from public.mcp_action_intents where intent_id='b4400000-0000-4000-8000-000000000001';" | rg -qx 'incompatible'
