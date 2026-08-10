-- Production Intelligence readiness controls. Additive and disabled by default.
-- This migration does not activate schedules, TKID sources, or Workspace repositories.

alter table public.commerce_sync_schedules
  add column activation_state text not null default 'disabled',
  add column paused_at timestamptz,
  add column pause_reason_code text,
  add column quota_minimum_remaining integer not null default 1000,
  add column deep_request_budget integer not null default 800,
  add column max_execution_seconds integer not null default 840,
  add constraint commerce_sync_schedules_activation_check check(activation_state in('disabled','ready','enabled','paused')),
  add constraint commerce_sync_schedules_pause_check check((activation_state='paused')=(paused_at is not null)),
  add constraint commerce_sync_schedules_quota_check check(quota_minimum_remaining between 100 and 9000 and deep_request_budget between 1 and 5000 and max_execution_seconds between 30 and 900);

create table public.tracekit_production_controls(
  id uuid primary key default gen_random_uuid(), account_id uuid not null, organization_id uuid not null,
  capability text not null, activation_state text not null default 'disabled', reason_code text,
  changed_by_context text not null default 'server', changed_at timestamptz not null default now(), metadata jsonb not null default '{}',
  foreign key(organization_id,account_id) references public.tracekit_organizations(id,owning_account_id),
  unique(organization_id,capability),
  check(capability in('commerce_scheduler','commerce_deep_reconciliation','investigation_candidate_evaluation','investigation_refresh','tkid_ingestion','investigation_tkid_consumption')),
  check(activation_state in('disabled','ready','enabled','paused','shadow','review_only','approved')),
  check(changed_by_context in('server','product_admin','background_job')),
  check(jsonb_typeof(metadata)='object' and public.financial_reconciliation_metadata_is_safe(metadata))
);

create table public.commerce_connection_pauses(
  connection_id uuid primary key, organization_id uuid not null, account_id uuid not null,
  paused boolean not null default false, reason_code text, paused_at timestamptz, resumed_at timestamptz,
  actor_context text not null default 'server', updated_at timestamptz not null default now(),
  foreign key(organization_id,account_id) references public.tracekit_organizations(id,owning_account_id),
  foreign key(organization_id,connection_id) references public.commerce_provider_connections(organization_id,id),
  check((paused and paused_at is not null) or not paused), check(actor_context in('server','product_admin','background_job'))
);

alter table public.tkid_sources drop constraint tkid_sources_status_check;
alter table public.tkid_sources
  add constraint tkid_sources_status_check check(status in('disabled','ready','shadow','paused','active','revoked')),
  add column sdk_version text not null default '1.0.0',
  add column handoff_key_id text,
  add column abuse_adapter text,
  add column erasure_policy_id text,
  add column proof_max_journeys integer,
  add column proof_max_events integer,
  add column proof_starts_at timestamptz,
  add column proof_ends_at timestamptz,
  add constraint tkid_sources_sdk_version_check check(sdk_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  add constraint tkid_sources_proof_check check((proof_max_journeys is null or proof_max_journeys between 1 and 100) and (proof_max_events is null or proof_max_events between 1 and 2000) and (proof_starts_at is null or proof_ends_at>proof_starts_at));

create table public.tkid_handoff_keys(
  id text primary key, organization_id uuid not null, source_id uuid not null, secret_reference text not null,
  state text not null default 'current', not_before timestamptz not null, not_after timestamptz not null,
  rotated_at timestamptz, revoked_at timestamptz, created_at timestamptz not null default now(),
  foreign key(organization_id,source_id) references public.tkid_sources(organization_id,id),
  check(id ~ '^tkhk_[A-Za-z0-9_-]{12,80}$'), check(secret_reference ~ '^(secret|vault)://'),
  check(state in('current','previous','revoked')), check(not_after>not_before), check((state='revoked')=(revoked_at is not null))
);
create unique index tkid_handoff_keys_current_uidx on public.tkid_handoff_keys(source_id) where state='current';

create table public.tracekit_operational_alerts(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, capability text not null,
  alert_code text not null, status text not null default 'open', severity text not null, first_observed_at timestamptz not null,
  last_observed_at timestamptz not null, occurrence_count integer not null default 1, safe_context jsonb not null default '{}',
  delivery_state text not null default 'pending_destination', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(organization_id) references public.tracekit_organizations(id),
  check(status in('open','acknowledged','resolved')), check(severity in('warning','critical')),
  check(delivery_state in('pending_destination','queued','delivered','failed')),
  check(occurrence_count>0 and jsonb_typeof(safe_context)='object' and public.financial_reconciliation_metadata_is_safe(safe_context))
);
create unique index tracekit_operational_alerts_open_uidx on public.tracekit_operational_alerts(organization_id,capability,alert_code) where status='open';

create or replace function public.commerce_schedule_permitted(p_organization_id uuid,p_connection_id uuid)
returns boolean language sql stable security invoker set search_path=public as $$
  select coalesce((select not p.paused from public.commerce_connection_pauses p where p.organization_id=p_organization_id and p.connection_id=p_connection_id),true)
    and coalesce((select c.activation_state='enabled' from public.tracekit_production_controls c where c.organization_id=p_organization_id and c.capability='commerce_scheduler'),false)
$$;

do $$ declare t text; begin foreach t in array array['tracekit_production_controls','commerce_connection_pauses','tkid_handoff_keys','tracekit_operational_alerts'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
end loop; end $$;
revoke all on function public.commerce_schedule_permitted(uuid,uuid) from public,anon,authenticated;
grant execute on function public.commerce_schedule_permitted(uuid,uuid) to service_role;

comment on table public.tracekit_production_controls is 'Organization-bound production capability controls; rows default disabled and do not activate external infrastructure.';
comment on table public.commerce_connection_pauses is 'Connection-scoped provider activity pause preserving Evidence and normalized state.';
comment on table public.tkid_handoff_keys is 'Server-only secret references and verification windows; never signing key material.';
