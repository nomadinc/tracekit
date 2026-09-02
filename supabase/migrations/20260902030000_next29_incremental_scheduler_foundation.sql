-- 29Next incremental schedule foundation.
-- Reuses the provider-neutral commerce schedule control plane. New rows remain
-- disabled until existing activation controls explicitly enable them.

alter table public.commerce_sync_schedules
  add column if not exists successful_through_at timestamptz,
  add column if not exists active_window_start_at timestamptz,
  add column if not exists active_window_end_at timestamptz,
  add column if not exists resume_cursor text,
  add column if not exists last_completed_at timestamptz,
  add column if not exists last_failed_at timestamptz,
  add column if not exists last_error_code text;

alter table public.commerce_sync_schedules
  drop constraint if exists commerce_sync_schedules_active_window_check;
alter table public.commerce_sync_schedules
  add constraint commerce_sync_schedules_active_window_check check (
    (active_window_start_at is null and active_window_end_at is null and resume_cursor is null)
    or
    (active_window_start_at is not null and active_window_end_at is not null and active_window_end_at >= active_window_start_at)
  );

alter table public.commerce_sync_schedules
  drop constraint if exists commerce_sync_schedules_last_error_code_check;
alter table public.commerce_sync_schedules
  add constraint commerce_sync_schedules_last_error_code_check check (
    last_error_code is null or last_error_code ~ '^[A-Za-z0-9_.-]{1,80}$'
  );

create or replace function public.ensure_next29_resource_schedules(
  p_connection_id uuid default null
) returns integer
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_inserted integer := 0;
begin
  insert into public.commerce_sync_schedules(
    account_id,
    organization_id,
    connection_id,
    provider_account_id,
    resource,
    enabled,
    activation_state,
    next_overlap_at,
    sync_frequency
  )
  select
    c.account_id,
    c.organization_id,
    c.id,
    a.id,
    r.resource,
    false,
    'disabled',
    now(),
    'hourly'
  from public.commerce_provider_connections c
  join lateral (
    select pa.id
    from public.commerce_provider_accounts pa
    where pa.organization_id=c.organization_id
      and pa.connection_id=c.id
      and pa.status='active'
      and pa.provider_account_external_id not like 'provisional:%'
    order by pa.created_at asc,pa.id asc
    limit 1
  ) a on true
  cross join (values
    ('next29_orders'::text),
    ('next29_subscriptions'::text),
    ('next29_disputes'::text)
  ) r(resource)
  where c.provider='next29'
    and c.status='connected'
    and (p_connection_id is null or c.id=p_connection_id)
  on conflict(connection_id,provider_account_id,resource) do nothing;

  get diagnostics v_inserted=row_count;
  return v_inserted;
end $$;

create or replace function public.claim_next29_resource_schedule(
  p_schedule_id uuid,
  p_now timestamptz,
  p_lease_owner text,
  p_lease_seconds integer default 300
) returns setof public.commerce_sync_schedules
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_schedule public.commerce_sync_schedules%rowtype;
begin
  if nullif(btrim(p_lease_owner),'') is null
    or p_lease_seconds<30
    or p_lease_seconds>1800 then
    raise exception 'invalid 29Next schedule lease request' using errcode='22023';
  end if;

  select * into v_schedule
  from public.commerce_sync_schedules
  where id=p_schedule_id
  for update;

  if not found then return; end if;
  if v_schedule.resource not in ('next29_orders','next29_subscriptions','next29_disputes')
    or not v_schedule.enabled
    or v_schedule.activation_state<>'enabled'
    or v_schedule.sync_frequency='manual'
    or v_schedule.next_overlap_at is null
    or v_schedule.next_overlap_at>p_now
    or not public.commerce_schedule_permitted(v_schedule.organization_id,v_schedule.connection_id)
    or (v_schedule.lease_owner is not null and v_schedule.lease_expires_at>=p_now) then
    return;
  end if;

  return query
  update public.commerce_sync_schedules s
  set lease_owner=p_lease_owner,
      lease_expires_at=p_now+make_interval(secs=>p_lease_seconds),
      lease_heartbeat_at=p_now,
      last_enqueued_at=p_now,
      updated_at=p_now
  where s.id=p_schedule_id
  returning s.*;
end $$;

create or replace function public.finish_next29_resource_schedule(
  p_schedule_id uuid,
  p_lease_owner text,
  p_now timestamptz,
  p_outcome text,
  p_successful_through_at timestamptz default null,
  p_active_window_start_at timestamptz default null,
  p_active_window_end_at timestamptz default null,
  p_resume_cursor text default null,
  p_error_code text default null
) returns boolean
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_updated integer;
begin
  if nullif(btrim(p_lease_owner),'') is null
    or p_outcome not in ('completed','incomplete','failed')
    or (p_error_code is not null and p_error_code !~ '^[A-Za-z0-9_.-]{1,80}$')
    or ((p_active_window_start_at is null) <> (p_active_window_end_at is null))
    or (p_active_window_start_at is not null and p_active_window_end_at<p_active_window_start_at)
    or (p_resume_cursor is not null and p_active_window_start_at is null)
    or (p_outcome='completed' and (p_successful_through_at is null or p_active_window_start_at is not null or p_resume_cursor is not null))
    or (p_outcome='incomplete' and (p_active_window_start_at is null or p_active_window_end_at is null or nullif(btrim(p_resume_cursor),'') is null))
    or (p_outcome='failed' and nullif(btrim(p_error_code),'') is null) then
    raise exception 'invalid 29Next schedule completion request' using errcode='22023';
  end if;

  update public.commerce_sync_schedules s
  set successful_through_at = case
        when p_outcome='completed' then p_successful_through_at
        else s.successful_through_at
      end,
      active_window_start_at = case
        when p_outcome='incomplete' then p_active_window_start_at
        when p_outcome='completed' then null
        else s.active_window_start_at
      end,
      active_window_end_at = case
        when p_outcome='incomplete' then p_active_window_end_at
        when p_outcome='completed' then null
        else s.active_window_end_at
      end,
      resume_cursor = case
        when p_outcome='incomplete' then p_resume_cursor
        when p_outcome='completed' then null
        else s.resume_cursor
      end,
      last_completed_at = case when p_outcome='completed' then p_now else s.last_completed_at end,
      last_failed_at = case when p_outcome='failed' then p_now else s.last_failed_at end,
      last_error_code = case when p_outcome='failed' then p_error_code when p_outcome='completed' then null else s.last_error_code end,
      next_overlap_at = case
        when p_outcome='failed' then p_now+interval '5 minutes'
        when p_outcome='incomplete' then p_now+interval '1 minute'
        when s.sync_frequency='5_minutes' then p_now+interval '5 minutes'
        when s.sync_frequency='15_minutes' then p_now+interval '15 minutes'
        when s.sync_frequency='30_minutes' then p_now+interval '30 minutes'
        else p_now+interval '1 hour'
      end,
      lease_owner=null,
      lease_expires_at=null,
      lease_heartbeat_at=null,
      updated_at=p_now
  where s.id=p_schedule_id
    and s.resource in ('next29_orders','next29_subscriptions','next29_disputes')
    and s.lease_owner=p_lease_owner;

  get diagnostics v_updated=row_count;
  return v_updated=1;
end $$;

revoke all on function public.ensure_next29_resource_schedules(uuid) from public,anon,authenticated;
revoke all on function public.claim_next29_resource_schedule(uuid,timestamptz,text,integer) from public,anon,authenticated;
revoke all on function public.finish_next29_resource_schedule(uuid,text,timestamptz,text,timestamptz,timestamptz,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.ensure_next29_resource_schedules(uuid) to service_role;
grant execute on function public.claim_next29_resource_schedule(uuid,timestamptz,text,integer) to service_role;
grant execute on function public.finish_next29_resource_schedule(uuid,text,timestamptz,text,timestamptz,timestamptz,timestamptz,text,text) to service_role;

comment on function public.ensure_next29_resource_schedules(uuid) is
  'Creates missing 29Next resource schedules in disabled state without activating provider traffic.';
comment on function public.claim_next29_resource_schedule(uuid,timestamptz,text,integer) is
  'Atomically claims one due, permitted 29Next resource schedule using the shared commerce lease.';
comment on function public.finish_next29_resource_schedule(uuid,text,timestamptz,text,timestamptz,timestamptz,timestamptz,text,text) is
  'Owner-checked 29Next schedule release with durable date-window and cursor checkpoint state.';
