-- Identity Service v1: people, deterministic identifiers, audit events, and merge history.

create extension if not exists pgcrypto;

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  status text not null default 'active',
  display_name text,
  primary_email text,
  primary_phone text,
  first_name text,
  last_name text,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  merged_into_person_id uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint people_status_check check (status in ('active', 'merged', 'suppressed', 'review_required'))
);

create index if not exists people_workspace_status_idx
  on public.people (workspace_id, status, updated_at desc);

create index if not exists people_workspace_email_idx
  on public.people (workspace_id, primary_email)
  where primary_email is not null;

create index if not exists people_workspace_phone_idx
  on public.people (workspace_id, primary_phone)
  where primary_phone is not null;

create table if not exists public.person_identifiers (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  person_id uuid not null references public.people(id) on delete cascade,
  identifier_type text not null,
  raw_value text,
  normalized_value text not null,
  normalized_hash text,
  source_platform text,
  source_record_type text,
  source_record_id text,
  source_connector_id text,
  verification_status text not null default 'observed',
  confidence numeric,
  is_primary boolean not null default false,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint person_identifiers_type_check check (
    identifier_type in (
      'email',
      'phone',
      'paypal_payer_id',
      'stripe_customer_id',
      'shopify_customer_id',
      'woocommerce_customer_id',
      'checkoutchamp_customer_id',
      'fanbasis_customer_id',
      'everflow_transaction_id',
      'external_customer_id',
      'order_customer_id'
    )
  ),
  constraint person_identifiers_verification_status_check check (
    verification_status in ('observed', 'verified', 'disputed', 'deprecated')
  )
);

create unique index if not exists person_identifiers_active_value_uidx
  on public.person_identifiers (workspace_id, identifier_type, normalized_value)
  where verification_status in ('observed', 'verified');

create index if not exists person_identifiers_person_idx
  on public.person_identifiers (workspace_id, person_id, verification_status);

create index if not exists person_identifiers_hash_idx
  on public.person_identifiers (workspace_id, identifier_type, normalized_hash)
  where normalized_hash is not null;

create index if not exists person_identifiers_source_idx
  on public.person_identifiers (workspace_id, source_platform, source_record_type, source_record_id);

create table if not exists public.identity_resolution_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  person_id uuid references public.people(id) on delete set null,
  candidate_person_ids jsonb not null default '[]'::jsonb,
  input_identifiers jsonb not null default '[]'::jsonb,
  resolution_action text not null,
  resolution_reason text not null,
  confidence numeric,
  source_platform text,
  source_record_type text,
  source_record_id text,
  connector_job_id uuid references public.integration_import_jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint identity_resolution_action_check check (
    resolution_action in (
      'created_person',
      'matched_existing_person',
      'attached_identifier',
      'conflict_detected',
      'review_required',
      'manually_merged',
      'merge_reversed',
      'no_match'
    )
  )
);

create index if not exists identity_resolution_events_workspace_created_idx
  on public.identity_resolution_events (workspace_id, created_at desc);

create index if not exists identity_resolution_events_person_idx
  on public.identity_resolution_events (workspace_id, person_id, created_at desc);

create index if not exists identity_resolution_events_review_idx
  on public.identity_resolution_events (workspace_id, resolution_action, created_at desc)
  where resolution_action in ('conflict_detected', 'review_required');

create table if not exists public.person_merge_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  source_person_id uuid not null references public.people(id) on delete restrict,
  target_person_id uuid not null references public.people(id) on delete restrict,
  reason text not null,
  performed_by text,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists person_merge_history_workspace_created_idx
  on public.person_merge_history (workspace_id, created_at desc);

create index if not exists person_merge_history_source_idx
  on public.person_merge_history (workspace_id, source_person_id);

do $$
begin
  if to_regclass('public.platform_orders') is not null then
    alter table public.platform_orders
      add column if not exists workspace_id text not null default 'default',
      add column if not exists person_id uuid references public.people(id) on delete set null;

    create index if not exists platform_orders_workspace_person_idx
      on public.platform_orders (workspace_id, person_id)
      where person_id is not null;
  end if;

  if to_regclass('public.payment_transactions') is not null then
    alter table public.payment_transactions
      add column if not exists workspace_id text not null default 'default',
      add column if not exists person_id uuid references public.people(id) on delete set null;

    create index if not exists payment_transactions_workspace_person_idx
      on public.payment_transactions (workspace_id, person_id)
      where person_id is not null;
  end if;
end
$$;
