import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const META_GRAPH_VERSION = "v26.0";
export const META_OAUTH_DIALOG_URL = `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`;
export const META_GRAPH_BASE_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
export const META_REQUIRED_SCOPES = ["ads_read"] as const;
export const META_OPTIONAL_SCOPES = ["business_management"] as const;
const STATE_TTL_SECONDS = 10 * 60;
const MAX_ACCOUNT_PAGES = 10;
const ACCOUNT_PAGE_SIZE = 100;

type MetaOAuthStatePayload = {
  v: 1;
  organizationId: string;
  userId: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
};

export type MetaToken = { accessToken: string; tokenType: string | null; expiresIn: number | null };
export type MetaIdentity = { id: string; name: string | null };
export type MetaAdAccount = {
  id: string;
  accountId: string;
  name: string | null;
  accountStatus: number | null;
  currency: string | null;
  timezoneName: string | null;
  timezoneOffsetHoursUtc: number | null;
  business: { id: string; name: string | null } | null;
};

export class MetaOAuthError extends Error {
  constructor(readonly code: string, message: string, readonly httpStatus = 400, readonly retryable = false) { super(message); }
}

function required(name: string) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new MetaOAuthError("meta_configuration_unavailable", "Meta connection configuration is unavailable.", 503, true);
  return value;
}

export function getMetaConfiguration() {
  const appId = required("META_APP_ID");
  const appSecret = required("META_APP_SECRET");
  const redirectUri = required("META_OAUTH_REDIRECT_URI");
  const stateSecret = required("META_OAUTH_STATE_SECRET");
  let redirect: URL;
  try { redirect = new URL(redirectUri); }
  catch { throw new MetaOAuthError("meta_configuration_unavailable", "Meta connection configuration is unavailable.", 503, true); }
  if (redirect.protocol !== "https:" && redirect.hostname !== "localhost" && redirect.hostname !== "127.0.0.1") throw new MetaOAuthError("meta_configuration_unavailable", "Meta connection configuration is unavailable.", 503, true);
  if (stateSecret.length < 32) throw new MetaOAuthError("meta_configuration_unavailable", "Meta connection configuration is unavailable.", 503, true);
  return { appId, appSecret, redirectUri: redirect.toString(), stateSecret };
}

function signature(payload: string, secret: string) { return createHmac("sha256", secret).update(payload).digest("base64url"); }

export function createMetaOAuthState(input: { organizationId: string; userId: string; now?: Date; nonce?: string }) {
  const { stateSecret } = getMetaConfiguration();
  const now = Math.floor((input.now || new Date()).getTime() / 1000);
  const payload: MetaOAuthStatePayload = { v: 1, organizationId: input.organizationId, userId: input.userId, nonce: input.nonce || randomBytes(18).toString("base64url"), issuedAt: now, expiresAt: now + STATE_TTL_SECONDS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded, stateSecret)}`;
}

export function verifyMetaOAuthState(state: string, input: { organizationId: string; userId: string; now?: Date }) {
  const { stateSecret } = getMetaConfiguration();
  const [encoded, supplied] = String(state || "").split(".");
  if (!encoded || !supplied) throw new MetaOAuthError("meta_oauth_state_invalid", "Meta authorization could not be verified.", 403);
  const expected = signature(encoded, stateSecret);
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new MetaOAuthError("meta_oauth_state_invalid", "Meta authorization could not be verified.", 403);
  let payload: MetaOAuthStatePayload;
  try { payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); }
  catch { throw new MetaOAuthError("meta_oauth_state_invalid", "Meta authorization could not be verified.", 403); }
  const now = Math.floor((input.now || new Date()).getTime() / 1000);
  if (payload.v !== 1 || payload.organizationId !== input.organizationId || payload.userId !== input.userId || !payload.nonce || payload.expiresAt < now || payload.issuedAt > now + 60) throw new MetaOAuthError("meta_oauth_state_invalid", "Meta authorization could not be verified.", 403);
  return payload;
}

export function buildMetaAuthorizationUrl(input: { organizationId: string; userId: string }) {
  const config = getMetaConfiguration();
  const url = new URL(META_OAUTH_DIALOG_URL);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", createMetaOAuthState(input));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", META_REQUIRED_SCOPES.join(","));
  return url.toString();
}

async function graphJson(url: URL, init: RequestInit, fetchImpl: typeof fetch, accessToken?: string) {
  const response = await fetchImpl(url, { ...init, cache: "no-store", headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...(init.headers || {}) } });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    const code = response.status === 401 || response.status === 403 ? "meta_authentication_failed" : response.status === 429 ? "meta_rate_limited" : "meta_provider_request_failed";
    throw new MetaOAuthError(code, "Meta could not complete the requested operation.", response.status, retryable);
  }
  return body;
}

export async function exchangeMetaAuthorizationCode(code: string, fetchImpl: typeof fetch = fetch): Promise<MetaToken> {
  const config = getMetaConfiguration();
  if (!code || code.length > 2048) throw new MetaOAuthError("meta_authorization_code_invalid", "Meta authorization code is invalid.");
  const url = new URL(`${META_GRAPH_BASE_URL}/oauth/access_token`);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("client_secret", config.appSecret);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("code", code);
  const body = await graphJson(url, { method: "GET" }, fetchImpl);
  const accessToken = typeof body.access_token === "string" ? body.access_token : "";
  if (!accessToken) throw new MetaOAuthError("meta_token_exchange_failed", "Meta did not return a usable access token.", 502, true);
  return { accessToken, tokenType: typeof body.token_type === "string" ? body.token_type : null, expiresIn: Number.isFinite(Number(body.expires_in)) ? Number(body.expires_in) : null };
}

export async function getMetaIdentity(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<MetaIdentity> {
  const url = new URL(`${META_GRAPH_BASE_URL}/me`);
  url.searchParams.set("fields", "id,name");
  const body = await graphJson(url, { method: "GET" }, fetchImpl, accessToken);
  const id = typeof body.id === "string" ? body.id : String(body.id || "");
  if (!id) throw new MetaOAuthError("meta_identity_unavailable", "Meta identity could not be verified.", 502, true);
  return { id, name: typeof body.name === "string" ? body.name : null };
}

export async function getMetaGrantedScopes(accessToken: string, fetchImpl: typeof fetch = fetch) {
  const url = new URL(`${META_GRAPH_BASE_URL}/me/permissions`);
  const body = await graphJson(url, { method: "GET" }, fetchImpl, accessToken);
  const data = Array.isArray(body.data) ? body.data as Array<Record<string, unknown>> : [];
  return data.filter((row) => row.status === "granted" && typeof row.permission === "string").map((row) => String(row.permission));
}

export async function discoverMetaAdAccounts(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<MetaAdAccount[]> {
  const accounts = new Map<string, MetaAdAccount>();
  let after: string | null = null;
  for (let page = 0; page < MAX_ACCOUNT_PAGES; page += 1) {
    const url = new URL(`${META_GRAPH_BASE_URL}/me/adaccounts`);
    url.searchParams.set("fields", "id,account_id,name,account_status,currency,timezone_name,timezone_offset_hours_utc,business{id,name}");
    url.searchParams.set("limit", String(ACCOUNT_PAGE_SIZE));
    if (after) url.searchParams.set("after", after);
    const body = await graphJson(url, { method: "GET" }, fetchImpl, accessToken);
    const data = Array.isArray(body.data) ? body.data as Array<Record<string, unknown>> : [];
    for (const row of data) {
      const rawAccountId = typeof row.account_id === "string" ? row.account_id : String(row.account_id || "");
      const rawId = typeof row.id === "string" ? row.id : String(row.id || "");
      const accountId = rawAccountId || rawId.replace(/^act_/, "");
      if (!accountId || !/^\d+$/.test(accountId)) continue;
      const business = row.business && typeof row.business === "object" ? row.business as Record<string, unknown> : null;
      accounts.set(accountId, {
        id: rawId || `act_${accountId}`,
        accountId,
        name: typeof row.name === "string" ? row.name : null,
        accountStatus: Number.isFinite(Number(row.account_status)) ? Number(row.account_status) : null,
        currency: typeof row.currency === "string" ? row.currency : null,
        timezoneName: typeof row.timezone_name === "string" ? row.timezone_name : null,
        timezoneOffsetHoursUtc: Number.isFinite(Number(row.timezone_offset_hours_utc)) ? Number(row.timezone_offset_hours_utc) : null,
        business: business && business.id ? { id: String(business.id), name: typeof business.name === "string" ? business.name : null } : null,
      });
    }
    const paging = body.paging && typeof body.paging === "object" ? body.paging as Record<string, unknown> : null;
    const cursors = paging?.cursors && typeof paging.cursors === "object" ? paging.cursors as Record<string, unknown> : null;
    const nextAfter = typeof cursors?.after === "string" && paging?.next ? String(cursors.after) : null;
    if (!nextAfter || nextAfter === after) break;
    after = nextAfter;
  }
  return Array.from(accounts.values());
}
