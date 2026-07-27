import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildNotificationReport,
  matchNotificationRoute,
  normalizeNotificationParams,
  notificationIdForFinding,
  type NotificationStateRow,
} from "./notifications.ts";
import { evaluateWorkspaceHealth, type HealthSnapshot } from "./health.ts";

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
      browser_anonymous_count: 0,
    },
    journeys: {
      journeys_total: 20,
      active_journeys: 0,
      completed_journeys: 20,
      journey_events_total: 200,
      orphaned_journey_events: 0,
      stale_orphaned_journey_events: 0,
      average_events_per_journey: 6,
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
      draft_count: 0,
      pending_count: 0,
      approved_count: 2,
      paid_count: 3,
      held_count: 0,
      voided_count: 0,
      duplicate_conversion_count: 0,
      default_commission_rate: 0.075,
    },
    integrations: [],
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

function reportFromSnapshot(snapshot: HealthSnapshot, states: NotificationStateRow[] = [], params = {}) {
  const health = evaluateWorkspaceHealth(snapshot);
  return buildNotificationReport({
    health,
    states,
    params: normalizeNotificationParams({ workspace_id: snapshot.workspace_id, ...params }),
  });
}

test("notification routes are registered with deterministic method handling", () => {
  assert.deepEqual(matchNotificationRoute("GET", "/v1/notifications"), { kind: "list_notifications" });
  assert.deepEqual(matchNotificationRoute("GET", "/v1/notifications/"), { kind: "list_notifications" });
  assert.deepEqual(matchNotificationRoute("GET", "/v1/notifications/abc"), { kind: "get_notification", notification_id: "abc" });
  assert.deepEqual(matchNotificationRoute("POST", "/v1/notifications/abc/read"), { kind: "mark_read", notification_id: "abc" });
  assert.deepEqual(matchNotificationRoute("POST", "/v1/notifications/abc/dismiss/"), { kind: "dismiss", notification_id: "abc" });
  assert.deepEqual(matchNotificationRoute("DELETE", "/v1/notifications"), {
    kind: "method_not_allowed",
    path: "/v1/notifications",
    allowed_methods: ["GET"],
  });
});

test("healthy workspace has no unread notifications but keeps resolved history", () => {
  const report = reportFromSnapshot(baseSnapshot(), [], { status: "unread" });
  assert.equal(report.ok, true);
  assert.equal(report.notifications.length, 0);
  assert.equal(report.counts.unread, 0);
  assert.ok(report.counts.resolved > 0);
});

test("critical tracking finding becomes an unread notification with MCP metadata", () => {
  const report = reportFromSnapshot(baseSnapshot({
    tracking: {
      ...baseSnapshot().tracking,
      latest_received_at: null,
      pending_count: 1200,
      today_count: 0,
      yesterday_count: 100,
    },
  }));
  const critical = report.notifications.find((notification) => notification.severity === "critical");
  assert.ok(critical);
  assert.equal(critical?.type, "tracking");
  assert.equal(critical?.status, "unread");
  assert.match(critical?.deep_link || "", /^\/events/);
  assert.equal(Boolean(critical?.metadata.finding), true);
});

test("mixed severities filter by severity category status search and date", () => {
  const report = reportFromSnapshot(baseSnapshot({
    identity: {
      ...baseSnapshot().identity,
      linked_platform_orders: 60,
      unlinked_platform_orders: 40,
      review_count: 4,
    },
    commissions: {
      ...baseSnapshot().commissions,
      duplicate_conversion_count: 2,
    },
  }), [], {
    severity: "warning",
    category: "identity,commissions",
    status: "unread",
    search: "identity",
    from: "2026-07-24T00:00:00.000Z",
  });
  assert.ok(report.notifications.length > 0);
  assert.equal(report.notifications.every((notification) => notification.severity === "warning"), true);
  assert.equal(report.notifications.every((notification) => ["identity", "commissions"].includes(notification.type)), true);
  assert.equal(report.notifications.every((notification) => notification.title.toLowerCase().includes("identity") || notification.summary.toLowerCase().includes("identity") || notification.health_finding_id.includes("identity")), true);
});

test("notification status maps Health lifecycle without duplicating rule logic", () => {
  const base = baseSnapshot();
  const needsConfiguration = reportFromSnapshot({
    ...base,
    identity: { ...base.identity, linked_platform_orders: 1, unlinked_platform_orders: 99 },
    platform_processing: { ...base.platform_processing, jobs: [] },
  });
  const setup = needsConfiguration.notifications.find((notification) => notification.health_finding_id === "identity.resolution_rate");
  assert.equal(setup?.metadata.lifecycle_state, "needs_configuration");
  assert.equal(setup?.severity, "info");
  assert.equal(setup?.status, "read");

  const initializing = reportFromSnapshot({
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
  });
  assert.equal(initializing.notifications.some((notification) => notification.health_finding_id === "identity.resolution_rate"), false);

  const failing = reportFromSnapshot({
    ...base,
    identity: { ...base.identity, linked_platform_orders: 1, unlinked_platform_orders: 99 },
  });
  const critical = failing.notifications.find((notification) => notification.health_finding_id === "identity.resolution_rate");
  assert.equal(critical?.metadata.lifecycle_state, "failing");
  assert.equal(critical?.status, "unread");
  assert.equal(critical?.severity, "critical");

  const resolved = reportFromSnapshot({
    ...base,
    identity: { ...base.identity, platform_orders_total: 0, linked_platform_orders: 0, unlinked_platform_orders: 0 },
  }, [], { status: "resolved" });
  const notApplicable = resolved.notifications.find((notification) => notification.health_finding_id === "identity.resolution_rate");
  assert.equal(notApplicable?.metadata.lifecycle_state, "not_applicable");
  assert.equal(notApplicable?.status, "resolved");
});

test("read and dismissed state are workspace scoped and resolved is Health-driven", () => {
  const health = evaluateWorkspaceHealth(baseSnapshot({
    tracking: {
      ...baseSnapshot().tracking,
      latest_received_at: null,
    },
  }));
  const openFinding = health.findings.find((finding) => finding.status === "open");
  assert.ok(openFinding);
  const id = notificationIdForFinding("default", openFinding!.id);
  const readState: NotificationStateRow = {
    workspace_id: "default",
    notification_id: id,
    health_finding_id: openFinding!.id,
    read_at: "2026-07-25T01:00:00.000Z",
    dismissed_at: null,
  };
  const otherWorkspaceState = { ...readState, workspace_id: "other", read_at: "2026-07-25T02:00:00.000Z" };
  const report = buildNotificationReport({ health, states: [readState, otherWorkspaceState], params: normalizeNotificationParams({ workspace_id: "default" }) });
  assert.equal(report.notifications.find((notification) => notification.id === id)?.status, "read");

  const dismissed = buildNotificationReport({ health, states: [{ ...readState, dismissed_at: "2026-07-25T03:00:00.000Z" }], params: normalizeNotificationParams({ workspace_id: "default", status: "dismissed" }) });
  assert.equal(dismissed.notifications.find((notification) => notification.id === id)?.status, "dismissed");

  const resolvedReport = buildNotificationReport({ health, states: [], params: normalizeNotificationParams({ workspace_id: "default", status: "resolved" }) });
  const resolved = resolvedReport.notifications.find((notification) => notification.status === "resolved");
  assert.ok(resolved);
  assert.equal(resolved?.resolved_at !== null, true);
});

test("pagination returns stable cursors without N+1 state assumptions", () => {
  const first = reportFromSnapshot(baseSnapshot({
    tracking: {
      ...baseSnapshot().tracking,
      latest_received_at: null,
      pending_count: 1200,
      failed_count: 10,
    },
    identity: {
      ...baseSnapshot().identity,
      linked_platform_orders: 50,
      unlinked_platform_orders: 50,
      review_count: 5,
    },
  }), [], { limit: 2 });
  assert.equal(first.notifications.length, 2);
  assert.equal(first.has_more, true);
  assert.equal(first.next_cursor, "2");
  const second = reportFromSnapshot(baseSnapshot({
    tracking: {
      ...baseSnapshot().tracking,
      latest_received_at: null,
      pending_count: 1200,
      failed_count: 10,
    },
    identity: {
      ...baseSnapshot().identity,
      linked_platform_orders: 50,
      unlinked_platform_orders: 50,
      review_count: 5,
    },
  }), [], { limit: 2, cursor: first.next_cursor });
  assert.notDeepEqual(second.notifications.map((notification) => notification.id), first.notifications.map((notification) => notification.id));
});

test("Worker route proxy and migration are wired for notification state only", () => {
  const worker = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../../supabase/migrations/027_notification_engine_state.sql", import.meta.url), "utf8");
  const proxy = readFileSync(new URL("../../ui/app/api/notifications/route.ts", import.meta.url), "utf8");

  assert.match(worker, /matchNotificationRoute\(req\.method, path\)/);
  assert.match(worker, /getWorkspaceNotificationReport\(getSupabase\(env\), params\)/);
  assert.match(worker, /upsertNotificationReadState\(getSupabase\(env\)/);
  assert.match(migration, /create table if not exists public\.notification_states/);
  assert.match(migration, /primary key \(workspace_id, notification_id\)/);
  assert.match(proxy, /\/v1\/notifications/);
});
