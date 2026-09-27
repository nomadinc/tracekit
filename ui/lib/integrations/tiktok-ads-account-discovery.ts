import "server-only";
import { normalizeTikTokAdvertiserId } from "./tiktok-ads-contract";
import { TikTokOAuthError } from "./tiktok-ads-oauth";

export type TikTokAdvertiserAccount = {
  advertiserId: string;
  name: string | null;
  currency: string | null;
  timezoneName: string | null;
  status: string | null;
};

function providerError(response: Response, payload: Record<string, any>) {
  const retryable = response.status === 429 || response.status >= 500;
  const code = response.status === 429 ? "tiktok_rate_limited"
    : response.status === 401 || response.status === 403 ? "tiktok_authentication_failed"
    : "tiktok_advertiser_discovery_failed";
  return new TikTokOAuthError(code, "TikTok advertiser discovery failed.", response.status || 502, retryable);
}

/**
 * Normalizes advertiser information supplied by the authorized TikTok API.
 * The caller owns endpoint selection so M2 does not hard-code an uncertified
 * advertiser-info route. This keeps discovery fixture-certifiable now and lets
 * live endpoint certification remain a separate production gate.
 */
export function normalizeTikTokAdvertiserAccount(row: Record<string, unknown>): TikTokAdvertiserAccount {
  const advertiserId = normalizeTikTokAdvertiserId(row.advertiser_id);
  const currency = row.currency ? String(row.currency).trim().toUpperCase() : null;
  if (currency && !/^[A-Z]{3}$/.test(currency)) throw new Error("Invalid TikTok advertiser currency.");
  const timezoneName = row.timezone ? String(row.timezone).trim() : row.timezone_name ? String(row.timezone_name).trim() : null;
  return {
    advertiserId,
    name: row.name ? String(row.name) : row.advertiser_name ? String(row.advertiser_name) : null,
    currency,
    timezoneName: timezoneName || null,
    status: row.status ? String(row.status) : null,
  };
}

export async function fetchTikTokAdvertiserAccounts(input: {
  accessToken: string;
  advertiserIds: string[];
  endpoint: string;
  fetchImpl?: typeof fetch;
}) {
  const ids = Array.from(new Set(input.advertiserIds.map(normalizeTikTokAdvertiserId)));
  if (!ids.length) return [];
  const url = new URL(input.endpoint);
  if (url.protocol !== "https:" || url.hostname !== "business-api.tiktok.com") {
    throw new TikTokOAuthError("tiktok_configuration_unavailable", "TikTok advertiser discovery configuration is unavailable.", 503);
  }
  url.searchParams.set("advertiser_ids", JSON.stringify(ids));
  const response = await (input.fetchImpl || fetch)(url, {
    method: "GET", cache: "no-store", headers: { "Access-Token": input.accessToken, Accept: "application/json" },
  });
  const payload = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok || Number(payload.code ?? -1) !== 0) throw providerError(response, payload);
  const data = payload.data && typeof payload.data === "object" ? payload.data as Record<string, any> : {};
  const rows = Array.isArray(data.list) ? data.list : Array.isArray(data.advertiser_list) ? data.advertiser_list : [];
  return rows.map((row: unknown) => normalizeTikTokAdvertiserAccount(row as Record<string, unknown>));
}
