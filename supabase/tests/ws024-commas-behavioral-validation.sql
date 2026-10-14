\set ON_ERROR_STOP on
\echo 'WS024: verifying target and migration'
DO $$ BEGIN
 IF current_database()<>'postgres' OR inet_server_port()<>5432 OR inet_server_addr() IS NULL THEN RAISE EXCEPTION 'Unexpected database target'; END IF;
 IF (SELECT max(version) FROM supabase_migrations.schema_migrations)<>'20261013175844' THEN RAISE EXCEPTION 'Unexpected migration version'; END IF;
END $$;
BEGIN;
CREATE TEMP TABLE ws024_ids AS SELECT gen_random_uuid() account_id,gen_random_uuid() org_id,gen_random_uuid() conn_id,gen_random_uuid() provider_id,gen_random_uuid() order_id,gen_random_uuid() excluded_evidence_id,gen_random_uuid() valid_evidence_id,gen_random_uuid() excluded_obs_id,gen_random_uuid() valid_obs_id;
INSERT INTO public.tracekit_accounts(id,account_type,name,status) SELECT account_id,'client','WS024 Synthetic Commas','active' FROM ws024_ids;
INSERT INTO public.tracekit_organizations(id,owning_account_id,name,status) SELECT org_id,account_id,'WS024 Synthetic Commas Org','active' FROM ws024_ids;
INSERT INTO public.commerce_provider_connections(id,account_id,organization_id,provider,display_name,environment,status,external_account_id) SELECT conn_id,account_id,org_id,'commas','WS024 Synthetic Commas','sandbox','connected','ws024-synthetic' FROM ws024_ids;
INSERT INTO public.commerce_provider_accounts(id,connection_id,organization_id,provider_account_external_id,provider_account_label,status) SELECT provider_id,conn_id,org_id,'ws024-synthetic-provider','WS024 Synthetic','active' FROM ws024_ids;
INSERT INTO public.platform_orders(platform,platform_order_id,order_ts,status,currency,canonical_order_id,account_id,organization_id,connection_id,provider_account_id,workspace_id) SELECT 'commas','ws024-synthetic-order-'||order_id::text,now(),'paid','USD',order_id,account_id,org_id,conn_id,provider_id,org_id::text FROM ws024_ids;
INSERT INTO public.commerce_evidence_records(id,organization_id,connection_id,provider_account_id,source_object_type,source_object_id,payload_hash,storage_backend,storage_reference,byte_size,observed_at,pii_classification,retention_policy,metadata)
SELECT ev,org_id,conn_id,provider_id,'commas_refund_created_webhook','ws024-'||ev::text,repeat('a',64),'managed_evidence_store','ws024-test-only://' || ev::text,12,now(),'restricted','standard','{}'::jsonb FROM ws024_ids CROSS JOIN LATERAL (VALUES (excluded_evidence_id),(valid_evidence_id)) v(ev);
INSERT INTO public.commerce_refund_forward_epochs(organization_id,connection_id,provider_account_id,provider,policy_version,activated_at) SELECT org_id,conn_id,provider_id,'commas','commas-refund-created-seller-cost-v1',now()-interval '1 day' FROM ws024_ids;
INSERT INTO public.commerce_refund_created_observations(id,organization_id,account_id,connection_id,provider_account_id,provider_event_id,provider_refund_hashid,original_payment_id,canonical_order_id,order_match_state,evidence_id,payload_hash,status,refund_type,buyer_amount,seller_refund_cost,creator_amount,currency,provider_created_at,financial_state)
SELECT obs,org_id,account_id,conn_id,provider_id,event_id,refund_id,'ws024-payment',order_id,'exact_ord',ev,repeat('a',64),'success','full',20,10,10,'USD',now(),'eligible_not_yet_enabled' FROM ws024_ids CROSS JOIN LATERAL (VALUES (excluded_obs_id,excluded_evidence_id,'ws024-excluded','ws024-refund-excluded'),(valid_obs_id,valid_evidence_id,'ws024-valid','ws024-refund-valid')) v(obs,ev,event_id,refund_id);
INSERT INTO public.commerce_refund_created_exclusions(observation_id,reason,confirmation_provenance,confirmation_note) SELECT excluded_obs_id,'provider_reported_test_data','user_report_of_provider_confirmation','WS024 synthetic test only' FROM ws024_ids;
DO $$ DECLARE r record; result boolean; n integer; BEGIN SELECT * INTO r FROM ws024_ids;
SELECT public.post_commas_refund_created_seller_cost_v1(r.org_id,r.conn_id,r.provider_id,'ws024-excluded') INTO result;
IF result IS DISTINCT FROM false THEN RAISE EXCEPTION 'Excluded refund returned %',result; END IF;
SELECT count(*) INTO n FROM public.conversions WHERE organization_id=r.org_id; IF n<>0 THEN RAISE EXCEPTION 'Excluded refund posted % rows',n; END IF;
RAISE NOTICE 'PASS: excluded refund blocked despite active epoch';
SELECT public.post_commas_refund_created_seller_cost_v1(r.org_id,r.conn_id,r.provider_id,'ws024-valid') INTO result;
IF result IS DISTINCT FROM true THEN RAISE EXCEPTION 'Valid refund returned %',result; END IF;
SELECT count(*) INTO n FROM public.conversions WHERE organization_id=r.org_id AND ledger_type='refund' AND amount=-10; IF n<>1 THEN RAISE EXCEPTION 'Expected one negative refund ledger entry, got %',n; END IF;
RAISE NOTICE 'PASS: valid refund posts one negative entry';
SELECT public.post_commas_refund_created_seller_cost_v1(r.org_id,r.conn_id,r.provider_id,'ws024-valid') INTO result;
SELECT count(*) INTO n FROM public.conversions WHERE organization_id=r.org_id; IF result IS DISTINCT FROM true OR n<>1 THEN RAISE EXCEPTION 'Replay failed, result %, count %',result,n; END IF;
RAISE NOTICE 'PASS: idempotent replay';
BEGIN PERFORM public.post_commas_refund_created_seller_cost_v1(gen_random_uuid(),r.conn_id,r.provider_id,'ws024-valid'); RAISE EXCEPTION 'Wrong organization unexpectedly succeeded'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='refund observation unavailable' THEN RAISE NOTICE 'PASS: wrong organization rejected'; ELSE RAISE; END IF; END;
BEGIN PERFORM public.post_commas_refund_created_seller_cost_v1(r.org_id,r.conn_id,gen_random_uuid(),'ws024-valid'); RAISE EXCEPTION 'Wrong provider unexpectedly succeeded'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='refund observation unavailable' THEN RAISE NOTICE 'PASS: wrong provider rejected'; ELSE RAISE; END IF; END;
SELECT count(*) INTO n FROM public.conversions WHERE organization_id<>r.org_id; IF n<>0 THEN RAISE EXCEPTION 'Unrelated financial entries appeared'; END IF;
RAISE NOTICE 'PASS: unrelated ledger untouched'; END $$;
ROLLBACK;
SELECT count(*) AS remaining_ws024_accounts FROM public.tracekit_accounts WHERE name='WS024 Synthetic Commas';
SELECT count(*) AS remaining_ws024_postings FROM public.conversions WHERE idempotency_key LIKE 'refund_created:commas-refund-created-seller-cost-v1:ws024-%';
