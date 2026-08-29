import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = () => readFileSync(`${root}/lib/integrations/everflow-financial-projection.ts`, "utf8");
const route = () => readFileSync(`${root}/app/v1/integrations/everflow/conversions/sync/route.ts`, "utf8");

test("Everflow financial projection reuses the canonical conversions ledger", () => {
  const text = source();
  assert.match(text, /conversions\?on_conflict=organization_id,connection_id,provider_account_id,idempotency_key/);
  assert.match(text, /ledger_type: "affiliate_payout"/);
  assert.doesNotMatch(text, /everflow_financial_(?:events|ledger)/);
});

test("financial projection only activates after a verified canonical order mapping exists", () => {
  const text = source();
  assert.match(text, /source_object_type=eq\.everflow_conversion/);
  assert.match(text, /canonical_object_type=eq\.order/);
  assert.match(text, /canonical_order_id/);
  assert.match(text, /skippedUnmapped/);
});

test("Everflow payout is projected as signed affiliate cost, not duplicate customer revenue", () => {
  const text = source();
  assert.match(text, /amount: -effectivePayout/);
  assert.match(text, /amount: -stateChange\.payoutDelta/);
  assert.doesNotMatch(text, /ledger_type: "sale"/);
  assert.match(text, /source_direction: "cost"/);
});

test("baseline and state transitions have deterministic idempotency keys", () => {
  const text = source();
  assert.match(text, /everflow:affiliate_payout:baseline:/);
  assert.match(text, /everflow:affiliate_payout:state:/);
  assert.match(text, /resolution=ignore-duplicates/);
});

test("newly mapped current state is baselined and the same-run transition is not double counted", () => {
  const text = source();
  assert.match(text, /if \(!hasBaseline\)/);
  assert.match(text, /effectivePayout = state\.status === "approved" \? state\.payout : 0/);
  assert.match(text, /continue;\n    }\n\n    const currentHistory/s);
});

test("conversion sync returns dormant financial projection metrics", () => {
  const text = route();
  assert.match(text, /projectEverflowFinancialEffects/);
  assert.match(text, /financialProjection/);
  assert.ok(text.indexOf("persistEverflowEventReversalHistory") < text.indexOf("projectEverflowFinancialEffects({"));
});
