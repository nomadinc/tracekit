-- Identity Backfill Runtime v1: index-supported finalize counts.
-- Replaces the migration 015 finalize RPC implementation without editing the
-- already-applied migration.

do $$
begin
  if to_regclass('public.platform_orders') is not null then
    create index if not exists platform_orders_identity_backfill_unlinked_count_idx
      on public.platform_orders (workspace_id, platform, order_ts)
      where person_id is null;

    create index if not exists platform_orders_identity_backfill_linked_count_idx
      on public.platform_orders (workspace_id, platform, order_ts)
      where person_id is not null;
  end if;

  if to_regclass('public.identity_resolution_events') is not null then
    create index if not exists identity_resolution_events_backfill_review_idx
      on public.identity_resolution_events (workspace_id, connector_job_id, resolution_action)
      where resolution_action in ('conflict_detected', 'review_required');
  end if;

  if to_regclass('public.integration_import_errors') is not null then
    create index if not exists integration_import_errors_job_class_idx
      on public.integration_import_errors (job_id, error_class);
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
language plpgsql
stable
as $$
declare
  v_platform text;
  v_platform_linked bigint;
  v_platform_unlinked bigint;
begin
  total_in_scope := 0;
  linked_person_id := 0;
  remaining_unlinked := 0;
  review_required_count := 0;
  no_identifier_count := 0;
  runtime_error_count := 0;

  foreach v_platform in array coalesce(p_platforms, array[]::text[]) loop
    select count(*)::bigint
      into v_platform_linked
    from public.platform_orders po
    where po.workspace_id = p_workspace_id
      and po.platform = v_platform
      and po.person_id is not null
      and po.order_ts >= p_requested_from
      and po.order_ts < p_requested_to;

    select count(*)::bigint
      into v_platform_unlinked
    from public.platform_orders po
    where po.workspace_id = p_workspace_id
      and po.platform = v_platform
      and po.person_id is null
      and po.order_ts >= p_requested_from
      and po.order_ts < p_requested_to;

    linked_person_id := linked_person_id + coalesce(v_platform_linked, 0);
    remaining_unlinked := remaining_unlinked + coalesce(v_platform_unlinked, 0);
  end loop;

  total_in_scope := linked_person_id + remaining_unlinked;

  select count(*)::bigint
    into review_required_count
  from public.identity_resolution_events ire
  where ire.workspace_id = p_workspace_id
    and ire.connector_job_id = p_job_id
    and ire.resolution_action in ('conflict_detected', 'review_required');

  select count(*)::bigint
    into no_identifier_count
  from public.integration_import_errors iie
  where iie.job_id = p_job_id
    and iie.error_class = 'identity_backfill_no_identifiers';

  select count(*)::bigint
    into runtime_error_count
  from public.integration_import_errors iie
  where iie.job_id = p_job_id
    and iie.error_class <> 'identity_backfill_no_identifiers';

  return next;
end;
$$;
