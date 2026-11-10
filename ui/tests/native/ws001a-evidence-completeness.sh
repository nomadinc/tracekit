#!/usr/bin/env bash
set -euo pipefail
mkdir -p acceptance-logs
trap 'code=$?; echo "HOLD — mandatory evidence validation failed (exit $code)" > acceptance-logs/final-disposition.txt' ERR
missing=0
for f in \
  commit.txt candidate-hashes.txt supply-chain.manifest \
  postgresql-image.txt postgrest-image.txt postgresql-image-uid.txt \
  node-version.txt npm-version.txt tsx-version.txt npm-locked-acquisition.txt \
  egress-firewall-rules.txt egress-probe-summary.txt \
  postgresql-version.txt postgrest-version.txt \
  postgresql-listener.txt postgrest-listener.txt role-authority.txt \
  schema.log indexes.txt native-negative.log native-concurrency.log \
  concurrent-order-a.log concurrent-order-b.log \
  concurrent-payment-a.log concurrent-payment-b.log \
  concurrency-summary.txt concurrency-rollback.log \
  concurrent-order-survivor.txt concurrent-payment-survivor.txt \
  numeric-order.txt numeric-payment.txt \
  http-get.txt http-cas-success.txt http-cas-stale.txt \
  http-cas-validated.json http-cas-db-final.txt \
  http-validator-selftest.log http-cas-validation.log \
  actual-writer-http.jsonl actual-writer-summary.json actual-writer-test.log \
  focused-tests.log postgresql-service.log postgrest-startup.log \
  postgrest-shutdown.log roles-final-snapshot.txt \
  orders-final-snapshot.txt payments-final-snapshot.txt \
  artifact-inventory.txt file-sha256.txt
do
  if [[ ! -s "acceptance-logs/$f" ]]; then
    echo "MISSING $f" | tee -a acceptance-logs/mandatory-evidence-missing.txt
    missing=$((missing+1))
  fi
done
if [[ "$missing" != 0 ]]; then
  echo "HOLD — $missing mandatory native evidence files missing" | tee acceptance-logs/final-disposition.txt
  exit 1
fi
grep -q 'PASS: enforcement probes' acceptance-logs/egress-probe-summary.txt
grep -q 'WS001A ACTUAL WRITER HTTP TEST PASS' acceptance-logs/actual-writer-test.log
grep -q 'PASS: separate psql session' acceptance-logs/native-concurrency.log
grep -q '"status": "PASS"' acceptance-logs/actual-writer-summary.json
grep -q '"status": "PASS"' acceptance-logs/http-cas-validated.json
grep -q '^17[.]6' acceptance-logs/postgresql-version.txt
grep -Eq '(^|[^[:digit:].])14[.]5([.]0)?([^[:digit:].]|$)' acceptance-logs/postgrest-version.txt
echo 'PASS — mandatory evidence present; independent reviewer still required' |
  tee acceptance-logs/final-disposition.txt
