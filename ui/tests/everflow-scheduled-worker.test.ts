import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const source = (relative: string) => readFileSync(`${repoRoot}/${relative}`, "utf8");

test("Everflow scheduled worker discovers schedules without auto-activating them", () => {
  const migration = source("supabase/migrations/088_everflow_scheduler_runtime.sql");
  const worker = source("ui/lib/integrations/everflow-scheduled-worker.ts");

  assert.match(migration, /ensure_everflow_conversion_schedules/);
  assert.match(migration, /'everflow_conversions'[\s\S]*false,[\s\S]*'disabled'/);
  assert.match(worker, /ensureEverflowConversionSchedules/);
  assert.match(worker, /rpc\/ensure_everflow_conversion_schedules/);
});

test("Everflow scheduler uses atomic owner-checked leases and records enqueue time on claim", () => {
  const migration = source("supabase/migrations/088_everflow_scheduler_runtime.sql");
  const worker = source("ui/lib/integrations/everflow-scheduled-worker.ts");

  assert.match(migration, /claim_everflow_conversion_schedule/);
  assert.match(migration, /last_enqueued_at=p_now/);
  assert.match(migration, /commerce_schedule_permitted\(v_schedule\.organization_id,v_schedule\.connection_id\)/);
  assert.match(migration, /finish_everflow_conversion_schedule/);
  assert.match(migration, /s\.lease_owner=p_lease_owner/);
  assert.match(worker, /rpc\/claim_everflow_conversion_schedule/);
  assert.match(worker, /rpc\/finish_everflow_conversion_schedule/);
});

test("automatic Everflow selection excludes manual schedules and reuses the incremental engine", () => {
  const worker = source("ui/lib/integrations/everflow-scheduled-worker.ts");

  assert.match(worker, /sync_frequency=neq\.manual/);
  assert.match(worker, /everflowIncrementalWindow/);
  assert.match(worker, /syncEverflowConversions/);
  assert.match(worker, /markEverflowIncrementalChunkSuccess/);
});

test("Everflow scheduler remains additive and does not depend on the Commas runtime", () => {
  const worker = source("ui/lib/integrations/everflow-scheduled-worker.ts");
  const migration = source("supabase/migrations/088_everflow_scheduler_runtime.sql");

  assert.doesNotMatch(worker, /commas-continuous-worker|continuous-commerce-cloudflare|runContinuousCommasSync/);
  assert.doesNotMatch(migration, /runContinuousCommasSync|commas_continuous|continuous_commerce/);
});
