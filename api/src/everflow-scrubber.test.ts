import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEverflowForwardingParameters,
  controllerPassProbability,
  conversionIdempotencyKey,
  decideEligibleConversion,
  normalizeConversionPayload,
  resolveScrubRule,
} from "./everflow-scrubber.ts";

const valid = { transaction_id: "ef-tid-1", oid: 52, affid: "107", order_id: "ORD-1", amount: 67, currency: "usd" };

test("normalizes the minimum routing contract without coercing malformed IDs", () => {
  const result = normalizeConversionPayload(valid, "commas");
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual([result.conversion.offerId, result.conversion.affiliateId, result.conversion.currency], ["52", "107", "USD"]);
  for (const bad of ["52.0", "1e2", "+52", "0", -1, 52.1, null]) {
    assert.equal(normalizeConversionPayload({ ...valid, oid: bad }, "commas").ok, false);
  }
});

test("rule precedence is pair then offer then global", () => {
  const global = { globalPassRate: .8 };
  assert.deepEqual(resolveScrubRule(global), { source: "global", ruleId: null, passRate: .8 });
  assert.deepEqual(resolveScrubRule({ ...global, offerRule: { id: "offer", passRate: .7 } }), { source: "offer", ruleId: "offer", passRate: .7 });
  assert.deepEqual(resolveScrubRule({ ...global, offerRule: { id: "offer", passRate: .7 }, pairRule: { id: "pair", passRate: .6 } }), { source: "pair", ruleId: "pair", passRate: .6 });
});

test("feedback controller corrects drift while retaining randomized choices", () => {
  assert.equal(controllerPassProbability({ targetPassRate: .7, eligibleCount: 10, passedCount: 9 }), 0);
  assert.equal(controllerPassProbability({ targetPassRate: .7, eligibleCount: 10, passedCount: 4 }), 1);
  assert.deepEqual(decideEligibleConversion({ targetPassRate: .7, eligibleCount: 0, passedCount: 0, randomUnit: .69 }).decision, "PASS");
  assert.deepEqual(decideEligibleConversion({ targetPassRate: .7, eligibleCount: 0, passedCount: 0, randomUnit: .71 }).decision, "SCRUB");
});

test("controller converges closely across independent randomized simulations", () => {
  for (const target of [.05, .25, .6, .95]) {
    let count = 0;
    let passed = 0;
    let state = Math.trunc(target * 1000) + 17;
    for (let index = 0; index < 10_000; index += 1) {
      state = (state * 1664525 + 1013904223) >>> 0;
      const result = decideEligibleConversion({ targetPassRate: target, eligibleCount: count, passedCount: passed, randomUnit: state / 2 ** 32 });
      count += 1;
      if (result.decision === "PASS") passed += 1;
    }
    assert.ok(Math.abs(passed / count - target) < .002, `${target} produced ${passed / count}`);
  }
});

test("idempotency distinguishes multiple events for the same order", () => {
  const first = normalizeConversionPayload({ ...valid, adv_event_id: "purchase" }, "commas");
  const second = normalizeConversionPayload({ ...valid, adv_event_id: "upsell" }, "commas");
  assert.equal(first.ok && second.ok, true);
  if (first.ok && second.ok) assert.notEqual(conversionIdempotencyKey(first.conversion), conversionIdempotencyKey(second.conversion));
});

test("forwarding preserves supplied attribution fields and never adds oid or affid", () => {
  const result = normalizeConversionPayload({ ...valid, user_ip: "1.2.3.4", adv1: "x" }, "commas");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const parameters = buildEverflowForwardingParameters(result.conversion);
  assert.equal(parameters.get("transaction_id"), "ef-tid-1");
  assert.equal(parameters.get("user_ip"), "1.2.3.4");
  assert.equal(parameters.get("adv1"), "x");
  assert.equal(parameters.has("oid"), false);
  assert.equal(parameters.has("affid"), false);
});
