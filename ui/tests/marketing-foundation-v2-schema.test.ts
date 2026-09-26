import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/20260926130000_marketing_foundation_v2.sql",
  import.meta.url,
);

async function migrationSource() {
  return readFile(migrationUrl, "utf8");
}

test("marketing foundation supports multiple provider connections per workspace", async () => {
  const migration = await migrationSource();
  assert.match(migration, /create table public\.marketing_provider_connections/i);
  assert.match(migration, /create table public\.marketing_provider_accounts/i);
  assert.match(migration, /unique \(connection_id, provider_account_external_id\)/i);
  assert.doesNotMatch(migration, /unique \(organization_id, provider\)/i);
  assert.doesNotMatch(migration, /unique \(connection_id\)\s*[,)]/i);
});

test("provider accounts preserve nested manager and client topology", async () => {
  const migration = await migrationSource();
  const accounts = migration.match(/create table public\.marketing_provider_accounts \([\s\S]*?\n\);/i)?.[0] ?? "";
  assert.match(accounts, /parent_provider_account_id uuid/i);
  assert.match(accounts, /account_type text not null default 'unknown'/i);
  assert.match(accounts, /hierarchy_depth integer/i);
  assert.match(accounts, /is_manager boolean not null default false/i);
  assert.match(accounts, /eligible_for_spend_sync boolean not null default false/i);
  assert.match(accounts, /foreign key \(organization_id, connection_id, parent_provider_account_id\)[\s\S]*?references public\.marketing_provider_accounts/i);
  assert.match(accounts, /check \(hierarchy_depth is null or hierarchy_depth >= 0\)/i);
});

test("credentials remain connection scoped rather than duplicated per child account", async () => {
  const migration = await migrationSource();
  const credentials = migration.match(/create table public\.marketing_provider_credentials \([\s\S]*?\n\);/i)?.[0] ?? "";
  assert.match(credentials, /connection_id uuid not null/i);
  assert.doesNotMatch(credentials, /provider_account_id/i);
  assert.match(migration, /marketing_provider_credentials_active_connection_uidx/i);
});

test("sync state is isolated per provider account", async () => {
  const migration = await migrationSource();
  for (const table of ["marketing_sync_runs", "marketing_sync_checkpoints", "marketing_sync_schedules"]) {
    const body = migration.match(new RegExp(`create table public\\.${table} \\([\\s\\S]*?\\n\\);`, "i"))?.[0] ?? "";
    assert.match(body, /connection_id uuid not null/i);
    assert.match(body, /provider_account_id uuid not null/i);
  }
  assert.match(migration, /unique \(connection_id, provider_account_id, resource\)/i);
});

test("daily performance and costs remain provider-account scoped", async () => {
  const migration = await migrationSource();
  assert.match(migration, /unique \(provider_account_id, report_date, entity_level, provider_entity_id, reporting_key\)/i);
  assert.match(migration, /create table public\.marketing_costs/i);
  assert.match(migration, /source_performance_fact_id uuid/i);
});

test("source evidence is immutable and can retain manager access context", async () => {
  const migration = await migrationSource();
  assert.match(migration, /create table public\.marketing_evidence_records/i);
  assert.match(migration, /marketing evidence records are immutable/i);
  assert.match(migration, /inline_payload jsonb/i);
  assert.match(migration, /metadata jsonb not null default '\{\}'::jsonb/i);
});
