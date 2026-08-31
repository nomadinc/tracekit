begin;
select plan(37);

insert into public.tracekit_accounts(id,account_type,name)
values('39d895f9-71ac-44d3-ac33-6e9043f6267e','client','Manifest Fixture');
insert into public.tracekit_organizations(id,owning_account_id,name)
values('5f1de64a-1b37-40bb-81c8-32197eda0b41','39d895f9-71ac-44d3-ac33-6e9043f6267e','Manifest Org');
insert into public.tracekit_users(id,workos_user_id,primary_email,display_name)
values('30000000-0000-4000-8000-000000000001','manifest-reviewer','manifest@example.invalid','Manifest Reviewer');
insert into public.tracekit_business_contexts(id,account_id,organization_id,name)
values('push-button-system-5f1de64a','39d895f9-71ac-44d3-ac33-6e9043f6267e','5f1de64a-1b37-40bb-81c8-32197eda0b41','Push Button System');
insert into public.canonical_offers(id,account_id,organization_id,business_context_id,name)
values('b842611c-9918-40ac-9241-d542a8c6f8b4','39d895f9-71ac-44d3-ac33-6e9043f6267e','5f1de64a-1b37-40bb-81c8-32197eda0b41','push-button-system-5f1de64a','Push Button System');
insert into public.offer_steps(id,organization_id,canonical_offer_id,role,sequence,label) values
('8110e951-8ca6-406a-8817-55575fe647ba','5f1de64a-1b37-40bb-81c8-32197eda0b41','b842611c-9918-40ac-9241-d542a8c6f8b4','front_end',0,'Front End'),
('a5d6d601-790d-4b7c-97f3-a9f833465ef5','5f1de64a-1b37-40bb-81c8-32197eda0b41','b842611c-9918-40ac-9241-d542a8c6f8b4','order_bump',1,'Revenue Booster'),
('2fa222b9-1325-4cd5-b712-03313f093057','5f1de64a-1b37-40bb-81c8-32197eda0b41','b842611c-9918-40ac-9241-d542a8c6f8b4','order_bump',2,'Fast Track');
insert into public.commerce_provider_connections(id,account_id,organization_id,provider,display_name,status)
values('ea1c2313-6120-4692-84c5-ec3562e7dcf6','39d895f9-71ac-44d3-ac33-6e9043f6267e','5f1de64a-1b37-40bb-81c8-32197eda0b41','commas','Manifest Commas','connected');
insert into public.commerce_provider_accounts(id,connection_id,organization_id,provider_account_external_id,status)
values('0369c701-717f-4c34-b230-8341bcdb7e65','ea1c2313-6120-4692-84c5-ec3562e7dcf6','5f1de64a-1b37-40bb-81c8-32197eda0b41','manifest-fixture','active');

insert into public.commerce_provider_products
  (id,organization_id,connection_id,provider_account_id,provider_product_id,title,first_seen_at,last_seen_at,
   mapping_status,mapping_version,business_context_id,canonical_offer_id,offer_step_id,reviewed_by_user_id,reviewed_at)
values
('10000000-0000-4000-8000-000000000001','5f1de64a-1b37-40bb-81c8-32197eda0b41','ea1c2313-6120-4692-84c5-ec3562e7dcf6','0369c701-717f-4c34-b230-8341bcdb7e65','Jz71g','Current front end',now(),now(),'approved','mapped-v1','push-button-system-5f1de64a','b842611c-9918-40ac-9241-d542a8c6f8b4','8110e951-8ca6-406a-8817-55575fe647ba','30000000-0000-4000-8000-000000000001',now()),
('10000000-0000-4000-8000-000000000002','5f1de64a-1b37-40bb-81c8-32197eda0b41','ea1c2313-6120-4692-84c5-ec3562e7dcf6','0369c701-717f-4c34-b230-8341bcdb7e65','o2GYY','Legacy front end',now(),now(),'approved','mapped-v1','push-button-system-5f1de64a','b842611c-9918-40ac-9241-d542a8c6f8b4','8110e951-8ca6-406a-8817-55575fe647ba','30000000-0000-4000-8000-000000000001',now()),
('10000000-0000-4000-8000-000000000003','5f1de64a-1b37-40bb-81c8-32197eda0b41','ea1c2313-6120-4692-84c5-ec3562e7dcf6','0369c701-717f-4c34-b230-8341bcdb7e65','n7vOY','Revenue Booster',now(),now(),'approved','mapped-v1','push-button-system-5f1de64a','b842611c-9918-40ac-9241-d542a8c6f8b4','a5d6d601-790d-4b7c-97f3-a9f833465ef5','30000000-0000-4000-8000-000000000001',now());

insert into public.platform_orders
  (platform,platform_order_id,provider_order_id,order_ts,status,status_norm,currency,gross_amount,
   account_id,organization_id,connection_id,provider_account_id,canonical_order_id,provider_product_id)
values
('commas','manifest-67','manifest-67',now(),'observed','observed',null,67,'39d895f9-71ac-44d3-ac33-6e9043f6267e','5f1de64a-1b37-40bb-81c8-32197eda0b41','ea1c2313-6120-4692-84c5-ec3562e7dcf6','0369c701-717f-4c34-b230-8341bcdb7e65','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
('commas','manifest-92','manifest-92',now(),'observed','observed','USD',92,'39d895f9-71ac-44d3-ac33-6e9043f6267e','5f1de64a-1b37-40bb-81c8-32197eda0b41','ea1c2313-6120-4692-84c5-ec3562e7dcf6','0369c701-717f-4c34-b230-8341bcdb7e65','20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001'),
('commas','manifest-106','manifest-106',now(),'observed','observed',null,106,'39d895f9-71ac-44d3-ac33-6e9043f6267e','5f1de64a-1b37-40bb-81c8-32197eda0b41','ea1c2313-6120-4692-84c5-ec3562e7dcf6','0369c701-717f-4c34-b230-8341bcdb7e65','20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001'),
('commas','manifest-131','manifest-131',now(),'observed','observed',null,131,'39d895f9-71ac-44d3-ac33-6e9043f6267e','5f1de64a-1b37-40bb-81c8-32197eda0b41','ea1c2313-6120-4692-84c5-ec3562e7dcf6','0369c701-717f-4c34-b230-8341bcdb7e65','20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001'),
('commas','manifest-legacy','manifest-legacy',now(),'observed','observed',null,106,'39d895f9-71ac-44d3-ac33-6e9043f6267e','5f1de64a-1b37-40bb-81c8-32197eda0b41','ea1c2313-6120-4692-84c5-ec3562e7dcf6','0369c701-717f-4c34-b230-8341bcdb7e65','20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000002'),
('commas','manifest-standalone','manifest-standalone',now(),'observed','observed',null,25,'39d895f9-71ac-44d3-ac33-6e9043f6267e','5f1de64a-1b37-40bb-81c8-32197eda0b41','ea1c2313-6120-4692-84c5-ec3562e7dcf6','0369c701-717f-4c34-b230-8341bcdb7e65','20000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000003');

create temporary table manifest_results(result jsonb);
insert into manifest_results select public.create_commas_economic_allocation_manifest_v1(
  '5f1de64a-1b37-40bb-81c8-32197eda0b41','ea1c2313-6120-4692-84c5-ec3562e7dcf6','0369c701-717f-4c34-b230-8341bcdb7e65',
  'commas-pbs-order-bump-allocation-v1');

select has_table('public','commerce_economic_allocation_manifests','Manifest header exists');
select has_table('public','commerce_economic_allocation_manifest_items','Manifest items exist');
select ok((select relrowsecurity from pg_class where oid='public.commerce_economic_allocation_manifests'::regclass),'Header RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.commerce_economic_allocation_manifest_items'::regclass),'Item RLS enabled');
select is(has_table_privilege('authenticated','public.commerce_economic_allocation_manifests','SELECT'),false,'Authenticated cannot read manifests');
select is(has_function_privilege('authenticated','public.create_commas_economic_allocation_manifest_v1(uuid,uuid,uuid,text)','EXECUTE'),false,'Authenticated cannot freeze manifests');
select is(has_function_privilege('service_role','public.backfill_commas_order_economic_allocations_from_manifest_v1(uuid,bigint,integer,boolean)','EXECUTE'),true,'Service role can execute manifest backfill');
select is((select prosecdef from pg_proc where oid='public.backfill_commas_order_economic_allocations_from_manifest_v1(uuid,bigint,integer,boolean)'::regprocedure),false,'Manifest backfill is SECURITY INVOKER');

select is((select (result->>'cohort_count')::integer from manifest_results),4,'Only current eligible checkout orders freeze');
select is((select (result->>'provider_gross_total')::numeric from manifest_results),396::numeric,'Frozen provider gross is conserved');
select is((select (result->>'expected_front_end_total')::numeric from manifest_results),268::numeric,'Frozen Front End total is correct');
select is((select (result->>'expected_revenue_booster_total')::numeric from manifest_results),50::numeric,'Frozen booster total is correct');
select is((select (result->>'expected_fast_track_total')::numeric from manifest_results),78::numeric,'Frozen Fast Track total is correct');
select is((select count(*)::integer from public.commerce_economic_allocation_manifest_items where provider_product_external_id='o2GYY'),0,'Legacy o2GYY is excluded');
select is((select count(*)::integer from public.commerce_economic_allocation_manifest_items where provider_product_external_id='n7vOY'),0,'Standalone bump is excluded');
select is((select status from public.commerce_economic_allocation_manifests limit 1),'frozen','Manifest freezes atomically');

select throws_ok($sql$update public.commerce_economic_allocation_manifests set provider_gross_total=1$sql$,'55000',null,'Frozen totals cannot change');
select throws_ok($sql$delete from public.commerce_economic_allocation_manifest_items$sql$,'55000',null,'Frozen items cannot be removed');
select throws_ok($sql$insert into public.commerce_economic_allocation_manifest_items
  select gen_random_uuid(),manifest_id,organization_id,connection_id,provider_account_id,99,
    canonical_order_id,platform_order_id,source_provider,source_provider_product_id,provider_product_external_id,
    mapping_status,mapping_version,business_context_id,canonical_offer_id,offer_step_id,offer_variant_id,
    gross_amount,source_currency,currency_basis,order_status,order_status_norm,allocation_policy_version,
    expected_allocated_gross_amount,expected_line_count,allocation_input_fingerprint,now()
  from public.commerce_economic_allocation_manifest_items limit 1$sql$,'55000',null,'Frozen manifest cannot gain items');

select isnt(
  public.commas_economic_allocation_input_fingerprint_v1('5f1de64a-1b37-40bb-81c8-32197eda0b41','ea1c2313-6120-4692-84c5-ec3562e7dcf6','0369c701-717f-4c34-b230-8341bcdb7e65','20000000-0000-4000-8000-000000000001','manifest-67','commas','10000000-0000-4000-8000-000000000001','Jz71g','approved','mapped-v1','push-button-system-5f1de64a','b842611c-9918-40ac-9241-d542a8c6f8b4','8110e951-8ca6-406a-8817-55575fe647ba',null,67,null,'operator_authorized_policy','observed','observed','commas-pbs-order-bump-allocation-v1'),
  public.commas_economic_allocation_input_fingerprint_v1('5f1de64a-1b37-40bb-81c8-32197eda0b41','ea1c2313-6120-4692-84c5-ec3562e7dcf6','0369c701-717f-4c34-b230-8341bcdb7e65','20000000-0000-4000-8000-000000000001','manifest-67','commas','10000000-0000-4000-8000-000000000001','Jz71g','approved','mapped-v2','push-button-system-5f1de64a','b842611c-9918-40ac-9241-d542a8c6f8b4','8110e951-8ca6-406a-8817-55575fe647ba',null,67,null,'operator_authorized_policy','observed','observed','commas-pbs-order-bump-allocation-v1'),
  'Mapping version changes the input fingerprint');
select isnt(
  (select allocation_input_fingerprint from public.commerce_economic_allocation_manifest_items order by item_sequence limit 1),
  public.commas_economic_allocation_input_fingerprint_v1('5f1de64a-1b37-40bb-81c8-32197eda0b41','ea1c2313-6120-4692-84c5-ec3562e7dcf6','0369c701-717f-4c34-b230-8341bcdb7e65','20000000-0000-4000-8000-000000000001','manifest-67','commas','10000000-0000-4000-8000-000000000001','Jz71g','approved','mapped-v1','push-button-system-5f1de64a','b842611c-9918-40ac-9241-d542a8c6f8b4','8110e951-8ca6-406a-8817-55575fe647ba',null,68,null,'operator_authorized_policy','observed','observed','commas-pbs-order-bump-allocation-v1'),
  'Gross changes the input fingerprint');
select isnt(
  public.commas_economic_allocation_input_fingerprint_v1('5f1de64a-1b37-40bb-81c8-32197eda0b41','ea1c2313-6120-4692-84c5-ec3562e7dcf6','0369c701-717f-4c34-b230-8341bcdb7e65','20000000-0000-4000-8000-000000000001','manifest-67','commas','10000000-0000-4000-8000-000000000001','Jz71g','approved','mapped-v1','push-button-system-5f1de64a','b842611c-9918-40ac-9241-d542a8c6f8b4','8110e951-8ca6-406a-8817-55575fe647ba',null,67,null,'operator_authorized_policy','observed','observed','commas-pbs-order-bump-allocation-v1'),
  public.commas_economic_allocation_input_fingerprint_v1('5f1de64a-1b37-40bb-81c8-32197eda0b41','ea1c2313-6120-4692-84c5-ec3562e7dcf6','0369c701-717f-4c34-b230-8341bcdb7e65','20000000-0000-4000-8000-000000000001','manifest-67','commas','10000000-0000-4000-8000-000000000001','Jz71g','approved','mapped-v1','push-button-system-5f1de64a','b842611c-9918-40ac-9241-d542a8c6f8b4','8110e951-8ca6-406a-8817-55575fe647ba',null,67,'USD','provider_observed','observed','observed','commas-pbs-order-bump-allocation-v1'),
  'Currency state changes the input fingerprint');
select isnt(
  public.commas_economic_allocation_input_fingerprint_v1('5f1de64a-1b37-40bb-81c8-32197eda0b41','ea1c2313-6120-4692-84c5-ec3562e7dcf6','0369c701-717f-4c34-b230-8341bcdb7e65','20000000-0000-4000-8000-000000000001','manifest-67','commas','10000000-0000-4000-8000-000000000001','Jz71g','approved','mapped-v1','push-button-system-5f1de64a','b842611c-9918-40ac-9241-d542a8c6f8b4','8110e951-8ca6-406a-8817-55575fe647ba',null,67,null,'operator_authorized_policy','observed','observed','commas-pbs-order-bump-allocation-v1'),
  public.commas_economic_allocation_input_fingerprint_v1('5f1de64a-1b37-40bb-81c8-32197eda0b41','ea1c2313-6120-4692-84c5-ec3562e7dcf6','0369c701-717f-4c34-b230-8341bcdb7e65','20000000-0000-4000-8000-000000000001','manifest-67','commas','10000000-0000-4000-8000-000000000001','Jz71g','approved','mapped-v1','push-button-system-5f1de64a','b842611c-9918-40ac-9241-d542a8c6f8b4','8110e951-8ca6-406a-8817-55575fe647ba',null,67,null,'operator_authorized_policy','failed','failed','commas-pbs-order-bump-allocation-v1'),
  'Sale status changes the input fingerprint');

create temporary table dry_result as select public.backfill_commas_order_economic_allocations_from_manifest_v1(
  (select id from public.commerce_economic_allocation_manifests limit 1),0,2,true) result;
select is((select result->>'status' from dry_result),'dry_run_valid','Dry run validates manifest items');
select is((select count(*)::integer from public.commerce_order_economic_lines),0,'Dry run writes no economic lines');

select public.backfill_commas_order_economic_allocations_from_manifest_v1(
  (select id from public.commerce_economic_allocation_manifests limit 1),0,2,false);
select public.backfill_commas_order_economic_allocations_from_manifest_v1(
  (select id from public.commerce_economic_allocation_manifests limit 1),2,2,false);
select is((select status from public.commerce_economic_allocation_manifests limit 1),'completed','Bounded writes complete only after full manifest');
select is((select count(*)::integer from public.commerce_order_economic_lines),8,'Expected deterministic economic lines are written');
select is((select count(*)::integer from (
  select e.canonical_order_id from public.commerce_order_economic_lines e
  join public.platform_orders o on o.organization_id=e.organization_id and o.canonical_order_id=e.canonical_order_id
  group by e.canonical_order_id,o.gross_amount having sum(e.allocated_gross_amount)<>o.gross_amount) bad),0,'Every written order conserves gross');

select public.backfill_commas_order_economic_allocations_from_manifest_v1(
  (select id from public.commerce_economic_allocation_manifests limit 1),0,2,false);
select is((select count(*)::integer from public.commerce_order_economic_lines),8,'Manifest write is idempotent');
select is((select count(*)::integer from public.commerce_order_economic_lines e join public.commerce_economic_allocation_manifest_items i on i.canonical_order_id=e.canonical_order_id where i.manifest_id=(select id from public.commerce_economic_allocation_manifests limit 1)),8,'Continuous reconciliation identities coexist with manifest writes');

insert into manifest_results select public.create_commas_economic_allocation_manifest_v1(
  '5f1de64a-1b37-40bb-81c8-32197eda0b41','ea1c2313-6120-4692-84c5-ec3562e7dcf6','0369c701-717f-4c34-b230-8341bcdb7e65',
  'commas-pbs-order-bump-allocation-v1');
select is((select count(distinct cohort_fingerprint)::integer from public.commerce_economic_allocation_manifests),1,'Cohort fingerprint is deterministic');

insert into public.platform_orders
  (platform,platform_order_id,provider_order_id,order_ts,status,status_norm,currency,gross_amount,
   account_id,organization_id,connection_id,provider_account_id,canonical_order_id,provider_product_id)
values('commas','manifest-new-low-uuid','manifest-new-low-uuid',now(),'observed','observed',null,67,
  '39d895f9-71ac-44d3-ac33-6e9043f6267e','5f1de64a-1b37-40bb-81c8-32197eda0b41','ea1c2313-6120-4692-84c5-ec3562e7dcf6',
  '0369c701-717f-4c34-b230-8341bcdb7e65','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
select is((select count(*)::integer from public.commerce_economic_allocation_manifest_items where manifest_id=(select (result->>'manifest_id')::uuid from manifest_results order by ctid desc limit 1)),4,'Post-freeze lower UUID cannot enter manifest');

update public.platform_orders set gross_amount=68 where canonical_order_id='20000000-0000-4000-8000-000000000001';
create temporary table stale_result as select public.backfill_commas_order_economic_allocations_from_manifest_v1(
  (select (result->>'manifest_id')::uuid from manifest_results order by ctid desc limit 1),0,4,true) result;
select is((select result->>'status' from stale_result),'manifest_stale','Changed item aborts instead of skipping');
select is((select status from public.commerce_economic_allocation_manifests where id=(select (result->>'manifest_id')::uuid from manifest_results order by ctid desc limit 1)),'failed','Stale manifest is durably failed');

select is((select count(*)::integer from public.commerce_product_mapping_decisions),0,'Manifest flow writes no mapping decisions');
select is((select count(*)::integer from public.commerce_refund_events),0,'Manifest flow writes no refunds');
select is((select count(*)::integer from public.commerce_provider_disputes),0,'Manifest flow writes no disputes');

select * from finish();
rollback;
