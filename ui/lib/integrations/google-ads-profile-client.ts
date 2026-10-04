import { GOOGLE_ADS_API_VERSION } from "./google-ads-oauth";
import { normalizeGoogleCustomerId } from "./google-ads-account-discovery";

export type GoogleCustomerProfile = {
  customerId: string;
  manager: boolean;
  descriptiveName: string | null;
  currencyCode: string | null;
  timeZone: string | null;
};

export class GoogleAdsProfileError extends Error {
  constructor(readonly httpStatus: number, readonly apiStatus: string) { super("Google Ads customer profile query failed."); }
}

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
function safe(value: unknown) { return String(value || "unknown").replace(/[^a-z0-9_.-]/gi, "_").slice(0, 80).toLowerCase(); }
function googleAdsErrorEnum(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const details = Array.isArray((error as { details?: unknown }).details) ? (error as { details: unknown[] }).details : [];
  for (const detail of details) {
    if (!detail || typeof detail !== "object") continue;
    const errors = Array.isArray((detail as { errors?: unknown }).errors) ? (detail as { errors: unknown[] }).errors : [];
    for (const item of errors) {
      if (!item || typeof item !== "object") continue;
      const errorCode = (item as { errorCode?: unknown }).errorCode;
      if (!errorCode || typeof errorCode !== "object") continue;
      for (const [family, value] of Object.entries(errorCode as Record<string, unknown>)) {
        if (typeof value === "string" && value) return safe(`${family}_${value}`);
      }
    }
  }
  return null;
}

export async function fetchGoogleCustomerProfile(input: { accessToken: string; customerId: string; loginCustomerId?: string; fetcher?: typeof fetch }) {
  const customerId = normalizeGoogleCustomerId(input.customerId);
  const fetcher = input.fetcher || fetch;
  const headers: Record<string,string> = { Authorization: `Bearer ${input.accessToken}`, "Content-Type": "application/json" };
  if (input.loginCustomerId) headers["login-customer-id"] = normalizeGoogleCustomerId(input.loginCustomerId);
  const response = await fetcher(`https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:search`, {
    method: "POST", cache: "no-store", headers, body: JSON.stringify({ query: QUERY }),
  });
  const payload = await response.json().catch(() => ({})) as { results?: Array<{ customer?: Record<string,unknown> }>; error?: { status?: unknown; code?: unknown; details?: unknown } };
  if (!response.ok) throw new GoogleAdsProfileError(response.status, googleAdsErrorEnum(payload.error) || safe(payload.error?.status || payload.error?.code));
  const row = payload.results?.[0]?.customer;
  if (!row || typeof row.manager !== "boolean") throw new GoogleAdsProfileError(502, "invalid_profile_response");
  return {
    customerId: normalizeGoogleCustomerId(String(row.id || customerId)),
    manager: row.manager,
    descriptiveName: text(row.descriptiveName),
    currencyCode: text(row.currencyCode),
    timeZone: text(row.timeZone),
  } satisfies GoogleCustomerProfile;
}
