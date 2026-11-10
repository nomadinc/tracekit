#!/usr/bin/env bash
set -euo pipefail
mkdir -p acceptance-logs
run_order() {
 local id="$1"
 psql -X -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -c "BEGIN; INSERT INTO platform_orders(platform,platform_order_id,provider_order_id,account_id,organization_id,connection_id,provider_account_id,canonical_order_id,evidence_id) VALUES ('next29','ws001a-concurrent','102872','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaad','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaae'); SELECT pg_sleep(1); COMMIT;" > "acceptance-logs/concurrent-order-$id.log" 2>&1
}
run_payment() {
 local id="$1"
 psql -X -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -c "BEGIN; INSERT INTO payment_transactions(platform,account_id,transaction_id,event_type,external_record_id,amount) VALUES ('next29','11111111-1111-4111-8111-111111111111','2446-concurrent','debit','2446-concurrent',1.000000); SELECT pg_sleep(1); COMMIT;" > "acceptance-logs/concurrent-payment-$id.log" 2>&1
}
set +e
run_order a & pa=$!
run_order b & pb=$!
wait "$pa"; oa=$?
wait "$pb"; ob=$?
run_payment a & pc=$!
run_payment b & pd=$!
wait "$pc"; fa=$?
wait "$pd"; fb=$?
set -e
echo "order exit codes $oa $ob; payment exit codes $fa $fb" | tee acceptance-logs/concurrency-summary.txt
[[ "$oa:$ob" == "0:3" || "$oa:$ob" == "3:0" ]] || { echo "HOLD: unexpected concurrent order statuses"; exit 1; }
[[ "$fa:$fb" == "0:3" || "$fa:$fb" == "3:0" ]] || { echo "HOLD: unexpected concurrent payment statuses"; exit 1; }
[[ "$(psql -X -Atqc "SELECT count(*) FROM platform_orders WHERE platform_order_id='ws001a-concurrent'")" == 1 ]]
[[ "$(psql -X -Atqc "SELECT count(*) FROM payment_transactions WHERE transaction_id='2446-concurrent'")" == 1 ]]
psql -X -Atqc "SELECT id,account_id,platform_order_id FROM platform_orders WHERE platform_order_id='ws001a-concurrent'" | tee acceptance-logs/concurrent-order-survivor.txt
psql -X -Atqc "SELECT id,account_id,transaction_id,amount::text FROM payment_transactions WHERE transaction_id='2446-concurrent'" | tee acceptance-logs/concurrent-payment-survivor.txt
# psql -v ON_ERROR_STOP=1 returns exit code 3 for a SQL statement error.
# The rejected transaction must report the expected unique index, not a different SQL failure.
if [[ "$oa" == 3 ]]; then
  grep -F 'platform_orders_uq' acceptance-logs/concurrent-order-a.log
  grep -F '23505' acceptance-logs/concurrent-order-a.log
else
  grep -F 'platform_orders_uq' acceptance-logs/concurrent-order-b.log
  grep -F '23505' acceptance-logs/concurrent-order-b.log
fi
if [[ "$fa" == 3 ]]; then
  grep -F 'payment_transactions_platform_account_transaction_event_uidx' acceptance-logs/concurrent-payment-a.log
  grep -F '23505' acceptance-logs/concurrent-payment-a.log
else
  grep -F 'payment_transactions_platform_account_transaction_event_uidx' acceptance-logs/concurrent-payment-b.log
  grep -F '23505' acceptance-logs/concurrent-payment-b.log
fi
psql -X -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -c "BEGIN; UPDATE platform_orders SET amount=0 WHERE platform_order_id='ws001a-concurrent'; ROLLBACK;" > acceptance-logs/concurrency-rollback.log 2>&1
[[ "$(psql -X -Atqc "SELECT amount IS NULL FROM platform_orders WHERE platform_order_id='ws001a-concurrent'")" == "t" ]] || { echo "FAIL: rollback changed surviving order"; exit 1; }
echo "PASS: separate psql session uniqueness and survivor counts, rollback"
