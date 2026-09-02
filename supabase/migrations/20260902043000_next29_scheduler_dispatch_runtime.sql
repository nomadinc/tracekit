-- 29Next scheduled dispatch runtime.
-- Adds due-target discovery and lease heartbeat only. It does not create an
-- external timer, register webhooks, or enable any schedule.

create or replace function public.list_due_next29_resource_schedules(
  p_now timestamptz,
  p_limit integer default 25
) returns setof public.commerce_sync_schedules
language sql
security invoker
set search_path=public,pg_temp
as $$
  select s.*
  from public.commerce_sync_schedules s
  join public.commerce_provider_connections c
    on c.id=s.connection_id
   and c.organization_id=s.organization_id
  where s.resource in ('next29_orders','next29_subscriptions','next29_disputes')
    and c.provider='next29'
    and c.status='connected'
    and s.enabled
    and s.activation_state='enabled'
    and s.sync_frequency<>'manual'
    and s.next_overlap_at is not null
    and s.next_overlap_at<=p_now
    and public.commerce_schedule_permitted(s.organization_id,s.connection_id)
    and (s.lease_owner is null or s.lease_expires_at<p_now)
    and p_limit between 1 and 100
  order by s.next_overlap_at asc,s.created_at asc,s.id asc
  limit p_limit
$$;

create or replace function public.heartbeat_next29_resource_schedule(
  p_schedule_id uuid,
  p_lease_owner text,
  p_now timestamptz,
  p_lease_seconds integer default 300
) returns boolean
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_updated integer;
begin
  if nullif(btrim(p_lease_owner),'') is null
    or p_lease_seconds<30
    or p_lease_seconds>1800 then
    raise exception 'invalid 29Next schedule heartbeat request' using errcode='22023';
  end if;

  update public.commerce_sync_schedules s
  set lease_expires_at=p_now+make_interval(secs=>p_lease_seconds),
      lease_heartbeat_at=p_now,
      updated_at=p_now
  where s.id=p_schedule_id
    and s.resource in ('next29_orders','next29_subscriptions','next29_disputes')
    and s.lease_owner=p_lease_owner
    and s.lease_expires_at>=p_now;

  get diagnostics v_updated=row_count;
  return v_updated=1;
end $$;

revoke all on function public.list_due_next29_resource_schedules(timestamptz,integer) from public,anon,authenticated;
revoke all on function public.heartbeat_next29_resource_schedule(uuid,text,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.list_due_next29_resource_schedules(timestamptz,integer) to service_role;
grant execute on function public.heartbeat_next29_resource_schedule(uuid,text,timestamptz,integer) to service_role;

comment on function public.list_due_next29_resource_schedules(timestamptz,integer) is
  'Lists only already-enabled, due, permitted and currently-unleased 29Next schedules for an external dispatcher.';
comment on function public.heartbeat_next29_resource_schedule(uuid,text,timestamptz,integer) is
  'Owner-checked lease renewal for a claimed 29Next schedule.';
