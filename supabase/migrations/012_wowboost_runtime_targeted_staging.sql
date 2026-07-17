-- Target-driven WowBoost Connector Runtime staging.

create extension if not exists pgcrypto;

create table if not exists public.wowboost_order_reference_targets (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null default 'default',
  job_id uuid not null references public.integration_import_jobs(id) on delete cascade,
  connector_id text not null,
  requested_from text not null,
  requested_to text not null,
  order_number text not null,
  platform_order_id text,
  order_ts timestamptz,
  mapped_order_id text,
  mapped_at timestamptz,
  last_seen_export_page integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_id, order_number)
);

create index if not exists wowboost_order_reference_targets_job_order_number_idx
  on public.wowboost_order_reference_targets (job_id, order_number);

create index if not exists wowboost_order_reference_targets_job_unmapped_idx
  on public.wowboost_order_reference_targets (job_id, order_number)
  where mapped_at is null;

create index if not exists wowboost_order_reference_targets_workspace_order_number_idx
  on public.wowboost_order_reference_targets (workspace_id, order_number);

create or replace function public.sync_wowboost_order_reference_target_coverage(p_job_id uuid)
returns table(
  target_order_numbers_total integer,
  target_order_numbers_mapped integer,
  target_order_numbers_remaining integer,
  target_mapping_coverage_percent numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  with first_stage as (
    select distinct on (job_id, order_number)
      job_id,
      order_number,
      order_id,
      export_page
    from public.wowboost_order_reference_stage
    where job_id = p_job_id
    order by job_id, order_number, export_page asc, order_id asc
  )
  update public.wowboost_order_reference_targets target
  set
    mapped_order_id = coalesce(target.mapped_order_id, first_stage.order_id),
    mapped_at = coalesce(target.mapped_at, now()),
    last_seen_export_page = coalesce(target.last_seen_export_page, first_stage.export_page),
    updated_at = now()
  from first_stage
  where target.job_id = p_job_id
    and target.order_number = first_stage.order_number
    and target.mapped_at is null;

  return query
  select
    count(*)::integer as target_order_numbers_total,
    count(*) filter (where mapped_at is not null)::integer as target_order_numbers_mapped,
    count(*) filter (where mapped_at is null)::integer as target_order_numbers_remaining,
    case
      when count(*) = 0 then 100::numeric
      else round((count(*) filter (where mapped_at is not null))::numeric * 100 / count(*)::numeric, 2)
    end as target_mapping_coverage_percent
  from public.wowboost_order_reference_targets
  where job_id = p_job_id;
end
$$;

create or replace function public.populate_wowboost_order_reference_targets(
  p_job_id uuid,
  p_workspace_id text,
  p_connector_id text,
  p_requested_from text,
  p_requested_to text
)
returns table(
  target_order_numbers_total integer,
  target_order_numbers_mapped integer,
  target_order_numbers_remaining integer,
  target_mapping_coverage_percent numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wowboost_order_reference_targets (
    workspace_id,
    job_id,
    connector_id,
    requested_from,
    requested_to,
    order_number,
    platform_order_id,
    order_ts,
    updated_at
  )
  select
    coalesce(nullif(btrim(p_workspace_id), ''), 'default') as workspace_id,
    p_job_id as job_id,
    p_connector_id as connector_id,
    p_requested_from as requested_from,
    p_requested_to as requested_to,
    suffix.order_number,
    min(po.platform_order_id) as platform_order_id,
    min(po.order_ts) as order_ts,
    now() as updated_at
  from public.platform_orders po
  cross join lateral (
    select substring(po.platform_order_id from '[^:]+$') as order_number
  ) suffix
  where po.platform = 'wowsuite:wowboost'
    and (po.order_id is null or btrim(po.order_id) = '')
    and po.platform_order_id is not null
    and suffix.order_number ~ '^[0-9]+$'
    and (po.commerce_reference is null or btrim(po.commerce_reference) = '')
    and po.order_ts >= (p_requested_from::date)::timestamptz
    and po.order_ts < ((p_requested_to::date + 1)::timestamptz)
  group by suffix.order_number
  on conflict (job_id, order_number) do update
  set
    platform_order_id = coalesce(public.wowboost_order_reference_targets.platform_order_id, excluded.platform_order_id),
    order_ts = coalesce(public.wowboost_order_reference_targets.order_ts, excluded.order_ts),
    updated_at = now();

  return query
  select *
  from public.sync_wowboost_order_reference_target_coverage(p_job_id);
end
$$;
