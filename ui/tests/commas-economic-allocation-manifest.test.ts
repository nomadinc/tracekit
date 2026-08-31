import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260831012648_frozen_commas_economic_allocation_manifest.sql", import.meta.url),
  "utf8",
);

test("known 9,431-order reference fixture conserves without becoming a production constant", () => {
  const counts = new Map([[67, 6317], [92, 577], [106, 602], [131, 1935]]);
  const orders = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
  const providerGross = Array.from(counts).reduce((sum, [gross, count]) => sum + gross * count, 0);
  const frontEnd = orders * 67;
  const booster = ((counts.get(92) || 0) + (counts.get(131) || 0)) * 25;
  const fastTrack = ((counts.get(106) || 0) + (counts.get(131) || 0)) * 39;
  assert.deepEqual({ orders, providerGross, frontEnd, booster, fastTrack, allocated: frontEnd + booster + fastTrack }, {
    orders: 9431, providerGross: 793620, frontEnd: 631877, booster: 62800, fastTrack: 98943, allocated: 793620,
  });
  assert.doesNotMatch(migration, /9431|793620|631877|62800|98943/);
});

test("manifest header and items freeze complete allocation inputs", () => {
  assert.match(migration, /create table public\.commerce_economic_allocation_manifests/);
  assert.match(migration, /create table public\.commerce_economic_allocation_manifest_items/);
  for (const field of [
    "provider_product_external_id", "mapping_status", "mapping_version", "business_context_id",
    "canonical_offer_id", "offer_step_id", "offer_variant_id", "gross_amount", "source_currency",
    "currency_basis", "order_status", "order_status_norm", "allocation_input_fingerprint",
  ]) assert.match(migration, new RegExp(`${field} [a-z]`));
  assert.match(migration, /cohort_fingerprint text/);
  assert.match(migration, /row_number\(\) over\(order by e\.canonical_order_id\)::bigint item_sequence/);
});

test("manifest creation uses the existing pure allocation engine and freezes atomically", () => {
  assert.match(migration, /create_commas_economic_allocation_manifest_v1[\s\S]*compute_commas_pbs_order_economic_lines_v1/);
  assert.match(migration, /having count\(l\.\*\)>0/);
  assert.match(migration, /expected_allocated_gross_amount,2\)<>round\(gross_amount,2\)[\s\S]*manifest item conservation failed/);
  assert.match(migration, /status='frozen',frozen_at=now\(\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /status in \('building','frozen','writing'\)/);
});

test("frozen items and financial baseline are database-immutable", () => {
  assert.match(migration, /frozen economic allocation manifest items are immutable/);
  assert.match(migration, /frozen economic allocation manifest baseline is immutable/);
  assert.match(migration, /before insert or update or delete on public\.commerce_economic_allocation_manifest_items/);
  for (const field of ["cohort_count", "provider_gross_total", "expected_allocated_gross_total", "cohort_fingerprint"])
    assert.match(migration, new RegExp(`new\.${field} is distinct from old\.${field}`));
});

test("input and cohort fingerprints are deterministic SHA-256 contracts", () => {
  assert.match(migration, /commas_economic_allocation_input_fingerprint_v1/);
  assert.match(migration, /extensions\.digest\(jsonb_build_array\([\s\S]*'sha256'\)/);
  assert.match(migration, /string_agg\([\s\S]*allocation_input_fingerprint[\s\S]*order by item_sequence/);
  assert.match(migration, /cohort_fingerprint ~ '\^\[0-9a-f\]\{64\}\$'/);
});

test("manifest execution prevalidates a whole bounded batch before writing", () => {
  const validation = migration.indexOf("-- Validate and lock the complete batch");
  const writing = migration.indexOf("if not p_dry_run and v_seen>0");
  assert.ok(validation >= 0 && writing > validation);
  assert.match(migration, /item_sequence>coalesce\(p_after_item_sequence,0\)[\s\S]*limit p_batch_size/);
  assert.match(migration, /p_batch_size<1 or p_batch_size>500/);
  assert.match(migration, /v_live_fingerprint<>r\.allocation_input_fingerprint/);
  assert.match(migration, /'status','manifest_stale'/);
});

test("manifest write reuses idempotent reconciliation and cannot expand to new orders", () => {
  const execution = migration.slice(
    migration.indexOf("create or replace function public.backfill_commas_order_economic_allocations_from_manifest_v1"),
    migration.indexOf("revoke all on function public.commas_economic_allocation_input_fingerprint_v1"),
  );
  assert.match(execution, /reconcile_commas_order_economic_allocation_v1\([\s\S]*r\.canonical_order_id,false/);
  assert.doesNotMatch(execution, /for r in select \* from public\.platform_orders/);
  assert.match(execution, /from public\.commerce_economic_allocation_manifest_items[\s\S]*item_sequence>coalesce/);
  assert.doesNotMatch(migration, /(update|delete from) public\.(platform_orders|commerce_order_lines|commerce_product_mapping_decisions|commerce_refund_events|commerce_provider_disputes|commerce_evidence_records)/);
});

test("completion requires persisted manifest totals and zero per-order violations", () => {
  assert.match(migration, /v_violations<>0 or v_actual_orders<>v_manifest\.cohort_count/);
  assert.match(migration, /v_actual_gross[\s\S]*v_manifest\.expected_allocated_gross_total/);
  assert.match(migration, /v_actual_front[\s\S]*v_manifest\.expected_front_end_total/);
  assert.match(migration, /v_actual_booster[\s\S]*v_manifest\.expected_revenue_booster_total/);
  assert.match(migration, /v_actual_fast[\s\S]*v_manifest\.expected_fast_track_total/);
  assert.match(migration, /status='completed',completed_at=now\(\)/);
});

test("manifest surfaces are RLS-protected service-role-only SECURITY INVOKER contracts", () => {
  assert.equal((migration.match(/enable row level security/g) || []).length, 2);
  assert.match(migration, /revoke all on public\.commerce_economic_allocation_manifests from public, anon, authenticated, authenticator/);
  assert.match(migration, /revoke all on public\.commerce_economic_allocation_manifest_items from public, anon, authenticated, authenticator/);
  for (const name of [
    "commas_economic_allocation_input_fingerprint_v1", "guard_commerce_economic_allocation_manifest_v1",
    "create_commas_economic_allocation_manifest_v1", "backfill_commas_order_economic_allocations_from_manifest_v1",
  ]) {
    assert.match(migration, new RegExp(`function public\\.${name}\\([\\s\\S]*?security invoker`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\(`));
  }
  assert.doesNotMatch(migration, /grant (?:select|insert|update|delete|execute).* to (?:public|anon|authenticated|authenticator)/);
});
