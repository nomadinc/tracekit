import { GOOGLE_ADS_API_VERSION } from "./google-ads-oauth";
import { normalizeGoogleCustomerId } from "./google-ads-account-discovery";
import type { GoogleHierarchyRow } from "./google-ads-hierarchy-client";

export const GOOGLE_CUSTOMER_CLIENT_QUERY = [
  "SELECT",
  "customer_client.id,",
  "customer_client.level,",
  "customer_client.manager,",
  "customer_client.descriptive_name,",
  "customer_client.currency_code,",
  "customer_client.time_zone",
  "FROM customer_client",
  "WHERE customer_client.level <= 1",
  "ORDER BY customer_client.level, customer_client.id",
].join(" ");

type RawResult = {
  customerClient?: {
    id?: unknown;
    level?: unknown;
    manager?: unknown;
    descriptiveName?: unknown;
    currencyCode?: unknown;
    timeZone?: unknown;
  };
};
type SearchResponse = {
  results?: RawResult[];
  nextPageToken?: string;
};

function nullableText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseRow(value: RawResult, targetCustomerId: string): GoogleHierarchyRow {
  const row = value.customerClient;
  if (!row) throw new Error("Invalid Google Ads customer_client row.");
  const customerId = normalizeGoogleCustomerId(String(row.id || ""));
  const level = Number(row.level);
  if (!Number.isSafeInteger(level) || level < 0) throw new Error("Invalid Google Ads customer_client level.");
  if (typeof row.manager !== "boolean") throw new Error("Invalid Google Ads customer_client manager flag.");
  return {
    customerId,
    parentCustomerId: level === 0 ? null : targetCustomerId,
    level,
    manager: row.manager,
    descriptiveName: nullableText(row.descriptiveName),
    currencyCode: nullableText(row.currencyCode),
    timeZone: nullableText(row.timeZone),
  };
}

export async function fetchGoogleCustomerClientHierarchy(input: {
  accessToken: string;
  targetCustomerId: string;
  loginCustomerId: string;
  fetcher?: typeof fetch;
  maxPages?: number;
}) {
  const targetCustomerId = normalizeGoogleCustomerId(input.targetCustomerId);
  const loginCustomerId = normalizeGoogleCustomerId(input.loginCustomerId);
  const fetcher = input.fetcher || fetch;
  const maxPages = input.maxPages ?? 100;
  const rows: GoogleHierarchyRow[] = [];
  const requestIds: string[] = [];
  let pageToken: string | undefined;
  let pages = 0;

  do {
    if (pages >= maxPages) throw new Error("Google Ads customer_client page bound exceeded.");
    const body: Record<string, string> = { query: GOOGLE_CUSTOMER_CLIENT_QUERY };
    if (pageToken) body.pageToken = pageToken;
    const response = await fetcher(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${targetCustomerId}/googleAds:search`,
      {
        method: "POST",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          "Content-Type": "application/json",
          "login-customer-id": loginCustomerId,
        },
        body: JSON.stringify(body),
      },
    );
    const requestId = response.headers.get("request-id");
    if (requestId) requestIds.push(requestId);
    const payload = await response.json().catch(() => ({})) as SearchResponse;
    if (!response.ok) throw new Error("google_ads_customer_client_query_failed");
    for (const result of Array.isArray(payload.results) ? payload.results : []) {
      rows.push(parseRow(result, targetCustomerId));
    }
    pageToken = typeof payload.nextPageToken === "string" && payload.nextPageToken ? payload.nextPageToken : undefined;
    pages += 1;
  } while (pageToken);

  return { rows, requestIds, pages };
}
