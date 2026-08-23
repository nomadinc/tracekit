-- One-time, auditable recovery for quota-bootstrap dispatch failures that
-- occurred before any provider request. This does not call a provider or queue.

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
  v_original public.commerce_sync_runs%rowtype;
  v_latest_metadata jsonb;
  v_connection public.commerce_provider_connections%rowtype;
  v_account_id uuid;
  v_active_accounts integer;
  v_controls integer;
  v_schedules integer;
  v_active_runs integer;
  v_live_activations integer;
  v_replacement_id uuid := gen_random_uuid();
  v_scheduler_identity text := 'quota-bootstrap-retry:' || p_run_id::text || ':' || gen_random_uuid()::text;
begin
  if p_provider_requests is distinct from 0 then
    raise exception 'quota bootstrap retry requires zero provider requests' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('commerce-quota-bootstrap-retry:' || p_run_id::text, 0));

  select * into v_original
  from public.commerce_sync_runs r
  where r.id = p_run_id
  for update;
  if not found then raise exception 'quota bootstrap retry source run not found' using errcode = 'P0002'; end if;
  if v_original.status <> 'cancelled' or v_original.mode <> 'continuous' then
    raise exception 'quota bootstrap retry source run is not cancelled continuous' using errcode = '55000';
  end if;
  if coalesce(v_original.metadata->>'quota_bootstrap_attempted', 'false') <> 'true' then
    raise exception 'quota bootstrap retry source was not a bootstrap attempt' using errcode = '55000';
  end if;
  if coalesce(v_original.metadata->>'quota_bootstrap_retry_consumed', 'false') = 'true' then
    raise exception 'quota bootstrap retry already consumed' using errcode = '23505';
  end if;
  if nullif(v_original.metadata->>'quota_bootstrap_failure_class', '') is not null
     and v_original.metadata->>'quota_bootstrap_failure_class' <> 'pre_provider_dispatch' then
    raise exception 'quota bootstrap retry source failure class is not pre-provider dispatch' using errcode = '55000';
  end if;
  if coalesce(nullif(v_original.metadata->>'quota_bootstrap_provider_requests', ''), '0') <> '0' then
    raise exception 'quota bootstrap retry source recorded provider requests' using errcode = '55000';
  end if;
  -- Legacy pre-dispatch cancellations used pending; dispatch_failed is the
  -- explicit state written by newer runtimes. Both are accepted only with
  -- the zero-provider-request proof above and are classified below.
  if coalesce(nullif(v_original.metadata->>'quota_bootstrap_state',''), 'pending') not in ('pending','dispatch_failed') then
    raise exception 'quota bootstrap retry source is not a dispatch failure' using errcode = '55000';
  end if;

  select coalesce(nullif(v_original.metadata->>'account_id','')::uuid, null) into v_account_id;
  if v_account_id is null then raise exception 'quota bootstrap retry account scope missing' using errcode = '22023'; end if;

  select * into v_connection
  from public.commerce_provider_connections c
  where c.organization_id = v_original.organization_id and c.id = v_original.connection_id
  for update;
  if not found or lower(coalesce(v_connection.provider,'')) <> 'commas'
     or lower(coalesce(v_connection.status,'')) <> 'connected'
     or v_connection.account_id is distinct from v_account_id then
    raise exception 'quota bootstrap retry connection scope invalid' using errcode = '55000';
  end if;

  select count(*) into v_active_accounts
  from public.commerce_provider_accounts a
  where a.organization_id = v_original.organization_id and a.connection_id = v_original.connection_id and a.status = 'active';
  if v_active_accounts <> 1 then raise exception 'quota bootstrap retry provider account scope invalid' using errcode = '55000'; end if;
  if not exists (select 1 from public.commerce_provider_accounts a where a.organization_id = v_original.organization_id and a.connection_id = v_original.connection_id and a.id = v_original.provider_account_id and a.status = 'active') then
    raise exception 'quota bootstrap retry provider account mismatch' using errcode = '55000';
  end if;

  select count(*) into v_controls from public.tracekit_production_controls c where c.organization_id = v_original.organization_id and c.capability = 'commerce_scheduler' and c.activation_state = 'enabled';
  if v_controls <> 0 then raise exception 'quota bootstrap retry scheduler control enabled' using errcode = '55000'; end if;
  select count(*) into v_schedules from public.commerce_sync_schedules s where s.organization_id = v_original.organization_id and s.connection_id = v_original.connection_id and s.provider_account_id = v_original.provider_account_id and s.resource = v_original.sync_type and s.enabled = true and s.activation_state = 'enabled';
  if v_schedules <> 0 then raise exception 'quota bootstrap retry schedule enabled' using errcode = '55000'; end if;
  select count(*) into v_active_runs from public.commerce_sync_runs r where r.organization_id = v_original.organization_id and r.connection_id = v_original.connection_id and r.status in ('queued','running','paused');
  if v_active_runs <> 0 then raise exception 'quota bootstrap retry active run exists' using errcode = '55000'; end if;
  select count(*) into v_live_activations from public.commerce_repository_activation a where a.organization_id = v_original.organization_id and a.mode in ('live','live_beta');
  if v_live_activations <> 0 then raise exception 'quota bootstrap retry live activation exists' using errcode = '55000'; end if;
  select r.metadata into v_latest_metadata from public.commerce_sync_runs r where r.organization_id = v_original.organization_id and r.connection_id = v_original.connection_id order by r.created_at desc limit 1;
  if nullif(v_latest_metadata->>'rate_limit_end','') is not null then raise exception 'quota bootstrap retry quota is known' using errcode = '55000'; end if;

  update public.commerce_sync_runs r
  set metadata = coalesce(r.metadata,'{}'::jsonb) || jsonb_build_object(
    'quota_bootstrap_dispatch_failure', true,
    'quota_bootstrap_failure_class', 'pre_provider_dispatch',
    'quota_bootstrap_provider_requests', 0,
    'quota_bootstrap_retry_authorized', true,
    'quota_bootstrap_retry_consumed', true,
    'quota_bootstrap_original_run_id', p_run_id::text
  ), updated_at = now()
  where r.id = p_run_id;

  insert into public.commerce_sync_runs (
    id, organization_id, connection_id, provider_account_id, sync_type, mode,
    status, scheduler_idempotency_key, metadata
  ) values (
    v_replacement_id, v_original.organization_id, v_original.connection_id,
    v_original.provider_account_id, v_original.sync_type, 'continuous', 'queued',
    v_scheduler_identity,
    jsonb_build_object(
      'account_id', v_account_id,
      'quota_bootstrap_attempted', true,
      'quota_bootstrap_state', 'pending',
      'quota_bootstrap_retry', true,
      'quota_bootstrap_original_run_id', p_run_id::text,
      'quota_bootstrap_provider_requests', 0
    )
  );

  return query select v_replacement_id, v_original.organization_id,
    v_original.connection_id, v_original.provider_account_id, v_account_id,
    v_scheduler_identity, v_replacement_id;
end;
$$;

revoke all on function public.retry_commerce_quota_bootstrap(uuid, integer) from public, anon, authenticated;
grant execute on function public.retry_commerce_quota_bootstrap(uuid, integer) to service_role;
