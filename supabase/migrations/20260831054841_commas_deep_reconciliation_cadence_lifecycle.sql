alter table public.commerce_sync_schedules
  add column schedule_version bigint not null default 1,
  add column last_deep_reconciliation_at timestamptz,
  add column last_deep_reconciliation_run_id uuid,
  add constraint commerce_sync_schedules_version_check check (schedule_version >= 1),
  add constraint commerce_sync_schedules_last_deep_run_fk
    foreign key (last_deep_reconciliation_run_id) references public.commerce_sync_runs(id);

create or replace function public.guard_commerce_sync_schedule_version_v1()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
begin
  if new.schedule_version <> old.schedule_version then
    raise exception 'schedule version is managed' using errcode='22023';
  end if;
  if row(
    new.enabled,new.activation_state,new.sync_frequency,new.deep_reconciliation_interval,
    new.deep_request_budget,new.quota_minimum_remaining,new.next_deep_reconciliation_at,
    new.last_deep_reconciliation_at,new.last_deep_reconciliation_run_id
  ) is distinct from row(
    old.enabled,old.activation_state,old.sync_frequency,old.deep_reconciliation_interval,
    old.deep_request_budget,old.quota_minimum_remaining,old.next_deep_reconciliation_at,
    old.last_deep_reconciliation_at,old.last_deep_reconciliation_run_id
  ) then
    new.schedule_version := old.schedule_version + 1;
  end if;
  return new;
end $$;

create trigger commerce_sync_schedule_version_guard_v1
before update on public.commerce_sync_schedules
for each row execute function public.guard_commerce_sync_schedule_version_v1();

create or replace function public.initialize_commas_deep_reconciliation_schedule_v1(
  p_organization_id uuid,
  p_connection_id uuid,
  p_provider_account_id uuid,
  p_schedule_id uuid,
  p_expected_schedule_version bigint,
  p_requested_first_due_at timestamptz,
  p_authenticated_identity_id text,
  p_operator_reason text
) returns public.commerce_sync_schedules
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_schedule public.commerce_sync_schedules%rowtype;
  v_reason text := btrim(coalesce(p_operator_reason,''));
begin
  if p_requested_first_due_at is null
    or nullif(btrim(coalesce(p_authenticated_identity_id,'')),'') is null
    or char_length(p_authenticated_identity_id) > 255
    or char_length(v_reason) < 10 or char_length(v_reason) > 500 then
    raise exception 'invalid deep reconciliation initialization' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('commas-deep-schedule:'||p_schedule_id::text,0));
  select s.* into v_schedule
  from public.commerce_sync_schedules s
  join public.commerce_provider_connections c
    on c.id=s.connection_id and c.organization_id=s.organization_id
  join public.commerce_provider_accounts a
    on a.id=s.provider_account_id and a.connection_id=s.connection_id and a.organization_id=s.organization_id
  where s.id=p_schedule_id and s.organization_id=p_organization_id
    and s.connection_id=p_connection_id and s.provider_account_id=p_provider_account_id
    and s.resource='transactions' and c.provider='commas' and c.status='connected' and a.status='active'
  for update of s;
  if not found then raise exception 'deep reconciliation schedule unavailable' using errcode='42501'; end if;
  if not v_schedule.enabled or v_schedule.activation_state <> 'enabled' then
    raise exception 'deep reconciliation schedule disabled' using errcode='55000';
  end if;
  if v_schedule.schedule_version <> p_expected_schedule_version then
    raise exception 'stale schedule version' using errcode='40001';
  end if;
  if v_schedule.next_deep_reconciliation_at is not null then
    raise exception 'deep reconciliation schedule already initialized' using errcode='55000';
  end if;
  update public.commerce_sync_schedules
  set next_deep_reconciliation_at=p_requested_first_due_at,updated_at=now()
  where id=v_schedule.id
  returning * into v_schedule;
  insert into public.tracekit_audit_events(
    actor_user_id,authenticated_identity_id,account_id,organization_id,action,target_type,target_id,
    result,correlation_id,metadata
  ) values(
    null,p_authenticated_identity_id,v_schedule.account_id,v_schedule.organization_id,
    'commerce.deep_reconciliation_schedule_initialized','commerce_sync_schedule',v_schedule.id::text,
    'success',gen_random_uuid()::text,
    jsonb_build_object('operator_reason',v_reason,'requested_first_due_at',p_requested_first_due_at,
      'previous_schedule_version',p_expected_schedule_version,'new_schedule_version',v_schedule.schedule_version)
  );
  return v_schedule;
end $$;

create or replace function public.complete_scheduled_commas_deep_reconciliation_v1(
  p_organization_id uuid,
  p_connection_id uuid,
  p_provider_account_id uuid,
  p_schedule_id uuid,
  p_expected_schedule_version bigint,
  p_run_id uuid,
  p_lease_owner text
) returns public.commerce_sync_schedules
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_schedule public.commerce_sync_schedules%rowtype;
  v_run public.commerce_sync_runs%rowtype;
  v_completed_at timestamptz := now();
  v_expected_identity_prefix text;
begin
  if nullif(btrim(coalesce(p_lease_owner,'')),'') is null then
    raise exception 'invalid deep reconciliation completion' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('commas-deep-schedule:'||p_schedule_id::text,0));
  select * into v_schedule from public.commerce_sync_schedules
  where id=p_schedule_id and organization_id=p_organization_id and connection_id=p_connection_id
    and provider_account_id=p_provider_account_id and resource='transactions'
  for update;
  if not found then raise exception 'deep reconciliation schedule unavailable' using errcode='42501'; end if;
  if not exists (
    select 1 from public.commerce_provider_connections c
    join public.commerce_provider_accounts a
      on a.organization_id=c.organization_id and a.connection_id=c.id
    where c.id=p_connection_id and c.organization_id=p_organization_id and c.provider='commas'
      and c.status='connected' and a.id=p_provider_account_id and a.status='active'
  ) then raise exception 'deep reconciliation provider scope unavailable' using errcode='42501'; end if;
  if v_schedule.last_deep_reconciliation_run_id=p_run_id then return v_schedule; end if;
  if not v_schedule.enabled or v_schedule.activation_state <> 'enabled'
    or v_schedule.schedule_version <> p_expected_schedule_version then
    raise exception 'stale deep reconciliation schedule' using errcode='40001';
  end if;
  select * into v_run from public.commerce_sync_runs
  where id=p_run_id and organization_id=p_organization_id and connection_id=p_connection_id
    and provider_account_id=p_provider_account_id
  for update;
  if not found then raise exception 'scheduled deep run unavailable' using errcode='42501'; end if;
  v_expected_identity_prefix := p_schedule_id::text||':v'||p_expected_schedule_version::text||':deep_reconciliation:';
  if v_run.mode <> 'deep_reconciliation' or v_run.status <> 'running'
    or v_run.sync_type <> 'transactions' or v_run.lease_owner is distinct from p_lease_owner
    or v_run.scheduler_idempotency_key not like v_expected_identity_prefix||'%'
    or v_run.stopping_reason <> 'provider_history_boundary'
    or coalesce(v_run.deeper_reconciliation_required,false)
    or coalesce(v_run.warnings_count,0) <> 0
    or coalesce(v_run.records_failed,0) <> 0
    or (v_run.metadata->>'scheduled_deep')::boolean is distinct from true
    or (v_run.metadata->>'schedule_id') is distinct from p_schedule_id::text
    or nullif(v_run.metadata->>'schedule_version','')::bigint is distinct from p_expected_schedule_version
  then raise exception 'deep reconciliation completeness not proven' using errcode='55000'; end if;
  update public.commerce_sync_runs set status='completed',completed_at=v_completed_at,
    lease_owner=null,lease_expires_at=null,updated_at=v_completed_at
  where id=v_run.id;
  update public.commerce_continuous_sync_state
  set last_deep_reconciliation_at=v_completed_at,updated_at=v_completed_at
  where organization_id=p_organization_id and connection_id=p_connection_id
    and provider_account_id=p_provider_account_id and resource='transactions';
  update public.commerce_sync_schedules
  set last_deep_reconciliation_at=v_completed_at,
    next_deep_reconciliation_at=v_completed_at+deep_reconciliation_interval,
    last_deep_reconciliation_run_id=v_run.id,updated_at=v_completed_at
  where id=v_schedule.id
  returning * into v_schedule;
  insert into public.tracekit_audit_events(
    actor_user_id,authenticated_identity_id,account_id,organization_id,action,target_type,target_id,
    result,correlation_id,metadata
  ) values(
    null,'runtime:commas-deep-cadence',v_schedule.account_id,v_schedule.organization_id,
    'commerce.deep_reconciliation_schedule_advanced','commerce_sync_schedule',v_schedule.id::text,
    'success',gen_random_uuid()::text,
    jsonb_build_object('run_id',v_run.id,'request_budget',v_run.metadata->'max_provider_requests',
      'stopping_reason',v_run.stopping_reason,'completed_at',v_completed_at,
      'previous_schedule_version',p_expected_schedule_version,'new_schedule_version',v_schedule.schedule_version,
      'next_deep_reconciliation_at',v_schedule.next_deep_reconciliation_at)
  );
  return v_schedule;
end $$;

revoke all on function public.guard_commerce_sync_schedule_version_v1() from public,anon,authenticated,authenticator;
revoke all on function public.initialize_commas_deep_reconciliation_schedule_v1(uuid,uuid,uuid,uuid,bigint,timestamptz,text,text) from public,anon,authenticated,authenticator;
revoke all on function public.complete_scheduled_commas_deep_reconciliation_v1(uuid,uuid,uuid,uuid,bigint,uuid,text) from public,anon,authenticated,authenticator;
grant execute on function public.initialize_commas_deep_reconciliation_schedule_v1(uuid,uuid,uuid,uuid,bigint,timestamptz,text,text) to service_role;
grant execute on function public.complete_scheduled_commas_deep_reconciliation_v1(uuid,uuid,uuid,uuid,bigint,uuid,text) to service_role;

comment on column public.commerce_sync_schedules.schedule_version is 'Database-managed concurrency token for schedule configuration and deep cadence lifecycle changes.';
comment on function public.initialize_commas_deep_reconciliation_schedule_v1 is 'One-time guarded operator initialization of the first Commas deep reconciliation due timestamp.';
comment on function public.complete_scheduled_commas_deep_reconciliation_v1 is 'Atomically completes a proven scheduled Commas deep run and advances its cadence.';
