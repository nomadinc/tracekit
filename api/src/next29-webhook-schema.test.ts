import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = new URL("../../supabase/migrations/098_commerce_webhook_receipts_v1.sql", import.meta.url);

test("commerce webhook receipt migration is provider-neutral tenant-scoped and idempotent", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /create table if not exists public\.commerce_webhook_receipts/i);
  assert.match(sql, /organization_id uuid not null/i);
  assert.match(sql, /connection_id uuid not null/i);
  assert.match(sql, /provider_account_id uuid not null/i);
  assert.match(sql, /provider_event_id text not null/i);
  assert.match(sql, /unique \(connection_id, provider_account_id, provider, provider_event_id\)/i);
  assert.match(sql, /foreign key \(organization_id, connection_id, provider_account_id\)/i);
  assert.doesNotMatch(sql, /next29_webhook_receipts/i);
});

test("commerce webhook receipt migration records retry state without activating delivery", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /status in \('reserved','completed','failed'\)/i);
  assert.match(sql, /delivery_count integer not null default 1/i);
  assert.match(sql, /last_error_summary text/i);
  assert.doesNotMatch(sql, /create trigger.*webhook/i);
  assert.doesNotMatch(sql, /cron|schedule|http_post|net\.http/i);
});

test("commerce webhook receipt table remains server-only", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /revoke all on public\.commerce_webhook_receipts from anon, authenticated/i);
  assert.match(sql, /grant select, insert, update, delete on public\.commerce_webhook_receipts to service_role/i);
});
