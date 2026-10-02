import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  META_GRAPH_VERSION,
  MetaOAuthError,
  buildMetaAuthorizationUrl,
  createMetaOAuthState,
  discoverMetaAdAccounts,
  getMetaIdentity,
  verifyMetaOAuthState,
} from "../lib/integrations/meta-oauth";

const root = fileURLToPath(new URL("..", import.meta.url));
const ACCESS_TOKEN = "meta-test-token-never-log";

function configure() {
  process.env.META_APP_ID = "123456789";
  process.env.META_APP_SECRET = "test-app-secret";
  process.env.META_OAUTH_REDIRECT_URI = "https://tracekit.example/v1/integrations/meta/oauth/callback";
  process.env.META_OAUTH_STATE_SECRET = "0123456789abcdef0123456789abcdef";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("Meta adapter pins v26 and requests read-only ads permission by default", () => {
  configure();
  assert.equal(META_GRAPH_VERSION, "v26.0");
  const url = new URL(buildMetaAuthorizationUrl({ organizationId: "org-1", userId: "user-1" }));
  assert.equal(url.searchParams.get("scope"), "ads_read");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.has("client_secret"), false);
  assert.doesNotMatch(url.searchParams.get("scope") || "", /ads_management|business_management/);
});

test("OAuth state is signed, tenant/user bound, time bounded, and tamper evident", () => {
  configure();
  const now = new Date("2026-09-10T00:00:00.000Z");
  const state = createMetaOAuthState({ organizationId: "org-a", userId: "user-a", now, nonce: "fixed-nonce" });
  const payload = verifyMetaOAuthState(state, { organizationId: "org-a", userId: "user-a", now: new Date("2026-09-10T00:05:00.000Z") });
  assert.equal(payload.nonce, "fixed-nonce");
  assert.throws(() => verifyMetaOAuthState(state, { organizationId: "org-b", userId: "user-a", now }), (error: unknown) => error instanceof MetaOAuthError && error.code === "meta_oauth_state_invalid");
  assert.throws(() => verifyMetaOAuthState(state, { organizationId: "org-a", userId: "user-b", now }), (error: unknown) => error instanceof MetaOAuthError && error.code === "meta_oauth_state_invalid");
  assert.throws(() => verifyMetaOAuthState(`${state}x`, { organizationId: "org-a", userId: "user-a", now }), (error: unknown) => error instanceof MetaOAuthError && error.code === "meta_oauth_state_invalid");
  assert.throws(() => verifyMetaOAuthState(state, { organizationId: "org-a", userId: "user-a", now: new Date("2026-09-10T00:11:00.000Z") }), (error: unknown) => error instanceof MetaOAuthError && error.code === "meta_oauth_state_invalid");
});

test("Graph reads use bearer authorization and never place the access token in URLs", async () => {
  configure();
  let capturedUrl = "";
  let capturedAuth = "";
  const identity = await getMetaIdentity(ACCESS_TOKEN, async (url, init) => {
    capturedUrl = String(url);
    capturedAuth = String((init?.headers as Record<string, string> | undefined)?.Authorization || "");
    return json({ id: "42", name: "Meta User" });
  });
  assert.equal(identity.id, "42");
  assert.equal(capturedAuth, `Bearer ${ACCESS_TOKEN}`);
  assert.equal(capturedUrl.includes(ACCESS_TOKEN), false);
  assert.equal(capturedUrl.includes("access_token"), false);
});

test("ad-account discovery is cursor bounded, deduplicated, and preserves multiple accounts", async () => {
  configure();
  const urls: string[] = [];
  const auth: string[] = [];
  let calls = 0;
  const accounts = await discoverMetaAdAccounts(ACCESS_TOKEN, async (url, init) => {
    calls += 1;
    urls.push(String(url));
    auth.push(String((init?.headers as Record<string, string> | undefined)?.Authorization || ""));
    if (calls === 1) return json({
      data: [
        { id: "act_100", account_id: "100", name: "Brand A", account_status: 1, currency: "USD", timezone_name: "America/Los_Angeles", timezone_offset_hours_utc: -7 },
        { id: "act_200", account_id: "200", name: "Brand B", account_status: 1, currency: "USD", timezone_name: "America/New_York", timezone_offset_hours_utc: -4 },
      ],
      paging: { cursors: { after: "cursor-1" }, next: "https://graph.facebook.com/unsafe-provider-next-is-not-followed-directly" },
    });
    return json({
      data: [
        { id: "act_200", account_id: "200", name: "Brand B Updated", account_status: 1, currency: "USD", timezone_name: "America/New_York", timezone_offset_hours_utc: -4 },
        { id: "act_300", account_id: "300", name: "Brand C", account_status: 1, currency: "EUR", timezone_name: "Europe/Berlin", timezone_offset_hours_utc: 2 },
      ],
      paging: { cursors: {} },
    });
  });
  assert.equal(calls, 2);
  assert.deepEqual(accounts.map((account) => account.accountId), ["100", "200", "300"]);
  assert.equal(accounts.find((account) => account.accountId === "200")?.name, "Brand B Updated");
  assert.equal(urls[1].includes("after=cursor-1"), true);
  assert.equal(urls.every((url) => !url.includes(ACCESS_TOKEN) && !url.includes("access_token")), true);
  assert.equal(auth.every((value) => value === `Bearer ${ACCESS_TOKEN}`), true);
  assert.equal(urls.every((url) => !url.includes("business%7B") && !url.includes("business{")), true);
});

test("OAuth routes require connector management and bind callback to an HttpOnly state cookie", () => {
  const start = readFileSync(`${root}/app/v1/integrations/meta/oauth/start/route.ts`, "utf8");
  const callback = readFileSync(`${root}/app/v1/integrations/meta/oauth/callback/route.ts`, "utf8");
  assert.match(start, /effectivePermissions\.includes\("connectors\.manage"\)/);
  assert.match(start, /httpOnly:\s*true/);
  assert.match(start, /sameSite:\s*"lax"/);
  assert.match(start, /maxAge:\s*10 \* 60/);
  assert.match(callback, /effectivePermissions\.includes\("connectors\.manage"\)/);
  assert.match(callback, /state !== cookieState/);
  assert.match(callback, /maxAge:\s*0/);
  assert.doesNotMatch(callback, /accessToken|appSecret|client_secret/);
});

test("connection completion validates provider data before persistence and requires ads_read", () => {
  const source = readFileSync(`${root}/lib/integrations/meta-connection.ts`, "utf8");
  const token = source.indexOf("exchangeMetaAuthorizationCode");
  const identity = source.indexOf("getMetaIdentity", token);
  const discovery = source.indexOf("discoverMetaAdAccounts", token);
  const persist = source.indexOf("upsertMetaConnection", Math.max(identity, discovery));
  assert.ok(token >= 0 && identity > token && discovery > token && persist > identity && persist > discovery);
  assert.match(source, /META_REQUIRED_SCOPES\.filter/);
  assert.match(source, /meta_required_permission_missing/);
  assert.match(source, /status:\s*"degraded"/);
});

test("credentials are encrypted at connection scope and provider accounts default unselected", () => {
  const source = readFileSync(`${root}/lib/integrations/marketing-provider-repository.ts`, "utf8");
  assert.match(source, /MARKETING_CREDENTIALS_ENC_KEY/);
  assert.match(source, /encryptCommerceCredential\(input\.token\.accessToken/);
  assert.match(source, /credential_type:\s*"oauth_access_token"/);
  assert.match(source, /connection_id:\s*input\.connectionId/);
  assert.match(source, /selected_for_sync:\s*false/);
  assert.match(source, /new Map\(existingRows\.map/);
  assert.doesNotMatch(source, /access_token:\s*input\.token\.accessToken/);
});

test("account selection accepts many internal account IDs and never activates schedules", () => {
  const source = readFileSync(`${root}/lib/integrations/marketing-provider-repository.ts`, "utf8");
  const route = readFileSync(`${root}/app/v1/integrations/meta/accounts/route.ts`, "utf8");
  assert.match(source, /selectedAccountIds:\s*string\[\]/);
  assert.match(source, /selected_for_sync:\s*selected/);
  assert.match(source, /allowed\.has\(id\)/);
  assert.match(route, /sameOrigin\(request\)/);
  assert.match(route, /selectedAccountCount/);
  assert.match(route, /schedulesActivated:\s*false/);
  assert.doesNotMatch(source, /marketing_sync_schedules.*method:\s*"POST"/s);
});

test("status presentation is tenant scoped and returns no credential material", () => {
  const route = readFileSync(`${root}/app/v1/integrations/meta/status/route.ts`, "utf8");
  const connection = readFileSync(`${root}/lib/integrations/meta-connection.ts`, "utf8");
  assert.match(route, /getMetaConnectionPresentation/);
  assert.match(connection, /listMetaConnections\(organization\.id\)/);
  assert.match(connection, /selectedAccountCount/);
  assert.doesNotMatch(route, /accessToken|secret_ciphertext|client_secret/);
});
