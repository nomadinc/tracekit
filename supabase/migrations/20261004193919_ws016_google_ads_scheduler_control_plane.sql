begin;

alter table public.marketing_reporting_schedules
  add column if not exists lease_owner text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists lease_heartbeat_at timestamptz;

alter table public.marketing_reporting_schedules
  add constraint marketing_reporting_schedules_lease_check check (
    (lease_owner is null and lease_expires_at is null and lease_heartbeat_at is null)
    or
    (nullif(btrim(lease_owner),'') is not null and lease_expires_at is not null and lease_heartbeat_at is not null)
  );

create or replace function public.ensure_google_ads_campaign_daily_schedule(
  p_connection_id uuid
) returns integer
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare v_inserted integer:=0;
begin
  insert into public.marketing_reporting_schedules(
    account_id,organization_id,connection_id,provider_account_id,provider,resource,
    enabled,activation_state,sync_frequency,next_run_at
  )
  select a.account_id,a.organization_id,a.connection_id,a.id,'google_ads','campaign_daily',
         false,'disabled','manual',null
  from public.marketing_provider_accounts a
  join public.marketing_provider_connections c
    on c.organization_id=a.organization_id and c.id=a.connection_id
  where a.connection_id=p_connection_id
    and a.provider='google_ads'
    and a.status='active'
    and a.selected_for_sync
    and c.provider='google_ads'
    and c.status='connected'
  on conflict(organization_id,connection_id,provider_account_id,resource) do nothing;
  get diagnostics v_inserted=row_count;
  return v_inserted;
end $$;

create or replace function public.claim_google_ads_campaign_daily_schedule(
  p_schedule_id uuid,p_now timestamptz,p_lease_owner text,p_lease_seconds integer default 900
) returns setof public.marketing_reporting_schedules
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare v_schedule public.marketing_reporting_schedules%rowtype;
begin
  if nullif(btrim(p_lease_owner),'') is null or p_lease_seconds<30 or p_lease_seconds>1800 then
    raise exception 'invalid google ads reporting schedule lease request' using errcode='22023';
  end if;
  select * into v_schedule from public.marketing_reporting_schedules where id=p_schedule_id for update;
  if not found then return; end if;
  if v_schedule.provider<>'google_ads'
    or v_schedule.resource<>'campaign_daily'
    or not v_schedule.enabled
    or v_schedule.activation_state<>'enabled'
    or v_schedule.sync_frequency='manual'
    or v_schedule.next_run_at is null
    or v_schedule.next_run_at>p_now
    or (v_schedule.lease_owner is not null and v_schedule.lease_expires_at>=p_now) then return;
  end if;
  return query update public.marketing_reporting_schedules s
  set lease_owner=p_lease_owner,lease_expires_at=p_now+make_interval(secs=>p_lease_seconds),
      lease_heartbeat_at=p_now,last_enqueued_at=p_now,updated_at=p_now
  where s.id=p_schedule_id returning s.*;
end $$;

create or replace function public.finish_google_ads_campaign_daily_schedule(
  p_schedule_id uuid,p_lease_owner text,p_now timestamptz,p_outcome text
) returns boolean
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare v_updated integer;
begin
  if nullif(btrim(p_lease_owner),'') is null or p_outcome not in ('completed','failed') then
    raise exception 'invalid google ads reporting schedule completion request' using errcode='22023';
  end if;
  update public.marketing_reporting_schedules s
  set next_run_at=case when p_outcome='failed' then p_now+interval '15 minutes'
                       when s.sync_frequency='hourly' then p_now+interval '1 hour'
                       else p_now+interval '1 day' end,
      lease_owner=null,lease_expires_at=null,lease_heartbeat_at=null,updated_at=p_now
  where s.id=p_schedule_id and s.provider='google_ads' and s.resource='campaign_daily' and s.lease_owner=p_lease_owner;
  get diagnostics v_updated=row_count;
  return v_updated=1;
end $$;

revoke all on function public.ensure_google_ads_campaign_daily_schedule(uuid) from public,anon,authenticated;
revoke all on function public.claim_google_ads_campaign_daily_schedule(uuid,timestamptz,text,integer) from public,anon,authenticated;
revoke all on function public.finish_google_ads_campaign_daily_schedule(uuid,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.ensure_google_ads_campaign_daily_schedule(uuid) to service_role;
grant execute on function public.claim_google_ads_campaign_daily_schedule(uuid,timestamptz,text,integer) to service_role;
grant execute on function public.finish_google_ads_campaign_daily_schedule(uuid,text,timestamptz,text) to service_role;

comment on function public.ensure_google_ads_campaign_daily_schedule(uuid) is 'Creates the selected Google Ads campaign-daily schedule disabled/manual; never activates provider polling.';
comment on function public.claim_google_ads_campaign_daily_schedule(uuid,timestamptz,text,integer) is 'Atomically claims only an explicitly enabled, non-manual, due Google Ads reporting schedule.';
comment on function public.finish_google_ads_campaign_daily_schedule(uuid,text,timestamptz,text) is 'Owner-checked release and next-run calculation for a claimed Google Ads reporting schedule.';

commit;
