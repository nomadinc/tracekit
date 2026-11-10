#!/usr/bin/env bash
# Launch a native acceptance command as a non-sudo, network-contained user.
set -euo pipefail
[[ "$#" -gt 0 ]] || { echo "Missing command" >&2; exit 2; }
test -f acceptance-logs/egress-probe-summary.txt
grep -Fq 'PASS: enforcement probes' acceptance-logs/egress-probe-summary.txt
test "$(id -u)" != 0 || { echo "Must be invoked from the runner account" >&2; exit 2; }
repo="$PWD"
exec sudo -u ws001a-test -- env -i \
  HOME=/tmp/ws001a-test \
  PATH="$PATH" \
  CI=true \
  GITHUB_WORKSPACE="$repo" \
  PGHOST=127.0.0.1 PGPORT=5432 PGUSER=fixture_admin \
  PGPASSWORD=synthetic-fixture-only PGDATABASE=acceptance \
  NODE_ENV=test \
  "$@"
