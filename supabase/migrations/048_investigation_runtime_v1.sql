-- Durable, provider-neutral Investigation runtime and immutable presentation
-- versions. Browser roles receive no table or function access. Analysis is
-- performed by leased background workers; pages read only safe projections.

alter table public.tracekit_investigations
  drop constraint tracekit_investigations_status_check,
  add constraint tracekit_investigations_status_check check (
    status in ('draft','queued','running','completed','completed_with_warnings','failed','cancelled','closed')
  );

create table public.tracekit_investigation_runs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  organization_id uuid not null,
  investigation_id uuid not null,
  status text not null default 'queued',
  idempotency_key text not null,
  algorithm_version text not null,
  commerce_reconciliation_version text not null,
  journey_linkage_version text not null,
  dispute_reconciliation_version text not null,
  reason_normalization_version text not null,
  cohort_definition_version text not null,
  source_snapshot jsonb not null,
  evidence_cutoff_at timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  heartbeat_at timestamptz,
  lease_owner text,
  lease_expires_at timestamptz,
  attempt integer not null default 0,
  records_evaluated bigint not null default 0,
  findings_produced integer not null default 0,
  warnings jsonb not null default '[]',
  sanitized_failure_code text,
  sanitized_failure_summary text,
  requested_by_user_id uuid references public.tracekit_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, account_id) references public.tracekit_organizations(id, owning_account_id),
  foreign key (organization_id, investigation_id) references public.tracekit_investigations(organization_id, id),
  check (status in ('queued','running','completed','completed_with_warnings','failed','cancelled')),
  check (attempt >= 0 and records_evaluated >= 0 and findings_produced >= 0),
  check ((lease_owner is null and lease_expires_at is null) or (lease_owner is not null and lease_expires_at is not null)),
  check (public.financial_reconciliation_metadata_is_safe(source_snapshot)),
  check (public.financial_reconciliation_metadata_is_safe(warnings)),
  unique (organization_id, idempotency_key)
);
create unique index tracekit_investigation_runs_org_id_uidx on public.tracekit_investigation_runs(organization_id,id);
create index tracekit_investigation_runs_lease_idx on public.tracekit_investigation_runs(status,lease_expires_at) where status='running';

create table public.tracekit_investigation_versions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  organization_id uuid not null,
  investigation_id uuid not null,
  run_id uuid not null,
  version_number integer not null,
  status text not null,
  period_start timestamptz,
  period_end timestamptz,
  primary_signal text not null,
  evidence_quality text not null,
  presentation jsonb not null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (organization_id, account_id) references public.tracekit_organizations(id, owning_account_id),
  foreign key (organization_id, investigation_id) references public.tracekit_investigations(organization_id, id),
  foreign key (organization_id, run_id) references public.tracekit_investigation_runs(organization_id, id),
  check (version_number > 0),
  check (status in ('completed','completed_with_warnings')),
  check (evidence_quality in ('high','medium','limited','insufficient')),
  check (public.financial_reconciliation_metadata_is_safe(presentation)),
  unique (investigation_id, version_number),
  unique (run_id)
);
create unique index tracekit_investigation_versions_org_id_uidx on public.tracekit_investigation_versions(organization_id,id);
create index tracekit_investigation_versions_latest_idx on public.tracekit_investigation_versions(investigation_id,version_number desc);

alter table public.tracekit_investigation_findings
  add column algorithm_version text,
  add column attribution_provenance text,
  add constraint tracekit_investigation_findings_provenance_check check (
    attribution_provenance is null or attribution_provenance in ('direct','propagated_within_journey','inferred','unattributed','mixed')
  );

create or replace function public.tracekit_investigation_version_immutable_guard()
returns trigger language plpgsql as $$ begin
  raise exception 'Investigation versions are immutable' using errcode='55000';
end $$;
create trigger tracekit_investigation_versions_immutable
before update or delete on public.tracekit_investigation_versions
for each row execute function public.tracekit_investigation_version_immutable_guard();

create or replace function public.claim_tracekit_investigation_run(
  p_run_id uuid,p_organization_id uuid,p_lease_owner text,p_lease_seconds integer default 120
) returns setof public.tracekit_investigation_runs
language plpgsql security invoker set search_path=public,pg_temp as $$ begin
  if nullif(btrim(p_lease_owner),'') is null or p_lease_seconds<5 or p_lease_seconds>900 then
    raise exception 'invalid Investigation lease request' using errcode='22023';
  end if;
  return query update public.tracekit_investigation_runs r set
    status='running',started_at=coalesce(r.started_at,now()),heartbeat_at=now(),
    lease_owner=p_lease_owner,lease_expires_at=now()+make_interval(secs=>p_lease_seconds),
    attempt=r.attempt+1,updated_at=now()
  where r.id=p_run_id and r.organization_id=p_organization_id
    and (r.status='queued' or (r.status='running' and r.lease_expires_at<now()))
    and r.cancelled_at is null returning r.*;
end $$;

create or replace function public.heartbeat_tracekit_investigation_run(
  p_run_id uuid,p_organization_id uuid,p_lease_owner text,p_lease_seconds integer default 120
) returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_count integer; begin
  update public.tracekit_investigation_runs set heartbeat_at=now(),lease_expires_at=now()+make_interval(secs=>p_lease_seconds),updated_at=now()
  where id=p_run_id and organization_id=p_organization_id and status='running'
    and lease_owner=p_lease_owner and lease_expires_at>=now() and cancelled_at is null;
  get diagnostics v_count=row_count; return v_count=1;
end $$;

create or replace function public.finish_tracekit_investigation_run(
  p_run_id uuid,p_organization_id uuid,p_lease_owner text,p_status text,
  p_records_evaluated bigint,p_findings_produced integer,p_warnings jsonb default '[]'::jsonb,
  p_failure_code text default null,p_failure_summary text default null
) returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_count integer; begin
  if p_status not in ('completed','completed_with_warnings','failed') then raise exception 'invalid Investigation transition' using errcode='22023'; end if;
  update public.tracekit_investigation_runs set status=p_status,completed_at=now(),
    records_evaluated=p_records_evaluated,findings_produced=p_findings_produced,warnings=p_warnings,
    sanitized_failure_code=case when p_status='failed' then left(p_failure_code,100) end,
    sanitized_failure_summary=case when p_status='failed' then left(p_failure_summary,500) end,
    lease_owner=null,lease_expires_at=null,updated_at=now()
  where id=p_run_id and organization_id=p_organization_id and status='running' and lease_owner=p_lease_owner;
  get diagnostics v_count=row_count; return v_count=1;
end $$;

create or replace function public.cancel_tracekit_investigation_run(p_run_id uuid,p_organization_id uuid)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_count integer; begin
  update public.tracekit_investigation_runs set status='cancelled',cancelled_at=now(),lease_owner=null,lease_expires_at=null,updated_at=now()
  where id=p_run_id and organization_id=p_organization_id and status in ('queued','running','failed');
  get diagnostics v_count=row_count; return v_count=1;
end $$;

do $$ declare t text; begin foreach t in array array['tracekit_investigation_runs','tracekit_investigation_versions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
end loop; end $$;

revoke all on function public.claim_tracekit_investigation_run(uuid,uuid,text,integer) from public,anon,authenticated;
revoke all on function public.heartbeat_tracekit_investigation_run(uuid,uuid,text,integer) from public,anon,authenticated;
revoke all on function public.finish_tracekit_investigation_run(uuid,uuid,text,text,bigint,integer,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.cancel_tracekit_investigation_run(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_tracekit_investigation_run(uuid,uuid,text,integer) to service_role;
grant execute on function public.heartbeat_tracekit_investigation_run(uuid,uuid,text,integer) to service_role;
grant execute on function public.finish_tracekit_investigation_run(uuid,uuid,text,text,bigint,integer,jsonb,text,text) to service_role;
grant execute on function public.cancel_tracekit_investigation_run(uuid,uuid) to service_role;
