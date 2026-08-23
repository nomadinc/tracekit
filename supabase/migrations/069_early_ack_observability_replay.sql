-- One final, one-time replay used only to observe the early acknowledgement
-- path for the already-consumed diagnostic chain. This does not alter the
-- ordinary quota-bootstrap retry RPC.
create or replace function public.replay_commerce_early_ack_observability()
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
  v_source public.commerce_sync_runs%rowtype;
  v_connection public.commerce_provider_connections%rowtype;
  v_account_id uuid;
  v_active_accounts integer;
  v_active_runs integer;
  v_controls integer;
  v_schedules integer;
  v_live_activations integer;
  v_latest_metadata jsonb;
  v_replacement_id uuid := gen_random_uuid();
  v_scheduler_identity text := 'early-ack-observability:' || gen_random_uuid()::text;
begin
  perform pg_advisory_xact_lock(hashtextextended('commerce-early-ack-observability:f15782cd-858d-4840-8901-b1bb65939d7b', 0));

  select * into v_source
    from public.commerce_sync_runs r
   where r.id = 'f15782cd-858d-4840-8901-b1bb65939d7b'::uuid
   for update;
  if not found then raise exception 'early ack source run not found' using errcode = 'P0002'; end if;
  if v_source.status <> 'cancelled' or v_source.mode <> 'continuous' then
    raise exception 'early ack source run is not cancelled continuous' using errcode = '55000';
  end if;
  if coalesce(v_source.metadata->>'quota_bootstrap_provider_requests', '') <> '0' then
    raise exception 'early ack source has provider requests' using errcode = '55000';
  end if;
  if coalesce(v_source.metadata->>'runtime_dispatch_diagnostic_replay', 'false') <> 'true' then
    raise exception 'early ack source is not diagnostic replay' using errcode = '55000';
  end if;
  if coalesce(v_source.metadata->>'early_ack_observability_replay_consumed', 'false') = 'true' then
    raise exception 'early ack observability replay already consumed' using errcode = '23505';
  end if;

  select nullif(v_source.metadata->>'account_id', '')::uuid into v_account_id;
  if v_account_id is null then raise exception 'early ack account scope missing' using errcode = '22023'; end if;
  select * into v_connection from public.commerce_provider_connections c
   where c.organization_id = v_source.organization_id and c.id = v_source.connection_id for update;
  if not found or lower(coalesce(v_connection.provider, '')) <> 'commas'
     or lower(coalesce(v_connection.status, '')) <> 'connected'
     or v_connection.account_id is distinct from v_account_id then
    raise exception 'early ack connection scope invalid' using errcode = '55000';
  end if;
  select count(*) into v_active_accounts from public.commerce_provider_accounts a
   where a.organization_id = v_source.organization_id and a.connection_id = v_source.connection_id and a.status = 'active';
  if v_active_accounts <> 1 or not exists (
    select 1 from public.commerce_provider_accounts a
     where a.organization_id = v_source.organization_id and a.connection_id = v_source.connection_id
       and a.id = v_source.provider_account_id and a.status = 'active'
  ) then raise exception 'early ack provider account scope invalid' using errcode = '55000'; end if;
  select count(*) into v_controls from public.tracekit_production_controls c
   where c.organization_id = v_source.organization_id and c.capability = 'commerce_scheduler' and c.activation_state = 'enabled';
  if v_controls <> 0 then raise exception 'early ack scheduler control enabled' using errcode = '55000'; end if;
  select count(*) into v_schedules from public.commerce_sync_schedules s
   where s.organization_id = v_source.organization_id and s.connection_id = v_source.connection_id
     and s.provider_account_id = v_source.provider_account_id and s.resource = v_source.sync_type
     and s.enabled = true and s.activation_state = 'enabled';
  if v_schedules <> 0 then raise exception 'early ack schedule enabled' using errcode = '55000'; end if;
  select count(*) into v_active_runs from public.commerce_sync_runs r
   where r.organization_id = v_source.organization_id and r.connection_id = v_source.connection_id
     and r.status in ('queued', 'running', 'paused');
  if v_active_runs <> 0 then raise exception 'early ack active run exists' using errcode = '55000'; end if;
  select count(*) into v_live_activations from public.commerce_repository_activation a
   where a.organization_id = v_source.organization_id and a.mode in ('live', 'live_beta');
  if v_live_activations <> 0 then raise exception 'early ack live activation exists' using errcode = '55000'; end if;
  select r.metadata into v_latest_metadata from public.commerce_sync_runs r
   where r.organization_id = v_source.organization_id and r.connection_id = v_source.connection_id
   order by r.created_at desc limit 1;
  if nullif(v_latest_metadata->>'rate_limit_end', '') is not null then
    raise exception 'early ack quota is known' using errcode = '55000';
  end if;

  update public.commerce_sync_runs r
     set metadata = coalesce(r.metadata, '{}'::jsonb) || jsonb_build_object(
       'early_ack_observability_replay_consumed', true,
       'early_ack_observability_replay_reason', 'early_ack_observability',
       'early_ack_observability_original_run_id', r.id::text
     ), updated_at = now()
   where r.id = v_source.id;

  insert into public.commerce_sync_runs (
    id, organization_id, connection_id, provider_account_id, sync_type, mode,
    status, scheduler_idempotency_key, metadata
  ) values (
    v_replacement_id, v_source.organization_id, v_source.connection_id, v_source.provider_account_id,
    v_source.sync_type, 'continuous', 'queued', v_scheduler_identity,
    jsonb_build_object(
      'account_id', v_account_id,
      'quota_bootstrap_attempted', true,
      'quota_bootstrap_state', 'pending',
      'quota_bootstrap_retry', true,
      'quota_bootstrap_original_run_id', v_source.id::text,
      'quota_bootstrap_provider_requests', 0,
      'runtime_dispatch_diagnostic_replay', true,
      'early_ack_observability_replay', true,
      'early_ack_observability_replay_reason', 'early_ack_observability',
      'reason', 'early_ack_observability'
    )
  );
  return query select v_replacement_id, v_source.organization_id, v_source.connection_id,
    v_source.provider_account_id, v_account_id, v_scheduler_identity, v_replacement_id;
end;
$$;

revoke all on function public.replay_commerce_early_ack_observability() from public, anon, authenticated;
grant execute on function public.replay_commerce_early_ack_observability() to service_role;
