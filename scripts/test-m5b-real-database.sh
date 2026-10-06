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
grant insert on public.mcp_action_intents,public.mcp_action_confirmations,public.mcp_action_authorizations,public.mcp_action_execution_results,public.mcp_shopify_mutation_recovery to service_role;
grant update on public.mcp_shopify_mutation_recovery to service_role;
grant select on public.work_items,public.work_item_activity,public.mcp_external_action_audit,public.mcp_external_mutation_audit to service_role;
SQL
cleanup(){ psql "$db_url" -v ON_ERROR_STOP=1 -c 'grant select,insert on public.mcp_action_intents,public.mcp_action_confirmations,public.mcp_action_execution_results to service_role; grant select,insert,update on public.mcp_action_authorizations,public.mcp_shopify_mutation_recovery to service_role; grant select,insert on public.mcp_external_action_audit,public.mcp_external_mutation_audit to service_role;' >/dev/null; }
trap cleanup EXIT
cd "$repo_root/ui"
TMPDIR=/tmp NODE_OPTIONS="${NODE_OPTIONS:-} --conditions=react-server" NEXT_PUBLIC_SUPABASE_URL="$url" SUPABASE_SERVICE_ROLE_KEY="$key" ./node_modules/.bin/tsx scripts/validate-m5b-real-database.ts
