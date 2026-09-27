import "server-only";

export type TikTokLiveCertificationInput = {
  appIdConfigured: boolean;
  appSecretConfigured: boolean;
  redirectUriConfigured: boolean;
  advertiserInfoEndpointConfigured: boolean;
  credentialEncryptionConfigured: boolean;
  authorizedConnectionCount: number;
  discoveredAdvertiserCount: number;
  selectedAdvertiserCount: number;
  successfulLiveDiscovery: boolean;
  successfulLiveReport: boolean;
  adsManagerSpendCompared: boolean;
  adsManagerSpendMatched: boolean;
};

export function evaluateTikTokLiveCertification(input: TikTokLiveCertificationInput) {
  const checks = [
    ["app_id", input.appIdConfigured],
    ["app_secret", input.appSecretConfigured],
    ["redirect_uri", input.redirectUriConfigured],
    ["advertiser_info_endpoint", input.advertiserInfoEndpointConfigured],
    ["credential_encryption", input.credentialEncryptionConfigured],
    ["authorized_connection", input.authorizedConnectionCount > 0],
    ["discovered_advertiser", input.discoveredAdvertiserCount > 0],
    ["selected_advertiser", input.selectedAdvertiserCount > 0],
    ["live_discovery", input.successfulLiveDiscovery],
    ["live_report", input.successfulLiveReport],
    ["ads_manager_spend_comparison", input.adsManagerSpendCompared],
    ["ads_manager_spend_match", input.adsManagerSpendMatched],
  ] as const;
  const passed = checks.filter(([, ok]) => ok).map(([id]) => id);
  const missing = checks.filter(([, ok]) => !ok).map(([id]) => id);
  return {
    certification: missing.length ? "not_certified" as const : "certified" as const,
    schedulerEligible: missing.length === 0,
    passed,
    missing,
  };
}

export function tikTokEnvironmentReadiness(env: NodeJS.ProcessEnv = process.env) {
  return {
    appIdConfigured: Boolean(String(env.TIKTOK_BUSINESS_APP_ID || "").trim()),
    appSecretConfigured: Boolean(String(env.TIKTOK_BUSINESS_APP_SECRET || "").trim()),
    redirectUriConfigured: Boolean(String(env.TIKTOK_OAUTH_REDIRECT_URI || "").trim()),
    advertiserInfoEndpointConfigured: Boolean(String(env.TIKTOK_ADVERTISER_INFO_ENDPOINT || "").trim()),
    credentialEncryptionConfigured:
      Boolean(String(env.MARKETING_CREDENTIALS_ENC_KEY || "").trim()) &&
      Boolean(String(env.MARKETING_CREDENTIALS_KEY_ID || "").trim()),
  };
}
