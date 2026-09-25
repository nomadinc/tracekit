import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { handleGatewayClassicProxy, type GatewayClassicProxyDependencies } from "../lib/gateway-classic/server-proxy.ts";

function request(operation: string, init: RequestInit = {}) {
  return new Request(`https://trace-kit.io/api/gateway-classic/${operation}`, init);
}

function dependencies(overrides: Partial<GatewayClassicProxyDependencies> = {}): GatewayClassicProxyDependencies {
  return {
    authorize: async () => ({ kind: "authorized", organizationId: "org-persistent-1" }),
    apiBaseUrl: "https://api.trace-kit.io",
    adminSecret: "server-secret-value",
    fetchImpl: async () => Response.json({ ok: true, accounts: [] }),
    ...overrides,
  };
}

test("proxy rejects unauthenticated and unauthorized persistent sessions before upstream access", async () => {
  let fetched = false;
  const fetchImpl = async () => { fetched = true; return Response.json({ ok: true }); };
  for (const kind of ["unauthenticated", "forbidden"] as const) {
    const response = await handleGatewayClassicProxy(request("list"), "list", dependencies({
      authorize: async () => ({ kind }),
      fetchImpl,
    }));
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error, "resource_unavailable");
  }
  assert.equal(fetched, false);
});

test("authorized list request uses only the fixed upstream path and injects the server secret", async () => {
  let observedUrl = "";
  let observedSecret = "";
  const response = await handleGatewayClassicProxy(request("list"), "list", dependencies({
    fetchImpl: async (input, init) => {
      observedUrl = String(input);
      observedSecret = new Headers(init?.headers).get("x-tk-secret") || "";
      return Response.json({
        ok: true,
        accounts: [{ platform: "nmi:test", base_url: "https://nmi.example", username: "api_key", created_at: null, updated_at: null, password_ciphertext: "never-return" }],
        x_tk_secret: "never-return",
      });
    },
  }));
  assert.equal(response.status, 200);
  assert.equal(observedUrl, "https://api.trace-kit.io/v1/integrations/gateway-classic/list");
  assert.equal(observedSecret, "server-secret-value");
  const body = JSON.stringify(await response.json());
  assert.doesNotMatch(body, /server-secret-value|never-return|x-tk-secret|password_ciphertext/);
});

test("proxy rejects arbitrary operations, query injection, tenant overrides, and malformed imports", async () => {
  let fetched = false;
  const deps = dependencies({ fetchImpl: async () => { fetched = true; return Response.json({ ok: true }); } });
  assert.equal((await handleGatewayClassicProxy(request("delete-all"), "delete-all", deps)).status, 404);
  assert.equal((await handleGatewayClassicProxy(new Request("https://trace-kit.io/api/gateway-classic/list?upstream=/admin"), "list", deps)).status, 400);

  const invalidBodies = [
    { platform: "nmi:test", from: "2026-02-30", to: "2026-02-30", page: 0, pageSize: 25 },
    { platform: "other:test", from: "2026-01-01", to: "2026-01-01", page: 0, pageSize: 25 },
    { platform: "nmi:test", from: "2026-01-02", to: "2026-01-01", page: 0, pageSize: 25 },
    { platform: "nmi:test", from: "2026-01-01", to: "2026-01-01", page: -1, pageSize: 25 },
    { platform: "nmi:test", from: "2026-01-01", to: "2026-01-01", page: 0, pageSize: 1001 },
    { platform: "nmi:test", from: "2026-01-01", to: "2026-01-01", page: 0, pageSize: 25, organization_id: "attacker-org" },
    { platform: "nmi:test", from: "2026-01-01", to: "2026-01-01", page: 0, pageSize: 25, workspace_id: "attacker-workspace" },
  ];
  for (const body of invalidBodies) {
    const response = await handleGatewayClassicProxy(request("import-one-page", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }), "import-one-page", deps);
    assert.equal(response.status, 400);
  }
  assert.equal(fetched, false);
});

test("authorized import preserves the bounded contract and sanitizes the upstream result", async () => {
  let forwarded: Record<string, unknown> = {};
  const response = await handleGatewayClassicProxy(request("import-one-page", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ platform: "NMI:Test", from: "2026-01-19", to: "2026-01-19", page: 0, pageSize: 25 }),
  }), "import-one-page", dependencies({
    fetchImpl: async (_input, init) => {
      forwarded = JSON.parse(String(init?.body));
      return Response.json({ ok: true, platform: "nmi:test", connector: "classic_query", from: "2026-01-19", to: "2026-01-19", fetched: 2, upserted: 2, page: 0, pageSize: 25, hasMore: false, nextPage: null, internal: "hidden" });
    },
  }));
  assert.deepEqual(forwarded, { platform: "nmi:test", from: "2026-01-19", to: "2026-01-19", page: 0, pageSize: 25 });
  assert.deepEqual(await response.json(), { ok: true, platform: "nmi:test", connector: "classic_query", from: "2026-01-19", to: "2026-01-19", fetched: 2, upserted: 2, page: 0, pageSize: 25, hasMore: false, nextPage: null, latest_source_event_at: null });
});

test("status is available through the same fixed proxy boundary and unsafe upstream errors are sanitized", async () => {
  let observedUrl = "";
  const statusResponse = await handleGatewayClassicProxy(
    new Request("https://trace-kit.io/api/gateway-classic/status?platform=nmi%3Atest"),
    "status",
    dependencies({
      fetchImpl: async (input) => {
        observedUrl = String(input);
        return Response.json({ ok: true, connected: true, platform: "nmi:test", baseUrl: "https://nmi.example", username: "api_key", password_ciphertext: "hidden" });
      },
    }),
  );
  assert.equal(observedUrl, "https://api.trace-kit.io/v1/integrations/gateway-classic/status?platform=nmi%3Atest");
  assert.doesNotMatch(JSON.stringify(await statusResponse.json()), /password_ciphertext|hidden/);

  const failed = await handleGatewayClassicProxy(request("list"), "list", dependencies({
    fetchImpl: async () => Response.json({ ok: false, error: "provider error with spaces", message: "sensitive upstream detail", secret: "hidden" }, { status: 502 }),
  }));
  assert.equal(failed.status, 502);
  assert.deepEqual(await failed.json(), { ok: false, error: "provider_error_with_spaces", message: "Gateway Classic request failed." });
});

test("cross-origin browser requests are rejected before authorization", async () => {
  let authorized = false;
  const response = await handleGatewayClassicProxy(new Request("https://trace-kit.io/api/gateway-classic/list", {
    headers: { origin: "https://attacker.example", "sec-fetch-site": "cross-site" },
  }), "list", dependencies({ authorize: async () => { authorized = true; return { kind: "authorized", organizationId: "org" }; } }));
  assert.equal(response.status, 403);
  assert.equal(authorized, false);
});

test("Gateway Wizard uses only the narrow application proxy and its client boundary contains no admin secret reference", () => {
  const wizard = readFileSync(new URL("../app/(app)/settings/integrations/gateway-wizard/page.tsx", import.meta.url), "utf8");
  const client = readFileSync(new URL("../lib/gateway-classic/client.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/gateway-classic/[operation]/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(wizard, /\/v1\/integrations\/gateway-classic\/(?:list|status|import-one-page)/);
  assert.match(client, /\/api\/gateway-classic\/list/);
  assert.match(client, /\/api\/gateway-classic\/import-one-page/);
  assert.doesNotMatch(`${wizard}\n${client}`, /TK_SECRET_KEY|x-tk-secret|server-proxy/);
  assert.match(route, /resolveApplicationSession\(\)/);
  assert.match(route, /activeOrganization/);
  assert.match(route, /requirePermission\(resolution\.session, "organizations\.manage"\)/);
  assert.match(route, /process\.env\.TK_SECRET_KEY/);
});
