begin;
select plan(4);
select has_function('public','reconcile_commerce_historical_disputes_v1',array['uuid','uuid'],'versioned reconciliation exists');
select is((select count(*)::integer from information_schema.role_routine_grants where routine_schema='public' and routine_name='reconcile_commerce_historical_disputes_v1' and grantee in ('anon','authenticated')),0,'browser roles cannot reconcile');
select is((select count(*)::integer from public.commerce_repository_activation),0,'reconciliation migration creates no activation');
select has_view('public','commerce_chargeback_product_intelligence_v1','Chargeback Intelligence shadow view exists');
select * from finish();
rollback;
