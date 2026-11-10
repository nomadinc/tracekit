#!/usr/bin/env bash
set -euo pipefail
mkdir -p acceptance-logs
run_order() {
 local id="$1"
 psql -X -v ON_ERROR_STOP=1 -c "BEGIN; INSERT INTO platform_orders(platform,platform_order_id,provider_order_id,account_id,organization_id,connection_id,provider_account_id,canonical_order_id,evidence_id) VALUES ('next29','ws001a-concurrent','102872','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaad','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaae'); SELECT pg_sleep(1); COMMIT;" > "acceptance-logs/concurrent-order-$id.log" 2>&1
}
run_payment() {
 local id="$1"
 psql -X -v ON_ERROR_STOP=1 -c "BEGIN; INSERT INTO payment_transactions(platform,account_id,transaction_id,event_type,external_record_id,amount) VALUES ('next29','11111111-1111-4111-8111-111111111111','2446-concurrent','debit','2446-concurrent',1.000000); SELECT pg_sleep(1); COMMIT;" > "acceptance-logs/concurrent-payment-$id.log" 2>&1
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
echo "PASS: separate psql session uniqueness and survivor counts"
