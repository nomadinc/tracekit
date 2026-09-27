import { normalizeTikTokAdvertiserId, TIKTOK_ADS_PROVIDER_CONTRACT } from "../lib/integrations/tiktok-ads-contract";

if (normalizeTikTokAdvertiserId(" 700000000000000001 ") !== "700000000000000001") {
  throw new Error("TikTok advertiser ID normalization failed.");
}

for (const value of ["", "abc", "123.4", "-1"]) {
  let failed = false;
  try { normalizeTikTokAdvertiserId(value); } catch { failed = true; }
  if (!failed) throw new Error("Invalid TikTok advertiser ID must fail closed.");
}

if (!TIKTOK_ADS_PROVIDER_CONTRACT.reporting.recentDataIsRestatable) {
  throw new Error("TikTok restatement boundary must remain explicit.");
}
if (!TIKTOK_ADS_PROVIDER_CONTRACT.unresolvedUntilCertified.includes("report_endpoint")) {
  throw new Error("Unverified TikTok reporting contract must not be implied.");
}

console.log("tiktok-ads-contract tests passed");
