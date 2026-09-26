import { GOOGLE_ADS_API_VERSION } from "./google-ads-oauth";
import { normalizeGoogleCustomerId } from "./google-ads-account-discovery";

type AccessibleResponse = { resourceNames?: unknown };

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
  const payload = await response.json().catch(() => ({})) as AccessibleResponse & { error?: unknown };
  if (!response.ok) throw new Error("google_ads_accessible_customers_failed");
  if (!Array.isArray(payload.resourceNames)) return [];
  return payload.resourceNames.map((value) => {
    const match = /^customers\/(\d{10})$/.exec(String(value));
    if (!match) throw new Error("Invalid Google Ads customer resource name.");
    return normalizeGoogleCustomerId(match[1]);
  });
}
