begin;

create extension if not exists pg_cron;

create or replace function public.run_everflow_order_reconciliation_sweep_v2(
  p_batch_size integer default 250,
  p_connection_limit integer default 10
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_connection record;
begin
  if p_batch_size is null or p_batch_size < 1 or p_batch_size > 500 then
    raise exception 'Everflow reconciliation batch size must be between 1 and 500.' using errcode = '22023';
  end if;
  if p_connection_limit is null or p_connection_limit < 1 or p_connection_limit > 25 then
    raise exception 'Everflow reconciliation connection limit must be between 1 and 25.' using errcode = '22023';
  end if;

  for v_connection in
    select c.id
    from public.commerce_provider_connections c
    where c.provider = 'everflow'
      and c.status = 'connected'
    order by c.created_at asc
    limit p_connection_limit
  loop
    perform public.run_everflow_order_reconciliation_batch_v2(v_connection.id, p_batch_size);
  end loop;
end;
$$;

revoke all on function public.run_everflow_order_reconciliation_sweep_v2(integer,integer) from public;
grant execute on function public.run_everflow_order_reconciliation_sweep_v2(integer,integer) to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'tracekit-everflow-order-reconciliation-v2';

select cron.schedule(
  'tracekit-everflow-order-reconciliation-v2',
  '*/5 * * * *',
  $$select public.run_everflow_order_reconciliation_sweep_v2(250, 10);$$
);

commit;
