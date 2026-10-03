import { GOOGLE_ADS_API_VERSION } from "./google-ads-oauth";
import { normalizeGoogleCustomerId } from "./google-ads-account-discovery";

type AccessibleResponse = { resourceNames?: unknown; error?: { status?: unknown; code?: unknown } };

export class GoogleAdsApiError extends Error {
  constructor(readonly operation: string, readonly httpStatus: number, readonly apiStatus: string, readonly requestId: string | null) {
    super("Google Ads API request failed.");
  }
}

function safeStatus(value: unknown) {
  return String(value || "unknown").replace(/[^a-z0-9_.-]/gi, "_").slice(0, 80).toLowerCase();
}

export async function listGoogleAccessibleCustomers(input: { accessToken: string; fetcher?: typeof fetch }) {
  const fetcher = input.fetcher || fetch;
  const response = await fetcher(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`,
    {
      method: "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
    },
  );
  const payload = await response.json().catch(() => ({})) as AccessibleResponse;
  if (!response.ok) {
    throw new GoogleAdsApiError(
      "list_accessible_customers",
      response.status,
      safeStatus(payload.error?.status || payload.error?.code),
      response.headers.get("request-id"),
    );
  }
  if (!Array.isArray(payload.resourceNames)) return [];
  return payload.resourceNames.map((value) => {
    const match = /^customers\/(\d{10})$/.exec(String(value));
    if (!match) throw new Error("Invalid Google Ads customer resource name.");
    return normalizeGoogleCustomerId(match[1]);
  });
}
