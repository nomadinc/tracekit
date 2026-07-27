import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildPurchaseActivity,
  dedupeAndSortHomeActivity,
  matchHomeRoute,
  normalizeHomeParams,
} from "./home.ts";

function readRepoFile(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("home route is registered with deterministic method handling", () => {
  assert.deepEqual(matchHomeRoute("GET", "/v1/home"), { kind: "home_summary" });
  assert.deepEqual(matchHomeRoute("GET", "/v1/home/"), { kind: "home_summary" });
  assert.deepEqual(matchHomeRoute("POST", "/v1/home"), {
    kind: "method_not_allowed",
    path: "/v1/home",
    allowed_methods: ["GET"],
  });

  const index = readRepoFile("api/src/index.ts");
  assert.match(index, /matchHomeRoute\(req\.method, path\)/);
  assert.match(index, /buildHomeSummary\(getSupabase\(env\), params\)/);
});

test("home params preserve workspace and normalize reporting windows", () => {
  const now = new Date("2026-07-26T18:30:00.000Z");
  assert.deepEqual(normalizeHomeParams({ workspace_id: "default", window: "today" }, now), {
    workspace_id: "default",
    window: "today",
    from: "2026-07-26T00:00:00.000Z",
    to: "2026-07-26T18:30:00.000Z",
  });
  assert.deepEqual(normalizeHomeParams({ workspaceId: "store-a", window: "last_7_days" }, now), {
    workspace_id: "store-a",
    window: "last_7_days",
    from: "2026-07-20T00:00:00.000Z",
    to: "2026-07-26T18:30:00.000Z",
  });
  assert.equal(normalizeHomeParams({ window: "unknown" }, now).window, "month_to_date");
  assert.equal(normalizeHomeParams({ from: "2026-07-01", to: "2026-07-13" }, now).to, "2026-07-13T23:59:59.999Z");
});

test("purchase activity uses stable IDs and excludes low-level or reversal rows", () => {
  const activity = buildPurchaseActivity("default", {
    platform_order_id: "wowboost:123",
    order_id: "123",
    person_id: "person-1",
    platform: "wowboost",
    gross_amount: "99.00",
    currency: "USD",
    order_ts: "2026-07-26T12:00:00.000Z",
    status: "completed",
  });
  assert.equal(activity?.id, "activity:purchase:default:wowboost:123");
  assert.equal(activity?.type, "purchase_completed");
  assert.equal(activity?.deep_link, "/customers/person-1?order_id=123");
  assert.equal(buildPurchaseActivity("default", { ...activity, platform_order_id: "wowboost:refund", gross_amount: "-10", status: "refund" }), null);
});

test("home activity dedupes by deterministic ID and sorts by time", () => {
  const first = {
    id: "activity:one",
    type: "connector_failed",
    title: "Connector failed",
    summary: "Connector failed.",
    occurred_at: "2026-07-26T10:00:00.000Z",
    tone: "critical" as const,
    person_id: null,
    order_id: null,
    work_item_id: null,
    connector_id: "shopify",
    deep_link: "/settings/integrations/shopify",
    metadata: { api_token: "secret" },
  };
  const second = {
    ...first,
    id: "activity:two",
    occurred_at: "2026-07-26T11:00:00.000Z",
    metadata: { nested: { password: "secret" }, status: "failed" },
  };
  const deduped = dedupeAndSortHomeActivity([first, second, { ...first, summary: "duplicate" }], 10);
  assert.deepEqual(deduped.map((item) => item.id), ["activity:two", "activity:one"]);
});

test("home UI proxy and compatibility route are present", () => {
  const root = readRepoFile("ui/app/page.tsx");
  const overview = readRepoFile("ui/app/(app)/overview/page.tsx");
  const proxy = readRepoFile("ui/app/api/home/route.ts");
  const navigation = readRepoFile("ui/lib/app-navigation.ts");

  assert.match(root, /<HomeCommandCenter \/>/);
  assert.match(overview, /<HomeCommandCenter \/>/);
  assert.match(proxy, /\/v1\/home/);
  assert.match(navigation, /label: "Home"/);
  assert.doesNotMatch(root, /redirect\("\/overview"\)/);
});
