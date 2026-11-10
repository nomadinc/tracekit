#!/usr/bin/env bash
# Read-only probes executed after both services are listening on loopback.
set -euo pipefail
pg_uid="$(cat acceptance-logs/postgresql-image-uid.txt)"
for uid in "$pg_uid" 25002 25003; do
  observed="$(sudo setpriv --reuid="$uid" --regid="$uid" --clear-groups id -u)"
  test "$observed" = "$uid"
  sudo setpriv --reuid="$uid" --regid="$uid" --clear-groups \
    env -i PATH=/usr/bin:/bin HOME=/tmp \
    pg_isready -h 127.0.0.1 -p 5432 -U acceptance_sql -d acceptance
  sudo setpriv --reuid="$uid" --regid="$uid" --clear-groups \
    env -i PATH=/usr/bin:/bin HOME=/tmp \
    curl --noproxy '*' --fail --silent --show-error --max-time 5 \
    'http://127.0.0.1:3000/platform_orders?select=id&limit=1' > /dev/null
  echo "PASS: UID $uid can reach only required local PostgreSQL/PostgREST listeners"
done
test "$(sudo -u ws001a-test sh -c "awk '/^CapEff:/ {print \$2}' /proc/self/status")" = '0000000000000000'
set +e
sudo -u ws001a-test sudo -n true > acceptance-logs/runtime/privilege-escalation-denied.log 2>&1
sudo_status=$?
set -e
test "$sudo_status" != 0
echo "PASS: native UID 25003 lacks effective capabilities and cannot sudo"
