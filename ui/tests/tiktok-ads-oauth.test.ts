import { buildTikTokAuthorizationUrl, createTikTokOAuthState, exchangeTikTokAuthorizationCode, verifyTikTokOAuthState } from "../lib/integrations/tiktok-ads-oauth";

process.env.TIKTOK_BUSINESS_APP_ID = "app-123";
process.env.TIKTOK_BUSINESS_APP_SECRET = "secret-123";
process.env.TIKTOK_OAUTH_REDIRECT_URI = "https://tracekit.example/v1/integrations/tiktok/callback";
process.env.TIKTOK_OAUTH_STATE_SECRET = "0123456789abcdef0123456789abcdef";

const now = new Date("2026-09-26T20:00:00Z");
const state = createTikTokOAuthState({ organizationId: "org", accountId: "acct", userId: "user", now, nonce: "nonce" });
const verified = verifyTikTokOAuthState(state, { organizationId: "org", accountId: "acct", userId: "user", now: new Date("2026-09-26T20:05:00Z") });
if (verified.nonce !== "nonce") throw new Error("TikTok OAuth state verification failed.");

let failed = false;
try { verifyTikTokOAuthState(state, { organizationId: "other", accountId: "acct", userId: "user", now }); } catch { failed = true; }
if (!failed) throw new Error("TikTok OAuth state scope mismatch must fail closed.");

const url = new URL(buildTikTokAuthorizationUrl({ organizationId: "org", accountId: "acct", userId: "user" }));
if (url.hostname !== "business-api.tiktok.com" || url.searchParams.get("app_id") !== "app-123" || !url.searchParams.get("state")) {
  throw new Error("TikTok authorization URL is invalid.");
}

let requestBody: any = null;
const token = await exchangeTikTokAuthorizationCode("single-use-code", async (_url, init) => {
  requestBody = JSON.parse(String(init?.body));
  return new Response(JSON.stringify({ code: 0, message: "OK", data: { access_token: "token", advertiser_ids: ["700000000000000001"], scope: ["advertiser.read"] } }), { status: 200, headers: { "Content-Type": "application/json" } });
});
if (requestBody.auth_code !== "single-use-code" || requestBody.app_id !== "app-123" || requestBody.secret !== "secret-123") throw new Error("TikTok token exchange request is invalid.");
if (token.accessToken !== "token" || token.advertiserIds[0] !== "700000000000000001") throw new Error("TikTok token exchange normalization failed.");

failed = false;
try {
  await exchangeTikTokAuthorizationCode("bad", async () => new Response(JSON.stringify({ code: 40001, message: "bad auth code" }), { status: 200, headers: { "Content-Type": "application/json" } }));
} catch { failed = true; }
if (!failed) throw new Error("TikTok provider error must fail closed.");

console.log("tiktok-ads-oauth tests passed");
