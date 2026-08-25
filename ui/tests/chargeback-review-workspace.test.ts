import test from "node:test";
import assert from "node:assert/strict";
import { CONFIDENCE_LABELS, evidenceFactorLabels, normalizeConfidence, parseReviewFilters } from "../lib/chargebacks/review.ts";
import { summaryFromExactCounts } from "../lib/chargebacks/summary.ts";

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

test("review workspace preserves the existing affiliate/source chargeback report", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../components/chargebacks/chargeback-review-workspace.tsx", import.meta.url), "utf8");
  assert.match(source, /FinancialIssueAnalysisClient/);
  assert.match(source, /Affiliate &amp; source performance/);
  assert.match(await readFile(new URL("../app/(app)/dashboard/financial-issue-analysis-client.tsx", import.meta.url), "utf8"), /\/v1\/chargebacks\/analysis/);
});

test("chargeback routes use same-origin JSON while Worker APIs keep their configured base", async () => {
  const { readFile } = await import("node:fs/promises");
  const workspace = await readFile(new URL("../components/chargebacks/chargeback-review-workspace.tsx", import.meta.url), "utf8");
  const api = await readFile(new URL("../lib/api.ts", import.meta.url), "utf8");
  assert.match(workspace, /sameOriginGetJson<Data>\(`\/api\/chargebacks\?/);
  assert.match(workspace, /sameOriginGetJson<Detail>\(`\/api\/chargebacks\/\$\{selected\.id\}`\)/);
  assert.match(api, /export async function sameOriginGetJson/);
  assert.match(api, /const url = pathAndQuery\.startsWith\("\/"\) \? pathAndQuery/);
  assert.match(api, /export async function apiGetJson/);
  assert.match(api, /const base = getApiBaseUrl\(\)/);
  assert.doesNotMatch(workspace, /NEXT_PUBLIC_API_BASE_URL|TK_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/);
});

test("chargeback summaries use exact server counts instead of the PostgREST row ceiling", async () => {
  const { readFile } = await import("node:fs/promises");
  const route = await readFile(new URL("../app/api/chargebacks/route.ts", import.meta.url), "utf8");
  const repository = await readFile(new URL("../lib/commerce/supabase-control-repository.ts", import.meta.url), "utf8");
  const summary = await readFile(new URL("../lib/chargebacks/summary.ts", import.meta.url), "utf8");
  assert.match(route, /commercePersistenceCount/);
  assert.match(repository, /Prefer: "count=exact"/);
  assert.doesNotMatch(route, /limit=20000/);
  assert.match(summary, /disputedAmount: null,\s*fees: null/);
  assert.match(route, /limit=1/);
});

test("large scoped populations retain exact confidence counts while rows stay paginated", () => {
  const summary = summaryFromExactCounts({
    total: 12168,
    statuses: { lost: 636, won: 32, needs_response: 199, under_review: 133 },
    confidence: { high_confidence: 9061, medium_confidence: 2476, needs_review: 572, unmatched: 59 },
  });
  assert.equal(summary.total, 12168);
  assert.equal(summary.confidence.needs_review, 572);
  assert.equal(summary.confidence.unmatched, 59);
  assert.equal(summary.disputedAmount, null);
  assert.equal(summary.fees, null);
});
