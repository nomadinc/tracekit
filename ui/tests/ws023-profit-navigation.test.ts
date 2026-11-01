import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const root = process.cwd();

function source(path: string) {
  return readFileSync(`${root}/${path}`, "utf8");
}

test("Money hub links to dedicated Profit Reporting", () => {
  const hub = source("components/money/money-hub.tsx");

  assert.match(hub, /href="\/money\/profit"/);
  assert.match(hub, /title="Profit Reporting"/);
});

test("Profit page mounts the repaired summary component", () => {
  const page = source("app/(app)/money/profit/page.tsx");

  assert.match(page, /ProfitSummaryPanel/);
  assert.match(page, /<Suspense/);
});

test("Profit API requires detailed financial permissions", () => {
  const route = source("app/api/profit/summary/route.ts");

  assert.match(route, /scopedCoreGet/);
  assert.match(route, /financials\.view/);
  assert.match(route, /orders\.view_financials/);
});

test("Profit report preserves unreconciled qualification", () => {
  const panel = source("app/(app)/dashboard/profit-summary-panel.tsx");

  assert.match(panel, /Operational — Unreconciled/);
  assert.match(panel, /reportCurrency/);
  assert.match(panel, /reportHasData/);
});
