import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

const migrationsUrl = new URL("../../supabase/migrations/", import.meta.url);
const exportsUrl = new URL("../../docs/schema-exports/", import.meta.url);

function migration(name: string): string {
  return readFileSync(new URL(name, migrationsUrl), "utf8");
}

test("Migration Zero owns only evidence-backed legacy prerequisites", () => {
  const baseline = migration("000_tracekit_legacy_baseline.sql").toLowerCase();
  const integrationStart = baseline.indexOf("create table if not exists public.integration_import_jobs");
  const conversionsStart = baseline.indexOf("create table if not exists public.conversions");
  const platformBaseline = baseline.slice(0, integrationStart);
  const integrationBaseline = baseline.slice(integrationStart, conversionsStart);

  assert.match(baseline, /create sequence if not exists public\.platform_orders_id_seq/);
  assert.match(baseline, /owned by public\.platform_orders\.id/);
  assert.match(baseline, /create table if not exists public\.platform_orders/);
  assert.match(baseline, /constraint platform_orders_pkey primary key \(id\)/);
  assert.match(baseline, /constraint platform_orders_platform_order_id_key unique \(platform_order_id\)/);

  for (const migrationOwnedColumn of [
    "customer_email",
    "customer_email_normalized",
    "customer_email_hash",
    "transaction_id",
    "affiliate_id",
    "source_id",
    "sub1",
    "sub2",
    "sub3",
    "sub4",
    "sub5",
    "raw_json",
    "commerce_reference",
    "workspace_id",
    "person_id",
  ]) {
    assert.doesNotMatch(
      platformBaseline,
      new RegExp(`\\n\\s*${migrationOwnedColumn}\\s`),
      `${migrationOwnedColumn} belongs to a tracked migration`,
    );
  }

  assert.doesNotMatch(platformBaseline, /references public\.people/);
  assert.doesNotMatch(baseline, /\bto (anon|authenticated)\b/);

  assert.match(baseline, /create table if not exists public\.integration_import_jobs/);
  assert.match(baseline, /constraint integration_import_jobs_pkey primary key \(id\)/);
  assert.match(baseline, /integration_import_jobs_platform_idx/);
  assert.doesNotMatch(integrationBaseline, /\n\s*progress\s+jsonb/);
  for (const runtimeColumn of [
    "workspace_id",
    "connector_id",
    "job_type",
    "phase",
    "requested_from",
    "requested_to",
    "records_discovered",
    "records_processed",
    "records_succeeded",
    "records_failed",
    "records_skipped",
    "current_cursor",
    "current_page",
    "last_error",
    "next_run_at",
    "metadata",
  ]) {
    assert.doesNotMatch(
      integrationBaseline,
      new RegExp(`\\n\\s*${runtimeColumn}\\s`),
      `${runtimeColumn} belongs to migration 011`,
    );
  }

  assert.match(baseline, /create table if not exists public\.conversions/);
  assert.match(baseline, /constraint conversions_pkey primary key \(id\)/);
  assert.match(baseline, /constraint conversions_ledger_type_check check/);
  for (const chargebackColumn of [
    "processor_account_id",
    "source_event_id",
    "dispute_id",
    "source_amount",
    "source_direction",
    "diagnostic_flags",
  ]) {
    assert.doesNotMatch(
      baseline,
      new RegExp(`\\n\\s*${chargebackColumn}\\s`),
      `${chargebackColumn} belongs to migration 035`,
    );
  }
  assert.doesNotMatch(baseline, /conversions_wowsuite_refund_event_uidx/);
  assert.doesNotMatch(baseline, /conversions_financial_issue_range_idx/);
  assert.doesNotMatch(baseline, /conversions_chargeback_event_uidx/);
  assert.doesNotMatch(baseline, /conversions_financial_reconciliation_lookup_idx/);

  const settingsStart = baseline.indexOf("create table if not exists public.integrations_settings");
  const settingsBaseline = baseline.slice(settingsStart);
  assert.match(settingsBaseline, /constraint integrations_settings_pkey primary key \(platform\)/);
  assert.match(settingsBaseline, /updated_at timestamptz not null default now\(\)/);
  for (const migration037Column of [
    "auto_import_enabled",
    "auto_import_interval_minutes",
    "auto_import_lookback_hours",
    "last_run_at",
    "last_success_at",
    "last_error",
  ]) {
    assert.doesNotMatch(settingsBaseline, new RegExp(`\\n\\s*${migration037Column}\\s`));
  }
});

test("tracked migrations retain ownership of platform_orders additions", () => {
  const migration001 = migration("001_tracekit_core_ledger.sql").toLowerCase();
  const migration008 = migration("008_commerce_reference_paypal_event_fields.sql").toLowerCase();
  const migration014 = migration("014_identity_service_v1.sql").toLowerCase();

  for (const column of [
    "customer_email",
    "customer_email_normalized",
    "customer_email_hash",
    "transaction_id",
    "affiliate_id",
    "source_id",
    "sub1",
    "sub2",
    "sub3",
    "sub4",
    "sub5",
    "raw_json",
  ]) {
    assert.match(migration001, new RegExp(`add column if not exists ${column}\\s`));
  }

  assert.match(migration008, /add column if not exists commerce_reference text/);
  assert.match(migration014, /add column if not exists workspace_id text/);
  assert.match(migration014, /add column if not exists person_id uuid references public\.people/);

  const migration006 = migration("006_import_jobs_progress.sql").toLowerCase();
  const migration011 = migration("011_connector_runtime_v1.sql").toLowerCase();
  assert.match(migration006, /add column if not exists progress jsonb not null default '\{\}'::jsonb/);
  assert.match(migration011, /add column if not exists workspace_id text not null default 'default'/);
  assert.match(migration011, /integration_import_jobs_runtime_lookup_idx/);
  assert.match(migration011, /integration_import_jobs_runtime_updated_idx/);

  const migration033 = migration("033_wowboost_receipt_refund_events.sql").toLowerCase();
  const migration034 = migration("034_financial_issue_analysis_indexes.sql").toLowerCase();
  const migration035 = migration("035_chargeback_ingestion_v1.sql").toLowerCase();
  const migration036 = migration("036_financial_event_matches.sql").toLowerCase();
  assert.match(migration033, /conversions_wowsuite_refund_event_uidx/);
  assert.match(migration034, /conversions_financial_issue_range_idx/);
  assert.match(migration035, /add column if not exists processor_account_id text/);
  assert.match(migration035, /add column if not exists diagnostic_flags text\[\]/);
  assert.match(migration036, /conversions_financial_reconciliation_lookup_idx/);

  const migration037 = migration("037_integrations_settings_scheduled_import_columns.sql").toLowerCase();
  assert.match(migration037, /add column if not exists auto_import_enabled boolean not null default false/);
  assert.match(migration037, /add column if not exists auto_import_interval_minutes integer not null default 60/);
  assert.match(migration037, /add column if not exists auto_import_lookback_hours integer not null default 2/);
  assert.match(migration037, /add column if not exists last_run_at timestamptz/);
  assert.match(migration037, /add column if not exists last_success_at timestamptz/);
  assert.match(migration037, /add column if not exists last_error text/);
});

test("migration filenames are unique and numerically ordered", () => {
  const names = readdirSync(migrationsUrl)
    .filter((name) => /^\d{3}_.+\.sql$/.test(name))
    .sort();
  const numbers = names.map((name) => name.slice(0, 3));

  assert.equal(new Set(numbers).size, numbers.length);
  assert.deepEqual(numbers, Array.from({ length: 69 }, (_, index) => String(index).padStart(3, "0")));
});

test("Migration 068 defines a one-time exact-run runtime dispatch diagnostic replay", () => {
  const migration068 = migration("068_runtime_dispatch_diagnostic_replay.sql").toLowerCase();
  assert.match(migration068, /create or replace function public\.replay_commerce_runtime_dispatch_diagnostic\(\)/);
  assert.match(migration068, /1387dfce-3c6f-414f-a939-c4921e364280/);
  assert.match(migration068, /runtime_dispatch_diagnostic_replay_consumed/);
  assert.match(migration068, /quota_bootstrap_exceptional_recovery/);
  assert.match(migration068, /status <> 'cancelled'/);
  assert.match(migration068, /quota_bootstrap_provider_requests/);
  assert.match(migration068, /status in \('queued', 'running', 'paused'\)/);
  assert.match(migration068, /mode in \('live', 'live_beta'\)/);
  assert.match(migration068, /activation_state = 'enabled'/);
  assert.match(migration068, /for update/);
  assert.match(migration068, /reserved_run_id/);
  assert.match(migration068, /revoke all on function public\.replay_commerce_runtime_dispatch_diagnostic\(\)/);
  assert.match(migration068, /grant execute on function public\.replay_commerce_runtime_dispatch_diagnostic\(\)\s+to service_role/);
  assert.doesNotMatch(migration068, /fetch\(|http|continuous_commerce\.send/);
});

test("Migration 067 accepts absent or self-referencing roots without weakening recovery guards", () => {
  const migration067 = migration("067_quota_bootstrap_root_self_reference_fix.sql").toLowerCase();
  assert.match(migration067, /create or replace function public\.recover_commerce_quota_bootstrap_chain/);
  assert.match(migration067, /quota_bootstrap_original_run_id.*<> p_root_run_id::text/);
  assert.match(migration067, /quota_bootstrap_exceptional_recovery_consumed/);
  assert.match(migration067, /p_root_provider_requests is distinct from 0/);
  assert.match(migration067, /p_failed_provider_requests is distinct from 0/);
  assert.match(migration067, /status in \('queued', 'running', 'paused'\)/);
  assert.match(migration067, /mode in \('live', 'live_beta'\)/);
  assert.match(migration067, /activation_state = 'enabled'/);
  assert.match(migration067, /for update/);
  assert.match(migration067, /reserved_run_id/);
  assert.match(migration067, /revoke all on function public\.recover_commerce_quota_bootstrap_chain\(uuid, uuid, integer, integer\)/);
  assert.match(migration067, /grant execute on function public\.recover_commerce_quota_bootstrap_chain\(uuid, uuid, integer, integer\)\s+to service_role/);
});

test("Migration 066 bounds quota bootstrap retries at the chain root and provides exceptional recovery", () => {
  const migration066 = migration("066_quota_bootstrap_chain_recovery.sql").toLowerCase();
  assert.match(migration066, /rename to retry_commerce_quota_bootstrap_legacy/);
  assert.match(migration066, /quota-bootstrap-chain/);
  assert.match(migration066, /quota_bootstrap_original_run_id/);
  assert.match(migration066, /quota_bootstrap_retry_consumed/);
  assert.match(migration066, /retry already consumed at chain root/);
  assert.match(migration066, /revoke all on function public\.retry_commerce_quota_bootstrap_legacy\(uuid, integer\)[\s\S]*service_role/);
  assert.match(migration066, /create or replace function public\.recover_commerce_quota_bootstrap_chain\(\s*p_root_run_id uuid,\s*p_failed_run_id uuid/);
  assert.match(migration066, /quota_bootstrap_exceptional_recovery_consumed/);
  assert.match(migration066, /runtime_secret_repaired/);
  assert.match(migration066, /p_root_provider_requests is distinct from 0/);
  assert.match(migration066, /p_failed_provider_requests is distinct from 0/);
  assert.match(migration066, /for update/);
  assert.match(migration066, /reserved_run_id/);
  assert.match(migration066, /grant execute on function public\.recover_commerce_quota_bootstrap_chain\(uuid, uuid, integer, integer\)\s+to service_role/);
  assert.doesNotMatch(migration066, /fetch\(|http|continuous_commerce\.send/);
});

test("Migration 065 provides a one-time service-role-only quota bootstrap retry", () => {
  const migration065 = migration("065_quota_bootstrap_retry_recovery.sql").toLowerCase();
  assert.match(migration065, /create or replace function public\.retry_commerce_quota_bootstrap\(\s*p_run_id uuid,\s*p_provider_requests integer default 0\s*\)/);
  assert.match(migration065, /security definer/);
  assert.match(migration065, /pg_advisory_xact_lock/);
  assert.match(migration065, /for update/);
  assert.match(migration065, /status <> 'cancelled'/);
  assert.match(migration065, /p_provider_requests is distinct from 0/);
  assert.match(migration065, /quota_bootstrap_attempted/);
  assert.match(migration065, /quota_bootstrap_retry_consumed/);
  assert.match(migration065, /quota_bootstrap_provider_requests/);
  assert.match(migration065, /failure_class.*pre_provider_dispatch/);
  assert.match(migration065, /recorded provider requests/);
  assert.match(migration065, /v_connection\.account_id is distinct from v_account_id/);
  assert.match(migration065, /quota_bootstrap_original_run_id/);
  assert.match(migration065, /insert into public\.commerce_sync_runs/);
  assert.match(migration065, /reserved_run_id/);
  assert.match(migration065, /status in\s*\('queued',\s*'running',\s*'paused'\)/);
  assert.match(migration065, /mode in\s*\('live',\s*'live_beta'\)/);
  assert.match(migration065, /activation_state = 'enabled'/);
  assert.match(migration065, /revoke all on function public\.retry_commerce_quota_bootstrap\(uuid, integer\) from public, anon, authenticated/);
  assert.match(migration065, /grant execute on function public\.retry_commerce_quota_bootstrap\(uuid, integer\) to service_role/);
  assert.doesNotMatch(migration065, /env\.continuous_commerce|http|fetch\(/);
});

test("Migration 061 converges trigger-only guard functions without changing definitions or defaults", () => {
  const migration061 = migration("061_systemic_function_acl_convergence.sql").toLowerCase();
  assert.match(migration061, /revoke all privileges on function[\s\S]*commerce_provider_credential_version_guard\(\)/);
  assert.match(migration061, /commerce_evidence_immutable_guard\(\)/);
  assert.match(migration061, /tracekit_investigation_version_immutable_guard\(\)/);
  assert.match(migration061, /tracekit_investigation_branch_guard\(\)/);
  assert.match(migration061, /tracekit_investigation_branch_immutable_guard\(\)/);
  assert.match(migration061, /from public, anon, authenticated, service_role/);
  assert.doesNotMatch(migration061, /alter default privileges/);
  assert.doesNotMatch(migration061, /create or replace function|alter function/);
  assert.doesNotMatch(migration061, /grant execute/);
});

test("Migration 060 converges protected table ACLs without changing default privileges", () => {
  const migration060 = migration("060_systemic_service_role_table_acl_convergence.sql").toLowerCase();
  assert.match(migration060, /revoke all privileges on table[\s\S]*from service_role/);
  assert.match(migration060, /grant select, insert, update, delete on table[\s\S]*to service_role/);
  assert.match(migration060, /grant select, insert on table public\.commerce_product_mapping_decisions\s+to service_role/);
  assert.match(migration060, /revoke all privileges on table[\s\S]*from public, anon, authenticated/);
  assert.doesNotMatch(migration060, /alter default privileges/);
  assert.doesNotMatch(migration060, /alter table[^;]*(enable|disable|force|no force) row level security/);
  assert.doesNotMatch(migration060, /create policy|drop policy|alter policy/);
});

test("Migration 057 adds convergent credential key-version metadata without rewriting ciphertext", () => {
  const migration057 = migration("057_integration_credential_key_versioning_v1.sql").toLowerCase();
  assert.match(migration057, /add column if not exists password_key_version smallint/);
  assert.match(migration057, /if to_regclass\('public\.integrations_credentials'\) is null then/);
  assert.match(migration057, /set password_key_version = 1\s+where password_key_version is null/);
  assert.match(migration057, /alter column password_key_version set default 1/);
  assert.match(migration057, /alter column password_key_version set not null/);
  assert.match(migration057, /check \(password_key_version > 0\) not valid/);
  assert.doesNotMatch(migration057, /password_iv\s*=/);
  assert.doesNotMatch(migration057, /password_ciphertext\s*=/);
});

test("Migration 059 defines deterministic Legacy B, future, and Legacy C lineage semantics", () => {
  const migration059 = migration("059_integration_credential_legacy_lineages_v1.sql");
  assert.match(migration059, /password_key_version in \(1, 2, 3\)/);
  assert.match(migration059, /1=legacy-b, 2=future rotation key, 3=legacy-c/);
  assert.match(migration059, /not embedded/i);
  assert.doesNotMatch(migration059, /password_iv\s*=/i);
  assert.doesNotMatch(migration059, /password_ciphertext\s*=/i);
});

test("Migration 058 makes integration credentials server-only without rewriting secrets", () => {
  const migration058 = migration("058_integrations_credentials_authorization_hardening.sql").toLowerCase();
  assert.match(migration058, /if to_regclass\('public\.integrations_credentials'\) is null then/);
  assert.match(migration058, /alter table public\.integrations_credentials enable row level security/);
  assert.match(migration058, /revoke all on table public\.integrations_credentials\s+from public, anon, authenticated, service_role/);
  assert.match(migration058, /grant select, insert, update on table public\.integrations_credentials\s+to service_role/);
  assert.match(migration058, /has unexpected row-level security policies/);
  assert.doesNotMatch(migration058, /grant[^;]*(anon|authenticated)/);
  assert.doesNotMatch(migration058, /password_iv\s*=/);
  assert.doesNotMatch(migration058, /password_ciphertext\s*=/);
});

test("schema provenance exports contain metadata headers and no known secret material", () => {
  const exportNames = readdirSync(exportsUrl).filter((name) => name.endsWith(".csv"));
  assert.deepEqual(exportNames.sort(), [
    "platform_orders_columns.csv",
    "platform_orders_constraints.csv",
    "platform_orders_grants.csv",
    "platform_orders_indexes.csv",
  ]);

  const forbidden = /(bearer\s+[a-z0-9._~+/=-]+|access[_-]?token|refresh[_-]?token|client[_-]?secret|api[_-]?key|password)/i;
  for (const name of exportNames) {
    const contents = readFileSync(new URL(name, exportsUrl), "utf8");
    assert.doesNotMatch(contents, forbidden, `${name} must remain schema metadata only`);
  }
});

test("persistent identity migration converges its invitation FK and table privileges", () => {
  const identityMigration = migration("038_persistent_identity_and_tenancy.sql").toLowerCase();
  const identityTables = [
    "tracekit_users",
    "tracekit_accounts",
    "tracekit_agencies",
    "tracekit_organizations",
    "tracekit_roles",
    "tracekit_memberships",
    "tracekit_permission_overrides",
    "tracekit_agency_client_assignments",
    "tracekit_business_context_access",
    "tracekit_invitations",
    "tracekit_audit_events",
  ];

  for (const table of identityTables) {
    assert.match(identityMigration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(identityMigration, /revoke all on table[\s\s]*public\.tracekit_users/);
  assert.match(identityMigration, /from public, anon, authenticated, service_role/);
  assert.match(identityMigration, /grant select, insert, update, delete on table/);
  assert.match(identityMigration, /to service_role/);
  assert.match(identityMigration, /c\.contype = 'f'/);
  assert.match(identityMigration, /c\.confupdtype = 'a'/);
  assert.match(identityMigration, /c\.confdeltype = 'a'/);
  assert.match(identityMigration, /c\.convalidated/);
  assert.match(identityMigration, /not c\.condeferrable/);
  assert.match(identityMigration, /not c\.condeferred/);
  assert.match(identityMigration, /rename constraint %i to tracekit_memberships_invitation_fk/);
  assert.match(identityMigration, /tracekit_memberships_invitation_fk exists with an incompatible definition/);
  assert.match(identityMigration, /invitation_id has an incompatible or ambiguous foreign key definition/);
});

test("commerce persistence migration is tenant-owned and fail-closed", () => {
  const commerceMigration = migration("039_commerce_persistence_v1.sql").toLowerCase();
  const commerceTables = [
    "tracekit_business_contexts",
    "commerce_provider_connections",
    "commerce_provider_accounts",
    "commerce_provider_credentials",
    "commerce_sync_runs",
    "commerce_sync_checkpoints",
    "commerce_evidence_records",
    "commerce_source_mappings",
    "canonical_offers",
    "offer_steps",
    "offer_variants",
    "commerce_provider_products",
    "person_source_identities",
    "commerce_repository_activation",
  ];

  for (const table of commerceTables) {
    assert.match(commerceMigration, new RegExp(`create table public\\.${table}`));
    assert.match(commerceMigration, new RegExp(`'${table}'`));
  }

  assert.match(commerceMigration, /revoke all on table public\.%i from anon, authenticated/);
  assert.match(commerceMigration, /commerce_provider_credentials_material_check/);
  assert.match(commerceMigration, /secret_ciphertext bytea/);
  assert.doesNotMatch(commerceMigration, /create table public\.integrations_credentials/);
  assert.doesNotMatch(commerceMigration, /tracekit_real_data_enabled/);
  assert.doesNotMatch(commerceMigration, /insert into public\.commerce_repository_activation/);
  assert.match(commerceMigration, /alter column currency drop default/);
  assert.match(commerceMigration, /person_source_identities_provider_customer_uidx/);
  assert.match(commerceMigration, /where source_type = 'provider_customer_id'/);
  assert.doesNotMatch(commerceMigration, /drop index if exists public\.person_identifiers_active_value_uidx/);
  assert.match(commerceMigration, /commerce_provider_credentials_active_connection_uidx/);
  assert.match(commerceMigration, /where revoked_at is null/);
  assert.match(commerceMigration, /commerce_provider_credential_version_guard/);
  assert.match(commerceMigration, /credential versions are immutable/);
  assert.match(commerceMigration, /sync_run_id uuid not null/);
  assert.match(commerceMigration, /commerce_evidence_immutable_guard/);
  assert.match(commerceMigration, /unique \(connection_id, provider_account_id, source_object_type, source_object_id\)/);
  assert.match(commerceMigration, /tracekit_business_context_access_context_fk/);
  assert.match(commerceMigration, /not valid/);
});

test("commerce control-plane migration remains additive and server-only", () => {
  const migration040 = migration("040_commerce_control_plane_v1.sql").toLowerCase();
  assert.match(migration040, /provider_order_id text/);
  assert.match(migration040, /platform_orders_provider_source_uidx/);
  assert.doesNotMatch(migration040, /drop constraint platform_orders_platform_order_id_key/);
  assert.match(migration040, /claim_commerce_sync_run/);
  assert.match(migration040, /lease_expires_at/);
  assert.match(migration040, /commerce_product_mapping_decisions/);
  assert.match(migration040, /append-only/);
  assert.match(migration040, /revoke all on function public\.claim_commerce_sync_run/);
  assert.match(migration040, /where o\.id = '70000000-0000-0000-0000-000000000002'/);
  assert.doesNotMatch(migration040, /tracekit_real_data_enabled/);
  assert.doesNotMatch(migration040, /insert into public\.commerce_repository_activation/);

  const migration041 = migration("041_commerce_connection_setup_idempotency.sql").toLowerCase();
  assert.match(migration041, /setup_request_id uuid/);
  assert.match(migration041, /commerce_provider_connections_org_setup_request_uidx/);
  assert.match(migration041, /organization_id, setup_request_id/);
  assert.match(migration041, /revoke all on function public\.commerce_product_mapping_decision_immutable_guard\(\)/);
  assert.match(migration041, /from public, anon, authenticated/);
  assert.doesNotMatch(migration041, /insert into public\.commerce_provider_connections/);

  const migration042 = migration("042_commerce_evidence_storage_v1.sql").toLowerCase();
  assert.match(migration042, /'commerce-evidence'/);
  assert.match(migration042, /public, file_size_limit/);
  assert.match(migration042, /false,/);
  assert.doesNotMatch(migration042, /create policy/);
  assert.doesNotMatch(migration042, /insert into public\.commerce_repository_activation/);

  const migration043 = migration("043_commerce_shadow_ingestion_v1.sql").toLowerCase();
  assert.match(migration043, /create table public\.commerce_order_lines/);
  assert.match(migration043, /create table public\.commerce_historical_disputes/);
  assert.doesNotMatch(migration043, /insert into public\.commerce_repository_activation/);
  const migration044 = migration("044_commerce_refund_normalization_v1.sql").toLowerCase();
  assert.match(migration044, /create table public\.commerce_refund_events/);
  assert.match(migration044, /provider-observed refund fee/);
  const migration045 = migration("045_commerce_dispute_reconciliation_v1.sql").toLowerCase();
  assert.match(migration045, /reconcile_commerce_historical_disputes_v1/);
  assert.doesNotMatch(migration045, /insert into public\.commerce_repository_activation/);

  const migration047 = migration("047_everflow_commas_linkage_v2.sql").toLowerCase();
  assert.match(migration047, /create table public\.everflow_acquisition_journeys/);
  assert.match(migration047, /create table public\.everflow_journey_order_links/);
  assert.match(migration047, /propagated_within_journey/);
  assert.match(migration047, /competing_journey_count/);
  assert.doesNotMatch(migration047, /insert into public\.commerce_repository_activation/);

  const migration049 = migration("049_investigation_branches_v1.sql").toLowerCase();
  assert.match(migration049, /parent_investigation_id uuid/);
  assert.match(migration049, /parent_investigation_version_id uuid/);
  assert.match(migration049, /tracekit_investigations_parent_org_fk/);
  assert.match(migration049, /tracekit_investigations_parent_version_fk/);
  assert.match(migration049, /investigation branch cycle is not allowed/);
  assert.match(migration049, /materialized investigation branch provenance is immutable/);
  assert.match(migration049, /on delete restrict/);
  assert.doesNotMatch(migration049, /insert into public\.commerce_repository_activation/);

  const migration050 = migration("050_continuous_commerce_intelligence_v1.sql").toLowerCase();
  assert.match(migration050, /create table public\.commerce_continuous_sync_state/);
  assert.match(migration050, /create table public\.commerce_sync_schedules/);
  assert.match(migration050, /create table public\.tracekit_investigation_freshness/);
  assert.match(migration050, /create table public\.tracekit_investigation_candidates/);
  assert.match(migration050, /enqueue_commerce_continuous_sync/);
  assert.match(migration050, /mark_investigation_new_evidence/);
  assert.doesNotMatch(migration050, /insert into public\.commerce_repository_activation/);

  const migration051 = migration("051_tkid_journey_evidence_v1.sql").toLowerCase();
  for (const table of ["tkid_sources","tkid_journeys","tkid_browser_sessions","tkid_checkout_sessions","tkid_event_evidence","tkid_events","tkid_commerce_links","tkid_handoffs"]) assert.match(migration051,new RegExp(`create table public\\.${table}`));
  assert.match(migration051,/revoke all on public\.%i from anon,authenticated/);
  assert.match(migration051,/linked_by='server_checkout'/);
  assert.doesNotMatch(migration051,/insert into public\.commerce_repository_activation/);

  const migration052 = migration("052_production_intelligence_readiness_v1.sql").toLowerCase();
  for (const table of ["tracekit_production_controls","commerce_connection_pauses","tkid_handoff_keys","tracekit_operational_alerts"]) assert.match(migration052,new RegExp(`create table public\\.${table}`));
  assert.match(migration052,/activation_state text not null default 'disabled'/);
  assert.match(migration052,/commerce_schedule_permitted/);
  assert.match(migration052,/revoke all on public\.%i from anon,authenticated/);
  assert.doesNotMatch(migration052,/insert into public\.commerce_repository_activation/);

  const migration053 = migration("053_production_worker_abuse_erasure_v1.sql").toLowerCase();
  for (const table of ["tkid_abuse_counters","tkid_erasure_runs","tkid_erasure_objects"]) assert.match(migration053,new RegExp(`create table public\\.${table}`));
  assert.match(migration053,/consume_tkid_abuse_limit/);
  assert.match(migration053,/complete_tkid_journey_erasure/);
  assert.doesNotMatch(migration053,/delete from public\.commerce_orders/);
  assert.match(migration053,/revoke all on public\.%i from anon,authenticated/);
  assert.doesNotMatch(migration053,/insert into public\.commerce_repository_activation/);

  const migration054 = migration("054_managed_tkid_origin_registry_v1.sql").toLowerCase();
  for (const table of ["tkid_source_origins","tkid_origin_verifications"]) assert.match(migration054,new RegExp(`create table public\\.${table}`));
  assert.match(migration054,/tkid_active_origin/);
  assert.match(migration054,/lifecycle_status text not null default 'pending'/);
  assert.match(migration054,/revoke all on public\.tkid_source_origins,public\.tkid_origin_verifications from anon,authenticated/);
  assert.doesNotMatch(migration054,/insert into public\.commerce_repository_activation/);

  const migration055 = migration("055_tkid_continuity_relay_v1.sql").toLowerCase();
  for (const table of ["tkid_relay_flows","tkid_relay_continuities","tkid_relay_events"]) assert.match(migration055,new RegExp(`create table public\\.${table}`));
  assert.match(migration055,/status text not null default 'draft'/);
  assert.match(migration055,/tkid_relay_one_open_browser_flow_uidx/);
  assert.match(migration055,/erase_tkid_relay_on_journey_tombstone/);
  assert.match(migration055,/revoke all on public\.tkid_relay_flows,public\.tkid_relay_continuities,public\.tkid_relay_events from anon,authenticated/);
  assert.doesNotMatch(migration055,/insert into public\.commerce_repository_activation/);

  const migration062 = migration("062_tkid_relay_trigger_function_acl_convergence.sql").toLowerCase();
  assert.match(migration062,/revoke all privileges on function/);
  assert.match(migration062,/erase_tkid_relay_on_journey_tombstone\(\)/);
  assert.doesNotMatch(migration062,/create table|alter table|create trigger|create or replace function|insert into|update |delete from/);

});
