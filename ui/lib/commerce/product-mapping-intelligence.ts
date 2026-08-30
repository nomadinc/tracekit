export type MappingRuleKind = "provider_product_id" | "normalized_title" | "title_prefix";
export type MappingExecutionMode = "suggest" | "auto_map";
export type RecommendationDisposition = "auto_map" | "bulk_review" | "manual_review";

export type MappingRule = {
  id: string;
  organizationId: string;
  connectionId?: string | null;
  providerAccountId?: string | null;
  provider: string;
  ruleKind: MappingRuleKind;
  matchValue: string;
  normalizedMatchValue: string;
  businessContextId: string;
  canonicalOfferId: string;
  offerStepId: string;
  offerVariantId?: string | null;
  confidence: number;
  executionMode: MappingExecutionMode;
  status: "active" | "inactive";
  priority: number;
};

export type MappingRulePrice = {
  ruleId: string;
  amount: number;
  currency: string;
  evidenceWeight: number;
  priceRole: "supporting" | "expected" | "historical";
};

export type MappingPolicy = {
  autoMapEnabled: boolean;
  autoMapMinConfidence: number;
  bulkReviewMinConfidence: number;
  requireExactIdForAutoMap: boolean;
};

export type MappingCandidate = {
  organizationId: string;
  connectionId: string;
  providerAccountId: string;
  provider: string;
  providerProductId: string;
  title: string;
  observedPrices?: number[];
  currency?: string;
};

export type MappingRecommendation = {
  ruleId: string;
  confidence: number;
  disposition: RecommendationDisposition;
  businessContextId: string;
  canonicalOfferId: string;
  offerStepId: string;
  offerVariantId: string | null;
  evidence: {
    identityMatch: MappingRuleKind;
    scope: "provider_account" | "connection" | "organization";
    priceMatches: number[];
    priceEvidenceWeight: number;
  };
};

export function normalizeProductTitle(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function scopeRank(rule: MappingRule, candidate: MappingCandidate): number | null {
  if (rule.organizationId !== candidate.organizationId || rule.provider !== candidate.provider || rule.status !== "active") return null;
  if (rule.providerAccountId) {
    return rule.providerAccountId === candidate.providerAccountId && rule.connectionId === candidate.connectionId ? 3 : null;
  }
  if (rule.connectionId) return rule.connectionId === candidate.connectionId ? 2 : null;
  return 1;
}

function identityMatches(rule: MappingRule, candidate: MappingCandidate): boolean {
  if (rule.ruleKind === "provider_product_id") return rule.normalizedMatchValue === candidate.providerProductId.trim();
  const title = normalizeProductTitle(candidate.title);
  if (rule.ruleKind === "normalized_title") return title === rule.normalizedMatchValue;
  return title.startsWith(rule.normalizedMatchValue);
}

function priceEvidence(rule: MappingRule, prices: MappingRulePrice[], candidate: MappingCandidate) {
  const currency = candidate.currency || "USD";
  const observed = new Set((candidate.observedPrices || []).map((value) => Number(value.toFixed(2))));
  const matches = prices
    .filter((row) => row.ruleId === rule.id && row.currency === currency && observed.has(Number(row.amount.toFixed(2))))
    .sort((a, b) => b.evidenceWeight - a.evidenceWeight);
  return {
    matches: Array.from(new Set(matches.map((row) => row.amount))),
    weight: matches.reduce((sum, row) => sum + row.evidenceWeight, 0),
  };
}

export function recommendProductMapping(input: {
  candidate: MappingCandidate;
  rules: MappingRule[];
  prices?: MappingRulePrice[];
  policy: MappingPolicy;
}): MappingRecommendation | null {
  const { candidate, rules, policy } = input;
  const prices = input.prices || [];
  const matched = rules
    .map((rule) => ({ rule, scope: scopeRank(rule, candidate) }))
    .filter((row): row is { rule: MappingRule; scope: number } => row.scope !== null && identityMatches(row.rule, candidate))
    .map(({ rule, scope }) => ({ rule, scope, price: priceEvidence(rule, prices, candidate) }))
    .sort((a, b) => b.scope - a.scope || b.rule.priority - a.rule.priority || b.rule.confidence - a.rule.confidence || b.price.weight - a.price.weight);

  const best = matched[0];
  if (!best) return null;

  // Price is corroboration only. It never promotes a weak identity into a match.
  const confidence = Math.max(0, Math.min(100, best.rule.confidence));
  const exactIdentity = best.rule.ruleKind === "provider_product_id";
  const autoAllowed =
    policy.autoMapEnabled &&
    best.rule.executionMode === "auto_map" &&
    confidence >= policy.autoMapMinConfidence &&
    (!policy.requireExactIdForAutoMap || exactIdentity);
  const disposition: RecommendationDisposition = autoAllowed
    ? "auto_map"
    : confidence >= policy.bulkReviewMinConfidence
      ? "bulk_review"
      : "manual_review";

  return {
    ruleId: best.rule.id,
    confidence,
    disposition,
    businessContextId: best.rule.businessContextId,
    canonicalOfferId: best.rule.canonicalOfferId,
    offerStepId: best.rule.offerStepId,
    offerVariantId: best.rule.offerVariantId || null,
    evidence: {
      identityMatch: best.rule.ruleKind,
      scope: best.scope === 3 ? "provider_account" : best.scope === 2 ? "connection" : "organization",
      priceMatches: best.price.matches,
      priceEvidenceWeight: best.price.weight,
    },
  };
}
