begin;
select plan(18);

insert into public.tracekit_accounts(id,account_type,name,status) values('f1200000-0000-0000-0000-000000000001','client','Firehose Test','active');
insert into public.tracekit_organizations(id,owning_account_id,name,status) values('f1200000-0000-0000-0000-000000000002','f1200000-0000-0000-0000-000000000001','Firehose Test','active');
insert into public.commerce_provider_connections(id,account_id,organization_id,provider,display_name,status) values('f1200000-0000-0000-0000-000000000003','f1200000-0000-0000-0000-000000000001','f1200000-0000-0000-0000-000000000002','everflow','Firehose Test','connected');
insert into public.commerce_provider_accounts(id,organization_id,connection_id,provider_account_external_id,status) values('f1200000-0000-0000-0000-000000000004','f1200000-0000-0000-0000-000000000002','f1200000-0000-0000-0000-000000000003','3708','active');

select is((public.ingest_everflow_firehose_event_v1('f1200000-0000-0000-0000-000000000002','f1200000-0000-0000-0000-000000000001','f1200000-0000-0000-0000-000000000003','f1200000-0000-0000-0000-000000000004','3708','click','2026-09-10T12:00:00Z','{"transaction_id":"tx-1","unix_timestamp":1715788261,"network_id":3708}'::jsonb)->>'status'),'processed','click persists');
select is((select click_at from public.everflow_click_events where transaction_id='tx-1'),to_timestamp(1715788261),'click epoch is exact UTC instant');
select public.ingest_everflow_firehose_event_v1('f1200000-0000-0000-0000-000000000002','f1200000-0000-0000-0000-000000000001','f1200000-0000-0000-0000-000000000003','f1200000-0000-0000-0000-000000000004','3708','click','2026-09-10T12:01:00Z','{"transaction_id":"tx-1","unix_timestamp":1715788261,"network_id":3708}'::jsonb);
select is((select count(*) from public.everflow_click_events where transaction_id='tx-1'),1::bigint,'duplicate click converges');

select is((public.ingest_everflow_firehose_event_v1('f1200000-0000-0000-0000-000000000002','f1200000-0000-0000-0000-000000000001','f1200000-0000-0000-0000-000000000003','f1200000-0000-0000-0000-000000000004','3708','conversion_update','2026-09-10T12:02:00Z','{"conversion_id":"cv-1","transaction_id":"tx-1","network_id":"3708","conversion_timestamp":1715788399,"update_timestamp":"1715788460","conversion_status":"approved","payout":"1.25","revenue":"2.00"}'::jsonb)->>'status'),'pending_original','update before original is staged');
select is((select count(*) from public.everflow_conversion_events where conversion_id='cv-1'),0::bigint,'pending update creates no conversion');
select is((select count(*) from public.everflow_firehose_pending_updates where conversion_id='cv-1'),1::bigint,'pending identity is scoped');

select public.ingest_everflow_firehose_event_v1('f1200000-0000-0000-0000-000000000002','f1200000-0000-0000-0000-000000000001','f1200000-0000-0000-0000-000000000003','f1200000-0000-0000-0000-000000000004','3708','conversion','2026-09-10T12:03:00Z','{"conversion_id":"cv-1","transaction_id":"tx-1","network_id":"3708","conversion_timestamp":1715788399,"conversion_status":"pending","payout":"0.50","revenue":"1.00"}'::jsonb);
select is((select status from public.everflow_conversion_events where conversion_id='cv-1'),'approved','authoritative pending update applies');
select is((select payout from public.everflow_conversion_events where conversion_id='cv-1'),1.25::numeric,'newer payout applies');
select is((select count(*) from public.everflow_firehose_pending_updates where conversion_id='cv-1'),0::bigint,'applied pending row is consumed');
select is((select count(*) from public.commerce_evidence_records where source_object_id='cv-1'),2::bigint,'original and update retain immutable evidence');
select is((select count(*) from public.commerce_managed_evidence_payloads),2::bigint,'sanitized evidence snapshots are managed');
select is((select count(*) from public.everflow_conversion_state_history where conversion_id='cv-1'),2::bigint,'original and update retain state history');

select is((public.ingest_everflow_firehose_event_v1('f1200000-0000-0000-0000-000000000002','f1200000-0000-0000-0000-000000000001','f1200000-0000-0000-0000-000000000003','f1200000-0000-0000-0000-000000000004','3708','conversion_update','2026-09-10T12:04:00Z','{"conversion_id":"cv-1","transaction_id":"tx-1","network_id":"3708","conversion_timestamp":1715788399,"update_timestamp":"1715788400","conversion_status":"rejected","payout":"0","revenue":"0"}'::jsonb)->>'status'),'stale_ignored','older authoritative update is ignored');
select is((select status from public.everflow_conversion_events where conversion_id='cv-1'),'approved','stale update cannot regress state');

select public.ingest_everflow_firehose_event_v1('f1200000-0000-0000-0000-000000000002','f1200000-0000-0000-0000-000000000001','f1200000-0000-0000-0000-000000000003','f1200000-0000-0000-0000-000000000004','3708','conversion_update','2026-09-10T12:05:00Z','{"conversion_id":"cv-1","transaction_id":"tx-1","network_id":"3708","conversion_timestamp":1715788399,"update_timestamp":1715789000,"conversion_status":"rejected","payout":"0","revenue":"0"}'::jsonb);
select is((select status from public.everflow_conversion_events where conversion_id='cv-1'),'rejected','numeric authoritative update supersedes string epoch update');
select is((select transition_type from public.everflow_conversion_state_history where conversion_id='cv-1' and status='rejected' limit 1),'reversal','status and financial change records reversal history');

select is((public.ingest_everflow_firehose_event_v1('f1200000-0000-0000-0000-000000000002','f1200000-0000-0000-0000-000000000001','f1200000-0000-0000-0000-000000000003','f1200000-0000-0000-0000-000000000004','3708','conversion_update','2026-09-10T12:06:00Z','{"conversion_id":"cv-1","transaction_id":"tx-1","network_id":"3708","conversion_timestamp":1715788399,"conversion_status":"approved","payout":"9","revenue":"9"}'::jsonb)->>'status'),'stale_ignored','missing update timestamp is weak and cannot supersede authoritative state');

select throws_ok($$select public.ingest_everflow_firehose_event_v1('f1200000-0000-0000-0000-000000000002','f1200000-0000-0000-0000-000000000001','f1200000-0000-0000-0000-000000000003','f1200000-0000-0000-0000-000000000004','9999','click',now(),'{}'::jsonb)$$,'P0001','firehose scope mismatch','wrong network fails closed');

select * from finish();
rollback;
