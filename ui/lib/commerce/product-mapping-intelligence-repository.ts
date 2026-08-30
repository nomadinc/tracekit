import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";
import {
  recommendProductMapping,
  type MappingPolicy,
  type MappingRecommendation,
  type MappingRule,
  type MappingRulePrice,
} from "@/lib/commerce/product-mapping-intelligence";

type ProductInput = {
  providerProductId: string;
  title: string;
  observedPrices?: number[];
  currency?: string;
};

type Scope = {
  organizationId: string;
  connectionId: string;
  providerAccountId: string;
  provider: string;
};

type RuleRow = {
  id: string;
  organization_id: string;
  connection_id: string | null;
  provider_account_id: string | null;
  provider: string;
  rule_kind: MappingRule["ruleKind"];
  match_value: string;
  normalized_match_value: string;
  business_context_id: string;
  canonical_offer_id: string;
  offer_step_id: string;
  offer_variant_id: string | null;
  confidence: number;
  execution_mode: MappingRule["executionMode"];
  status: MappingRule["status"];
  priority: number;
};

type PriceRow = {
  rule_id: string;
  amount: number | string;
  currency: string;
  evidence_weight: number;
  price_role: MappingRulePrice["priceRole"];
};

type PolicyRow = {
  auto_map_enabled: boolean;
  auto_map_min_confidence: number;
  bulk_review_min_confidence: number;
  require_exact_id_for_auto_map: boolean;
};

const DEFAULT_POLICY: MappingPolicy = {
  autoMapEnabled: false,
  autoMapMinConfidence: 100,
  bulkReviewMinConfidence: 90,
  requireExactIdForAutoMap: true,
};

function encode(value: string) {
  return encodeURIComponent(value);
}

function toRule(row: RuleRow): MappingRule {
  return {
    id: row.id,
    organizationId: row.organization_id,
    connectionId: row.connection_id,
    providerAccountId: row.provider_account_id,
    provider: row.provider,
    ruleKind: row.rule_kind,
    matchValue: row.match_value,
    normalizedMatchValue: row.normalized_match_value,
    businessContextId: row.business_context_id,
    canonicalOfferId: row.canonical_offer_id,
    offerStepId: row.offer_step_id,
    offerVariantId: row.offer_variant_id,
    confidence: Number(row.confidence),
    executionMode: row.execution_mode,
    status: row.status,
    priority: Number(row.priority),
  };
}

function toPrice(row: PriceRow): MappingRulePrice {
  return {
    ruleId: row.rule_id,
    amount: Number(row.amount),
    currency: row.currency,
    evidenceWeight: Number(row.evidence_weight),
    priceRole: row.price_role,
  };
}

function toPolicy(row?: PolicyRow): MappingPolicy {
  if (!row) return DEFAULT_POLICY;
  return {
    autoMapEnabled: row.auto_map_enabled === true,
    autoMapMinConfidence: Number(row.auto_map_min_confidence),
    bulkReviewMinConfidence: Number(row.bulk_review_min_confidence),
    requireExactIdForAutoMap: row.require_exact_id_for_auto_map !== false,
  };
}

export async function loadProductMappingRecommendations(
  scope: Scope,
  products: ProductInput[],
): Promise<Map<string, MappingRecommendation>> {
  if (!products.length) return new Map();

  const ruleSelect = [
    "id",
    "organization_id",
    "connection_id",
    "provider_account_id",
    "provider",
    "rule_kind",
    "match_value",
    "normalized_match_value",
    "business_context_id",
    "canonical_offer_id",
    "offer_step_id",
    "offer_variant_id",
    "confidence",
    "execution_mode",
    "status",
    "priority",
  ].join(",");

  // Rules can be organization-, connection-, or provider-account-scoped. Pull
  // the active tenant/provider set once, then let the pure engine enforce the
  // narrower scope for each candidate.
  const [ruleRows, policyRows] = await Promise.all([
    commercePersistenceRequest(
      `commerce_product_mapping_rules?organization_id=eq.${encode(scope.organizationId)}&provider=eq.${encode(scope.provider)}&status=eq.active&select=${ruleSelect}&order=priority.asc,confidence.desc`,
    ) as Promise<RuleRow[]>,
    commercePersistenceRequest(
      `commerce_product_mapping_policies?organization_id=eq.${encode(scope.organizationId)}&provider=eq.${encode(scope.provider)}&select=auto_map_enabled,auto_map_min_confidence,bulk_review_min_confidence,require_exact_id_for_auto_map&limit=1`,
    ) as Promise<PolicyRow[]>,
  ]);

  const rules = ruleRows.map(toRule);
  if (!rules.length) return new Map();

  const ruleIds = rules.map((rule) => rule.id);
  const prices = (await commercePersistenceRequest(
    `commerce_product_mapping_rule_prices?rule_id=in.(${ruleIds.map(encode).join(",")})&select=rule_id,amount,currency,evidence_weight,price_role`,
  )) as PriceRow[];
  const typedPrices = prices.map(toPrice);
  const policy = toPolicy(policyRows[0]);
  const recommendations = new Map<string, MappingRecommendation>();

  for (const product of products) {
    const recommendation = recommendProductMapping({
      candidate: {
        organizationId: scope.organizationId,
        connectionId: scope.connectionId,
        providerAccountId: scope.providerAccountId,
        provider: scope.provider,
        providerProductId: product.providerProductId,
        title: product.title,
        observedPrices: product.observedPrices,
        currency: product.currency || "USD",
      },
      rules,
      prices: typedPrices,
      policy,
    });
    if (recommendation) recommendations.set(product.providerProductId, recommendation);
  }

  return recommendations;
}
