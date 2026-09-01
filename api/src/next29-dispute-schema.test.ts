import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = new URL("../../supabase/migrations/20260901060000_generalize_commerce_dispute_observations.sql", import.meta.url);

test("commerce dispute observations are provider-neutral tenant-scoped immutable provenance", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /create table if not exists public\.commerce_provider_dispute_observations/i);
  assert.match(sql, /organization_id uuid not null/i);
  assert.match(sql, /connection_id uuid not null/i);
  assert.match(sql, /provider_account_id uuid not null/i);
  assert.match(sql, /provider_dispute_id text not null/i);
  assert.match(sql, /source_kind in \('api','webhook'\)/i);
  assert.match(sql, /unique \(connection_id, provider_account_id, provider, provider_dispute_id, payload_hash\)/i);
  assert.doesNotMatch(sql, /next29_dispute_observations/i);
});

test("commerce provider disputes accept API observation provenance without fabricated webhook events", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /add column if not exists latest_observation_id uuid/i);
  assert.match(sql, /alter column latest_event_id drop not null/i);
  assert.match(sql, /check \(latest_event_id is not null or latest_observation_id is not null\)/i);
  assert.match(sql, /add column if not exists observation_id uuid/i);
  assert.match(sql, /alter column webhook_event_id drop not null/i);
  assert.match(sql, /check \(webhook_event_id is not null or observation_id is not null\)/i);
});

test("commerce dispute observation compatibility migration remains server-only and does not activate runtime", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on public\.commerce_provider_dispute_observations from public, anon, authenticated/i);
  assert.match(sql, /grant select, insert on public\.commerce_provider_dispute_observations to service_role/i);
  assert.doesNotMatch(sql, /cron\.schedule|http_post|net\.http|create trigger/i);
});
