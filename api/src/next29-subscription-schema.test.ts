import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../../supabase/migrations/097_commerce_subscriptions_v1.sql", import.meta.url);

test("commerce subscription migration is provider-neutral and tenant scoped", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create table if not exists public\.commerce_subscriptions/i);
  assert.match(sql, /create table if not exists public\.commerce_subscription_lines/i);
  assert.match(sql, /create table if not exists public\.commerce_subscription_order_links/i);
  assert.match(sql, /foreign key \(organization_id, connection_id, provider_account_id\)/i);
  assert.doesNotMatch(sql, /next29_subscriptions|shopify_subscriptions|commas_subscriptions/i);
});

test("commerce subscription migration preserves documented lifecycle and rebill lineage without scheduler activation", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const status of ["active", "past_due", "canceled", "retrying", "paused", "unknown"]) assert.match(sql, new RegExp(status));
  assert.match(sql, /provider_order_id text not null/i);
  assert.match(sql, /billing_cycle integer/i);
  assert.match(sql, /canonical_order_id uuid/i);
  assert.doesNotMatch(sql, /commerce_sync_schedules|scheduled\(|cron|queue\.send/i);
});

test("commerce subscription tables remain server-only", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /revoke all on public\.commerce_subscriptions from anon, authenticated/i);
  assert.match(sql, /revoke all on public\.commerce_subscription_lines from anon, authenticated/i);
  assert.match(sql, /revoke all on public\.commerce_subscription_order_links from anon, authenticated/i);
  assert.match(sql, /grant select, insert, update, delete on public\.commerce_subscriptions to service_role/i);
});
