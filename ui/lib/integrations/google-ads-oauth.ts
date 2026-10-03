import { createHmac, timingSafeEqual } from "node:crypto";

export const GOOGLE_ADS_API_VERSION = "v25";
export const GOOGLE_ADS_OAUTH_SCOPE = "https://www.googleapis.com/auth/adwords";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

type StatePayload = {
  organizationId: string;
  accountId: string;
  setupRequestId: string;
  returnPath: string;
  issuedAtMs: number;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}
function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}
function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createGoogleOAuthState(payload: StatePayload, secret: string) {
  if (secret.length < 32) throw new Error("Google OAuth state secret is unavailable.");
  const body = encode(JSON.stringify(payload));
  return `${body}.${signature(body, secret)}`;
}

export function verifyGoogleOAuthState(state: string, secret: string, options: { nowMs?: number; maxAgeMs?: number } = {}) {
  const [body, supplied, extra] = String(state || "").split(".");
  if (!body || !supplied || extra) throw new Error("Invalid Google OAuth state.");
  const expected = signature(body, secret);
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Invalid Google OAuth state.");
  const payload = JSON.parse(decode(body)) as StatePayload;
  if (!payload.organizationId || !payload.accountId || !payload.setupRequestId || !payload.returnPath || !Number.isFinite(payload.issuedAtMs)) {
    throw new Error("Invalid Google OAuth state.");
  }
  const now = options.nowMs ?? Date.now();
  const maxAge = options.maxAgeMs ?? 10 * 60 * 1000;
  if (payload.issuedAtMs > now + 30_000 || now - payload.issuedAtMs > maxAge) throw new Error("Expired Google OAuth state.");
  return payload;
}

export function buildGoogleAuthorizationUrl(input: { clientId: string; redirectUri: string; state: string }) {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_ADS_OAUTH_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", input.state);
  return url.toString();
}

async function tokenRequest(body: URLSearchParams, fetcher: typeof fetch) {
  const response = await fetcher(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as TokenResponse;
  if (!response.ok || payload.error || !payload.access_token) {
    const code = String(payload.error || "google_oauth_exchange_failed").replace(/[^a-z0-9_.-]/gi, "_");
    throw new Error(code);
  }
  return payload;
}

export async function exchangeGoogleAuthorizationCode(input: { code: string; clientId: string; clientSecret: string; redirectUri: string; fetcher?: typeof fetch }) {
  const payload = await tokenRequest(new URLSearchParams({
    code: input.code,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
  }), input.fetcher || fetch);
  if (!payload.refresh_token) throw new Error("Google OAuth refresh token was not returned.");
  return {
    accessToken: payload.access_token!,
    refreshToken: payload.refresh_token,
    expiresIn: Number(payload.expires_in || 0),
    scope: String(payload.scope || ""),
    tokenType: String(payload.token_type || "Bearer"),
  };
}

export async function refreshGoogleAccessToken(input: { refreshToken: string; clientId: string; clientSecret: string; fetcher?: typeof fetch }) {
  const payload = await tokenRequest(new URLSearchParams({
    refresh_token: input.refreshToken,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    grant_type: "refresh_token",
  }), input.fetcher || fetch);
  return {
    accessToken: payload.access_token!,
    expiresIn: Number(payload.expires_in || 0),
    scope: String(payload.scope || ""),
    tokenType: String(payload.token_type || "Bearer"),
  };
}
