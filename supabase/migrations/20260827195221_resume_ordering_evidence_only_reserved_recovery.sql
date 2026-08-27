-- One-time continuation for the already-reserved Evidence-only ordering recovery.
alter table public.commerce_ordering_evidence_recovery_markers
  add column if not exists continuation_dispatch_claimed_at timestamptz,
  add column if not exists queue_dispatched_at timestamptz;

alter table public.commerce_ordering_evidence_recovery_markers enable row level security;
revoke all on table public.commerce_ordering_evidence_recovery_markers from public, anon, authenticated;
grant select, update on table public.commerce_ordering_evidence_recovery_markers to service_role;

create or replace function public.resume_ordering_evidence_only_fdf97cb1()
returns table(run_id uuid, account_id uuid, organization_id uuid, connection_id uuid, provider_account_id uuid, scheduler_identity text, request_key uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run public.commerce_sync_runs%rowtype;
  v_connection public.commerce_provider_connections%rowtype;
  v_marker public.commerce_ordering_evidence_recovery_markers%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('ordering-evidence-only-resume:fdf97cb1-222c-4fb3-b02d-b4502a3f85a9', 0));

  select r.* into v_run
  from public.commerce_sync_runs r
  where r.id = 'fdf97cb1-222c-4fb3-b02d-b4502a3f85a9'::uuid
  for update;
  if not found then raise exception 'ordering continuation run unavailable' using errcode = '42501'; end if;

  if v_run.status <> 'running' or v_run.lease_expires_at is null or v_run.lease_expires_at >= now() or v_run.cancelled_at is not null then
    raise exception 'ordering continuation run is not reclaimable' using errcode = '42501';
  end if;
  if v_run.connection_id <> 'ea1c2313-6120-4692-84c5-ec3562e7dcf6'::uuid or v_run.sync_type <> 'transactions' or v_run.mode <> 'continuous' then
    raise exception 'ordering continuation scope invalid' using errcode = '42501';
  end if;
  if coalesce(v_run.metadata->>'dispatch_source', '') <> 'operator_ordering_verification'
    or v_run.metadata->>'ordering_verification' <> 'true'
    or v_run.metadata->>'shadow_only' <> 'true'
    or coalesce((v_run.metadata->>'max_pages')::integer, 0) <> 3
    or coalesce((v_run.metadata->>'per_page')::integer, 0) <> 100
    or v_run.metadata->>'operator_recovery_dispatched' <> 'true'
    or coalesce(v_run.metadata->>'operator_recovery_reason', '') <> 'ordering_evidence_only' then
    raise exception 'ordering continuation metadata invalid' using errcode = '42501';
  end if;

  select m.* into v_marker
  from public.commerce_ordering_evidence_recovery_markers m
  where m.recovery_key = 'fdf97cb1-222c-4fb3-b02d-b4502a3f85a9'
    and m.run_id = v_run.id
  for update;
  if not found then raise exception 'ordering continuation marker unavailable' using errcode = '42501'; end if;
  if v_marker.continuation_dispatch_claimed_at is not null or v_marker.queue_dispatched_at is not null then
    raise exception 'ordering continuation already claimed' using errcode = '42501';
  end if;

  select c.* into v_connection
  from public.commerce_provider_connections c
  where c.id = 'ea1c2313-6120-4692-84c5-ec3562e7dcf6'::uuid
    and c.id = v_run.connection_id
    and c.organization_id = v_run.organization_id
    and c.provider = 'commas'
    and c.status = 'connected';
  if not found then raise exception 'ordering continuation connection invalid' using errcode = '42501'; end if;
  if (select count(*) from public.commerce_provider_accounts pa where pa.organization_id = v_run.organization_id and pa.connection_id = v_run.connection_id and pa.status = 'active') <> 1
    or not exists (select 1 from public.commerce_provider_accounts pa where pa.id = v_run.provider_account_id and pa.organization_id = v_run.organization_id and pa.connection_id = v_run.connection_id and pa.status = 'active') then
    raise exception 'ordering continuation provider account invalid' using errcode = '42501';
  end if;
  if exists (select 1 from public.commerce_connection_pauses cp where cp.organization_id = v_run.organization_id and cp.connection_id = v_run.connection_id and cp.paused = true) then
    raise exception 'ordering continuation connection paused' using errcode = '42501';
  end if;
  if exists (select 1 from public.commerce_repository_activation ra where ra.organization_id = v_run.organization_id and ra.mode in ('live', 'live_beta')) then
    raise exception 'ordering continuation live activation exists' using errcode = '42501';
  end if;
  if exists (select 1 from public.tracekit_production_controls tc where tc.capability = 'commerce_scheduler' and tc.activation_state = 'enabled') then
    raise exception 'ordering continuation scheduler enabled' using errcode = '42501';
  end if;
  if exists (select 1 from public.commerce_sync_runs ar where ar.organization_id = v_run.organization_id and ar.connection_id = v_run.connection_id and ar.id <> v_run.id and ar.status in ('queued', 'running', 'paused')) then
    raise exception 'ordering continuation active run exists' using errcode = '42501';
  end if;
  if (select count(distinct cp.page) from public.commerce_sync_checkpoints cp where cp.sync_run_id = v_run.id and cp.organization_id = v_run.organization_id and cp.connection_id = v_run.connection_id and cp.provider_account_id = v_run.provider_account_id and cp.resource = 'transactions' and cp.page in (1, 2, 3) and cp.per_page = 100 and cp.state = 'completed') <> 3 then
    raise exception 'ordering continuation checkpoints incomplete' using errcode = '42501';
  end if;
  if (select count(distinct er.source_object_id) from public.commerce_evidence_records er where er.sync_run_id = v_run.id and er.organization_id = v_run.organization_id and er.connection_id = v_run.connection_id and er.provider_account_id = v_run.provider_account_id and er.source_object_type = 'transaction_page' and er.deleted_at is null and er.payload_hash <> '' and er.storage_reference <> '' and er.source_object_id in ('continuous:page:1:per_page:100', 'continuous:page:2:per_page:100', 'continuous:page:3:per_page:100')) <> 3 then
    raise exception 'ordering continuation evidence unavailable' using errcode = '42501';
  end if;

  update public.commerce_ordering_evidence_recovery_markers m
  set continuation_dispatch_claimed_at = now()
  where m.recovery_key = v_marker.recovery_key
    and m.run_id = v_run.id
    and m.continuation_dispatch_claimed_at is null
    and m.queue_dispatched_at is null;
  if not found then raise exception 'ordering continuation already claimed' using errcode = '42501'; end if;

  return query select v_run.id, v_connection.account_id, v_run.organization_id, v_run.connection_id, v_run.provider_account_id, v_run.scheduler_idempotency_key, (v_run.metadata->>'request_key')::uuid;
end;
$$;

create or replace function public.mark_ordering_evidence_only_queue_dispatched_fdf97cb1()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('ordering-evidence-only-resume:fdf97cb1-222c-4fb3-b02d-b4502a3f85a9', 0));
  update public.commerce_ordering_evidence_recovery_markers m
  set queue_dispatched_at = coalesce(m.queue_dispatched_at, now())
  where m.recovery_key = 'fdf97cb1-222c-4fb3-b02d-b4502a3f85a9'
    and m.run_id = 'fdf97cb1-222c-4fb3-b02d-b4502a3f85a9'::uuid
    and m.continuation_dispatch_claimed_at is not null;
  return found;
end;
$$;

revoke all on function public.resume_ordering_evidence_only_fdf97cb1() from public, anon, authenticated;
revoke all on function public.mark_ordering_evidence_only_queue_dispatched_fdf97cb1() from public, anon, authenticated;
grant execute on function public.resume_ordering_evidence_only_fdf97cb1() to service_role;
grant execute on function public.mark_ordering_evidence_only_queue_dispatched_fdf97cb1() to service_role;
