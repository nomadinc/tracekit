import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { loadPersistedHealthWorkItems } from "./notifications.ts";
import { listWorkItems, normalizeWorkItemParams } from "./work-items.ts";

class ReadQuery {
  private head = false;

  constructor(
    private readonly table: string,
    private readonly rows: Record<string, unknown>[],
    private readonly calls: string[],
  ) {}

  select(_columns?: string, options?: { head?: boolean }) { this.head = options?.head === true; return this; }
  eq(column: string, value: unknown) { this.calls.push(`eq:${this.table}:${column}:${String(value)}`); return this; }
  in() { return this; }
  is() { return this; }
  not() { return this; }
  gte() { return this; }
  or() { return this; }
  order() { return this; }
  limit() { return this; }
  then(resolve: (value: unknown) => unknown) {
    return Promise.resolve(resolve({ data: this.head ? null : this.rows, count: this.head ? this.rows.length : null, error: null }));
  }
}

function readOnlySupabase(rows: Record<string, unknown>[]) {
  const writes: string[] = [];
  const calls: string[] = [];
  return {
    writes,
    calls,
    from(table: string) {
      const query = new ReadQuery(table, table === "work_items" ? rows : [], calls) as ReadQuery & Record<string, unknown>;
      for (const method of ["insert", "upsert", "update", "delete"]) {
        query[method] = () => { writes.push(`${method}:${table}`); throw new Error("unexpected business-state write"); };
      }
      return query;
    },
  };
}

const persisted = {
  id: "work-item-1",
  workspace_id: "org-1",
  type: "identity_unresolved",
  category: "identity",
  source: "health",
  source_key: "identity.resolution_rate",
  title: "Persisted health finding",
  summary: "Persisted evidence",
  severity: "warning",
  priority: "high",
  status: "open",
  lifecycle_state: "degraded",
  assigned_to: null,
  related_person_id: null,
  related_journey_id: null,
  related_order_id: null,
  related_conversion_id: null,
  related_commission_id: null,
  related_connector_id: null,
  related_health_finding_id: "identity.resolution_rate",
  related_notification_id: "health_notification:org-1:identity.resolution_rate",
  deep_link: "/operations",
  evidence: {},
  resolution: {},
  first_detected_at: "2026-10-04T00:00:00.000Z",
  last_detected_at: "2026-10-04T00:00:00.000Z",
  acknowledged_at: null,
  resolved_at: null,
  dismissed_at: null,
  resolution_code: null,
  resolution_note: null,
  resolved_by: null,
  recurrence_count: 0,
  metadata: {},
  created_at: "2026-10-04T00:00:00.000Z",
  updated_at: "2026-10-04T00:00:00.000Z",
};

test("Work Item list returns persisted rows without synchronization or business-state writes", async () => {
  const database = readOnlySupabase([persisted]);
  const before = [...database.writes];
  const result = await listWorkItems(database, normalizeWorkItemParams({ workspace_id: "org-1", limit: 10, cursor: 0 }));
  assert.equal(result.workspace_id, "org-1");
  assert.equal(result.work_items[0]?.id, persisted.id);
  assert.deepEqual(database.writes, before);
});

test("Notification read dependency loads persisted health Work Items without mutation", async () => {
  const database = readOnlySupabase([persisted]);
  const before = [...database.writes];
  const rows = await loadPersistedHealthWorkItems(database, "org-1");
  assert.equal(rows[0]?.id, persisted.id);
  assert.deepEqual(database.writes, before);
  assert.ok(database.calls.includes("eq:work_items:workspace_id:org-1"));
  assert.ok(database.calls.includes("eq:work_items:source:health"));
});

test("deployed operational GET handlers cannot invoke synchronization", () => {
  const root = new URL(".", import.meta.url);
  const worker = readFileSync(new URL("./index.ts", root), "utf8");
  const notifications = readFileSync(new URL("./notifications.ts", root), "utf8");
  assert.match(worker, /listWorkItems\(getSupabase\(env\), params, \{ sync: false \}\)/);
  assert.doesNotMatch(notifications, /syncHealthWorkItems/);
  assert.match(notifications, /loadPersistedHealthWorkItems/);
});
