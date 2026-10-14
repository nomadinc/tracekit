#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# The existing authoritative harness enforces a local disposable URL and reset
# attestation. Currency SQL must be the reviewed PR #569 migration, not guessed.
currency_file="${WS001_CURRENCY_MIGRATION_FILE:?Set the reviewed PR #569 migration path}"
test -f "$currency_file"
test "$(basename "$currency_file")" = '20261014034517_ws001_dispute_source_currency_contract.sql'
test "$(git hash-object "$currency_file")" = '26748064a1a75901247e06deaf7674f6abda0f45'
review_root="$(mktemp -d)"
trap 'rm -rf "$review_root"' EXIT
cp -a "$repo_root/supabase" "$review_root/supabase"
mkdir -p "$review_root/scripts"
cp "$repo_root/scripts/test-m15-authoritative-migration-chain.sh" "$review_root/scripts/"
cp "$currency_file" "$review_root/supabase/migrations/"
bash "$review_root/scripts/test-m15-authoritative-migration-chain.sh"
psql "$TRACEKIT_MIGRATION_TEST_DB_URL" -v ON_ERROR_STOP=1 -1 \
 -f "$repo_root/docs/operations/prepared/commas-dispute-order-link.sql" \
 -f "$repo_root/docs/operations/prepared/commas-customer-dispute-read.sql"
psql "$TRACEKIT_MIGRATION_TEST_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
do $$begin
 if not (select relrowsecurity from pg_class where oid='ws001_dispute_preparation.identity_audit'::regclass) then raise exception 'audit RLS missing';end if;
 if has_function_privilege('service_role','public.read_commas_customer_disputes_prepared(uuid,uuid,uuid,integer)','execute') then raise exception 'prepared reader unexpectedly enabled';end if;
 if has_function_privilege('service_role','ws001_dispute_preparation.link_order(uuid,uuid,uuid,text,uuid)','execute') then raise exception 'prepared writer unexpectedly enabled';end if;
end$$;
SQL
echo 'PASS: authoritative chain plus disabled preparation DDL/ACL checks'
