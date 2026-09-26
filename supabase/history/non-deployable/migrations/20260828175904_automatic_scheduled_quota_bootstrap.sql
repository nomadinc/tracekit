create table if not exists public.commerce_scheduled_quota_bootstrap_claims (
  connection_id uuid not null,
  provider_account_id uuid not null,
  resource text not null,
  organization_id uuid not null,
  claim_token uuid not null,
  status text not null,
  claimed_at timestamptz not null,
  completed_at timestamptz,
  failed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (connection_id, provider_account_id, resource),
  check (status in ('claimed','completed','failed')),
  check (resource = 'transactions')
);

alter table public.commerce_scheduled_quota_bootstrap_claims enable row level security;
revoke all on public.commerce_scheduled_quota_bootstrap_claims from public, anon, authenticated;
grant select, insert, update on public.commerce_scheduled_quota_bootstrap_claims to service_role;

create or replace function public.claim_scheduled_commerce_quota_bootstrap(
  p_organization_id uuid, p_connection_id uuid, p_provider_account_id uuid,
  p_resource text, p_now timestamptz
) returns table(claimed boolean, reason text, claim_token uuid)
language plpgsql security invoker set search_path = public as $$
declare v_schedule public.commerce_sync_schedules%rowtype; v_previous public.commerce_scheduled_quota_bootstrap_claims%rowtype; v_token uuid:=gen_random_uuid();
begin
  perform pg_advisory_xact_lock(hashtextextended('scheduled-commerce-quota-bootstrap:'||p_connection_id::text||':'||p_provider_account_id::text||':'||p_resource,0));
  select * into v_schedule from public.commerce_sync_schedules s where s.organization_id=p_organization_id and s.connection_id=p_connection_id and s.provider_account_id=p_provider_account_id and s.resource=p_resource for update;
  if not found or v_schedule.enabled is not true or v_schedule.activation_state <> 'enabled' then return query select false,'schedule_disabled',null::uuid; return; end if;
  if v_schedule.sync_frequency='manual' or (v_schedule.last_enqueued_at is not null and v_schedule.last_enqueued_at > p_now-case v_schedule.sync_frequency when '5_minutes' then interval '5 minutes' when '15_minutes' then interval '15 minutes' when '30_minutes' then interval '30 minutes' else interval '1 hour' end) then return query select false,'schedule_not_due',null::uuid; return; end if;
  if v_schedule.next_overlap_at is not null and v_schedule.next_overlap_at>p_now and (v_schedule.next_deep_reconciliation_at is null or v_schedule.next_deep_reconciliation_at>p_now) then return query select false,'schedule_not_due',null::uuid; return; end if;
  if not exists(select 1 from public.tracekit_production_controls c where c.capability='commerce_scheduler' and c.activation_state='enabled') then return query select false,'scheduler_control_disabled',null::uuid; return; end if;
  if not exists(select 1 from public.commerce_provider_connections c where c.id=p_connection_id and c.organization_id=p_organization_id and c.provider='commas' and c.status='connected') then return query select false,'connection_unavailable',null::uuid; return; end if;
  if (select count(*) from public.commerce_provider_accounts a where a.organization_id=p_organization_id and a.connection_id=p_connection_id and a.status='active')<>1 or not exists(select 1 from public.commerce_provider_accounts a where a.id=p_provider_account_id and a.organization_id=p_organization_id and a.connection_id=p_connection_id and a.status='active') then return query select false,'provider_account_scope',null::uuid; return; end if;
  if exists(select 1 from public.commerce_connection_pauses p where p.organization_id=p_organization_id and p.connection_id=p_connection_id and p.paused=true) then return query select false,'connection_paused',null::uuid; return; end if;
  if exists(select 1 from public.commerce_repository_activation a where a.organization_id=p_organization_id and a.mode in ('live','live_beta')) then return query select false,'live_activation',null::uuid; return; end if;
  if exists(select 1 from public.commerce_sync_runs r where r.organization_id=p_organization_id and r.connection_id=p_connection_id and r.status in ('queued','running','paused')) then return query select false,'active_run',null::uuid; return; end if;
  if exists(select 1 from public.commerce_continuous_sync_state q where q.organization_id=p_organization_id and q.connection_id=p_connection_id and q.provider_account_id=p_provider_account_id and q.resource=p_resource and q.quota_observed_at is not null and q.quota_observed_at>=p_now-(case v_schedule.sync_frequency when '5_minutes' then interval '20 minutes' when '15_minutes' then interval '30 minutes' when '30_minutes' then interval '45 minutes' else interval '75 minutes' end)) then return query select false,'quota_fresh',null::uuid; return; end if;
  select * into v_previous from public.commerce_scheduled_quota_bootstrap_claims c where c.connection_id=p_connection_id and c.provider_account_id=p_provider_account_id and c.resource=p_resource;
  if found and v_previous.claimed_at>p_now-interval '30 minutes' then return query select false,'throttled',null::uuid; return; end if;
  insert into public.commerce_scheduled_quota_bootstrap_claims(connection_id,provider_account_id,resource,organization_id,claim_token,status,claimed_at,completed_at,failed_at,updated_at)
  values(p_connection_id,p_provider_account_id,p_resource,p_organization_id,v_token,'claimed',p_now,null,null,p_now)
  on conflict(connection_id,provider_account_id,resource) do update set organization_id=excluded.organization_id,claim_token=excluded.claim_token,status='claimed',claimed_at=excluded.claimed_at,completed_at=null,failed_at=null,updated_at=excluded.updated_at;
  return query select true,'claimed',v_token;
end $$;

create or replace function public.finish_scheduled_commerce_quota_bootstrap(p_claim_token uuid,p_success boolean,p_now timestamptz)
returns boolean language sql security invoker set search_path=public as $$
  update public.commerce_scheduled_quota_bootstrap_claims set status=case when p_success then 'completed' else 'failed' end,completed_at=case when p_success then p_now else null end,failed_at=case when p_success then null else p_now end,updated_at=p_now where claim_token=p_claim_token and status='claimed' returning true
$$;
revoke all on function public.claim_scheduled_commerce_quota_bootstrap(uuid,uuid,uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function public.finish_scheduled_commerce_quota_bootstrap(uuid,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_scheduled_commerce_quota_bootstrap(uuid,uuid,uuid,text,timestamptz) to service_role;
grant execute on function public.finish_scheduled_commerce_quota_bootstrap(uuid,boolean,timestamptz) to service_role;
