export const TIKTOK_MARKETING_API_VERSION = "v1.3";

/**
 * M1 provider contract.
 *
 * This file deliberately records only boundaries verified against TikTok's
 * current API for Business documentation. Endpoint-specific reporting fields,
 * page limits, rate quotas, and historical horizons stay uncommitted until
 * their authoritative contracts are certified. Do not infer them from Meta or
 * Google.
 */
export const TIKTOK_ADS_PROVIDER_CONTRACT = {
  provider: "tiktok_ads",
  apiVersion: TIKTOK_MARKETING_API_VERSION,
  advertiserIdType: "string",
  authorization: {
    authorizationCodeSingleUse: true,
    authorizationCodeLifetimeSeconds: 3600,
    tokenExchangeIsServerSide: true,
    accessTokenHeader: "Access-Token",
  },
  canonicalHierarchy: {
    account: "advertiser",
    campaign: "campaign",
    adGroup: "ad_group",
    ad: "ad",
  },
  reporting: {
    canonicalGrain: "ad_daily",
    recentDataIsRestatable: true,
    preserveRawEvidence: true,
    actualSpendCostType: "ad_spend",
    budgetIsNotActualSpend: true,
  },
  unresolvedUntilCertified: [
    "report_endpoint",
    "report_dimensions",
    "report_metrics",
    "pagination_contract",
    "endpoint_rate_limits",
    "maximum_report_window",
    "historical_reporting_horizon",
  ],
} as const;

export function normalizeTikTokAdvertiserId(value: unknown) {
  const id = String(value ?? "").trim();
  if (!/^\d+$/.test(id)) throw new Error("Invalid TikTok advertiser ID.");
  return id;
}
