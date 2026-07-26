import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GLOBAL_SEARCH_MAX_LIMIT,
  matchGlobalSearchRoute,
  normalizeGlobalSearchParams,
  searchWorkspace,
} from "./search.ts";

function readRepoFile(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

class FakeQuery {
  table: string;
  rows: any[];
  filters: Array<{ op: string; args: any[] }> = [];

  constructor(table: string, rows: any[]) {
    this.table = table;
    this.rows = rows;
  }

  select(...args: any[]) {
    this.filters.push({ op: "select", args });
    return this;
  }

  eq(...args: any[]) {
    this.filters.push({ op: "eq", args });
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

  limit(...args: any[]) {
    this.filters.push({ op: "limit", args });
    return this;
  }

  then(resolve: any, reject: any) {
    return Promise.resolve({ data: this.rows, error: null }).then(resolve, reject);
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

test("global search route accepts GET and rejects mutations", () => {
  assert.deepEqual(matchGlobalSearchRoute("GET", "/v1/search"), { kind: "global_search" });
  assert.deepEqual(matchGlobalSearchRoute("GET", "/v1/search/"), { kind: "global_search" });
  assert.deepEqual(matchGlobalSearchRoute("POST", "/v1/search"), {
    kind: "method_not_allowed",
    path: "/v1/search",
    allowed_methods: ["GET"],
  });
  assert.equal(matchGlobalSearchRoute("GET", "/v1/searching"), null);
});

test("global search is registered by the Worker dispatcher", () => {
  const worker = readRepoFile("api/src/index.ts");
  assert.match(worker, /matchGlobalSearchRoute\(req\.method, path\)/);
  assert.match(worker, /searchWorkspace\(getSupabase\(env\), params\)/);
  assert.match(worker, /global_search_failed/);
});

test("global search params are workspace scoped and bounded", () => {
  const params = normalizeGlobalSearchParams({
    workspace_id: "default",
    q: "  Order, 88392  ",
    limit: "500",
  });
  assert.equal(params.workspace_id, "default");
  assert.equal(params.query, "Order 88392");
  assert.equal(params.limit, GLOBAL_SEARCH_MAX_LIMIT);
});

test("short global search query returns empty groups without database reads", async () => {
  const supabase = new FakeSupabase({});
  const result = await searchWorkspace(supabase, normalizeGlobalSearchParams({ workspace_id: "default", q: "a" }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.groups, { customers: [], orders: [], work_items: [] });
  assert.equal(supabase.queries.length, 0);
});

test("global search queries customers, orders, and work items with concise output", async () => {
  const supabase = new FakeSupabase({
    people: [{
      id: "person-1",
      display_name: "Jane Smith",
      primary_email: "jane@example.com",
      primary_phone: null,
      last_seen_at: "2026-07-25T12:00:00.000Z",
      raw_json: { should_not: "leak" },
    }],
    platform_orders: [{
      platform: "shopify",
      platform_order_id: "shopify:gid-1",
      order_id: "88392",
      person_id: "person-1",
      customer_email: "jane@example.com",
      status_norm: "paid",
      gross_amount: "149.00",
      currency: "USD",
      order_ts: "2026-07-25T10:00:00.000Z",
      raw_json: { should_not: "leak" },
    }],
    work_items: [{
      id: "work-item-1",
      title: "Purchase has no attribution credit",
      summary: "Review source evidence.",
      status: "open",
      priority: "high",
      category: "attribution",
      deep_link: "/operations?work_item_id=work-item-1",
      raw_payload: { should_not: "leak" },
    }],
  });

  const result = await searchWorkspace(supabase, normalizeGlobalSearchParams({ workspace_id: "default", q: "88392", limit: "4" }));
  assert.equal(result.ok, true);
  assert.equal(result.workspace_id, "default");
  assert.equal(result.groups.customers[0].href, "/customers/person-1?workspace_id=default");
  assert.equal(result.groups.orders[0].title, "Order 88392");
  assert.match(result.groups.work_items[0].href, /workspace_id=default/);
  assert.equal(JSON.stringify(result).includes("should_not"), false);

  assert.deepEqual(supabase.queries.map((query) => query.table), ["people", "platform_orders", "work_items"]);
  for (const query of supabase.queries) {
    assert.deepEqual(query.filters.find((filter) => filter.op === "eq")?.args, ["workspace_id", "default"]);
    assert.deepEqual(query.filters.find((filter) => filter.op === "limit")?.args, [4]);
  }
});
