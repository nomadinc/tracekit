begin;
select plan(45);

insert into public.tracekit_users(id,workos_user_id,primary_email,display_name) values
  ('92400000-0000-0000-0000-000000000001','tkid-provision-requester','tkid-requester@example.invalid','TKID Requester'),
  ('92400000-0000-0000-0000-000000000002','tkid-provision-target-1','tkid-target-1@example.invalid','TKID Target 1'),
  ('92400000-0000-0000-0000-000000000003','tkid-provision-target-2','tkid-target-2@example.invalid','TKID Target 2'),
  ('92400000-0000-0000-0000-000000000004','tkid-provision-target-3','tkid-target-3@example.invalid','TKID Target 3'),
  ('92400000-0000-0000-0000-000000000005','tkid-provision-target-4','tkid-target-4@example.invalid','TKID Target 4'),
  ('92400000-0000-0000-0000-000000000006','tkid-provision-target-5','tkid-target-5@example.invalid','TKID Target 5');

insert into public.tracekit_accounts(id,account_type,name) values
  ('92400000-0000-0000-0000-000000000010','client','TKID Provision Test');
insert into public.tracekit_organizations(id,owning_account_id,name) values
  ('92400000-0000-0000-0000-000000000020','92400000-0000-0000-0000-000000000010','TKID Provision Test');

insert into public.tracekit_memberships(id,user_id,organization_id,role_id,status)
select input.id,input.user_id,'92400000-0000-0000-0000-000000000020',r.id,'active'
from (values
  ('92400000-0000-0000-0000-000000000101'::uuid,'92400000-0000-0000-0000-000000000001'::uuid),
  ('92400000-0000-0000-0000-000000000102'::uuid,'92400000-0000-0000-0000-000000000002'::uuid),
  ('92400000-0000-0000-0000-000000000103'::uuid,'92400000-0000-0000-0000-000000000003'::uuid),
  ('92400000-0000-0000-0000-000000000104'::uuid,'92400000-0000-0000-0000-000000000004'::uuid),
  ('92400000-0000-0000-0000-000000000105'::uuid,'92400000-0000-0000-0000-000000000005'::uuid),
  ('92400000-0000-0000-0000-000000000106'::uuid,'92400000-0000-0000-0000-000000000006'::uuid)
) input(id,user_id)
cross join public.tracekit_roles r where r.role_key='organization-owner';

insert into public.tracekit_business_contexts(id,account_id,organization_id,name,status) values
  ('tkid-provision-new','92400000-0000-0000-0000-000000000010','92400000-0000-0000-0000-000000000020','New','active'),
  ('tkid-provision-active-existing','92400000-0000-0000-0000-000000000010','92400000-0000-0000-0000-000000000020','Active Existing','active'),
  ('tkid-provision-suspended','92400000-0000-0000-0000-000000000010','92400000-0000-0000-0000-000000000020','Suspended','active'),
  ('tkid-provision-new-override','92400000-0000-0000-0000-000000000010','92400000-0000-0000-0000-000000000020','New Override','active'),
  ('tkid-provision-denied','92400000-0000-0000-0000-000000000010','92400000-0000-0000-0000-000000000020','Denied','active');

insert into public.tracekit_business_context_access(id,membership_id,organization_id,business_context_id,status) values
  ('92400000-0000-0000-0000-000000000201','92400000-0000-0000-0000-000000000103','92400000-0000-0000-0000-000000000020','tkid-provision-active-existing','active'),
  ('92400000-0000-0000-0000-000000000202','92400000-0000-0000-0000-000000000104','92400000-0000-0000-0000-000000000020','tkid-provision-suspended','suspended'),
  ('92400000-0000-0000-0000-000000000203','92400000-0000-0000-0000-000000000105','92400000-0000-0000-0000-000000000020','tkid-provision-new-override','active');

insert into public.tracekit_permission_overrides(id,membership_id,capability,effect,organization_id,resource_type,resource_id,created_by_user_id,reason) values
  ('92400000-0000-0000-0000-000000000301','92400000-0000-0000-0000-000000000103','admin.manage_feature_access','allow','92400000-0000-0000-0000-000000000020','tkid_origin_registry',null,'92400000-0000-0000-0000-000000000001','test existing allow'),
  ('92400000-0000-0000-0000-000000000302','92400000-0000-0000-0000-000000000104','admin.manage_feature_access','allow','92400000-0000-0000-0000-000000000020','tkid_origin_registry',null,'92400000-0000-0000-0000-000000000001','test existing allow'),
  ('92400000-0000-0000-0000-000000000303','92400000-0000-0000-0000-000000000106','admin.manage_feature_access','deny','92400000-0000-0000-0000-000000000020','tkid_origin_registry',null,'92400000-0000-0000-0000-000000000001','test deny');

create temporary table tkid_provision_results(case_name text primary key,result jsonb);
insert into tkid_provision_results values
  ('new',public.provision_tkid_origin_registry_access_v1('92400000-0000-0000-0000-000000000001','92400000-0000-0000-0000-000000000102','92400000-0000-0000-0000-000000000020','tkid-provision-new','test new','tkid-test-new','provision-tkid-origin-registry-access')),
  ('existing',public.provision_tkid_origin_registry_access_v1('92400000-0000-0000-0000-000000000001','92400000-0000-0000-0000-000000000103','92400000-0000-0000-0000-000000000020','tkid-provision-active-existing','test existing','tkid-test-existing','provision-tkid-origin-registry-access')),
  ('reactivated',public.provision_tkid_origin_registry_access_v1('92400000-0000-0000-0000-000000000001','92400000-0000-0000-0000-000000000104','92400000-0000-0000-0000-000000000020','tkid-provision-suspended','test suspended','tkid-test-suspended','provision-tkid-origin-registry-access')),
  ('new-override',public.provision_tkid_origin_registry_access_v1('92400000-0000-0000-0000-000000000001','92400000-0000-0000-0000-000000000105','92400000-0000-0000-0000-000000000020','tkid-provision-new-override','test new override','tkid-test-new-override','provision-tkid-origin-registry-access')),
  ('replay',public.provision_tkid_origin_registry_access_v1('92400000-0000-0000-0000-000000000001','92400000-0000-0000-0000-000000000102','92400000-0000-0000-0000-000000000020','tkid-provision-new','test replay','tkid-test-replay','provision-tkid-origin-registry-access'));

select is((select result->>'access_created' from tkid_provision_results where case_name='new'),'true','new access reports created');
select is((select result->>'access_changed' from tkid_provision_results where case_name='new'),'true','new access reports changed');
select is((select result->>'access_prior_status' from tkid_provision_results where case_name='new'),null,'new access has null prior status');
select is((select result->>'access_resulting_status' from tkid_provision_results where case_name='new'),'active','new access reports active result');
select is((select result->>'override_created' from tkid_provision_results where case_name='new'),'true','new override reports created');
select is((select result->>'override_reused' from tkid_provision_results where case_name='new'),'false','new override does not report reused');

select is((select result->>'access_created' from tkid_provision_results where case_name='existing'),'false','existing access not created');
select is((select result->>'access_changed' from tkid_provision_results where case_name='existing'),'false','existing active access unchanged');
select is((select result->>'access_prior_status' from tkid_provision_results where case_name='existing'),'active','existing active prior status preserved');
select is((select result->>'override_created' from tkid_provision_results where case_name='existing'),'false','existing allow not created');
select is((select result->>'override_reused' from tkid_provision_results where case_name='existing'),'true','existing allow reports reused');

select is((select result->>'access_created' from tkid_provision_results where case_name='reactivated'),'false','suspended access not created');
select is((select result->>'access_changed' from tkid_provision_results where case_name='reactivated'),'true','suspended access reports changed');
select is((select result->>'access_prior_status' from tkid_provision_results where case_name='reactivated'),'suspended','suspended prior status preserved');
select is((select result->>'access_resulting_status' from tkid_provision_results where case_name='reactivated'),'active','suspended access reactivated');
select is((select result->>'override_reused' from tkid_provision_results where case_name='reactivated'),'true','reactivation reuses allow');

select is((select result->>'access_changed' from tkid_provision_results where case_name='new-override'),'false','active access remains unchanged with new allow');
select is((select result->>'access_prior_status' from tkid_provision_results where case_name='new-override'),'active','new-allow case preserves access prior status');
select is((select result->>'override_created' from tkid_provision_results where case_name='new-override'),'true','new-allow case creates override');
select is((select result->>'override_reused' from tkid_provision_results where case_name='new-override'),'false','new-allow case does not report reuse');

select is((select result->>'access_created' from tkid_provision_results where case_name='replay'),'false','replay creates no access');
select is((select result->>'access_changed' from tkid_provision_results where case_name='replay'),'false','replay changes no access');
select is((select result->>'access_prior_status' from tkid_provision_results where case_name='replay'),'active','replay reports active prior status');
select is((select result->>'override_created' from tkid_provision_results where case_name='replay'),'false','replay creates no override');
select is((select result->>'override_reused' from tkid_provision_results where case_name='replay'),'true','replay reports reused override');

select throws_ok(
  $$select public.provision_tkid_origin_registry_access_v1('92400000-0000-0000-0000-000000000001','92400000-0000-0000-0000-000000000106','92400000-0000-0000-0000-000000000020','tkid-provision-denied','test denied','tkid-test-denied','provision-tkid-origin-registry-access')$$,
  'P0001','conflicting deny override exists','conflicting deny is rejected'
);
select is((select count(*)::integer from public.tracekit_business_context_access where membership_id='92400000-0000-0000-0000-000000000106'),0,'denied provisioning creates no access');
select is((select count(*)::integer from public.tracekit_permission_overrides where membership_id='92400000-0000-0000-0000-000000000106' and effect='allow'),0,'denied provisioning creates no allow');

select ok((select (result->>'access_id')::uuid is not null from tkid_provision_results where case_name='new'),'result contains access ID');
select ok((select (result->>'override_id')::uuid is not null from tkid_provision_results where case_name='new'),'result contains override ID');
select ok((select (result->>'audit_event_id')::uuid is not null from tkid_provision_results where case_name='new'),'result contains audit event ID');
select is((select result->>'correlation_id' from tkid_provision_results where case_name='new'),'tkid-test-new','result contains correlation ID');
select is((select result->>'resource_id' from tkid_provision_results where case_name='new'),null,'registry authorization resource ID is null');
select is((select result->>'execution_context' from tkid_provision_results where case_name='new'),'service_role_operator_provisioning','result identifies service execution');

select is((select actor_user_id::text from public.tracekit_audit_events where correlation_id='tkid-test-new'),null,'service execution is not attributed to human actor');
select is((select authenticated_identity_id::text from public.tracekit_audit_events where correlation_id='tkid-test-new'),null,'audit does not invent authenticated human identity');
select is((select metadata->>'requester_user_id' from public.tracekit_audit_events where correlation_id='tkid-test-new'),'92400000-0000-0000-0000-000000000001','audit identifies requester separately');
select is((select metadata->>'requester_identity_authenticated' from public.tracekit_audit_events where correlation_id='tkid-test-new'),'false','audit says requester identity is not authenticated by RPC');
select is((select metadata->>'execution_context' from public.tracekit_audit_events where correlation_id='tkid-test-new'),'service_role_operator_provisioning','audit identifies technical execution context');
select is((select target_id from public.tracekit_audit_events where correlation_id='tkid-test-new'),'92400000-0000-0000-0000-000000000102','audit identifies target membership');
select is((select created_by_user_id::text from public.tracekit_permission_overrides where id=((select result->>'override_id' from tkid_provision_results where case_name='new'))::uuid),null,'service-created override is not attributed to requester as technical creator');

select ok(has_function_privilege('service_role','public.provision_tkid_origin_registry_access_v1(uuid,uuid,uuid,text,text,text,text)','EXECUTE'),'service_role can execute provisioning');
select ok(not has_function_privilege('anon','public.provision_tkid_origin_registry_access_v1(uuid,uuid,uuid,text,text,text,text)','EXECUTE'),'anon cannot execute provisioning');
select ok(not has_function_privilege('authenticated','public.provision_tkid_origin_registry_access_v1(uuid,uuid,uuid,text,text,text,text)','EXECUTE'),'authenticated cannot execute provisioning');
select ok(not has_function_privilege('authenticator','public.provision_tkid_origin_registry_access_v1(uuid,uuid,uuid,text,text,text,text)','EXECUTE'),'authenticator cannot execute provisioning');

select * from finish();
rollback;
