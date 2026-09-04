import "server-only";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";
import { EVERFLOW_API_BASE, EverflowHealthError } from "./everflow-client";

export const EVERFLOW_CLICKS_STREAM_PATH = "/v1/networks/reporting/clicks/stream";
export const EVERFLOW_CLICKS_STREAM_URL = `${EVERFLOW_API_BASE}${EVERFLOW_CLICKS_STREAM_PATH}`;
export const EVERFLOW_CLICK_TIMEOUT_MS = 30_000;
export const EVERFLOW_CLICK_MAX_RANGE_DAYS = 14;
export const EVERFLOW_CLICK_MAX_ROWS = 10_000;

type Row = Record<string, unknown>;

export type EverflowClick = {
  transactionId: string;
  clickAt: string;
  isUnique: boolean | null;
  sourceId: string | null;
  sub1: string | null;
  sub2: string | null;
  sub3: string | null;
  sub4: string | null;
  sub5: string | null;
  affiliateId: string | null;
  affiliateName: string | null;
  offerId: string | null;
  offerName: string | null;
  trackingUrl: string | null;
  destinationUrl: string | null;
  referer: string | null;
  revenue: number | null;
  payout: number | null;
  currency: string | null;
  hasConversion: boolean | null;
  isViewThrough: boolean | null;
  isTestMode: boolean | null;
  isSdkClick: boolean | null;
  isAsync: boolean | null;
  userIpHash: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  isp: string | null;
  organizationName: string | null;
  isMobile: boolean | null;
  isProxy: boolean | null;
  platform: string | null;
  osVersion: string | null;
  browser: string | null;
  browserVersion: string | null;
  deviceType: string | null;
  deviceBrand: string | null;
  deviceModel: string | null;
  isRobot: boolean | null;
  isFilter: boolean | null;
  creativeId: string | null;
  couponCode: string | null;
  queryParameters: Row;
  payloadHash: string;
  rawPayload: Row;
  rawPayloadHash: string;
};

const record = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const cleanString = (value: unknown) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
};
const cleanNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const cleanBoolean = (value: unknown) => {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  return null;
};
const unixTimestamp = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const date = new Date(n < 10_000_000_000 ? n * 1000 : n);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
async function sha256Text(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function normalizeEverflowClick(value: unknown): Promise<EverflowClick> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new EverflowHealthError("everflow_invalid_response", "Everflow returned an invalid click record.", 502, true);
  const row = value as Row;
  const transactionId = cleanString(row.transaction_id);
  const clickAt = unixTimestamp(row.unix_timestamp);
  if (!transactionId || !clickAt) throw new EverflowHealthError("everflow_invalid_response", "Everflow returned a click without stable identity or time.", 502, true);
  const relationship = record(row.relationship);
  const offer = record(relationship.offer);
  const affiliate = record(relationship.affiliate);
  const geo = record(relationship.geolocation);
  const device = record(relationship.device_information);
  const normalized = {
    transactionId,
    clickAt,
    isUnique: cleanBoolean(row.is_unique),
    sourceId: cleanString(row.source_id),
    sub1: cleanString(row.sub1), sub2: cleanString(row.sub2), sub3: cleanString(row.sub3), sub4: cleanString(row.sub4), sub5: cleanString(row.sub5),
    affiliateId: cleanString(affiliate.network_affiliate_id ?? row.network_affiliate_id),
    affiliateName: cleanString(affiliate.name ?? row.affiliate_name),
    offerId: cleanString(offer.network_offer_id ?? row.network_offer_id),
    offerName: cleanString(offer.name ?? row.offer_name),
    trackingUrl: cleanString(row.tracking_url),
    destinationUrl: cleanString(row.url ?? relationship.redirect_url),
    referer: cleanString(row.referer),
    revenue: cleanNumber(row.revenue), payout: cleanNumber(row.payout), currency: cleanString(row.currency_id)?.toUpperCase() || null,
    hasConversion: cleanBoolean(row.has_conversion), isViewThrough: cleanBoolean(row.is_view_through), isTestMode: cleanBoolean(row.is_test_mode), isSdkClick: cleanBoolean(row.is_sdk_click), isAsync: cleanBoolean(row.is_async),
    userIpHash: cleanString(row.user_ip) ? await sha256Text(String(row.user_ip).trim()) : null,
    country: cleanString(geo.country_code ?? geo.country_name), region: cleanString(geo.region_code ?? geo.region_name), city: cleanString(geo.city_name), isp: cleanString(geo.isp_name), organizationName: cleanString(geo.organization),
    isMobile: cleanBoolean(geo.is_mobile ?? device.is_mobile), isProxy: cleanBoolean(geo.is_proxy),
    platform: cleanString(device.platform_name), osVersion: cleanString(device.os_version), browser: cleanString(device.browser_name), browserVersion: cleanString(device.browser_version), deviceType: cleanString(device.device_type), deviceBrand: cleanString(device.brand), deviceModel: cleanString(device.model), isRobot: cleanBoolean(device.is_robot), isFilter: cleanBoolean(device.is_filter),
    creativeId: cleanString(row.creative_id), couponCode: cleanString(row.coupon_code), queryParameters: record(relationship.query_parameters),
  };
  const payloadHash = await sha256Text(JSON.stringify(normalized));
  return { ...normalized, payloadHash, rawPayload: row, rawPayloadHash: await sha256Text(JSON.stringify(row)) };
}

export async function fetchEverflowClickStream(input: { apiKey: string; from: string; to: string; timezoneId: number; fetchImpl?: typeof fetch }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EVERFLOW_CLICK_TIMEOUT_MS);
  try {
    const response = await (input.fetchImpl || fetch)(EVERFLOW_CLICKS_STREAM_URL, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-Eflow-Api-Key": input.apiKey },
      body: JSON.stringify({ from: input.from, to: input.to, timezone_id: input.timezoneId, query: { filters: [], search_terms: [] } }),
    });
    if (response.status === 401 || response.status === 403) throw new EverflowHealthError("everflow_authentication_failed", "Everflow authentication failed.", 401, false);
    if (response.status === 429) throw new EverflowHealthError("everflow_rate_limited", "Everflow rate limited click ingestion.", 429, true);
    if (!response.ok) throw new EverflowHealthError("everflow_unavailable", "Everflow could not complete click ingestion.", 502, response.status >= 500);
    const payload = record(await response.json());
    const rows = Array.isArray(payload.clicks) ? payload.clicks : Array.isArray(payload.table) ? payload.table : [];
    if (rows.length >= EVERFLOW_CLICK_MAX_ROWS) throw new EverflowHealthError("everflow_invalid_response", "Everflow click window reached the 10,000-row stream limit and must be narrowed.", 409, true);
    return await Promise.all(rows.map(normalizeEverflowClick));
  } finally {
    clearTimeout(timeout);
  }
}

export async function persistEverflowClicks(input: { accountId: string; organizationId: string; connectionId: string; providerAccountId: string; clicks: EverflowClick[]; observedAt?: string }) {
  if (!input.clicks.length) return { seen: 0, persisted: 0 };
  const observedAt = input.observedAt || new Date().toISOString();
  const rows = input.clicks.map((c) => ({
    account_id: input.accountId, organization_id: input.organizationId, connection_id: input.connectionId, provider_account_id: input.providerAccountId,
    transaction_id: c.transactionId, click_at: c.clickAt, is_unique: c.isUnique, source_id: c.sourceId, sub1: c.sub1, sub2: c.sub2, sub3: c.sub3, sub4: c.sub4, sub5: c.sub5,
    affiliate_id: c.affiliateId, affiliate_name: c.affiliateName, offer_id: c.offerId, offer_name: c.offerName, tracking_url: c.trackingUrl, destination_url: c.destinationUrl, referer: c.referer,
    revenue: c.revenue, payout: c.payout, currency: c.currency, has_conversion: c.hasConversion, is_view_through: c.isViewThrough, is_test_mode: c.isTestMode, is_sdk_click: c.isSdkClick, is_async: c.isAsync,
    user_ip_hash: c.userIpHash, country: c.country, region: c.region, city: c.city, isp: c.isp, organization_name: c.organizationName, is_mobile: c.isMobile, is_proxy: c.isProxy,
    platform: c.platform, os_version: c.osVersion, browser: c.browser, browser_version: c.browserVersion, device_type: c.deviceType, device_brand: c.deviceBrand, device_model: c.deviceModel, is_robot: c.isRobot, is_filter: c.isFilter,
    creative_id: c.creativeId, coupon_code: c.couponCode, query_parameters: c.queryParameters, payload_hash: c.payloadHash, raw_payload: c.rawPayload, raw_payload_hash: c.rawPayloadHash,
    ingestion_method: "api", last_seen_at: observedAt, updated_at: observedAt,
  }));
  const result = await commercePersistenceRequest("everflow_click_events?on_conflict=organization_id,connection_id,provider_account_id,transaction_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(rows) });
  return { seen: input.clicks.length, persisted: result.length };
}
