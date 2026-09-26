import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  BLACKBOX_LIFECYCLE_DIAGNOSTIC_REQUEST,
  handleBlackboxLifecycleDiagnosticProxy,
  type LifecycleDiagnosticProxyDependencies,
} from "../lib/gateway-classic/lifecycle-diagnostic-server.ts";

const routeUrl = "https://app.trace-kit.io/api/gateway-classic/lifecycle-diagnostic";

function request(body: unknown = BLACKBOX_LIFECYCLE_DIAGNOSTIC_REQUEST, init: RequestInit = {}) {
  return new Request(routeUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    ...init,
  });
}

function dependencies(overrides: Partial<LifecycleDiagnosticProxyDependencies> = {}): LifecycleDiagnosticProxyDependencies {
  return {
    authorize: async () => ({ kind: "authorized", organizationId: "internal-operator-org" }),
    apiBaseUrl: "https://api.trace-kit.io",
    adminSecret: "server-secret-value",
    fetchImpl: async () => Response.json({ ok: true, reused: false, job: { id: 1234, status: "running" } }, { status: 202 }),
    ...overrides,
  };
}

test("authentication, active organization, and connectors.manage authorization fail closed", async () => {
  let fetched = false;
  for (const kind of ["unauthenticated", "no_active_organization", "forbidden"] as const) {
    const response = await handleBlackboxLifecycleDiagnosticProxy(request(), dependencies({
      authorize: async () => ({ kind }),
      fetchImpl: async () => { fetched = true; return Response.json({ ok: true }); },
    }));
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { ok: false, error: "resource_unavailable" });
  }
  assert.equal(fetched, false);
});

test("cross-origin, non-POST, and query-bearing requests are rejected before upstream access", async () => {
  let fetched = false;
  const deps = dependencies({ fetchImpl: async () => { fetched = true; return Response.json({ ok: true }); } });
  assert.equal((await handleBlackboxLifecycleDiagnosticProxy(request(undefined, {
    headers: { origin: "https://attacker.example", "sec-fetch-site": "cross-site" },
  }), deps)).status, 403);
  assert.equal((await handleBlackboxLifecycleDiagnosticProxy(new Request(routeUrl, { method: "GET" }), deps)).status, 405);
  assert.equal((await handleBlackboxLifecycleDiagnosticProxy(new Request(`${routeUrl}?upstream=/admin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(BLACKBOX_LIFECYCLE_DIAGNOSTIC_REQUEST),
  }), deps)).status, 400);
  assert.equal(fetched, false);
});

test("only the exact approved request reaches the fixed Worker endpoint with server authentication", async () => {
  let observedUrl = "";
  let observedSecret = "";
  let observedBody: unknown;
  let observedCache: RequestCache | undefined;
  const response = await handleBlackboxLifecycleDiagnosticProxy(request(), dependencies({
    fetchImpl: async (input, init) => {
      observedUrl = String(input);
      observedSecret = new Headers(init?.headers).get("x-tk-secret") || "";
      observedBody = JSON.parse(String(init?.body));
      observedCache = init?.cache;
      return Response.json({
        ok: true,
        reused: false,
        job: { id: 9876, status: "running", progress: { raw_xml: "hidden" } },
        raw_xml: "hidden",
        customer_email: "hidden@example.test",
        cc_number: "4111111111111111",
        password_ciphertext: "hidden",
        x_tk_secret: "hidden",
      }, { status: 202 });
    },
  }));
  assert.equal(observedUrl, "https://api.trace-kit.io/v1/chargebacks/backfill");
  assert.equal(observedSecret, "server-secret-value");
  assert.equal(observedCache, "no-store");
  assert.deepEqual(observedBody, BLACKBOX_LIFECYCLE_DIAGNOSTIC_REQUEST);
  assert.deepEqual(await response.json(), {
    ok: true,
    status: 202,
    reused: false,
    job_id: "9876",
    job_status: "running",
    platform: "nmi:blackboxproducts0362",
    from: "2026-05-01",
    to: "2026-05-01",
    dry_run: true,
    gateway_page_size: 25,
    gateway_max_pages: 1,
  });
});

test("almost-correct, incomplete, expanded, or differently typed contracts are rejected", async () => {
  const approved = { ...BLACKBOX_LIFECYCLE_DIAGNOSTIC_REQUEST, platforms: [...BLACKBOX_LIFECYCLE_DIAGNOSTIC_REQUEST.platforms] };
  const invalid = [
    { ...approved, extra: true },
    Object.fromEntries(Object.entries(approved).filter(([key]) => key !== "force_new_job")),
    { ...approved, workspace_id: "other" },
    { ...approved, platforms: ["nmi:thermostorm"] },
    { ...approved, platforms: ["nmi:blackboxproducts0362", "nmi:thermostorm"] },
    { ...approved, from: "2026-04-30" },
    { ...approved, to: "2026-05-02" },
    { ...approved, gateway_page_size: 24 },
    { ...approved, gateway_max_pages: 2 },
    { ...approved, dry_run: false },
    { ...approved, force_new_job: false },
    { ...approved, force_new_job: "true" },
  ];
  let fetched = false;
  for (const body of invalid) {
    const response = await handleBlackboxLifecycleDiagnosticProxy(request(body), dependencies({
      fetchImpl: async () => { fetched = true; return Response.json({ ok: true }); },
    }));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { ok: false, error: "approved_contract_required" });
  }
  assert.equal(fetched, false);
});

test("unavailable configuration and upstream failures are sanitized", async () => {
  assert.equal((await handleBlackboxLifecycleDiagnosticProxy(request(), dependencies({ adminSecret: "" }))).status, 503);
  const failed = await handleBlackboxLifecycleDiagnosticProxy(request(), dependencies({
    fetchImpl: async () => Response.json({
      ok: false,
      error: "provider leaked details",
      raw_xml: "<customer>hidden</customer>",
      security_key: "hidden",
    }, { status: 502 }),
  }));
  assert.equal(failed.status, 502);
  assert.deepEqual(await failed.json(), {
    ok: false,
    status: 502,
    error: "diagnostic_start_failed",
    message: "The bounded lifecycle diagnostic could not be started.",
  });
});

test("source boundaries preserve the generic proxy and prohibit financial writes or client secrets", () => {
  const route = readFileSync(new URL("../app/api/gateway-classic/lifecycle-diagnostic/route.ts", import.meta.url), "utf8");
  const server = readFileSync(new URL("../lib/gateway-classic/lifecycle-diagnostic-server.ts", import.meta.url), "utf8");
  const generic = readFileSync(new URL("../lib/gateway-classic/server-proxy.ts", import.meta.url), "utf8");
  assert.match(route, /resolveApplicationSession\(\)/);
  assert.match(route, /activeOrganization/);
  assert.match(route, /requirePermission\(resolution\.session, "connectors\.manage"\)/);
  assert.match(route, /process\.env\.TK_SECRET_KEY/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_TK_SECRET_KEY|localStorage|console\.(log|error)/);
  assert.match(server, /\/v1\/chargebacks\/backfill/);
  assert.doesNotMatch(server, /body\.(?:path|url|upstream)|raw_xml|customer_email|cc_number|password_ciphertext/);
  assert.doesNotMatch(`${route}\n${server}`, /\.insert\(|\.upsert\(|\.update\(|\.delete\(|financial_event|commerce_refund_events|chargebacks.*insert|integrations_settings|sync_schedules/);
  assert.doesNotMatch(generic, /lifecycle-diagnostic|\/v1\/chargebacks\/backfill/);
});
