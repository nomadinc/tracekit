begin;
select plan(7);

select has_table('public','commerce_refund_events','embedded Refund events exist');
select has_function('public','normalize_commerce_transaction_page_v2',array['uuid','uuid','uuid','uuid','uuid','jsonb'],'Refund-aware atomic normalizer exists');
select col_is_null('public','commerce_refund_events','currency','Refund currency remains nullable');
select ok((select relrowsecurity from pg_class where oid='public.commerce_refund_events'::regclass),'Refund RLS enabled');
select is((select count(*)::integer from information_schema.role_table_grants where table_schema='public' and table_name='commerce_refund_events' and grantee in ('anon','authenticated')),0,'browser roles have no Refund grants');
select is((select count(*)::integer from pg_indexes where schemaname='public' and tablename='commerce_refund_events' and indexdef like '%connection_id, provider_account_id, provider_refund_id%'),1,'Refund source identity is Connection and Provider Account scoped');
select is((select count(*)::integer from public.commerce_repository_activation),0,'Refund migration creates no activation');

select * from finish();
rollback;
