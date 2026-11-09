-- WS-001A negative cases, disposable synthetic database only.
\set ON_ERROR_STOP on
DO $$
DECLARE before_count integer;
BEGIN
  SELECT count(*) INTO before_count FROM platform_orders;
  BEGIN
    INSERT INTO platform_orders(platform,platform_order_id,provider_order_id,account_id,organization_id,connection_id,provider_account_id,canonical_order_id,evidence_id,amount)
    VALUES ('next29','102872','102872','22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbd','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbe','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbf',1.000000);
    RAISE EXCEPTION 'FAIL: overlapping global order key accepted';
  EXCEPTION WHEN unique_violation THEN
    IF CONSTRAINT_NAME = 'platform_orders_uq' THEN NULL; END IF;
  END;
  IF (SELECT count(*) FROM platform_orders) <> before_count THEN RAISE EXCEPTION 'FAIL: collision changed order count'; END IF;
  IF (SELECT account_id::text FROM platform_orders WHERE platform_order_id='102872') <> '11111111-1111-4111-8111-111111111111'
    THEN RAISE EXCEPTION 'FAIL: order ownership changed'; END IF;
  BEGIN
    INSERT INTO payment_transactions(platform,account_id,transaction_id,event_type,external_record_id,organization_id,connection_id,provider_account_id,amount)
    VALUES ('next29','11111111-1111-4111-8111-111111111111','2446','debit','2446-foreign','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbd',0.000000);
    RAISE EXCEPTION 'FAIL: occupied payment event key accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  IF (SELECT count(*) FROM payment_transactions WHERE transaction_id='2446') <> 1 THEN RAISE EXCEPTION 'FAIL: payment changed'; END IF;
  IF (SELECT amount::text FROM payment_transactions WHERE transaction_id='2446') <> '19.990000'
    THEN RAISE EXCEPTION 'FAIL: original amount changed'; END IF;
END $$;
-- Verify rollback restores the row and the exact decimal.
BEGIN;
UPDATE platform_orders SET amount=0.000000 WHERE provider_order_id='102872';
ROLLBACK;
DO $$
BEGIN
 IF (SELECT amount::text FROM platform_orders WHERE provider_order_id='102872') <> '123.450000'
 THEN RAISE EXCEPTION 'FAIL: rollback failed'; END IF;
END $$;
SELECT 'PASS: synthetic collision and rollback assertions' AS result;
