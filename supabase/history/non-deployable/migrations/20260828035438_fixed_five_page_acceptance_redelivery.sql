create table public.commerce_normal_acceptance_redelivery_markers (
  redelivery_key text primary key,
  run_id uuid not null unique references public.commerce_sync_runs(id) on delete restrict,
  claimed_at timestamptz not null default now(),
  queue_dispatched_at timestamptz,
  constraint commerce_normal_acceptance_redelivery_fixed_key_check check (
    redelivery_key = '1f01c739-f609-4cf8-aff1-b2a5891ddd8a'
    and run_id = '1f01c739-f609-4cf8-aff1-b2a5891ddd8a'::uuid
  )
);

alter table public.commerce_normal_acceptance_redelivery_markers enable row level security;
revoke all on table public.commerce_normal_acceptance_redelivery_markers from public, anon, authenticated;
grant select, insert, update on table public.commerce_normal_acceptance_redelivery_markers to service_role;

create or replace function public.claim_normal_acceptance_redelivery_1f01c739()
returns table(run_id uuid, account_id uuid, organization_id uuid, connection_id uuid, provider_account_id uuid, scheduler_identity text, request_key uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run public.commerce_sync_runs%rowtype;
  v_connection public.commerce_provider_connections%rowtype;
  v_account public.commerce_provider_accounts%rowtype;
  v_schedule public.commerce_sync_schedules%rowtype;
  v_quota public.commerce_continuous_sync_state%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('normal-acceptance-redelivery:1f01c739-f609-4cf8-aff1-b2a5891ddd8a', 0));

  if exists (select 1 from public.commerce_normal_acceptance_redelivery_markers) then
    raise exception 'normal acceptance redelivery already claimed' using errcode = '42501';
  end if;

  select r.* into v_run from public.commerce_sync_runs r
  where r.id = '1f01c739-f609-4cf8-aff1-b2a5891ddd8a'::uuid
  for update;
  if not found then raise exception 'normal acceptance redelivery run unavailable' using errcode = '42501'; end if;
  if v_run.connection_id is distinct from 'ea1c2313-6120-4692-84c5-ec3562e7dcf6'::uuid
    or v_run.provider_account_id is distinct from '0369c701-717f-4c34-b230-8341bcdb7e65'::uuid
    or v_run.sync_type is distinct from 'transactions'
    or v_run.mode is distinct from 'continuous'
    or v_run.status is distinct from 'queued'
    or v_run.started_at is not null or v_run.completed_at is not null
    or v_run.lease_owner is not null or v_run.lease_expires_at is not null
    or v_run.pages_completed is distinct from 0
    or v_run.provider_request_count is distinct from 0
    or v_run.records_seen is distinct from 0 then
    raise exception 'normal acceptance redelivery run state invalid' using errcode = '42501';
  end if;
  if v_run.metadata->>'normal_acceptance' is distinct from 'true'
    or v_run.metadata->>'normal_acceptance_follow_up' is distinct from 'five_page'
    or v_run.metadata->>'follow_up_of' is distinct from 'b1547be9-31aa-4487-9c08-796f6fc49005'
    or v_run.metadata->>'shadow_only' is distinct from 'true'
    or coalesce((v_run.metadata->>'max_pages')::integer, 0) <> 5
    or coalesce((v_run.metadata->>'per_page')::integer, 0) <> 100
    or v_run.metadata->>'acceptance_cycle' is distinct from 'true'
    or v_run.metadata->>'dispatch_source' is distinct from 'operator_one_shot'
    or (v_run.metadata->>'request_key') is null
    or v_run.scheduler_idempotency_key is distinct from 'operator-normal-continuous-acceptance-5:' || (v_run.metadata->>'request_key') then
    raise exception 'normal acceptance redelivery metadata invalid' using errcode = '42501';
  end if;
  if exists (select 1 from public.commerce_sync_checkpoints cp where cp.sync_run_id = v_run.id) then
    raise exception 'normal acceptance redelivery checkpoint exists' using errcode = '42501';
  end if;
  if exists (select 1 from public.commerce_sync_runs ar where ar.organization_id = v_run.organization_id and ar.connection_id = v_run.connection_id and ar.id <> v_run.id and ar.status in ('queued','running','paused')) then
    raise exception 'normal acceptance redelivery conflicting run exists' using errcode = '42501';
  end if;

  select c.* into v_connection from public.commerce_provider_connections c
  where c.id = 'ea1c2313-6120-4692-84c5-ec3562e7dcf6'::uuid
    and c.id = v_run.connection_id and c.organization_id = v_run.organization_id
    and c.provider = 'commas' and c.status = 'connected';
  if not found then raise exception 'normal acceptance redelivery connection invalid' using errcode = '42501'; end if;
  select a.* into v_account from public.commerce_provider_accounts a
  where a.id = '0369c701-717f-4c34-b230-8341bcdb7e65'::uuid
    and a.id = v_run.provider_account_id and a.organization_id = v_run.organization_id
    and a.connection_id = v_run.connection_id and a.status = 'active';
  if not found or (select count(*) from public.commerce_provider_accounts a where a.organization_id=v_run.organization_id and a.connection_id=v_run.connection_id and a.status='active') <> 1 then
    raise exception 'normal acceptance redelivery provider account invalid' using errcode = '42501';
  end if;
  if not exists (select 1 from public.commerce_provider_credentials c where c.organization_id=v_run.organization_id and c.connection_id=v_run.connection_id and c.revoked_at is null) then
    raise exception 'normal acceptance redelivery credential unavailable' using errcode = '42501';
  end if;
  select s.* into v_schedule from public.commerce_sync_schedules s
  where s.organization_id=v_run.organization_id and s.connection_id=v_run.connection_id and s.provider_account_id=v_run.provider_account_id and s.resource='transactions' limit 1;
  if not found or v_schedule.enabled or v_schedule.sync_frequency <> 'hourly' or v_schedule.activation_state = 'paused' then
    raise exception 'normal acceptance redelivery schedule invalid' using errcode = '42501';
  end if;
  if exists (select 1 from public.commerce_connection_pauses p where p.organization_id=v_run.organization_id and p.connection_id=v_run.connection_id and p.paused=true) then raise exception 'normal acceptance redelivery paused' using errcode='42501'; end if;
  if exists (select 1 from public.commerce_repository_activation a where a.organization_id=v_run.organization_id and a.mode in ('live','live_beta')) then raise exception 'normal acceptance redelivery live activation exists' using errcode='42501'; end if;
  if exists (select 1 from public.tracekit_production_controls c where c.capability='commerce_scheduler' and c.activation_state='enabled') then raise exception 'normal acceptance redelivery scheduler enabled' using errcode='42501'; end if;
  select q.* into v_quota from public.commerce_continuous_sync_state q
  where q.organization_id=v_run.organization_id and q.connection_id=v_run.connection_id and q.provider_account_id=v_run.provider_account_id and q.resource='transactions' limit 1;
  if not found or v_quota.quota_observed_at is null or v_quota.quota_observed_at < now()-interval '15 minutes'
    or v_quota.quota_remaining is null or v_quota.quota_remaining-5 < coalesce(v_schedule.quota_minimum_remaining,1000) then
    raise exception 'normal acceptance redelivery quota unavailable' using errcode='42501';
  end if;

  insert into public.commerce_normal_acceptance_redelivery_markers(redelivery_key, run_id)
  values ('1f01c739-f609-4cf8-aff1-b2a5891ddd8a', v_run.id);
  return query select v_run.id, v_connection.account_id, v_run.organization_id, v_run.connection_id, v_run.provider_account_id, v_run.scheduler_idempotency_key, (v_run.metadata->>'request_key')::uuid;
end;
$$;

create or replace function public.mark_normal_acceptance_redelivery_dispatched_1f01c739()
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('normal-acceptance-redelivery:1f01c739-f609-4cf8-aff1-b2a5891ddd8a', 0));
  update public.commerce_normal_acceptance_redelivery_markers
  set queue_dispatched_at = now()
  where redelivery_key='1f01c739-f609-4cf8-aff1-b2a5891ddd8a' and queue_dispatched_at is null;
  return found;
end;
$$;

revoke all on function public.claim_normal_acceptance_redelivery_1f01c739() from public, anon, authenticated;
revoke all on function public.mark_normal_acceptance_redelivery_dispatched_1f01c739() from public, anon, authenticated;
grant execute on function public.claim_normal_acceptance_redelivery_1f01c739() to service_role;
grant execute on function public.mark_normal_acceptance_redelivery_dispatched_1f01c739() to service_role;
