begin;
select plan(16);

select has_table('public','commerce_order_economic_lines','Economic allocation projection exists');
select ok((select relrowsecurity from pg_class where oid='public.commerce_order_economic_lines'::regclass),'Economic allocation RLS enabled');
select is(has_table_privilege('authenticated','public.commerce_order_economic_lines','SELECT'),false,'Authenticated cannot read allocation projection');
select is(has_table_privilege('service_role','public.commerce_order_economic_lines','SELECT'),true,'Service role can read allocation projection');

select results_eq(
  $$select offer_step_id::text,line_sequence,allocated_gross_amount::numeric from public.compute_commas_pbs_order_economic_lines_v1('commas','5f1de64a-1b37-40bb-81c8-32197eda0b41','ea1c2313-6120-4692-84c5-ec3562e7dcf6','0369c701-717f-4c34-b230-8341bcdb7e65','Jz71g','approved','push-button-system-5f1de64a','b842611c-9918-40ac-9241-d542a8c6f8b4','8110e951-8ca6-406a-8817-55575fe647ba','observed','observed',67,'USD')$$,
  $$values ('8110e951-8ca6-406a-8817-55575fe647ba',0,67::numeric)$$,'67 is Front End only');
select is((select sum(allocated_gross_amount) from public.compute_commas_pbs_order_economic_lines_v1('commas','5f1de64a-1b37-40bb-81c8-32197eda0b41','ea1c2313-6120-4692-84c5-ec3562e7dcf6','0369c701-717f-4c34-b230-8341bcdb7e65','Jz71g','approved','push-button-system-5f1de64a','b842611c-9918-40ac-9241-d542a8c6f8b4','8110e951-8ca6-406a-8817-55575fe647ba','observed','observed',92,'USD')),92::numeric,'92 conserves');
select is((select count(*)::integer from public.compute_commas_pbs_order_economic_lines_v1('commas','5f1de64a-1b37-40bb-81c8-32197eda0b41','ea1c2313-6120-4692-84c5-ec3562e7dcf6','0369c701-717f-4c34-b230-8341bcdb7e65','Jz71g','approved','push-button-system-5f1de64a','b842611c-9918-40ac-9241-d542a8c6f8b4','8110e951-8ca6-406a-8817-55575fe647ba','observed','observed',92,'USD')),2,'92 has two lines');
select is((select sum(allocated_gross_amount) from public.compute_commas_pbs_order_economic_lines_v1('commas','5f1de64a-1b37-40bb-81c8-32197eda0b41','ea1c2313-6120-4692-84c5-ec3562e7dcf6','0369c701-717f-4c34-b230-8341bcdb7e65','4KV26','approved','push-button-system-5f1de64a','b842611c-9918-40ac-9241-d542a8c6f8b4','8110e951-8ca6-406a-8817-55575fe647ba','observed','observed',106,'USD')),106::numeric,'106 conserves');
select is((select count(*)::integer from public.compute_commas_pbs_order_economic_lines_v1('commas','5f1de64a-1b37-40bb-81c8-32197eda0b41','ea1c2313-6120-4692-84c5-ec3562e7dcf6','0369c701-717f-4c34-b230-8341bcdb7e65','xz1kz','approved','push-button-system-5f1de64a','b842611c-9918-40ac-9241-d542a8c6f8b4','8110e951-8ca6-406a-8817-55575fe647ba','observed','observed',131,'USD')),3,'131 has three lines');
select is((select sum(allocated_gross_amount) from public.compute_commas_pbs_order_economic_lines_v1('commas','5f1de64a-1b37-40bb-81c8-32197eda0b41','ea1c2313-6120-4692-84c5-ec3562e7dcf6','0369c701-717f-4c34-b230-8341bcdb7e65','xz1kz','approved','push-button-system-5f1de64a','b842611c-9918-40ac-9241-d542a8c6f8b4','8110e951-8ca6-406a-8817-55575fe647ba','observed','observed',131,'USD')),131::numeric,'131 conserves');
select is((select count(*)::integer from public.compute_commas_pbs_order_economic_lines_v1('commas','5f1de64a-1b37-40bb-81c8-32197eda0b41','ea1c2313-6120-4692-84c5-ec3562e7dcf6','0369c701-717f-4c34-b230-8341bcdb7e65','o2GYY','approved','push-button-system-5f1de64a','b842611c-9918-40ac-9241-d542a8c6f8b4','8110e951-8ca6-406a-8817-55575fe647ba','observed','observed',106,'USD')),0,'Legacy front end is excluded');
select is((select count(*)::integer from public.compute_commas_pbs_order_economic_lines_v1('commas','5f1de64a-1b37-40bb-81c8-32197eda0b41','ea1c2313-6120-4692-84c5-ec3562e7dcf6','0369c701-717f-4c34-b230-8341bcdb7e65','Jz71g','approved','push-button-system-5f1de64a','b842611c-9918-40ac-9241-d542a8c6f8b4','8110e951-8ca6-406a-8817-55575fe647ba','observed','observed',91,'USD')),0,'Unknown total is excluded');
select is((select count(*)::integer from public.compute_commas_pbs_order_economic_lines_v1('commas','5f1de64a-1b37-40bb-81c8-32197eda0b41','ea1c2313-6120-4692-84c5-ec3562e7dcf6','0369c701-717f-4c34-b230-8341bcdb7e65','Jz71g','approved','push-button-system-5f1de64a','b842611c-9918-40ac-9241-d542a8c6f8b4','8110e951-8ca6-406a-8817-55575fe647ba','observed','observed',92,'EUR')),0,'Non-USD is excluded');
select is(has_function_privilege('authenticated','public.reconcile_commas_order_economic_allocation_v1(uuid,uuid,uuid,uuid,boolean)','EXECUTE'),false,'Authenticated cannot allocate');
select is(has_function_privilege('service_role','public.reconcile_commas_order_economic_allocation_v1(uuid,uuid,uuid,uuid,boolean)','EXECUTE'),true,'Service role can allocate');
select is((select prosecdef from pg_proc where oid='public.reconcile_commas_order_economic_allocation_v1(uuid,uuid,uuid,uuid,boolean)'::regprocedure),false,'Allocation RPC is security invoker');

select * from finish();
rollback;
