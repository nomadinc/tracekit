begin; select plan(28);

select has_table('public','commerce_continuous_sync_state','continuous observation state exists');
select has_table('public','commerce_sync_schedules','scheduler boundary exists');
select has_table('public','tracekit_investigation_dependencies','Investigation dependencies exist');
select has_table('public','tracekit_investigation_freshness','Investigation freshness exists');
select has_table('public','tracekit_investigation_candidates','reviewable candidates exist');
select has_column('public','commerce_sync_runs','provider_request_count','run provider request count exists');
select has_column('public','commerce_sync_runs','records_unchanged','unchanged count remains available');
select has_column('public','commerce_sync_runs','stopping_reason','stability stopping reason exists');
select has_function('public','enqueue_commerce_continuous_sync',array['uuid','uuid','uuid','uuid','text','text','text'],'idempotent scheduler RPC exists');
select has_function('public','mark_investigation_new_evidence',array['uuid','text','text','text','timestamp with time zone','text'],'freshness RPC exists');

insert into public.tracekit_accounts(id,account_type,name) values('a5000000-0000-0000-0000-000000000001','client','Continuous A');
insert into public.tracekit_organizations(id,owning_account_id,name) values('a5000000-0000-0000-0000-000000000002','a5000000-0000-0000-0000-000000000001','Continuous Org');
insert into public.commerce_provider_connections(id,account_id,organization_id,provider,display_name,status) values('a5000000-0000-0000-0000-000000000003','a5000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000002','commas','Continuous','connected');
insert into public.commerce_provider_accounts(id,connection_id,organization_id,provider_account_external_id) values('a5000000-0000-0000-0000-000000000004','a5000000-0000-0000-0000-000000000003','a5000000-0000-0000-0000-000000000002','continuous-test');

select lives_ok($sql$insert into public.commerce_continuous_sync_state(account_id,organization_id,connection_id,provider_account_id,resource,normalizer_version,evidence_contract_version) values('a5000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000002','a5000000-0000-0000-0000-000000000003','a5000000-0000-0000-0000-000000000004','transactions','v1','evidence-v1')$sql$,'observation baseline is tenant scoped');
select throws_ok($sql$insert into public.commerce_continuous_sync_state(account_id,organization_id,connection_id,provider_account_id,resource,normalizer_version,evidence_contract_version) values('a5000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000002','a5000000-0000-0000-0000-000000000003','a5000000-0000-0000-0000-000000000004','transactions','v1','evidence-v1')$sql$,'23505',null,'duplicate resource baseline is rejected');

select lives_ok($sql$select * from public.enqueue_commerce_continuous_sync('a5000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000002','a5000000-0000-0000-0000-000000000003','a5000000-0000-0000-0000-000000000004','transactions','continuous','bucket-1')$sql$,'continuous run enqueues');
select is((select count(*)::integer from public.enqueue_commerce_continuous_sync('a5000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000002','a5000000-0000-0000-0000-000000000003','a5000000-0000-0000-0000-000000000004','transactions','continuous','bucket-1')),1,'duplicate enqueue resolves existing run');
select is((select count(*)::integer from public.commerce_sync_runs where connection_id='a5000000-0000-0000-0000-000000000003'),1,'duplicate scheduling creates one run');
select throws_ok($sql$select * from public.enqueue_commerce_continuous_sync('a5000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000002','a5000000-0000-0000-0000-000000000003','a5000000-0000-0000-0000-000000000004','transactions','live','bad')$sql$,'22023',null,'scheduler cannot activate live mode');
insert into public.commerce_sync_runs(id,organization_id,connection_id,provider_account_id,sync_type,mode,scheduler_idempotency_key) values('a5000000-0000-0000-0000-000000000006','a5000000-0000-0000-0000-000000000002','a5000000-0000-0000-0000-000000000003','a5000000-0000-0000-0000-000000000004','transactions','deep_reconciliation','second-run');
select is((select count(*)::integer from public.claim_commerce_sync_run((select id from public.commerce_sync_runs where scheduler_idempotency_key='bucket-1'),'a5000000-0000-0000-0000-000000000002','a5000000-0000-0000-0000-000000000003','worker-a',60)),1,'first worker claims resource lease');
select is((select count(*)::integer from public.claim_commerce_sync_run('a5000000-0000-0000-0000-000000000006','a5000000-0000-0000-0000-000000000002','a5000000-0000-0000-0000-000000000003','worker-b',60)),0,'second mode cannot race same Connection resource');

insert into public.tracekit_investigations(id,account_id,organization_id,title,question,status,trigger_type,analysis_version) values('a5000000-0000-0000-0000-000000000010','a5000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000002','Continuous investigation','What changed?','completed','chargeback_anomaly','v1');
insert into public.tracekit_investigation_dependencies(account_id,organization_id,investigation_id,resource_type,dependency_version) values('a5000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000002','a5000000-0000-0000-0000-000000000010','transactions','v1');
select is(public.mark_investigation_new_evidence('a5000000-0000-0000-0000-000000000002','transactions',null,null,now(),'new_transaction'),1,'relevant Evidence marks one Investigation');
select is((select freshness_status from public.tracekit_investigation_freshness where investigation_id='a5000000-0000-0000-0000-000000000010'),'new_evidence_available','analytical and freshness states remain separate');

select ok((select relrowsecurity from pg_class where oid='public.commerce_continuous_sync_state'::regclass),'continuous state RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.tracekit_investigation_candidates'::regclass),'candidate RLS enabled');
select is((select count(*)::integer from information_schema.role_table_grants where table_schema='public' and table_name in('commerce_continuous_sync_state','commerce_sync_schedules','tracekit_investigation_dependencies','tracekit_investigation_freshness','tracekit_investigation_candidates') and grantee in('anon','authenticated')),0,'browser roles receive no table grants');
select is((select count(*)::integer from information_schema.role_routine_grants where routine_schema='public' and routine_name in('enqueue_commerce_continuous_sync','mark_investigation_new_evidence') and grantee in('anon','authenticated')),0,'browser roles cannot invoke worker RPCs');

select lives_ok($sql$insert into public.tracekit_investigation_candidates(account_id,organization_id,candidate_key,candidate_type,question,metric,current_value,baseline_value,sample_size,trigger_reason,source_snapshot) values('a5000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000002','stable-key','product_dispute_rate','Why elevated?','dispute_incidence',0.2,0.1,200,'mature rate above baseline','{}')$sql$,'candidate stores transparent signal inputs');
select throws_ok($sql$insert into public.tracekit_investigation_candidates(account_id,organization_id,candidate_key,candidate_type,question,metric,sample_size,trigger_reason,source_snapshot) values('a5000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000002','stable-key','product_dispute_rate','Duplicate','dispute_incidence',200,'same','{}')$sql$,'23505',null,'candidate identity deduplicates alerts');
select is((select count(*)::integer from public.commerce_repository_activation),0,'continuous migration creates no activation');
select is((select count(*)::integer from public.platform_orders where connection_id='a5000000-0000-0000-0000-000000000003'),0,'continuous migration ingests no provider records');

select * from finish(); rollback;
