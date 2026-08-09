begin; select plan(28);
select has_table('public','tracekit_investigation_runs','durable Investigation runs exist');
select has_table('public','tracekit_investigation_versions','immutable presentation versions exist');
select has_function('public','claim_tracekit_investigation_run',array['uuid','uuid','text','integer'],'atomic lease claim exists');
select has_function('public','heartbeat_tracekit_investigation_run',array['uuid','uuid','text','integer'],'heartbeat exists');
select has_function('public','finish_tracekit_investigation_run',array['uuid','uuid','text','text','bigint','integer','jsonb','text','text'],'terminal transition exists');
select has_function('public','cancel_tracekit_investigation_run',array['uuid','uuid'],'cancellation exists');
select is((select count(*)::integer from information_schema.role_table_grants where table_schema='public' and table_name='tracekit_investigation_runs' and grantee in('anon','authenticated')),0,'browser roles cannot access runs');
select is((select count(*)::integer from information_schema.role_table_grants where table_schema='public' and table_name='tracekit_investigation_versions' and grantee in('anon','authenticated')),0,'browser roles cannot access versions');
select ok((select relrowsecurity from pg_class where oid='public.tracekit_investigation_runs'::regclass),'runs use RLS');
select ok((select relrowsecurity from pg_class where oid='public.tracekit_investigation_versions'::regclass),'versions use RLS');
select col_is_null('public','tracekit_investigation_runs','lease_owner','unclaimed run has no owner');
select col_is_null('public','tracekit_investigation_runs','lease_expires_at','unclaimed run has no lease expiry');
select col_has_default('public','tracekit_investigation_runs','status','run status defaults queued');
select has_fk('public','tracekit_investigation_runs','runs are tenant-bound');
select has_fk('public','tracekit_investigation_versions','versions bind to runs');
select is((select count(*)::integer from public.commerce_repository_activation),0,'Investigation runtime creates no activation');
select is((select count(*)::integer from public.tracekit_investigation_runs where id='a4800000-0000-0000-0000-000000000020'),0,'test run is absent before fixture setup');
insert into public.tracekit_accounts(id,account_type,name) values
 ('a4800000-0000-0000-0000-000000000001','client','Investigation A'),
 ('b4800000-0000-0000-0000-000000000001','client','Investigation B');
insert into public.tracekit_organizations(id,owning_account_id,name) values
 ('a4800000-0000-0000-0000-000000000002','a4800000-0000-0000-0000-000000000001','Investigation Org A'),
 ('b4800000-0000-0000-0000-000000000002','b4800000-0000-0000-0000-000000000001','Investigation Org B');
insert into public.tracekit_investigations(id,account_id,organization_id,title,question,status,trigger_type,analysis_version) values
 ('a4800000-0000-0000-0000-000000000010','a4800000-0000-0000-0000-000000000001','a4800000-0000-0000-0000-000000000002','Synthetic','Why?','queued','chargeback_anomaly','v1');
insert into public.tracekit_investigation_runs(id,account_id,organization_id,investigation_id,idempotency_key,algorithm_version,commerce_reconciliation_version,journey_linkage_version,dispute_reconciliation_version,reason_normalization_version,cohort_definition_version,source_snapshot,evidence_cutoff_at) values
 ('a4800000-0000-0000-0000-000000000020','a4800000-0000-0000-0000-000000000001','a4800000-0000-0000-0000-000000000002','a4800000-0000-0000-0000-000000000010','same-snapshot-v1','v1','commerce-v1','journey-v2','dispute-v1','reason-v1','cohort-v1','{"orders":2}',now());
select is((select count(*)::integer from public.claim_tracekit_investigation_run('a4800000-0000-0000-0000-000000000020','a4800000-0000-0000-0000-000000000002','worker-a',60)),1,'first worker claims run');
select is((select count(*)::integer from public.claim_tracekit_investigation_run('a4800000-0000-0000-0000-000000000020','a4800000-0000-0000-0000-000000000002','worker-b',60)),0,'active lease cannot be stolen');
select is(public.heartbeat_tracekit_investigation_run('a4800000-0000-0000-0000-000000000020','a4800000-0000-0000-0000-000000000002','worker-a',60),true,'lease owner heartbeats');
select is(public.heartbeat_tracekit_investigation_run('a4800000-0000-0000-0000-000000000020','b4800000-0000-0000-0000-000000000002','worker-a',60),false,'cross-Organization heartbeat denied');
update public.tracekit_investigation_runs set lease_expires_at=now()-interval '1 second' where id='a4800000-0000-0000-0000-000000000020';
select is((select count(*)::integer from public.claim_tracekit_investigation_run('a4800000-0000-0000-0000-000000000020','a4800000-0000-0000-0000-000000000002','worker-b',60)),1,'expired lease is recoverable');
select is(public.finish_tracekit_investigation_run('a4800000-0000-0000-0000-000000000020','a4800000-0000-0000-0000-000000000002','worker-a','completed',2,1,'[]'),false,'previous owner cannot finish recovered lease');
select is(public.finish_tracekit_investigation_run('a4800000-0000-0000-0000-000000000020','a4800000-0000-0000-0000-000000000002','worker-b','completed_with_warnings',2,1,'[{"code":"synthetic"}]'),true,'current owner completes with warnings');
select is((select count(*)::integer from public.claim_tracekit_investigation_run('a4800000-0000-0000-0000-000000000020','a4800000-0000-0000-0000-000000000002','worker-c',60)),0,'terminal run cannot restart');
select throws_ok($sql$insert into public.tracekit_investigation_runs(id,account_id,organization_id,investigation_id,idempotency_key,algorithm_version,commerce_reconciliation_version,journey_linkage_version,dispute_reconciliation_version,reason_normalization_version,cohort_definition_version,source_snapshot,evidence_cutoff_at) values('a4800000-0000-0000-0000-000000000021','a4800000-0000-0000-0000-000000000001','a4800000-0000-0000-0000-000000000002','a4800000-0000-0000-0000-000000000010','same-snapshot-v1','v1','commerce-v1','journey-v2','dispute-v1','reason-v1','cohort-v1','{}',now())$sql$,'23505',null,'same snapshot/version is idempotent');
insert into public.tracekit_investigation_versions(id,account_id,organization_id,investigation_id,run_id,version_number,status,primary_signal,evidence_quality,presentation) values
 ('a4800000-0000-0000-0000-000000000030','a4800000-0000-0000-0000-000000000001','a4800000-0000-0000-0000-000000000002','a4800000-0000-0000-0000-000000000010','a4800000-0000-0000-0000-000000000020',1,'completed_with_warnings','Synthetic signal','limited','{"safe":true}');
select throws_ok($sql$update public.tracekit_investigation_versions set primary_signal='changed' where id='a4800000-0000-0000-0000-000000000030'$sql$,'55000',null,'published version cannot be overwritten');
select throws_ok($sql$delete from public.tracekit_investigation_versions where id='a4800000-0000-0000-0000-000000000030'$sql$,'55000',null,'published version cannot be deleted');
select * from finish(); rollback;
