import { normalizeTikTokAdvertiserId, TIKTOK_MARKETING_API_VERSION } from "./tiktok-ads-contract";

export const TIKTOK_REPORT_PATH = `/open_api/${TIKTOK_MARKETING_API_VERSION}/report/integrated/get/`;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NON_NEGATIVE_DECIMAL = /^\d+(?:\.\d+)?$/;
const NON_NEGATIVE_INTEGER = /^\d+$/;

function requireDate(value: unknown) {
  const text = String(value ?? "");
  if (!DATE.test(text)) throw new Error("Invalid TikTok report date.");
  const parsed = new Date(text + "T00:00:00Z");
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new Error("Invalid TikTok report date.");
  }
  return text;
}

function requireId(value: unknown, label: string) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) throw new Error(`Invalid TikTok ${label}.`);
  return text;
}

function count(value: unknown, label: string) {
  const text = String(value ?? "0");
  if (!NON_NEGATIVE_INTEGER.test(text)) throw new Error(`Invalid TikTok ${label}.`);
  const number = Number(text);
  if (!Number.isSafeInteger(number)) throw new Error(`TikTok ${label} exceeds safe integer range.`);
  return number;
}

function spend(value: unknown) {
  const text = String(value ?? "");
  if (!NON_NEGATIVE_DECIMAL.test(text)) throw new Error("Invalid TikTok spend.");
  return text;
}

/**
 * Normalizes the minimal daily ad-level fact TraceKit needs for paid-media cost.
 * Raw provider payload must still be persisted separately as evidence.
 */
export function normalizeTikTokAdDailyRow(input: {
  advertiserId: unknown;
  currency: unknown;
  timezoneName: unknown;
  dimensions: Record<string, unknown>;
  metrics: Record<string, unknown>;
}) {
  const advertiserId = normalizeTikTokAdvertiserId(input.advertiserId);
  const currency = String(input.currency ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Invalid TikTok account currency.");
  const timezoneName = String(input.timezoneName ?? "").trim();
  if (!timezoneName) throw new Error("Invalid TikTok account timezone.");

  return {
    advertiserId,
    currency,
    timezoneName,
    reportDate: requireDate(input.dimensions.stat_time_day),
    campaignId: requireId(input.dimensions.campaign_id, "campaign ID"),
    adGroupId: requireId(input.dimensions.adgroup_id, "ad group ID"),
    adId: requireId(input.dimensions.ad_id, "ad ID"),
    spend: spend(input.metrics.spend),
    impressions: count(input.metrics.impressions, "impressions"),
    clicks: count(input.metrics.clicks, "clicks"),
  };
}
