import assert from "node:assert/strict";
import test from "node:test";
import {
  GOOGLE_AD_DAILY_QUERY,
  buildGoogleAdDailyQuery,
  normalizeGoogleAdDailyRow,
} from "../lib/integrations/google-ads-reporting";

test("daily ad reporting contract selects canonical hierarchy, account semantics, and raw cost micros", () => {
  for (const field of [
    "customer.id",
    "customer.currency_code",
    "customer.time_zone",
    "campaign.id",
    "campaign.name",
    "campaign.status",
    "ad_group.id",
    "ad_group.name",
    "ad_group.status",
    "ad_group_ad.ad.id",
    "ad_group_ad.ad.name",
    "ad_group_ad.status",
    "segments.date",
    "metrics.impressions",
    "metrics.clicks",
    "metrics.cost_micros",
  ]) assert.match(GOOGLE_AD_DAILY_QUERY, new RegExp(field.replaceAll(".", "\\.")));
});

test("daily reporting query requires explicit inclusive date bounds", () => {
  const query = buildGoogleAdDailyQuery("2026-09-01", "2026-09-03");
  assert.match(query, /segments\.date BETWEEN '2026-09-01' AND '2026-09-03'/);
  assert.throws(() => buildGoogleAdDailyQuery("bad", "2026-09-03"));
  assert.throws(() => buildGoogleAdDailyQuery("2026-09-04", "2026-09-03"));
});

test("cost micros normalize exactly to currency units while raw micros are retained", () => {
  const row = normalizeGoogleAdDailyRow({
    customer: { id: "1234567890", currencyCode: "USD", timeZone: "America/Los_Angeles" },
    campaign: { id: "10", name: "Campaign", status: "ENABLED" },
    adGroup: { id: "20", name: "Ad Group", status: "PAUSED" },
    adGroupAd: { status: "ENABLED", ad: { id: "30", name: "Ad" } },
    segments: { date: "2026-09-03" },
    metrics: { impressions: "101", clicks: "7", costMicros: "1234567" },
  });
  assert.equal(row.costMicros, "1234567");
  assert.equal(row.spend, "1.234567");
  assert.equal(row.currency, "USD");
  assert.equal(row.customerTimeZone, "America/Los_Angeles");
  assert.equal(row.impressions, 101);
  assert.equal(row.clicks, 7);
});

test("large micros values normalize without floating point loss", () => {
  const row = normalizeGoogleAdDailyRow({
    customer: { id: "1234567890", currencyCode: "USD", timeZone: "UTC" },
    campaign: { id: "10", status: "ENABLED" },
    adGroup: { id: "20", status: "ENABLED" },
    adGroupAd: { status: "ENABLED", ad: { id: "30" } },
    segments: { date: "2026-09-03" },
    metrics: { impressions: "0", clicks: "0", costMicros: "9007199254740993123456" },
  });
  assert.equal(row.spend, "9007199254740993.123456");
});

test("malformed identity, date, currency, or negative metrics fail closed", () => {
  const base:any = {
    customer: { id: "1234567890", currencyCode: "USD", timeZone: "UTC" },
    campaign: { id: "10", status: "ENABLED" },
    adGroup: { id: "20", status: "ENABLED" },
    adGroupAd: { status: "ENABLED", ad: { id: "30" } },
    segments: { date: "2026-09-03" },
    metrics: { impressions: "1", clicks: "1", costMicros: "1" },
  };
  assert.throws(() => normalizeGoogleAdDailyRow({ ...base, customer: { ...base.customer, currencyCode: "usd" } }));
  assert.throws(() => normalizeGoogleAdDailyRow({ ...base, segments: { date: "09/03/2026" } }));
  assert.throws(() => normalizeGoogleAdDailyRow({ ...base, metrics: { ...base.metrics, costMicros: "-1" } }));
});
