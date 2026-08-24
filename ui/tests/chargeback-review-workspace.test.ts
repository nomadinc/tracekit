import test from "node:test";
import assert from "node:assert/strict";
import { CONFIDENCE_LABELS, evidenceFactorLabels, normalizeConfidence, parseReviewFilters } from "../lib/chargebacks/review.ts";

test("chargeback review filters are bounded and preserve server pagination", () => {
  const filters = parseReviewFilters(new URLSearchParams("page=0&page_size=1000&confidence=needs_review&matched=unmatched"));
  assert.equal(filters.page, 1);
  assert.equal(filters.pageSize, 100);
  assert.equal(filters.confidence, "needs_review");
  assert.equal(filters.matched, "unmatched");
});

test("confidence presentation is defensive for unknown values", () => {
  assert.equal(normalizeConfidence("unexpected-provider-state"), "unmatched");
  assert.equal(CONFIDENCE_LABELS[normalizeConfidence("needs_review")], "Needs Review");
});

test("evidence factors become operator-readable labels", () => {
  assert.deepEqual(evidenceFactorLabels({ contact_signal_exact: true, date_exact: false, date_distance_days: 2, amount_exact: true, product_exact: false, payment_compatible: true }), [
    { label: "Contact signal", result: "Exact" },
    { label: "Date", result: "2 day distance" },
    { label: "Amount", result: "Exact" },
    { label: "Product", result: "Not exact" },
    { label: "Payment method", result: "Compatible" },
  ]);
});

test("review workspace keeps candidate resolution read-only", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../components/chargebacks/chargeback-review-workspace.tsx", import.meta.url), "utf8");
  assert.match(source, /Candidates are shown for human review/);
  assert.doesNotMatch(source, /apiPostJson|mutation|resolveCandidate/);
});
