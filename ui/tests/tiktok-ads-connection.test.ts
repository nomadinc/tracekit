import { createTikTokOAuthState } from "../lib/integrations/tiktok-ads-oauth";
import { completeTikTokOAuth } from "../lib/integrations/tiktok-ads-connection";

process.env.TIKTOK_BUSINESS_APP_ID = "app";
process.env.TIKTOK_BUSINESS_APP_SECRET = "secret";
process.env.TIKTOK_OAUTH_REDIRECT_URI = "https://tracekit.example/callback";
process.env.TIKTOK_OAUTH_STATE_SECRET = "0123456789abcdef0123456789abcdef";

const session: any = {
  activeOrganization: { id: "org-1" },
  activeAccount: { id: "account-1" },
  user: { id: "user-1" },
  effectivePermissions: ["connectors.manage"],
};
const state = createTikTokOAuthState({ organizationId: "org-1", accountId: "account-1", userId: "user-1" });
let persistedAuth: any = null;
let persistedAccounts: any = null;

const result = await completeTikTokOAuth({
  session, state, code: "code", advertiserInfoEndpoint: "https://business-api.tiktok.com/certified-later",
  exchangeCode: async () => ({ accessToken: "token", advertiserIds: ["7002", "7001"], scope: ["advertiser.read"] }),
  discoverAccounts: async () => [
    { advertiserId: "7001", name: "One", currency: "USD", timezoneName: "America/Los_Angeles", status: "active" },
    { advertiserId: "7002", name: "Two", currency: "USD", timezoneName: "America/New_York", status: "active" },
  ],
  persistAuthorization: async (input: any) => { persistedAuth = input; return { id: "conn", organizationId: "org-1", accountId: "account-1", provider: "tiktok_ads", providerIdentityId: input.providerIdentityId, displayName: input.displayName, status: "connected", reauthorizationRequired: false, capabilities: {} }; },
  persistAccounts: async (input: any) => {
    persistedAccounts = input;
    return input.accounts.map((a: any, i: number) => ({ id: `a${i}`, selected_for_sync: false, ...a }));
  },
});
if (persistedAuth.providerIdentityId !== "7001,7002") throw new Error("TikTok connection identity must be deterministic.");
if (persistedAuth.accessToken !== "token") throw new Error("TikTok access token did not reach encrypted persistence boundary.");
if (persistedAccounts.accounts.length !== 2 || result.selectedAccountCount !== 0) throw new Error("TikTok connection must not auto-select advertisers.");

let failed = false;
try {
  await completeTikTokOAuth({
    session, state, code: "code", advertiserInfoEndpoint: "https://business-api.tiktok.com/certified-later",
    exchangeCode: async () => ({ accessToken: "token", advertiserIds: [], scope: [] }),
    discoverAccounts: async () => [],
  });
} catch { failed = true; }
if (!failed) throw new Error("TikTok connection without authorized advertisers must fail closed.");

failed = false;
try {
  await completeTikTokOAuth({
    session: { ...session, effectivePermissions: [] }, state, code: "code",
    advertiserInfoEndpoint: "https://business-api.tiktok.com/certified-later",
  });
} catch { failed = true; }
if (!failed) throw new Error("TikTok connection requires connector management permission.");

console.log("tiktok-ads-connection tests passed");
