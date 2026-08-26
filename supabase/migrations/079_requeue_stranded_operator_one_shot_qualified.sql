-- Corrective replacement for migration 078. Every table reference is
-- explicitly qualified to avoid collisions with RETURNS TABLE output names.
create or replace function public.requeue_stranded_operator_one_shot_9c8731d7()
returns table(
  run_id uuid,
  account_id uuid,
  organization_id uuid,
  connection_id uuid,
  provider_account_id uuid,
  scheduler_identity text,
  request_key uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run public.commerce_sync_runs%rowtype;
  v_connection public.commerce_provider_connections%rowtype;
  v_schedule public.commerce_sync_schedules%rowtype;
  v_active integer;
  v_lowest_incomplete integer;
  v_quota integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('stranded-operator-one-shot:9c8731d7-1dae-4844-a7ce-0b6fccea170e', 0));

  select r.* into v_run
  from public.commerce_sync_runs as r
  where r.id = '9c8731d7-1dae-4844-a7ce-0b6fccea170e'
  for update;
  if not found then raise exception 'stranded run unavailable' using errcode = '42501'; end if;
  if v_run.connection_id <> 'ea1c2313-6120-4692-84c5-ec3562e7dcf6'
     or v_run.sync_type <> 'transactions'
     or v_run.mode <> 'continuous'
     or v_run.status <> 'running'
     or v_run.lease_expires_at is null
     or v_run.lease_expires_at >= now()
     or v_run.cancelled_at is not null then
    raise exception 'stranded run is not reclaimable' using errcode = '42501';
  end if;
  if coalesce(v_run.metadata->>'dispatch_source','') <> 'operator_one_shot'
     or v_run.metadata->>'acceptance_cycle' <> 'true'
     or v_run.metadata->>'shadow_only' <> 'true'
     or coalesce((v_run.metadata->>'max_pages')::integer, 0) <> 8
     or coalesce((v_run.metadata->>'per_page')::integer, 0) <> 100
     or coalesce(v_run.metadata->>'operator_recovery_dispatched','false') = 'true' then
    raise exception 'stranded run metadata is not eligible' using errcode = '42501';
  end if;

  select c.* into v_connection
  from public.commerce_provider_connections as c
  where c.id = v_run.connection_id and c.organization_id = v_run.organization_id;
  if not found or v_connection.provider <> 'commas' or v_connection.status <> 'connected'
     or coalesce(v_run.metadata->>'account_id','') <> v_connection.account_id::text then
    raise exception 'stranded connection scope unavailable' using errcode = '42501';
  end if;
  if (select count(*) from public.commerce_provider_accounts as pa where pa.organization_id=v_run.organization_id and pa.connection_id=v_run.connection_id and pa.status='active') <> 1
     or not exists (select 1 from public.commerce_provider_accounts as pa where pa.id=v_run.provider_account_id and pa.organization_id=v_run.organization_id and pa.connection_id=v_run.connection_id and pa.status='active') then
    raise exception 'stranded provider account unavailable' using errcode = '42501';
  end if;
  if not exists (select 1 from public.commerce_provider_credentials as pc where pc.organization_id=v_run.organization_id and pc.connection_id=v_run.connection_id and pc.revoked_at is null) then
    raise exception 'stranded credential unavailable' using errcode = '42501';
  end if;
  select s.* into v_schedule
  from public.commerce_sync_schedules as s
  where s.organization_id=v_run.organization_id and s.connection_id=v_run.connection_id and s.provider_account_id=v_run.provider_account_id and s.resource='transactions'
  limit 1;
  if not found or v_schedule.enabled or v_schedule.sync_frequency <> 'hourly' or v_schedule.activation_state = 'paused' then
    raise exception 'stranded schedule state invalid' using errcode = '42501';
  end if;
  if exists (select 1 from public.commerce_connection_pauses as cp where cp.organization_id=v_run.organization_id and cp.connection_id=v_run.connection_id and cp.paused=true) then
    raise exception 'stranded connection paused' using errcode = '42501';
  end if;
  select count(*) into v_active
  from public.commerce_sync_runs as ar
  where ar.organization_id=v_run.organization_id and ar.connection_id=v_run.connection_id and ar.id<>v_run.id
    and (ar.status in ('queued','paused') or (ar.status='running' and ar.lease_expires_at is not null and ar.lease_expires_at >= now()));
  if v_active <> 0 then raise exception 'stranded active run exists' using errcode = '42501'; end if;
  if exists (select 1 from public.commerce_repository_activation as cra where cra.organization_id=v_run.organization_id and cra.mode in ('live','live_beta')) then
    raise exception 'stranded live activation exists' using errcode = '42501';
  end if;
  if exists (select 1 from public.tracekit_production_controls as tc where tc.capability='commerce_scheduler' and tc.activation_state='enabled') then
    raise exception 'stranded scheduler control enabled' using errcode = '42501';
  end if;
  select cs.quota_remaining into v_quota
  from public.commerce_continuous_sync_state as cs
  where cs.organization_id=v_run.organization_id and cs.connection_id=v_run.connection_id and cs.provider_account_id=v_run.provider_account_id and cs.resource='transactions'
    and cs.quota_observed_at is not null and cs.quota_observed_at >= now() - interval '15 minutes'
  limit 1;
  if v_quota is null or v_quota - 8 < coalesce(v_schedule.quota_minimum_remaining,1000) then
    raise exception 'stranded quota unavailable' using errcode = '42501';
  end if;
  select min(cp.page) into v_lowest_incomplete
  from public.commerce_sync_checkpoints as cp
  where cp.sync_run_id=v_run.id and cp.resource='transactions' and cp.state <> 'completed';
  if v_lowest_incomplete <> 4 then raise exception 'stranded checkpoint boundary invalid' using errcode = '42501'; end if;
  if not exists (select 1 from public.commerce_evidence_records as er where er.sync_run_id=v_run.id and er.source_object_type='transaction_page' and er.source_object_id='continuous:page:4:per_page:100') then
    raise exception 'stranded page evidence unavailable' using errcode = '42501';
  end if;

  update public.commerce_sync_runs as ur
  set metadata = coalesce(ur.metadata,'{}'::jsonb) || jsonb_build_object(
    'operator_recovery_dispatched', true,
    'operator_recovery_reason', 'stranded_run_page_evidence_replay',
    'operator_recovery_at', now())
  where ur.id=v_run.id;

  return query select v_run.id, v_connection.account_id, v_run.organization_id, v_run.connection_id,
    v_run.provider_account_id, v_run.scheduler_idempotency_key,
    (v_run.metadata->>'request_key')::uuid;
end;
$$;

revoke all on function public.requeue_stranded_operator_one_shot_9c8731d7() from public, anon, authenticated;
grant execute on function public.requeue_stranded_operator_one_shot_9c8731d7() to service_role;
