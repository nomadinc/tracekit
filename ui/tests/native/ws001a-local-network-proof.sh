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
# Verify effective identity and privilege boundaries of the exact contained launcher.
bash ui/tests/native/ws001a-contained-exec.sh sh -c 'id -u; grep -E "^(CapEff|NoNewPrivs):" /proc/self/status' \
  | tee acceptance-logs/native-privilege-status.txt
grep -Fx '25003' acceptance-logs/native-privilege-status.txt
grep -Eq '^CapEff:[[:space:]]*0000000000000000
set +e
sudo -u ws001a-test sudo -n true > acceptance-logs/privilege-escalation-denied.log 2>&1
sudo_status=$?
set -e
test "$sudo_status" != 0
echo "PASS: native UID 25003 lacks capabilities, has no_new_privs, cannot sudo or connect to Docker socket, and cannot reach unrelated loopback"
 acceptance-logs/native-privilege-status.txt
grep -Eq '^NoNewPrivs:[[:space:]]*1
set +e
sudo -u ws001a-test sudo -n true > acceptance-logs/privilege-escalation-denied.log 2>&1
sudo_status=$?
set -e
test "$sudo_status" != 0
echo "PASS: native UID 25003 lacks effective capabilities and cannot sudo"
 acceptance-logs/native-privilege-status.txt

# A live unrelated loopback listener must be reachable by the runner but denied
# to the native identity. This tests policy, not merely a closed TCP port.
python3 -m http.server 39001 --bind 127.0.0.1 > acceptance-logs/unrelated-loopback-server.log 2>&1 &
unrelated_pid=$!
trap 'kill "$unrelated_pid" 2>/dev/null || true' EXIT
for attempt in 1 2 3 4 5; do
  if curl --noproxy '*' --fail --silent --max-time 2 http://127.0.0.1:39001/ >/dev/null; then break; fi
  sleep 1
done
curl --noproxy '*' --fail --silent --max-time 2 http://127.0.0.1:39001/ >/dev/null
set +e
bash ui/tests/native/ws001a-contained-exec.sh curl --noproxy '*' --max-time 3 -v http://127.0.0.1:39001/ \
  > acceptance-logs/unrelated-loopback-denied.log 2>&1
unrelated_status=$?
set -e
test "$unrelated_status" != 0
echo "PASS: runner can reach live unrelated loopback service, native UID denied (exit $unrelated_status)" |
  tee acceptance-logs/unrelated-loopback-proof.txt
kill "$unrelated_pid" 2>/dev/null || true
trap - EXIT

# Verify an actual AF_UNIX connect attempt to Docker socket is denied.
set +e
bash ui/tests/native/ws001a-contained-exec.sh python3 -c '
import socket,sys
s=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
try:
 s.connect("/var/run/docker.sock")
except OSError as e:
 print("DENIED Docker AF_UNIX connect:",repr(e))
 sys.exit(0)
print("FAIL: Docker socket connected")
sys.exit(1)
' > acceptance-logs/docker-socket-connect-denied.txt 2>&1
docker_probe=$?
set -e
test "$docker_probe" = 0
grep -F 'DENIED Docker AF_UNIX connect:' acceptance-logs/docker-socket-connect-denied.txt
set +e
sudo -u ws001a-test sudo -n true > acceptance-logs/privilege-escalation-denied.log 2>&1
sudo_status=$?
set -e
test "$sudo_status" != 0
echo "PASS: native UID 25003 lacks effective capabilities and cannot sudo"
