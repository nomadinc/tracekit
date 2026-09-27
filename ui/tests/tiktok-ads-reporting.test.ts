import { normalizeTikTokAdDailyRow, TIKTOK_REPORT_PATH } from "../lib/integrations/tiktok-ads-reporting";

if (TIKTOK_REPORT_PATH !== "/open_api/v1.3/report/integrated/get/") throw new Error("TikTok report path changed unexpectedly.");

const row = normalizeTikTokAdDailyRow({
  advertiserId: "700000000000000001",
  currency: "usd",
  timezoneName: "America/Los_Angeles",
  dimensions: {
    stat_time_day: "2026-09-26",
    campaign_id: "710000000000000001",
    adgroup_id: "720000000000000001",
    ad_id: "730000000000000001",
  },
  metrics: { spend: "123.450000", impressions: "10000", clicks: "321" },
});

if (row.currency !== "USD" || row.spend !== "123.450000" || row.clicks !== 321) {
  throw new Error("TikTok daily normalization failed.");
}

for (const bad of [
  { ...row, kind: "date" },
]) {
  void bad;
}

let failed = false;
try {
  normalizeTikTokAdDailyRow({
    advertiserId: "700000000000000001",
    currency: "USD",
    timezoneName: "America/Los_Angeles",
    dimensions: { stat_time_day: "bad", campaign_id: "1", adgroup_id: "2", ad_id: "3" },
    metrics: { spend: "1.00", impressions: "1", clicks: "1" },
  });
} catch { failed = true; }
if (!failed) throw new Error("Invalid TikTok report date must fail closed.");

failed = false;
try {
  normalizeTikTokAdDailyRow({
    advertiserId: "700000000000000001",
    currency: "USD",
    timezoneName: "America/Los_Angeles",
    dimensions: { stat_time_day: "2026-09-26", campaign_id: "1", adgroup_id: "2", ad_id: "3" },
    metrics: { spend: "-1", impressions: "1", clicks: "1" },
  });
} catch { failed = true; }
if (!failed) throw new Error("Negative TikTok spend must fail closed.");

console.log("tiktok-ads-reporting tests passed");
