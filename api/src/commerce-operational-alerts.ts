import { upsertWorkItemCandidate, type WorkItemCandidate } from "./work-items.ts";

export const COMMERCE_ALERT_ENGINE_VERSION = "commerce_alerts_v1";
export const MISSED_SYNC_WARNING_MS = 90 * 60_000;
export const MISSED_SYNC_CRITICAL_MS = 150 * 60_000;

type Severity = "warning" | "critical";
export type CommerceAlertCondition = {
  code: string;
  active: boolean;
  severity: Severity;
  title: string;
  summary: string;
  automaticRecoveryExpected: boolean;
  context: Record<string, unknown>;
};

export type CommerceHealthSnapshot = {
  organizationId: string;
  connectionId: string;
  providerAccountId: string;
  resource: string;
  now: string;
  scheduleEnabled: boolean;
  activationState: string;
  productionControlEnabled: boolean;
  paused: boolean;
  liveActivated: boolean;
  lastSuccessfulAt: string | null;
  lastAttemptedAt: string | null;
  continuousStatus: string;
  lastStoppingReason: string | null;
  warnings: Array<{ code?: string }>;
  quotaRemaining: number | null;
  quotaObservedAt: string | null;
  quotaMinimumRemaining: number;
  recentRuns: Array<{ status: string; created_at: string; last_error_code?: string | null; stopping_reason?: string | null; deeper_reconciliation_required?: boolean; page_shift_detected?: boolean }>;
  bootstrap: { status: string; claimed_at: string; failed_at?: string | null } | null;
  expiredLeaseRecoveries: number;
};

const failureCode = (snapshot: CommerceHealthSnapshot) => String(snapshot.recentRuns.find((run) => run.status === "failed")?.last_error_code || snapshot.warnings[0]?.code || "").toLowerCase();
const operatorRequired = (code: string) => /(^|_)(401|403|auth|authentication|authorization|credential|decrypt|configuration)(_|$)/.test(code);
const consecutive = (runs: CommerceHealthSnapshot["recentRuns"], predicate: (run: CommerceHealthSnapshot["recentRuns"][number]) => boolean) => {
  let count = 0;
  for (const run of runs) { if (!predicate(run)) break; count += 1; }
  return count;
};
const safeScope = (snapshot: CommerceHealthSnapshot) => ({
  provider: "commas", resource: snapshot.resource, connection_id: snapshot.connectionId,
  provider_account_id: snapshot.providerAccountId, last_attempted_at: snapshot.lastAttemptedAt,
  last_successful_at: snapshot.lastSuccessfulAt, last_stopping_reason: snapshot.lastStoppingReason,
});

export function evaluateCommerceAlerts(snapshot: CommerceHealthSnapshot): CommerceAlertCondition[] {
  const enabled = snapshot.scheduleEnabled && snapshot.activationState === "enabled" && snapshot.productionControlEnabled && !snapshot.paused && !snapshot.liveActivated;
  const nowMs = Date.parse(snapshot.now);
  const successAge = snapshot.lastSuccessfulAt ? nowMs - Date.parse(snapshot.lastSuccessfulAt) : Number.POSITIVE_INFINITY;
  const code = failureCode(snapshot);
  const degradedRuns = consecutive(snapshot.recentRuns, (run) => run.status === "completed_with_warnings");
  const deepRuns = consecutive(snapshot.recentRuns, (run) => Boolean(run.deeper_reconciliation_required || run.page_shift_detected || run.stopping_reason === "bounded_scan_limit"));
  const bootstrapFailed = snapshot.bootstrap?.status === "failed";
  const bootstrapAge = bootstrapFailed ? nowMs - Date.parse(snapshot.bootstrap?.failed_at || snapshot.bootstrap?.claimed_at || snapshot.now) : 0;
  const quotaSuppressed = snapshot.quotaRemaining !== null && snapshot.quotaRemaining - 8 < snapshot.quotaMinimumRemaining;
  const base = safeScope(snapshot);
  return [
    {
      code: "continuous_failed", active: snapshot.continuousStatus === "failed" && !operatorRequired(code), severity: "warning",
      title: "Commas continuous synchronization failed", summary: "The failed cycle is durable and a later eligible cycle may recover automatically.",
      automaticRecoveryExpected: true, context: { ...base, error_code: code || null },
    },
    {
      code: "provider_access", active: operatorRequired(code) && snapshot.continuousStatus === "failed", severity: "critical",
      title: "Commas provider access requires attention", summary: "Authentication, authorization, credential, or configuration validation failed.",
      automaticRecoveryExpected: false, context: { ...base, error_code: code || "provider_access_failure" },
    },
    {
      code: "continuous_degraded", active: snapshot.continuousStatus === "degraded" && deepRuns === 0, severity: degradedRuns >= 2 ? "critical" : "warning",
      title: "Commas continuous synchronization is degraded", summary: degradedRuns >= 2 ? "Degradation persisted across consecutive cycles." : "A conservative warning is being observed for automatic recovery on the next cycle.",
      automaticRecoveryExpected: true, context: { ...base, consecutive_degraded_cycles: degradedRuns, warning_codes: snapshot.warnings.map((warning) => String(warning.code || "").replace(/[^a-z0-9_.-]/gi, "_").slice(0, 80)).filter(Boolean) },
    },
    {
      code: "missed_success", active: enabled && successAge > MISSED_SYNC_WARNING_MS, severity: successAge > MISSED_SYNC_CRITICAL_MS ? "critical" : "warning",
      title: "Commas hourly synchronization is overdue", summary: successAge > MISSED_SYNC_CRITICAL_MS ? "No successful cycle has completed for more than 150 minutes." : "No successful cycle has completed for more than 90 minutes.",
      automaticRecoveryExpected: true, context: { ...base, success_age_minutes: Number.isFinite(successAge) ? Math.floor(successAge / 60_000) : null },
    },
    {
      code: "expired_lease", active: snapshot.expiredLeaseRecoveries > 0, severity: snapshot.expiredLeaseRecoveries > 1 ? "critical" : "warning",
      title: "Commas worker lease expired", summary: snapshot.expiredLeaseRecoveries > 1 ? "Multiple leases expired within the observation window." : "One expired lease was terminalized automatically.",
      automaticRecoveryExpected: true, context: { ...base, recoveries_24h: snapshot.expiredLeaseRecoveries },
    },
    {
      code: "quota_bootstrap", active: Boolean(bootstrapFailed), severity: bootstrapAge > MISSED_SYNC_CRITICAL_MS ? "critical" : "warning",
      title: "Commas quota bootstrap failed", summary: bootstrapAge > MISSED_SYNC_CRITICAL_MS ? "Quota recovery remains unresolved long enough to threaten multiple cycles." : "The one-request quota observation failed and is throttled before retry.",
      automaticRecoveryExpected: true, context: { ...base, bootstrap_status: snapshot.bootstrap?.status || null },
    },
    {
      code: "quota_floor", active: enabled && quotaSuppressed, severity: successAge > MISSED_SYNC_CRITICAL_MS ? "critical" : "warning",
      title: "Commas quota reserve prevents synchronization", summary: successAge > MISSED_SYNC_CRITICAL_MS ? "Quota suppression has contributed to a prolonged sync outage." : "The configured reserve safely suppresses the next eight-request cycle.",
      automaticRecoveryExpected: true, context: { ...base, quota_remaining: snapshot.quotaRemaining, quota_minimum_remaining: snapshot.quotaMinimumRemaining, required_budget: 8 },
    },
    {
      code: "deep_reconciliation", active: snapshot.continuousStatus === "degraded" && deepRuns > 0, severity: deepRuns >= 2 ? "critical" : "warning",
      title: "Commas deep reconciliation is indicated", summary: deepRuns >= 2 ? "Page-shift or bounded-scan evidence persisted across consecutive cycles." : "One conservative page-shift or bounded-scan warning requires observation.",
      automaticRecoveryExpected: true, context: { ...base, consecutive_deep_cycles: deepRuns },
    },
  ];
}

const alertCode = (snapshot: CommerceHealthSnapshot, code: string) => `commas:${snapshot.connectionId}:${snapshot.providerAccountId}:${snapshot.resource}:${code}`;

async function existingOpenAlert(db: any, snapshot: CommerceHealthSnapshot, code: string) {
  const { data, error } = await db.from("tracekit_operational_alerts").select("id,status,occurrence_count,first_observed_at").eq("organization_id", snapshot.organizationId).eq("capability", "commerce").eq("alert_code", alertCode(snapshot, code)).in("status", ["open", "acknowledged"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error("commerce_alert_lookup_failed");
  return data;
}

export async function reconcileCommerceAlerts(db: any, snapshot: CommerceHealthSnapshot) {
  const conditions = evaluateCommerceAlerts(snapshot);
  for (const condition of conditions) {
    const code = alertCode(snapshot, condition.code);
    const current = await existingOpenAlert(db, snapshot, condition.code);
    let alertId = current?.id || null;
    if (condition.active && current) {
      const { error } = await db.from("tracekit_operational_alerts").update({ severity: condition.severity, last_observed_at: snapshot.now, occurrence_count: Number(current.occurrence_count || 0) + 1, safe_context: condition.context, updated_at: snapshot.now }).eq("id", current.id);
      if (error) throw new Error("commerce_alert_update_failed");
    } else if (condition.active) {
      const { data, error } = await db.from("tracekit_operational_alerts").insert({ organization_id: snapshot.organizationId, capability: "commerce", alert_code: code, status: "open", severity: condition.severity, first_observed_at: snapshot.now, last_observed_at: snapshot.now, occurrence_count: 1, safe_context: condition.context, delivery_state: "pending_destination" }).select("id").maybeSingle();
      if (error) throw new Error("commerce_alert_insert_failed");
      alertId = data?.id || null;
    } else if (current) {
      const { error } = await db.from("tracekit_operational_alerts").update({ status: "resolved", last_observed_at: snapshot.now, updated_at: snapshot.now, safe_context: { ...condition.context, recovered_at: snapshot.now } }).eq("id", current.id);
      if (error) throw new Error("commerce_alert_resolution_failed");
    }
    const candidate: WorkItemCandidate = {
      workspace_id: snapshot.organizationId, type: `commerce_${condition.code}`, category: "integrations", source: "commerce", source_key: code,
      title: condition.title, summary: condition.summary, severity: condition.active ? condition.severity : "healthy", priority: condition.severity === "critical" ? "urgent" : "high",
      lifecycle_state: condition.active ? (condition.severity === "critical" ? "failing" : "degraded") : "resolved", related_connector_id: snapshot.connectionId,
      deep_link: `/operations?source=commerce&source_key=${encodeURIComponent(code)}`, evidence: condition.context,
      metadata: { alert_id: alertId, automatic_recovery_expected: condition.automaticRecoveryExpected, engine_version: COMMERCE_ALERT_ENGINE_VERSION }, detected_at: snapshot.now,
    };
    if (condition.active || current) await upsertWorkItemCandidate(db, candidate, undefined, snapshot.now);
  }
  return conditions;
}

async function rows(query: any, operation: string) {
  const { data, error } = await query;
  if (error) throw Object.assign(new Error("commerce_alert_evaluation_failed"), { operation });
  return data || [];
}

export async function loadCommerceHealthSnapshots(db: any, now = new Date().toISOString()): Promise<CommerceHealthSnapshot[]> {
  const schedules = await rows(db.from("commerce_sync_schedules").select("organization_id,connection_id,provider_account_id,resource,enabled,activation_state,quota_minimum_remaining"), "schedule_read");
  const snapshots: CommerceHealthSnapshot[] = [];
  const since = new Date(Date.parse(now) - 24 * 60 * 60_000).toISOString();
  for (const schedule of schedules) {
    const [{ data: connection, error: connectionError }, controls, pauses, activations, states, runs, bootstraps, expired] = await Promise.all([
      db.from("commerce_provider_connections").select("provider,status").eq("organization_id", schedule.organization_id).eq("id", schedule.connection_id).maybeSingle(),
      rows(db.from("tracekit_production_controls").select("id").eq("organization_id", schedule.organization_id).eq("capability", "commerce_scheduler").eq("activation_state", "enabled"), "control_read"),
      rows(db.from("commerce_connection_pauses").select("paused").eq("organization_id", schedule.organization_id).eq("connection_id", schedule.connection_id).eq("paused", true), "pause_read"),
      rows(db.from("commerce_repository_activation").select("mode").eq("organization_id", schedule.organization_id).in("mode", ["live", "live_beta"]), "activation_read"),
      rows(db.from("commerce_continuous_sync_state").select("status,last_attempted_at,last_successful_at,last_stopping_reason,warnings,quota_remaining,quota_observed_at").eq("organization_id", schedule.organization_id).eq("connection_id", schedule.connection_id).eq("provider_account_id", schedule.provider_account_id).eq("resource", schedule.resource).limit(1), "continuous_state_read"),
      rows(db.from("commerce_sync_runs").select("status,created_at,last_error_code,stopping_reason,deeper_reconciliation_required,page_shift_detected").eq("organization_id", schedule.organization_id).eq("connection_id", schedule.connection_id).eq("provider_account_id", schedule.provider_account_id).eq("sync_type", schedule.resource).gte("created_at", since).order("created_at", { ascending: false }).limit(50), "recent_runs_read"),
      rows(db.from("commerce_scheduled_quota_bootstrap_claims").select("status,claimed_at,failed_at").eq("organization_id", schedule.organization_id).eq("connection_id", schedule.connection_id).eq("provider_account_id", schedule.provider_account_id).eq("resource", schedule.resource).order("updated_at", { ascending: false }).limit(1), "bootstrap_read"),
      rows(db.from("commerce_sync_runs").select("id").eq("organization_id", schedule.organization_id).eq("connection_id", schedule.connection_id).eq("provider_account_id", schedule.provider_account_id).eq("sync_type", schedule.resource).eq("last_error_code", "lease_expired").gte("updated_at", since), "expired_lease_read"),
    ]);
    if (connectionError) throw Object.assign(new Error("commerce_alert_evaluation_failed"), { operation: "connection_read" });
    if (connection?.provider !== "commas" || connection?.status !== "connected") continue;
    const state = states[0] || {};
    snapshots.push({
      organizationId: schedule.organization_id, connectionId: schedule.connection_id, providerAccountId: schedule.provider_account_id, resource: schedule.resource, now,
      scheduleEnabled: schedule.enabled === true, activationState: String(schedule.activation_state || "disabled"), productionControlEnabled: controls.length > 0,
      paused: pauses.length > 0, liveActivated: activations.length > 0, lastSuccessfulAt: state.last_successful_at || null, lastAttemptedAt: state.last_attempted_at || null,
      continuousStatus: String(state.status || "unknown"), lastStoppingReason: state.last_stopping_reason || null, warnings: Array.isArray(state.warnings) ? state.warnings : [],
      quotaRemaining: Number.isFinite(Number(state.quota_remaining)) ? Number(state.quota_remaining) : null, quotaObservedAt: state.quota_observed_at || null,
      quotaMinimumRemaining: Number(schedule.quota_minimum_remaining || 1000), recentRuns: runs, bootstrap: bootstraps[0] || null, expiredLeaseRecoveries: expired.length,
    });
  }
  return snapshots;
}

export async function runCommerceOperationalAlertEvaluation(db: any, now = new Date().toISOString()) {
  const snapshots = await loadCommerceHealthSnapshots(db, now);
  for (const snapshot of snapshots) await reconcileCommerceAlerts(db, snapshot);
  return { evaluated: snapshots.length };
}

export async function reconcileCommerceExecutionSignal(db: any, args: {
  organizationId: string; connectionId: string; providerAccountId: string; resource: string;
  code: "scheduler_failure" | "queue_runtime_failure"; active: boolean; now?: string;
  diagnostic?: { failed_operation?: string; error_code?: string };
}) {
  const now = args.now || new Date().toISOString();
  const snapshot = snapshotForSignal(args, now);
  const current = await existingOpenAlert(db, snapshot, args.code);
  const code = alertCode(snapshot, args.code);
  const occurrence = Number(current?.occurrence_count || 0) + 1;
  const context = { provider: "commas", resource: args.resource, connection_id: args.connectionId, provider_account_id: args.providerAccountId, failed_operation: String(args.diagnostic?.failed_operation || "unknown").replace(/[^a-z0-9_]/gi, "_").slice(0, 80), error_code: String(args.diagnostic?.error_code || "operational_failure").replace(/[^a-z0-9_.-]/gi, "_").slice(0, 80) };
  const severity: Severity = occurrence >= 2 ? "critical" : "warning";
  let alertId = current?.id || null;
  if (args.active && current) {
    const { error } = await db.from("tracekit_operational_alerts").update({ severity, last_observed_at: now, occurrence_count: occurrence, safe_context: context, updated_at: now }).eq("id", current.id);
    if (error) throw new Error("commerce_signal_update_failed");
  } else if (args.active) {
    const { data, error } = await db.from("tracekit_operational_alerts").insert({ organization_id: args.organizationId, capability: "commerce", alert_code: code, status: "open", severity, first_observed_at: now, last_observed_at: now, occurrence_count: 1, safe_context: context, delivery_state: "pending_destination" }).select("id").maybeSingle();
    if (error) throw new Error("commerce_signal_insert_failed");
    alertId = data?.id || null;
  } else if (current) {
    const { error } = await db.from("tracekit_operational_alerts").update({ status: "resolved", last_observed_at: now, updated_at: now, safe_context: { ...context, recovered_at: now } }).eq("id", current.id);
    if (error) throw new Error("commerce_signal_resolution_failed");
  }
  if (args.active || current) await upsertWorkItemCandidate(db, {
    workspace_id: args.organizationId, type: `commerce_${args.code}`, category: "integrations", source: "commerce", source_key: code,
    title: args.code === "scheduler_failure" ? "Commas scheduler operation failed" : "Commas queue/runtime dispatch failed",
    summary: args.active ? (occurrence >= 2 ? "The operational failure repeated and requires attention." : "A transient failure was recorded; the next safe attempt may recover automatically.") : "A later successful operation resolved the failure.",
    severity: args.active ? severity : "healthy", priority: severity === "critical" ? "urgent" : "high", lifecycle_state: args.active ? (severity === "critical" ? "failing" : "degraded") : "resolved",
    related_connector_id: args.connectionId, deep_link: `/operations?source=commerce&source_key=${encodeURIComponent(code)}`, evidence: context,
    metadata: { alert_id: alertId, automatic_recovery_expected: true, engine_version: COMMERCE_ALERT_ENGINE_VERSION }, detected_at: now,
  }, undefined, now);
}

function snapshotForSignal(args: { organizationId: string; connectionId: string; providerAccountId: string; resource: string }, now: string): CommerceHealthSnapshot {
  return { organizationId: args.organizationId, connectionId: args.connectionId, providerAccountId: args.providerAccountId, resource: args.resource, now, scheduleEnabled: true, activationState: "enabled", productionControlEnabled: true, paused: false, liveActivated: false, lastSuccessfulAt: null, lastAttemptedAt: null, continuousStatus: "unknown", lastStoppingReason: null, warnings: [], quotaRemaining: null, quotaObservedAt: null, quotaMinimumRemaining: 1000, recentRuns: [], bootstrap: null, expiredLeaseRecoveries: 0 };
}

export async function reconcileCommerceSchedulerSignals(db: any, active: boolean, diagnostic: { failed_operation?: string; error_code?: string } = {}, now = new Date().toISOString()) {
  const schedules = await rows(db.from("commerce_sync_schedules").select("organization_id,connection_id,provider_account_id,resource").eq("enabled", true).eq("activation_state", "enabled"), "scheduler_signal_scope_read");
  for (const schedule of schedules) await reconcileCommerceExecutionSignal(db, { organizationId: schedule.organization_id, connectionId: schedule.connection_id, providerAccountId: schedule.provider_account_id, resource: schedule.resource, code: "scheduler_failure", active, diagnostic, now });
}
