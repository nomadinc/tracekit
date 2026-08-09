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
  assert.deepEqual(numbers, Array.from({ length: 50 }, (_, index) => String(index).padStart(3, "0")));
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

test("persistent identity migration enables RLS and revokes browser roles", () => {
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
  assert.match(identityMigration, /from anon, authenticated/);
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

});
