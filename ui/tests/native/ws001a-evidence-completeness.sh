#!/usr/bin/env bash
# Mandatory native evidence gate; all listed files must exist and contain actual output.
set -euo pipefail
mkdir -p acceptance-logs
trap 'code=$?; echo "HOLD: mandatory evidence failed ($code)" > acceptance-logs/final-disposition.txt' ERR
missing=0
for f in \
 commit.txt candidate-hashes.txt supply-chain.manifest \
 postgresql-image.txt postgrest-image.txt postgresql-image-uid.txt \
 postgresql-host-uid.txt postgrest-host-uid.txt \
 node-version.txt npm-version.txt tsx-version.txt npm-locked-acquisition.txt \
 approved-apt.list role-permissions.txt role-authority.txt \
 bootstrap-login-revoked.txt bootstrap-login-disabled.txt bootstrap-login-denied.log restricted-set-role-denied.log \
 egress-firewall-rules.txt egress-probe-summary.txt egress-all-uids.txt egress-rule-counters.txt egress-counter-validation.txt \
 postgresql-version.txt postgrest-version.txt \
 postgresql-listener.txt postgrest-listener.txt loopback-reachability.txt \
 native-privilege-status.txt unrelated-loopback-proof.txt unrelated-loopback-denied.log \
 docker-socket-connect-denied.txt \
 postgresql-netns-proof.txt postgrest-netns-proof.txt \
 schema.log indexes.txt native-negative.log native-concurrency.log \
 runtime/concurrent-order-a.log runtime/concurrent-order-b.log \
 runtime/concurrent-payment-a.log runtime/concurrent-payment-b.log \
 runtime/concurrency-summary.txt runtime/concurrency-rollback.log \
 runtime/concurrent-order-survivor.txt runtime/concurrent-payment-survivor.txt \
 numeric-order.txt numeric-payment.txt \
 http-get.txt http-cas-success.txt http-cas-stale.txt \
 http-cas-validated.json http-cas-db-final.txt \
 http-validator-selftest.log http-cas-validation.log \
 runtime/actual-writer-http.jsonl runtime/actual-writer-summary.json \
 actual-writer-test.log focused-tests.log independent-state-check.log \
 postgresql-service.log postgrest-startup.log postgrest-shutdown.log \
 roles-final-snapshot.txt orders-final-snapshot.txt payments-final-snapshot.txt \
 artifact-permission-checks.txt blocked-provenance-tamper.log \
 .trusted-provenance.sha256 trusted-integrity-verification.log \
 runtime-file-ownership.txt privilege-escalation-denied.log \
 runtime-original-sha256.txt runtime-copy-sha256.txt runtime-copy-integrity.txt \
 artifact-inventory.txt file-sha256.txt
do
  if [[ ! -s "acceptance-logs/$f" ]]; then
    printf 'MISSING %s\n' "$f" | tee -a acceptance-logs/mandatory-evidence-missing.txt
    missing=$((missing+1))
  fi
done
if [[ "$missing" -ne 0 ]]; then
  printf 'HOLD: missing %s mandatory files\n' "$missing" | tee acceptance-logs/final-disposition.txt
  exit 1
fi
test -f acceptance-logs/runtime-symlinks.txt
test ! -s acceptance-logs/runtime-symlinks.txt
test -f acceptance-logs/runtime-special-files.txt
test ! -s acceptance-logs/runtime-special-files.txt
grep -Fx 'PASS: restricted raw evidence copied, digest matched, collector owns sealed copy' acceptance-logs/runtime-copy-integrity.txt
# Check actual sealed files against both trusted collector digest manifests.
# A PASS marker alone cannot validate a copy whose bytes have changed.
test -s acceptance-logs/runtime-original-sha256.txt
test -s acceptance-logs/runtime-copy-sha256.txt
sed 's@acceptance-logs/runtime-copy/@acceptance-logs/runtime/@' acceptance-logs/runtime-copy-sha256.txt \
  | cmp -s - acceptance-logs/runtime-original-sha256.txt
sha256sum --check --status acceptance-logs/runtime-original-sha256.txt
# Raw writer and SQL session evidence must originate from the restricted test UID.
for filename in actual-writer-http.jsonl actual-writer-summary.json concurrent-order-a.log concurrent-payment-a.log; do
  grep -E "^ws001a-test:ws001a-test:[0-7]+ f acceptance-logs/runtime/$filename" acceptance-logs/runtime-file-ownership.txt
done
test "$(stat -c '%u:%g:%a' acceptance-logs/runtime)" = "$(id -u):$(id -g):700"
bash ui/tests/native/ws001a-artifact-integrity.sh verify > acceptance-logs/verified-provenance-final.txt
grep -q 'PASS: protected' acceptance-logs/trusted-integrity-verification.log
grep -q 'PASS: native UID cannot modify runner-owned provenance' acceptance-logs/artifact-permission-checks.txt
test "$(cat acceptance-logs/role-permissions.txt)" = 'acceptance_sql|acceptance_sql|f|f|f|f|t|t|t|t|t|f'
test "$(cat acceptance-logs/bootstrap-login-disabled.txt)" = 'false'
grep -F 'not permitted to log in' acceptance-logs/bootstrap-login-denied.log
grep -E 'permission denied|not permitted' acceptance-logs/restricted-set-role-denied.log
grep -q 'PASS: native UID 25003 lacks capabilities, has no_new_privs, cannot sudo or connect to Docker socket, and cannot reach unrelated loopback' acceptance-logs/loopback-reachability.txt
grep -Eq '^NoNewPrivs:[[:space:]]*1
grep -F 'DENIED Docker AF_UNIX connect:' acceptance-logs/docker-socket-connect-denied.txt
! grep -Fq 'FAIL: Docker socket connected' acceptance-logs/docker-socket-connect-denied.txt
grep -Eq 'native UID denied \(exit [1-9][0-9]*\)' acceptance-logs/unrelated-loopback-proof.txt
grep -q 'PASS: enforcement probes' acceptance-logs/egress-probe-summary.txt
grep -Eq '^external IPv4 probe exit=[1-9][0-9]* \(must be nonzero\)
grep -F 'PASS: IPv4 and IPv6 firewall REJECT counters incremented' acceptance-logs/egress-counter-validation.txt
pg_uid="$(cat acceptance-logs/postgresql-image-uid.txt)"
for uid in "$pg_uid" 25002 25003; do
  grep -Eq "^runtime UID $uid external IPv4 exit=[1-9][0-9]* \(must be nonzero\)$" acceptance-logs/egress-all-uids.txt
  grep -Eq "^runtime UID $uid external IPv6 exit=[1-9][0-9]* \(must be nonzero\)$" acceptance-logs/egress-all-uids.txt
  test -s "acceptance-logs/egress-uid-$uid.log"
  test -s "acceptance-logs/egress-ipv6-uid-$uid.log"
done
grep -F 'PASS: independent SQL snapshots confirm' acceptance-logs/independent-state-check.log
grep -q 'WS001A ACTUAL WRITER HTTP TEST PASS' acceptance-logs/actual-writer-test.log
grep -q 'PASS: separate psql session' acceptance-logs/native-concurrency.log
grep -q '"status": "PASS"' acceptance-logs/runtime/actual-writer-summary.json
grep -q '"status": "PASS"' acceptance-logs/http-cas-validated.json
grep -q '^17[.]6' acceptance-logs/postgresql-version.txt
grep -Eq '(^|[^[:digit:].])14[.]5([.]0)?([^[:digit:].]|$)' acceptance-logs/postgrest-version.txt
echo 'PASS: mandatory native evidence complete, pending WS-022 independent acceptance' |
  tee acceptance-logs/final-disposition.txt
 acceptance-logs/native-privilege-status.txt
grep -Eq '^CapEff:[[:space:]]*0000000000000000
grep -F 'DENIED Docker AF_UNIX connect:' acceptance-logs/docker-socket-connect-denied.txt
grep -F 'native UID denied' acceptance-logs/unrelated-loopback-proof.txt
grep -q 'PASS: enforcement probes' acceptance-logs/egress-probe-summary.txt
grep -F 'PASS: IPv4 and IPv6 firewall REJECT counters incremented' acceptance-logs/egress-counter-validation.txt
pg_uid="$(cat acceptance-logs/postgresql-image-uid.txt)"
for uid in "$pg_uid" 25002 25003; do
  grep -q "runtime UID $uid external IPv4 exit=" acceptance-logs/egress-all-uids.txt
  grep -q "runtime UID $uid external IPv6 exit=" acceptance-logs/egress-all-uids.txt
  test -s "acceptance-logs/egress-uid-$uid.log"
  test -s "acceptance-logs/egress-ipv6-uid-$uid.log"
done
grep -F 'PASS: independent SQL snapshots confirm' acceptance-logs/independent-state-check.log
grep -q 'WS001A ACTUAL WRITER HTTP TEST PASS' acceptance-logs/actual-writer-test.log
grep -q 'PASS: separate psql session' acceptance-logs/native-concurrency.log
grep -q '"status": "PASS"' acceptance-logs/runtime/actual-writer-summary.json
grep -q '"status": "PASS"' acceptance-logs/http-cas-validated.json
grep -q '^17[.]6' acceptance-logs/postgresql-version.txt
grep -Eq '(^|[^[:digit:].])14[.]5([.]0)?([^[:digit:].]|$)' acceptance-logs/postgrest-version.txt
echo 'PASS: mandatory native evidence complete, pending WS-022 independent acceptance' |
  tee acceptance-logs/final-disposition.txt
 acceptance-logs/native-privilege-status.txt
test "$(grep -c '^NoNewPrivs:' acceptance-logs/native-privilege-status.txt)" = 1
test "$(grep -c '^CapEff:' acceptance-logs/native-privilege-status.txt)" = 1
grep -F 'DENIED Docker AF_UNIX connect:' acceptance-logs/docker-socket-connect-denied.txt
grep -F 'native UID denied' acceptance-logs/unrelated-loopback-proof.txt
grep -q 'PASS: enforcement probes' acceptance-logs/egress-probe-summary.txt
grep -F 'PASS: IPv4 and IPv6 firewall REJECT counters incremented' acceptance-logs/egress-counter-validation.txt
pg_uid="$(cat acceptance-logs/postgresql-image-uid.txt)"
for uid in "$pg_uid" 25002 25003; do
  grep -q "runtime UID $uid external IPv4 exit=" acceptance-logs/egress-all-uids.txt
  grep -q "runtime UID $uid external IPv6 exit=" acceptance-logs/egress-all-uids.txt
  test -s "acceptance-logs/egress-uid-$uid.log"
  test -s "acceptance-logs/egress-ipv6-uid-$uid.log"
done
grep -F 'PASS: independent SQL snapshots confirm' acceptance-logs/independent-state-check.log
grep -q 'WS001A ACTUAL WRITER HTTP TEST PASS' acceptance-logs/actual-writer-test.log
grep -q 'PASS: separate psql session' acceptance-logs/native-concurrency.log
grep -q '"status": "PASS"' acceptance-logs/runtime/actual-writer-summary.json
grep -q '"status": "PASS"' acceptance-logs/http-cas-validated.json
grep -q '^17[.]6' acceptance-logs/postgresql-version.txt
grep -Eq '(^|[^[:digit:].])14[.]5([.]0)?([^[:digit:].]|$)' acceptance-logs/postgrest-version.txt
echo 'PASS: mandatory native evidence complete, pending WS-022 independent acceptance' |
  tee acceptance-logs/final-disposition.txt
 acceptance-logs/egress-probe-summary.txt
grep -Eq '^external DNS/TLS probe exit=[1-9][0-9]* \(must be nonzero\)
grep -F 'PASS: IPv4 and IPv6 firewall REJECT counters incremented' acceptance-logs/egress-counter-validation.txt
pg_uid="$(cat acceptance-logs/postgresql-image-uid.txt)"
for uid in "$pg_uid" 25002 25003; do
  grep -q "runtime UID $uid external IPv4 exit=" acceptance-logs/egress-all-uids.txt
  grep -q "runtime UID $uid external IPv6 exit=" acceptance-logs/egress-all-uids.txt
  test -s "acceptance-logs/egress-uid-$uid.log"
  test -s "acceptance-logs/egress-ipv6-uid-$uid.log"
done
grep -F 'PASS: independent SQL snapshots confirm' acceptance-logs/independent-state-check.log
grep -q 'WS001A ACTUAL WRITER HTTP TEST PASS' acceptance-logs/actual-writer-test.log
grep -q 'PASS: separate psql session' acceptance-logs/native-concurrency.log
grep -q '"status": "PASS"' acceptance-logs/runtime/actual-writer-summary.json
grep -q '"status": "PASS"' acceptance-logs/http-cas-validated.json
grep -q '^17[.]6' acceptance-logs/postgresql-version.txt
grep -Eq '(^|[^[:digit:].])14[.]5([.]0)?([^[:digit:].]|$)' acceptance-logs/postgrest-version.txt
echo 'PASS: mandatory native evidence complete, pending WS-022 independent acceptance' |
  tee acceptance-logs/final-disposition.txt
 acceptance-logs/native-privilege-status.txt
grep -Eq '^CapEff:[[:space:]]*0000000000000000
grep -F 'DENIED Docker AF_UNIX connect:' acceptance-logs/docker-socket-connect-denied.txt
grep -F 'native UID denied' acceptance-logs/unrelated-loopback-proof.txt
grep -q 'PASS: enforcement probes' acceptance-logs/egress-probe-summary.txt
grep -F 'PASS: IPv4 and IPv6 firewall REJECT counters incremented' acceptance-logs/egress-counter-validation.txt
pg_uid="$(cat acceptance-logs/postgresql-image-uid.txt)"
for uid in "$pg_uid" 25002 25003; do
  grep -q "runtime UID $uid external IPv4 exit=" acceptance-logs/egress-all-uids.txt
  grep -q "runtime UID $uid external IPv6 exit=" acceptance-logs/egress-all-uids.txt
  test -s "acceptance-logs/egress-uid-$uid.log"
  test -s "acceptance-logs/egress-ipv6-uid-$uid.log"
done
grep -F 'PASS: independent SQL snapshots confirm' acceptance-logs/independent-state-check.log
grep -q 'WS001A ACTUAL WRITER HTTP TEST PASS' acceptance-logs/actual-writer-test.log
grep -q 'PASS: separate psql session' acceptance-logs/native-concurrency.log
grep -q '"status": "PASS"' acceptance-logs/runtime/actual-writer-summary.json
grep -q '"status": "PASS"' acceptance-logs/http-cas-validated.json
grep -q '^17[.]6' acceptance-logs/postgresql-version.txt
grep -Eq '(^|[^[:digit:].])14[.]5([.]0)?([^[:digit:].]|$)' acceptance-logs/postgrest-version.txt
echo 'PASS: mandatory native evidence complete, pending WS-022 independent acceptance' |
  tee acceptance-logs/final-disposition.txt
 acceptance-logs/native-privilege-status.txt
test "$(grep -c '^NoNewPrivs:' acceptance-logs/native-privilege-status.txt)" = 1
test "$(grep -c '^CapEff:' acceptance-logs/native-privilege-status.txt)" = 1
grep -F 'DENIED Docker AF_UNIX connect:' acceptance-logs/docker-socket-connect-denied.txt
grep -F 'native UID denied' acceptance-logs/unrelated-loopback-proof.txt
grep -q 'PASS: enforcement probes' acceptance-logs/egress-probe-summary.txt
grep -F 'PASS: IPv4 and IPv6 firewall REJECT counters incremented' acceptance-logs/egress-counter-validation.txt
pg_uid="$(cat acceptance-logs/postgresql-image-uid.txt)"
for uid in "$pg_uid" 25002 25003; do
  grep -q "runtime UID $uid external IPv4 exit=" acceptance-logs/egress-all-uids.txt
  grep -q "runtime UID $uid external IPv6 exit=" acceptance-logs/egress-all-uids.txt
  test -s "acceptance-logs/egress-uid-$uid.log"
  test -s "acceptance-logs/egress-ipv6-uid-$uid.log"
done
grep -F 'PASS: independent SQL snapshots confirm' acceptance-logs/independent-state-check.log
grep -q 'WS001A ACTUAL WRITER HTTP TEST PASS' acceptance-logs/actual-writer-test.log
grep -q 'PASS: separate psql session' acceptance-logs/native-concurrency.log
grep -q '"status": "PASS"' acceptance-logs/runtime/actual-writer-summary.json
grep -q '"status": "PASS"' acceptance-logs/http-cas-validated.json
grep -q '^17[.]6' acceptance-logs/postgresql-version.txt
grep -Eq '(^|[^[:digit:].])14[.]5([.]0)?([^[:digit:].]|$)' acceptance-logs/postgrest-version.txt
echo 'PASS: mandatory native evidence complete, pending WS-022 independent acceptance' |
  tee acceptance-logs/final-disposition.txt
 acceptance-logs/egress-probe-summary.txt
! grep -Eq 'exit=0([^0-9]|$)' acceptance-logs/egress-all-uids.txt acceptance-logs/egress-probe-summary.txt
grep -F 'PASS: IPv4 and IPv6 firewall REJECT counters incremented' acceptance-logs/egress-counter-validation.txt
pg_uid="$(cat acceptance-logs/postgresql-image-uid.txt)"
for uid in "$pg_uid" 25002 25003; do
  grep -q "runtime UID $uid external IPv4 exit=" acceptance-logs/egress-all-uids.txt
  grep -q "runtime UID $uid external IPv6 exit=" acceptance-logs/egress-all-uids.txt
  test -s "acceptance-logs/egress-uid-$uid.log"
  test -s "acceptance-logs/egress-ipv6-uid-$uid.log"
done
grep -F 'PASS: independent SQL snapshots confirm' acceptance-logs/independent-state-check.log
grep -q 'WS001A ACTUAL WRITER HTTP TEST PASS' acceptance-logs/actual-writer-test.log
grep -q 'PASS: separate psql session' acceptance-logs/native-concurrency.log
grep -q '"status": "PASS"' acceptance-logs/runtime/actual-writer-summary.json
grep -q '"status": "PASS"' acceptance-logs/http-cas-validated.json
grep -q '^17[.]6' acceptance-logs/postgresql-version.txt
grep -Eq '(^|[^[:digit:].])14[.]5([.]0)?([^[:digit:].]|$)' acceptance-logs/postgrest-version.txt
echo 'PASS: mandatory native evidence complete, pending WS-022 independent acceptance' |
  tee acceptance-logs/final-disposition.txt
 acceptance-logs/native-privilege-status.txt
grep -Eq '^CapEff:[[:space:]]*0000000000000000
grep -F 'DENIED Docker AF_UNIX connect:' acceptance-logs/docker-socket-connect-denied.txt
grep -F 'native UID denied' acceptance-logs/unrelated-loopback-proof.txt
grep -q 'PASS: enforcement probes' acceptance-logs/egress-probe-summary.txt
grep -F 'PASS: IPv4 and IPv6 firewall REJECT counters incremented' acceptance-logs/egress-counter-validation.txt
pg_uid="$(cat acceptance-logs/postgresql-image-uid.txt)"
for uid in "$pg_uid" 25002 25003; do
  grep -q "runtime UID $uid external IPv4 exit=" acceptance-logs/egress-all-uids.txt
  grep -q "runtime UID $uid external IPv6 exit=" acceptance-logs/egress-all-uids.txt
  test -s "acceptance-logs/egress-uid-$uid.log"
  test -s "acceptance-logs/egress-ipv6-uid-$uid.log"
done
grep -F 'PASS: independent SQL snapshots confirm' acceptance-logs/independent-state-check.log
grep -q 'WS001A ACTUAL WRITER HTTP TEST PASS' acceptance-logs/actual-writer-test.log
grep -q 'PASS: separate psql session' acceptance-logs/native-concurrency.log
grep -q '"status": "PASS"' acceptance-logs/runtime/actual-writer-summary.json
grep -q '"status": "PASS"' acceptance-logs/http-cas-validated.json
grep -q '^17[.]6' acceptance-logs/postgresql-version.txt
grep -Eq '(^|[^[:digit:].])14[.]5([.]0)?([^[:digit:].]|$)' acceptance-logs/postgrest-version.txt
echo 'PASS: mandatory native evidence complete, pending WS-022 independent acceptance' |
  tee acceptance-logs/final-disposition.txt
 acceptance-logs/native-privilege-status.txt
test "$(grep -c '^NoNewPrivs:' acceptance-logs/native-privilege-status.txt)" = 1
test "$(grep -c '^CapEff:' acceptance-logs/native-privilege-status.txt)" = 1
grep -F 'DENIED Docker AF_UNIX connect:' acceptance-logs/docker-socket-connect-denied.txt
grep -F 'native UID denied' acceptance-logs/unrelated-loopback-proof.txt
grep -q 'PASS: enforcement probes' acceptance-logs/egress-probe-summary.txt
grep -F 'PASS: IPv4 and IPv6 firewall REJECT counters incremented' acceptance-logs/egress-counter-validation.txt
pg_uid="$(cat acceptance-logs/postgresql-image-uid.txt)"
for uid in "$pg_uid" 25002 25003; do
  grep -q "runtime UID $uid external IPv4 exit=" acceptance-logs/egress-all-uids.txt
  grep -q "runtime UID $uid external IPv6 exit=" acceptance-logs/egress-all-uids.txt
  test -s "acceptance-logs/egress-uid-$uid.log"
  test -s "acceptance-logs/egress-ipv6-uid-$uid.log"
done
grep -F 'PASS: independent SQL snapshots confirm' acceptance-logs/independent-state-check.log
grep -q 'WS001A ACTUAL WRITER HTTP TEST PASS' acceptance-logs/actual-writer-test.log
grep -q 'PASS: separate psql session' acceptance-logs/native-concurrency.log
grep -q '"status": "PASS"' acceptance-logs/runtime/actual-writer-summary.json
grep -q '"status": "PASS"' acceptance-logs/http-cas-validated.json
grep -q '^17[.]6' acceptance-logs/postgresql-version.txt
grep -Eq '(^|[^[:digit:].])14[.]5([.]0)?([^[:digit:].]|$)' acceptance-logs/postgrest-version.txt
echo 'PASS: mandatory native evidence complete, pending WS-022 independent acceptance' |
  tee acceptance-logs/final-disposition.txt
