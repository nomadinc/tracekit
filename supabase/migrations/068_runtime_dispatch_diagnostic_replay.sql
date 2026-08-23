-- One-time diagnostic replay for the specifically identified exceptional
-- recovery run. This does not reopen ordinary quota-bootstrap retry semantics.
create or replace function public.replay_commerce_runtime_dispatch_diagnostic()
returns table (
  replacement_run_id uuid,
  organization_id uuid,
  connection_id uuid,
  provider_account_id uuid,
  account_id uuid,
  scheduler_identity text,
  reserved_run_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run public.commerce_sync_runs%rowtype;
  v_connection public.commerce_provider_connections%rowtype;
  v_account_id uuid;
  v_active_accounts integer;
  v_active_runs integer;
  v_controls integer;
  v_schedules integer;
  v_live_activations integer;
  v_latest_metadata jsonb;
  v_replacement_id uuid := gen_random_uuid();
  v_scheduler_identity text := 'runtime-dispatch-diagnostic:' || gen_random_uuid()::text;
begin
  perform pg_advisory_xact_lock(hashtextextended('commerce-runtime-dispatch-diagnostic:1387dfce-3c6f-414f-a939-c4921e364280', 0));
  select * into v_run
  from public.commerce_sync_runs r
  where r.id = '1387dfce-3c6f-414f-a939-c4921e364280'::uuid
  for update;
  if not found then raise exception 'runtime diagnostic source run not found' using errcode = 'P0002'; end if;
  if v_run.status <> 'cancelled' or v_run.mode <> 'continuous' then
    raise exception 'runtime diagnostic source run is not cancelled continuous' using errcode = '55000';
  end if;
  if coalesce(v_run.metadata->>'quota_bootstrap_exceptional_recovery', 'false') <> 'true'
     or coalesce(v_run.metadata->>'quota_bootstrap_attempted', 'false') <> 'true'
     or coalesce(nullif(v_run.metadata->>'quota_bootstrap_provider_requests', ''), '') <> '0' then
    raise exception 'runtime diagnostic source metadata is invalid' using errcode = '55000';
  end if;
  if coalesce(v_run.metadata->>'runtime_dispatch_diagnostic_replay_consumed', 'false') = 'true' then
    raise exception 'runtime diagnostic replay already consumed' using errcode = '23505';
  end if;

  select coalesce(nullif(v_run.metadata->>'account_id', '')::uuid, null) into v_account_id;
  if v_account_id is null then raise exception 'runtime diagnostic account scope missing' using errcode = '22023'; end if;
  select * into v_connection from public.commerce_provider_connections c
    where c.organization_id = v_run.organization_id and c.id = v_run.connection_id for update;
  if not found or lower(coalesce(v_connection.provider, '')) <> 'commas'
     or lower(coalesce(v_connection.status, '')) <> 'connected'
     or v_connection.account_id is distinct from v_account_id then
    raise exception 'runtime diagnostic connection scope invalid' using errcode = '55000';
  end if;
  select count(*) into v_active_accounts from public.commerce_provider_accounts a
    where a.organization_id = v_run.organization_id and a.connection_id = v_run.connection_id and a.status = 'active';
  if v_active_accounts <> 1 or not exists (
    select 1 from public.commerce_provider_accounts a
    where a.organization_id = v_run.organization_id and a.connection_id = v_run.connection_id
      and a.id = v_run.provider_account_id and a.status = 'active'
  ) then raise exception 'runtime diagnostic provider account scope invalid' using errcode = '55000'; end if;
  select count(*) into v_controls from public.tracekit_production_controls c
    where c.organization_id = v_run.organization_id and c.capability = 'commerce_scheduler' and c.activation_state = 'enabled';
  if v_controls <> 0 then raise exception 'runtime diagnostic scheduler control enabled' using errcode = '55000'; end if;
  select count(*) into v_schedules from public.commerce_sync_schedules s
    where s.organization_id = v_run.organization_id and s.connection_id = v_run.connection_id
      and s.provider_account_id = v_run.provider_account_id and s.resource = v_run.sync_type
      and s.enabled = true and s.activation_state = 'enabled';
  if v_schedules <> 0 then raise exception 'runtime diagnostic schedule enabled' using errcode = '55000'; end if;
  select count(*) into v_active_runs from public.commerce_sync_runs r
    where r.organization_id = v_run.organization_id and r.connection_id = v_run.connection_id
      and r.status in ('queued', 'running', 'paused');
  if v_active_runs <> 0 then raise exception 'runtime diagnostic active run exists' using errcode = '55000'; end if;
  select count(*) into v_live_activations from public.commerce_repository_activation a
    where a.organization_id = v_run.organization_id and a.mode in ('live', 'live_beta');
  if v_live_activations <> 0 then raise exception 'runtime diagnostic live activation exists' using errcode = '55000'; end if;
  select r.metadata into v_latest_metadata from public.commerce_sync_runs r
    where r.organization_id = v_run.organization_id and r.connection_id = v_run.connection_id
    order by r.created_at desc limit 1;
  if nullif(v_latest_metadata->>'rate_limit_end', '') is not null then
    raise exception 'runtime diagnostic quota is known' using errcode = '55000';
  end if;

  update public.commerce_sync_runs r
  set metadata = coalesce(r.metadata, '{}'::jsonb) || jsonb_build_object(
    'runtime_dispatch_diagnostic_replay_consumed', true,
    'runtime_dispatch_diagnostic_replay_reason', 'runtime_dispatch_diagnostic',
    'runtime_dispatch_diagnostic_original_run_id', r.id::text
  ), updated_at = now()
  where r.id = v_run.id;

  insert into public.commerce_sync_runs (
    id, organization_id, connection_id, provider_account_id, sync_type, mode,
    status, scheduler_idempotency_key, metadata
  ) values (
    v_replacement_id, v_run.organization_id, v_run.connection_id, v_run.provider_account_id,
    v_run.sync_type, 'continuous', 'queued', v_scheduler_identity,
    jsonb_build_object(
      'account_id', v_account_id,
      'quota_bootstrap_attempted', true,
      'quota_bootstrap_state', 'pending',
      'quota_bootstrap_retry', true,
      'quota_bootstrap_exceptional_recovery', true,
      'runtime_dispatch_diagnostic_replay', true,
      'runtime_dispatch_diagnostic_replay_reason', 'runtime_dispatch_diagnostic',
      'quota_bootstrap_original_run_id', v_run.id::text,
      'quota_bootstrap_provider_requests', 0
    )
  );
  return query select v_replacement_id, v_run.organization_id, v_run.connection_id,
    v_run.provider_account_id, v_account_id, v_scheduler_identity, v_replacement_id;
end;
$$;

revoke all on function public.replay_commerce_runtime_dispatch_diagnostic()
  from public, anon, authenticated;
grant execute on function public.replay_commerce_runtime_dispatch_diagnostic()
  to service_role;
