import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { navigationForIdentity } from "../lib/identity/shell-navigation";
import { MOCK_IDENTITIES } from "../lib/identity/mock";
import { NAVIGATION_POLICY } from "../lib/identity/navigation-policy";
import { normalizeNotificationsResponse, notificationListState, type TraceKitNotification } from "../lib/notifications";

const root = new URL("..", import.meta.url);
const source = (path: string) => readFileSync(new URL(path, root), "utf8");

function notification(id: string, severity: "warning" | "info", status: "unread" | "read"): TraceKitNotification {
  return {
    id,
    type: "platform",
    severity,
    status,
    title: id,
    summary: "Health notification",
    created_at: "2026-10-07T04:44:00Z",
    resolved_at: null,
    read_at: status === "read" ? "2026-10-07T04:44:01Z" : null,
    dismissed_at: null,
    deep_link: "/connections",
    recommended_action: "Review health evidence.",
    workspace_id: "8f6bb14b-2126-49b8-bfdb-c60edbc3549b",
    health_finding_id: `health:${id}`,
    why_it_matters: "Operational health remains visible.",
    evidence: {},
    related_metrics: {},
    timeline: [],
    metadata: { source: "health" },
  };
}

const productionShape = {
  ok: true,
  workspace_id: "8f6bb14b-2126-49b8-bfdb-c60edbc3549b",
  engine_version: "notification_engine_v1",
  governed_source: "available",
  counts: { total: 6, unread: 1, read: 5, resolved: 0, dismissed: 0, critical: 0, warning: 1, info: 5, healthy: 0 },
  notifications: [notification("warning", "warning", "unread"), ...Array.from({ length: 5 }, (_, index) => notification(`info-${index + 1}`, "info", "read"))],
  next_cursor: null,
  has_more: false,
};

test("client and agency production navigation expose Notifications under organizations.view only", () => {
  for (const variant of ["client", "agency"] as const) {
    const item = NAVIGATION_POLICY[variant].find((candidate) => candidate.label === "Notifications");
    assert.deepEqual(item, { label: "Notifications", href: "/notifications", permission: "organizations.view" });
  }
  assert.equal(NAVIGATION_POLICY["product-admin"].some((item) => item.label === "Notifications"), false);
  const client = MOCK_IDENTITIES.find((identity) => identity.id === "client-admin")!;
  assert.ok(navigationForIdentity(client, "client").some((item) => item.label === "Notifications" && item.href === "/notifications"));
  assert.equal(navigationForIdentity({ ...client, membership: { ...client.membership, denials: ["organizations.view"] } }, "client").some((item) => item.label === "Notifications"), false);
});

test("production header, account menu, and command palette navigate without notification mutations", () => {
  const header = source("components/layout/production-header.tsx");
  const menu = source("components/layout/production-user-menu.tsx");
  const palette = source("components/shared/command-palette.tsx");
  assert.match(header, /hasPermission\(session\.identity, "organizations\.view"\)/);
  assert.match(header, /Boolean\(session\.activeOrganizationId\)/);
  assert.match(header, /aria-label="Open notifications"/);
  assert.match(header, /router\.push\("\/notifications"\)/);
  assert.match(menu, /label: "Notifications"[\s\S]*href: "\/notifications"/);
  assert.match(menu, /router\.push\(action\.href\)/);
  assert.match(palette, /withWorkspace\("\/notifications"\)/);
  for (const text of [header, menu]) {
    assert.doesNotMatch(text, /api\/action-notifications|api\/notifications|mark.*read|dismiss.*notification/i);
  }
});

test("exact authenticated production response renders six health rows and correct counts", () => {
  const normalized = normalizeNotificationsResponse(productionShape);
  assert.equal(normalized.workspace_id, productionShape.workspace_id);
  assert.equal(normalized.notifications.length, 6);
  assert.deepEqual(normalized.counts, productionShape.counts);
  assert.equal(normalized.notifications.filter((row) => row.metadata.source === "governed_action").length, 0);
  assert.equal(notificationListState({ loading: false, error: null, notificationCount: normalized.notifications.length }), "populated");
});

test("successful governed-available empty response renders a genuine empty state", () => {
  const normalized = normalizeNotificationsResponse({ ...productionShape, counts: { total: 0, unread: 0, read: 0, resolved: 0, dismissed: 0, critical: 0, warning: 0, info: 0, healthy: 0 }, notifications: [] });
  assert.equal(normalized.governed_source, "available");
  assert.equal(notificationListState({ loading: false, error: null, notificationCount: normalized.notifications.length }), "empty");
});

test("source failure is degraded and cannot become false healthy", () => {
  assert.throws(() => normalizeNotificationsResponse({ ...productionShape, governed_source: "unavailable" }), /failed to load/);
  assert.throws(() => normalizeNotificationsResponse({ ok: false, notifications: [] }), /failed to load/);
  assert.equal(notificationListState({ loading: false, error: "Notification Center failed to load.", notificationCount: 0 }), "error");
  const client = source("app/(app)/notifications/notifications-client.tsx");
  assert.match(client, /Notification source unavailable\. No healthy-state conclusion was made\./);
});

test("page load uses server-derived tenant scope and performs no notification mutation", () => {
  const client = source("app/(app)/notifications/notifications-client.tsx");
  const query = client.slice(client.indexOf("const queryParams ="), client.indexOf("const load ="));
  const load = client.slice(client.indexOf("const load ="), client.indexOf("const fetchNotificationById"));
  assert.doesNotMatch(query, /workspace_id/);
  assert.doesNotMatch(load, /method:\s*"POST"|\/read|\/dismiss/);
  assert.match(load, /normalizeNotificationsResponse/);
  assert.match(client, /if \(!append && !initialNotificationId && rows\[0\]\)\s*\{\s*setSelected\(rows\[0\]\)/);
  assert.doesNotMatch(load, /markRead|openNotification/);
});
