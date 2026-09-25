import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { adminAuthError } from "./admin-auth.ts";

const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const ADMIN_SECRET = "test-admin-secret";

function routeSource(path: string, nextPath: string) {
  const start = source.indexOf(path);
  const end = source.indexOf(nextPath, start + path.length);
  assert.ok(start >= 0 && end > start, `route source not found: ${path}`);
  return source.slice(start, end);
}

test("admin authentication behavior rejects missing/invalid credentials and accepts existing header forms", async () => {
  for (const headers of [{}, { "x-tk-secret": "invalid" }, { authorization: "Bearer invalid" }]) {
    const denied = adminAuthError(new Request("https://api.trace-kit.io/", { headers }), { TK_SECRET_KEY: ADMIN_SECRET });
    assert.ok(denied);
    assert.equal(denied.status, 401);
    assert.equal((await denied.json()).error, "unauthorized");
  }
  assert.equal(adminAuthError(new Request("https://api.trace-kit.io/", { headers: { "x-tk-secret": ADMIN_SECRET } }), { TK_SECRET_KEY: ADMIN_SECRET }), null);
  assert.equal(adminAuthError(new Request("https://api.trace-kit.io/", { headers: { authorization: `Bearer ${ADMIN_SECRET}` } }), { TK_SECRET_KEY: ADMIN_SECRET }), null);
  const unconfigured = adminAuthError(new Request("https://api.trace-kit.io/"), {});
  assert.ok(unconfigured);
  assert.equal(unconfigured.status, 500);
});

test("Gateway Classic list, status, and import independently authenticate before handler work", () => {
  const importRoute = routeSource('/v1/integrations/gateway-classic/import-one-page', '/v1/integrations/gateway-classic/status');
  const statusRoute = routeSource('/v1/integrations/gateway-classic/status', '/v1/integrations/gateway-classic/list');
  const listRoute = routeSource('/v1/integrations/gateway-classic/list', '/v1/integrations/wowboost/import-one-page');
  for (const [route, firstWork] of [
    [importRoute, "readJsonBody(req)"],
    [statusRoute, "new URL(req.url)"],
    [listRoute, "getSupabase(env)"],
  ] as const) {
    const auth = route.indexOf("adminAuthError(req, env)");
    assert.ok(auth >= 0);
    assert.ok(auth < route.indexOf(firstWork));
    assert.match(route.slice(auth, route.indexOf(firstWork)), /if \(auth\) return auth/);
  }
  assert.match(importRoute, /runGatewayClassicImportPage\(env, \{ platform, from, to, page, pageSize \}\)/);
});

test("Gateway Classic authorization is independent of the maintenance gate", () => {
  const fetchStart = source.indexOf("async fetch(req: Request");
  const routerCall = source.indexOf("return await router(req, env)", fetchStart);
  assert.ok(fetchStart >= 0 && routerCall > fetchStart);
  assert.match(source.slice(fetchStart, routerCall), /maintenanceWriteAllowed\(env, maintenanceClass\)/);
  for (const path of [
    '/v1/integrations/gateway-classic/import-one-page',
    '/v1/integrations/gateway-classic/status',
    '/v1/integrations/gateway-classic/list',
  ]) {
    const start = source.indexOf(path);
    assert.ok(source.indexOf("adminAuthError(req, env)", start) > start);
  }
});

test("NMI credential, Classic Query, normalization, identity, and scheduler behavior are unchanged", () => {
  const start = source.indexOf("async function runGatewayClassicImportPage");
  const end = source.indexOf("async function rebuildCustomerProfiles", start);
  const runtime = source.slice(start, end);
  assert.match(runtime, /getLatestCredential\(env, platform\)/);
  assert.match(runtime, /decryptSecretFromCredRow\(env, creds as any\)/);
  assert.match(runtime, /`\$\{baseUrl\}\/api\/query\.php`/);
  for (const field of ["security_key", "start_date", "end_date", "result_limit", "page_number", "result_order", "condition"]) {
    assert.match(runtime, new RegExp(`form\\.set\\("${field}"`));
  }
  assert.match(runtime, /platform_order_id: `\$\{platform\}:\$\{id\}`/);
  assert.match(runtime, /\.upsert\(deduped as any\[\], \{ onConflict: "platform_order_id" \}\)/);
  assert.doesNotMatch(runtime, /integrations_settings|auto_import|scheduler|chargeback/);
});
