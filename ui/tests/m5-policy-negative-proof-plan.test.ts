import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const plan = readFileSync(new URL("../../docs/workstreams/WS-019_M5_POLICY_NEGATIVE_PROOF_PLAN.md", import.meta.url), "utf8");

test("M5 policy negative plan covers every bypass class without authorizing execution", () => {
  for (const required of [
    "authoritative_policy",
    "safe_disable_controls",
    "capability_suppression",
    "POST /api/actions/provider-prepare",
    "POST /api/actions/provider-confirm",
    "POST /api/actions/shopify/controlled-webhook-proof",
    "POST /api/actions/commas/webhook-test-delivery",
    "tracekit.prepare_shopify_controlled_proof",
    "tracekit.confirm_shopify_controlled_proof",
    "tracekit.execute_shopify_controlled_proof",
    "tracekit.execute_commas_test_delivery",
    "provider_action_disabled",
    "ws019-m3-shopify-proof-20261004-001",
    "No provider/action matrix expansion",
  ]) assert.match(plan, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), required);
  assert.match(plan, /PRODUCTION EXECUTION NOT AUTHORIZED/);
  assert.match(plan, /do not retry a request automatically/i);
  assert.match(plan, /production operational incident/i);
});

test("M5 plan preserves WS-022 ownership and validator separation", () => {
  assert.match(plan, /WS-022 owns that requirement/);
  assert.match(plan, /must not change `regression_gates`/);
  assert.match(plan, /Production V1 remains not ready/);
});
