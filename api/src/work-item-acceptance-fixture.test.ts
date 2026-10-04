import test from "node:test";
import assert from "node:assert/strict";
import { buildWs019M42AcceptanceFixture, createWs019M42AcceptanceFixture, matchWorkItemRoute, ws019M42AcceptanceFixtureId } from "./work-items.ts";

const workspaceId = "8f6bb14b-2126-49b8-bfdb-c60edbc3549b";
const actorId = "cbfaeaf7-fa83-4235-9011-af3ae7ce9101";
const now = "2026-10-04T22:00:00.000Z";
const correlationId = "d7da7cd3-4047-4fa4-8959-ea190b230e12";

class Query {
  filters: Record<string, unknown> = {};
  kind: "select" | "insert" = "select";
  payload: any;
  private database: FakeDatabase;
  private table: string;
  constructor(database: FakeDatabase, table: string) {
    this.database = database;
    this.table = table;
  }
  select() { return this; }
  eq(key: string, value: unknown) { this.filters[key] = value; return this; }
  insert(payload: any) { this.kind = "insert"; this.payload = payload; return this; }
  maybeSingle() { return Promise.resolve(this.execute()); }
  then(resolve: (value: any) => unknown, reject: (reason: any) => unknown) { return Promise.resolve(this.execute()).then(resolve, reject); }
  private execute() {
    if (this.table === "work_items") {
      if (this.kind === "insert") {
        if (this.database.workItem) return { data: null, error: { code: "23505" } };
        this.database.workItem = structuredClone(this.payload);
        return { data: structuredClone(this.database.workItem), error: null };
      }
      const row = this.database.workItem;
      const matches = row && Object.entries(this.filters).every(([key, value]) => row[key] === value);
      return { data: matches ? structuredClone(row) : null, error: null };
    }
    if (this.table === "work_item_activity" && this.kind === "insert") {
      this.database.activity.push(structuredClone(this.payload));
      return { data: null, error: null };
    }
    throw new Error(`unexpected fake query: ${this.table}:${this.kind}`);
  }
}

class FakeDatabase {
  workItem: any = null;
  activity: any[] = [];
  from(table: string) { return new Query(this, table); }
}

test("M4.2b registers only the fixed POST fixture route", () => {
  assert.deepEqual(matchWorkItemRoute("POST", "/v1/work-items/acceptance-fixtures/ws019-m4-2"), { kind: "create_ws019_m42_acceptance_fixture" });
  assert.deepEqual(matchWorkItemRoute("GET", "/v1/work-items/acceptance-fixtures/ws019-m4-2"), { kind: "method_not_allowed", path: "/v1/work-items/acceptance-fixtures/ws019-m4-2", allowed_methods: ["POST"] });
  assert.deepEqual(matchWorkItemRoute("POST", "/v1/work-items"), { kind: "method_not_allowed", path: "/v1/work-items", allowed_methods: ["GET"] });
});

test("M4.2b fixture is deterministic, tenant-scoped, synthetic, and relationship-free", () => {
  const fixture = buildWs019M42AcceptanceFixture(workspaceId, actorId, now);
  assert.equal(fixture.id, ws019M42AcceptanceFixtureId(workspaceId));
  assert.equal(fixture.id, `work_item:${workspaceId}:manual:ws019.m4.2.phase_b`);
  assert.equal(fixture.workspace_id, workspaceId);
  assert.equal(fixture.source, "manual");
  assert.equal(fixture.source_key, "ws019.m4.2.phase_b");
  assert.equal(fixture.status, "open");
  assert.equal(fixture.lifecycle_state, "not_applicable");
  assert.equal(fixture.priority, "low");
  for (const key of ["related_person_id", "related_journey_id", "related_order_id", "related_conversion_id", "related_commission_id", "related_connector_id", "related_health_finding_id", "related_notification_id"] as const) assert.equal(fixture[key], null);
  assert.equal(fixture.metadata.synthetic, true);
  assert.equal(fixture.metadata.production_acceptance_fixture, true);
  assert.equal(fixture.metadata.external_side_effects_permitted, false);
  assert.equal(fixture.metadata.created_by_actor_id, actorId);
});

test("M4.2b creates once with authenticated actor evidence and replays without writes", async () => {
  const database = new FakeDatabase();
  const events: any[] = [];
  const first = await createWs019M42AcceptanceFixture(database, { workspace_id: workspaceId, actor_id: actorId, correlation_id: correlationId, now, on_domain_event: async (event) => { events.push(event); } });
  assert.equal(first.created, true);
  assert.equal(database.activity.length, 1);
  assert.equal(database.activity[0].actor_id, actorId);
  assert.equal(events.length, 1);
  assert.equal(events[0].actor.id, actorId);
  assert.equal(events[0].workspaceId, workspaceId);
  assert.equal(events[0].correlationId, correlationId);
  assert.equal(events[0].relatedEntities.length, 0);
  const second = await createWs019M42AcceptanceFixture(database, { workspace_id: workspaceId, actor_id: actorId, correlation_id: correlationId, now, on_domain_event: async (event) => { events.push(event); } });
  assert.equal(second.created, false);
  assert.equal(second.idempotent, true);
  assert.equal(database.activity.length, 1);
  assert.equal(events.length, 1);
});

test("M4.2b fails closed for an incompatible existing fixture", async () => {
  const database = new FakeDatabase();
  database.workItem = { ...buildWs019M42AcceptanceFixture(workspaceId, actorId, now), title: "not the approved fixture" };
  await assert.rejects(createWs019M42AcceptanceFixture(database, { workspace_id: workspaceId, actor_id: actorId, correlation_id: correlationId, now }), (error: any) => error?.code === "acceptance_fixture_conflict" && error?.status === 409);
  assert.equal(database.activity.length, 0);
});

test("M4.2b fixture implementation has no provider, notification-state, or external-delivery dependency", () => {
  assert.doesNotMatch(createWs019M42AcceptanceFixture.toString(), /shopify|everflow|commas|notification_states|webhook|external delivery/i);
});
