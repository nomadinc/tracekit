import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const migrationsDirectory = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
const recoveryFile = "20260918054652_restore_next29_scheduler_rpcs.sql";
const recovery = readFileSync(new URL(`../../supabase/migrations/${recoveryFile}`, import.meta.url), "utf8");
const sharedLease = readFileSync(new URL("../../supabase/migrations/096_everflow_scheduler_runtime.sql", import.meta.url), "utf8");

test("preserves the isolated Production-backed Next29 migration identities", () => {
  const version089Files = readdirSync(migrationsDirectory)
    .filter((file) => file.match(/^089_.*\.sql$/))
    .sort();
  assert.deepEqual(version089Files, ["089_everflow_affiliates_v1.sql"]);
  assert.equal(existsSync(new URL("../../supabase/migrations/089_restore_next29_scheduler_rpcs.sql", import.meta.url)), false);
  assert.equal(existsSync(new URL(`../../supabase/migrations/${recoveryFile}`, import.meta.url)), true);

  const relevantVersions = ["096", "20260902030000", "20260902043000", "20260918054652"];
  assert.equal(new Set(relevantVersions).size, relevantVersions.length);
  assert.ok(BigInt(relevantVersions[3]) > BigInt(relevantVersions[0]));
  assert.ok(BigInt(relevantVersions[3]) > BigInt(relevantVersions[1]));
  assert.ok(BigInt(relevantVersions[3]) > BigInt(relevantVersions[2]));
  assert.equal(existsSync(new URL("../../supabase/migrations/20260902030000_next29_incremental_scheduler_foundation.sql", import.meta.url)), false);
  assert.equal(existsSync(new URL("../../supabase/migrations/20260902043000_next29_scheduler_dispatch_runtime.sql", import.meta.url)), false);
  assert.equal(existsSync(new URL("../../supabase/history/non-deployable/migrations/20260902030000_next29_incremental_scheduler_foundation.sql", import.meta.url)), true);
  assert.equal(existsSync(new URL("../../supabase/history/non-deployable/migrations/20260902043000_next29_scheduler_dispatch_runtime.sql", import.meta.url)), true);
  assert.equal(
    createHash("sha256").update(recovery).digest("hex"),
    "0878cd78d197ec33fae3bfaae326d089871c38926453ea1a93d63e5947fa3161",
  );
});

test("migration 096 remains the sole lease-column prerequisite for the recovery", () => {
  const prerequisite = /alter table public\.commerce_sync_schedules\s+add column if not exists lease_owner text,\s+add column if not exists lease_expires_at timestamptz,\s+add column if not exists lease_heartbeat_at timestamptz;/;
  assert.match(sharedLease, prerequisite);
  assert.doesNotMatch(recovery, /add column(?: if not exists)? lease_(?:owner|expires_at|heartbeat_at)/);
});

test("Next29 recovery preserves disabled provisioning and lease-aware RPC behavior", () => {
  assert.match(recovery, /false,\s+'disabled',\s+now\(\),\s+'hourly'/);
  assert.match(recovery, /or \(v_schedule\.lease_owner is not null and v_schedule\.lease_expires_at>=p_now\) then/);
  assert.match(recovery, /and \(s\.lease_owner is null or s\.lease_expires_at<p_now\)/);
  assert.match(recovery, /set lease_owner=p_lease_owner,[\s\S]*lease_heartbeat_at=p_now/);
  assert.match(recovery, /lease_owner=null,[\s\S]*lease_expires_at=null,[\s\S]*lease_heartbeat_at=null/);
  assert.match(recovery, /and s\.lease_owner=p_lease_owner\s+and s\.lease_expires_at>=p_now/);
  for (const functionName of [
    "ensure_next29_resource_schedules",
    "claim_next29_resource_schedule",
    "finish_next29_resource_schedule",
    "list_due_next29_resource_schedules",
    "heartbeat_next29_resource_schedule",
  ]) assert.match(recovery, new RegExp(`create or replace function public\\.${functionName}`));
});
