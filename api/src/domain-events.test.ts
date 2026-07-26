import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConnectorIncidentDomainEvent,
  buildFinancialAdjustmentDomainEventFromJourneyEvent,
  buildReconciliationDomainEvent,
  buildAttributionPendingDomainEventFromJourneyEvent,
  buildAttributionDomainEvent,
  buildCommissionDomainEvent,
  buildIdentityOutcomeDomainEvent,
  buildPurchaseDomainEventsFromJourneyEvent,
  createWorkspaceEventStream,
  formatSseMessage,
  listWorkspaceUpdates,
  matchDomainEventRoute,
  normalizeDomainEventInput,
  projectDomainEventsBatch,
  publishDomainEvent,
  redactDomainEventPayload,
  runScheduledDomainEventProjectionReplay,
  workspaceUpdateEnvelope,
  type DomainEventInput,
} from "./domain-events.ts";

class MemoryQuery {
  table: string;
  db: Record<string, any[]>;
  operation: "select" | "insert" | "upsert" = "select";
  row: any;
  filters: Array<(row: any) => boolean> = [];
  orderKey: string | null = null;
  orderAscending = true;
  limitValue: number | null = null;
  single = false;
  onConflict = "id";

  constructor(db: Record<string, any[]>, table: string) {
    this.db = db;
    this.table = table;
    this.db[table] ||= [];
  }

  select() {
    this.operation = this.operation || "select";
    return this;
  }

  insert(row: any) {
    this.operation = "insert";
    this.row = row;
    return this;
  }

  upsert(row: any, options: any = {}) {
    this.operation = "upsert";
    this.row = row;
    this.onConflict = options.onConflict || "id";
    return this;
  }

  eq(key: string, value: any) {
    this.filters.push((row) => row[key] === value);
    return this;
  }

  gt(key: string, value: any) {
    this.filters.push((row) => Number(row[key]) > Number(value));
    return this;
  }

  order(key: string, options: any = {}) {
    this.orderKey = key;
    this.orderAscending = options.ascending !== false;
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  in(key: string, values: any[]) {
    const allowed = new Set(values);
    this.filters.push((row) => allowed.has(row[key]));
    return this;
  }

  maybeSingle() {
    this.single = true;
    return this;
  }

  then(resolve: any, reject: any) {
    return Promise.resolve(this.execute()).then(resolve, reject);
  }

  execute() {
    const rows = this.db[this.table];
    if (this.operation === "insert") {
      if (this.table === "domain_events" && this.row.deduplication_key) {
        const dup = rows.find((row) => row.workspace_id === this.row.workspace_id && row.deduplication_key === this.row.deduplication_key);
        if (dup) return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
      }
      if (this.table === "activity_group_events") {
        const dup = rows.find((row) => row.activity_group_id === this.row.activity_group_id && row.domain_event_id === this.row.domain_event_id);
        if (dup) return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
      }
      const row = this.materialize(this.row);
      rows.push(row);
      return { data: this.single ? row : [row], error: null };
    }
    if (this.operation === "upsert") {
      if (this.table === "workspace_updates" && this.db.__fail_workspace_update_for_event_id?.includes(this.row.domain_event_id)) {
        return { data: null, error: { message: `Synthetic projection failure for ${this.row.domain_event_id}: token=secret person@example.com` } };
      }
      const keys = String(this.onConflict || "id").split(",").map((key) => key.trim()).filter(Boolean);
      const index = rows.findIndex((candidate) => keys.every((key) => candidate[key] === this.row[key]));
      const row = this.materialize({ ...(index >= 0 ? rows[index] : {}), ...this.row });
      if (index >= 0) rows[index] = row;
      else rows.push(row);
      return { data: this.single ? row : [row], error: null };
    }
    let selected = rows.filter((row) => this.filters.every((filter) => filter(row)));
    if (this.orderKey) {
      selected = selected.slice().sort((a, b) => {
        const av = a[this.orderKey as string];
        const bv = b[this.orderKey as string];
        return this.orderAscending ? Number(av) - Number(bv) : Number(bv) - Number(av);
      });
    }
    if (this.limitValue !== null) selected = selected.slice(0, this.limitValue);
    return { data: this.single ? (selected[0] || null) : selected, error: null };
  }

  materialize(row: any) {
    const now = "2026-07-26T12:00:00.000Z";
    if (this.table === "domain_events") {
      return {
        event_position: row.event_position || this.db.domain_events.length + 1,
        id: row.id || `evt_${this.db.domain_events.length + 1}`,
        recorded_at: row.recorded_at || now,
        created_at: row.created_at || now,
        ...row,
      };
    }
    if (this.table === "workspace_updates") {
      return {
        update_position: row.update_position || this.db.workspace_updates.length + 1,
        created_at: row.created_at || now,
        ...row,
      };
    }
    if (this.table === "activity_groups") {
      return {
        created_at: row.created_at || now,
        updated_at: row.updated_at || now,
        ...row,
      };
    }
    return { id: row.id || `row_${rowsafe(this.db[this.table].length + 1)}`, created_at: row.created_at || now, ...row };
  }
}

function rowsafe(value: number) {
  return String(value).padStart(3, "0");
}

function memorySupabase() {
  const db: Record<string, any[]> = {};
  return {
    db,
    from(table: string) {
      return new MemoryQuery(db, table);
    },
  };
}

function workItemEvent(overrides: Partial<DomainEventInput> = {}): DomainEventInput {
  return {
    workspaceId: "default",
    type: "work_item.resolved",
    occurredAt: "2026-07-26T12:00:00.000Z",
    subject: { type: "work_item", id: "wi_1", displayName: "Identity review" },
    relatedEntities: [{ type: "customer", id: "person_1", relationship: "related_customer" }],
    source: { system: "work_items" },
    severity: "success",
    deduplicationKey: "work_item:wi_1:resolved:2026-07-26T12:00:00.000Z",
    payload: {
      changed_fields: ["status", "resolved_at"],
      token: "super-secret",
      email: "person@example.com",
    },
    ...overrides,
  };
}

test("domain event routes do not conflict with Event Explorer detail routing", () => {
  assert.deepEqual(matchDomainEventRoute("GET", "/v1/events/stream"), { kind: "stream" });
  assert.deepEqual(matchDomainEventRoute("GET", "/v1/events/stream/"), { kind: "stream" });
  assert.deepEqual(matchDomainEventRoute("POST", "/v1/events/projections/replay"), { kind: "replay_projections" });
  assert.deepEqual(matchDomainEventRoute("POST", "/v1/internal/events/projections/run"), { kind: "internal_run_projections" });
  assert.deepEqual(matchDomainEventRoute("POST", "/v1/internal/events/projections/replay"), { kind: "internal_replay_projections" });
  assert.deepEqual(matchDomainEventRoute("GET", "/v1/internal/events/projections/status"), { kind: "internal_projection_status" });
  assert.deepEqual(matchDomainEventRoute("GET", "/v1/events/projections/replay"), {
    kind: "method_not_allowed",
    path: "/v1/events/projections/replay",
    allowed_methods: ["POST"],
  });
  assert.deepEqual(matchDomainEventRoute("POST", "/v1/events/stream"), {
    kind: "method_not_allowed",
    path: "/v1/events/stream",
    allowed_methods: ["GET"],
  });
  assert.equal(matchDomainEventRoute("GET", "/v1/events/browser"), null);
});

test("domain event validation enforces workspace, event naming, and payload versioning", () => {
  assert.throws(() => normalizeDomainEventInput(workItemEvent({ workspaceId: "" })), /workspaceId/);
  assert.throws(() => normalizeDomainEventInput(workItemEvent({ type: "WorkItemResolved" })), /Invalid domain event type/);
  const normalized = normalizeDomainEventInput(workItemEvent({ payload: { changed_fields: ["status"] } }));
  assert.equal(normalized.payload.schema_version, 1);
  assert.equal(normalized.subject.type, "work_item");
});

test("domain event payload redacts prohibited keys and contact fields", () => {
  const redacted = redactDomainEventPayload({
    access_token: "abc",
    nested: { password: "secret", email: "person@example.com", safe: "ok" },
  });
  assert.equal(redacted.access_token, "[redacted]");
  assert.equal(redacted.nested.password, "[redacted]");
  assert.equal(redacted.nested.email, "[redacted:contact]");
  assert.equal(redacted.nested.safe, "ok");
});

test("publishing persists one event, creates workspace updates, and dedupes producer retries", async () => {
  const supabase = memorySupabase();
  const first = await publishDomainEvent(supabase, workItemEvent());
  const second = await publishDomainEvent(supabase, workItemEvent());
  assert.equal(supabase.db.domain_events.length, 1);
  assert.equal(first.event.id, second.event.id);
  assert.equal(supabase.db.workspace_updates.length, 2);
  assert.equal(supabase.db.activity_groups.length, 1);
  assert.equal(supabase.db.activity_groups[0].event_count, 1);
  assert.equal(supabase.db.domain_events[0].payload.token, "[redacted]");
  assert.equal(supabase.db.domain_events[0].payload.email, "[redacted:contact]");
});

test("workspace update replay is ordered and workspace isolated", async () => {
  const supabase = memorySupabase();
  await publishDomainEvent(supabase, workItemEvent({ subject: { type: "work_item", id: "wi_1" }, deduplicationKey: "a" }));
  await publishDomainEvent(supabase, workItemEvent({ workspaceId: "other", subject: { type: "work_item", id: "wi_other" }, deduplicationKey: "b" }));
  await publishDomainEvent(supabase, workItemEvent({ subject: { type: "work_item", id: "wi_2" }, deduplicationKey: "c" }));
  const updates = await listWorkspaceUpdates(supabase, { workspace_id: "default", after_cursor: 0, limit: 10 });
  assert.equal(updates.length, 4);
  assert.deepEqual(updates.map((update) => update.workspace_id), ["default", "default", "default", "default"]);
  assert.deepEqual(updates.map((update) => update.update_position), [1, 2, 5, 6]);
  const replay = await listWorkspaceUpdates(supabase, { workspace_id: "default", after_cursor: 2, limit: 10 });
  assert.deepEqual(replay.map((update) => update.update_position), [5, 6]);
});

test("workspace update SSE envelope is browser-safe", async () => {
  const supabase = memorySupabase();
  await publishDomainEvent(supabase, workItemEvent());
  const update = supabase.db.workspace_updates[0];
  const envelope = workspaceUpdateEnvelope(update);
  assert.equal(envelope.workspaceId, "default");
  assert.equal(envelope.type, "work_item.changed");
  assert.equal(envelope.entity?.id, "wi_1");
  assert.equal((envelope.payload as any).source_system, "work_items");
  assert.equal(JSON.stringify(envelope).includes("super-secret"), false);
  const message = formatSseMessage({ id: update.update_position, event: "workspace.update", data: envelope });
  assert.match(message, /^id: 1\nevent: workspace\.update\ndata: /);
});

test("workspace SSE stream sends connected event and replays workspace updates", async () => {
  const supabase = memorySupabase();
  await publishDomainEvent(supabase, workItemEvent());
  const abort = new AbortController();
  const response = createWorkspaceEventStream(supabase, {
    workspace_id: "default",
    last_event_id: "0",
    poll_ms: 1000,
    signal: abort.signal,
  });
  assert.equal(response.headers.get("content-type"), "text/event-stream; charset=utf-8");
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let streamed = "";
  for (let i = 0; i < 3 && !streamed.includes("workspace.update"); i += 1) {
    const chunk = await Promise.race([
      reader.read(),
      new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) => setTimeout(() => reject(new Error("stream read timeout")), 1000)),
    ]);
    if (chunk.done) break;
    streamed += decoder.decode(chunk.value);
  }
  abort.abort();
  await reader.cancel().catch(() => null);
  assert.match(streamed, /event: workspace\.connected/);
  assert.match(streamed, /event: workspace\.update/);
  assert.match(streamed, /"workspaceId":"default"/);
  assert.doesNotMatch(streamed, /super-secret|person@example.com/);
});

test("activity group evolves deterministically across related events", async () => {
  const supabase = memorySupabase();
  const base = {
    workspaceId: "default",
    occurredAt: "2026-07-26T12:00:00.000Z",
    correlationId: "order_1",
    source: { system: "smoke" },
    severity: "success" as const,
  };
  await publishDomainEvent(supabase, {
    ...base,
    type: "purchase.completed",
    subject: { type: "order", id: "order_1", displayName: "Order 1" },
    deduplicationKey: "purchase:order_1",
    payload: { amount: "149.00", currency: "USD" },
  });
  await publishDomainEvent(supabase, {
    ...base,
    type: "attribution.generated",
    subject: { type: "attribution", id: "credit_1", displayName: "Attribution credit" },
    deduplicationKey: "attribution:credit_1",
    payload: { model: "first_touch" },
  });
  await publishDomainEvent(supabase, {
    ...base,
    type: "commission.created",
    subject: { type: "commission", id: "commission_1", displayName: "Commission" },
    deduplicationKey: "commission:commission_1",
    payload: { amount: "7.43", currency: "USD" },
  });
  assert.equal(supabase.db.activity_groups.length, 1);
  assert.equal(supabase.db.activity_groups[0].status, "completed");
  assert.match(supabase.db.activity_groups[0].summary, /Purchase, attribution, and commission/);
  assert.equal(supabase.db.activity_groups[0].event_count, 3);
});

test("purchase pending attribution remains one active Activity Intelligence group", async () => {
  const supabase = memorySupabase();
  const base = {
    workspaceId: "default",
    occurredAt: "2026-07-26T12:00:00.000Z",
    correlationId: "order_pending_1",
    source: { system: "smoke" },
  };
  await publishDomainEvent(supabase, {
    ...base,
    type: "purchase.completed",
    subject: { type: "purchase", id: "order_pending_1", displayName: "Order pending 1" },
    severity: "success",
    deduplicationKey: "purchase:order_pending_1",
    payload: { amount: "149.00", currency: "USD" },
  });
  await publishDomainEvent(supabase, {
    ...base,
    type: "attribution.pending",
    subject: { type: "attribution", id: "order_pending_1:pending", displayName: "Attribution pending" },
    severity: "info",
    deduplicationKey: "attribution:order_pending_1:pending",
    payload: { reason: "purchase_retained" },
  });
  assert.equal(supabase.db.activity_groups.length, 1);
  assert.equal(supabase.db.activity_groups[0].status, "active");
  assert.match(supabase.db.activity_groups[0].summary, /waiting for attribution/);
});

test("native producer builders create safe purchase, identity, attribution, and commission events", () => {
  const purchaseEvents = buildPurchaseDomainEventsFromJourneyEvent({
    id: "journey-event-1",
    workspace_id: "default",
    event_type: "purchase",
    event_time: "2026-07-26T12:00:00.000Z",
    source_platform: "browser",
    source_connector: "browser-event-normalization",
    source_record_id: "purchase-smoke-1",
    platform_order_id: null,
    person_id: "person-1",
    journey_id: "journey-1",
    amount: "149.00",
    currency: "usd",
  });
  assert.deepEqual(purchaseEvents.map((event) => event.type), ["purchase.received", "purchase.completed"]);
  assert.equal(purchaseEvents[0].correlationId, purchaseEvents[1].correlationId);
  assert.equal(purchaseEvents[0].payload?.identity_state, "matched");
  assert.equal(purchaseEvents[0].payload?.currency, "USD");
  const pending = buildAttributionPendingDomainEventFromJourneyEvent({
    id: "journey-event-1",
    workspace_id: "default",
    event_type: "purchase",
    event_time: "2026-07-26T12:00:00.000Z",
    source_platform: "browser",
    source_record_id: "purchase-smoke-1",
    person_id: "person-1",
    journey_id: "journey-1",
  });
  assert.equal(pending?.type, "attribution.pending");
  assert.equal(pending?.correlationId, purchaseEvents[0].correlationId);

  const identity = buildIdentityOutcomeDomainEvent({
    action: "created_person",
    person_id: "person-1",
    matched_identifiers: [{ identifier_type: "email" }],
    attached_identifiers: [{ identifier_type: "email" }],
    conflicts: [],
  }, {
    workspace_id: "default",
    source_platform: "browser",
    source_record_type: "browser_event",
    source_record_id: "identify-1",
    occurred_at: "2026-07-26T12:00:00.000Z",
  });
  assert.equal(identity?.type, "identity.created");
  assert.equal(identity?.payload?.attached_identifier_count, 1);
  assert.equal(JSON.stringify(identity).includes("person@example.com"), false);

  const attribution = buildAttributionDomainEvent({
    workspace_id: "default",
    journey_id: "journey-1",
    person_id: "person-1",
    conversion_event_id: "purchase-smoke-1",
    touchpoint_event_id: "touch-1",
    model: "first_touch",
    model_version: "v1",
    status: "attributed",
    affiliate_id: "aff-1",
    credit_amount: "149.00",
    currency: "USD",
    calculated_at: "2026-07-26T12:01:00.000Z",
  });
  assert.equal(attribution.type, "attribution.generated");
  assert.equal(attribution.payload?.affiliate_id, "aff-1");

  const commission = buildCommissionDomainEvent({
    workspace_id: "default",
    commission_event_id: "commission-1",
    journey_attribution_credit_id: "credit-1",
    conversion_event_id: "purchase-smoke-1",
    journey_id: "journey-1",
    person_id: "person-1",
    affiliate_id: "aff-1",
    publisher_id: "pub-1",
    model: "first_touch",
    model_version: "v1",
    credit_amount: "149.00",
    commission_rate: "0.075",
    commission_amount: "11.18",
    currency: "USD",
    status: "draft",
    generated_at: "2026-07-26T12:02:00.000Z",
  });
  assert.equal(commission.type, "commission.created");
  assert.equal(commission.correlationId, attribution.correlationId);
  assert.equal(commission.payload?.commission_amount, "11.18");

  const refund = buildFinancialAdjustmentDomainEventFromJourneyEvent({
    id: "refund-event-1",
    workspace_id: "default",
    event_type: "refund",
    event_time: "2026-07-26T12:03:00.000Z",
    source_platform: "shopify",
    source_record_id: "refund-1",
    platform_order_id: "order-1",
    amount: "-20.00",
    currency: "USD",
  });
  assert.equal(refund?.type, "refund.received");
  assert.equal(refund?.payload?.append_only, true);

  const connector = buildConnectorIncidentDomainEvent({
    workspace_id: "default",
    connector_id: "everflow",
    status: "failed",
    safe_summary: "Delivery failed because token=secret person@example.com",
    task_id: "task-1",
  });
  assert.equal(connector?.type, "connector.delivery_failed");
  assert.equal(connector?.correlationId, "connector_incident:default:everflow");
  assert.equal(JSON.stringify(connector).includes("person@example.com"), false);

  const reconciliation = buildReconciliationDomainEvent({
    workspace_id: "default",
    type: "reconciliation.matched",
    case_id: "case-1",
    entity_id: "order-1",
    connector_id: "paypal",
  });
  assert.equal(reconciliation?.type, "reconciliation.matched");
  assert.equal(reconciliation?.correlationId, "case-1");
});

test("projector replay persists consumer cursor and does not duplicate projections", async () => {
  const supabase = memorySupabase();
  await publishDomainEvent(supabase, {
    workspaceId: "default",
    type: "purchase.completed",
    occurredAt: "2026-07-26T12:00:00.000Z",
    subject: { type: "purchase", id: "purchase-1" },
    source: { system: "test" },
    correlationId: "purchase-1",
    deduplicationKey: "purchase-1",
    payload: { amount: "149.00", currency: "USD" },
  });
  supabase.db.workspace_updates = [];
  supabase.db.activity_groups = [];
  supabase.db.activity_group_events = [];

  const first = await projectDomainEventsBatch(supabase, { workspace_id: "default", limit: 10 });
  const second = await projectDomainEventsBatch(supabase, { workspace_id: "default", limit: 10 });

  assert.equal(first.events_seen, 1);
  assert.equal(first.events_projected, 1);
  assert.equal(first.last_event_position, 1);
  assert.equal(second.events_seen, 0);
  assert.equal(supabase.db.workspace_updates.length, 2);
  assert.equal(supabase.db.activity_groups.length, 1);
  assert.equal(supabase.db.domain_event_consumer_state[0].last_event_position, 1);
});

test("projector replay is workspace isolated", async () => {
  const supabase = memorySupabase();
  await publishDomainEvent(supabase, workItemEvent({ workspaceId: "default", deduplicationKey: "default-event" }));
  await publishDomainEvent(supabase, workItemEvent({ workspaceId: "other", deduplicationKey: "other-event" }));
  supabase.db.workspace_updates = [];
  supabase.db.activity_groups = [];
  supabase.db.activity_group_events = [];

  const result = await projectDomainEventsBatch(supabase, { workspace_id: "other", limit: 10 });

  assert.equal(result.events_seen, 1);
  assert.equal(supabase.db.workspace_updates.length, 2);
  assert.deepEqual(Array.from(new Set(supabase.db.workspace_updates.map((row) => row.workspace_id))), ["other"]);
});

test("projector replay rejects unsafe consumers and privileged rewinds by default", async () => {
  const supabase = memorySupabase();
  await publishDomainEvent(supabase, workItemEvent({ deduplicationKey: "rewind-1" }));
  await projectDomainEventsBatch(supabase, { workspace_id: "default", limit: 10 });

  await assert.rejects(
    () => projectDomainEventsBatch(supabase, { workspace_id: "default", consumer_name: "arbitrary_consumer" }),
    /Unknown domain event consumer/,
  );
  await assert.rejects(
    () => projectDomainEventsBatch(supabase, { workspace_id: "default", from_position: 0 }),
    /requires privileged repair replay/,
  );
  const repair = await projectDomainEventsBatch(supabase, { workspace_id: "default", from_position: 0, allow_rewind: true });
  assert.equal(repair.events_seen, 1);
});

test("active projection lease prevents overlapping runners", async () => {
  const supabase = memorySupabase();
  await publishDomainEvent(supabase, workItemEvent({ deduplicationKey: "lease-1" }));
  supabase.db.domain_event_consumer_state = [{
    consumer_name: "workspace_live_projection_v1",
    workspace_id: "default",
    last_event_position: 0,
    lease_owner: "runner-a",
    lease_expires_at: new Date(Date.now() + 60000).toISOString(),
  }];

  const result = await projectDomainEventsBatch(supabase, { workspace_id: "default", runner_id: "runner-b" });

  assert.equal(result.locked, true);
  assert.equal(result.events_seen, 0);
  assert.equal(result.lease_owner, "runner-a");
});

test("projection failure is persisted without advancing cursor past failed event", async () => {
  const supabase = memorySupabase();
  await publishDomainEvent(supabase, workItemEvent({ subject: { type: "work_item", id: "wi-fail" }, deduplicationKey: "fail-1" }));
  await publishDomainEvent(supabase, workItemEvent({ subject: { type: "work_item", id: "wi-after" }, deduplicationKey: "fail-2" }));
  supabase.db.workspace_updates = [];
  supabase.db.activity_groups = [];
  supabase.db.activity_group_events = [];
  supabase.db.domain_event_consumer_state = [];
  supabase.db.__fail_workspace_update_for_event_id = ["evt_1"];

  const result = await projectDomainEventsBatch(supabase, { workspace_id: "default", limit: 10, continue_on_error: true, poison_threshold: 2 });

  assert.equal(result.events_seen, 2);
  assert.equal(result.events_failed, 1);
  assert.equal(result.last_event_position, 0);
  assert.equal(supabase.db.domain_event_projection_failures.length, 1);
  assert.equal(supabase.db.domain_event_projection_failures[0].event_id, "evt_1");
  assert.equal(JSON.stringify(supabase.db.domain_event_projection_failures[0]).includes("person@example.com"), false);
  assert.ok(supabase.db.workspace_updates.some((row) => row.domain_event_id === "evt_2"));

  supabase.db.__fail_workspace_update_for_event_id = [];
  const retry = await projectDomainEventsBatch(supabase, { workspace_id: "default", limit: 10 });
  assert.equal(retry.ok, true);
  assert.equal(retry.last_event_position, 2);
  assert.equal(supabase.db.domain_event_projection_failures[0].status, "resolved");
});

test("scheduled projection runner processes registered consumers across workspaces", async () => {
  const supabase = memorySupabase();
  await publishDomainEvent(supabase, workItemEvent({ workspaceId: "default", deduplicationKey: "scheduled-default" }));
  await publishDomainEvent(supabase, workItemEvent({ workspaceId: "other", deduplicationKey: "scheduled-other" }));
  supabase.db.workspace_updates = [];
  supabase.db.activity_groups = [];
  supabase.db.activity_group_events = [];
  supabase.db.domain_event_consumer_state = [];

  const result = await runScheduledDomainEventProjectionReplay(supabase, { batch_size: 10, max_workspaces: 5, max_events: 10 });

  assert.equal(result.ok, true);
  assert.equal(result.workspaces_seen, 2);
  assert.equal(result.consumers_seen, 2);
  assert.equal(result.events_projected, 2);
  assert.deepEqual(Array.from(new Set(supabase.db.workspace_updates.map((row) => row.workspace_id))).sort(), ["default", "other"]);
});
