-- Bound quota-bootstrap retries to the root run and provide one explicit,
-- auditable recovery for the already-broken runtime-dispatch chain.

alter function public.retry_commerce_quota_bootstrap(uuid, integer)
  rename to retry_commerce_quota_bootstrap_legacy;

revoke all on function public.retry_commerce_quota_bootstrap_legacy(uuid, integer)
  from public, anon, authenticated, service_role;

create or replace function public.retry_commerce_quota_bootstrap(
  p_run_id uuid,
  p_provider_requests integer default 0
)
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
  v_candidate public.commerce_sync_runs%rowtype;
  v_root public.commerce_sync_runs%rowtype;
  v_root_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('commerce-quota-bootstrap-chain:' || p_run_id::text, 0));
  select * into v_candidate from public.commerce_sync_runs r where r.id = p_run_id for update;
  if not found then raise exception 'quota bootstrap retry source run not found' using errcode = 'P0002'; end if;
  v_root_id := coalesce(nullif(v_candidate.metadata->>'quota_bootstrap_original_run_id', '')::uuid, p_run_id);
  select * into v_root from public.commerce_sync_runs r where r.id = v_root_id for update;
  if not found then raise exception 'quota bootstrap retry root run not found' using errcode = 'P0002'; end if;
  if coalesce(v_root.metadata->>'quota_bootstrap_retry_consumed', 'false') = 'true' then
    raise exception 'quota bootstrap retry already consumed at chain root' using errcode = '23505';
  end if;

  return query select * from public.retry_commerce_quota_bootstrap_legacy(p_run_id, p_provider_requests);

  if v_root_id <> p_run_id then
    update public.commerce_sync_runs r
    set metadata = coalesce(r.metadata, '{}'::jsonb) || jsonb_build_object(
      'quota_bootstrap_retry_consumed', true,
      'quota_bootstrap_retry_authorized', true,
      'quota_bootstrap_chain_root_id', v_root_id::text
    ), updated_at = now()
    where r.id = v_root_id;
  end if;
end;
$$;

revoke all on function public.retry_commerce_quota_bootstrap(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.retry_commerce_quota_bootstrap(uuid, integer)
  to service_role;

create or replace function public.recover_commerce_quota_bootstrap_chain(
  p_root_run_id uuid,
  p_failed_run_id uuid,
  p_root_provider_requests integer default 0,
  p_failed_provider_requests integer default 0
)
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
  v_root public.commerce_sync_runs%rowtype;
  v_failed public.commerce_sync_runs%rowtype;
  v_connection public.commerce_provider_connections%rowtype;
  v_account_id uuid;
  v_root_account_id uuid;
  v_active_accounts integer;
  v_active_runs integer;
  v_controls integer;
  v_schedules integer;
  v_live_activations integer;
  v_latest_metadata jsonb;
  v_replacement_id uuid := gen_random_uuid();
  v_scheduler_identity text := 'quota-bootstrap-exceptional-recovery:' || p_root_run_id::text || ':' || gen_random_uuid()::text;
begin
  if p_root_provider_requests is distinct from 0 or p_failed_provider_requests is distinct from 0 then
    raise exception 'exceptional quota bootstrap recovery requires zero provider requests' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('commerce-quota-bootstrap-exceptional-recovery:' || p_root_run_id::text, 0));

  select * into v_root from public.commerce_sync_runs r where r.id = p_root_run_id for update;
  if not found then raise exception 'exceptional recovery root run not found' using errcode = 'P0002'; end if;
  select * into v_failed from public.commerce_sync_runs r where r.id = p_failed_run_id for update;
  if not found then raise exception 'exceptional recovery failed run not found' using errcode = 'P0002'; end if;
  if v_root.status <> 'cancelled' or v_failed.status <> 'cancelled'
     or v_root.mode <> 'continuous' or v_failed.mode <> 'continuous'
     or v_failed.organization_id is distinct from v_root.organization_id
     or v_failed.connection_id is distinct from v_root.connection_id
     or v_failed.provider_account_id is distinct from v_root.provider_account_id then
    raise exception 'exceptional recovery run chain is invalid' using errcode = '55000';
  end if;
  if coalesce(v_root.metadata->>'quota_bootstrap_attempted', 'false') <> 'true'
     or coalesce(v_failed.metadata->>'quota_bootstrap_attempted', 'false') <> 'true'
     or coalesce(v_root.metadata->>'quota_bootstrap_retry_consumed', 'false') <> 'true'
     or coalesce(v_failed.metadata->>'quota_bootstrap_retry', 'false') <> 'true'
     or coalesce(v_failed.metadata->>'quota_bootstrap_original_run_id', '') <> p_root_run_id::text then
    raise exception 'exceptional recovery metadata is invalid' using errcode = '55000';
  end if;
  if nullif(v_root.metadata->>'quota_bootstrap_original_run_id', '') is not null then
    raise exception 'exceptional recovery root must be chain root' using errcode = '55000';
  end if;
  if coalesce(nullif(v_root.metadata->>'quota_bootstrap_provider_requests', ''), '') <> '0'
     or coalesce(nullif(v_failed.metadata->>'quota_bootstrap_provider_requests', ''), '') <> '0' then
    raise exception 'exceptional recovery source recorded provider requests' using errcode = '55000';
  end if;
  if coalesce(nullif(v_failed.metadata->>'quota_bootstrap_state', ''), 'pending') not in ('pending', 'dispatch_failed') then
    raise exception 'exceptional recovery source is not a dispatch failure' using errcode = '55000';
  end if;
  if coalesce(v_root.metadata->>'quota_bootstrap_exceptional_recovery_consumed', 'false') = 'true' then
    raise exception 'exceptional recovery already consumed' using errcode = '23505';
  end if;

  select coalesce(nullif(v_failed.metadata->>'account_id', '')::uuid, null) into v_account_id;
  select coalesce(nullif(v_root.metadata->>'account_id', '')::uuid, null) into v_root_account_id;
  if v_account_id is null then raise exception 'exceptional recovery account scope missing' using errcode = '22023'; end if;
  if v_root_account_id is distinct from v_account_id then raise exception 'exceptional recovery account scope mismatch' using errcode = '55000'; end if;
  select * into v_connection from public.commerce_provider_connections c
    where c.organization_id = v_root.organization_id and c.id = v_root.connection_id for update;
  if not found or lower(coalesce(v_connection.provider, '')) <> 'commas'
     or lower(coalesce(v_connection.status, '')) <> 'connected'
     or v_connection.account_id is distinct from v_account_id then
    raise exception 'exceptional recovery connection scope invalid' using errcode = '55000';
  end if;
  select count(*) into v_active_accounts from public.commerce_provider_accounts a
    where a.organization_id = v_root.organization_id and a.connection_id = v_root.connection_id and a.status = 'active';
  if v_active_accounts <> 1 or not exists (
    select 1 from public.commerce_provider_accounts a
    where a.organization_id = v_root.organization_id and a.connection_id = v_root.connection_id
      and a.id = v_root.provider_account_id and a.status = 'active'
  ) then raise exception 'exceptional recovery provider account scope invalid' using errcode = '55000'; end if;
  select count(*) into v_controls from public.tracekit_production_controls c
    where c.organization_id = v_root.organization_id and c.capability = 'commerce_scheduler' and c.activation_state = 'enabled';
  if v_controls <> 0 then raise exception 'exceptional recovery scheduler control enabled' using errcode = '55000'; end if;
  select count(*) into v_schedules from public.commerce_sync_schedules s
    where s.organization_id = v_root.organization_id and s.connection_id = v_root.connection_id
      and s.provider_account_id = v_root.provider_account_id and s.resource = v_root.sync_type
      and s.enabled = true and s.activation_state = 'enabled';
  if v_schedules <> 0 then raise exception 'exceptional recovery schedule enabled' using errcode = '55000'; end if;
  select count(*) into v_active_runs from public.commerce_sync_runs r
    where r.organization_id = v_root.organization_id and r.connection_id = v_root.connection_id
      and r.status in ('queued', 'running', 'paused');
  if v_active_runs <> 0 then raise exception 'exceptional recovery active run exists' using errcode = '55000'; end if;
  select count(*) into v_live_activations from public.commerce_repository_activation a
    where a.organization_id = v_root.organization_id and a.mode in ('live', 'live_beta');
  if v_live_activations <> 0 then raise exception 'exceptional recovery live activation exists' using errcode = '55000'; end if;
  select r.metadata into v_latest_metadata from public.commerce_sync_runs r
    where r.organization_id = v_root.organization_id and r.connection_id = v_root.connection_id
    order by r.created_at desc limit 1;
  if nullif(v_latest_metadata->>'rate_limit_end', '') is not null then
    raise exception 'exceptional recovery quota is known' using errcode = '55000';
  end if;

  update public.commerce_sync_runs r
  set metadata = coalesce(r.metadata, '{}'::jsonb) || jsonb_build_object(
    'quota_bootstrap_exceptional_recovery_consumed', true,
    'quota_bootstrap_exceptional_recovery_reason', 'runtime_secret_repaired',
    'quota_bootstrap_exceptional_recovery_original_run_id', p_root_run_id::text,
    'quota_bootstrap_exceptional_recovery_failed_run_id', p_failed_run_id::text
  ), updated_at = now()
  where r.id = p_root_run_id;

  insert into public.commerce_sync_runs (
    id, organization_id, connection_id, provider_account_id, sync_type, mode,
    status, scheduler_idempotency_key, metadata
  ) values (
    v_replacement_id, v_root.organization_id, v_root.connection_id, v_root.provider_account_id,
    v_root.sync_type, 'continuous', 'queued', v_scheduler_identity,
    jsonb_build_object(
      'account_id', v_account_id,
      'quota_bootstrap_attempted', true,
      'quota_bootstrap_state', 'pending',
      'quota_bootstrap_retry', true,
      'quota_bootstrap_exceptional_recovery', true,
      'quota_bootstrap_exceptional_recovery_reason', 'runtime_secret_repaired',
      'quota_bootstrap_original_run_id', p_root_run_id::text,
      'quota_bootstrap_previous_failed_run_id', p_failed_run_id::text,
      'quota_bootstrap_provider_requests', 0
    )
  );
  return query select v_replacement_id, v_root.organization_id, v_root.connection_id,
    v_root.provider_account_id, v_account_id, v_scheduler_identity, v_replacement_id;
end;
$$;

revoke all on function public.recover_commerce_quota_bootstrap_chain(uuid, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.recover_commerce_quota_bootstrap_chain(uuid, uuid, integer, integer)
  to service_role;
