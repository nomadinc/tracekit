import assert from "node:assert/strict";
import test from "node:test";

import { sumPortfolioRows } from "../lib/mission-control/portfolio-math";

test("portfolio financial totals preserve signed ledger math before display normalization", () => {
  assert.equal(sumPortfolioRows([{ amount: -25 }, { amount: -10 }, { amount: 5 }], "amount"), -30);
});

test("portfolio aggregation treats missing and non-numeric amounts as zero", () => {
  assert.equal(sumPortfolioRows([{ amount: null }, {}, { amount: "12.50" }, { amount: "invalid" }], "amount"), 12.5);
});

test("portfolio aggregation does not infer values from unrelated fields", () => {
  assert.equal(sumPortfolioRows([{ gross_amount: 99 }, { revenue: 42 }], "amount"), 0);
});
