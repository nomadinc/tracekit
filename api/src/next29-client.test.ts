import assert from "node:assert/strict";
import test from "node:test";
import { Next29Client } from "./connectors/next29/client.ts";
import { persistNext29Evidence, next29OrderEvidence } from "./connectors/next29/evidence.ts";
import { verifyNext29ReadOnlyConnection } from "./connectors/next29/verification.ts";

const token = "test-access-token-not-a-real-secret";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

test("29Next client sends bearer auth and stable API version to store Admin API", async () => {
  const requests: Array<{ url: string; headers: Headers }> = [];
  const client = new Next29Client(
    { store: "demo", accessToken: token },
    {
      correlationId: () => "corr-1",
      fetch: async (input, init) => {
        requests.push({ url: String(input), headers: new Headers(init?.headers) });
        return jsonResponse({ next: null, previous: null, results: [] });
      },
    },
  );

  const page = await client.listOrders();
  assert.equal(page.correlationId, "corr-1");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://demo.29next.store/api/admin/orders/");
  assert.equal(requests[0].headers.get("authorization"), `Bearer ${token}`);
  assert.equal(requests[0].headers.get("x-29next-api-version"), "2024-04-01");
});

test("29Next cursor iterator follows same-origin next links and stops", async () => {
  const urls: string[] = [];
  const client = new Next29Client(
    { store: "demo", accessToken: token },
    {
      fetch: async (input) => {
        const url = String(input);
        urls.push(url);
        if (urls.length === 1) {
          return jsonResponse({
            next: "https://demo.29next.store/api/admin/orders/?cursor=abc",
            previous: null,
            results: [{ number: "1001" }],
          });
        }
        return jsonResponse({ next: null, previous: null, results: [{ number: "1002" }] });
      },
    },
  );

  const numbers: string[] = [];
  for await (const page of client.iterateOrders()) numbers.push(...page.results.map((order) => order.number));
  assert.deepEqual(numbers, ["1001", "1002"]);
});

test("29Next cursor iterator rejects pagination URLs outside the configured Admin API", async () => {
  const client = new Next29Client(
    { store: "demo", accessToken: token },
    { fetch: async () => jsonResponse({ next: "https://evil.example/orders/?cursor=abc", previous: null, results: [] }) },
  );
  await assert.rejects(async () => { for await (const _page of client.iterateOrders()) { /* exhaust */ } }, /pagination URL escaped/);
});

test("29Next retries 429 responses and honors Retry-After", async () => {
  let attempts = 0;
  const delays: number[] = [];
  const client = new Next29Client(
    { store: "demo", accessToken: token, maxAttempts: 2 },
    {
      random: () => 0.5,
      sleep: async (delay) => { delays.push(delay); },
      fetch: async () => {
        attempts += 1;
        if (attempts === 1) return jsonResponse({ detail: "throttled" }, { status: 429, headers: { "Retry-After": "1" } });
        return jsonResponse({ next: null, previous: null, results: [] });
      },
    },
  );
  await client.listOrders();
  assert.equal(attempts, 2);
  assert.deepEqual(delays, [1000]);
});

test("29Next read-only verification proves orders subscriptions and disputes capability without writes", async () => {
  const urls: string[] = [];
  const result = await verifyNext29ReadOnlyConnection(
    { store: "demo", accessToken: token },
    {
      fetch: async (input) => {
        urls.push(String(input));
        return jsonResponse({ next: null, previous: null, results: [] }, { headers: { "x-ratelimit-limit": "4" } });
      },
    },
  );

  assert.equal(urls.length, 3);
  assert.deepEqual(urls.sort(), [
    "https://demo.29next.store/api/admin/disputes/",
    "https://demo.29next.store/api/admin/orders/",
    "https://demo.29next.store/api/admin/subscriptions/",
  ]);
  assert.equal(result.status, "connected");
  assert.equal(result.apiVersion, "2024-04-01");
  assert.deepEqual(result.capabilities, ["orders.read", "subscriptions.read", "disputes.read", "webhooks.signed", "cursor_pagination", "versioned_admin_api"]);
  assert.deepEqual(result.resourceChecks, { orders: true, subscriptions: true, disputes: true });
  assert.equal(result.rateLimitObserved, true);
});

test("29Next evidence handoff is tenant scoped and preserves the provider envelope", async () => {
  let captured: any = null;
  const sink = {
    async putImmutable(input: any) {
      captured = input;
      return { storageReference: "memory://evidence/1", payloadHash: "abc", byteSize: input.payload.byteLength };
    },
  };
  const result = await persistNext29Evidence(
    sink,
    { organizationId: "org-1", connectionId: "conn-1", providerAccountId: "acct-1" },
    next29OrderEvidence({ apiVersion: "2024-04-01", orderNumber: "1001", observedAt: "2026-08-31T12:00:00Z", payload: { number: "1001" } }),
  );
  assert.equal(result.storageReference, "memory://evidence/1");
  assert.equal(captured.organizationId, "org-1");
  assert.equal(captured.connectionId, "conn-1");
  assert.equal(captured.providerAccountId, "acct-1");
  assert.equal(captured.sourceObjectType, "next29_order");
  assert.equal(captured.sourceObjectId, "1001");
  const envelope = JSON.parse(new TextDecoder().decode(captured.payload));
  assert.equal(envelope.provider, "next29");
  assert.equal(envelope.payload.number, "1001");
});
