-- Explicit, non-scheduled acceptance dispatch.  This function only reserves a
-- bounded shadow run; the API Worker remains responsible for queue delivery.
create or replace function public.enqueue_commerce_operator_one_shot_shadow(
  p_account_id uuid,
  p_organization_id uuid,
  p_connection_id uuid,
  p_provider_account_id uuid,
  p_resource text,
  p_request_key text
) returns table(run_id uuid, created boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.commerce_sync_runs%rowtype;
  v_connection public.commerce_provider_connections%rowtype;
  v_schedule public.commerce_sync_schedules%rowtype;
  v_quota numeric;
  v_floor integer;
  v_active integer;
  v_live integer;
  v_controls integer;
begin
  if p_resource <> 'transactions' or nullif(btrim(p_request_key), '') is null then
    raise exception 'invalid operator one-shot request' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_connection_id::text || ':' || p_provider_account_id::text || ':operator-one-shot', 0));
  select * into v_existing from public.commerce_sync_runs
    where organization_id = p_organization_id
      and scheduler_idempotency_key = 'operator-one-shot:' || p_request_key
    limit 1;
  if found then
    run_id := v_existing.id; created := false; return next; return;
  end if;
  select * into v_connection from public.commerce_provider_connections
    where id = p_connection_id and organization_id = p_organization_id;
  if not found or v_connection.provider <> 'commas' or v_connection.status <> 'connected' or v_connection.account_id <> p_account_id then
    raise exception 'operator connection unavailable' using errcode = '42501';
  end if;
  if (select count(*) from public.commerce_provider_accounts where organization_id = p_organization_id and connection_id = p_connection_id and status = 'active') <> 1
     or not exists (select 1 from public.commerce_provider_accounts where id = p_provider_account_id and organization_id = p_organization_id and connection_id = p_connection_id and status = 'active') then
    raise exception 'operator provider account unavailable' using errcode = '42501';
  end if;
  if not exists (select 1 from public.commerce_provider_credentials where organization_id = p_organization_id and connection_id = p_connection_id and revoked_at is null) then
    raise exception 'operator credential unavailable' using errcode = '42501';
  end if;
  select * into v_schedule from public.commerce_sync_schedules
    where organization_id = p_organization_id and connection_id = p_connection_id and provider_account_id = p_provider_account_id and resource = p_resource
    limit 1;
  if not found or v_schedule.enabled or v_schedule.sync_frequency <> 'hourly' or v_schedule.activation_state = 'paused' then
    raise exception 'operator schedule state invalid' using errcode = '42501';
  end if;
  if exists (select 1 from public.commerce_connection_pauses where organization_id = p_organization_id and connection_id = p_connection_id and paused = true) then
    raise exception 'operator connection paused' using errcode = '42501';
  end if;
  select count(*) into v_active from public.commerce_sync_runs where organization_id = p_organization_id and connection_id = p_connection_id and status in ('queued','running','paused');
  if v_active <> 0 then raise exception 'operator active run exists' using errcode = '42501'; end if;
  select count(*) into v_live from public.commerce_repository_activation where organization_id = p_organization_id and mode in ('live','live_beta');
  if v_live <> 0 then raise exception 'operator live activation exists' using errcode = '42501'; end if;
  select count(*) into v_controls from public.tracekit_production_controls where capability = 'commerce_scheduler' and activation_state = 'enabled';
  if v_controls <> 0 then raise exception 'operator scheduler control enabled' using errcode = '42501'; end if;
  select nullif(metadata->>'rate_limit_end', '')::numeric into v_quota from public.commerce_sync_runs
    where organization_id = p_organization_id and connection_id = p_connection_id and metadata ? 'rate_limit_end'
    order by created_at desc limit 1;
  v_floor := coalesce(v_schedule.quota_minimum_remaining, 1000);
  if v_quota is null or v_quota - 8 < v_floor then raise exception 'operator quota unavailable' using errcode = '42501'; end if;
  return query insert into public.commerce_sync_runs(organization_id, connection_id, provider_account_id, sync_type, mode, scheduler_idempotency_key, metadata)
    values (p_organization_id, p_connection_id, p_provider_account_id, p_resource, 'continuous', 'operator-one-shot:' || p_request_key,
      jsonb_build_object('account_id', p_account_id, 'dispatch_source', 'operator_one_shot', 'acceptance_cycle', true, 'shadow_only', true, 'max_pages', 8, 'per_page', 100, 'request_key', p_request_key))
    returning id, true;
end;
$$;

revoke all on function public.enqueue_commerce_operator_one_shot_shadow(uuid, uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.enqueue_commerce_operator_one_shot_shadow(uuid, uuid, uuid, uuid, text, text) to service_role;
