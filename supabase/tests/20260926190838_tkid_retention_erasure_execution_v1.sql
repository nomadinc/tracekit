begin;
select plan(43);

select has_table('public','tkid_retention_policies','retention policy registry exists');
select has_table('public','tkid_erasure_policies','erasure policy registry exists');
select has_table('public','tkid_privacy_execution_controls','privacy executor control exists');
select has_function('public','preview_tkid_retention_selection_v1',array['uuid','uuid','integer','timestamp with time zone'],'bounded preview exists');
select has_function('public','claim_tkid_erasure_run_v1',array['text','timestamp with time zone'],'leased claim exists');
select has_function('public','get_tkid_privacy_status_v1',array['uuid','uuid'],'operator status exists');

insert into public.tracekit_accounts(id,account_type,name,status) values
('d6200000-0000-0000-0000-000000000001','client','M2 Account','active'),
('d6200000-0000-0000-0000-000000000011','client','M2 Other','active');
insert into public.tracekit_organizations(id,owning_account_id,name,status) values
('d6200000-0000-0000-0000-000000000002','d6200000-0000-0000-0000-000000000001','M2 Org','active'),
('d6200000-0000-0000-0000-000000000012','d6200000-0000-0000-0000-000000000011','M2 Other Org','active');
insert into public.tracekit_business_contexts(id,account_id,organization_id,name,status) values
('m2-context','d6200000-0000-0000-0000-000000000001','d6200000-0000-0000-0000-000000000002','M2 Context','active'),
('m2-other','d6200000-0000-0000-0000-000000000011','d6200000-0000-0000-0000-000000000012','M2 Other Context','active');

insert into public.tkid_retention_policies(id,status,retention_seconds,grace_seconds,data_classes,selector_version,provenance,description,approved_at) values
('tkret_active_v1','active',86400,3600,array['journey','event','event_evidence'],'tkid-retention-selector-v1','test-approved','Active test policy','2026-09-01'),
('tkret_draft_v1','draft',86400,0,array['journey'],'tkid-retention-selector-v1','test-draft','Draft test policy',null),
('tkret_retired_v1','retired',86400,0,array['journey'],'tkid-retention-selector-v1','test-retired','Retired test policy',null);
insert into public.tkid_erasure_policies(id,status,object_classes,preservation_exceptions,execution_strategy,provenance,description,approved_at) values
('tkerase_active_v1','active',array['journey','browser_session','event','event_evidence','commerce_link'],array['canonical_commerce','attribution_identity'],'tkid-object-first-v1','test-approved','Active test erasure','2026-09-01'),
('tkerase_draft_v1','draft',array['journey'],array['canonical_commerce'],'tkid-object-first-v1','test-draft','Draft test erasure',null);

insert into public.tkid_sources(id,account_id,organization_id,business_context_id,public_source_id,environment,status,allowed_origins,retention_policy_id,erasure_policy_id,abuse_adapter,proof_max_journeys,proof_max_events,proof_starts_at,proof_ends_at)
values('d6200000-0000-4000-8000-000000000003','d6200000-0000-0000-0000-000000000001','d6200000-0000-0000-0000-000000000002','m2-context','tksrc_m2retentionproof01','production','shadow',array['https://m2.example'],'tkid-v1-review-required',null,'supabase_fixed_window_v1',50,1000,'2026-09-01','2026-10-01'),
('d6200000-0000-4000-8000-000000000013','d6200000-0000-0000-0000-000000000011','d6200000-0000-0000-0000-000000000012','m2-other','tksrc_m2retentionproof02','production','shadow',array['https://other.example'],'tkret_active_v1','tkerase_active_v1','supabase_fixed_window_v1',50,1000,'2026-09-01','2026-10-01');

select throws_ok($sql$select public.set_tkid_source_ingestion_state_v1('d6200000-0000-0000-0000-000000000002','d6200000-0000-4000-8000-000000000003','enabled','test',null,'m2-retention-missing','set-tkid-source-ingestion-state')$sql$,'55000','retention_policy_unapproved','placeholder retention policy blocks start');
update public.tkid_sources set retention_policy_id='tkret_draft_v1' where id='d6200000-0000-4000-8000-000000000003';
select throws_ok($sql$select public.set_tkid_source_ingestion_state_v1('d6200000-0000-0000-0000-000000000002','d6200000-0000-4000-8000-000000000003','enabled','test',null,'m2-retention-draft','set-tkid-source-ingestion-state')$sql$,'55000','retention_policy_unapproved','draft retention policy blocks start');
update public.tkid_sources set retention_policy_id='tkret_retired_v1' where id='d6200000-0000-4000-8000-000000000003';
select throws_ok($sql$select public.set_tkid_source_ingestion_state_v1('d6200000-0000-0000-0000-000000000002','d6200000-0000-4000-8000-000000000003','enabled','test',null,'m2-retention-retired','set-tkid-source-ingestion-state')$sql$,'55000','retention_policy_unapproved','retired retention policy blocks start');
update public.tkid_sources set retention_policy_id='tkret_active_v1' where id='d6200000-0000-4000-8000-000000000003';
select throws_ok($sql$select public.set_tkid_source_ingestion_state_v1('d6200000-0000-0000-0000-000000000002','d6200000-0000-4000-8000-000000000003','enabled','test',null,'m2-erasure-missing','set-tkid-source-ingestion-state')$sql$,'55000','erasure_policy_unapproved','missing erasure policy blocks start');
update public.tkid_sources set erasure_policy_id='tkerase_draft_v1' where id='d6200000-0000-4000-8000-000000000003';
select throws_ok($sql$select public.set_tkid_source_ingestion_state_v1('d6200000-0000-0000-0000-000000000002','d6200000-0000-4000-8000-000000000003','enabled','test',null,'m2-erasure-draft','set-tkid-source-ingestion-state')$sql$,'55000','erasure_policy_unapproved','draft erasure policy blocks start');
update public.tkid_sources set erasure_policy_id='tkerase_active_v1' where id='d6200000-0000-4000-8000-000000000003';
select throws_ok($sql$select public.set_tkid_source_ingestion_state_v1('d6200000-0000-0000-0000-000000000002','d6200000-0000-4000-8000-000000000003','enabled','test',null,'m2-executor-disabled','set-tkid-source-ingestion-state')$sql$,'55000','privacy_executor_disabled','disabled executor blocks start');

select is((select execution_state from public.set_tkid_privacy_executor_state_v1('d6200000-0000-0000-0000-000000000002','d6200000-0000-4000-8000-000000000003','enabled','test enable',null,'m2-executor-enable','set-tkid-privacy-executor-state')),'enabled','approved executor can be enabled');
select is((select ingestion_state from public.set_tkid_source_ingestion_state_v1('d6200000-0000-0000-0000-000000000002','d6200000-0000-4000-8000-000000000003','enabled','test start',null,'m2-ingestion-enable','set-tkid-source-ingestion-state')),'enabled','approved policies permit M1 start');

insert into public.tkid_source_origins(id,account_id,organization_id,business_context_id,source_id,canonical_origin,role,lifecycle_status,verification_state,verified_at)
values('d6200000-0000-4000-8000-000000000030','d6200000-0000-0000-0000-000000000001','d6200000-0000-0000-0000-000000000002','m2-context','d6200000-0000-4000-8000-000000000003','https://m2.example','frontend','active','verified','2026-08-01');
insert into public.tkid_journeys(id,account_id,organization_id,business_context_id,source_id,started_at,expires_at,state,privacy_mode,source_version,normalizer_version) values
('d6200000-0000-4000-8000-000000000004','d6200000-0000-0000-0000-000000000001','d6200000-0000-0000-0000-000000000002','m2-context','d6200000-0000-4000-8000-000000000003','2026-09-20','2026-09-20 02:00','completed','essential','v1','v1'),
('d6200000-0000-4000-8000-000000000005','d6200000-0000-0000-0000-000000000001','d6200000-0000-0000-0000-000000000002','m2-context','d6200000-0000-4000-8000-000000000003','2026-09-25 12:00','2026-09-25 14:00','completed','essential','v1','v1');
insert into public.tkid_browser_sessions(id,organization_id,journey_id,source_id,started_at,last_seen_at,expires_at,device_class,browser_family,os_family)
values('d6200000-0000-4000-8000-000000000006','d6200000-0000-0000-0000-000000000002','d6200000-0000-4000-8000-000000000004','d6200000-0000-4000-8000-000000000003','2026-09-20','2026-09-20 00:10','2026-09-20 02:00','desktop','browser','os');
insert into public.tkid_event_evidence(id,organization_id,source_id,event_id,evidence_hash,schema_version,bounded_payload,received_at,origin_id)
values('d6200000-0000-4000-8000-000000000007','d6200000-0000-0000-0000-000000000002','d6200000-0000-4000-8000-000000000003','d6200000-0000-4000-8000-000000000008',repeat('a',64),1,'{"milestone":"sensitive"}','2026-09-20','d6200000-0000-4000-8000-000000000030');
insert into public.tkid_events(id,organization_id,journey_id,browser_session_id,source_id,evidence_id,event_name,schema_version,normalizer_version,occurred_at,received_at,privacy_mode,origin_id,milestone,displayed_descriptor)
values('d6200000-0000-4000-8000-000000000008','d6200000-0000-0000-0000-000000000002','d6200000-0000-4000-8000-000000000004','d6200000-0000-4000-8000-000000000006','d6200000-0000-4000-8000-000000000003','d6200000-0000-4000-8000-000000000007','vsl_milestone',1,'v1','2026-09-20','2026-09-20','essential','d6200000-0000-4000-8000-000000000030','50_percent','sensitive descriptor');

insert into public.platform_orders(platform,platform_order_id,order_ts,status,canonical_order_id,account_id,organization_id)
values('fixture','m2-order','2026-09-20','observed','d6200000-0000-4000-8000-000000000099','d6200000-0000-0000-0000-000000000001','d6200000-0000-0000-0000-000000000002');
insert into public.tkid_checkout_sessions(id,organization_id,journey_id,browser_session_id,source_id,started_at,server_confirmed_at,state)
values('d6200000-0000-4000-8000-000000000009','d6200000-0000-0000-0000-000000000002','d6200000-0000-4000-8000-000000000004','d6200000-0000-4000-8000-000000000006','d6200000-0000-4000-8000-000000000003','2026-09-20','2026-09-20 00:20','server_confirmed');
insert into public.tkid_commerce_links(id,organization_id,journey_id,checkout_session_id,canonical_order_id,charge_reference,sequence_position,relationship)
values('d6200000-0000-4000-8000-000000000010','d6200000-0000-0000-0000-000000000002','d6200000-0000-4000-8000-000000000004','d6200000-0000-4000-8000-000000000009','d6200000-0000-4000-8000-000000000099','sensitive-charge',0,'main');

select is((select count(*)::integer from public.preview_tkid_retention_selection_v1('d6200000-0000-0000-0000-000000000002','d6200000-0000-4000-8000-000000000003',1,'2026-09-26')) ,1,'selection is bounded');
select is((select journey_id from public.preview_tkid_retention_selection_v1('d6200000-0000-0000-0000-000000000002','d6200000-0000-4000-8000-000000000003',25,'2026-09-26')),'d6200000-0000-4000-8000-000000000004'::uuid,'deterministic cutoff selects only old journey');
select ok((select created from public.create_tkid_retention_erasure_runs_v1('d6200000-0000-0000-0000-000000000002','d6200000-0000-4000-8000-000000000003',25,'2026-09-26',null,'m2-create-runs','create-tkid-retention-erasure-runs')),'first run is created');
select is((select count(*)::integer from public.create_tkid_retention_erasure_runs_v1('d6200000-0000-0000-0000-000000000002','d6200000-0000-4000-8000-000000000003',25,'2026-09-26',null,'m2-create-runs-repeat','create-tkid-retention-erasure-runs')),0,'repeat selection schedules no duplicate');
select is((select selected_object_count from public.tkid_erasure_runs where journey_id='d6200000-0000-4000-8000-000000000004'),1,'run records explicit object count');

select is((select count(*)::integer from public.claim_tkid_erasure_run_v1('worker-a','2026-09-26 01:00')),1,'worker claims one run');
select is((select count(*)::integer from public.claim_tkid_erasure_run_v1('worker-b','2026-09-26 01:00')),0,'active lease prevents concurrent claim');
select ok(public.erase_tkid_erasure_object_v1((select id from public.tkid_erasure_runs where journey_id='d6200000-0000-4000-8000-000000000004'),(select id from public.tkid_erasure_objects limit 1),'worker-a','2026-09-26 01:01'),'object erase succeeds');
select ok(public.erase_tkid_erasure_object_v1((select id from public.tkid_erasure_runs where journey_id='d6200000-0000-4000-8000-000000000004'),(select id from public.tkid_erasure_objects limit 1),'worker-a','2026-09-26 01:01'),'object retry is idempotent');
select ok(public.complete_tkid_erasure_run_v2((select id from public.tkid_erasure_runs where journey_id='d6200000-0000-4000-8000-000000000004'),'worker-a','2026-09-26 01:02'),'leased run completes');
select is((select state from public.tkid_journeys where id='d6200000-0000-4000-8000-000000000004'),'erased','Journey is erased');
select is((select completeness from public.tkid_journeys where id='d6200000-0000-4000-8000-000000000004'),'erased','Journey completeness is erased');
select is((select bounded_payload from public.tkid_event_evidence where id='d6200000-0000-4000-8000-000000000007'),'{}'::jsonb,'behavioral evidence is redacted');
select is((select milestone from public.tkid_events where id='d6200000-0000-4000-8000-000000000008'),null,'behavioral event fields are redacted');
select is((select device_class from public.tkid_browser_sessions where id='d6200000-0000-4000-8000-000000000006'),null,'device fields are redacted');
select is((select canonical_order_id from public.tkid_commerce_links where id='d6200000-0000-4000-8000-000000000010'),'d6200000-0000-4000-8000-000000000099'::uuid,'canonical Commerce identity is preserved');
select is((select count(*)::integer from public.platform_orders where canonical_order_id='d6200000-0000-4000-8000-000000000099'),1,'canonical Commerce row is preserved');
select ok((select tkid_erased_at is not null and charge_reference like 'erased:%' from public.tkid_commerce_links where id='d6200000-0000-4000-8000-000000000010'),'TKID linkage is redacted');
update public.tkid_erasure_runs set status='queued',completed_at=null,next_attempt_at='2026-09-26 02:00',lease_owner=null,lease_expires_at=null where journey_id='d6200000-0000-4000-8000-000000000004';
update public.tkid_erasure_objects set object_type='protected_evidence',status='pending',erased_at=null,last_error_code=null where erasure_run_id=(select id from public.tkid_erasure_runs where journey_id='d6200000-0000-4000-8000-000000000004');
select is((select count(*)::integer from public.claim_tkid_erasure_run_v1('worker-retry','2026-09-26 02:00')),1,'retry worker claims queued run');
select isnt(public.erase_tkid_erasure_object_v1((select id from public.tkid_erasure_runs where journey_id='d6200000-0000-4000-8000-000000000004'),(select id from public.tkid_erasure_objects limit 1),'worker-retry','2026-09-26 02:01'),true,'unsupported object fails closed without losing failure evidence');
select is((select status from public.tkid_erasure_objects limit 1),'failed','object failure is durable');
select ok(public.fail_tkid_erasure_run_v1((select id from public.tkid_erasure_runs where journey_id='d6200000-0000-4000-8000-000000000004'),'worker-retry','unsupported_object_type','2026-09-26 02:02'),'failed run is checkpointed without raw values');
select ok(public.retry_tkid_erasure_run_v1((select id from public.tkid_erasure_runs where journey_id='d6200000-0000-4000-8000-000000000004'),'d6200000-0000-0000-0000-000000000002','m2-retry-safe-failure','retry-tkid-erasure-run'),'operator can safely queue a failed run for retry');
select is((select count(*)::integer from public.tkid_erasure_runs where organization_id='d6200000-0000-0000-0000-000000000012'),0,'other Organization remains isolated');
select ok((select executor_enabled from public.get_tkid_privacy_status_v1('d6200000-0000-0000-0000-000000000002','d6200000-0000-4000-8000-000000000003')),'operator status reports enabled executor');
select is((select count(*)::integer from public.list_tkid_erasure_failures_v1('d6200000-0000-0000-0000-000000000002','d6200000-0000-4000-8000-000000000003',25)),0,'failure inspection is bounded and empty after success');
select ok(not has_function_privilege('anon','public.get_tkid_privacy_status_v1(uuid,uuid)','execute'),'status is not browser executable');
select ok(has_function_privilege('service_role','public.get_tkid_privacy_status_v1(uuid,uuid)','execute'),'status is service-role executable');
select is((select count(*)::integer from public.tracekit_audit_events where action in ('tkid.retention_runs_created','tkid.retention_erasure_completed') and metadata::text ~* '(sensitive descriptor|sensitive-charge)'),0,'audit evidence contains no raw sensitive values');

select * from finish();
rollback;
