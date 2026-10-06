#!/usr/bin/env bash
set -euo pipefail

# Runs the authoritative migration chain against a disposable local database,
# injecting the historical M15 production prerequisites as test data only.
# The fixture is neither a migration nor a configured production seed.

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
database_url="${TRACEKIT_MIGRATION_TEST_DB_URL:-}"
fixture="$repo_root/supabase/tests/fixtures/m15_stem_labs_workspace_prerequisites.sql"
pre_m15_version="20260930193000"
expected_final_version="$(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '[0-9]*.sql' -exec basename {} \; | sort | tail -1 | sed 's/_.*//')"

case "$database_url" in
  postgresql://*@127.0.0.1:*/postgres*|postgres://*@127.0.0.1:*/postgres*|postgresql://*@localhost:*/postgres*|postgres://*@localhost:*/postgres*) ;;
  *)
    echo 'Set TRACEKIT_MIGRATION_TEST_DB_URL to the postgres database in a disposable local Supabase Postgres instance.' >&2
    exit 2
    ;;
esac
if [[ "${TRACEKIT_MIGRATION_TEST_DISPOSABLE:-}" != "1" ]]; then
  echo 'Set TRACEKIT_MIGRATION_TEST_DISPOSABLE=1 to attest that the local Supabase instance is disposable.' >&2
  exit 2
fi

command -v psql >/dev/null
command -v supabase >/dev/null
export PGSSLMODE=disable
test -f "$fixture"
test ! -e "$repo_root/supabase/seed.sql"
if rg -n --fixed-strings 'm15_stem_labs_workspace_prerequisites.sql' \
  "$repo_root/supabase/config.toml" "$repo_root/supabase/migrations" >/dev/null; then
  echo 'Test fixture is reachable from production migration/seed configuration' >&2
  exit 3
fi

SUPABASE_TELEMETRY_DISABLED=1 supabase db reset \
  --db-url "$database_url" \
  --version "$pre_m15_version" \
  --no-seed \
  --workdir "$repo_root" \
  --yes

psql "$database_url" -v ON_ERROR_STOP=1 -f "$fixture"

SUPABASE_TELEMETRY_DISABLED=1 supabase migration up \
  --db-url "$database_url" \
  --include-all \
  --workdir "$repo_root" \
  --yes

psql "$database_url" -v ON_ERROR_STOP=1 \
  -v expected_final_version="$expected_final_version" <<'SQL'
select set_config('tracekit.expected_final_version', :'expected_final_version', false);
do $verification$
declare
  v_expected text := current_setting('tracekit.expected_final_version');
  v_final text;
begin
  select max(version) into v_final from supabase_migrations.schema_migrations;
  if v_final <> v_expected then
    raise exception 'migration ledger ended at %, expected %', v_final, v_expected;
  end if;
  if not exists (
    select 1 from supabase_migrations.schema_migrations where version = '20261001210000'
  ) or not exists (
    select 1 from supabase_migrations.schema_migrations where version = '20261004063517'
  ) then
    raise exception 'required migration ledger entries are absent';
  end if;
  if not exists (
    select 1 from public.tracekit_business_contexts
    where id = 'stem-labs-8f6bb14b'
      and organization_id = '8f6bb14b-2126-49b8-bfdb-c60edbc3549b'
  ) then
    raise exception 'M15 business context was not created';
  end if;
  if to_regprocedure(
    'public.confirm_mcp_action_intent_atomic(uuid,uuid,uuid,text,text)'
  ) is null then
    raise exception 'atomic confirmation RPC is absent';
  end if;
  if to_regprocedure(
    'public.resolve_completed_mcp_shopify_execution_replay(uuid,uuid,uuid,text,text,timestamptz,text)'
  ) is null or to_regprocedure(
    'public.authorize_mcp_shopify_execution_atomic(uuid,uuid,uuid,text,text,text,uuid,text,text,text,uuid,timestamptz)'
  ) is null then
    raise exception 'authoritative Shopify execution RPCs are absent';
  end if;
  if not exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20261004202000' and name = 'm5b_action_notification_state'
  ) or to_regclass('public.mcp_action_notification_states') is null then
    raise exception 'governed notification presentation-state migration is absent';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.mcp_action_notification_states'::regclass) then
    raise exception 'governed notification presentation state must enforce RLS';
  end if;
  if has_table_privilege('anon','public.mcp_action_notification_states','select')
     or has_table_privilege('authenticated','public.mcp_action_notification_states','select')
     or not has_table_privilege('service_role','public.mcp_action_notification_states','select,insert,update') then
    raise exception 'governed notification presentation-state ACL is invalid';
  end if;
end
$verification$;

select version, name
from supabase_migrations.schema_migrations
order by version desc
limit 5;
SQL

echo "PASS: authoritative migration chain converged through $expected_final_version"
