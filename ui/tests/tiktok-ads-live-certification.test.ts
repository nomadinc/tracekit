import { evaluateTikTokLiveCertification, tikTokEnvironmentReadiness } from "../lib/integrations/tiktok-ads-live-certification";

const empty = evaluateTikTokLiveCertification({
  appIdConfigured:false, appSecretConfigured:false, redirectUriConfigured:false,
  advertiserInfoEndpointConfigured:false, credentialEncryptionConfigured:false,
  authorizedConnectionCount:0, discoveredAdvertiserCount:0, selectedAdvertiserCount:0,
  successfulLiveDiscovery:false, successfulLiveReport:false,
  adsManagerSpendCompared:false, adsManagerSpendMatched:false,
});
if (empty.certification !== "not_certified" || empty.schedulerEligible !== false || empty.missing.length !== 12) {
  throw new Error("TikTok certification must fail closed.");
}

const certified = evaluateTikTokLiveCertification({
  appIdConfigured:true, appSecretConfigured:true, redirectUriConfigured:true,
  advertiserInfoEndpointConfigured:true, credentialEncryptionConfigured:true,
  authorizedConnectionCount:1, discoveredAdvertiserCount:1, selectedAdvertiserCount:1,
  successfulLiveDiscovery:true, successfulLiveReport:true,
  adsManagerSpendCompared:true, adsManagerSpendMatched:true,
});
if (certified.certification !== "certified" || !certified.schedulerEligible || certified.missing.length) {
  throw new Error("TikTok certification gate did not converge.");
}

const env = tikTokEnvironmentReadiness({
  TIKTOK_BUSINESS_APP_ID:"app", TIKTOK_BUSINESS_APP_SECRET:"secret",
  TIKTOK_OAUTH_REDIRECT_URI:"https://tracekit.example/callback",
  TIKTOK_ADVERTISER_INFO_ENDPOINT:"https://business-api.tiktok.com/info",
  MARKETING_CREDENTIALS_ENC_KEY:"key", MARKETING_CREDENTIALS_KEY_ID:"key-id",
} as NodeJS.ProcessEnv);
if (!Object.values(env).every(Boolean)) throw new Error("TikTok environment readiness failed.");

console.log("tiktok-ads-live-certification tests passed");
