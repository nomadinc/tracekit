import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { POST } from "../app/api/edge/intelligence-v1/route";

const migration = readFileSync(new URL("../../supabase/migrations/20261004040000_edge_intelligence_v1_delivery_credentials.sql", import.meta.url), "utf8");
const fixtures = JSON.parse(readFileSync(new URL("./fixtures/edge-intelligence-v1.examples.json", import.meta.url), "utf8"));
const validPayload = () => structuredClone(fixtures.scenarios.normalResidential);
const token = "ws023_edge_test_credential_0123456789abcdef";
const tokenHash = createHash("sha256").update(token).digest("hex");

function request(payload: unknown, bearerToken = token) {
  return new Request("https://tracekit.example.test/api/edge/intelligence-v1", {
    method: "POST",
    headers: {"content-type": "application/json", authorization: `Bearer ${bearerToken}`},
    body: JSON.stringify(payload),
  });
}
function json(body: unknown, status = 200) {
  return Response.json(body, {status});
}
async function withMockedDelivery<T>(
  handler: (url: string, init: RequestInit) => Promise<Response>,
  run: (logs: unknown[][]) => Promise<T>
): Promise<T> {
  const priorFetch = globalThis.fetch;
  const priorLog = console.error;
  const priorUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const priorKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const logs: unknown[][] = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "ws023-test-only-service-role";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init ?? {})) as typeof fetch;
  console.error = (...args: unknown[]) => { logs.push(args); };
  try {
    return await run(logs);
  } finally {
    globalThis.fetch = priorFetch;
    console.error = priorLog;
    if (priorUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = priorUrl;
    if (priorKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = priorKey;
  }
}

test("Edge delivery credentials store hashes only and are organization/tenant scoped", () => {
  assert.match(migration, /organization_id uuid not null references public\.tracekit_organizations/);
  assert.match(migration, /tenant_ref text not null/);
  assert.match(migration, /token_hash text not null unique/);
  assert.doesNotMatch(migration, /raw_token|bearer_token|secret text/i);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /grant select,insert,update,delete .* service_role/);
});

test("invalid bearer is rejected before persistence and never reflected", async () => {
  let calls = 0;
  await withMockedDelivery(async () => {calls++; throw new Error("should not fetch");}, async () => {
    const secret = "short-token";
    const response = await POST(request(validPayload(), secret));
    assert.equal(response.status, 401);
    const body = await response.text();
    assert.deepEqual(JSON.parse(body), {ok:false, code:"unauthorized"});
    assert.doesNotMatch(body, /short-token|token_hash|service.role/i);
    assert.equal(calls, 0);
  });
});

test("persistence failure returns sanitized classification, not provider response", async () => {
  await withMockedDelivery(async () => json({message:"secret provider persistence response"}, 503), async () => {
    const response = await POST(request(validPayload()));
    assert.equal(response.status, 503);
    const body = await response.text();
    assert.deepEqual(JSON.parse(body), {ok:false, code:"delivery_unavailable"});
    assert.doesNotMatch(body, /secret|persistence_failed|token_hash|service.role/i);
  });
});

test("unexpected persistence exception is redacted from HTTP response and logs", async () => {
  const sensitive = "ws023_sensitive_exception_credential";
  await withMockedDelivery(async () => {throw new Error(sensitive);}, async logs => {
    const response = await POST(request(validPayload()));
    assert.equal(response.status, 503);
    const body = await response.text();
    assert.deepEqual(JSON.parse(body), {ok:false, code:"delivery_unavailable"});
    assert.doesNotMatch(body, new RegExp(sensitive));
    assert.doesNotMatch(JSON.stringify(logs), new RegExp(sensitive));
  });
});

test("Model B denies a valid credential used for another active tenant before ingestion", async () => {
  const foreign = validPayload();
  foreign.tenantRef = "tenant_fixture_b";
  let ingestions = 0;
  await withMockedDelivery(async (url) => {
    if (url.includes("edge_intelligence_service_credentials?"))
      return json([{id:"credential-a",token_hash:tokenHash,tenant_ref:"tenant_fixture_a",organization_id:"org-a"}]);
    if (url.includes("edge_intelligence_tenant_bindings?"))
      return json([{tenant_ref:"tenant_fixture_b",organization_id:"org-b"}]);
    if (url.includes("rpc/ingest_edge_intelligence_v1")) {
      ingestions++;
      return json({outcome:"accepted",revision:1,currentRevision:1});
    }
    return json(null);
  }, async () => {
    const response = await POST(request(foreign));
    assert.equal(response.status, 403, "Model B must reject credential-to-tenant mismatch");
    assert.equal(ingestions, 0, "Foreign-tenant payload must never reach ingestion RPC");
  });
});
