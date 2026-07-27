import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  evaluateWorkspaceHealth,
  identityHealthMetrics,
  matchHealthRoute,
  normalizeHealthParams,
  type HealthSnapshot,
} from "./health.ts";

function baseSnapshot(overrides: Partial<HealthSnapshot> = {}): HealthSnapshot {
  return {
    workspace_id: "default",
    generated_at: "2026-07-25T00:00:00.000Z",
    workspace: {
      mode: "production",
      created_at: "2026-07-01T00:00:00.000Z",
      setup_completed_at: "2026-07-02T00:00:00.000Z",
      completed_steps: ["workspace", "browser_tracking", "attribution", "payout_validation"],
    },
    tracking: {
      write_key_configured: true,
      allowed_origins_count: 1,
      latest_received_at: "2026-07-25T00:00:00.000Z",
      latest_normalized_at: "2026-07-25T00:00:00.000Z",
      pending_count: 0,
      review_count: 0,
      failed_count: 0,
      today_count: 100,
      yesterday_count: 110,
    },
    identity: {
      active_people_count: 10,
      platform_orders_total: 100,
      linked_platform_orders: 95,
      unlinked_platform_orders: 5,
      review_count: 0,
      merge_events_30d: 0,
      browser_anonymous_count: 10,
    },
    journeys: {
      journeys_total: 20,
      active_journeys: 10,
      completed_journeys: 10,
      journey_events_total: 200,
      orphaned_journey_events: 0,
      stale_orphaned_journey_events: 0,
      average_events_per_journey: 6.2,
    },
    attribution: {
      active_model: "first_touch",
      purchase_events: 30,
      recent_purchase_events: 30,
      attribution_credit_sample_size: 30,
      attributed_conversions: 30,
      unattributed_conversions: 0,
      recent_attributed_conversions: 30,
      recent_unattributed_conversions: 0,
      eligible_touchpoints: 50,
      unknown_affiliate_events: 0,
    },
    commissions: {
      draft_count: 10,
      pending_count: 1,
      approved_count: 2,
      paid_count: 3,
      held_count: 0,
      voided_count: 0,
      duplicate_conversion_count: 0,
      default_commission_rate: 0.075,
    },
    integrations: [
      {
        platform: "browser_sdk",
        last_success_at: "2026-07-25T00:00:00.000Z",
        last_error: null,
        auto_import_enabled: null,
        credential_configured: true,
        source: "browser_event_sources",
      },
      {
        platform: "shopify",
        last_success_at: "2026-07-25T00:00:00.000Z",
        last_error: null,
        auto_import_enabled: true,
        credential_configured: true,
        source: "integrations_credentials",
      },
    ],
    platform_processing: {
      active_jobs: 0,
      queued_tasks: 0,
      failed_tasks: 0,
      jobs: [
        {
          id: "identity-job-complete",
          connector_id: "identity-backfill-platform-orders",
          job_type: "identity_backfill",
          status: "completed",
          phase: "validate_and_finalize",
          created_at: "2026-07-20T00:00:00.000Z",
          updated_at: "2026-07-20T01:00:00.000Z",
          completed_at: "2026-07-20T01:00:00.000Z",
          last_error: null,
          progress: {},
        },
        {
          id: "attribution-job-complete",
          connector_id: "attribution-engine-backfill",
          job_type: "attribution_backfill",
          status: "completed",
          phase: "calculate_attribution",
          created_at: "2026-07-20T02:00:00.000Z",
          updated_at: "2026-07-20T03:00:00.000Z",
          completed_at: "2026-07-20T03:00:00.000Z",
          last_error: null,
          progress: {},
        },
      ],
      tasks: [],
      recent_errors: [],
    },
    diagnostics: {
      section_errors: [],
    },
    ...overrides,
  };
}

function identityJob(metadata: Record<string, any>, overrides: Record<string, any> = {}) {
  return {
    id: "identity-job",
    connector_id: "identity-backfill-platform-orders",
    job_type: "identity_backfill",
    status: "completed",
    phase: "validate_and_finalize",
    records_discovered: Number(metadata.total_in_scope || 0),
    records_processed: Number(metadata.total_in_scope || 0),
    records_succeeded: Number(metadata.linked_person_id || 0),
    records_failed: Number(metadata.runtime_error_count || 0),
    records_skipped: Number(metadata.no_identifier_count || 0),
    created_at: "2026-07-20T00:00:00.000Z",
    updated_at: "2026-07-20T01:00:00.000Z",
    completed_at: "2026-07-20T01:00:00.000Z",
    last_error: null,
    progress: { metadata },
    ...overrides,
  };
}

test("health route matching is canonical method-safe and trailing-slash tolerant", () => {
  assert.deepEqual(matchHealthRoute("GET", "/v1/health"), { kind: "health_report" });
  assert.deepEqual(matchHealthRoute("GET", "/v1/health/"), { kind: "health_report" });
  assert.deepEqual(matchHealthRoute("POST", "/v1/health"), {
    kind: "method_not_allowed",
    path: "/v1/health",
    allowed_methods: ["GET"],
  });
  assert.equal(matchHealthRoute("GET", "/v1/not-health"), null);
  assert.deepEqual(normalizeHealthParams({ workspace_id: " default " }), { workspace_id: "default" });
});

test("healthy workspace report produces deterministic score status and finding shape", () => {
  const report = evaluateWorkspaceHealth(baseSnapshot());
  assert.equal(report.ok, true);
  assert.equal(report.workspace_id, "default");
  assert.equal(report.overall.status, "Healthy");
  assert.ok(report.overall.score >= 90);
  assert.equal(report.findings.every((finding) => finding.id && finding.category && finding.evidence && finding.recommended_action), true);
  assert.equal(report.findings.some((finding) => finding.category === "tracking"), true);
  assert.equal(report.findings.some((finding) => finding.category === "identity"), true);
  assert.equal(report.findings.some((finding) => finding.category === "journeys"), true);
  assert.equal(report.findings.some((finding) => finding.category === "attribution"), true);
  assert.equal(report.findings.some((finding) => finding.category === "commissions"), true);
  assert.equal(report.findings.some((finding) => finding.category === "integrations"), true);
  assert.equal(report.findings.some((finding) => finding.category === "platform_processing"), true);
  assert.deepEqual(report.timeline.map((point) => point.label), ["Today", "Yesterday", "7 Days", "30 Days"]);
  assert.equal(report.notifications.every((notification) => notification.id && notification.deep_link && typeof notification.unread === "boolean"), true);
});

test("critical and warning findings lower the health score deterministically", () => {
  const report = evaluateWorkspaceHealth(baseSnapshot({
    tracking: {
      ...baseSnapshot().tracking,
      latest_received_at: null,
      pending_count: 1200,
      failed_count: 15,
      today_count: 2,
      yesterday_count: 100,
    },
    identity: {
      ...baseSnapshot().identity,
      linked_platform_orders: 20,
      unlinked_platform_orders: 80,
      review_count: 3,
    },
    platform_processing: {
      active_jobs: 1,
      queued_tasks: 2,
      failed_tasks: 1,
      recent_errors: [{ connector_id: "shopify", error_class: "timeout", classification: "transient", created_at: "2026-07-25T00:00:00.000Z" }],
    },
  }));
  assert.equal(report.overall.status, "Critical");
  assert.ok(report.overall.score < 70);
  assert.ok(report.counts.critical >= 3);
  assert.ok(report.recommended_actions.length > 0);
  assert.equal(report.recommended_actions[0].severity, "critical");
  assert.equal(report.recommended_actions.every((action) => action.deep_link.startsWith("/")), true);
  assert.equal(report.notifications.some((notification) => notification.severity === "critical" && notification.unread), true);
});

test("new workspace lifecycle distinguishes setup from operational failure", () => {
  const base = baseSnapshot();
  const report = evaluateWorkspaceHealth({
    ...base,
    workspace: { mode: "development", created_at: "2026-07-24T00:00:00.000Z", setup_completed_at: null, completed_steps: [] },
    tracking: {
      ...base.tracking,
      write_key_configured: false,
      allowed_origins_count: 0,
      config_updated_at: null,
      latest_received_at: null,
      latest_normalized_at: null,
      today_count: 0,
      yesterday_count: 0,
    },
    identity: {
      ...base.identity,
      platform_orders_total: 0,
      linked_platform_orders: 0,
      unlinked_platform_orders: 0,
    },
    attribution: {
      ...base.attribution,
      active_model: null,
      purchase_events: 0,
      recent_purchase_events: 0,
      attribution_credit_sample_size: 0,
      attributed_conversions: 0,
      unattributed_conversions: 0,
      recent_attributed_conversions: 0,
      recent_unattributed_conversions: 0,
    },
    commissions: {
      ...base.commissions,
      default_commission_rate: null,
    },
    platform_processing: { active_jobs: 0, queued_tasks: 0, failed_tasks: 0, jobs: [], tasks: [], recent_errors: [] },
  });

  const browserConfig = report.findings.find((finding) => finding.id === "tracking.browser_configuration");
  const identity = report.findings.find((finding) => finding.id === "identity.resolution_rate");
  const attributionPolicy = report.findings.find((finding) => finding.id === "attribution.active_policy");
  assert.equal(browserConfig?.lifecycle_state, "needs_configuration");
  assert.equal(identity?.lifecycle_state, "not_applicable");
  assert.equal(attributionPolicy?.lifecycle_state, "needs_configuration");
  assert.ok(report.overall.excluded_checks >= 1);
  assert.notEqual(report.overall.status, "Critical");
});

test("recently configured Browser SDK without traffic initializes instead of failing", () => {
  const base = baseSnapshot();
  const report = evaluateWorkspaceHealth({
    ...base,
    tracking: {
      ...base.tracking,
      config_updated_at: "2026-07-24T12:00:00.000Z",
      latest_received_at: null,
      latest_normalized_at: null,
    },
  });
  const activity = report.findings.find((finding) => finding.id === "tracking.browser_activity");
  assert.equal(activity?.lifecycle_state, "initializing");
  assert.equal(activity?.severity, "info");
});

test("identity resolution waits for backfill readiness before critical severity", () => {
  const base = baseSnapshot();
  const neverStarted = evaluateWorkspaceHealth({
    ...base,
    identity: { ...base.identity, linked_platform_orders: 1, unlinked_platform_orders: 99 },
    platform_processing: { ...base.platform_processing, jobs: [] },
  }).findings.find((finding) => finding.id === "identity.resolution_rate");
  assert.equal(neverStarted?.lifecycle_state, "needs_configuration");
  assert.equal(neverStarted?.severity, "info");

  const running = evaluateWorkspaceHealth({
    ...base,
    identity: { ...base.identity, linked_platform_orders: 1, unlinked_platform_orders: 99 },
    platform_processing: {
      ...base.platform_processing,
      jobs: [{
        id: "identity-running",
        connector_id: "identity-backfill-platform-orders",
        job_type: "identity_backfill",
        status: "running",
        phase: "resolve_identity_batch",
        created_at: "2026-07-25T00:00:00.000Z",
        updated_at: "2026-07-25T00:10:00.000Z",
        completed_at: null,
        last_error: null,
        progress: {},
      }],
    },
  }).findings.find((finding) => finding.id === "identity.resolution_rate");
  assert.equal(running?.lifecycle_state, "initializing");

  const poorCompleted = evaluateWorkspaceHealth({
    ...base,
    identity: { ...base.identity, linked_platform_orders: 1, unlinked_platform_orders: 99 },
  }).findings.find((finding) => finding.id === "identity.resolution_rate");
  assert.equal(poorCompleted?.lifecycle_state, "failing");
  assert.equal(poorCompleted?.severity, "critical");
});

test("identity health excludes orders without deterministic identifiers from eligible denominator", () => {
  const base = baseSnapshot();
  const snapshot = {
    ...base,
    identity: {
      ...base.identity,
      platform_orders_total: 1000,
      linked_platform_orders: 50,
      unlinked_platform_orders: 950,
    },
    platform_processing: {
      ...base.platform_processing,
      jobs: [identityJob({
        total_in_scope: 1000,
        linked_person_id: 50,
        remaining_unlinked: 950,
        no_identifier_count: 950,
        runtime_error_count: 0,
      })],
      tasks: [],
    },
  };
  const metrics = identityHealthMetrics(snapshot);
  const finding = evaluateWorkspaceHealth(snapshot).findings.find((row) => row.id === "identity.resolution_rate");
  assert.equal(metrics.total_orders, 1000);
  assert.equal(metrics.eligible_orders, 50);
  assert.equal(metrics.linked_eligible_orders, 50);
  assert.equal(metrics.unlinked_eligible_orders, 0);
  assert.equal(metrics.ineligible_orders, 950);
  assert.equal(metrics.eligible_resolution_rate, 100);
  assert.equal(metrics.overall_linkage_rate, 5);
  assert.equal(finding?.lifecycle_state, "healthy");
  assert.equal(finding?.evidence.eligible_orders, 50);
  assert.equal(finding?.evidence.overall_linkage_rate, 5);
});

test("identity health degrades completed backfill with unresolved eligible orders", () => {
  const base = baseSnapshot();
  const snapshot = {
    ...base,
    identity: {
      ...base.identity,
      platform_orders_total: 100,
      linked_platform_orders: 60,
      unlinked_platform_orders: 40,
    },
    platform_processing: {
      ...base.platform_processing,
      jobs: [identityJob({
        total_in_scope: 100,
        linked_person_id: 60,
        remaining_unlinked: 40,
        no_identifier_count: 0,
        runtime_error_count: 0,
      })],
      tasks: [],
    },
  };
  const finding = evaluateWorkspaceHealth(snapshot).findings.find((row) => row.id === "identity.resolution_rate");
  assert.equal(finding?.lifecycle_state, "degraded");
  assert.equal(finding?.severity, "warning");
  assert.equal(finding?.evidence.eligible_resolution_rate, 60);
  assert.equal(finding?.evidence.unlinked_eligible_orders, 40);
});

test("identity health surfaces completed jobs with failed or incomplete child tasks", () => {
  const base = baseSnapshot();
  const failedTaskSnapshot = {
    ...base,
    platform_processing: {
      ...base.platform_processing,
      jobs: [identityJob({ total_in_scope: 100, linked_person_id: 95, remaining_unlinked: 5, no_identifier_count: 0 })],
      tasks: [{
        id: "identity-task-failed",
        job_id: "identity-job",
        connector_id: "identity-backfill-platform-orders",
        task_type: "identity_backfill_resolve_identity_batch",
        status: "failed",
        max_attempts: 3,
        attempt_count: 3,
        created_at: "2026-07-20T00:00:00.000Z",
        updated_at: "2026-07-20T00:10:00.000Z",
        locked_at: null,
        completed_at: null,
        last_error: "boom",
      }],
    },
  };
  const failedFinding = evaluateWorkspaceHealth(failedTaskSnapshot).findings.find((row) => row.id === "identity.resolution_rate");
  assert.equal(failedFinding?.lifecycle_state, "degraded");
  assert.equal(failedFinding?.evidence.backfill_completion_state || failedFinding?.evidence.backfill_status, "completed_with_errors");
  assert.equal(failedFinding?.evidence.backfill_task_counts_by_status.failed, 1);

  const queuedTaskSnapshot = {
    ...base,
    platform_processing: {
      ...base.platform_processing,
      jobs: [identityJob({ total_in_scope: 100, linked_person_id: 95, remaining_unlinked: 5, no_identifier_count: 0 }, { status: "running", completed_at: null })],
      tasks: [{
        id: "identity-task-queued",
        job_id: "identity-job",
        connector_id: "identity-backfill-platform-orders",
        task_type: "identity_backfill_resolve_identity_batch",
        status: "queued",
        max_attempts: 3,
        attempt_count: 0,
        created_at: "2026-07-25T00:00:00.000Z",
        updated_at: "2026-07-25T00:00:00.000Z",
        locked_at: null,
        completed_at: null,
        last_error: null,
      }],
    },
  };
  const queuedFinding = evaluateWorkspaceHealth(queuedTaskSnapshot).findings.find((row) => row.id === "identity.resolution_rate");
  assert.equal(queuedFinding?.lifecycle_state, "initializing");
  assert.equal(queuedFinding?.evidence.backfill_task_counts_by_status.queued, 1);
});

test("attribution distinguishes low sample initialization from mature degradation", () => {
  const base = baseSnapshot();
  const lowSample = evaluateWorkspaceHealth({
    ...base,
    attribution: {
      ...base.attribution,
      purchase_events: 3,
      recent_purchase_events: 3,
      attribution_credit_sample_size: 3,
      attributed_conversions: 1,
      unattributed_conversions: 2,
      recent_attributed_conversions: 1,
      recent_unattributed_conversions: 2,
    },
  }).findings.find((finding) => finding.id === "attribution.attributed_rate");
  assert.equal(lowSample?.lifecycle_state, "initializing");
  assert.equal(lowSample?.severity, "info");

  const degraded = evaluateWorkspaceHealth({
    ...base,
    attribution: {
      ...base.attribution,
      purchase_events: 25,
      recent_purchase_events: 25,
      attribution_credit_sample_size: 25,
      attributed_conversions: 10,
      unattributed_conversions: 15,
      recent_attributed_conversions: 10,
      recent_unattributed_conversions: 15,
    },
  }).findings.find((finding) => finding.id === "attribution.attributed_rate");
  assert.equal(degraded?.lifecycle_state, "degraded");
  assert.equal(degraded?.severity, "warning");
});

test("commission policy rate respects workspace mode disabled state and overrides", () => {
  const base = baseSnapshot();
  const development = evaluateWorkspaceHealth({
    ...base,
    workspace: { ...base.workspace!, mode: "development" },
    commissions: { ...base.commissions, default_commission_rate: 0 },
  }).findings.find((finding) => finding.id === "commissions.policy_rate");
  assert.equal(development?.lifecycle_state, "healthy");
  assert.equal(development?.severity, "healthy");

  const production = evaluateWorkspaceHealth({
    ...base,
    workspace: { ...base.workspace!, mode: "production" },
    commissions: { ...base.commissions, default_commission_rate: 0, policy_metadata: {} },
  }).findings.find((finding) => finding.id === "commissions.policy_rate");
  assert.equal(production?.lifecycle_state, "needs_configuration");
  assert.equal(production?.severity, "warning");

  const overrides = evaluateWorkspaceHealth({
    ...base,
    workspace: { ...base.workspace!, mode: "production" },
    commissions: { ...base.commissions, default_commission_rate: 0, policy_metadata: { affiliate_overrides: { affiliate_1: 0.1 } } },
  }).findings.find((finding) => finding.id === "commissions.policy_rate");
  assert.equal(overrides?.lifecycle_state, "healthy");
});

test("runtime errors and tasks use recency and stale state", () => {
  const base = baseSnapshot();
  const oldErrorResolved = evaluateWorkspaceHealth({
    ...base,
    platform_processing: {
      ...base.platform_processing,
      jobs: [
        ...(base.platform_processing.jobs || []),
        {
          id: "recent-success",
          connector_id: "shopify",
          job_type: "import",
          status: "completed",
          phase: "finalizing",
          created_at: "2026-07-24T12:00:00.000Z",
          updated_at: "2026-07-24T12:10:00.000Z",
          completed_at: "2026-07-24T12:10:00.000Z",
          last_error: null,
          progress: {},
        },
      ],
      recent_errors: [{ connector_id: "shopify", error_class: "timeout", classification: "transient", created_at: "2026-07-23T00:00:00.000Z" }],
    },
  }).findings.find((finding) => finding.id === "platform_processing.recent_errors");
  assert.equal(oldErrorResolved?.lifecycle_state, "resolved");

  const activeFailures = evaluateWorkspaceHealth({
    ...base,
    platform_processing: {
      ...base.platform_processing,
      recent_errors: Array.from({ length: 10 }, (_, index) => ({
        connector_id: "shopify",
        error_class: "timeout",
        classification: "transient",
        created_at: `2026-07-24T23:5${index % 10}:00.000Z`,
      })),
    },
  }).findings.find((finding) => finding.id === "platform_processing.recent_errors");
  assert.equal(activeFailures?.lifecycle_state, "failing");

  const staleTask = evaluateWorkspaceHealth({
    ...base,
    platform_processing: {
      ...base.platform_processing,
      queued_tasks: 1,
      tasks: [{
        id: "task-stale",
        connector_id: "attribution-engine-backfill",
        task_type: "attribution_backfill_batch",
        status: "queued",
        created_at: "2026-07-24T22:00:00.000Z",
        updated_at: "2026-07-24T22:00:00.000Z",
        locked_at: null,
        completed_at: null,
        last_error: null,
        attempt_count: 0,
      }],
    },
  }).findings.find((finding) => finding.id === "platform_processing.runtime_tasks");
  assert.equal(staleTask?.lifecycle_state, "degraded");
});

test("health engine source remains read-only and Worker route is registered before not_found", () => {
  const health = readFileSync(new URL("./health.ts", import.meta.url), "utf8");
  const worker = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const proxy = readFileSync(new URL("../../ui/app/api/health/route.ts", import.meta.url), "utf8");

  assert.doesNotMatch(health, /\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
  assert.doesNotMatch(health, /from\("integration_import_errors"\)[\s\S]{0,400}\.eq\("workspace_id"/);
  assert.match(health, /from\("integration_import_errors"\)[\s\S]*\.in\("job_id", runtimeJobIds\)/);
  assert.match(health, /from\("integration_import_errors"\)[\s\S]*\.in\("task_id", runtimeTaskIds\)/);
  assert.match(worker, /matchHealthRoute\(req\.method, path\)/);
  assert.match(worker, /getWorkspaceHealthReport\(getSupabase\(env\), params\)/);
  assert.match(worker, /adminAuthError\(req, env\)/);
  assert.match(proxy, /\/v1\/health/);
  assert.match(proxy, /"x-tk-secret": secret/);
});
