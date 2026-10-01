-- TraceKit Marketing / Advertising Foundation v1.
--
-- Additive provider-neutral persistence for paid-media connectors. Meta is the
-- first provider, but the schema intentionally models the common hierarchy as
-- Connection -> Provider Account -> Campaign -> Ad Group -> Ad -> Creative.
--
-- This migration performs no provider API calls, stores no plaintext secrets,
-- activates no schedules, and grants no browser-role access to these tables.
-- Provider credentials belong to the authorization Connection. One Connection
-- may expose many independently selected and synchronized Provider Accounts.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Connections and provider advertising accounts
-- ---------------------------------------------------------------------------

create table public.marketing_provider_connections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  organization_id uuid not null,
  provider text not null,
  display_name text not null,
  environment text not null default 'production',
  status text not null default 'draft',
  provider_identity_id text,
  capabilities jsonb not null default '{}'::jsonb,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_code text,
  reauthorization_required boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_provider_connections_organization_account_fk
    foreign key (organization_id, account_id)
    references public.tracekit_organizations (id, owning_account_id),
  constraint marketing_provider_connections_provider_check
    check (provider ~ '^[a-z][a-z0-9_]*$'),
  constraint marketing_provider_connections_environment_check
    check (environment in ('sandbox', 'staging', 'production')),
  constraint marketing_provider_connections_status_check
    check (status in ('draft', 'connected', 'degraded', 'disabled', 'revoked')),
  constraint marketing_provider_connections_capabilities_safe_check
    check (public.financial_reconciliation_metadata_is_safe(capabilities)),
  constraint marketing_provider_connections_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(metadata))
);

create unique index marketing_provider_connections_org_id_uidx
  on public.marketing_provider_connections (organization_id, id);
create index marketing_provider_connections_org_provider_idx
  on public.marketing_provider_connections (organization_id, provider, status);

create table public.marketing_provider_accounts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  organization_id uuid not null,
  connection_id uuid not null,
  provider text not null,
  provider_account_external_id text not null,
  provider_account_label text,
  currency text,
  timezone_name text,
  timezone_offset_minutes integer,
  status text not null default 'active',
  selected_for_sync boolean not null default false,
  first_discovered_at timestamptz not null default now(),
  last_discovered_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_provider_accounts_organization_account_fk
    foreign key (organization_id, account_id)
    references public.tracekit_organizations (id, owning_account_id),
  constraint marketing_provider_accounts_connection_fk
    foreign key (organization_id, connection_id)
    references public.marketing_provider_connections (organization_id, id),
  constraint marketing_provider_accounts_provider_check
    check (provider ~ '^[a-z][a-z0-9_]*$'),
  constraint marketing_provider_accounts_currency_check
    check (currency is null or currency ~ '^[A-Z]{3}$'),
  constraint marketing_provider_accounts_status_check
    check (status in ('active', 'degraded', 'disabled', 'revoked')),
  constraint marketing_provider_accounts_discovery_check
    check (last_discovered_at >= first_discovered_at),
  constraint marketing_provider_accounts_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(metadata)),
  unique (connection_id, provider_account_external_id)
);

create unique index marketing_provider_accounts_scope_id_uidx
  on public.marketing_provider_accounts (organization_id, connection_id, id);
create unique index marketing_provider_accounts_org_id_uidx
  on public.marketing_provider_accounts (organization_id, id);
create index marketing_provider_accounts_selected_idx
  on public.marketing_provider_accounts (organization_id, connection_id, selected_for_sync, status);

-- Credentials are versioned at the Connection level. Never duplicate a provider
-- token per advertising account. Plaintext secrets are never persisted here.
create table public.marketing_provider_credentials (
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
  constraint marketing_provider_credentials_connection_fk
    foreign key (organization_id, connection_id)
    references public.marketing_provider_connections (organization_id, id),
  constraint marketing_provider_credentials_backend_check
    check (storage_backend in ('database_encrypted', 'managed_secret')),
  constraint marketing_provider_credentials_material_check check (
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
  constraint marketing_provider_credentials_public_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(public_metadata))
);

create unique index marketing_provider_credentials_active_connection_uidx
  on public.marketing_provider_credentials (connection_id)
  where revoked_at is null;
create index marketing_provider_credentials_connection_history_idx
  on public.marketing_provider_credentials (connection_id, created_at desc);

create or replace function public.marketing_provider_credential_version_guard()
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

  raise exception 'marketing provider credential versions are immutable; rotate by revoking and inserting a new row'
    using errcode = '55000';
end;
$$;

create trigger marketing_provider_credential_version_guard_trigger
before update on public.marketing_provider_credentials
for each row execute function public.marketing_provider_credential_version_guard();

-- ---------------------------------------------------------------------------
-- Provider-neutral advertising hierarchy
-- ---------------------------------------------------------------------------

create table public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  provider text not null,
  provider_campaign_id text not null,
  name text,
  configured_status text,
  effective_status text,
  objective text,
  buying_type text,
  budget_amount numeric,
  budget_type text,
  spend_cap numeric,
  currency text,
  provider_created_at timestamptz,
  provider_updated_at timestamptz,
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  raw_payload_hash text,
  normalizer_version text not null,
  api_version text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_campaigns_provider_account_fk
    foreign key (organization_id, connection_id, provider_account_id)
    references public.marketing_provider_accounts (organization_id, connection_id, id),
  constraint marketing_campaigns_currency_check
    check (currency is null or currency ~ '^[A-Z]{3}$'),
  constraint marketing_campaigns_amounts_check
    check ((budget_amount is null or budget_amount >= 0) and (spend_cap is null or spend_cap >= 0)),
  constraint marketing_campaigns_seen_check
    check (last_observed_at >= first_observed_at),
  constraint marketing_campaigns_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(metadata)),
  unique (provider_account_id, provider_campaign_id)
);

create unique index marketing_campaigns_scope_id_uidx
  on public.marketing_campaigns (organization_id, connection_id, provider_account_id, id);
create index marketing_campaigns_account_status_idx
  on public.marketing_campaigns (provider_account_id, effective_status, updated_at desc);

create table public.marketing_ad_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  campaign_id uuid not null,
  provider text not null,
  provider_ad_group_id text not null,
  name text,
  configured_status text,
  effective_status text,
  optimization_goal text,
  billing_event text,
  bid_strategy text,
  daily_budget numeric,
  lifetime_budget numeric,
  currency text,
  start_at timestamptz,
  end_at timestamptz,
  provider_created_at timestamptz,
  provider_updated_at timestamptz,
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  raw_payload_hash text,
  normalizer_version text not null,
  api_version text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_ad_groups_provider_account_fk
    foreign key (organization_id, connection_id, provider_account_id)
    references public.marketing_provider_accounts (organization_id, connection_id, id),
  constraint marketing_ad_groups_campaign_fk
    foreign key (organization_id, connection_id, provider_account_id, campaign_id)
    references public.marketing_campaigns (organization_id, connection_id, provider_account_id, id),
  constraint marketing_ad_groups_currency_check
    check (currency is null or currency ~ '^[A-Z]{3}$'),
  constraint marketing_ad_groups_budget_check
    check ((daily_budget is null or daily_budget >= 0) and (lifetime_budget is null or lifetime_budget >= 0)),
  constraint marketing_ad_groups_time_check
    check (start_at is null or end_at is null or end_at >= start_at),
  constraint marketing_ad_groups_seen_check
    check (last_observed_at >= first_observed_at),
  constraint marketing_ad_groups_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(metadata)),
  unique (provider_account_id, provider_ad_group_id)
);

create unique index marketing_ad_groups_scope_id_uidx
  on public.marketing_ad_groups (organization_id, connection_id, provider_account_id, id);
create index marketing_ad_groups_campaign_status_idx
  on public.marketing_ad_groups (campaign_id, effective_status, updated_at desc);

create table public.marketing_creatives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  provider text not null,
  provider_creative_id text not null,
  name text,
  creative_type text,
  destination_url text,
  thumbnail_reference text,
  provider_story_id text,
  provider_created_at timestamptz,
  provider_updated_at timestamptz,
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  raw_payload_hash text,
  normalizer_version text not null,
  api_version text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_creatives_provider_account_fk
    foreign key (organization_id, connection_id, provider_account_id)
    references public.marketing_provider_accounts (organization_id, connection_id, id),
  constraint marketing_creatives_seen_check
    check (last_observed_at >= first_observed_at),
  constraint marketing_creatives_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(metadata)),
  unique (provider_account_id, provider_creative_id)
);

create unique index marketing_creatives_scope_id_uidx
  on public.marketing_creatives (organization_id, connection_id, provider_account_id, id);

create table public.marketing_ads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  campaign_id uuid not null,
  ad_group_id uuid not null,
  creative_id uuid,
  provider text not null,
  provider_ad_id text not null,
  name text,
  configured_status text,
  effective_status text,
  conversion_domain text,
  provider_created_at timestamptz,
  provider_updated_at timestamptz,
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  raw_payload_hash text,
  normalizer_version text not null,
  api_version text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_ads_provider_account_fk
    foreign key (organization_id, connection_id, provider_account_id)
    references public.marketing_provider_accounts (organization_id, connection_id, id),
  constraint marketing_ads_campaign_fk
    foreign key (organization_id, connection_id, provider_account_id, campaign_id)
    references public.marketing_campaigns (organization_id, connection_id, provider_account_id, id),
  constraint marketing_ads_ad_group_fk
    foreign key (organization_id, connection_id, provider_account_id, ad_group_id)
    references public.marketing_ad_groups (organization_id, connection_id, provider_account_id, id),
  constraint marketing_ads_creative_fk
    foreign key (organization_id, connection_id, provider_account_id, creative_id)
    references public.marketing_creatives (organization_id, connection_id, provider_account_id, id),
  constraint marketing_ads_seen_check
    check (last_observed_at >= first_observed_at),
  constraint marketing_ads_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(metadata)),
  unique (provider_account_id, provider_ad_id)
);

create unique index marketing_ads_scope_id_uidx
  on public.marketing_ads (organization_id, connection_id, provider_account_id, id);
create index marketing_ads_ad_group_status_idx
  on public.marketing_ads (ad_group_id, effective_status, updated_at desc);

-- ---------------------------------------------------------------------------
-- Durable per-account sync control plane
-- ---------------------------------------------------------------------------

create table public.marketing_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
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
  lease_owner text,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  attempt integer not null default 0,
  resume_from_run_id uuid,
  last_error_code text,
  last_error_summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_sync_runs_provider_account_fk
    foreign key (organization_id, connection_id, provider_account_id)
    references public.marketing_provider_accounts (organization_id, connection_id, id),
  constraint marketing_sync_runs_resume_fk
    foreign key (resume_from_run_id) references public.marketing_sync_runs(id) on delete set null,
  constraint marketing_sync_runs_type_check
    check (sync_type ~ '^[a-z][a-z0-9_]*$'),
  constraint marketing_sync_runs_mode_check
    check (mode in ('discovery', 'historical_backfill', 'incremental', 'reconciliation')),
  constraint marketing_sync_runs_status_check
    check (status in ('queued', 'running', 'paused', 'completed', 'completed_with_warnings', 'failed', 'cancelled')),
  constraint marketing_sync_runs_counts_check check (
    (source_total_items is null or source_total_items >= 0)
    and (pages_planned is null or pages_planned >= 0)
    and pages_completed >= 0
    and records_seen >= 0
    and records_created >= 0
    and records_updated >= 0
    and records_unchanged >= 0
    and records_failed >= 0
    and warnings_count >= 0
    and attempt >= 0
  ),
  constraint marketing_sync_runs_lease_check check (
    (lease_owner is null and lease_expires_at is null and heartbeat_at is null)
    or
    (nullif(btrim(lease_owner), '') is not null and lease_expires_at is not null and heartbeat_at is not null)
  ),
  constraint marketing_sync_runs_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(metadata))
);

create unique index marketing_sync_runs_scope_id_uidx
  on public.marketing_sync_runs (organization_id, connection_id, provider_account_id, id);
create index marketing_sync_runs_account_status_idx
  on public.marketing_sync_runs (provider_account_id, sync_type, status, created_at desc);

create table public.marketing_sync_checkpoints (
  id uuid primary key default gen_random_uuid(),
  sync_run_id uuid not null,
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  resource text not null,
  checkpoint_kind text not null,
  page integer,
  cursor_before text,
  cursor_after text,
  async_report_id text,
  window_start timestamptz,
  window_end timestamptz,
  report_date_start date,
  report_date_end date,
  page_fingerprint text,
  first_source_id text,
  last_source_id text,
  source_total_items bigint,
  records_seen bigint not null default 0,
  records_persisted bigint not null default 0,
  records_failed bigint not null default 0,
  state text not null default 'pending',
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_sync_checkpoints_run_fk
    foreign key (organization_id, connection_id, provider_account_id, sync_run_id)
    references public.marketing_sync_runs (organization_id, connection_id, provider_account_id, id)
    on delete cascade,
  constraint marketing_sync_checkpoints_resource_check
    check (resource ~ '^[a-z][a-z0-9_]*$'),
  constraint marketing_sync_checkpoints_kind_check
    check (checkpoint_kind in ('page', 'cursor', 'time_window', 'async_report')),
  constraint marketing_sync_checkpoints_page_check
    check (page is null or page >= 1),
  constraint marketing_sync_checkpoints_window_check
    check (window_start is null or window_end is null or window_end >= window_start),
  constraint marketing_sync_checkpoints_report_date_check
    check (report_date_start is null or report_date_end is null or report_date_end >= report_date_start),
  constraint marketing_sync_checkpoints_counts_check
    check ((source_total_items is null or source_total_items >= 0)
      and records_seen >= 0 and records_persisted >= 0 and records_failed >= 0),
  constraint marketing_sync_checkpoints_state_check
    check (state in ('pending', 'running', 'completed', 'failed', 'superseded')),
  constraint marketing_sync_checkpoints_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(metadata))
);

create index marketing_sync_checkpoints_run_resource_idx
  on public.marketing_sync_checkpoints (sync_run_id, resource, created_at);
create index marketing_sync_checkpoints_async_report_idx
  on public.marketing_sync_checkpoints (provider_account_id, async_report_id)
  where async_report_id is not null;

create table public.marketing_sync_schedules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  resource text not null,
  enabled boolean not null default false,
  activation_state text not null default 'disabled',
  sync_frequency text not null default 'manual',
  next_run_at timestamptz,
  last_enqueued_at timestamptz,
  last_completed_at timestamptz,
  lease_owner text,
  lease_expires_at timestamptz,
  lease_heartbeat_at timestamptz,
  overlap_days integer not null default 0,
  historical_backfill_complete_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_sync_schedules_organization_account_fk
    foreign key (organization_id, account_id)
    references public.tracekit_organizations (id, owning_account_id),
  constraint marketing_sync_schedules_provider_account_fk
    foreign key (organization_id, connection_id, provider_account_id)
    references public.marketing_provider_accounts (organization_id, connection_id, id),
  constraint marketing_sync_schedules_resource_check
    check (resource ~ '^[a-z][a-z0-9_]*$'),
  constraint marketing_sync_schedules_activation_check
    check (activation_state in ('disabled', 'enabled', 'paused')),
  constraint marketing_sync_schedules_frequency_check
    check (sync_frequency in ('manual', 'hourly', '30_minutes', '15_minutes', '5_minutes', 'daily')),
  constraint marketing_sync_schedules_overlap_check
    check (overlap_days >= 0 and overlap_days <= 90),
  constraint marketing_sync_schedules_lease_check check (
    (lease_owner is null and lease_expires_at is null and lease_heartbeat_at is null)
    or
    (nullif(btrim(lease_owner), '') is not null and lease_expires_at is not null and lease_heartbeat_at is not null)
  ),
  constraint marketing_sync_schedules_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(metadata)),
  unique (connection_id, provider_account_id, resource)
);

create index marketing_sync_schedules_due_idx
  on public.marketing_sync_schedules (enabled, activation_state, next_run_at)
  where enabled = true;
create index marketing_sync_schedules_account_idx
  on public.marketing_sync_schedules (provider_account_id, resource, activation_state);

-- ---------------------------------------------------------------------------
-- Performance facts, evidence, and TraceKit economic projection
-- ---------------------------------------------------------------------------

create table public.marketing_performance_daily (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  provider text not null,
  report_date date not null,
  entity_level text not null,
  campaign_id uuid,
  ad_group_id uuid,
  ad_id uuid,
  provider_entity_id text not null,
  reporting_key text not null,
  currency text not null,
  spend numeric not null default 0,
  impressions bigint,
  clicks bigint,
  reach bigint,
  frequency numeric,
  provider_reported_conversions numeric,
  provider_reported_conversion_value numeric,
  provider_actions jsonb not null default '[]'::jsonb,
  provider_action_values jsonb not null default '[]'::jsonb,
  attribution_setting jsonb not null default '{}'::jsonb,
  breakdown_dimensions jsonb not null default '{}'::jsonb,
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  provider_updated_at timestamptz,
  payload_hash text not null,
  normalizer_version text not null,
  api_version text not null,
  sync_run_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_performance_daily_provider_account_fk
    foreign key (organization_id, connection_id, provider_account_id)
    references public.marketing_provider_accounts (organization_id, connection_id, id),
  constraint marketing_performance_daily_campaign_fk
    foreign key (organization_id, connection_id, provider_account_id, campaign_id)
    references public.marketing_campaigns (organization_id, connection_id, provider_account_id, id),
  constraint marketing_performance_daily_ad_group_fk
    foreign key (organization_id, connection_id, provider_account_id, ad_group_id)
    references public.marketing_ad_groups (organization_id, connection_id, provider_account_id, id),
  constraint marketing_performance_daily_ad_fk
    foreign key (organization_id, connection_id, provider_account_id, ad_id)
    references public.marketing_ads (organization_id, connection_id, provider_account_id, id),
  constraint marketing_performance_daily_sync_run_fk
    foreign key (organization_id, connection_id, provider_account_id, sync_run_id)
    references public.marketing_sync_runs (organization_id, connection_id, provider_account_id, id),
  constraint marketing_performance_daily_entity_level_check
    check (entity_level in ('account', 'campaign', 'ad_group', 'ad')),
  constraint marketing_performance_daily_entity_shape_check check (
    (entity_level = 'account' and campaign_id is null and ad_group_id is null and ad_id is null)
    or (entity_level = 'campaign' and campaign_id is not null and ad_group_id is null and ad_id is null)
    or (entity_level = 'ad_group' and campaign_id is not null and ad_group_id is not null and ad_id is null)
    or (entity_level = 'ad' and campaign_id is not null and ad_group_id is not null and ad_id is not null)
  ),
  constraint marketing_performance_daily_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  constraint marketing_performance_daily_metrics_check check (
    spend >= 0
    and (impressions is null or impressions >= 0)
    and (clicks is null or clicks >= 0)
    and (reach is null or reach >= 0)
    and (frequency is null or frequency >= 0)
    and (provider_reported_conversions is null or provider_reported_conversions >= 0)
    and (provider_reported_conversion_value is null or provider_reported_conversion_value >= 0)
  ),
  constraint marketing_performance_daily_seen_check
    check (last_observed_at >= first_observed_at),
  constraint marketing_performance_daily_provider_actions_safe_check
    check (public.financial_reconciliation_metadata_is_safe(provider_actions)),
  constraint marketing_performance_daily_provider_action_values_safe_check
    check (public.financial_reconciliation_metadata_is_safe(provider_action_values)),
  constraint marketing_performance_daily_attribution_safe_check
    check (public.financial_reconciliation_metadata_is_safe(attribution_setting)),
  constraint marketing_performance_daily_breakdowns_safe_check
    check (public.financial_reconciliation_metadata_is_safe(breakdown_dimensions)),
  constraint marketing_performance_daily_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(metadata)),
  unique (provider_account_id, report_date, entity_level, provider_entity_id, reporting_key)
);

create unique index marketing_performance_daily_org_id_uidx
  on public.marketing_performance_daily (organization_id, id);
create index marketing_performance_daily_account_date_idx
  on public.marketing_performance_daily (provider_account_id, report_date desc, entity_level);
create index marketing_performance_daily_ad_date_idx
  on public.marketing_performance_daily (ad_id, report_date desc)
  where ad_id is not null;

create table public.marketing_evidence_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  sync_run_id uuid,
  provider text not null,
  source_object_type text not null,
  source_object_id text not null,
  source_endpoint text,
  source_report_date date,
  payload_hash text not null,
  storage_backend text not null,
  storage_reference text,
  inline_payload jsonb,
  content_type text not null default 'application/json',
  byte_size bigint,
  api_version text not null,
  normalizer_version text not null,
  observed_at timestamptz not null,
  source_updated_at timestamptz,
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint marketing_evidence_records_provider_account_fk
    foreign key (organization_id, connection_id, provider_account_id)
    references public.marketing_provider_accounts (organization_id, connection_id, id),
  constraint marketing_evidence_records_sync_run_fk
    foreign key (organization_id, connection_id, provider_account_id, sync_run_id)
    references public.marketing_sync_runs (organization_id, connection_id, provider_account_id, id),
  constraint marketing_evidence_records_source_type_check
    check (source_object_type ~ '^[a-z][a-z0-9_]*$'),
  constraint marketing_evidence_records_backend_check
    check (storage_backend in ('inline_json', 'object_storage', 'managed_evidence_store')),
  constraint marketing_evidence_records_storage_check check (
    (storage_backend = 'inline_json' and inline_payload is not null and storage_reference is null)
    or
    (storage_backend in ('object_storage', 'managed_evidence_store') and inline_payload is null and storage_reference is not null)
  ),
  constraint marketing_evidence_records_byte_size_check
    check (byte_size is null or byte_size >= 0),
  constraint marketing_evidence_records_inline_payload_safe_check
    check (inline_payload is null or public.financial_reconciliation_metadata_is_safe(inline_payload)),
  constraint marketing_evidence_records_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(metadata)),
  unique (connection_id, provider_account_id, source_object_type, source_object_id, payload_hash)
);

create unique index marketing_evidence_records_org_id_uidx
  on public.marketing_evidence_records (organization_id, id);
create index marketing_evidence_records_source_history_idx
  on public.marketing_evidence_records (provider_account_id, source_object_type, source_object_id, observed_at desc);

create or replace function public.marketing_evidence_immutable_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'marketing evidence records cannot be deleted; use the controlled deleted_at erasure marker'
      using errcode = '55000';
  end if;

  if old.deleted_at is null
    and new.deleted_at is not null
    and (to_jsonb(new) - 'deleted_at') = (to_jsonb(old) - 'deleted_at') then
    return new;
  end if;

  raise exception 'marketing evidence records are immutable'
    using errcode = '55000';
end;
$$;

create trigger marketing_evidence_immutable_guard_trigger
before update or delete on public.marketing_evidence_records
for each row execute function public.marketing_evidence_immutable_guard();

create table public.marketing_costs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  provider text not null,
  cost_date date not null,
  cost_type text not null,
  currency text not null,
  amount numeric not null,
  campaign_id uuid,
  ad_group_id uuid,
  ad_id uuid,
  source_performance_fact_id uuid,
  source_type text not null,
  allocation_status text not null default 'unallocated',
  first_calculated_at timestamptz not null,
  last_calculated_at timestamptz not null,
  calculation_version text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_costs_provider_account_fk
    foreign key (organization_id, connection_id, provider_account_id)
    references public.marketing_provider_accounts (organization_id, connection_id, id),
  constraint marketing_costs_campaign_fk
    foreign key (organization_id, connection_id, provider_account_id, campaign_id)
    references public.marketing_campaigns (organization_id, connection_id, provider_account_id, id),
  constraint marketing_costs_ad_group_fk
    foreign key (organization_id, connection_id, provider_account_id, ad_group_id)
    references public.marketing_ad_groups (organization_id, connection_id, provider_account_id, id),
  constraint marketing_costs_ad_fk
    foreign key (organization_id, connection_id, provider_account_id, ad_id)
    references public.marketing_ads (organization_id, connection_id, provider_account_id, id),
  constraint marketing_costs_source_fact_fk
    foreign key (organization_id, source_performance_fact_id)
    references public.marketing_performance_daily (organization_id, id),
  constraint marketing_costs_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  constraint marketing_costs_amount_check
    check (amount >= 0),
  constraint marketing_costs_type_check
    check (cost_type ~ '^[a-z][a-z0-9_]*$'),
  constraint marketing_costs_source_type_check
    check (source_type ~ '^[a-z][a-z0-9_]*$'),
  constraint marketing_costs_allocation_status_check
    check (allocation_status in ('unallocated', 'partially_allocated', 'allocated', 'not_applicable')),
  constraint marketing_costs_calculated_check
    check (last_calculated_at >= first_calculated_at),
  constraint marketing_costs_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(metadata))
);

create unique index marketing_costs_source_projection_uidx
  on public.marketing_costs (source_performance_fact_id, cost_type, calculation_version)
  where source_performance_fact_id is not null;
create index marketing_costs_org_date_idx
  on public.marketing_costs (organization_id, cost_date desc, cost_type);

-- ---------------------------------------------------------------------------
-- Access boundary
-- ---------------------------------------------------------------------------

alter table public.marketing_provider_connections enable row level security;
alter table public.marketing_provider_accounts enable row level security;
alter table public.marketing_provider_credentials enable row level security;
alter table public.marketing_campaigns enable row level security;
alter table public.marketing_ad_groups enable row level security;
alter table public.marketing_creatives enable row level security;
alter table public.marketing_ads enable row level security;
alter table public.marketing_sync_runs enable row level security;
alter table public.marketing_sync_checkpoints enable row level security;
alter table public.marketing_sync_schedules enable row level security;
alter table public.marketing_performance_daily enable row level security;
alter table public.marketing_evidence_records enable row level security;
alter table public.marketing_costs enable row level security;

revoke all on table public.marketing_provider_connections from public, anon, authenticated;
revoke all on table public.marketing_provider_accounts from public, anon, authenticated;
revoke all on table public.marketing_provider_credentials from public, anon, authenticated;
revoke all on table public.marketing_campaigns from public, anon, authenticated;
revoke all on table public.marketing_ad_groups from public, anon, authenticated;
revoke all on table public.marketing_creatives from public, anon, authenticated;
revoke all on table public.marketing_ads from public, anon, authenticated;
revoke all on table public.marketing_sync_runs from public, anon, authenticated;
revoke all on table public.marketing_sync_checkpoints from public, anon, authenticated;
revoke all on table public.marketing_sync_schedules from public, anon, authenticated;
revoke all on table public.marketing_performance_daily from public, anon, authenticated;
revoke all on table public.marketing_evidence_records from public, anon, authenticated;
revoke all on table public.marketing_costs from public, anon, authenticated;

comment on table public.marketing_provider_connections is
  'Provider-neutral paid-media authorization connections. One connection may expose many advertising accounts.';
comment on table public.marketing_provider_accounts is
  'Provider advertising accounts discovered under a marketing connection; synchronization is independently selectable per account.';
comment on table public.marketing_performance_daily is
  'Mutable current projection of provider-reported daily advertising performance, keyed by reporting semantics.';
comment on table public.marketing_evidence_records is
  'Immutable evidence observations used to audit provider restatements and normalization provenance.';
comment on table public.marketing_costs is
  'TraceKit economic projection of paid-media cost, separate from provider attribution and commerce facts.';
