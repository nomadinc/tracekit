import { normalizeGoogleCustomerId } from "./google-ads-account-discovery";

export const GOOGLE_AD_DAILY_QUERY = [
  "SELECT",
  "customer.id,",
  "customer.currency_code,",
  "customer.time_zone,",
  "campaign.id,",
  "campaign.name,",
  "campaign.status,",
  "ad_group.id,",
  "ad_group.name,",
  "ad_group.status,",
  "ad_group_ad.ad.id,",
  "ad_group_ad.ad.name,",
  "ad_group_ad.status,",
  "segments.date,",
  "metrics.impressions,",
  "metrics.clicks,",
  "metrics.cost_micros",
  "FROM ad_group_ad",
].join(" ");

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const INTEGER = /^\d+$/;

function requireDate(value: unknown) {
  const text = String(value || "");
  if (!DATE.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) throw new Error("Invalid Google Ads report date.");
  return text;
}
function requireId(value: unknown, label: string) {
  const text = String(value || "");
  if (!INTEGER.test(text)) throw new Error(`Invalid Google Ads ${label}.`);
  return text;
}
function requireCount(value: unknown, label: string) {
  const text = String(value ?? "0");
  if (!INTEGER.test(text)) throw new Error(`Invalid Google Ads ${label}.`);
  const n = Number(text);
  if (!Number.isSafeInteger(n)) throw new Error(`Google Ads ${label} exceeds safe integer range.`);
  return n;
}
function microsToDecimal(value: unknown) {
  const raw = String(value ?? "0");
  if (!INTEGER.test(raw)) throw new Error("Invalid Google Ads cost micros.");
  const padded = raw.padStart(7, "0");
  const whole = padded.slice(0, -6).replace(/^0+(?=\d)/, "");
  const fraction = padded.slice(-6);
  return { raw, decimal: `${whole}.${fraction}` };
}

export function buildGoogleAdDailyQuery(since: string, until: string) {
  const start = requireDate(since);
  const end = requireDate(until);
  if (start > end) throw new Error("Google Ads report start date must not exceed end date.");
  return `${GOOGLE_AD_DAILY_QUERY} WHERE segments.date BETWEEN '${start}' AND '${end}' ORDER BY segments.date, campaign.id, ad_group.id, ad_group_ad.ad.id`;
}

export function normalizeGoogleAdDailyRow(row: any) {
  const customerId = normalizeGoogleCustomerId(String(row?.customer?.id || ""));
  const currency = String(row?.customer?.currencyCode || "");
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Invalid Google Ads account currency.");
  const customerTimeZone = String(row?.customer?.timeZone || "").trim();
  if (!customerTimeZone) throw new Error("Invalid Google Ads account timezone.");
  const reportDate = requireDate(row?.segments?.date);
  const campaignId = requireId(row?.campaign?.id, "campaign ID");
  const adGroupId = requireId(row?.adGroup?.id, "ad group ID");
  const adId = requireId(row?.adGroupAd?.ad?.id, "ad ID");
  const micros = microsToDecimal(row?.metrics?.costMicros);
  return {
    customerId,
    currency,
    customerTimeZone,
    reportDate,
    campaignId,
    campaignName: row?.campaign?.name ? String(row.campaign.name) : null,
    campaignStatus: row?.campaign?.status ? String(row.campaign.status) : null,
    adGroupId,
    adGroupName: row?.adGroup?.name ? String(row.adGroup.name) : null,
    adGroupStatus: row?.adGroup?.status ? String(row.adGroup.status) : null,
    adId,
    adName: row?.adGroupAd?.ad?.name ? String(row.adGroupAd.ad.name) : null,
    adStatus: row?.adGroupAd?.status ? String(row.adGroupAd.status) : null,
    impressions: requireCount(row?.metrics?.impressions, "impressions"),
    clicks: requireCount(row?.metrics?.clicks, "clicks"),
    costMicros: micros.raw,
    spend: micros.decimal,
  };
}
