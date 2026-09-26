-- Converge generic operational compatibility and product-mapping health state.
-- Historical operator actions are intentionally not replayed.
-- No fixed run, marker, audit, pause, or dispatch row is created by this migration.

alter table public.commerce_product_mapping_decisions
  add column if not exists correlation_id text;

do $$
declare v_definition text;
begin
  if to_regprocedure('public.decide_commerce_product_mapping(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid,text,text,uuid,text,text)') is not null then
    select pg_get_functiondef('public.decide_commerce_product_mapping(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid,text,text,uuid,text,text)'::regprocedure) into v_definition;
    if v_definition not ilike '%p_correlation_id%'
      or v_definition not ilike '%tracekit_audit_events%'
      or v_definition not ilike '%mapping_version is distinct from p_expected_mapping_version%' then
      raise exception 'typed product-mapping decision RPC conflicts with expected final contract';
    end if;
  end if;
end $$;

do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'public.decide_commerce_product_mapping(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid,text,uuid,text)',
    'public.decide_commerce_product_mapping(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid,text,text,uuid,text)'
  ] loop
    if to_regprocedure(v_signature) is not null then
      execute format('revoke all on function %s from public, anon, authenticated, service_role', to_regprocedure(v_signature));
    end if;
  end loop;
end $$;

create or replace function public.decide_commerce_product_mapping(
  p_organization_id uuid, p_connection_id uuid, p_provider_account_id uuid, p_provider_product_id uuid,
  p_resulting_state text, p_business_context_id text, p_canonical_offer_id uuid, p_offer_step_id uuid,
  p_offer_variant_id uuid, p_expected_mapping_version text, p_mapping_version text,
  p_decided_by_user_id uuid, p_reason text, p_correlation_id text
) returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_previous_state text; v_current_mapping_version text; v_updated integer;
begin
  if p_resulting_state not in ('approved','rejected') or nullif(btrim(p_expected_mapping_version),'') is null
    or nullif(btrim(p_mapping_version),'') is null or p_mapping_version=p_expected_mapping_version
    or nullif(btrim(p_reason),'') is null or nullif(btrim(p_correlation_id),'') is null then
    raise exception 'invalid product mapping decision' using errcode='22023';
  end if;
  if p_resulting_state='approved' and (p_business_context_id is null or p_canonical_offer_id is null or p_offer_step_id is null) then
    raise exception 'approved product mapping target incomplete' using errcode='22023';
  end if;
  if p_resulting_state='rejected' and (p_business_context_id is not null or p_canonical_offer_id is not null or p_offer_step_id is not null or p_offer_variant_id is not null) then
    raise exception 'rejected product mapping cannot retain a target' using errcode='22023';
  end if;
  select mapping_status,mapping_version into v_previous_state,v_current_mapping_version
  from public.commerce_provider_products where id=p_provider_product_id and organization_id=p_organization_id
    and connection_id=p_connection_id and provider_account_id=p_provider_account_id for update;
  if not found then return false; end if;
  if v_current_mapping_version is distinct from p_expected_mapping_version then raise exception 'stale product mapping version' using errcode='40001'; end if;
  insert into public.commerce_product_mapping_decisions
    (organization_id,connection_id,provider_account_id,provider_product_id,previous_state,resulting_state,business_context_id,canonical_offer_id,offer_step_id,offer_variant_id,mapping_version,decided_by_user_id,reason,correlation_id)
  values (p_organization_id,p_connection_id,p_provider_account_id,p_provider_product_id,v_previous_state,p_resulting_state,p_business_context_id,p_canonical_offer_id,p_offer_step_id,p_offer_variant_id,p_mapping_version,p_decided_by_user_id,btrim(p_reason),btrim(p_correlation_id));
  update public.commerce_provider_products set mapping_status=p_resulting_state,
    business_context_id=case when p_resulting_state='approved' then p_business_context_id else null end,
    canonical_offer_id=case when p_resulting_state='approved' then p_canonical_offer_id else null end,
    offer_step_id=case when p_resulting_state='approved' then p_offer_step_id else null end,
    offer_variant_id=case when p_resulting_state='approved' then p_offer_variant_id else null end,
    mapping_version=p_mapping_version,reviewed_by_user_id=p_decided_by_user_id,reviewed_at=now(),updated_at=now()
  where id=p_provider_product_id and organization_id=p_organization_id and connection_id=p_connection_id
    and provider_account_id=p_provider_account_id and mapping_version is not distinct from p_expected_mapping_version;
  get diagnostics v_updated=row_count;
  if v_updated<>1 then raise exception 'stale product mapping version' using errcode='40001'; end if;
  insert into public.tracekit_audit_events(actor_user_id,account_id,organization_id,action,target_type,target_id,result,permission_evaluated,correlation_id,metadata)
  select p_decided_by_user_id,c.account_id,p_organization_id,
    case when p_resulting_state='approved' then 'product_mapping.approved' else 'product_mapping.rejected' end,
    'commerce_provider_product',p_provider_product_id::text,'success','offers.manage',btrim(p_correlation_id),
    jsonb_build_object('previous_mapping_version',p_expected_mapping_version,'mapping_version',p_mapping_version,'resulting_state',p_resulting_state,'business_context_id',p_business_context_id,'canonical_offer_id',p_canonical_offer_id,'offer_step_id',p_offer_step_id,'offer_variant_id',p_offer_variant_id)
  from public.commerce_provider_connections c where c.id=p_connection_id and c.organization_id=p_organization_id;
  return true;
end $$;

revoke all on function public.decide_commerce_product_mapping(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid,text,text,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.decide_commerce_product_mapping(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid,text,text,uuid,text,text)
  to service_role;
comment on function public.decide_commerce_product_mapping(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid,text,text,uuid,text,text)
  is 'Append-only tenant-scoped Product mapping decision with expected-version, reason, and correlation evidence.';

do $$
begin
  if to_regclass('public.commerce_ordering_evidence_recovery_markers') is null then
    raise exception 'commerce_ordering_evidence_recovery_markers prerequisite is missing';
  end if;
end
$$;

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

-- Corrective, fixed-scope reservation for the single five-page follow-up to
-- the safely bounded three-page normal acceptance run.
create or replace function public.enqueue_commas_normal_continuous_acceptance(p_request_key uuid)
returns table(run_id uuid, account_id uuid, organization_id uuid, connection_id uuid, provider_account_id uuid, scheduler_identity text, request_key uuid, created boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c public.commerce_provider_connections%rowtype;
  a public.commerce_provider_accounts%rowtype;
  s public.commerce_sync_schedules%rowtype;
  prior public.commerce_sync_runs%rowtype;
  existing public.commerce_sync_runs%rowtype;
  q integer;
begin
  if p_request_key is null then raise exception 'normal acceptance request key required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('commas-normal-continuous-acceptance-follow-up-5:ea1c2313-6120-4692-84c5-ec3562e7dcf6',0));
  select r.* into existing from public.commerce_sync_runs r where r.connection_id='ea1c2313-6120-4692-84c5-ec3562e7dcf6'::uuid and r.metadata->>'normal_acceptance_follow_up'='five_page' limit 1;
  if found then return query select existing.id, null::uuid, existing.organization_id, existing.connection_id, existing.provider_account_id, existing.scheduler_idempotency_key, (existing.metadata->>'request_key')::uuid, false; return; end if;
  select r.* into prior from public.commerce_sync_runs r where r.id='b1547be9-31aa-4487-9c08-796f6fc49005'::uuid for share;
  if not found or prior.connection_id is distinct from 'ea1c2313-6120-4692-84c5-ec3562e7dcf6'::uuid or prior.provider_account_id is distinct from '0369c701-717f-4c34-b230-8341bcdb7e65'::uuid or prior.status is distinct from 'completed_with_warnings' or prior.mode is distinct from 'continuous' or prior.pages_completed is distinct from 3 or prior.provider_request_count is distinct from 3 or prior.records_seen is distinct from 300 or prior.warnings_count is distinct from 1 or prior.stopping_reason is distinct from 'bounded_scan_limit' or prior.deeper_reconciliation_required is not true or prior.page_shift_detected is not false or prior.lease_owner is not null or prior.lease_expires_at is not null or prior.metadata->>'normal_acceptance' is distinct from 'true' or prior.metadata->>'shadow_only' is distinct from 'true' or prior.metadata->>'ordering' is distinct from 'newest_first' or prior.metadata->>'ordering_state' is distinct from 'newest_first' or coalesce(prior.metadata->>'pagination_classification','') not in ('none','benign_boundary_overlap') then raise exception 'normal acceptance prior run mismatch' using errcode='42501'; end if;
  if not exists (select 1 from public.commerce_sync_checkpoints x where x.sync_run_id=prior.id and x.resource='transactions' and x.page=3 and x.state='completed' and (x.metadata->>'new_records')::integer=7 and (x.metadata->>'updated_records')::integer=3 and (x.metadata->>'unchanged_records')::integer=90) then raise exception 'normal acceptance prior boundary mismatch' using errcode='42501'; end if;
  select x.* into c from public.commerce_provider_connections x where x.id='ea1c2313-6120-4692-84c5-ec3562e7dcf6'::uuid;
  if not found or c.provider<>'commas' or c.status<>'connected' then raise exception 'normal acceptance connection unavailable' using errcode='42501'; end if;
  select x.* into a from public.commerce_provider_accounts x where x.id='0369c701-717f-4c34-b230-8341bcdb7e65'::uuid and x.organization_id=c.organization_id and x.connection_id=c.id and x.status='active';
  if not found or (select count(*) from public.commerce_provider_accounts x where x.organization_id=c.organization_id and x.connection_id=c.id and x.status='active')<>1 then raise exception 'normal acceptance provider account unavailable' using errcode='42501'; end if;
  if not exists (select 1 from public.commerce_provider_credentials x where x.organization_id=c.organization_id and x.connection_id=c.id and x.revoked_at is null) then raise exception 'normal acceptance credential unavailable' using errcode='42501'; end if;
  select x.* into s from public.commerce_sync_schedules x where x.organization_id=c.organization_id and x.connection_id=c.id and x.provider_account_id=a.id and x.resource='transactions' limit 1;
  if not found or s.enabled or s.sync_frequency<>'hourly' or s.activation_state='paused' then raise exception 'normal acceptance schedule state invalid' using errcode='42501'; end if;
  if exists (select 1 from public.commerce_connection_pauses x where x.organization_id=c.organization_id and x.connection_id=c.id and x.paused=true) then raise exception 'normal acceptance connection paused' using errcode='42501'; end if;
  if exists (select 1 from public.commerce_sync_runs x where x.organization_id=c.organization_id and x.connection_id=c.id and x.status in ('queued','running','paused')) then raise exception 'normal acceptance active run exists' using errcode='42501'; end if;
  if exists (select 1 from public.commerce_repository_activation x where x.organization_id=c.organization_id and x.mode in ('live','live_beta')) then raise exception 'normal acceptance live activation exists' using errcode='42501'; end if;
  if exists (select 1 from public.tracekit_production_controls x where x.capability='commerce_scheduler' and x.activation_state='enabled') then raise exception 'normal acceptance scheduler control enabled' using errcode='42501'; end if;
  select x.quota_remaining into q from public.commerce_continuous_sync_state x where x.organization_id=c.organization_id and x.connection_id=c.id and x.provider_account_id=a.id and x.resource='transactions' and x.quota_observed_at is not null and x.quota_observed_at>=now()-interval '15 minutes' limit 1;
  if q is null or q-5<coalesce(s.quota_minimum_remaining,1000) then raise exception 'normal acceptance quota unavailable' using errcode='42501'; end if;
  return query insert into public.commerce_sync_runs(organization_id,connection_id,provider_account_id,sync_type,mode,scheduler_idempotency_key,metadata)
    values(c.organization_id,c.id,a.id,'transactions','continuous','operator-normal-continuous-acceptance-5:'||p_request_key::text,
      jsonb_build_object('account_id',c.account_id,'dispatch_source','operator_one_shot','normal_acceptance',true,'normal_acceptance_follow_up','five_page','follow_up_of',prior.id,'acceptance_cycle',true,'shadow_only',true,'max_pages',5,'per_page',100,'request_key',p_request_key::text))
    returning id,c.account_id,c.organization_id,c.id,a.id,'operator-normal-continuous-acceptance-5:'||p_request_key::text,p_request_key,true;
end; $$;

revoke all on function public.enqueue_commas_normal_continuous_acceptance(uuid) from public, anon, authenticated;
grant execute on function public.enqueue_commas_normal_continuous_acceptance(uuid) to service_role;

create table if not exists public.commerce_normal_acceptance_redelivery_markers (
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

create table if not exists public.commerce_scheduled_quota_bootstrap_claims (
  connection_id uuid not null,
  provider_account_id uuid not null,
  resource text not null,
  organization_id uuid not null,
  claim_token uuid not null,
  status text not null,
  claimed_at timestamptz not null,
  completed_at timestamptz,
  failed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (connection_id, provider_account_id, resource),
  check (status in ('claimed','completed','failed')),
  check (resource = 'transactions')
);

alter table public.commerce_scheduled_quota_bootstrap_claims enable row level security;
revoke all on public.commerce_scheduled_quota_bootstrap_claims from public, anon, authenticated;
grant select, insert, update on public.commerce_scheduled_quota_bootstrap_claims to service_role;

create or replace function public.claim_scheduled_commerce_quota_bootstrap(
  p_organization_id uuid, p_connection_id uuid, p_provider_account_id uuid,
  p_resource text, p_now timestamptz
) returns table(claimed boolean, reason text, claim_token uuid)
language plpgsql security invoker set search_path = public as $$
declare v_schedule public.commerce_sync_schedules%rowtype; v_previous public.commerce_scheduled_quota_bootstrap_claims%rowtype; v_token uuid:=gen_random_uuid();
begin
  perform pg_advisory_xact_lock(hashtextextended('scheduled-commerce-quota-bootstrap:'||p_connection_id::text||':'||p_provider_account_id::text||':'||p_resource,0));
  select * into v_schedule from public.commerce_sync_schedules s where s.organization_id=p_organization_id and s.connection_id=p_connection_id and s.provider_account_id=p_provider_account_id and s.resource=p_resource for update;
  if not found or v_schedule.enabled is not true or v_schedule.activation_state <> 'enabled' then return query select false,'schedule_disabled',null::uuid; return; end if;
  if v_schedule.sync_frequency='manual' or (v_schedule.last_enqueued_at is not null and v_schedule.last_enqueued_at > p_now-case v_schedule.sync_frequency when '5_minutes' then interval '5 minutes' when '15_minutes' then interval '15 minutes' when '30_minutes' then interval '30 minutes' else interval '1 hour' end) then return query select false,'schedule_not_due',null::uuid; return; end if;
  if v_schedule.next_overlap_at is not null and v_schedule.next_overlap_at>p_now and (v_schedule.next_deep_reconciliation_at is null or v_schedule.next_deep_reconciliation_at>p_now) then return query select false,'schedule_not_due',null::uuid; return; end if;
  if not exists(select 1 from public.tracekit_production_controls c where c.capability='commerce_scheduler' and c.activation_state='enabled') then return query select false,'scheduler_control_disabled',null::uuid; return; end if;
  if not exists(select 1 from public.commerce_provider_connections c where c.id=p_connection_id and c.organization_id=p_organization_id and c.provider='commas' and c.status='connected') then return query select false,'connection_unavailable',null::uuid; return; end if;
  if (select count(*) from public.commerce_provider_accounts a where a.organization_id=p_organization_id and a.connection_id=p_connection_id and a.status='active')<>1 or not exists(select 1 from public.commerce_provider_accounts a where a.id=p_provider_account_id and a.organization_id=p_organization_id and a.connection_id=p_connection_id and a.status='active') then return query select false,'provider_account_scope',null::uuid; return; end if;
  if exists(select 1 from public.commerce_connection_pauses p where p.organization_id=p_organization_id and p.connection_id=p_connection_id and p.paused=true) then return query select false,'connection_paused',null::uuid; return; end if;
  if exists(select 1 from public.commerce_repository_activation a where a.organization_id=p_organization_id and a.mode in ('live','live_beta')) then return query select false,'live_activation',null::uuid; return; end if;
  if exists(select 1 from public.commerce_sync_runs r where r.organization_id=p_organization_id and r.connection_id=p_connection_id and r.status in ('queued','running','paused')) then return query select false,'active_run',null::uuid; return; end if;
  if exists(select 1 from public.commerce_continuous_sync_state q where q.organization_id=p_organization_id and q.connection_id=p_connection_id and q.provider_account_id=p_provider_account_id and q.resource=p_resource and q.quota_observed_at is not null and q.quota_observed_at>=p_now-(case v_schedule.sync_frequency when '5_minutes' then interval '20 minutes' when '15_minutes' then interval '30 minutes' when '30_minutes' then interval '45 minutes' else interval '75 minutes' end)) then return query select false,'quota_fresh',null::uuid; return; end if;
  select * into v_previous from public.commerce_scheduled_quota_bootstrap_claims c where c.connection_id=p_connection_id and c.provider_account_id=p_provider_account_id and c.resource=p_resource;
  if found and v_previous.claimed_at>p_now-interval '30 minutes' then return query select false,'throttled',null::uuid; return; end if;
  insert into public.commerce_scheduled_quota_bootstrap_claims(connection_id,provider_account_id,resource,organization_id,claim_token,status,claimed_at,completed_at,failed_at,updated_at)
  values(p_connection_id,p_provider_account_id,p_resource,p_organization_id,v_token,'claimed',p_now,null,null,p_now)
  on conflict(connection_id,provider_account_id,resource) do update set organization_id=excluded.organization_id,claim_token=excluded.claim_token,status='claimed',claimed_at=excluded.claimed_at,completed_at=null,failed_at=null,updated_at=excluded.updated_at;
  return query select true,'claimed',v_token;
end $$;

create or replace function public.finish_scheduled_commerce_quota_bootstrap(p_claim_token uuid,p_success boolean,p_now timestamptz)
returns boolean language sql security invoker set search_path=public as $$
  update public.commerce_scheduled_quota_bootstrap_claims set status=case when p_success then 'completed' else 'failed' end,completed_at=case when p_success then p_now else null end,failed_at=case when p_success then null else p_now end,updated_at=p_now where claim_token=p_claim_token and status='claimed' returning true
$$;
revoke all on function public.claim_scheduled_commerce_quota_bootstrap(uuid,uuid,uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function public.finish_scheduled_commerce_quota_bootstrap(uuid,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_scheduled_commerce_quota_bootstrap(uuid,uuid,uuid,text,timestamptz) to service_role;
grant execute on function public.finish_scheduled_commerce_quota_bootstrap(uuid,boolean,timestamptz) to service_role;

create or replace function public.set_commerce_connection_pause(
  p_organization_id uuid,
  p_account_id uuid,
  p_connection_id uuid,
  p_paused boolean,
  p_reason_code text
) returns public.commerce_connection_pauses
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_row public.commerce_connection_pauses%rowtype; v_reason text:=lower(btrim(coalesce(p_reason_code,''))); v_now timestamptz:=now();
begin
  if v_reason !~ '^[a-z][a-z0-9_]{2,63}$' then raise exception 'invalid commerce pause reason' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('commerce-connection-pause:'||p_connection_id::text,0));
  if not exists(select 1 from public.commerce_provider_connections c where c.id=p_connection_id and c.organization_id=p_organization_id and c.account_id=p_account_id and c.provider='commas' and c.status='connected') then raise exception 'commerce pause scope unavailable' using errcode='42501'; end if;
  insert into public.commerce_connection_pauses(connection_id,organization_id,account_id,paused,reason_code,paused_at,resumed_at,actor_context,updated_at)
  values(p_connection_id,p_organization_id,p_account_id,p_paused,v_reason,case when p_paused then v_now else null end,case when p_paused then null else v_now end,'product_admin',v_now)
  on conflict(connection_id) do update set paused=excluded.paused,reason_code=excluded.reason_code,paused_at=case when excluded.paused then coalesce(public.commerce_connection_pauses.paused_at,v_now) else null end,resumed_at=case when excluded.paused then null else v_now end,actor_context='product_admin',updated_at=v_now
  returning * into v_row;
  insert into public.tracekit_audit_events(actor_user_id,authenticated_identity_id,account_id,organization_id,action,target_type,target_id,result,correlation_id,metadata)
  values(null,'operator:commerce-pause',p_account_id,p_organization_id,case when p_paused then 'commerce.connection_paused' else 'commerce.connection_resumed' end,'commerce_provider_connection',p_connection_id::text,'success',gen_random_uuid()::text,jsonb_build_object('reason_code',v_reason));
  return v_row;
end $$;

revoke all on function public.set_commerce_connection_pause(uuid,uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.set_commerce_connection_pause(uuid,uuid,uuid,boolean,text) to service_role;

create index if not exists platform_orders_commas_product_health_idx
  on public.platform_orders (
    organization_id,
    connection_id,
    provider_account_id,
    provider_product_id
  )
  include (canonical_order_id, gross_amount)
  where platform = 'commas' and provider_product_id is not null;

-- These columns describe the same provider population in Commerce rows. Plain
-- per-column statistics multiply their identical selectivities and undercount
-- the production Commas scope by roughly two orders of magnitude.
create statistics if not exists platform_orders_commerce_scope_stats
  (dependencies, mcv)
  on platform,
     organization_id,
     connection_id,
     provider_account_id,
     provider_product_id
  from public.platform_orders;

alter statistics public.platform_orders_commerce_scope_stats
  set statistics 500;

-- Production convergence deliberately does not run ANALYZE unconditionally.

-- Match the partial covering index predicate explicitly. Null product IDs can
-- never join commerce_provider_products.id, so excluding them is semantically
-- identical while making the intended index provably usable by the planner.
create or replace view public.commerce_product_mapping_health_v1
with (security_invoker = true) as
with order_health as (
  select
    o.organization_id,
    o.connection_id,
    o.provider_account_id,
    o.provider_product_id,
    count(o.canonical_order_id)::bigint as order_count,
    coalesce(sum(o.gross_amount), 0)::numeric as gross_revenue
  from public.platform_orders o
  where o.platform = 'commas'
    and o.provider_product_id is not null
  group by
    o.organization_id,
    o.connection_id,
    o.provider_account_id,
    o.provider_product_id
)
select
  p.organization_id,
  p.connection_id,
  p.provider_account_id,
  p.id as provider_product_row_id,
  p.provider_product_id,
  p.mapping_status,
  p.first_seen_at,
  p.last_seen_at,
  p.reviewed_at,
  coalesce(h.order_count, 0)::bigint as order_count,
  coalesce(h.gross_revenue, 0)::numeric as gross_revenue,
  case
    when p.mapping_status = 'approved' and
      (p.business_context_id is null or p.canonical_offer_id is null or p.offer_step_id is null)
      then 'conflict'
    when p.mapping_status in ('observed', 'proposed', 'review_required') then 'unmapped'
    else 'resolved'
  end as integrity_status
from public.commerce_provider_products p
left join order_health h
  on h.organization_id = p.organization_id
 and h.connection_id = p.connection_id
 and h.provider_account_id = p.provider_account_id
 and h.provider_product_id = p.id;

revoke all on public.commerce_product_mapping_health_v1 from public, anon, authenticated;
grant select on public.commerce_product_mapping_health_v1 to service_role;

comment on view public.commerce_product_mapping_health_v1 is
  'Read-only provider-product mapping health with pre-aggregated financially safe order totals; no mapping inference or mutation.';


do $$
declare
  v_health text;
  v_index text;
  v_stats_target integer;
  v_stats_kinds "char"[];
begin
  if (
    select count(*)
    from information_schema.columns
    where table_schema='public'
      and table_name='commerce_ordering_evidence_recovery_markers'
      and column_name in ('recovery_key','run_id','created_at','continuation_dispatch_claimed_at','queue_dispatched_at')
  ) <> 5 then
    raise exception 'ordering recovery marker schema conflicts with expected final state';
  end if;

  if (
    select count(*)
    from information_schema.columns
    where table_schema='public'
      and table_name='commerce_normal_acceptance_redelivery_markers'
      and column_name in ('redelivery_key','run_id','claimed_at','queue_dispatched_at')
  ) <> 4 then
    raise exception 'normal acceptance redelivery marker schema conflicts with expected final state';
  end if;

  if (
    select count(*)
    from information_schema.columns
    where table_schema='public'
      and table_name='commerce_scheduled_quota_bootstrap_claims'
      and column_name in ('connection_id','provider_account_id','resource','organization_id','claim_token','status','claimed_at','completed_at','failed_at','updated_at')
  ) <> 10 then
    raise exception 'scheduled quota bootstrap claim schema conflicts with expected final state';
  end if;

  select pg_get_indexdef(to_regclass('public.platform_orders_commas_product_health_idx'))
    into v_index;
  if v_index is null
    or v_index not ilike '%(organization_id, connection_id, provider_account_id, provider_product_id)%'
    or v_index not ilike '%INCLUDE (canonical_order_id, gross_amount)%'
    or v_index not ilike '%platform = ''commas''%'
    or v_index not ilike '%provider_product_id IS NOT NULL%' then
    raise exception 'product mapping health index conflicts with expected final state';
  end if;

  select pg_get_viewdef('public.commerce_product_mapping_health_v1'::regclass, true)
    into v_health;
  if v_health not ilike '%WITH order_health AS%'
    or v_health not ilike '%provider_product_id IS NOT NULL%'
    or v_health not ilike '%count(o.canonical_order_id)%'
    or v_health not ilike '%sum(o.gross_amount)%' then
    raise exception 'product mapping health view conflicts with expected final state';
  end if;

  select stxstattarget, stxkind
    into v_stats_target, v_stats_kinds
  from pg_statistic_ext
  where stxnamespace='public'::regnamespace
    and stxname='platform_orders_commerce_scope_stats';

  if v_stats_target is distinct from 500
    or not ('f'::"char" = any(v_stats_kinds))
    or not ('m'::"char" = any(v_stats_kinds)) then
    raise exception 'product mapping health statistics conflict with expected final state';
  end if;

  if not (select relrowsecurity from pg_class where oid='public.commerce_ordering_evidence_recovery_markers'::regclass)
    or not (select relrowsecurity from pg_class where oid='public.commerce_normal_acceptance_redelivery_markers'::regclass)
    or not (select relrowsecurity from pg_class where oid='public.commerce_scheduled_quota_bootstrap_claims'::regclass) then
    raise exception 'operational compatibility RLS is not enabled';
  end if;
end
$$;
