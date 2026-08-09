-- Continuous Commerce Intelligence v1.
-- Durable scheduling, overlap observations, freshness, Investigation staleness,
-- and reviewable signal candidates. This migration activates no repository and
-- grants browser roles no direct access.

alter table public.commerce_sync_runs drop constraint commerce_sync_runs_mode_check;
alter table public.commerce_sync_runs add constraint commerce_sync_runs_mode_check check (
  mode in ('discovery','shadow','live_beta','live','reconciliation','historical_backfill','continuous','deep_reconciliation')
);
alter table public.commerce_sync_runs
  add column provider_request_count integer not null default 0,
  add column evidence_writes integer not null default 0,
  add column evidence_reuses integer not null default 0,
  add column provider_total_start bigint,
  add column provider_total_end bigint,
  add column stopping_reason text,
  add column overlap_pages_scanned integer not null default 0,
  add column page_shift_detected boolean not null default false,
  add column deeper_reconciliation_required boolean not null default false,
  add column freshness_result text,
  add column scheduler_idempotency_key text,
  add constraint commerce_sync_runs_continuous_counts_check check (
    provider_request_count>=0 and evidence_writes>=0 and evidence_reuses>=0 and
    overlap_pages_scanned>=0 and (provider_total_start is null or provider_total_start>=0) and
    (provider_total_end is null or provider_total_end>=0)
  ),
  add constraint commerce_sync_runs_freshness_result_check check (
    freshness_result is null or freshness_result in ('current','changed','stale','unknown')
  );
create unique index commerce_sync_runs_scheduler_key_uidx on public.commerce_sync_runs(organization_id,scheduler_idempotency_key) where scheduler_idempotency_key is not null;

create table public.commerce_continuous_sync_state (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  resource text not null,
  last_attempted_at timestamptz,
  last_successful_at timestamptz,
  last_provider_observation_at timestamptz,
  last_normalized_record_at timestamptz,
  latest_provider_transaction_at timestamptz,
  provider_total_observed bigint,
  recent_source_ids jsonb not null default '[]',
  page_fingerprints jsonb not null default '{}',
  last_stability_boundary jsonb not null default '{}',
  last_stopping_reason text,
  last_deep_reconciliation_at timestamptz,
  normalizer_version text not null,
  evidence_contract_version text not null,
  status text not null default 'unknown',
  attribution_source_state text not null default 'unavailable',
  warnings jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id,account_id) references public.tracekit_organizations(id,owning_account_id),
  foreign key (organization_id,connection_id,provider_account_id) references public.commerce_provider_accounts(organization_id,connection_id,id),
  check (resource ~ '^[a-z][a-z0-9_]*$'),
  check (provider_total_observed is null or provider_total_observed>=0),
  check (jsonb_typeof(recent_source_ids)='array' and jsonb_typeof(page_fingerprints)='object' and jsonb_typeof(last_stability_boundary)='object' and jsonb_typeof(warnings)='array'),
  check (status in ('unknown','current','stale','failed','degraded')),
  check (attribution_source_state in ('available','unavailable','partial')),
  check (public.financial_reconciliation_metadata_is_safe(recent_source_ids)),
  check (public.financial_reconciliation_metadata_is_safe(page_fingerprints)),
  check (public.financial_reconciliation_metadata_is_safe(last_stability_boundary)),
  check (public.financial_reconciliation_metadata_is_safe(warnings)),
  unique(connection_id,provider_account_id,resource)
);
create unique index commerce_continuous_sync_state_org_id_uidx on public.commerce_continuous_sync_state(organization_id,id);
create index commerce_continuous_sync_state_freshness_idx on public.commerce_continuous_sync_state(status,last_successful_at);

create table public.commerce_sync_schedules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  resource text not null,
  enabled boolean not null default false,
  overlap_interval interval not null default interval '15 minutes',
  deep_reconciliation_interval interval not null default interval '7 days',
  next_overlap_at timestamptz,
  next_deep_reconciliation_at timestamptz,
  last_enqueued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id,account_id) references public.tracekit_organizations(id,owning_account_id),
  foreign key (organization_id,connection_id,provider_account_id) references public.commerce_provider_accounts(organization_id,connection_id,id),
  check (resource ~ '^[a-z][a-z0-9_]*$'),
  check (overlap_interval>=interval '1 minute' and deep_reconciliation_interval>=interval '1 day'),
  unique(connection_id,provider_account_id,resource)
);

create table public.tracekit_investigation_dependencies (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  organization_id uuid not null,
  investigation_id uuid not null,
  resource_type text not null,
  entity_type text,
  entity_id text,
  period_start timestamptz,
  period_end timestamptz,
  dependency_version text not null,
  created_at timestamptz not null default now(),
  foreign key (organization_id,account_id) references public.tracekit_organizations(id,owning_account_id),
  foreign key (organization_id,investigation_id) references public.tracekit_investigations(organization_id,id),
  check (resource_type ~ '^[a-z][a-z0-9_]*$')
);
create index tracekit_investigation_dependencies_match_idx on public.tracekit_investigation_dependencies(organization_id,resource_type,entity_type,entity_id);
create unique index tracekit_investigation_dependencies_identity_uidx on public.tracekit_investigation_dependencies(
  investigation_id,resource_type,coalesce(entity_type,''),coalesce(entity_id,''),coalesce(period_start,'-infinity'::timestamptz),coalesce(period_end,'infinity'::timestamptz)
);

create table public.tracekit_investigation_freshness (
  investigation_id uuid primary key,
  account_id uuid not null,
  organization_id uuid not null,
  current_version_id uuid,
  freshness_status text not null default 'current',
  relevant_evidence_at timestamptz,
  evaluated_at timestamptz not null default now(),
  refresh_run_id uuid,
  reasons jsonb not null default '[]',
  sanitized_failure_code text,
  updated_at timestamptz not null default now(),
  foreign key (organization_id,account_id) references public.tracekit_organizations(id,owning_account_id),
  foreign key (organization_id,investigation_id) references public.tracekit_investigations(organization_id,id),
  foreign key (organization_id,current_version_id) references public.tracekit_investigation_versions(organization_id,id),
  foreign key (organization_id,refresh_run_id) references public.tracekit_investigation_runs(organization_id,id),
  check (freshness_status in ('current','new_evidence_available','refresh_queued','refreshing','refresh_failed')),
  check (jsonb_typeof(reasons)='array' and public.financial_reconciliation_metadata_is_safe(reasons))
);
create index tracekit_investigation_freshness_status_idx on public.tracekit_investigation_freshness(organization_id,freshness_status);

create table public.tracekit_investigation_candidates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  organization_id uuid not null,
  candidate_key text not null,
  candidate_type text not null,
  status text not null default 'needs_review',
  question text not null,
  metric text not null,
  entity_type text,
  entity_id text,
  current_value numeric,
  baseline_value numeric,
  sample_size bigint not null,
  baseline_sample_size bigint,
  period_start timestamptz,
  period_end timestamptz,
  maturity jsonb not null default '{}',
  evidence_quality jsonb not null default '{}',
  trigger_reason text not null,
  source_snapshot jsonb not null,
  existing_investigation_id uuid,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id,account_id) references public.tracekit_organizations(id,owning_account_id),
  foreign key (organization_id,existing_investigation_id) references public.tracekit_investigations(organization_id,id),
  check (candidate_type in ('maturity_adjusted_dispute_incidence','refund_incidence','product_dispute_rate','unresolved_disputed_amount','data_quality_degradation')),
  check (status in ('needs_review','investigating','dismissed','resolved','suppressed_existing_investigation')),
  check (sample_size>=0 and (baseline_sample_size is null or baseline_sample_size>=0)),
  check (jsonb_typeof(maturity)='object' and jsonb_typeof(evidence_quality)='object' and jsonb_typeof(source_snapshot)='object'),
  check (public.financial_reconciliation_metadata_is_safe(maturity)),
  check (public.financial_reconciliation_metadata_is_safe(evidence_quality)),
  check (public.financial_reconciliation_metadata_is_safe(source_snapshot)),
  unique(organization_id,candidate_key)
);
create index tracekit_investigation_candidates_review_idx on public.tracekit_investigation_candidates(organization_id,status,last_detected_at desc);

create or replace function public.enqueue_commerce_continuous_sync(
  p_account_id uuid,p_organization_id uuid,p_connection_id uuid,p_provider_account_id uuid,
  p_resource text,p_mode text,p_idempotency_key text
) returns setof public.commerce_sync_runs language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_existing public.commerce_sync_runs%rowtype;
begin
  if p_mode not in ('continuous','deep_reconciliation') or nullif(btrim(p_idempotency_key),'') is null then
    raise exception 'invalid continuous sync request' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_connection_id::text||':'||p_provider_account_id::text||':'||p_resource,0));
  select * into v_existing from public.commerce_sync_runs where organization_id=p_organization_id and scheduler_idempotency_key=p_idempotency_key limit 1;
  if found then return next v_existing; return; end if;
  select * into v_existing from public.commerce_sync_runs where organization_id=p_organization_id and connection_id=p_connection_id
    and provider_account_id=p_provider_account_id and sync_type=p_resource and status in ('queued','running') order by created_at limit 1;
  if found then return next v_existing; return; end if;
  return query insert into public.commerce_sync_runs(organization_id,connection_id,provider_account_id,sync_type,mode,scheduler_idempotency_key,metadata)
    values(p_organization_id,p_connection_id,p_provider_account_id,p_resource,p_mode,p_idempotency_key,jsonb_build_object('account_id',p_account_id)) returning *;
end $$;

create or replace function public.claim_commerce_sync_run(
  p_run_id uuid,p_organization_id uuid,p_connection_id uuid,p_lease_owner text,p_lease_seconds integer default 60
) returns setof public.commerce_sync_runs language plpgsql security invoker set search_path=public as $$
declare v_provider_account_id uuid; v_resource text;
begin
  if nullif(btrim(p_lease_owner),'') is null or p_lease_seconds<5 or p_lease_seconds>900 then
    raise exception 'invalid commerce sync lease request' using errcode='22023';
  end if;
  select provider_account_id,sync_type into v_provider_account_id,v_resource from public.commerce_sync_runs
    where id=p_run_id and organization_id=p_organization_id and connection_id=p_connection_id;
  if not found then return; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_connection_id::text||':'||v_provider_account_id::text||':'||v_resource,0));
  return query update public.commerce_sync_runs r set status='running',started_at=coalesce(r.started_at,now()),
    lease_owner=p_lease_owner,lease_expires_at=now()+make_interval(secs=>p_lease_seconds),heartbeat_at=now(),attempt=r.attempt+1,updated_at=now()
  where r.id=p_run_id and r.organization_id=p_organization_id and r.connection_id=p_connection_id
    and (r.status in('queued','paused','failed') or (r.status='running' and r.lease_expires_at<now())) and r.cancelled_at is null
    and not exists(select 1 from public.commerce_sync_runs other where other.id<>r.id and other.organization_id=r.organization_id
      and other.connection_id=r.connection_id and other.provider_account_id=r.provider_account_id and other.sync_type=r.sync_type
      and other.status='running' and other.lease_expires_at>=now()) returning r.*;
end $$;

create or replace function public.mark_investigation_new_evidence(
  p_organization_id uuid,p_resource_type text,p_entity_type text,p_entity_id text,p_observed_at timestamptz,p_reason text
) returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_count integer;
begin
  insert into public.tracekit_investigation_freshness(investigation_id,account_id,organization_id,current_version_id,freshness_status,relevant_evidence_at,reasons)
  select d.investigation_id,d.account_id,d.organization_id,v.id,'new_evidence_available',p_observed_at,jsonb_build_array(jsonb_build_object('code',p_reason,'resource',p_resource_type))
  from public.tracekit_investigation_dependencies d
  left join lateral (select id from public.tracekit_investigation_versions where investigation_id=d.investigation_id order by version_number desc limit 1) v on true
  where d.organization_id=p_organization_id and d.resource_type=p_resource_type
    and (d.entity_type is null or (d.entity_type=p_entity_type and d.entity_id=p_entity_id))
    and (d.period_start is null or p_observed_at>=d.period_start) and (d.period_end is null or p_observed_at<=d.period_end)
  on conflict(investigation_id) do update set freshness_status='new_evidence_available',relevant_evidence_at=greatest(public.tracekit_investigation_freshness.relevant_evidence_at,excluded.relevant_evidence_at),reasons=excluded.reasons,evaluated_at=now(),updated_at=now();
  get diagnostics v_count=row_count; return v_count;
end $$;

do $$ declare t text; begin foreach t in array array[
  'commerce_continuous_sync_state','commerce_sync_schedules','tracekit_investigation_dependencies',
  'tracekit_investigation_freshness','tracekit_investigation_candidates'
] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
end loop; end $$;

revoke all on function public.enqueue_commerce_continuous_sync(uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.mark_investigation_new_evidence(uuid,text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.enqueue_commerce_continuous_sync(uuid,uuid,uuid,uuid,text,text,text) to service_role;
grant execute on function public.mark_investigation_new_evidence(uuid,text,text,text,timestamptz,text) to service_role;

comment on table public.commerce_continuous_sync_state is 'TraceKit observation checkpoint and freshness state; not a provider cursor.';
comment on table public.tracekit_investigation_candidates is 'Reviewable signals, not Findings or causal conclusions.';
