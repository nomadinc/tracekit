import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ENTITY_PREVIEW_LIMITS,
  getEntityPreview,
  matchEntityPreviewRoute,
} from "./entities.ts";

function readRepoFile(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

class FakeQuery {
  table: string;
  allRows: any[];
  filters: Array<{ op: string; args: any[] }> = [];
  limitValue: number | null = null;

  constructor(table: string, rows: any[]) {
    this.table = table;
    this.allRows = rows;
  }

  select(...args: any[]) {
    this.filters.push({ op: "select", args });
    return this;
  }

  eq(...args: any[]) {
    this.filters.push({ op: "eq", args });
    return this;
  }

  in(...args: any[]) {
    this.filters.push({ op: "in", args });
    return this;
  }

  or(...args: any[]) {
    this.filters.push({ op: "or", args });
    return this;
  }

  order(...args: any[]) {
    this.filters.push({ op: "order", args });
    return this;
  }

  limit(value: number) {
    this.filters.push({ op: "limit", args: [value] });
    this.limitValue = value;
    return this;
  }

  filteredRows() {
    let result = [...this.allRows];
    for (const filter of this.filters) {
      if (filter.op === "eq") {
        const [key, value] = filter.args;
        result = result.filter((row) => String(row[key] ?? "") === String(value ?? ""));
      }
      if (filter.op === "in") {
        const [key, values] = filter.args;
        const allowed = new Set((values || []).map((value: any) => String(value)));
        result = result.filter((row) => allowed.has(String(row[key] ?? "")));
      }
    }
    return result.slice(0, this.limitValue || result.length);
  }

  maybeSingle() {
    return Promise.resolve({ data: this.filteredRows()[0] || null, error: null });
  }

  then(resolve: any, reject: any) {
    return Promise.resolve({ data: this.filteredRows(), error: null }).then(resolve, reject);
  }
}

class FakeSupabase {
  queries: FakeQuery[] = [];
  rows: Record<string, any[]>;

  constructor(rows: Record<string, any[]>) {
    this.rows = rows;
  }

  from(table: string) {
    const query = new FakeQuery(table, this.rows[table] || []);
    this.queries.push(query);
    return query;
  }
}

test("entity preview route matches supported entity types and rejects mutations", () => {
  assert.deepEqual(matchEntityPreviewRoute("GET", "/v1/entities/customer/person-1/preview"), {
    kind: "entity_preview",
    entity_type: "customer",
    entity_id: "person-1",
  });
  assert.deepEqual(matchEntityPreviewRoute("GET", "/v1/entities/order/shopify%3A123/preview"), {
    kind: "entity_preview",
    entity_type: "order",
    entity_id: "shopify:123",
  });
  assert.deepEqual(matchEntityPreviewRoute("POST", "/v1/entities/work_item/item-1/preview"), {
    kind: "method_not_allowed",
    path: "/v1/entities/:entity_type/:id/preview",
    allowed_methods: ["GET"],
  });
  assert.equal(matchEntityPreviewRoute("GET", "/v1/entities/integration/shopify/preview"), null);
});

test("entity preview route is registered by the Worker dispatcher", () => {
  const worker = readRepoFile("api/src/index.ts");
  assert.match(worker, /matchEntityPreviewRoute\(req\.method, path\)/);
  assert.match(worker, /getEntityPreview\(getSupabase\(env\)/);
  assert.match(worker, /entity_preview_failed/);
});

test("customer preview is workspace scoped and bounded", async () => {
  const supabase = new FakeSupabase({
    people: [{
      id: "person-1",
      workspace_id: "default",
      status: "active",
      display_name: "Jane Smith",
      primary_email: "jane@example.com",
      last_seen_at: "2026-07-25T10:00:00.000Z",
    }],
    person_identifiers: Array.from({ length: 12 }).map((_, index) => ({
      workspace_id: "default",
      person_id: "person-1",
      identifier_type: index ? "email" : "customer_id",
      raw_value: index ? `jane+${index}@example.com` : "person-1",
      verification_status: "observed",
      is_primary: index === 0,
      updated_at: "2026-07-25T10:00:00.000Z",
    })),
    platform_orders: Array.from({ length: 10 }).map((_, index) => ({
      workspace_id: "default",
      person_id: "person-1",
      platform_order_id: `order-${index}`,
      order_id: `${88390 + index}`,
      gross_amount: "99.00",
      currency: "USD",
      order_ts: "2026-07-25T10:00:00.000Z",
      status_norm: "paid",
    })),
    work_items: [{
      id: "work-1",
      workspace_id: "default",
      related_person_id: "person-1",
      title: "Purchase has no attribution credit",
      summary: "Review attribution evidence.",
      priority: "high",
      status: "open",
      updated_at: "2026-07-25T10:00:00.000Z",
    }],
    journeys: [{
      id: "journey-1",
      workspace_id: "default",
      person_id: "person-1",
      started_at: "2026-07-25T10:00:00.000Z",
      status: "active",
    }],
    journey_attribution_credits: [],
  });

  const result = await getEntityPreview(supabase, {
    workspace_id: "default",
    entity_type: "customer",
    entity_id: "person-1",
  });

  assert.equal(result.ok, true);
  assert.equal(result.entity.type, "customer");
  assert.equal(result.entity.title, "Jane Smith");
  assert.equal(result.entity.sections.find((section) => section.id === "latest_orders")?.items.length, ENTITY_PREVIEW_LIMITS.latest_orders);
  assert.equal(JSON.stringify(result).includes("raw_json"), false);

  for (const query of supabase.queries) {
    assert.deepEqual(query.filters.find((filter) => filter.op === "eq")?.args, ["workspace_id", "default"]);
  }
});
