begin;

create or replace function public.activate_google_ads_campaign_daily_schedule(
  p_schedule_id uuid,
  p_now timestamptz
) returns boolean
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare v_updated integer;
begin
  update public.marketing_reporting_schedules s
  set enabled=true,
      activation_state='enabled',
      sync_frequency='daily',
      next_run_at=p_now,
      lease_owner=null,
      lease_expires_at=null,
      lease_heartbeat_at=null,
      updated_at=p_now
  where s.id=p_schedule_id
    and s.provider='google_ads'
    and s.resource='campaign_daily'
    and s.enabled=false
    and s.activation_state='disabled'
    and s.sync_frequency='manual'
    and s.lease_owner is null;
  get diagnostics v_updated=row_count;
  return v_updated=1;
end $$;

revoke all on function public.activate_google_ads_campaign_daily_schedule(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.activate_google_ads_campaign_daily_schedule(uuid,timestamptz) to service_role;

comment on function public.activate_google_ads_campaign_daily_schedule(uuid,timestamptz) is
  'Explicitly activates a previously disabled/manual Google Ads campaign-daily schedule at daily cadence.';

commit;
