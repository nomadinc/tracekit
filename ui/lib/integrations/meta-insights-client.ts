import "server-only";
import { META_GRAPH_BASE_URL, META_GRAPH_VERSION, MetaOAuthError } from "./meta-oauth";

const PAGE_SIZE = 100;
const MAX_PAGES = 20;
export const META_INSIGHTS_MAX_RANGE_DAYS = 31;

export type MetaInsightsPage = {
  page: number;
  cursorBefore: string | null;
  cursorAfter: string | null;
  rows: Array<Record<string, unknown>>;
};

const INSIGHTS_FIELDS = [
  "account_id",
  "account_currency",
  "campaign_id",
  "adset_id",
  "ad_id",
  "date_start",
  "date_stop",
  "spend",
  "impressions",
  "clicks",
  "reach",
  "frequency",
  "actions",
  "action_values",
].join(",");

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new MetaOAuthError("invalid_request", "Meta Insights dates must use YYYY-MM-DD.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new MetaOAuthError("invalid_request", "Meta Insights date is invalid.");
  return date;
}

export function validateMetaInsightsRange(since: string, until: string) {
  const start = parseDate(since);
  const end = parseDate(until);
  if (end < start) throw new MetaOAuthError("invalid_request", "Meta Insights end date must be on or after the start date.");
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (days > META_INSIGHTS_MAX_RANGE_DAYS) throw new MetaOAuthError("meta_insights_range_too_large", `Meta Insights manual sync is limited to ${META_INSIGHTS_MAX_RANGE_DAYS} days per request.`, 409, true);
  return { since, until, days };
}

async function insightsPage(input: {
  accessToken: string;
  accountExternalId: string;
  since: string;
  until: string;
  after: string | null;
  fetchImpl: typeof fetch;
}) {
  const url = new URL(`${META_GRAPH_BASE_URL}/act_${input.accountExternalId}/insights`);
  url.searchParams.set("fields", INSIGHTS_FIELDS);
  url.searchParams.set("level", "ad");
  url.searchParams.set("time_increment", "1");
  url.searchParams.set("time_range", JSON.stringify({ since: input.since, until: input.until }));
  url.searchParams.set("use_account_attribution_setting", "true");
  url.searchParams.set("limit", String(PAGE_SIZE));
  if (input.after) url.searchParams.set("after", input.after);

  const response = await input.fetchImpl(url, {
    method: "GET",
    cache: "no-store",
    headers: { Authorization: `Bearer ${input.accessToken}`, Accept: "application/json" },
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    const code = response.status === 401 || response.status === 403
      ? "meta_authentication_failed"
      : response.status === 429
        ? "meta_rate_limited"
        : "meta_insights_request_failed";
    throw new MetaOAuthError(code, "Meta could not read daily advertising Insights.", response.status, retryable);
  }
  const rows = Array.isArray(body.data) ? body.data.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object") : [];
  const paging = body.paging && typeof body.paging === "object" ? body.paging as Record<string, unknown> : null;
  const cursors = paging?.cursors && typeof paging.cursors === "object" ? paging.cursors as Record<string, unknown> : null;
  const before = typeof cursors?.before === "string" ? String(cursors.before) : null;
  const nextAfter = typeof cursors?.after === "string" && paging?.next ? String(cursors.after) : null;
  return { rows, before, after: nextAfter };
}

export async function fetchMetaInsightsPages(input: {
  accessToken: string;
  accountExternalId: string;
  since: string;
  until: string;
  fetchImpl?: typeof fetch;
}): Promise<MetaInsightsPage[]> {
  if (!/^\d+$/.test(input.accountExternalId)) throw new MetaOAuthError("invalid_request", "Meta advertising account identity is invalid.");
  validateMetaInsightsRange(input.since, input.until);
  const fetchImpl = input.fetchImpl || fetch;
  const pages: MetaInsightsPage[] = [];
  let after: string | null = null;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await insightsPage({ ...input, after, fetchImpl });
    pages.push({ page, cursorBefore: result.before, cursorAfter: result.after, rows: result.rows });
    if (!result.after || result.after === after) return pages;
    after = result.after;
  }
  if (pages[pages.length - 1]?.cursorAfter) throw new MetaOAuthError("meta_insights_page_limit_reached", "Meta Insights sync reached the bounded page limit and stopped before truncating data.", 409, true);
  return pages;
}

export const META_INSIGHTS_API_VERSION = META_GRAPH_VERSION;
export const META_INSIGHTS_REPORTING_SEMANTICS = {
  entityLevel: "ad",
  timeIncrement: 1,
  useAccountAttributionSetting: true,
} as const;
