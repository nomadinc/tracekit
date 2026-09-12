import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/112_marketing_foundation_v1.sql",
  import.meta.url,
);

async function migrationSource() {
  return readFile(migrationUrl, "utf8");
}

test("marketing foundation creates the provider-neutral advertising surfaces", async () => {
  const migration = await migrationSource();
  for (const table of [
    "marketing_provider_connections",
    "marketing_provider_accounts",
    "marketing_provider_credentials",
    "marketing_campaigns",
    "marketing_ad_groups",
    "marketing_ads",
    "marketing_creatives",
    "marketing_performance_daily",
    "marketing_costs",
    "marketing_evidence_records",
    "marketing_sync_runs",
    "marketing_sync_checkpoints",
    "marketing_sync_schedules",
  ]) {
    assert.match(migration, new RegExp(`create table public\\.${table}\\s*\\(`, "i"));
  }
});

test("one marketing authorization can expose many independently selected provider accounts", async () => {
  const migration = await migrationSource();
  assert.match(migration, /create table public\.marketing_provider_accounts/i);
  assert.match(migration, /connection_id uuid not null/i);
  assert.match(migration, /provider_account_external_id text not null/i);
  assert.match(migration, /selected_for_sync boolean not null default false/i);
  assert.match(migration, /unique \(connection_id, provider_account_external_id\)/i);
  assert.doesNotMatch(migration, /unique \(connection_id\)\s*[,)]/i);
});

test("credentials are connection-scoped, encrypted or managed, and never placed on ad facts", async () => {
  const migration = await migrationSource();
  assert.match(migration, /create table public\.marketing_provider_credentials/i);
  assert.match(migration, /storage_backend in \('database_encrypted', 'managed_secret'\)/i);
  assert.match(migration, /secret_ciphertext bytea/i);
  assert.match(migration, /marketing_provider_credentials_active_connection_uidx/i);
  assert.match(migration, /marketing provider credential versions are immutable/i);

  const performance = migration.match(/create table public\.marketing_performance_daily \([\s\S]*?\n\);/i)?.[0] ?? "";
  const ads = migration.match(/create table public\.marketing_ads \([\s\S]*?\n\);/i)?.[0] ?? "";
  assert.doesNotMatch(performance, /access_token|secret_ciphertext|secret_reference/i);
  assert.doesNotMatch(ads, /access_token|secret_ciphertext|secret_reference/i);
});

test("hierarchy uses tenant and provider-account scoped ancestry rather than names as identity", async () => {
  const migration = await migrationSource();
  assert.match(migration, /foreign key \(organization_id, connection_id, provider_account_id\)[\s\S]*?references public\.marketing_provider_accounts/i);
  assert.match(migration, /foreign key \(organization_id, connection_id, provider_account_id, campaign_id\)[\s\S]*?references public\.marketing_campaigns/i);
  assert.match(migration, /foreign key \(organization_id, connection_id, provider_account_id, ad_group_id\)[\s\S]*?references public\.marketing_ad_groups/i);
  assert.match(migration, /unique \(provider_account_id, provider_campaign_id\)/i);
  assert.match(migration, /unique \(provider_account_id, provider_ad_group_id\)/i);
  assert.match(migration, /unique \(provider_account_id, provider_ad_id\)/i);
  assert.doesNotMatch(migration, /unique \([^\n]*name[^\n]*\)/i);
});

test("daily facts preserve reporting semantics and provider-restatement provenance", async () => {
  const migration = await migrationSource();
  assert.match(migration, /report_date date not null/i);
  assert.match(migration, /entity_level in \('account', 'campaign', 'ad_group', 'ad'\)/i);
  assert.match(migration, /reporting_key text not null/i);
  assert.match(migration, /unique \(provider_account_id, report_date, entity_level, provider_entity_id, reporting_key\)/i);
  assert.match(migration, /provider_actions jsonb/i);
  assert.match(migration, /provider_action_values jsonb/i);
  assert.match(migration, /first_observed_at timestamptz not null/i);
  assert.match(migration, /last_observed_at timestamptz not null/i);
  assert.match(migration, /payload_hash text not null/i);
  assert.match(migration, /api_version text not null/i);
  assert.match(migration, /normalizer_version text not null/i);
});

test("evidence is immutable and allows changed provider observations to coexist by payload hash", async () => {
  const migration = await migrationSource();
  assert.match(migration, /create table public\.marketing_evidence_records/i);
  assert.match(migration, /unique \(connection_id, provider_account_id, source_object_type, source_object_id, payload_hash\)/i);
  assert.match(migration, /marketing evidence records are immutable/i);
  assert.match(migration, /inline_json/i);
  assert.match(migration, /object_storage/i);
});

test("sync runs checkpoints and schedules are provider-account scoped and support Meta-style cursors and async reports", async () => {
  const migration = await migrationSource();
  assert.match(migration, /create table public\.marketing_sync_runs/i);
  assert.match(migration, /create table public\.marketing_sync_checkpoints/i);
  assert.match(migration, /create table public\.marketing_sync_schedules/i);
  assert.match(migration, /checkpoint_kind in \('page', 'cursor', 'time_window', 'async_report'\)/i);
  assert.match(migration, /cursor_after text/i);
  assert.match(migration, /async_report_id text/i);
  assert.match(migration, /unique \(connection_id, provider_account_id, resource\)/i);
  assert.match(migration, /enabled boolean not null default false/i);
  assert.match(migration, /activation_state text not null default 'disabled'/i);
});

test("marketing costs project provider spend without duplicating a fact/version", async () => {
  const migration = await migrationSource();
  assert.match(migration, /create table public\.marketing_costs/i);
  assert.match(migration, /source_performance_fact_id uuid/i);
  assert.match(migration, /calculation_version text not null/i);
  assert.match(migration, /marketing_costs_source_projection_uidx/i);
});

test("marketing tables are RLS protected and browser roles receive no direct grants", async () => {
  const migration = await migrationSource();
  for (const table of [
    "marketing_provider_connections",
    "marketing_provider_accounts",
    "marketing_provider_credentials",
    "marketing_campaigns",
    "marketing_ad_groups",
    "marketing_ads",
    "marketing_creatives",
    "marketing_performance_daily",
    "marketing_costs",
    "marketing_evidence_records",
    "marketing_sync_runs",
    "marketing_sync_checkpoints",
    "marketing_sync_schedules",
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, "i"));
  }
});
