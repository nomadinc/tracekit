begin;
select plan(17);

select has_table('public','commerce_order_lines','Order Lines exist');
select has_table('public','commerce_historical_disputes','historical disputes exist');
select has_table('public','commerce_dispute_reconciliations','versioned dispute reconciliation exists');
select has_function('public','normalize_commerce_transaction_page_v1',array['uuid','uuid','uuid','uuid','uuid','jsonb'],'atomic normalizer exists');

insert into public.tracekit_accounts(id,account_type,name,status) values ('81000000-0000-0000-0000-000000000001','client','Synthetic Commerce Test','active');
insert into public.tracekit_organizations(id,owning_account_id,name,status) values ('81000000-0000-0000-0000-000000000002','81000000-0000-0000-0000-000000000001','Synthetic Commerce Test','active');
insert into public.commerce_provider_connections(id,account_id,organization_id,provider,display_name,environment,status) values ('81000000-0000-0000-0000-000000000003','81000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000002','commas','Synthetic','production','connected');
insert into public.commerce_provider_accounts(id,connection_id,organization_id,provider_account_external_id,status) values ('81000000-0000-0000-0000-000000000004','81000000-0000-0000-0000-000000000003','81000000-0000-0000-0000-000000000002','synthetic','active');
insert into public.commerce_sync_runs(id,connection_id,provider_account_id,organization_id,sync_type,mode,status) values ('81000000-0000-0000-0000-000000000005','81000000-0000-0000-0000-000000000003','81000000-0000-0000-0000-000000000004','81000000-0000-0000-0000-000000000002','transaction_test','shadow','running');
insert into public.commerce_evidence_records(id,organization_id,connection_id,provider_account_id,sync_run_id,source_object_type,source_object_id,payload_hash,storage_backend,storage_reference,content_type,byte_size,observed_at,pii_classification,retention_policy)
values ('81000000-0000-0000-0000-000000000006','81000000-0000-0000-0000-000000000002','81000000-0000-0000-0000-000000000003','81000000-0000-0000-0000-000000000004','81000000-0000-0000-0000-000000000005','transaction_page','synthetic-page','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','object_storage','commerce-evidence/synthetic/test','application/json',2,now(),'sensitive','test');

create temp table first_normalization as select records_seen,orders_created,orders_updated from public.normalize_commerce_transaction_page_v1(
 '81000000-0000-0000-0000-000000000002','81000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000003','81000000-0000-0000-0000-000000000004','81000000-0000-0000-0000-000000000006',
 '[{"transaction_id":"tx-1","platform_order_id":"commas:synthetic:tx-1","canonical_order_id":"82000000-0000-0000-0000-000000000001","order_mapping_id":"82000000-0000-0000-0000-000000000002","order_line_id":"82000000-0000-0000-0000-000000000003","sale_event_id":"82000000-0000-0000-0000-000000000004","fee_event_id":"82000000-0000-0000-0000-000000000005","fan_id":"fan-1","person_id":"82000000-0000-0000-0000-000000000006","customer_identity_id":"82000000-0000-0000-0000-000000000007","email_identity_id":"82000000-0000-0000-0000-000000000008","customer_email":"synthetic@example.invalid","product_id":"product-1","product_uuid":"82000000-0000-0000-0000-000000000009","product_title":"Synthetic Product","product_price":"100","transaction_at":"2026-01-01T00:00:00Z","gross_amount":"100","provider_fee":"3","provider_net":"97","payment_reference":"payment-1","payment_type":"card","fund_released":"false","payload_hash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}]'::jsonb);
select is((select concat_ws(',',records_seen,orders_created,orders_updated) from first_normalization),'1,1,0','first normalization creates one Order');

select is((select count(*)::integer from public.platform_orders where connection_id='81000000-0000-0000-0000-000000000003'),1,'one canonical Order');
select is((select count(*)::integer from public.people where organization_id='81000000-0000-0000-0000-000000000002'),1,'one Person');
select is((select count(*)::integer from public.commerce_provider_products where connection_id='81000000-0000-0000-0000-000000000003'),1,'one observed Product');
select is((select mapping_status from public.commerce_provider_products where connection_id='81000000-0000-0000-0000-000000000003'),'review_required','unknown Product fails closed');
select is((select count(*)::integer from public.commerce_order_lines where connection_id='81000000-0000-0000-0000-000000000003'),1,'one Order Line');
select is((select count(*)::integer from public.conversions where connection_id='81000000-0000-0000-0000-000000000003'),2,'sale and Provider-observed fee events');

create temp table replay_normalization as select records_seen,orders_created,orders_updated from public.normalize_commerce_transaction_page_v1(
 '81000000-0000-0000-0000-000000000002','81000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000003','81000000-0000-0000-0000-000000000004','81000000-0000-0000-0000-000000000006',
 '[{"transaction_id":"tx-1","platform_order_id":"commas:synthetic:tx-1","canonical_order_id":"82000000-0000-0000-0000-000000000001","order_mapping_id":"82000000-0000-0000-0000-000000000002","order_line_id":"82000000-0000-0000-0000-000000000003","sale_event_id":"82000000-0000-0000-0000-000000000004","fee_event_id":"82000000-0000-0000-0000-000000000005","fan_id":"fan-1","person_id":"82000000-0000-0000-0000-000000000006","customer_identity_id":"82000000-0000-0000-0000-000000000007","email_identity_id":"82000000-0000-0000-0000-000000000008","customer_email":"synthetic@example.invalid","product_id":"product-1","product_uuid":"82000000-0000-0000-0000-000000000009","product_title":"Synthetic Product","product_price":"100","transaction_at":"2026-01-01T00:00:00Z","gross_amount":"100","provider_fee":"3","provider_net":"97","payment_reference":"payment-1","payment_type":"card","fund_released":"false","payload_hash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}]'::jsonb);
select is((select concat_ws(',',records_seen,orders_created,orders_updated) from replay_normalization),'1,0,1','replay updates without duplication');
select is((select count(*)::integer from public.platform_orders where connection_id='81000000-0000-0000-0000-000000000003'),1,'replay keeps one Order');
select is((select count(*)::integer from public.conversions where connection_id='81000000-0000-0000-0000-000000000003'),2,'replay keeps financial events idempotent');
select is((select count(*)::integer from public.commerce_repository_activation),0,'migration and normalization create no activation');
select ok((select relrowsecurity from pg_class where oid='public.commerce_order_lines'::regclass),'Order Lines RLS enabled');
select is((select count(*)::integer from information_schema.role_table_grants where table_schema='public' and table_name='commerce_historical_disputes' and grantee in ('anon','authenticated')),0,'browser roles have no dispute table grants');

select * from finish();
rollback;
