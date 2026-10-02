import assert from "node:assert/strict";
import test from "node:test";
import {
  GOOGLE_ADS_API_VERSION,
  GOOGLE_ADS_OAUTH_SCOPE,
  buildGoogleAuthorizationUrl,
  createGoogleOAuthState,
  verifyGoogleOAuthState,
  exchangeGoogleAuthorizationCode,
  refreshGoogleAccessToken,
} from "../lib/integrations/google-ads-oauth";
import { listGoogleAccessibleCustomers } from "../lib/integrations/google-ads-client";

const secret = "test-state-secret-at-least-32-characters";

test("Google Ads OAuth requests restricted adwords scope and offline consent", () => {
  const url = new URL(buildGoogleAuthorizationUrl({
    clientId: "client-id",
    redirectUri: "https://tracekit.example/callback",
    state: "signed-state",
  }));
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("scope"), GOOGLE_ADS_OAUTH_SCOPE);
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("include_granted_scopes"), "true");
  assert.equal(url.searchParams.get("state"), "signed-state");
});

test("OAuth state is signed, scoped to organization and single setup request, and expires", () => {
  const state = createGoogleOAuthState({
    organizationId: "org-1",
    accountId: "acct-1",
    setupRequestId: "setup-1",
    returnPath: "/connections",
    issuedAtMs: 1_000,
  }, secret);
  const verified = verifyGoogleOAuthState(state, secret, { nowMs: 1_500, maxAgeMs: 1_000 });
  assert.equal(verified.organizationId, "org-1");
  assert.equal(verified.setupRequestId, "setup-1");
  assert.throws(() => verifyGoogleOAuthState(state + "x", secret, { nowMs: 1_500, maxAgeMs: 1_000 }));
  assert.throws(() => verifyGoogleOAuthState(state, secret, { nowMs: 3_000, maxAgeMs: 1_000 }));
});

test("authorization-code exchange requires a refresh token for a new durable connection", async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({
    access_token: "access",
    expires_in: 3600,
    scope: GOOGLE_ADS_OAUTH_SCOPE,
    token_type: "Bearer",
  }), { status: 200, headers: { "content-type": "application/json" } });
  await assert.rejects(() => exchangeGoogleAuthorizationCode({
    code: "code",
    clientId: "client",
    clientSecret: "secret",
    redirectUri: "https://tracekit.example/callback",
    fetcher,
  }), /refresh token/i);
});

test("refresh token exchange returns short-lived access token without mutating stored refresh token", async () => {
  const fetcher: typeof fetch = async (_url, init) => {
    assert.match(String(init?.body), /grant_type=refresh_token/);
    return new Response(JSON.stringify({
      access_token: "access-2",
      expires_in: 3600,
      scope: GOOGLE_ADS_OAUTH_SCOPE,
      token_type: "Bearer",
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const token = await refreshGoogleAccessToken({ refreshToken: "refresh-1", clientId: "client", clientSecret: "secret", fetcher });
  assert.equal(token.accessToken, "access-2");
  assert.equal(token.expiresIn, 3600);
});

test("ListAccessibleCustomers uses v25 bearer auth and never sends login-customer-id", async () => {
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(String(url), `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Bearer access");
    assert.equal(headers.get("login-customer-id"), null);
    return new Response(JSON.stringify({ resourceNames: ["customers/1234567890", "customers/2223334445"] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const ids = await listGoogleAccessibleCustomers({ accessToken: "access", fetcher });
  assert.deepEqual(ids, ["1234567890", "2223334445"]);
});
