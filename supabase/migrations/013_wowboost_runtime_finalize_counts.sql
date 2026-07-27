-- Deterministic finalize counters for WowBoost Connector Runtime jobs.

create or replace function public.wowboost_runtime_finalize_counts(
  p_job_id uuid,
  p_requested_from text,
  p_requested_to text
)
returns table(
  remaining_blank_references integer,
  unresolved_error_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (
      select count(*)::integer
      from public.platform_orders po
      where po.platform in ('wowboost', 'wowsuite:wowboost', 'wowsuite')
        and po.platform_order_id is not null
        and (po.commerce_reference is null or po.commerce_reference = '')
        and po.order_ts >= (p_requested_from::date)::timestamptz
        and po.order_ts < ((p_requested_to::date + 1)::timestamptz)
    ) as remaining_blank_references,
    (
      select count(*)::integer
      from public.integration_import_errors err
      where err.job_id = p_job_id
        and err.resolved_at is null
    ) as unresolved_error_count;
$$;
