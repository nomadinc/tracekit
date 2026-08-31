import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProductTitle, recommendProductMapping, type MappingPolicy, type MappingRule } from "../lib/commerce/product-mapping-intelligence";

const candidate = {
  organizationId: "org-1",
  connectionId: "conn-1",
  providerAccountId: "acct-1",
  provider: "commas",
  providerProductId: "ABC123",
  title: "Gold - NU2",
  observedPrices: [297],
  currency: "USD",
};
const policy: MappingPolicy = {
  autoMapEnabled: false,
  autoMapMinConfidence: 100,
  bulkReviewMinConfidence: 90,
  requireExactIdForAutoMap: true,
};
function rule(overrides: Partial<MappingRule> = {}): MappingRule {
  return {
    id: "rule-1",
    organizationId: "org-1",
    connectionId: null,
    providerAccountId: null,
    provider: "commas",
    ruleKind: "normalized_title",
    matchValue: "Gold - NU2",
    normalizedMatchValue: "gold nu2",
    businessContextId: "context-1",
    canonicalOfferId: "offer-1",
    offerStepId: "step-1",
    offerVariantId: null,
    confidence: 95,
    executionMode: "suggest",
    status: "active",
    priority: 100,
    ...overrides,
  };
}

test("normalizes punctuation and whitespace deterministically", () => {
  assert.equal(normalizeProductTitle("  Gold — NU2!! "), "gold nu2");
});

test("routes high-confidence title identity to bulk review by default", () => {
  const result = recommendProductMapping({ candidate, rules: [rule()], policy });
  assert.equal(result?.disposition, "bulk_review");
  assert.equal(result?.offerStepId, "step-1");
});

test("price evidence corroborates but cannot create identity", () => {
  const result = recommendProductMapping({
    candidate: { ...candidate, title: "Diamond" },
    rules: [rule()],
    prices: [{ ruleId: "rule-1", amount: 297, currency: "USD", evidenceWeight: 50, priceRole: "expected" }],
    policy,
  });
  assert.equal(result, null);
});

test("provider-account scope wins over broader organization rule", () => {
  const broad = rule({ id: "broad", offerStepId: "step-broad", priority: 999 });
  const narrow = rule({ id: "narrow", connectionId: "conn-1", providerAccountId: "acct-1", offerStepId: "step-narrow", priority: 1 });
  const result = recommendProductMapping({ candidate, rules: [broad, narrow], policy });
  assert.equal(result?.ruleId, "narrow");
  assert.equal(result?.evidence.scope, "provider_account");
});

test("auto-map requires policy, rule mode, threshold, and exact-id when configured", () => {
  const exact = rule({
    ruleKind: "provider_product_id",
    normalizedMatchValue: "ABC123",
    confidence: 100,
    executionMode: "auto_map",
  });
  const result = recommendProductMapping({
    candidate,
    rules: [exact],
    policy: { ...policy, autoMapEnabled: true },
  });
  assert.equal(result?.disposition, "auto_map");
});

test("non-exact identity cannot auto-map when exact-id policy is required", () => {
  const result = recommendProductMapping({
    candidate,
    rules: [rule({ confidence: 100, executionMode: "auto_map" })],
    policy: { ...policy, autoMapEnabled: true },
  });
  assert.equal(result?.disposition, "bulk_review");
});

test("corrected Growth Partner exact identities recommend only independently authorized products", () => {
  const growthStep = "growth-partner";
  const downsellStep = "growth-partner-downsell";
  const confirmedRules = [
    ["GwlZL", growthStep],
    ["1EJBm", growthStep],
    ["Kz0GM", growthStep],
    ["q6zw2", downsellStep],
    ["pLWqN", downsellStep],
  ].map(([providerProductId, offerStepId], index) => rule({ id: `growth-${index}`, ruleKind: "provider_product_id", matchValue: providerProductId, normalizedMatchValue: providerProductId, offerStepId, confidence: 100, priority: 10 }));
  const inactiveAmbiguousRules = ["ZvpxR", "JEoZJ"].map((providerProductId, index) => rule({ id: `ambiguous-${index}`, ruleKind: "provider_product_id", matchValue: providerProductId, normalizedMatchValue: providerProductId, offerStepId: growthStep, confidence: 100, status: "inactive", priority: 10 }));
  const rules = [...confirmedRules, ...inactiveAmbiguousRules];
  const recommend = (providerProductId: string, title: string, observedPrices: number[]) => recommendProductMapping({ candidate: { ...candidate, providerProductId, title, observedPrices }, rules, policy });

  assert.equal(recommend("GwlZL", "GROWTH PARTNER", [249])?.offerStepId, growthStep);
  assert.equal(recommend("1EJBm", "Growth Partner - NU2", [106, 249])?.offerStepId, growthStep);
  assert.equal(recommend("Kz0GM", "Growth Partner 1", [249])?.offerStepId, growthStep);
  assert.equal(recommend("q6zw2", "Growth Partner Discounted - NU2", [75])?.offerStepId, downsellStep);
  assert.equal(recommend("pLWqN", "Growth Partner Discounted", [75])?.offerStepId, downsellStep);
  assert.equal(recommend("ZvpxR", "GROWTH PARTNER Discounted", [199]), null);
  assert.equal(recommend("JEoZJ", "GROWTH PARTNER Discounted", [177]), null);
});

test("final catalog exact identities remain suggest-only and price cannot substitute for identity", () => {
  const silver = "silver";
  const bronze = "bronze";
  const bronzeDiscounted = "bronze-discounted";
  const growthDownsell1 = "growth-downsell-1";
  const growthDownsell2 = "growth-downsell-2";
  const frontEnd = "front-end";
  const mysteryDownsell1 = "mystery-downsell-1";
  const millionaireOrderBump = "millionaire-order-bump";
  const identities = [
    ["N7v9D", silver],
    ["OJwyY", bronze],
    ["QAy00", bronzeDiscounted],
    ["lXDqJ", bronzeDiscounted],
    ["ZvpxR", growthDownsell1],
    ["JEoZJ", growthDownsell1],
    ["q6zw2", growthDownsell2],
    ["pLWqN", growthDownsell2],
    ["N7Jr6", frontEnd],
    ["9GOV4", mysteryDownsell1],
    ["vREZg", millionaireOrderBump],
  ] as const;
  const rules = identities.map(([providerProductId, offerStepId], index) => rule({
    id: `final-${index}`,
    ruleKind: "provider_product_id",
    matchValue: providerProductId,
    normalizedMatchValue: providerProductId,
    offerStepId,
    confidence: 100,
    executionMode: "suggest",
  }));
  const recommend = (providerProductId: string, observedPrices: number[]) => recommendProductMapping({
    candidate: { ...candidate, providerProductId, title: "unrelated title", observedPrices },
    rules,
    policy,
  });

  assert.equal(recommend("N7v9D", [195])?.offerStepId, silver);
  assert.equal(recommend("OJwyY", [95])?.offerStepId, bronze);
  assert.equal(recommend("QAy00", [79])?.offerStepId, bronzeDiscounted);
  assert.equal(recommend("lXDqJ", [70])?.offerStepId, bronzeDiscounted);
  assert.equal(recommend("ZvpxR", [199])?.offerStepId, growthDownsell1);
  assert.equal(recommend("JEoZJ", [177])?.offerStepId, growthDownsell1);
  assert.equal(recommend("q6zw2", [75])?.offerStepId, growthDownsell2);
  assert.equal(recommend("pLWqN", [75])?.offerStepId, growthDownsell2);
  assert.equal(recommend("N7Jr6", [1, 2, 47, 282])?.offerStepId, frontEnd);
  assert.equal(recommend("9GOV4", [148])?.offerStepId, mysteryDownsell1);
  assert.equal(recommend("vREZg", [94])?.offerStepId, millionaireOrderBump);
  assert.equal(recommend("unknown", [70, 75, 95, 148, 195, 199]), null);
  assert.equal(rules.every((item) => item.executionMode === "suggest"), true);
});

test("operator-authorized 5M6yv exact identity recommends existing Platinum without price identity", () => {
  const platinumStep = "a4992adc-57e8-4bb1-9360-f421d2d9322c";
  const platinumRule = rule({
    id: "5m6yv-platinum",
    connectionId: "conn-1",
    providerAccountId: "acct-1",
    ruleKind: "provider_product_id",
    matchValue: "5M6yv",
    normalizedMatchValue: "5M6yv",
    offerStepId: platinumStep,
    confidence: 100,
    executionMode: "suggest",
    priority: 10,
  });
  const recommendation = recommendProductMapping({
    candidate: { ...candidate, providerProductId: "5M6yv", title: "unrelated", observedPrices: [299] },
    rules: [platinumRule],
    prices: [{ ruleId: platinumRule.id, amount: 299, currency: "USD", evidenceWeight: 10, priceRole: "supporting" }],
    policy,
  });

  assert.equal(recommendation?.offerStepId, platinumStep);
  assert.equal(recommendation?.disposition, "bulk_review");
  assert.equal(recommendation?.evidence.identityMatch, "provider_product_id");
  assert.equal(platinumRule.executionMode, "suggest");
  assert.equal(policy.autoMapEnabled, false);
  assert.equal(recommendProductMapping({
    candidate: { ...candidate, providerProductId: "unknown-platinum", title: "Platinum", observedPrices: [299] },
    rules: [platinumRule],
    prices: [{ ruleId: platinumRule.id, amount: 299, currency: "USD", evidenceWeight: 100, priceRole: "expected" }],
    policy,
  }), null);
});
