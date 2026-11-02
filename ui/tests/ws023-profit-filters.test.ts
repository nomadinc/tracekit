import test from "node:test";
import assert from "node:assert/strict";
import {
  validateProfitReportFilters,
  profitReportQuery,
  type ProfitReportFilters,
} from "../lib/profit-report-filters";

const base: ProfitReportFilters = {
  from: "2026-10-01",
  to: "2026-10-31",
  currency: "USD",
  connector_id: "connector-1",
  platform: "shopify",
  event_source: "commerce",
};

test("valid reporting range passes", () => {
  assert.equal(validateProfitReportFilters(base), null);
});

test("single-day boundary is valid", () => {
  assert.equal(validateProfitReportFilters({
    ...base, to: base.from
  }), null);
});

test("reversed date range is rejected", () => {
  assert.match(
    validateProfitReportFilters({
      ...base, from: "2026-11-01"
    }) || "",
    /Start date/
  );
});

test("invalid calendar dates are rejected", () => {
  assert.notEqual(validateProfitReportFilters({
    ...base, from: "2026-02-30"
  }), null);
});

test("invalid currency is rejected", () => {
  assert.notEqual(validateProfitReportFilters({
    ...base, currency: "US"
  }), null);
});

test("supported filters reach the query", () => {
  const query = new URLSearchParams(profitReportQuery(base));
  for (const [key, value] of Object.entries(base)) {
    assert.equal(query.get(key), value);
  }
  assert.equal(query.has("offer_id"), false);
});

test("empty optional filters are omitted", () => {
  const query = new URLSearchParams(profitReportQuery({
    ...base,
    currency: "",
    connector_id: "",
    platform: "",
    event_source: "",
  }));
  assert.equal(query.has("currency"), false);
  assert.equal(query.has("platform"), false);
});

import { readFileSync } from "node:fs";

const panelSource = readFileSync(
  new URL("../app/(app)/dashboard/profit-summary-panel.tsx", import.meta.url),
  "utf8"
);

test("Profit panel exposes supported filter controls", () => {
  for (const key of [
    "from",
    "to",
    "currency",
    "connector_id",
    "platform",
    "event_source",
  ]) {
    assert.ok(panelSource.includes(`"${key}"`));
  }
  assert.match(panelSource, /Apply filters/);
});

test("invalid filter context prevents Profit requests", () => {
  assert.match(panelSource, /context\.authorized && !filterError/);
  assert.match(panelSource, /validateProfitReportFilters\(draft\)/);
});

test("filter changes are included in request identity", () => {
  assert.match(panelSource, /query: filterQuery/);
  assert.match(panelSource, /controller\.snapshot\(contextKey, authorized\)/);
});

test("offer filtering remains unsupported", () => {
  assert.doesNotMatch(
    panelSource,
    /params\.set\("offer_id"/
  );
});
