-- Provider-neutral dispute observations for API and webhook ingestion.
-- Existing webhook rows remain valid; this only permits canonical provider disputes
-- to be sourced from immutable API evidence without fabricating webhook events.

create table if not exists public.commerce_provider_dispute_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  account_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  provider text not null,
  provider_dispute_id text not null,
  source_kind text not null check (source_kind in ('api','webhook')),
  provider_event_id text,
  evidence_id uuid not null,
  payload_hash text not null,
  observed_at timestamptz not null default now(),
  source_created_at timestamptz,
  source_updated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint commerce_provider_dispute_observations_account_fk
    foreign key (organization_id, account_id)
    references public.tracekit_organizations(id, owning_account_id),
  constraint commerce_provider_dispute_observations_scope_fk
    foreign key (organization_id, connection_id, provider_account_id)
    references public.commerce_provider_accounts(organization_id, connection_id, id),
  constraint commerce_provider_dispute_observations_evidence_fk
    foreign key (organization_id, evidence_id)
    references public.commerce_evidence_records(organization_id, id),
  constraint commerce_provider_dispute_observations_provider_check
    check (provider ~ '^[a-z][a-z0-9_]*$'),
  constraint commerce_provider_dispute_observations_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(metadata)),
  unique (connection_id, provider_account_id, provider, provider_dispute_id, payload_hash)
);

create unique index if not exists commerce_provider_dispute_observations_scope_id_uidx
  on public.commerce_provider_dispute_observations(organization_id, connection_id, provider_account_id, id);
create index if not exists commerce_provider_dispute_observations_dispute_idx
  on public.commerce_provider_dispute_observations(organization_id, connection_id, provider_dispute_id, observed_at desc);

alter table public.commerce_provider_disputes
  add column if not exists latest_observation_id uuid;

alter table public.commerce_provider_disputes
  alter column latest_event_id drop not null;

alter table public.commerce_provider_disputes
  drop constraint if exists commerce_provider_disputes_latest_observation_fk;
alter table public.commerce_provider_disputes
  add constraint commerce_provider_disputes_latest_observation_fk
  foreign key (organization_id, connection_id, provider_account_id, latest_observation_id)
  references public.commerce_provider_dispute_observations(organization_id, connection_id, provider_account_id, id);

alter table public.commerce_provider_disputes
  drop constraint if exists commerce_provider_disputes_provenance_check;
alter table public.commerce_provider_disputes
  add constraint commerce_provider_disputes_provenance_check
  check (latest_event_id is not null or latest_observation_id is not null);

alter table public.commerce_provider_dispute_lifecycle_events
  add column if not exists observation_id uuid;
alter table public.commerce_provider_dispute_lifecycle_events
  alter column webhook_event_id drop not null;
alter table public.commerce_provider_dispute_lifecycle_events
  drop constraint if exists commerce_provider_dispute_lifecycle_observation_fk;
alter table public.commerce_provider_dispute_lifecycle_events
  add constraint commerce_provider_dispute_lifecycle_observation_fk
  foreign key (organization_id, connection_id, provider_account_id, observation_id)
  references public.commerce_provider_dispute_observations(organization_id, connection_id, provider_account_id, id);
alter table public.commerce_provider_dispute_lifecycle_events
  drop constraint if exists commerce_provider_dispute_lifecycle_provenance_check;
alter table public.commerce_provider_dispute_lifecycle_events
  add constraint commerce_provider_dispute_lifecycle_provenance_check
  check (webhook_event_id is not null or observation_id is not null);

create unique index if not exists commerce_provider_dispute_lifecycle_observation_uidx
  on public.commerce_provider_dispute_lifecycle_events(observation_id)
  where observation_id is not null;

alter table public.commerce_provider_dispute_observations enable row level security;
revoke all on public.commerce_provider_dispute_observations from public, anon, authenticated;
grant select, insert on public.commerce_provider_dispute_observations to service_role;
