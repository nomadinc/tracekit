-- Identity Backfill Runtime v1: scan support and deterministic finalize counts.

do $$
begin
  if to_regclass('public.platform_orders') is not null then
    create index if not exists platform_orders_identity_backfill_scan_idx
      on public.platform_orders (workspace_id, platform, order_ts, platform_order_id)
      where person_id is null
        and platform_order_id is not null;
  end if;
end
$$;

create or replace function public.identity_backfill_finalize_counts(
  p_job_id uuid,
  p_workspace_id text,
  p_requested_from timestamptz,
  p_requested_to timestamptz,
  p_platforms text[]
)
returns table (
  total_in_scope bigint,
  linked_person_id bigint,
  remaining_unlinked bigint,
  review_required_count bigint,
  no_identifier_count bigint,
  runtime_error_count bigint
)
language sql
stable
as $$
  with scope as (
    select po.platform_order_id, po.person_id
    from public.platform_orders po
    where po.workspace_id = p_workspace_id
      and po.platform = any(p_platforms)
      and po.order_ts >= p_requested_from
      and po.order_ts < p_requested_to
  ),
  review_events as (
    select count(*)::bigint as count
    from public.identity_resolution_events ire
    where ire.workspace_id = p_workspace_id
      and ire.connector_job_id = p_job_id
      and ire.resolution_action in ('conflict_detected', 'review_required')
  ),
  no_identifier_errors as (
    select count(*)::bigint as count
    from public.integration_import_errors iie
    where iie.job_id = p_job_id
      and iie.error_class = 'identity_backfill_no_identifiers'
  ),
  runtime_errors as (
    select count(*)::bigint as count
    from public.integration_import_errors iie
    where iie.job_id = p_job_id
      and iie.error_class <> 'identity_backfill_no_identifiers'
  )
  select
    count(*)::bigint as total_in_scope,
    count(*) filter (where scope.person_id is not null)::bigint as linked_person_id,
    count(*) filter (where scope.person_id is null)::bigint as remaining_unlinked,
    (select count from review_events) as review_required_count,
    (select count from no_identifier_errors) as no_identifier_count,
    (select count from runtime_errors) as runtime_error_count
  from scope;
$$;

