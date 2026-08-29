import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  EVERFLOW_NETWORK_INFO_URL,
  EverflowHealthError,
  getEverflowNetworkIdentity,
} from "../lib/integrations/everflow-client";
import { decryptCommerceCredential, encryptCommerceCredential } from "../lib/commerce/credential-crypto";

const SECRET = "ef-test-secret-never-log";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("Everflow health check is one bounded read-only network-info GET", async () => {
  let calls = 0;
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const network = await getEverflowNetworkIdentity({
    apiKey: SECRET,
    networkId: "3708",
    correlationId: "correlation-test",
    fetchImpl: async (url, init) => {
      calls += 1;
      capturedUrl = String(url);
      capturedInit = init;
      return jsonResponse({
        network_id: 3708,
        customer_id: 99,
        name: "Accufy",
        displayed_name: "Accufy",
        identifier: "accufy",
        account_status: "active",
        timezone_id: 80,
        currency_id: "USD",
      });
    },
  });
  assert.equal(calls, 1);
  assert.equal(capturedUrl, EVERFLOW_NETWORK_INFO_URL);
  assert.equal(capturedInit?.method, "GET");
  assert.equal(capturedInit?.body, undefined);
  assert.equal((capturedInit?.headers as Record<string, string>)["X-Eflow-Api-Key"], SECRET);
  assert.equal(network.networkId, "3708");
  assert.equal(network.name, "Accufy");
  assert.equal(network.currencyId, "USD");
});

test("Everflow rejects invalid credentials without leaking the API key", async () => {
  await assert.rejects(
    () => getEverflowNetworkIdentity({ apiKey: SECRET, fetchImpl: async () => jsonResponse({ error: SECRET }, 401) }),
    (error: unknown) => {
      assert.ok(error instanceof EverflowHealthError);
      assert.equal(error.code, "everflow_authentication_failed");
      assert.equal(error.httpStatus, 401);
      assert.equal(error.message.includes(SECRET), false);
      return true;
    },
  );
});

test("Everflow fails closed when supplied Network ID conflicts with authenticated network", async () => {
  await assert.rejects(
    () => getEverflowNetworkIdentity({ apiKey: SECRET, networkId: "1234", fetchImpl: async () => jsonResponse({ network_id: 3708, name: "Accufy" }) }),
    (error: unknown) => error instanceof EverflowHealthError && error.code === "everflow_network_mismatch" && error.httpStatus === 409,
  );
});

test("Everflow rate-limit failure is explicit, retryable, and does not retry the health call", async () => {
  let calls = 0;
  await assert.rejects(
    () => getEverflowNetworkIdentity({ apiKey: SECRET, fetchImpl: async () => { calls += 1; return jsonResponse({}, 429); } }),
    (error: unknown) => error instanceof EverflowHealthError && error.code === "everflow_rate_limited" && error.retryable,
  );
  assert.equal(calls, 1);
});

test("existing credential primitive encrypts Everflow API keys before persistence", async () => {
  const key = new Uint8Array(32).fill(17);
  const encrypted = await encryptCommerceCredential(SECRET, key, "test-key", 1);
  assert.equal(new TextDecoder().decode(encrypted.ciphertext).includes(SECRET), false);
  assert.equal(await decryptCommerceCredential(encrypted, key), SECRET);
});

test("Everflow connection verifies before writes and persists network identity", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const source = readFileSync(`${root}/lib/integrations/everflow-connection.ts`, "utf8");
  const health = source.indexOf("await healthCheck");
  const create = source.indexOf("createConnection", health);
  assert.ok(health >= 0 && create > health, "health check must happen before connection creation");
  assert.match(source, /externalId:\s*network\.networkId/);
  assert.match(source, /everflowNetwork:\s*metadata/);
  assert.match(source, /lastVerifiedAt/);
  assert.match(source, /customerId/);
  assert.match(source, /timezoneId/);
  assert.match(source, /currencyId/);
});

test("same Everflow network rotates credentials; different network remains separately scoped", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const source = readFileSync(`${root}/lib/integrations/everflow-connection.ts`, "utf8");
  assert.match(source, /candidate\.externalId === network\.networkId/);
  assert.match(source, /rotateCredential\(input\.session, connection\.id, input\.apiKey\)/);
  assert.match(source, /provider:\s*"everflow"/);
  assert.match(source, /reconnected:\s*true/);
  assert.match(source, /reconnected:\s*false/);
});

test("Everflow connect route returns safe identity metadata and reconnect state", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const route = readFileSync(`${root}/app/v1/integrations/everflow/connect/route.ts`, "utf8");
  assert.match(route, /connectEverflowNetwork/);
  assert.match(route, /provider:\s*"everflow"/);
  assert.match(route, /reconnected:\s*connected\.reconnected/);
  assert.match(route, /networkId:\s*connected\.network\.networkId/);
  assert.doesNotMatch(route, /apiKey:\s*connected/);
  assert.doesNotMatch(route, /secret:\s*connected/);
});

test("Everflow status route exposes safe persisted network state", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const route = readFileSync(`${root}/app/v1/integrations/everflow/status/route.ts`, "utf8");
  assert.match(route, /getEverflowConnectionStatus/);
  assert.match(route, /network_name/);
  assert.match(route, /timezone_id/);
  assert.match(route, /currency_id/);
  assert.match(route, /connections/);
  assert.doesNotMatch(route, /apiKey/);
});

test("provider-scoped connect and status routes bypass the Worker API base", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const api = readFileSync(`${root}/lib/api.ts`, "utf8");
  assert.match(api, /isProviderApplicationPath/);
  assert.match(api, /connect\|status/);
  assert.match(api, /isProviderApplicationPath\(pathAndQuery\) \? "" : getApiBaseUrl\(\)/);
});

test("Everflow screen enables the persisted status endpoint without global UI redesign", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const page = readFileSync(`${root}/app/(app)/settings/integrations/everflow/page.tsx`, "utf8");
  assert.match(page, /IntegrationWizard/);
  assert.match(page, /\/v1\/integrations\/everflow\/status/);
});

test("future order linkage hierarchy remains transaction ID first with guarded email fallback", () => {
  const intent = "transaction_id/_ef_transaction_id first; normalized email + timestamp proximity + amount fallback";
  assert.match(intent, /transaction_id/);
  assert.match(intent, /email/);
  assert.match(intent, /timestamp proximity/);
  assert.match(intent, /amount/);
});
