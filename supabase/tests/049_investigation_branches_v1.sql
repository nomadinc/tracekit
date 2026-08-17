begin; select plan(31);

select col_is_null('public','tracekit_investigations','parent_investigation_id','root Investigation has no parent by default');
select col_is_null('public','tracekit_investigations','parent_investigation_version_id','root Investigation has no parent version by default');
select has_fk('public','tracekit_investigations','branch relationship is foreign-key protected');
select has_function('public','tracekit_investigation_branch_guard',array[]::text[],'cycle guard exists');
select is((select count(*)::integer from information_schema.role_routine_grants where routine_schema='public' and routine_name in('tracekit_investigation_branch_guard','tracekit_investigation_branch_immutable_guard') and grantee in('anon','authenticated')),0,'browser roles cannot execute branch guards');
revoke all privileges on function public.tracekit_investigation_branch_guard(), public.tracekit_investigation_branch_immutable_guard() from public, anon, authenticated, service_role;
select ok(has_function_privilege('postgres','public.tracekit_investigation_branch_guard()','execute'),'branch guard owner retains execution');
select ok(has_function_privilege('postgres','public.tracekit_investigation_branch_immutable_guard()','execute'),'branch immutable guard owner retains execution');
select ok(not has_function_privilege('service_role','public.tracekit_investigation_branch_guard()','execute'),'service_role cannot execute branch guard');
select ok(not has_function_privilege('service_role','public.tracekit_investigation_branch_immutable_guard()','execute'),'service_role cannot execute branch immutable guard');
select ok(not has_function_privilege('public','public.tracekit_investigation_branch_guard()','execute'),'PUBLIC cannot execute branch guard');
select ok(not has_function_privilege('anon','public.tracekit_investigation_branch_guard()','execute'),'anon cannot execute branch guard');
select ok(not has_function_privilege('authenticated','public.tracekit_investigation_branch_guard()','execute'),'authenticated cannot execute branch guard');
select ok(not has_function_privilege('public','public.tracekit_investigation_branch_immutable_guard()','execute'),'PUBLIC cannot execute branch immutable guard');
select ok(not has_function_privilege('anon','public.tracekit_investigation_branch_immutable_guard()','execute'),'anon cannot execute branch immutable guard');
select ok(not has_function_privilege('authenticated','public.tracekit_investigation_branch_immutable_guard()','execute'),'authenticated cannot execute branch immutable guard');
select is((select count(*)::integer from pg_trigger where not tgisinternal and tgfoid='public.tracekit_investigation_branch_guard()'::regprocedure and tgrelid='public.tracekit_investigations'::regclass),1,'branch cycle trigger targets exact guard');
select is((select count(*)::integer from pg_trigger where not tgisinternal and tgfoid='public.tracekit_investigation_branch_immutable_guard()'::regprocedure and tgrelid='public.tracekit_investigations'::regclass),1,'branch immutable trigger targets exact guard');

insert into public.tracekit_accounts(id,account_type,name) values
 ('a4900000-0000-0000-0000-000000000001','client','Branch A'),
 ('b4900000-0000-0000-0000-000000000001','client','Branch B');
insert into public.tracekit_organizations(id,owning_account_id,name) values
 ('a4900000-0000-0000-0000-000000000002','a4900000-0000-0000-0000-000000000001','Branch Org A'),
 ('b4900000-0000-0000-0000-000000000002','b4900000-0000-0000-0000-000000000001','Branch Org B');
insert into public.tracekit_investigations(id,account_id,organization_id,title,question,status,trigger_type,analysis_version) values
 ('a4900000-0000-0000-0000-000000000010','a4900000-0000-0000-0000-000000000001','a4900000-0000-0000-0000-000000000002','Parent A','Why?','completed','chargeback_anomaly','v3'),
 ('a4900000-0000-0000-0000-000000000011','a4900000-0000-0000-0000-000000000001','a4900000-0000-0000-0000-000000000002','Other A','Why else?','draft','chargeback_anomaly','v1'),
 ('b4900000-0000-0000-0000-000000000010','b4900000-0000-0000-0000-000000000001','b4900000-0000-0000-0000-000000000002','Parent B','Why?','completed','chargeback_anomaly','v1');
insert into public.tracekit_investigation_runs(id,account_id,organization_id,investigation_id,status,idempotency_key,algorithm_version,commerce_reconciliation_version,journey_linkage_version,dispute_reconciliation_version,reason_normalization_version,cohort_definition_version,source_snapshot,evidence_cutoff_at) values
 ('a4900000-0000-0000-0000-000000000020','a4900000-0000-0000-0000-000000000001','a4900000-0000-0000-0000-000000000002','a4900000-0000-0000-0000-000000000010','completed','parent-v3','v3','commerce-v1','journey-v2','dispute-v1','reason-v1','cohort-v3','{}',now()),
 ('a4900000-0000-0000-0000-000000000021','a4900000-0000-0000-0000-000000000001','a4900000-0000-0000-0000-000000000002','a4900000-0000-0000-0000-000000000011','completed','other-v1','v1','commerce-v1','journey-v2','dispute-v1','reason-v1','cohort-v1','{}',now());
insert into public.tracekit_investigation_versions(id,account_id,organization_id,investigation_id,run_id,version_number,status,primary_signal,evidence_quality,presentation) values
 ('a4900000-0000-0000-0000-000000000030','a4900000-0000-0000-0000-000000000001','a4900000-0000-0000-0000-000000000002','a4900000-0000-0000-0000-000000000010','a4900000-0000-0000-0000-000000000020',3,'completed_with_warnings','Parent signal','medium','{"safe":true}'),
 ('a4900000-0000-0000-0000-000000000031','a4900000-0000-0000-0000-000000000001','a4900000-0000-0000-0000-000000000002','a4900000-0000-0000-0000-000000000011','a4900000-0000-0000-0000-000000000021',1,'completed','Other signal','medium','{"safe":true}');

insert into public.tracekit_investigations(id,account_id,organization_id,title,question,status,trigger_type,analysis_version,parent_investigation_id,parent_investigation_version_id,branch_signal,branch_reason) values
 ('a4900000-0000-0000-0000-000000000012','a4900000-0000-0000-0000-000000000001','a4900000-0000-0000-0000-000000000002','Child A','Why child?','completed_with_warnings','investigation_branch','child-v1','a4900000-0000-0000-0000-000000000010','a4900000-0000-0000-0000-000000000030','Parent signal','Narrower reviewed question');
select is((select parent_investigation_id from public.tracekit_investigations where id='a4900000-0000-0000-0000-000000000012'),'a4900000-0000-0000-0000-000000000010'::uuid,'same-Organization child binds to parent');
select is((select parent_investigation_version_id from public.tracekit_investigations where id='a4900000-0000-0000-0000-000000000012'),'a4900000-0000-0000-0000-000000000030'::uuid,'child records exact parent version');
select throws_ok($sql$insert into public.tracekit_investigations(id,account_id,organization_id,title,question,status,trigger_type,analysis_version,parent_investigation_id,parent_investigation_version_id,branch_signal,branch_reason) values('b4900000-0000-0000-0000-000000000012','b4900000-0000-0000-0000-000000000001','b4900000-0000-0000-0000-000000000002','Bad child','Why?','draft','investigation_branch','v1','a4900000-0000-0000-0000-000000000010','a4900000-0000-0000-0000-000000000030','signal','reason')$sql$,'23503',null,'cross-Organization parent is rejected');
select throws_ok($sql$insert into public.tracekit_investigations(id,account_id,organization_id,title,question,status,trigger_type,analysis_version,parent_investigation_id,parent_investigation_version_id,branch_signal,branch_reason) values('a4900000-0000-0000-0000-000000000013','a4900000-0000-0000-0000-000000000001','a4900000-0000-0000-0000-000000000002','Self','Why?','draft','investigation_branch','v1','a4900000-0000-0000-0000-000000000013','a4900000-0000-0000-0000-000000000030','signal','reason')$sql$,'23514',null,'self-parent is rejected');
select throws_ok($sql$insert into public.tracekit_investigations(id,account_id,organization_id,title,question,status,trigger_type,analysis_version,parent_investigation_id,parent_investigation_version_id,branch_signal,branch_reason) values('a4900000-0000-0000-0000-000000000014','a4900000-0000-0000-0000-000000000001','a4900000-0000-0000-0000-000000000002','Wrong version','Why?','draft','investigation_branch','v1','a4900000-0000-0000-0000-000000000010','a4900000-0000-0000-0000-000000000031','signal','reason')$sql$,'23503',null,'parent version must belong to named parent');
select throws_ok($sql$update public.tracekit_investigations set parent_investigation_id='a4900000-0000-0000-0000-000000000012',parent_investigation_version_id='a4900000-0000-0000-0000-000000000030',branch_signal='cycle',branch_reason='cycle' where id='a4900000-0000-0000-0000-000000000010'$sql$,'23514',null,'Investigation cycle is rejected');
select throws_ok($sql$update public.tracekit_investigations set branch_reason='rewritten' where id='a4900000-0000-0000-0000-000000000012'$sql$,'55000',null,'child branch provenance is immutable');
select throws_ok($sql$delete from public.tracekit_investigations where id='a4900000-0000-0000-0000-000000000010'$sql$,'23503',null,'parent cannot be deleted while child exists');
select is((select count(*)::integer from public.tracekit_investigation_versions where investigation_id='a4900000-0000-0000-0000-000000000010'),1,'parent version remains independent');
select is((select count(*)::integer from public.tracekit_investigation_versions where investigation_id='a4900000-0000-0000-0000-000000000012'),0,'child starts with independent version history');
select is((select count(*)::integer from public.tracekit_investigation_findings where investigation_id='a4900000-0000-0000-0000-000000000012'),0,'parent findings are not inherited');
select is((select count(*)::integer from public.commerce_repository_activation),0,'branch migration creates no activation');
select ok((select relrowsecurity from pg_class where oid='public.tracekit_investigations'::regclass),'Investigation RLS remains enabled');
select is((select count(*)::integer from information_schema.role_table_grants where table_schema='public' and table_name='tracekit_investigations' and grantee in('anon','authenticated')),0,'browser roles remain denied');

select * from finish(); rollback;
