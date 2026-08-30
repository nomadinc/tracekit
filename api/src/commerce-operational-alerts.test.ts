import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { evaluateCommerceAlerts, MISSED_SYNC_CRITICAL_MS, MISSED_SYNC_WARNING_MS, type CommerceHealthSnapshot } from "./commerce-operational-alerts.ts";

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
