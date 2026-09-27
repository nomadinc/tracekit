import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { TIKTOK_MARKETING_API_VERSION } from "./tiktok-ads-contract";

export const TIKTOK_AUTH_BASE_URL = "https://business-api.tiktok.com";
export const TIKTOK_AUTHORIZATION_URL = "https://business-api.tiktok.com/portal/auth";
export const TIKTOK_TOKEN_URL = `${TIKTOK_AUTH_BASE_URL}/open_api/${TIKTOK_MARKETING_API_VERSION}/oauth2/access_token/`;
const STATE_TTL_SECONDS = 10 * 60;

type TikTokOAuthState = {
  v: 1;
  organizationId: string;
  accountId: string;
  userId: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
};

export class TikTokOAuthError extends Error {
  constructor(readonly code: string, message: string, readonly httpStatus = 400, readonly retryable = false) {
    super(message);
  }
}

function required(name: string) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new TikTokOAuthError("tiktok_configuration_unavailable", "TikTok connection configuration is unavailable.", 503, true);
  return value;
}

export function getTikTokConfiguration() {
  const appId = required("TIKTOK_BUSINESS_APP_ID");
  const appSecret = required("TIKTOK_BUSINESS_APP_SECRET");
  const redirectUri = required("TIKTOK_OAUTH_REDIRECT_URI");
  const stateSecret = required("TIKTOK_OAUTH_STATE_SECRET");
  let redirect: URL;
  try { redirect = new URL(redirectUri); } catch {
    throw new TikTokOAuthError("tiktok_configuration_unavailable", "TikTok connection configuration is unavailable.", 503, true);
  }
  if (redirect.protocol !== "https:" && redirect.hostname !== "localhost" && redirect.hostname !== "127.0.0.1") {
    throw new TikTokOAuthError("tiktok_configuration_unavailable", "TikTok connection configuration is unavailable.", 503, true);
  }
  if (stateSecret.length < 32) throw new TikTokOAuthError("tiktok_configuration_unavailable", "TikTok connection configuration is unavailable.", 503, true);
  return { appId, appSecret, redirectUri: redirect.toString(), stateSecret };
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createTikTokOAuthState(input: { organizationId: string; accountId: string; userId: string; now?: Date; nonce?: string }) {
  const { stateSecret } = getTikTokConfiguration();
  const now = Math.floor((input.now || new Date()).getTime() / 1000);
  const payload: TikTokOAuthState = {
    v: 1, organizationId: input.organizationId, accountId: input.accountId, userId: input.userId,
    nonce: input.nonce || randomBytes(18).toString("base64url"), issuedAt: now, expiresAt: now + STATE_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded, stateSecret)}`;
}

export function verifyTikTokOAuthState(state: string, expected: { organizationId: string; accountId: string; userId: string; now?: Date }) {
  const { stateSecret } = getTikTokConfiguration();
  const [encoded, supplied, extra] = String(state || "").split(".");
  if (!encoded || !supplied || extra) throw new TikTokOAuthError("tiktok_oauth_state_invalid", "TikTok authorization could not be verified.", 403);
  const signature = sign(encoded, stateSecret);
  const a = Buffer.from(supplied), b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new TikTokOAuthError("tiktok_oauth_state_invalid", "TikTok authorization could not be verified.", 403);
  let payload: TikTokOAuthState;
  try { payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); }
  catch { throw new TikTokOAuthError("tiktok_oauth_state_invalid", "TikTok authorization could not be verified.", 403); }
  const now = Math.floor((expected.now || new Date()).getTime() / 1000);
  if (payload.v !== 1 || payload.organizationId !== expected.organizationId || payload.accountId !== expected.accountId || payload.userId !== expected.userId || !payload.nonce || payload.expiresAt < now || payload.issuedAt > now + 60) {
    throw new TikTokOAuthError("tiktok_oauth_state_invalid", "TikTok authorization could not be verified.", 403);
  }
  return payload;
}

export function buildTikTokAuthorizationUrl(input: { organizationId: string; accountId: string; userId: string }) {
  const config = getTikTokConfiguration();
  const url = new URL(TIKTOK_AUTHORIZATION_URL);
  url.searchParams.set("app_id", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", createTikTokOAuthState(input));
  return url.toString();
}

export async function exchangeTikTokAuthorizationCode(code: string, fetchImpl: typeof fetch = fetch) {
  const config = getTikTokConfiguration();
  const authorizationCode = String(code || "").trim();
  if (!authorizationCode || authorizationCode.length > 4096) {
    throw new TikTokOAuthError("tiktok_authorization_code_invalid", "TikTok authorization code is invalid.");
  }
  const response = await fetchImpl(TIKTOK_TOKEN_URL, {
    method: "POST", cache: "no-store", headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ app_id: config.appId, secret: config.appSecret, auth_code: authorizationCode }),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, any>;
  const providerCode = Number(payload.code ?? -1);
  const data = payload.data && typeof payload.data === "object" ? payload.data as Record<string, any> : {};
  if (!response.ok || providerCode !== 0 || typeof data.access_token !== "string" || !data.access_token) {
    const retryable = response.status === 429 || response.status >= 500;
    const errorCode = response.status === 429 ? "tiktok_rate_limited" : response.status === 401 || response.status === 403 ? "tiktok_authentication_failed" : "tiktok_token_exchange_failed";
    throw new TikTokOAuthError(errorCode, "TikTok could not complete authorization.", response.status || 502, retryable);
  }
  return {
    accessToken: data.access_token as string,
    advertiserIds: Array.isArray(data.advertiser_ids) ? data.advertiser_ids.map((id: unknown) => String(id)) : [],
    scope: Array.isArray(data.scope) ? data.scope.map((value: unknown) => String(value)) : [],
  };
}
