import assert from "node:assert/strict";
import test from "node:test";
import { fetchGoogleCustomerProfile } from "../lib/integrations/google-ads-profile-client";

test("direct advertiser profile is discovered without customer_client hierarchy", async () => {
  const fetcher: typeof fetch = async (_url, init) => {
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("login-customer-id"), null);
    return new Response(JSON.stringify({ results: [{ customer: {
      id: "1234567890", manager: false, descriptiveName: "Direct Advertiser", currencyCode: "USD", timeZone: "America/Los_Angeles",
    }}] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const profile = await fetchGoogleCustomerProfile({ accessToken: "access", customerId: "1234567890", fetcher });
  assert.equal(profile.manager, false);
  assert.equal(profile.customerId, "1234567890");
  assert.equal(profile.descriptiveName, "Direct Advertiser");
});
