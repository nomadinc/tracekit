-- Repair shared schema drift discovered during 29Next Production certification.
-- Source of truth: the original connector migrations recovered from commit
-- 4169a63a7801557141dde1e2ef4c6dfc896d2e55.
-- Replays only idempotent/additive DDL needed by the current connector runtime.

-- BEGIN recovered commerce_subscriptions_v1
-- Provider-neutral subscription lifecycle foundation for commerce connectors.
-- Additive only: no provider activation, no scheduler changes, and no browser grants.

create table if not exists public.commerce_subscriptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  provider_subscription_id text not null,
  provider_customer_id text,
  status text not null default 'unknown',
  currency text,
  recurring_amount numeric(18,6),
  interval_unit text not null default 'unknown',
  interval_count integer,
  next_renewal_at timestamptz,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  is_test boolean not null default false,
  source_mapping_id uuid,
  evidence_id uuid,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_subscriptions_org_account_fk
    foreign key (organization_id, account_id)
    references public.tracekit_organizations (id, owning_account_id),
  constraint commerce_subscriptions_provider_account_fk
    foreign key (organization_id, connection_id, provider_account_id)
    references public.commerce_provider_accounts (organization_id, connection_id, id),
  constraint commerce_subscriptions_status_check
    check (status in ('active','past_due','canceled','retrying','paused','unknown')),
  constraint commerce_subscriptions_interval_check
    check (interval_unit in ('day','week','month','year','custom','unknown')),
  constraint commerce_subscriptions_interval_count_check
    check (interval_count is null or interval_count > 0),
  constraint commerce_subscriptions_amount_check
    check (recurring_amount is null or recurring_amount >= 0),
  constraint commerce_subscriptions_currency_check
    check (currency is null or currency ~ '^[A-Z]{3}$'),
  constraint commerce_subscriptions_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(metadata)),
  unique (connection_id, provider_account_id, provider_subscription_id)
);

create unique index if not exists commerce_subscriptions_scope_id_uidx
  on public.commerce_subscriptions (organization_id, connection_id, provider_account_id, id);
create index if not exists commerce_subscriptions_org_status_idx
  on public.commerce_subscriptions (organization_id, status, next_renewal_at);
create index if not exists commerce_subscriptions_provider_customer_idx
  on public.commerce_subscriptions (organization_id, connection_id, provider_account_id, provider_customer_id)
  where provider_customer_id is not null;

create table if not exists public.commerce_subscription_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  subscription_id uuid not null,
  provider_line_id text not null,
  provider_product_id text,
  provider_variant_id text,
  sku text,
  title text,
  quantity integer not null default 0,
  recurring_unit_amount numeric(18,6),
  currency text,
  evidence_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_subscription_lines_subscription_fk
    foreign key (organization_id, connection_id, provider_account_id, subscription_id)
    references public.commerce_subscriptions (organization_id, connection_id, provider_account_id, id)
    on delete cascade,
  constraint commerce_subscription_lines_quantity_check check (quantity >= 0),
  constraint commerce_subscription_lines_amount_check
    check (recurring_unit_amount is null or recurring_unit_amount >= 0),
  constraint commerce_subscription_lines_currency_check
    check (currency is null or currency ~ '^[A-Z]{3}$'),
  constraint commerce_subscription_lines_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(metadata)),
  unique (subscription_id, provider_line_id)
);

create table if not exists public.commerce_subscription_order_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  subscription_id uuid not null,
  provider_order_id text not null,
  canonical_order_id uuid,
  billing_cycle integer,
  evidence_id uuid,
  observed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_subscription_order_links_subscription_fk
    foreign key (organization_id, connection_id, provider_account_id, subscription_id)
    references public.commerce_subscriptions (organization_id, connection_id, provider_account_id, id)
    on delete cascade,
  constraint commerce_subscription_order_links_cycle_check
    check (billing_cycle is null or billing_cycle >= 0),
  constraint commerce_subscription_order_links_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(metadata)),
  unique (subscription_id, provider_order_id)
);

create index if not exists commerce_subscription_order_links_order_idx
  on public.commerce_subscription_order_links (organization_id, connection_id, provider_account_id, provider_order_id);

revoke all on public.commerce_subscriptions from anon, authenticated;
revoke all on public.commerce_subscription_lines from anon, authenticated;
revoke all on public.commerce_subscription_order_links from anon, authenticated;
grant select, insert, update, delete on public.commerce_subscriptions to service_role;
grant select, insert, update, delete on public.commerce_subscription_lines to service_role;
grant select, insert, update, delete on public.commerce_subscription_order_links to service_role;

-- END recovered commerce_subscriptions_v1

-- BEGIN recovered generalize_commerce_dispute_observations
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

-- END recovered generalize_commerce_dispute_observations
