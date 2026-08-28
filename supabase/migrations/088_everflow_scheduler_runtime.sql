-- Everflow scheduled incremental runtime.
-- Additive to the provider-neutral scheduler and intentionally does not modify
-- the existing Commas Cloudflare runtime. Missing Everflow schedules are
-- discovered safely but remain disabled until existing activation controls
-- explicitly enable them.

alter table public.commerce_sync_schedules
  add column if not exists lease_owner text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists lease_heartbeat_at timestamptz;

alter table public.commerce_sync_schedules
  drop constraint if exists commerce_sync_schedules_lease_check;
alter table public.commerce_sync_schedules
  add constraint commerce_sync_schedules_lease_check check (
    (lease_owner is null and lease_expires_at is null and lease_heartbeat_at is null)
    or
    (nullif(btrim(lease_owner),'') is not null and lease_expires_at is not null and lease_heartbeat_at is not null)
  );

create index if not exists commerce_sync_schedules_lease_idx
  on public.commerce_sync_schedules(connection_id,provider_account_id,resource,lease_expires_at)
  where lease_owner is not null;

create or replace function public.ensure_everflow_conversion_schedules(
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
    'everflow_conversions',
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
  where c.provider='everflow'
    and c.status='connected'
    and (p_connection_id is null or c.id=p_connection_id)
  on conflict(connection_id,provider_account_id,resource) do nothing;

  get diagnostics v_inserted=row_count;
  return v_inserted;
end $$;

create or replace function public.claim_everflow_conversion_schedule(
  p_schedule_id uuid,
  p_now timestamptz,
  p_lease_owner text,
  p_lease_seconds integer default 900
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
    raise exception 'invalid everflow schedule lease request' using errcode='22023';
  end if;

  select * into v_schedule
  from public.commerce_sync_schedules
  where id=p_schedule_id
  for update;

  if not found then return; end if;
  if v_schedule.resource<>'everflow_conversions'
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

create or replace function public.finish_everflow_conversion_schedule(
  p_schedule_id uuid,
  p_lease_owner text,
  p_now timestamptz,
  p_outcome text
) returns boolean
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_updated integer;
begin
  if nullif(btrim(p_lease_owner),'') is null
    or p_outcome not in ('completed','incomplete','failed') then
    raise exception 'invalid everflow schedule completion request' using errcode='22023';
  end if;

  update public.commerce_sync_schedules s
  set next_overlap_at = case
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
    and s.resource='everflow_conversions'
    and s.lease_owner=p_lease_owner;

  get diagnostics v_updated=row_count;
  return v_updated=1;
end $$;

revoke all on function public.ensure_everflow_conversion_schedules(uuid) from public,anon,authenticated;
revoke all on function public.claim_everflow_conversion_schedule(uuid,timestamptz,text,integer) from public,anon,authenticated;
revoke all on function public.finish_everflow_conversion_schedule(uuid,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.ensure_everflow_conversion_schedules(uuid) to service_role;
grant execute on function public.claim_everflow_conversion_schedule(uuid,timestamptz,text,integer) to service_role;
grant execute on function public.finish_everflow_conversion_schedule(uuid,text,timestamptz,text) to service_role;

comment on function public.ensure_everflow_conversion_schedules(uuid) is
  'Creates missing Everflow conversion schedules in disabled state without activating provider traffic.';
comment on function public.claim_everflow_conversion_schedule(uuid,timestamptz,text,integer) is
  'Atomically claims one due, permitted Everflow conversion schedule and records last_enqueued_at.';
comment on function public.finish_everflow_conversion_schedule(uuid,text,timestamptz,text) is
  'Owner-checked schedule release and next-run calculation for Everflow conversion polling.';
