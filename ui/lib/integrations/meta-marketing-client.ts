import "server-only";
import { META_GRAPH_BASE_URL, META_GRAPH_VERSION, MetaOAuthError } from "./meta-oauth";

const PAGE_SIZE = 100;
const MAX_PAGES = 10;

export type MetaHierarchyResource = "campaigns" | "adsets" | "adcreatives" | "ads";

export type MetaHierarchyPage = {
  resource: MetaHierarchyResource;
  page: number;
  cursorBefore: string | null;
  cursorAfter: string | null;
  rows: Array<Record<string, unknown>>;
};

const fields: Record<MetaHierarchyResource, string> = {
  campaigns: "id,name,status,effective_status,objective,buying_type,spend_cap,daily_budget,lifetime_budget,created_time,updated_time",
  adsets: "id,campaign_id,name,status,effective_status,optimization_goal,billing_event,bid_strategy,daily_budget,lifetime_budget,start_time,end_time,created_time,updated_time",
  adcreatives: "id,name,object_story_id,thumbnail_url,effective_object_story_id,object_url,url_tags,created_time",
  ads: "id,campaign_id,adset_id,name,status,effective_status,creative{id},conversion_domain,created_time,updated_time",
};

async function graphPage(
  accessToken: string,
  accountExternalId: string,
  resource: MetaHierarchyResource,
  after: string | null,
  fetchImpl: typeof fetch,
) {
  const url = new URL(`${META_GRAPH_BASE_URL}/act_${accountExternalId}/${resource}`);
  url.searchParams.set("fields", fields[resource]);
  url.searchParams.set("limit", String(PAGE_SIZE));
  if (after) url.searchParams.set("after", after);
  const response = await fetchImpl(url, {
    method: "GET",
    cache: "no-store",
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    const code = response.status === 401 || response.status === 403
      ? "meta_authentication_failed"
      : response.status === 429
        ? "meta_rate_limited"
        : "meta_provider_request_failed";
    throw new MetaOAuthError(code, "Meta could not read advertising hierarchy data.", response.status, retryable);
  }
  const data = Array.isArray(body.data) ? body.data.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object") : [];
  const paging = body.paging && typeof body.paging === "object" ? body.paging as Record<string, unknown> : null;
  const cursors = paging?.cursors && typeof paging.cursors === "object" ? paging.cursors as Record<string, unknown> : null;
  const before = typeof cursors?.before === "string" ? String(cursors.before) : null;
  const nextAfter = typeof cursors?.after === "string" && paging?.next ? String(cursors.after) : null;
  return { data, before, after: nextAfter };
}

export async function fetchMetaHierarchyPages(input: {
  accessToken: string;
  accountExternalId: string;
  resource: MetaHierarchyResource;
  fetchImpl?: typeof fetch;
}): Promise<MetaHierarchyPage[]> {
  if (!/^\d+$/.test(input.accountExternalId)) throw new MetaOAuthError("invalid_request", "Meta advertising account identity is invalid.");
  const fetchImpl = input.fetchImpl || fetch;
  const pages: MetaHierarchyPage[] = [];
  let after: string | null = null;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await graphPage(input.accessToken, input.accountExternalId, input.resource, after, fetchImpl);
    pages.push({ resource: input.resource, page, cursorBefore: result.before, cursorAfter: result.after, rows: result.data });
    if (!result.after || result.after === after) return pages;
    after = result.after;
  }
  if (pages[pages.length - 1]?.cursorAfter) {
    throw new MetaOAuthError("meta_hierarchy_page_limit_reached", "Meta hierarchy sync reached the bounded page limit and stopped before truncating data.", 409, true);
  }
  return pages;
}

export const META_HIERARCHY_API_VERSION = META_GRAPH_VERSION;
