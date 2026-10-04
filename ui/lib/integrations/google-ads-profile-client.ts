import { GOOGLE_ADS_API_VERSION } from "./google-ads-oauth";
import { normalizeGoogleCustomerId } from "./google-ads-account-discovery";

export type GoogleCustomerProfile = {
  customerId: string;
  manager: boolean;
  descriptiveName: string | null;
  currencyCode: string | null;
  timeZone: string | null;
};

const QUERY = [
  "SELECT",
  "customer.id,",
  "customer.manager,",
  "customer.descriptive_name,",
  "customer.currency_code,",
  "customer.time_zone",
  "FROM customer",
  "LIMIT 1",
].join(" ");

function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }

export async function fetchGoogleCustomerProfile(input: { accessToken: string; customerId: string; loginCustomerId?: string; fetcher?: typeof fetch }) {
  const customerId = normalizeGoogleCustomerId(input.customerId);
  const fetcher = input.fetcher || fetch;
  const headers: Record<string,string> = { Authorization: `Bearer ${input.accessToken}`, "Content-Type": "application/json" };
  if (input.loginCustomerId) headers["login-customer-id"] = normalizeGoogleCustomerId(input.loginCustomerId);
  const response = await fetcher(`https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:search`, {
    method: "POST", cache: "no-store", headers, body: JSON.stringify({ query: QUERY }),
  });
  const payload = await response.json().catch(() => ({})) as { results?: Array<{ customer?: Record<string,unknown> }> };
  if (!response.ok) throw new Error("google_ads_customer_profile_query_failed");
  const row = payload.results?.[0]?.customer;
  if (!row || typeof row.manager !== "boolean") throw new Error("google_ads_customer_profile_invalid");
  return {
    customerId: normalizeGoogleCustomerId(String(row.id || customerId)),
    manager: row.manager,
    descriptiveName: text(row.descriptiveName),
    currencyCode: text(row.currencyCode),
    timeZone: text(row.timeZone),
  } satisfies GoogleCustomerProfile;
}
