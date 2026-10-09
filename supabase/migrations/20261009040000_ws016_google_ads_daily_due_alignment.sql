begin;

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
 set next_run_at=case
   when s.sync_frequency='daily' then
     ((p_now at time zone 'UTC')::date + 1 + time '08:15:00') at time zone 'UTC'
   when p_outcome='failed' then p_now + interval '15 minutes'
   when s.sync_frequency='hourly' then p_now + interval '1 hour'
   else p_now + interval '1 day'
  end,
  lease_owner=null,lease_expires_at=null,lease_heartbeat_at=null,updated_at=p_now
 where s.id=p_schedule_id and s.provider='google_ads' and s.resource='campaign_daily'
   and s.lease_owner=p_lease_owner;
 get diagnostics v_updated=row_count;
 return v_updated=1;
end $$;

comment on function public.finish_google_ads_campaign_daily_schedule(uuid,text,timestamptz,text)
is 'Owner-checked release. Daily schedules become due at 08:15 UTC the next day, ahead of the 08:17 UTC Vercel cron; failures retry on the next daily invocation.';

commit;
