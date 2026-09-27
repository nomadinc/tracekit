import "server-only";
import { TIKTOK_REPORT_PATH } from "./tiktok-ads-reporting";
import { TikTokOAuthError } from "./tiktok-ads-oauth";

export type TikTokReportPage = { page: number; rows: Array<{ dimensions: Record<string, unknown>; metrics: Record<string, unknown> }>; totalPages: number | null };

export async function fetchTikTokAdDailyReport(input: {
  accessToken: string; advertiserId: string; since: string; until: string;
  baseUrl?: string; fetchImpl?: typeof fetch; maxPages?: number;
}) {
  const fetchImpl = input.fetchImpl || fetch;
  const base = input.baseUrl || "https://business-api.tiktok.com";
  const maxPages = input.maxPages ?? 20;
  if (!Number.isInteger(maxPages) || maxPages < 1) throw new Error("Invalid TikTok report page bound.");
  const pages: TikTokReportPage[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const url = new URL(TIKTOK_REPORT_PATH, base);
    url.searchParams.set("advertiser_id", input.advertiserId);
    url.searchParams.set("report_type", "BASIC");
    url.searchParams.set("data_level", "AUCTION_AD");
    url.searchParams.set("dimensions", JSON.stringify(["ad_id", "stat_time_day"]));
    url.searchParams.set("metrics", JSON.stringify(["campaign_id", "adgroup_id", "spend", "impressions", "clicks"]));
    url.searchParams.set("start_date", input.since);
    url.searchParams.set("end_date", input.until);
    url.searchParams.set("page", String(page));

    const response = await fetchImpl(url, { method: "GET", cache: "no-store", headers: { "Access-Token": input.accessToken, Accept: "application/json" } });
    const payload = await response.json().catch(() => ({})) as Record<string, any>;
    if (!response.ok || Number(payload.code ?? -1) !== 0) {
      const retryable = response.status === 429 || response.status >= 500;
      const code = response.status === 429 ? "tiktok_rate_limited" : response.status === 401 || response.status === 403 ? "tiktok_authentication_failed" : "tiktok_report_failed";
      throw new TikTokOAuthError(code, "TikTok reporting request failed.", response.status || 502, retryable);
    }
    const data = payload.data && typeof payload.data === "object" ? payload.data as Record<string, any> : {};
    const rows = Array.isArray(data.list) ? data.list.filter((x: unknown) => x && typeof x === "object") : [];
    const pageInfo = data.page_info && typeof data.page_info === "object" ? data.page_info as Record<string, any> : {};
    const totalPages = Number.isSafeInteger(Number(pageInfo.total_page)) ? Number(pageInfo.total_page) : null;
    pages.push({ page, rows, totalPages });
    if (!totalPages || page >= totalPages) return pages;
  }
  if (pages[pages.length - 1]?.totalPages && pages[pages.length - 1].page < pages[pages.length - 1].totalPages!) {
    throw new TikTokOAuthError("tiktok_report_page_limit_reached", "TikTok reporting reached the bounded page limit.", 409, true);
  }
  return pages;
}
