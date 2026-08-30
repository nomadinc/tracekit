import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { evaluateCommerceAlerts, evaluateCommerceProductMappingAlert, loadCommerceProductMappingHealth, MISSED_SYNC_CRITICAL_MS, MISSED_SYNC_WARNING_MS, type CommerceHealthSnapshot } from "./commerce-operational-alerts.ts";

const now = "2026-08-29T20:00:00.000Z";
const ago = (ms: number) => new Date(Date.parse(now) - ms).toISOString();
function snapshot(overrides: Partial<CommerceHealthSnapshot> = {}): CommerceHealthSnapshot {
  return {
    organizationId: "org", connectionId: "connection", providerAccountId: "provider-account", resource: "transactions", now,
    scheduleEnabled: true, activationState: "enabled", productionControlEnabled: true, paused: false, liveActivated: false,
    lastSuccessfulAt: ago(60 * 60_000), lastAttemptedAt: ago(60 * 60_000), continuousStatus: "current", lastStoppingReason: "stable_known_boundary", warnings: [],
    quotaRemaining: 9990, quotaObservedAt: ago(10 * 60_000), quotaMinimumRemaining: 1000,
    recentRuns: [{ status: "completed", created_at: ago(60 * 60_000), stopping_reason: "stable_known_boundary" }], bootstrap: { status: "completed", claimed_at: ago(60 * 60_000) }, expiredLeaseRecoveries: 0,
    ...overrides,
  };
}
const active = (value: CommerceHealthSnapshot) => evaluateCommerceAlerts(value).filter((condition) => condition.active);
const find = (value: CommerceHealthSnapshot, code: string) => evaluateCommerceAlerts(value).find((condition) => condition.code === code)!;

test("healthy hourly connection produces no alert", () => assert.deepEqual(active(snapshot()), []));
test("one delayed cron inside tolerance produces no missed alert", () => assert.equal(find(snapshot({ lastSuccessfulAt: ago(MISSED_SYNC_WARNING_MS - 1) }), "missed_success").active, false));
test("90-minute missed success is warning", () => assert.equal(find(snapshot({ lastSuccessfulAt: ago(MISSED_SYNC_WARNING_MS + 1) }), "missed_success").severity, "warning"));
test("prolonged missed success escalates", () => assert.equal(find(snapshot({ lastSuccessfulAt: ago(MISSED_SYNC_CRITICAL_MS + 1) }), "missed_success").severity, "critical"));
test("intentional pause suppresses missed success", () => assert.equal(find(snapshot({ paused: true, lastSuccessfulAt: ago(MISSED_SYNC_CRITICAL_MS + 1) }), "missed_success").active, false));
test("disabled schedule or production control suppresses missed success", () => {
  assert.equal(find(snapshot({ scheduleEnabled: false, lastSuccessfulAt: null }), "missed_success").active, false);
  assert.equal(find(snapshot({ productionControlEnabled: false, lastSuccessfulAt: null }), "missed_success").active, false);
});
test("failed state alerts and recovered state clears", () => {
  assert.equal(find(snapshot({ continuousStatus: "failed", recentRuns: [{ status: "failed", created_at: now, last_error_code: "provider_timeout" }] }), "continuous_failed").active, true);
  assert.equal(find(snapshot(), "continuous_failed").active, false);
});
test("401 403 and credential failures are immediately critical", () => {
  for (const last_error_code of ["provider_401", "provider_403", "credential_decryption_failed", "invalid_configuration"]) {
    const result = find(snapshot({ continuousStatus: "failed", recentRuns: [{ status: "failed", created_at: now, last_error_code }] }), "provider_access");
    assert.equal(result.active, true); assert.equal(result.severity, "critical"); assert.equal(result.automaticRecoveryExpected, false);
    assert.equal(find(snapshot({ continuousStatus: "failed", recentRuns: [{ status: "failed", created_at: now, last_error_code }] }), "continuous_failed").active, false);
  }
});
test("single degraded cycle warns and self-recovery clears it", () => {
  const degraded = snapshot({ continuousStatus: "degraded", recentRuns: [{ status: "completed_with_warnings", created_at: now }] });
  assert.equal(find(degraded, "continuous_degraded").severity, "warning");
  assert.equal(find(snapshot(), "continuous_degraded").active, false);
});
test("consecutive degraded cycles escalate", () => {
  const recentRuns = [1, 2].map((n) => ({ status: "completed_with_warnings", created_at: ago(n * 60_000) }));
  assert.equal(find(snapshot({ continuousStatus: "degraded", recentRuns }), "continuous_degraded").severity, "critical");
});
test("successful quota bootstrap does not alert", () => assert.equal(find(snapshot(), "quota_bootstrap").active, false));
test("bootstrap failure warns then escalates when prolonged", () => {
  assert.equal(find(snapshot({ bootstrap: { status: "failed", claimed_at: ago(30 * 60_000), failed_at: ago(30 * 60_000) } }), "quota_bootstrap").severity, "warning");
  assert.equal(find(snapshot({ bootstrap: { status: "failed", claimed_at: ago(180 * 60_000), failed_at: ago(180 * 60_000) } }), "quota_bootstrap").severity, "critical");
});
test("quota floor suppression uses the eight-request budget", () => {
  const result = find(snapshot({ quotaRemaining: 1007 }), "quota_floor");
  assert.equal(result.active, true); assert.equal(result.context.required_budget, 8);
});
test("expired lease recovery warns once and escalates when repeated", () => {
  assert.equal(find(snapshot({ expiredLeaseRecoveries: 1 }), "expired_lease").severity, "warning");
  assert.equal(find(snapshot({ expiredLeaseRecoveries: 2 }), "expired_lease").severity, "critical");
});
test("single page-shift/deep scan is not critical", () => {
  const recentRuns = [{ status: "completed_with_warnings", created_at: now, page_shift_detected: true, deeper_reconciliation_required: true }];
  assert.equal(find(snapshot({ continuousStatus: "degraded", recentRuns }), "deep_reconciliation").severity, "warning");
  assert.equal(find(snapshot({ continuousStatus: "degraded", recentRuns }), "continuous_degraded").active, false);
});
test("repeated deep reconciliation escalates while a recovered current state clears", () => {
  const recentRuns = [1, 2].map((n) => ({ status: "completed_with_warnings", created_at: ago(n * 60_000), stopping_reason: "bounded_scan_limit", deeper_reconciliation_required: true }));
  assert.equal(find(snapshot({ continuousStatus: "degraded", recentRuns }), "deep_reconciliation").severity, "critical");
  assert.equal(find(snapshot({ continuousStatus: "current", recentRuns }), "deep_reconciliation").active, false);
});
test("safe context contains operational scope and no provider payload", () => {
  const context = find(snapshot({ continuousStatus: "failed", recentRuns: [{ status: "failed", created_at: now, last_error_code: "provider_500" }] }), "continuous_failed").context;
  assert.deepEqual(Object.keys(context).sort(), ["connection_id", "error_code", "last_attempted_at", "last_stopping_reason", "last_successful_at", "provider", "provider_account_id", "resource"].sort());
});
test("alert lifecycle uses stable open-incident identity, resolution, and Operations projection", () => {
  const source = readFileSync(new URL("./commerce-operational-alerts.ts", import.meta.url), "utf8");
  assert.match(source, /eq\("alert_code", alertCode\(snapshot, code\)\)/);
  assert.match(source, /\.in\("status", \["open", "acknowledged"\]\)/);
  assert.match(source, /status: "resolved"/);
  assert.match(source, /upsertWorkItemCandidate/);
  assert.match(source, /source: "commerce"/);
});
test("scheduler and queue/runtime failures reconcile independently without blocking commerce execution", () => {
  const index = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  assert.match(index, /reconcileCommerceSchedulerSignals\(getSupabase\(env\), true/);
  assert.match(index, /reconcileCommerceSchedulerSignals\(getSupabase\(env\), false/);
  assert.match(index, /code: "queue_runtime_failure"/);
  assert.match(index, /ctx\.waitUntil\(reconcileCommerceExecutionSignal/);
});
test("unmapped provider Product is a review warning and material revenue raises priority without guessing", () => {
  const result = evaluateCommerceProductMappingAlert({ providerProductId: "provider-product", mappingStatus: "review_required", integrityStatus: "unmapped", orderCount: 10, grossRevenue: 500, firstSeenAt: now, lastSeenAt: now });
  assert.equal(result.active, true); assert.equal(result.severity, "warning"); assert.equal(result.priority, "high"); assert.match(result.summary, /not assigned/);
});
test("mapping conflict is critical and resolved mapping closes its incident", () => {
  const conflict = evaluateCommerceProductMappingAlert({ providerProductId: "provider-product", mappingStatus: "approved", integrityStatus: "conflict", orderCount: 1, grossRevenue: 1, firstSeenAt: now, lastSeenAt: now });
  const resolved = evaluateCommerceProductMappingAlert({ providerProductId: "provider-product", mappingStatus: "approved", integrityStatus: "resolved", orderCount: 1, grossRevenue: 1, firstSeenAt: now, lastSeenAt: now });
  assert.equal(conflict.severity, "critical"); assert.equal(conflict.priority, "urgent"); assert.equal(resolved.active, false);
});
test("product alert identity is provider-product scoped and projects to Operations", () => {
  const source = readFileSync(new URL("./commerce-operational-alerts.ts", import.meta.url), "utf8");
  assert.match(source, /`\$\{type\}:\$\{product\.providerProductId\}`/);
  assert.match(source, /commerce_product_mapping_health_v1/);
  assert.match(source, /provider_product_id: product\.providerProductId/);
});
test("product mapping health loader executes the deployed view contract and returns its shape", async () => {
  const calls: Array<[string, string]> = [];
  const expected = [{ provider_product_id: "provider-product", mapping_status: "review_required", integrity_status: "unmapped", order_count: 2, gross_revenue: 30, first_seen_at: now, last_seen_at: now }];
  const query: any = {
    select(columns: string) { calls.push(["select", columns]); return this; },
    eq(column: string, value: string) { calls.push([column, value]); return this; },
    then(resolve: (value: unknown) => unknown) { return Promise.resolve(resolve({ data: expected, error: null })); },
  };
  const db = { from(table: string) { calls.push(["from", table]); return query; } };
  const result = await loadCommerceProductMappingHealth(db, snapshot());
  assert.deepEqual(result, expected);
  assert.deepEqual(calls, [
    ["from", "commerce_product_mapping_health_v1"],
    ["select", "provider_product_id,mapping_status,integrity_status,order_count,gross_revenue,first_seen_at,last_seen_at"],
    ["organization_id", "org"], ["connection_id", "connection"], ["provider_account_id", "provider-account"],
  ]);
});
test("product mapping health failures preserve only sanitized PostgREST diagnostics", async () => {
  const query: any = { select() { return this; }, eq() { return this; }, then(resolve: (value: unknown) => unknown) { return Promise.resolve(resolve({ data: null, error: { code: "PGRST205", message: "raw details must not be logged" } })); } };
  await assert.rejects(() => loadCommerceProductMappingHealth({ from: () => query }, snapshot()), (error: any) => {
    assert.equal(error.operation, "product_mapping_health_read");
    assert.equal(error.errorCode, "PGRST205");
    assert.equal(error.errorMessage, "relation_not_in_schema_cache");
    assert.doesNotMatch(JSON.stringify(error), /raw details/);
    return true;
  });
});
test("mapping health migration is read-only, security-invoker, scoped, and never infers a target", () => {
  const migration = readFileSync(new URL("../../supabase/migrations/20260830033844_commerce_product_mapping_health.sql", import.meta.url), "utf8");
  assert.match(migration, /with \(security_invoker = true\)/);
  assert.match(migration, /p\.organization_id/); assert.match(migration, /p\.connection_id/); assert.match(migration, /p\.provider_account_id/);
  assert.match(migration, /mapping_status in \('observed', 'proposed', 'review_required'\)/);
  assert.doesNotMatch(migration, /insert into|update public|delete from/i);
  assert.match(migration, /revoke all.*anon, authenticated/);
});
test("Commerce persistence keeps immutable identities, approved mappings, lines, and Refund links scoped", () => {
  const persistence = readFileSync(new URL("../../supabase/migrations/039_commerce_persistence_v1.sql", import.meta.url), "utf8");
  const control = readFileSync(new URL("../../supabase/migrations/040_commerce_control_plane_v1.sql", import.meta.url), "utf8");
  const ingestion = readFileSync(new URL("../../supabase/migrations/043_commerce_shadow_ingestion_v1.sql", import.meta.url), "utf8");
  const refunds = readFileSync(new URL("../../supabase/migrations/044_commerce_refund_normalization_v1.sql", import.meta.url), "utf8");
  assert.match(persistence, /unique \(connection_id, provider_account_id, provider_product_id\)/);
  assert.match(control, /platform_orders_provider_source_uidx[\s\S]*connection_id, provider_account_id, provider_order_id/);
  assert.match(control, /commerce_product_mapping_decision_immutable_guard/);
  const productUpsert = ingestion.slice(ingestion.indexOf("insert into public.commerce_provider_products"), ingestion.indexOf("insert into public.commerce_source_mappings"));
  assert.doesNotMatch(productUpsert, /mapping_status=excluded|canonical_offer_id=excluded|offer_step_id=excluded|offer_variant_id=excluded/);
  assert.match(ingestion, /unique \(connection_id, provider_account_id, canonical_order_id, source_line_key\)/);
  assert.match(refunds, /foreign key \(organization_id,canonical_order_id\) references public\.platform_orders/);
  assert.match(refunds, /unique\(connection_id,provider_account_id,provider_refund_id\)/);
});
