import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildWorkItemExplanation,
  buildWorkItemDomainEvent,
  enrichHealthReportWithWorkItems,
  healthWorkItemId,
  matchWorkItemRoute,
  mergeWorkItemCandidate,
  normalizeWorkItemParams,
  workItemCandidateFromHealthFinding,
  workItemIdForSource,
  workItemPriorityFor,
  type WorkItemRow,
} from "./work-items.ts";
import { buildNotificationReport, normalizeNotificationParams } from "./notifications.ts";
import type { HealthFinding, HealthReport } from "./health.ts";

const at = "2026-07-25T12:00:00.000Z";

function finding(overrides: Partial<HealthFinding> = {}): HealthFinding {
  return {
    id: "identity.resolution_rate",
    category: "identity",
    lifecycle_state: "failing",
    severity: "critical",
    status: "open",
    title: "Identity resolution needs attention",
    summary: "Eligible platform orders are not linked to people.",
    why_it_matters: "Identity links customer, journey, attribution, and payout evidence.",
    evidence: { eligible_orders: 10, linked_eligible_orders: 4, token: "secret" },
    recommended_action: "Review identity runtime tasks.",
    metric_value: "40%",
    threshold: "healthy at or above 80%",
    applicability_reason: "Identity backfill completed.",
    evaluation_context: { workspace_mode: "production" },
    detected_at: at,
    updated_at: at,
    ...overrides,
  };
}

function healthReport(findings: HealthFinding[]): HealthReport {
  return {
    ok: true,
    workspace_id: "default",
    generated_at: at,
    engine_version: "health_engine_v1",
    overall: {
      score: 80,
      status: "Needs Attention",
      applicable_checks: findings.length,
      excluded_checks: 0,
      initializing_checks: 0,
      failing_checks: findings.filter((item) => item.lifecycle_state === "failing").length,
    },
    counts: {
      critical: findings.filter((item) => item.severity === "critical").length,
      warning: findings.filter((item) => item.severity === "warning").length,
      info: findings.filter((item) => item.severity === "info").length,
      healthy: findings.filter((item) => item.severity === "healthy").length,
      not_applicable: 0,
      needs_configuration: 0,
      initializing: 0,
      degraded: findings.filter((item) => item.lifecycle_state === "degraded").length,
      failing: findings.filter((item) => item.lifecycle_state === "failing").length,
      resolved: findings.filter((item) => item.status === "resolved").length,
      open: findings.filter((item) => item.status === "open").length,
    },
    categories: {} as any,
    findings,
    recommended_actions: findings.map((item) => ({
      finding_id: item.id,
      severity: item.severity,
      category: item.category,
      issue: item.title,
      why_it_matters: item.why_it_matters,
      how_to_fix: item.recommended_action,
      deep_link: "/customers",
    })),
    notifications: findings.map((item) => ({
      id: `health_notification:default:${item.id}`,
      finding_id: item.id,
      unread: item.status === "open",
      lifecycle_state: item.lifecycle_state,
      severity: item.severity,
      timestamp: item.updated_at,
      deep_link: "/customers",
      resolved: item.status === "resolved",
      title: item.title,
      summary: item.summary,
      category: item.category,
    })),
    timeline: [],
    source_tables: [],
  };
}

test("work item routes are registered with deterministic method handling", () => {
  assert.deepEqual(matchWorkItemRoute("GET", "/v1/work-items"), { kind: "list_work_items" });
  assert.deepEqual(matchWorkItemRoute("GET", "/v1/operations/summary/"), { kind: "operations_summary" });
  assert.deepEqual(matchWorkItemRoute("GET", "/v1/work-items/abc"), { kind: "get_work_item", work_item_id: "abc" });
  assert.deepEqual(matchWorkItemRoute("POST", "/v1/work-items/abc/acknowledge"), { kind: "acknowledge", work_item_id: "abc" });
  assert.deepEqual(matchWorkItemRoute("POST", "/v1/work-items/abc/notes"), { kind: "add_note", work_item_id: "abc" });
  assert.deepEqual(matchWorkItemRoute("DELETE", "/v1/work-items"), {
    kind: "method_not_allowed",
    path: "/v1/work-items",
    allowed_methods: ["GET"],
  });
});

test("health finding builds a deterministic work item candidate with redacted evidence", () => {
  const candidate = workItemCandidateFromHealthFinding("default", finding());
  assert.ok(candidate);
  assert.equal(candidate?.source, "health");
  assert.equal(candidate?.source_key, "identity.resolution_rate");
  assert.equal(candidate?.type, "identity_unresolved");
  assert.equal(candidate?.category, "identity");
  assert.equal(candidate?.priority, "high");
  assert.equal(candidate?.related_health_finding_id, "identity.resolution_rate");
  assert.equal(candidate?.evidence?.token, "[redacted]");
  assert.equal(healthWorkItemId("default", "identity.resolution_rate"), workItemIdForSource("default", "health", "identity.resolution_rate"));
});

test("work item mutation context builds a deterministic domain event", () => {
  const previous = mergeWorkItemCandidate(null, workItemCandidateFromHealthFinding("default", finding())!, at) as WorkItemRow;
  const current = {
    ...previous,
    status: "resolved" as const,
    resolved_at: "2026-07-25T13:00:00.000Z",
    related_person_id: "person_123",
    related_order_id: "order_123",
  };
  const event = buildWorkItemDomainEvent({
    workspace_id: "default",
    action: "resolve",
    activity_type: "resolved",
    actor_id: "operator@example.com",
    previous,
    current,
    changed_fields: ["status", "resolved_at"],
    occurred_at: "2026-07-25T13:00:00.000Z",
  });
  assert.equal(event.type, "work_item.resolved");
  assert.equal(event.workspaceId, "default");
  assert.equal(event.subject.id, current.id);
  assert.equal(event.severity, "success");
  assert.equal(event.deduplicationKey, `work_item:${current.id}:resolved:2026-07-25T13:00:00.000Z`);
  assert.deepEqual(event.relatedEntities?.map((entity) => `${entity.type}:${entity.id}`).sort(), [
    "customer:person_123",
    "health_finding:identity.resolution_rate",
    "notification:health_notification:default:identity.resolution_rate",
    "order:order_123",
  ]);
  assert.equal((event.payload as any).previous_status, "open");
  assert.equal((event.payload as any).next_status, "resolved");
});

test("status lifecycle remains separate from source lifecycle during acknowledgement and recovery", () => {
  const candidate = workItemCandidateFromHealthFinding("default", finding())!;
  const created = mergeWorkItemCandidate(null, candidate, at) as WorkItemRow;
  assert.equal(created.status, "open");
  assert.equal(created.lifecycle_state, "failing");

  const acknowledged = { ...created, status: "acknowledged" as const, acknowledged_at: at };
  const recoveredCandidate = workItemCandidateFromHealthFinding("default", finding({
    lifecycle_state: "healthy",
    severity: "healthy",
    status: "resolved",
    title: "Identity is healthy",
    summary: "Eligible platform orders are linked.",
  }))!;
  const recovered = mergeWorkItemCandidate(acknowledged, recoveredCandidate, "2026-07-25T13:00:00.000Z") as WorkItemRow;
  assert.equal(recovered.lifecycle_state, "healthy");
  assert.equal(recovered.status, "resolved");
  assert.equal(recovered.resolution_code, "source_recovered");
});

test("recurrence reopens resolved items but does not reopen dismissed items", () => {
  const candidate = workItemCandidateFromHealthFinding("default", finding())!;
  const resolved = {
    ...mergeWorkItemCandidate(null, candidate, at),
    status: "resolved",
    resolved_at: "2026-07-25T13:00:00.000Z",
    recurrence_count: 0,
  } as WorkItemRow;
  const reopened = mergeWorkItemCandidate(resolved, candidate, "2026-07-25T14:00:00.000Z") as WorkItemRow;
  assert.equal(reopened.status, "open");
  assert.equal(reopened.recurrence_count, 1);

  const dismissed = { ...resolved, status: "dismissed" as const, dismissed_at: "2026-07-25T13:30:00.000Z" };
  const stillDismissed = mergeWorkItemCandidate(dismissed, candidate, "2026-07-25T14:00:00.000Z") as WorkItemRow;
  assert.equal(stillDismissed.status, "dismissed");
});

test("notification report links to related work item without merging lifecycles", () => {
  const health = healthReport([finding()]);
  const item = mergeWorkItemCandidate(null, workItemCandidateFromHealthFinding("default", finding())!, at) as WorkItemRow;
  const report = buildNotificationReport({
    health,
    states: [],
    work_items: [item],
    params: normalizeNotificationParams({ workspace_id: "default" }),
  });
  assert.equal(report.notifications[0].work_item_id, item.id);
  assert.equal(report.notifications[0].work_item_status, "open");
  assert.equal(report.notifications[0].deep_link, `/operations?work_item_id=${encodeURIComponent(item.id)}`);
  assert.equal(report.notifications[0].status, "unread");
});

test("health report can be enriched with work item references without changing health status", () => {
  const health = healthReport([finding()]);
  const item = mergeWorkItemCandidate(null, workItemCandidateFromHealthFinding("default", finding())!, at) as WorkItemRow;
  const enriched: any = enrichHealthReportWithWorkItems(health, [item]);
  assert.equal(enriched.findings[0].work_item_id, item.id);
  assert.equal(enriched.findings[0].status, "open");
  assert.equal(enriched.recommended_actions[0].deep_link, `/operations?work_item_id=${encodeURIComponent(item.id)}`);
});

test("work item explanation is deterministic and evidence based", () => {
  const item = mergeWorkItemCandidate(null, workItemCandidateFromHealthFinding("default", finding())!, at) as WorkItemRow;
  const explanation = buildWorkItemExplanation(item);
  assert.match(explanation.summary, /Eligible platform orders/);
  assert.ok(explanation.statements.some((statement: any) => statement.evidence_type === "health"));
  assert.ok(explanation.recommended_review_steps.length > 0);
});

test("query normalization clamps and filters supported values", () => {
  const params = normalizeWorkItemParams({
    workspace_id: "default",
    status: "open,invalid",
    priority: "urgent,unknown",
    category: "identity,banana",
    limit: 10000,
    cursor: "-1",
  });
  assert.deepEqual(params.status, ["open"]);
  assert.deepEqual(params.priority, ["urgent"]);
  assert.deepEqual(params.category, ["identity"]);
  assert.equal(params.limit, 100);
  assert.equal(params.cursor, 0);
});

test("priority defaults are deterministic from severity and type", () => {
  assert.equal(workItemPriorityFor({ severity: "critical", type: "connector_import_failure" }), "urgent");
  assert.equal(workItemPriorityFor({ severity: "warning", type: "attribution_missing" }), "high");
  assert.equal(workItemPriorityFor({ severity: "info", type: "historical_issue" }), "low");
});

test("work item migration creates stable source identity, activity, indexes, and notification link", () => {
  const migration = readFileSync(new URL("../../supabase/migrations/029_operations_work_items.sql", import.meta.url), "utf8");
  assert.match(migration, /create table if not exists public\.work_items/);
  assert.match(migration, /create unique index if not exists work_items_workspace_source_uidx\s+on public\.work_items \(workspace_id, source, source_key\)/s);
  assert.match(migration, /create table if not exists public\.work_item_activity/);
  assert.match(migration, /on public\.work_item_activity \(workspace_id, work_item_id, created_at desc, id desc\)/);
  assert.match(migration, /alter table public\.notification_states\s+add column if not exists work_item_id text/s);
  assert.doesNotMatch(migration.toLowerCase(), /drop table|truncate table|cascade/);
});

test("operations UI and proxy routes are present", () => {
  const page = readFileSync(new URL("../../ui/app/(app)/operations/operations-client.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../../ui/app/api/work-items/route.ts", import.meta.url), "utf8");
  const actionRoute = readFileSync(new URL("../../ui/app/api/work-items/[...workItemPath]/route.ts", import.meta.url), "utf8");
  const summaryRoute = readFileSync(new URL("../../ui/app/api/operations/summary/route.ts", import.meta.url), "utf8");
  assert.match(page, /Operations Center/);
  assert.match(page, /Acknowledge/);
  assert.match(page, /Resolve/);
  assert.match(route, /\/v1\/work-items/);
  assert.match(actionRoute, /\/v1\/work-items\/\$\{path\}/);
  assert.match(summaryRoute, /\/v1\/operations\/summary/);
});
