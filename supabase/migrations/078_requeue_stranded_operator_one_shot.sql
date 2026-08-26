-- One-time administrative re-delivery for the known stranded acceptance run.
-- This authorizes queue delivery only; it never calls Cloudflare or Commas.
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

  select * into v_run
  from public.commerce_sync_runs
  where id = '9c8731d7-1dae-4844-a7ce-0b6fccea170e'
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

  select * into v_connection from public.commerce_provider_connections
  where id = v_run.connection_id and organization_id = v_run.organization_id;
  if not found or v_connection.provider <> 'commas' or v_connection.status <> 'connected'
     or coalesce(v_run.metadata->>'account_id','') <> v_connection.account_id::text then
    raise exception 'stranded connection scope unavailable' using errcode = '42501';
  end if;
  if (select count(*) from public.commerce_provider_accounts where organization_id=v_run.organization_id and connection_id=v_run.connection_id and status='active') <> 1
     or not exists (select 1 from public.commerce_provider_accounts where id=v_run.provider_account_id and organization_id=v_run.organization_id and connection_id=v_run.connection_id and status='active') then
    raise exception 'stranded provider account unavailable' using errcode = '42501';
  end if;
  if not exists (select 1 from public.commerce_provider_credentials where organization_id=v_run.organization_id and connection_id=v_run.connection_id and revoked_at is null) then
    raise exception 'stranded credential unavailable' using errcode = '42501';
  end if;
  select * into v_schedule from public.commerce_sync_schedules
  where organization_id=v_run.organization_id and connection_id=v_run.connection_id and provider_account_id=v_run.provider_account_id and resource='transactions'
  limit 1;
  if not found or v_schedule.enabled or v_schedule.sync_frequency <> 'hourly' or v_schedule.activation_state = 'paused' then
    raise exception 'stranded schedule state invalid' using errcode = '42501';
  end if;
  if exists (select 1 from public.commerce_connection_pauses where organization_id=v_run.organization_id and connection_id=v_run.connection_id and paused=true) then
    raise exception 'stranded connection paused' using errcode = '42501';
  end if;
  select count(*) into v_active from public.commerce_sync_runs
  where organization_id=v_run.organization_id and connection_id=v_run.connection_id and id<>v_run.id
    and (status in ('queued','paused') or (status='running' and lease_expires_at is not null and lease_expires_at >= now()));
  if v_active <> 0 then raise exception 'stranded active run exists' using errcode = '42501'; end if;
  if exists (select 1 from public.commerce_repository_activation where organization_id=v_run.organization_id and mode in ('live','live_beta')) then
    raise exception 'stranded live activation exists' using errcode = '42501';
  end if;
  if exists (select 1 from public.tracekit_production_controls where capability='commerce_scheduler' and activation_state='enabled') then
    raise exception 'stranded scheduler control enabled' using errcode = '42501';
  end if;
  select quota_remaining into v_quota from public.commerce_continuous_sync_state
  where organization_id=v_run.organization_id and connection_id=v_run.connection_id and provider_account_id=v_run.provider_account_id and resource='transactions'
    and quota_observed_at is not null and quota_observed_at >= now() - interval '15 minutes'
  limit 1;
  if v_quota is null or v_quota - 8 < coalesce(v_schedule.quota_minimum_remaining,1000) then
    raise exception 'stranded quota unavailable' using errcode = '42501';
  end if;
  select min(page) into v_lowest_incomplete from public.commerce_sync_checkpoints
  where sync_run_id=v_run.id and resource='transactions' and state <> 'completed';
  if v_lowest_incomplete <> 4 then raise exception 'stranded checkpoint boundary invalid' using errcode = '42501'; end if;
  if not exists (select 1 from public.commerce_evidence_records where sync_run_id=v_run.id and source_object_type='transaction_page' and source_object_id='continuous:page:4:per_page:100') then
    raise exception 'stranded page evidence unavailable' using errcode = '42501';
  end if;

  update public.commerce_sync_runs
  set metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
    'operator_recovery_dispatched', true,
    'operator_recovery_reason', 'stranded_run_page_evidence_replay',
    'operator_recovery_at', now())
  where id=v_run.id;

  return query select v_run.id, v_connection.account_id, v_run.organization_id, v_run.connection_id,
    v_run.provider_account_id, v_run.scheduler_idempotency_key,
    (v_run.metadata->>'request_key')::uuid;
end;
$$;

revoke all on function public.requeue_stranded_operator_one_shot_9c8731d7() from public, anon, authenticated;
grant execute on function public.requeue_stranded_operator_one_shot_9c8731d7() to service_role;
