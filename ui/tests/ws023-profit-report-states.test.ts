import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const panel = readFileSync(
  new URL("../app/(app)/dashboard/profit-summary-panel.tsx", import.meta.url),
  "utf8"
);

test("Profit loading state is explicit", () => {
  assert.match(panel, /authorized && loading/);
  assert.match(panel, /Loading financial evidence/);
});

test("Profit empty state is explicit", () => {
  assert.match(panel, /!loading && !error && !reportHasData/);
  assert.match(panel, /No qualified financial records/);
});

test("missing costs are not silently treated as zero", () => {
  assert.match(panel, /missingRecordedCosts/);
  assert.match(panel, /missing costs are not confirmed zero/);
});

test("Profit remains operational and unreconciled", () => {
  assert.match(panel, /Operational — Unreconciled/);
});

test("financial values require qualified currency and available data", () => {
  assert.match(panel, /reportHasData && reportCurrency/);
});

test("permission loss hides financial report state", () => {
  assert.match(panel, /controller\.snapshot\(contextKey, authorized\)/);
  assert.match(panel, /Detailed Profit Reporting is unavailable/);
});

test("missing monetary values remain unavailable", () => {
  assert.match(panel, /if \(n === null\) return "Unavailable"/);
});

test("report requests remain cancellable", () => {
  assert.match(panel, /operation\.cancel\(\)/);
});
