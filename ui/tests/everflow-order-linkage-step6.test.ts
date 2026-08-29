import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = () => readFileSync(`${root}/lib/integrations/everflow-order-linkage.ts`, "utf8");

test("Everflow direct order linkage checks both transaction identity columns before email fallback", () => {
  const code = source();
  assert.match(code, /everflow_transaction_id=eq/);
  assert.match(code, /transaction_id=eq/);
  assert.ok(code.indexOf("directCandidates") < code.indexOf("emailCandidates"));
  assert.match(code, /matchMethod.*transaction_id/s);
  assert.match(code, /confidence = 1/);
});

test("email fallback is guarded by time and amount when amount is available", () => {
  const code = source();
  assert.match(code, /EMAIL_WINDOW_WITH_AMOUNT_MS = 72/);
  assert.match(code, /EMAIL_WINDOW_WITHOUT_AMOUNT_MS = 6/);
  assert.match(code, /order_ts=gte/);
  assert.match(code, /order_ts=lte/);
  assert.match(code, /AMOUNT_TOLERANCE = 0\.01/);
  assert.match(code, /receipt_total \?\? row\.gross_amount/);
  assert.match(code, /email_time_amount/);
  assert.match(code, /email_time/);
});

test("email alone is never treated as deterministic transaction identity", () => {
  const code = source();
  assert.match(code, /confidence = amount === null \? 0\.65 : 0\.85/);
  assert.doesNotMatch(code, /email_time[^\n]*confidence:\s*1/);
});

test("ambiguous candidates fail closed without creating mappings", () => {
  const code = source();
  assert.match(code, /candidates\.length > 1/);
  assert.match(code, /status: "ambiguous"/);
  const firstObserve = code.indexOf("const sourceObserved = await observeMapping");
  const ambiguity = code.indexOf('status: "ambiguous"');
  assert.ok(ambiguity >= 0 && firstObserve > ambiguity);
});

test("source mappings are connection and provider-account scoped", () => {
  const code = source();
  assert.match(code, /providerAccountId: account\.id/);
  assert.match(code, /sourceObjectType: CONVERSION_SOURCE_TYPE/);
  assert.match(code, /sourceObjectType: DIRECT_SOURCE_TYPE/);
  assert.match(code, /canonicalObjectType: "order"/);
  assert.match(code, /createOrObserveSourceMapping/);
});

test("existing mappings cannot silently move the same Everflow identity to another order", () => {
  const code = source();
  assert.match(code, /resolveSourceMapping/);
  assert.match(code, /existing\.canonicalObjectId !== input\.canonicalOrderId/);
  assert.match(code, /conflict: true/);
  assert.match(code, /status: "conflict"/);
});

test("Step 6 reuses platform_orders and commerce_source_mappings instead of inventing a parallel identity table", () => {
  const code = source();
  assert.match(code, /commercePersistenceRequest\(`platform_orders/);
  assert.match(code, /createOrObserveSourceMapping/);
  assert.doesNotMatch(code, /everflow_order_identity_matches/);
  assert.doesNotMatch(code, /everflow_attribution_identities/);
});

test("order-linkage route is authenticated and does not return email or transaction input", () => {
  const route = readFileSync(`${root}/app/v1/integrations/everflow/order-linkage/resolve/route.ts`, "utf8");
  assert.match(route, /resolveApplicationSession/);
  assert.match(route, /sameOrigin/);
  assert.match(route, /resolveAndMapEverflowOrder/);
  assert.doesNotMatch(route, /NextResponse\.json\([^\n]*email/);
  assert.doesNotMatch(route, /NextResponse\.json\([^\n]*transactionId/);
});
