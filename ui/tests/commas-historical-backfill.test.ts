import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { combineOrdering, historicalChunkTransition, historicalQuotaAllowed, inHistoricalRange, orderingForPage, parseHistoricalBackfillArgs, rangePassed } from "../lib/commerce/commas-historical-backfill.ts";

test("historical mode requires confirmation and date bounds", () => {
  assert.throws(() => parseHistoricalBackfillArgs(["--historical-backfill"]), /confirm-historical/);
  assert.throws(() => parseHistoricalBackfillArgs(["--historical-backfill", "--confirm-historical-commas-backfill"]), /from-date/);
  const args = parseHistoricalBackfillArgs(["--historical-backfill", "--confirm-historical-commas-backfill", "--from-date=2025-11-14", "--to-date=2026-08-23", "--start-page=1", "--max-pages=1", "--per-page=100"]);
  assert.deepEqual(args, { historical: true, confirmed: true, fromDate: "2025-11-14", toDate: "2026-08-23", startPage: 1, maxPages: 1, perPage: 100 });
});

test("historical bounds cap provider exposure and per-page size", () => {
  assert.throws(() => parseHistoricalBackfillArgs(["--historical-backfill", "--confirm-historical-commas-backfill", "--from-date=2025-11-14", "--to-date=2026-08-23", "--max-pages=9"]), /max-pages/);
  assert.throws(() => parseHistoricalBackfillArgs(["--historical-backfill", "--confirm-historical-commas-backfill", "--from-date=2025-11-14", "--to-date=2026-08-23", "--per-page=101"]), /per-page/);
});

test("quota floor is fail-closed and does not depend on scheduler state", () => {
  assert.equal(historicalQuotaAllowed(null, 8), false);
  assert.equal(historicalQuotaAllowed(1008, 8), true);
  assert.equal(historicalQuotaAllowed(1007, 8), false);
});

test("incomplete historical chunks release as resumable and complete only at the range boundary", () => {
  assert.equal(historicalChunkTransition(false, 0), "paused");
  assert.equal(historicalChunkTransition(false, 2), "paused");
  assert.equal(historicalChunkTransition(true, 0), "completed");
  assert.equal(historicalChunkTransition(true, 1), "completed_with_warnings");
});

test("migration provides an owner-bound lease release without touching scheduler state", async () => {
  const migration = await readFile(new URL("../../supabase/migrations/074_historical_backfill_resumable_release.sql", import.meta.url), "utf8");
  assert.match(migration, /status = 'paused'/);
  assert.match(migration, /lease_owner = p_lease_owner/);
  assert.match(migration, /lease_owner = null/);
  assert.match(migration, /grant execute .* to service_role/i);
  assert.doesNotMatch(migration, /commerce_scheduler|commerce_sync_schedules|Commas/i);
});

test("legacy recovery is hard-coded, one-time, and preserves the run payload", async () => {
  const migration = await readFile(new URL("../../supabase/migrations/075_legacy_historical_backfill_recovery.sql", import.meta.url), "utf8");
  assert.match(migration, /59bf7114-5902-481b-ba49-baa698114109/g);
  assert.match(migration, /status <> 'completed'/);
  assert.match(migration, /historical_backfill/);
  assert.match(migration, /range_complete/);
  assert.match(migration, /resume_page/);
  assert.match(migration, /lease_owner is not null/);
  assert.match(migration, /lease_expires_at is not null/);
  assert.match(migration, /cancelled_at is not null/);
  assert.match(migration, /recovery already consumed/);
  assert.match(migration, /set status = 'paused', updated_at = now\(\)/);
  assert.doesNotMatch(migration, /metadata\s*=/);
  assert.doesNotMatch(migration, /commerce_sync_checkpoints/);
  assert.match(migration, /security definer/i);
  assert.match(migration, /grant execute .* to service_role/i);
});

test("historical mode resumes from an explicit page and reuses the idempotent shadow normalizer", async () => {
  const args = parseHistoricalBackfillArgs(["--historical-backfill", "--confirm-historical-commas-backfill", "--from-date=2025-11-14", "--to-date=2026-08-23", "--start-page=7", "--max-pages=8", "--per-page=100"]);
  assert.equal(args.startPage, 7);
  const source = await readFile(new URL("../scripts/run-commas-shadow-sync.ts", import.meta.url), "utf8");
  assert.match(source, /normalize_commerce_transaction_page_v2/);
  assert.match(source, /commerce_sync_checkpoints/);
  assert.doesNotMatch(source, /run-commas-continuous|commerce_scheduler|bootstrap_mode/);
});

test("ordering is detected, ambiguity fails closed, and range filtering is date based", () => {
  const newest = ["2026-08-23T00:00:00Z", "2026-08-22T00:00:00Z"];
  const oldest = ["2025-11-14T00:00:00Z", "2025-11-15T00:00:00Z"];
  assert.equal(orderingForPage(newest), "newest_first");
  assert.equal(orderingForPage(oldest), "oldest_first");
  assert.equal(combineOrdering("newest_first", "newest_first", newest.at(-1)!, "2026-08-21T00:00:00Z"), "newest_first");
  assert.equal(combineOrdering("newest_first", "oldest_first", newest.at(-1)!, "2026-08-21T00:00:00Z"), "ambiguous");
  assert.equal(orderingForPage(["2026-01-01T00:00:00Z", "2026-01-03T00:00:00Z", "2026-01-02T00:00:00Z"]), "ambiguous");
  assert.equal(inHistoricalRange("2026-01-01T00:00:00Z", "2025-11-14", "2026-08-23"), true);
  assert.equal(inHistoricalRange("2025-11-13T23:00:00Z", "2025-11-14", "2026-08-23"), false);
  assert.equal(rangePassed("newest_first", ["2025-11-13T00:00:00Z"], "2025-11-14", "2026-08-23"), true);
  assert.equal(rangePassed("oldest_first", ["2026-08-24T00:00:00Z"], "2025-11-14", "2026-08-23"), true);
  assert.equal(rangePassed("unknown", ["2026-01-01T00:00:00Z"], "2025-11-14", "2026-08-23"), false);
});
