import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchGoogleCustomerClientHierarchy,
  GOOGLE_CUSTOMER_CLIENT_QUERY,
} from "../lib/integrations/google-ads-customer-client";

test("customer_client GAQL selects the hierarchy fields TraceKit preserves", () => {
  for (const field of [
    "customer_client.id",
    "customer_client.level",
    "customer_client.manager",
    "customer_client.descriptive_name",
    "customer_client.currency_code",
    "customer_client.time_zone",
  ]) assert.match(GOOGLE_CUSTOMER_CLIENT_QUERY, new RegExp(field.replace(".", "\\.")));
});

test("GAQL hierarchy fetch sends target in URL and manager in login-customer-id", async () => {
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(String(url), "https://googleads.googleapis.com/v25/customers/1200000001/googleAds:search");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Bearer access");
    assert.equal(headers.get("login-customer-id"), "1000000001");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.query, GOOGLE_CUSTOMER_CLIENT_QUERY);
    return new Response(JSON.stringify({
      results: [
        { customerClient: { id: "1200000001", level: "0", manager: true, descriptiveName: "Sub MCC", currencyCode: "USD", timeZone: "UTC" } },
        { customerClient: { id: "1210000001", level: "1", manager: false, descriptiveName: "Client", currencyCode: "USD", timeZone: "America/Los_Angeles" } },
      ],
    }), { status: 200, headers: { "content-type": "application/json", "request-id": "req-1" } });
  };
  const result = await fetchGoogleCustomerClientHierarchy({
    accessToken: "access", targetCustomerId: "1200000001", loginCustomerId: "1000000001", fetcher,
  });
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[1].parentCustomerId, "1200000001");
  assert.equal(result.requestIds[0], "req-1");
});

test("paginated hierarchy fetch follows nextPageToken and enforces page bound", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (_url, init) => {
    calls += 1;
    const body = JSON.parse(String(init?.body));
    if (calls === 1) {
      assert.equal(body.pageToken, undefined);
      return new Response(JSON.stringify({
        results: [{ customerClient: { id: "1000000001", level: "0", manager: true } }],
        nextPageToken: "next-1",
      }), { status: 200 });
    }
    assert.equal(body.pageToken, "next-1");
    return new Response(JSON.stringify({
      results: [{ customerClient: { id: "1100000001", level: "1", manager: false } }],
    }), { status: 200 });
  };
  const result = await fetchGoogleCustomerClientHierarchy({
    accessToken: "access", targetCustomerId: "1000000001", loginCustomerId: "1000000001", fetcher, maxPages: 2,
  });
  assert.equal(result.rows.length, 2);
  assert.equal(calls, 2);

  let boundedCalls = 0;
  const endless: typeof fetch = async () => {
    boundedCalls += 1;
    return new Response(JSON.stringify({ results: [], nextPageToken: `next-${boundedCalls}` }), { status: 200 });
  };
  await assert.rejects(() => fetchGoogleCustomerClientHierarchy({
    accessToken: "access", targetCustomerId: "1000000001", loginCustomerId: "1000000001", fetcher: endless, maxPages: 2,
  }), /page bound exceeded/i);
});

test("malformed customer_client rows fail rather than silently disappear", async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({
    results: [{ customerClient: { id: "not-an-id", level: "1", manager: false } }],
  }), { status: 200 });
  await assert.rejects(() => fetchGoogleCustomerClientHierarchy({
    accessToken: "access", targetCustomerId: "1000000001", loginCustomerId: "1000000001", fetcher,
  }), /customer/i);
});
