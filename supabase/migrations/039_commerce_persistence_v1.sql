-- TraceKit Commerce Persistence v1.
--
-- Establishes the provider-neutral, tenant-owned persistence foundation used by
-- Commas and future commerce adapters. This migration stores no provider
-- credentials in plaintext, ingests no provider records, and activates no live
-- repositories. Browser roles receive no direct access: authenticated server
-- code remains responsible for membership, capability, and resource checks.

create extension if not exists pgcrypto;

-- Composite ownership keys let every commerce child prove that its parent
-- belongs to the same Account or Organization without trusting caller scope.
create unique index if not exists tracekit_organizations_account_id_uidx
  on public.tracekit_organizations (owning_account_id, id);
create unique index if not exists tracekit_organizations_id_account_uidx
  on public.tracekit_organizations (id, owning_account_id);

create table public.tracekit_business_contexts (
  id text primary key,
  account_id uuid not null,
  organization_id uuid not null,
  name text not null,
  status text not null default 'active',
  fulfillment_type text not null default 'unknown',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tracekit_business_contexts_organization_account_fk
    foreign key (organization_id, account_id)
    references public.tracekit_organizations (id, owning_account_id),
  constraint tracekit_business_contexts_status_check
    check (status in ('active', 'disabled', 'archived')),
  constraint tracekit_business_contexts_fulfillment_check
    check (fulfillment_type in ('unknown', 'digital', 'physical', 'hybrid')),
  constraint tracekit_business_contexts_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(metadata))
);

create unique index tracekit_business_contexts_org_id_uidx
  on public.tracekit_business_contexts (organization_id, id);

-- Migration 038 stored access grants before a persistent context catalog
-- existed. Preserve already-issued grants during upgrade, while requiring all
-- new grants to reference the single canonical catalog. Sprint 2.1 must backfill
-- and validate this constraint before live repository activation.
alter table public.tracekit_business_context_access
  add constraint tracekit_business_context_access_context_fk
  foreign key (organization_id, business_context_id)
  references public.tracekit_business_contexts (organization_id, id)
  not valid;

create table public.commerce_provider_connections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  organization_id uuid not null,
  provider text not null,
  display_name text not null,
  environment text not null default 'production',
  status text not null default 'draft',
  external_account_id text,
  capabilities jsonb not null default '{}'::jsonb,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_provider_connections_organization_account_fk
    foreign key (organization_id, account_id)
    references public.tracekit_organizations (id, owning_account_id),
  constraint commerce_provider_connections_provider_check
    check (provider ~ '^[a-z][a-z0-9_]*$'),
  constraint commerce_provider_connections_environment_check
    check (environment in ('sandbox', 'staging', 'production')),
  constraint commerce_provider_connections_status_check
    check (status in ('draft', 'connected', 'degraded', 'disabled', 'revoked')),
  constraint commerce_provider_connections_capabilities_safe_check
    check (public.financial_reconciliation_metadata_is_safe(capabilities)),
  constraint commerce_provider_connections_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(metadata))
);

create unique index commerce_provider_connections_org_id_uidx
  on public.commerce_provider_connections (organization_id, id);
create index commerce_provider_connections_org_provider_idx
  on public.commerce_provider_connections (organization_id, provider, status);
create unique index commerce_provider_connections_external_account_uidx
  on public.commerce_provider_connections (organization_id, provider, environment, external_account_id)
  where external_account_id is not null;

create table public.commerce_provider_accounts (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null,
  organization_id uuid not null,
  provider_account_external_id text not null,
  provider_account_label text,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_provider_accounts_connection_fk
    foreign key (organization_id, connection_id)
    references public.commerce_provider_connections (organization_id, id)
    on delete cascade,
  constraint commerce_provider_accounts_status_check
    check (status in ('active', 'degraded', 'disabled', 'revoked')),
  constraint commerce_provider_accounts_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(metadata)),
  unique (connection_id, provider_account_external_id)
);

create unique index commerce_provider_accounts_scope_id_uidx
  on public.commerce_provider_accounts (organization_id, connection_id, id);
create unique index commerce_provider_accounts_org_id_uidx
  on public.commerce_provider_accounts (organization_id, id);

-- AES-GCM ciphertext or a managed-secret reference may be stored here. The
-- application must never put a plaintext secret in public_metadata.
create table public.commerce_provider_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  credential_type text not null,
  storage_backend text not null default 'database_encrypted',
  secret_reference text,
  encryption_key_id text,
  encryption_version integer,
  secret_iv bytea,
  secret_ciphertext bytea,
  public_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint commerce_provider_credentials_connection_fk
    foreign key (organization_id, connection_id)
    references public.commerce_provider_connections (organization_id, id),
  constraint commerce_provider_credentials_backend_check
    check (storage_backend in ('database_encrypted', 'managed_secret')),
  constraint commerce_provider_credentials_material_check check (
    (storage_backend = 'database_encrypted'
      and secret_reference is null
      and encryption_key_id is not null
      and encryption_version is not null
      and secret_iv is not null
      and secret_ciphertext is not null)
    or
    (storage_backend = 'managed_secret'
      and secret_reference is not null
      and encryption_key_id is null
      and encryption_version is null
      and secret_iv is null
      and secret_ciphertext is null)
  ),
  constraint commerce_provider_credentials_public_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(public_metadata))
);

-- Rotation creates a new row after revoking the prior row. History is retained;
-- at most one credential version may be active for a Connection.
create unique index commerce_provider_credentials_active_connection_uidx
  on public.commerce_provider_credentials (connection_id)
  where revoked_at is null;
create index commerce_provider_credentials_connection_history_idx
  on public.commerce_provider_credentials (connection_id, created_at desc);

-- Credential material is versioned, never replaced in place. Rotation may only
-- transition an active row to revoked while recording its rotation timestamp.
create or replace function public.commerce_provider_credential_version_guard()
returns trigger
language plpgsql
as $$
begin
  if old.revoked_at is null
    and new.revoked_at is not null
    and (to_jsonb(new) - array['revoked_at', 'rotated_at', 'updated_at'])
      = (to_jsonb(old) - array['revoked_at', 'rotated_at', 'updated_at']) then
    return new;
  end if;

  raise exception 'commerce provider credential versions are immutable; rotate by revoking and inserting a new row'
    using errcode = '55000';
end;
$$;

create trigger commerce_provider_credential_version_guard_trigger
before update on public.commerce_provider_credentials
for each row execute function public.commerce_provider_credential_version_guard();

create table public.commerce_sync_runs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null,
  provider_account_id uuid not null,
  organization_id uuid not null,
  sync_type text not null,
  mode text not null,
  status text not null default 'queued',
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  requested_by_user_id uuid references public.tracekit_users(id) on delete set null,
  source_total_items bigint,
  pages_planned integer,
  pages_completed integer not null default 0,
  records_seen bigint not null default 0,
  records_created bigint not null default 0,
  records_updated bigint not null default 0,
  records_unchanged bigint not null default 0,
  records_failed bigint not null default 0,
  warnings_count bigint not null default 0,
  last_error_code text,
  last_error_summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_sync_runs_provider_account_fk
    foreign key (organization_id, connection_id, provider_account_id)
    references public.commerce_provider_accounts (organization_id, connection_id, id),
  constraint commerce_sync_runs_type_check
    check (sync_type ~ '^[a-z][a-z0-9_]*$'),
  constraint commerce_sync_runs_mode_check
    check (mode in ('discovery', 'shadow', 'live_beta', 'live', 'reconciliation', 'historical_backfill')),
  constraint commerce_sync_runs_status_check
    check (status in ('queued', 'running', 'paused', 'completed', 'completed_with_warnings', 'failed', 'cancelled')),
  constraint commerce_sync_runs_counts_check check (
    source_total_items is null or source_total_items >= 0
  ),
  constraint commerce_sync_runs_progress_check check (
    (pages_planned is null or pages_planned >= 0)
    and pages_completed >= 0
    and records_seen >= 0
    and records_created >= 0
    and records_updated >= 0
    and records_unchanged >= 0
    and records_failed >= 0
    and warnings_count >= 0
  ),
  constraint commerce_sync_runs_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(metadata))
);

create unique index commerce_sync_runs_scope_id_uidx
  on public.commerce_sync_runs (organization_id, connection_id, provider_account_id, id);
create index commerce_sync_runs_connection_status_idx
  on public.commerce_sync_runs (connection_id, status, created_at desc);

create table public.commerce_sync_checkpoints (
  id uuid primary key default gen_random_uuid(),
  sync_run_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  organization_id uuid not null,
  resource text not null,
  page integer not null,
  per_page integer not null,
  source_total_items bigint,
  source_total_pages integer,
  page_fingerprint text,
  first_source_id text,
  last_source_id text,
  completed_at timestamptz,
  retry_count integer not null default 0,
  state text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_sync_checkpoints_run_fk
    foreign key (organization_id, connection_id, provider_account_id, sync_run_id)
    references public.commerce_sync_runs (organization_id, connection_id, provider_account_id, id)
    on delete cascade,
  constraint commerce_sync_checkpoints_resource_check
    check (resource ~ '^[a-z][a-z0-9_]*$'),
  constraint commerce_sync_checkpoints_page_check
    check (page >= 1 and per_page >= 1),
  constraint commerce_sync_checkpoints_counts_check check (
    (source_total_items is null or source_total_items >= 0)
    and (source_total_pages is null or source_total_pages >= 0)
    and retry_count >= 0
  ),
  constraint commerce_sync_checkpoints_state_check
    check (state in ('pending', 'running', 'completed', 'failed', 'superseded')),
  constraint commerce_sync_checkpoints_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(metadata)),
  unique (sync_run_id, resource, page, per_page)
);

create table public.commerce_evidence_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  sync_run_id uuid not null,
  source_object_type text not null,
  source_object_id text not null,
  payload_hash text not null,
  storage_backend text not null,
  storage_reference text not null,
  content_type text not null default 'application/json',
  byte_size bigint not null,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  observed_at timestamptz not null,
  ingestion_at timestamptz not null default now(),
  normalizer_version text,
  mapping_version text,
  pii_classification text not null,
  retention_policy text not null,
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint commerce_evidence_records_provider_account_fk
    foreign key (organization_id, connection_id, provider_account_id)
    references public.commerce_provider_accounts (organization_id, connection_id, id),
  constraint commerce_evidence_records_sync_run_fk
    foreign key (organization_id, connection_id, provider_account_id, sync_run_id)
    references public.commerce_sync_runs (organization_id, connection_id, provider_account_id, id),
  constraint commerce_evidence_records_source_type_check
    check (source_object_type ~ '^[a-z][a-z0-9_]*$'),
  constraint commerce_evidence_records_backend_check
    check (storage_backend in ('object_storage', 'managed_evidence_store')),
  constraint commerce_evidence_records_byte_size_check
    check (byte_size >= 0),
  constraint commerce_evidence_records_pii_check
    check (pii_classification in ('none', 'restricted', 'sensitive', 'highly_sensitive')),
  constraint commerce_evidence_records_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(metadata)),
  unique (connection_id, provider_account_id, source_object_type, source_object_id, payload_hash),
  unique (storage_backend, storage_reference)
);

create unique index commerce_evidence_records_org_id_uidx
  on public.commerce_evidence_records (organization_id, id);

create or replace function public.commerce_evidence_immutable_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'commerce evidence records cannot be deleted; use the controlled deleted_at erasure marker'
      using errcode = '55000';
  end if;

  if old.deleted_at is null
    and new.deleted_at is not null
    and (to_jsonb(new) - 'deleted_at') = (to_jsonb(old) - 'deleted_at') then
    return new;
  end if;

  raise exception 'commerce evidence records are immutable'
    using errcode = '55000';
end;
$$;

create trigger commerce_evidence_immutable_guard_trigger
before update or delete on public.commerce_evidence_records
for each row execute function public.commerce_evidence_immutable_guard();

create table public.commerce_source_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  source_object_type text not null,
  source_object_id text not null,
  canonical_object_type text not null,
  canonical_object_id uuid not null,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  payload_hash text not null,
  mapping_version text not null,
  state text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_source_mappings_provider_account_fk
    foreign key (organization_id, connection_id, provider_account_id)
    references public.commerce_provider_accounts (organization_id, connection_id, id),
  constraint commerce_source_mappings_source_type_check
    check (source_object_type ~ '^[a-z][a-z0-9_]*$'),
  constraint commerce_source_mappings_canonical_type_check
    check (canonical_object_type in ('person', 'order', 'provider_product', 'canonical_offer', 'refund', 'dispute', 'financial_event')),
  constraint commerce_source_mappings_state_check
    check (state in ('active', 'superseded', 'review_required', 'rejected')),
  constraint commerce_source_mappings_seen_check
    check (last_seen_at >= first_seen_at),
  constraint commerce_source_mappings_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(metadata)),
  unique (connection_id, provider_account_id, source_object_type, source_object_id)
);

create unique index commerce_source_mappings_org_id_uidx
  on public.commerce_source_mappings (organization_id, id);

create table public.canonical_offers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  organization_id uuid not null,
  business_context_id text not null,
  name text not null,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint canonical_offers_organization_account_fk
    foreign key (organization_id, account_id)
    references public.tracekit_organizations (id, owning_account_id),
  constraint canonical_offers_business_context_fk
    foreign key (organization_id, business_context_id)
    references public.tracekit_business_contexts (organization_id, id),
  constraint canonical_offers_status_check
    check (status in ('active', 'disabled', 'retired')),
  constraint canonical_offers_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(metadata))
);

create unique index canonical_offers_org_id_uidx
  on public.canonical_offers (organization_id, id);
create unique index canonical_offers_context_id_uidx
  on public.canonical_offers (organization_id, business_context_id, id);

create table public.offer_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  canonical_offer_id uuid not null,
  role text not null,
  sequence integer,
  label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offer_steps_offer_fk
    foreign key (organization_id, canonical_offer_id)
    references public.canonical_offers (organization_id, id)
    on delete cascade,
  constraint offer_steps_role_check
    check (role in ('front_end', 'order_bump', 'upsell', 'downsell', 'subscription', 'trial', 'renewal')),
  constraint offer_steps_sequence_check
    check (sequence is null or sequence >= 0),
  constraint offer_steps_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(metadata))
);

create unique index offer_steps_org_id_uidx
  on public.offer_steps (organization_id, id);
create unique index offer_steps_offer_id_uidx
  on public.offer_steps (organization_id, canonical_offer_id, id);
create unique index offer_steps_offer_role_sequence_uidx
  on public.offer_steps (canonical_offer_id, role, coalesce(sequence, -1));

create table public.offer_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  offer_step_id uuid not null,
  kind text not null,
  sequence integer,
  label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offer_variants_step_fk
    foreign key (organization_id, offer_step_id)
    references public.offer_steps (organization_id, id)
    on delete cascade,
  constraint offer_variants_kind_check
    check (kind in ('standard', 'discount', 'alternate_funnel', 'price_variant')),
  constraint offer_variants_sequence_check
    check (sequence is null or sequence >= 0),
  constraint offer_variants_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(metadata))
);

create unique index offer_variants_org_id_uidx
  on public.offer_variants (organization_id, id);
create unique index offer_variants_step_id_uidx
  on public.offer_variants (organization_id, offer_step_id, id);

create table public.commerce_provider_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  provider_product_id text not null,
  title text not null,
  internal_name text,
  description text,
  currency text,
  first_observed_price numeric,
  latest_observed_price numeric,
  payment_link_hash text,
  evidence_id uuid,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  mapping_status text not null default 'observed',
  canonical_offer_id uuid,
  offer_step_id uuid,
  offer_variant_id uuid,
  business_context_id text,
  mapping_version text,
  mapping_confidence numeric,
  reviewed_by_user_id uuid references public.tracekit_users(id) on delete set null,
  reviewed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_provider_products_provider_account_fk
    foreign key (organization_id, connection_id, provider_account_id)
    references public.commerce_provider_accounts (organization_id, connection_id, id),
  constraint commerce_provider_products_evidence_fk
    foreign key (organization_id, evidence_id)
    references public.commerce_evidence_records (organization_id, id),
  constraint commerce_provider_products_offer_hierarchy_fk
    foreign key (organization_id, business_context_id, canonical_offer_id)
    references public.canonical_offers (organization_id, business_context_id, id),
  constraint commerce_provider_products_step_hierarchy_fk
    foreign key (organization_id, canonical_offer_id, offer_step_id)
    references public.offer_steps (organization_id, canonical_offer_id, id),
  constraint commerce_provider_products_variant_hierarchy_fk
    foreign key (organization_id, offer_step_id, offer_variant_id)
    references public.offer_variants (organization_id, offer_step_id, id),
  constraint commerce_provider_products_currency_check
    check (currency is null or currency ~ '^[A-Z]{3}$'),
  constraint commerce_provider_products_price_check
    check ((first_observed_price is null or first_observed_price >= 0)
      and (latest_observed_price is null or latest_observed_price >= 0)),
  constraint commerce_provider_products_mapping_status_check
    check (mapping_status in ('observed', 'proposed', 'review_required', 'approved', 'rejected', 'retired')),
  constraint commerce_provider_products_mapping_hierarchy_presence_check check (
    (canonical_offer_id is null or business_context_id is not null)
    and (offer_step_id is null or canonical_offer_id is not null)
    and (offer_variant_id is null or offer_step_id is not null)
  ),
  constraint commerce_provider_products_approved_mapping_check check (
    mapping_status <> 'approved'
    or (canonical_offer_id is not null and offer_step_id is not null and business_context_id is not null
      and reviewed_by_user_id is not null and reviewed_at is not null)
  ),
  constraint commerce_provider_products_confidence_check
    check (mapping_confidence is null or (mapping_confidence >= 0 and mapping_confidence <= 1)),
  constraint commerce_provider_products_seen_check
    check (last_seen_at >= first_seen_at),
  constraint commerce_provider_products_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(metadata)),
  unique (connection_id, provider_account_id, provider_product_id)
);

create unique index commerce_provider_products_org_id_uidx
  on public.commerce_provider_products (organization_id, id);

-- The provider customer ID is authoritative only inside its Connection. Email
-- and phone may be stored as supporting evidence, but never as global merge keys.
alter table public.people
  add column if not exists organization_id uuid references public.tracekit_organizations(id);
create unique index if not exists people_organization_id_uidx
  on public.people (organization_id, id);

create table public.person_source_identities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  person_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  source_type text not null,
  source_id text not null,
  normalized_value text,
  confidence numeric,
  status text not null default 'observed',
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  evidence_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint person_source_identities_person_fk
    foreign key (organization_id, person_id)
    references public.people (organization_id, id),
  constraint person_source_identities_provider_account_fk
    foreign key (organization_id, connection_id, provider_account_id)
    references public.commerce_provider_accounts (organization_id, connection_id, id),
  constraint person_source_identities_evidence_fk
    foreign key (organization_id, evidence_id)
    references public.commerce_evidence_records (organization_id, id),
  constraint person_source_identities_source_type_check
    check (source_type in ('provider_customer_id', 'email', 'phone')),
  constraint person_source_identities_confidence_check
    check (confidence is null or (confidence >= 0 and confidence <= 1)),
  constraint person_source_identities_status_check
    check (status in ('observed', 'verified', 'disputed', 'deprecated', 'review_required')),
  constraint person_source_identities_seen_check
    check (last_seen_at >= first_seen_at),
  constraint person_source_identities_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(metadata))
);

create unique index person_source_identities_provider_customer_uidx
  on public.person_source_identities (connection_id, provider_account_id, source_type, source_id)
  where source_type = 'provider_customer_id';
create index person_source_identities_supporting_value_idx
  on public.person_source_identities (organization_id, source_type, normalized_value)
  where normalized_value is not null;

-- platform_orders remains the compatibility Order snapshot. New Commas rows
-- must supply these tenant and provenance columns; legacy rows remain readable.
alter table public.platform_orders
  alter column currency drop not null,
  add column if not exists canonical_order_id uuid,
  add column if not exists account_id uuid references public.tracekit_accounts(id),
  add column if not exists organization_id uuid references public.tracekit_organizations(id),
  add column if not exists connection_id uuid references public.commerce_provider_connections(id),
  add column if not exists provider_account_id uuid references public.commerce_provider_accounts(id),
  add column if not exists business_context_id text references public.tracekit_business_contexts(id),
  add column if not exists source_mapping_id uuid references public.commerce_source_mappings(id),
  add column if not exists evidence_id uuid references public.commerce_evidence_records(id),
  add column if not exists provider_product_id uuid references public.commerce_provider_products(id),
  add column if not exists provider_fee numeric,
  add column if not exists provider_net numeric,
  add column if not exists payment_reference text,
  add column if not exists payment_type text,
  add column if not exists fund_release_on timestamptz,
  add column if not exists fund_released boolean,
  add column if not exists reconciliation_state text not null default 'unreconciled',
  add column if not exists data_quality_state text not null default 'legacy_unverified';

alter table public.platform_orders
  add constraint platform_orders_canonical_order_id_key unique (canonical_order_id),
  add constraint platform_orders_reconciliation_state_check
    check (reconciliation_state in ('unreconciled', 'estimated', 'observed', 'reconciled', 'conflict')) not valid,
  add constraint platform_orders_data_quality_state_check
    check (data_quality_state in ('legacy_unverified', 'observed', 'review_required', 'verified', 'invalid')) not valid,
  add constraint platform_orders_currency_v1_check
    check (currency is null or currency ~ '^[A-Z]{3}$') not valid,
  add constraint platform_orders_connection_scope_fk
    foreign key (organization_id, connection_id)
    references public.commerce_provider_connections (organization_id, id) not valid,
  add constraint platform_orders_organization_account_fk
    foreign key (organization_id, account_id)
    references public.tracekit_organizations (id, owning_account_id) not valid,
  add constraint platform_orders_provider_account_scope_fk
    foreign key (organization_id, connection_id, provider_account_id)
    references public.commerce_provider_accounts (organization_id, connection_id, id) not valid,
  add constraint platform_orders_business_context_scope_fk
    foreign key (organization_id, business_context_id)
    references public.tracekit_business_contexts (organization_id, id) not valid,
  add constraint platform_orders_source_mapping_scope_fk
    foreign key (organization_id, source_mapping_id)
    references public.commerce_source_mappings (organization_id, id) not valid,
  add constraint platform_orders_evidence_scope_fk
    foreign key (organization_id, evidence_id)
    references public.commerce_evidence_records (organization_id, id) not valid,
  add constraint platform_orders_provider_product_scope_fk
    foreign key (organization_id, provider_product_id)
    references public.commerce_provider_products (organization_id, id) not valid;

create index platform_orders_commerce_scope_idx
  on public.platform_orders (organization_id, connection_id, business_context_id, order_ts desc)
  where organization_id is not null;
create unique index platform_orders_commerce_source_mapping_uidx
  on public.platform_orders (organization_id, source_mapping_id)
  where source_mapping_id is not null;

-- conversions remains the append-only financial-event ledger. New provider
-- events gain tenant/provenance/idempotency keys without rewriting legacy rows.
alter table public.conversions
  alter column currency drop default,
  add column if not exists account_id uuid references public.tracekit_accounts(id),
  add column if not exists organization_id uuid references public.tracekit_organizations(id),
  add column if not exists connection_id uuid references public.commerce_provider_connections(id),
  add column if not exists provider_account_id uuid references public.commerce_provider_accounts(id),
  add column if not exists source_mapping_id uuid references public.commerce_source_mappings(id),
  add column if not exists evidence_id uuid references public.commerce_evidence_records(id),
  add column if not exists canonical_order_id uuid references public.platform_orders(canonical_order_id),
  add column if not exists idempotency_key text,
  add column if not exists reconciliation_state text not null default 'unreconciled',
  add column if not exists data_quality_state text not null default 'legacy_unverified';

alter table public.conversions drop constraint conversions_ledger_type_check;
alter table public.conversions
  add constraint conversions_ledger_type_check check (ledger_type = any (array[
    'sale', 'provider_fee', 'expected_funds', 'released_funds', 'refund', 'refund_fee',
    'chargeback', 'chargeback_fee', 'chargeback_reversal', 'chargeback_fee_reversal',
    'processor_fee', 'bank_fee', 'shipping_cost', 'tax', 'cogs', 'affiliate_payout',
    'ad_spend', 'reversal', 'adjustment'
  ])) not valid,
  add constraint conversions_reconciliation_state_v1_check
    check (reconciliation_state in ('unreconciled', 'estimated', 'observed', 'reconciled', 'conflict')) not valid,
  add constraint conversions_data_quality_state_v1_check
    check (data_quality_state in ('legacy_unverified', 'observed', 'review_required', 'verified', 'invalid')) not valid,
  add constraint conversions_currency_v1_check
    check (currency is null or currency ~ '^[A-Z]{3}$') not valid,
  add constraint conversions_connection_scope_fk
    foreign key (organization_id, connection_id)
    references public.commerce_provider_connections (organization_id, id) not valid,
  add constraint conversions_organization_account_fk
    foreign key (organization_id, account_id)
    references public.tracekit_organizations (id, owning_account_id) not valid,
  add constraint conversions_provider_account_scope_fk
    foreign key (organization_id, connection_id, provider_account_id)
    references public.commerce_provider_accounts (organization_id, connection_id, id) not valid,
  add constraint conversions_source_mapping_scope_fk
    foreign key (organization_id, source_mapping_id)
    references public.commerce_source_mappings (organization_id, id) not valid,
  add constraint conversions_evidence_scope_fk
    foreign key (organization_id, evidence_id)
    references public.commerce_evidence_records (organization_id, id) not valid;

create unique index conversions_commerce_idempotency_uidx
  on public.conversions (organization_id, connection_id, provider_account_id, idempotency_key)
  where organization_id is not null and connection_id is not null
    and provider_account_id is not null and idempotency_key is not null;
create index conversions_commerce_order_idx
  on public.conversions (organization_id, canonical_order_id, occurred_at desc)
  where organization_id is not null;

create table public.commerce_repository_activation (
  organization_id uuid not null,
  workspace text not null,
  mode text not null default 'mock',
  connection_id uuid,
  activated_by_user_id uuid references public.tracekit_users(id) on delete set null,
  activated_at timestamptz,
  rollback_reason text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (organization_id, workspace),
  constraint commerce_repository_activation_organization_fk
    foreign key (organization_id) references public.tracekit_organizations(id),
  constraint commerce_repository_activation_connection_fk
    foreign key (organization_id, connection_id)
    references public.commerce_provider_connections (organization_id, id),
  constraint commerce_repository_activation_workspace_check
    check (workspace in ('mission_control', 'offers', 'customers', 'orders', 'money', 'operations', 'settings')),
  constraint commerce_repository_activation_mode_check
    check (mode in ('mock', 'shadow', 'live_beta', 'live')),
  constraint commerce_repository_activation_connection_required_check
    check (mode = 'mock' or connection_id is not null),
  constraint commerce_repository_activation_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(metadata))
);

-- Browser-facing roles have no direct tenant-table access. Service-role access
-- remains server-only and must be preceded by TraceKit authorization checks.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tracekit_business_contexts',
    'commerce_provider_connections',
    'commerce_provider_accounts',
    'commerce_provider_credentials',
    'commerce_sync_runs',
    'commerce_sync_checkpoints',
    'commerce_evidence_records',
    'commerce_source_mappings',
    'canonical_offers',
    'offer_steps',
    'offer_variants',
    'commerce_provider_products',
    'person_source_identities',
    'commerce_repository_activation',
    'people',
    'person_identifiers',
    'platform_orders',
    'conversions'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
  end loop;
end $$;

comment on table public.commerce_provider_credentials is
  'Server-only encrypted credential material or managed secret references. Never plaintext.';
comment on table public.commerce_evidence_records is
  'Immutable protected-payload references and hashes; raw provider payloads are stored outside read models.';
comment on table public.commerce_repository_activation is
  'Server-controlled per-Organization Workspace rollout. No browser or query-string activation.';
comment on column public.platform_orders.provider_fee is 'Provider-observed fee; not final processing cost.';
comment on column public.platform_orders.provider_net is 'Net proceeds; never labeled Profit.';
