import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = () => readFileSync(`${root}/lib/integrations/everflow-conversions.ts`, "utf8");
const migration = () => readFileSync(`${root}/../supabase/migrations/084_everflow_conversion_api_ingestion.sql`, "utf8");

test("Everflow conversion client uses the bounded Network reporting endpoint and URL pagination", () => {
  const text = source();
  assert.match(text, /EVERFLOW_CONVERSIONS_PATH = "\/v1\/networks\/reporting\/conversions"/);
  assert.match(text, /\?page=\$\{page\}&page_size=\$\{pageSize\}/);
  assert.match(text, /show_conversions: true/);
  assert.match(text, /show_events: true/);
  assert.match(text, /timezone_id: input\.timezoneId/);
  assert.match(text, /currency_id: currencyId/);
  assert.match(text, /EVERFLOW_CONVERSION_MAX_RANGE_DAYS = 31/);
  assert.match(text, /EVERFLOW_CONVERSION_MAX_PAGES = 50/);
  assert.match(text, /EVERFLOW_CONVERSION_TIMEOUT_MS = 10_000/);
});

test("conversion normalization retains attribution dimensions required by TraceKit", () => {
  const text = source();
  for (const field of [
    "conversionId", "transactionId", "affiliateId", "affiliateName", "advertiserId", "offerId", "offerName",
    "campaignId", "sourceId", "sub1", "sub2", "sub3", "sub4", "sub5", "eventName", "revenue",
    "saleAmount", "payout", "orderId", "attributionMethod",
  ]) assert.match(text, new RegExp(field));
  assert.match(text, /relationship\(row, "affiliate"\)/);
  assert.match(text, /relationship\(row, "offer"\)/);
  assert.match(text, /relationship\(row, "campaign"\)/);
});

test("live conversion ingestion hashes provider IP evidence before persistence", () => {
  const text = source();
  assert.match(text, /sessionIpHash.*sha256Text/s);
  assert.match(text, /conversionIpHash.*sha256Text/s);
  assert.match(text, /session_ip_hash: conversion\.sessionIpHash/);
  assert.match(text, /conversion_ip_hash: conversion\.conversionIpHash/);
  const persistence = text.slice(text.indexOf("export async function persistEverflowConversions"), text.indexOf("type ConversionSyncPlane"));
  assert.doesNotMatch(persistence, /session_user_ip\s*:/);
  assert.doesNotMatch(persistence, /conversion_user_ip\s*:/);
  assert.doesNotMatch(persistence, /raw_json|raw_payload|payload\s*:/);
});

test("Step 7 extends protected Everflow conversion evidence instead of inventing another conversion table", () => {
  const sql = migration();
  assert.match(sql, /alter table public\.everflow_conversion_events/);
  assert.doesNotMatch(sql, /create table public\.everflow_(?:live_)?conversions/);
  assert.match(sql, /ingestion_method.*historical_file/);
  assert.match(sql, /ingestion_method = 'api'/);
  assert.match(sql, /provider_account_id is not null/);
  assert.match(sql, /sync_run_id is not null/);
  assert.match(sql, /unique index everflow_conversion_events_api_identity_uidx/);
});

test("API conversion evidence is tenant, provider-account, and sync-run scoped", () => {
  const sql = migration();
  assert.match(sql, /foreign key \(organization_id, connection_id, provider_account_id\)/);
  assert.match(sql, /references public\.commerce_provider_accounts/);
  assert.match(sql, /foreign key \(organization_id, connection_id, provider_account_id, sync_run_id\)/);
  assert.match(sql, /references public\.commerce_sync_runs/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.everflow_conversion_events from anon, authenticated/);
});

test("overlap reads are idempotent and cannot move a persisted event primary key", () => {
  const text = source();
  const sql = migration();
  assert.match(text, /everflow_conversion_events\?on_conflict=connection_id,provider_account_id,source_identity/);
  assert.match(text, /resolution=merge-duplicates/);
  assert.match(sql, /everflow_conversion_events_preserve_id/);
  assert.match(sql, /new\.id := old\.id/);
});

test("conversion sync uses durable runs, checkpoints, leases, and the Step 6 order resolver", () => {
  const text = source();
  assert.match(text, /createSyncRun/);
  assert.match(text, /"shadow", "everflow_conversions"/);
  assert.match(text, /claimSyncRun/);
  assert.match(text, /beginCheckpoint/);
  assert.match(text, /completeCheckpoint/);
  assert.match(text, /failCheckpoint/);
  assert.match(text, /heartbeatSyncRun/);
  assert.match(text, /completeSyncRun/);
  assert.match(text, /failSyncRun/);
  assert.match(text, /resolveAndMapEverflowOrder/);
  assert.match(text, /sourceRecordId: conversion\.conversionId/);
  assert.match(text, /transactionId: conversion\.transactionId/);
  assert.match(text, /amount: conversion\.saleAmount \?\? conversion\.revenue/);
});

test("conversion sync requires verified reporting metadata instead of guessing timezone or currency", () => {
  const text = source();
  assert.match(text, /connection\.capabilities\?\.everflowNetwork/);
  assert.match(text, /timezoneId/);
  assert.match(text, /currencyId/);
  assert.match(text, /Re-verify the connection/);
  assert.doesNotMatch(text, /timezoneId\s*=\s*80/);
});

test("conversion sync route is authenticated, same-origin, bounded, and never accepts API credentials", () => {
  const route = readFileSync(`${root}/app/v1/integrations/everflow/conversions/sync/route.ts`, "utf8");
  assert.match(route, /resolveApplicationSession/);
  assert.match(route, /sameOrigin/);
  assert.match(route, /validateEverflowConversionRange/);
  assert.match(route, /syncEverflowConversions/);
  assert.doesNotMatch(route, /body\?\.apiKey/);
  assert.doesNotMatch(route, /NextResponse\.json\([^\n]*(?:email|transactionId)/);
});
