#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
workos_user_id="${TRACEKIT_REVIEW_WORKOS_USER_ID:-user_01KZ1XCDJ94Y2K6GDS8QNME4J6}"
container_name="supabase_db_tracekit"

if ! docker inspect "$container_name" >/dev/null 2>&1; then
  echo "Local TraceKit Supabase is not running. Run 'npx supabase start' first." >&2
  exit 1
fi

docker exec -i "$container_name" psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 \
  -v "workos_user_id=$workos_user_id" \
  < "$repository_root/scripts/bootstrap-local-review-tenant.sql"

echo "Local authenticated Bullseye review tenant is ready."
