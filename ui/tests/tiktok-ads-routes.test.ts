import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const routes = [
  "app/v1/integrations/tiktok/oauth/start/route.ts",
  "app/v1/integrations/tiktok/oauth/callback/route.ts",
  "app/v1/integrations/tiktok/status/route.ts",
  "app/v1/integrations/tiktok/accounts/route.ts",
];
for (const route of routes) {
  if (!fs.existsSync(path.join(root, route))) throw new Error("Missing TikTok route: " + route);
}
const start = fs.readFileSync(path.join(root, routes[0]), "utf8");
const callback = fs.readFileSync(path.join(root, routes[1]), "utf8");
const status = fs.readFileSync(path.join(root, routes[2]), "utf8");
const accounts = fs.readFileSync(path.join(root, routes[3]), "utf8");

if (!start.includes("tracekit_tiktok_oauth_state") || !start.includes("httpOnly: true")) throw new Error("TikTok OAuth start must bind state to an HTTP-only cookie.");
if (!callback.includes("state !== cookieState") || !callback.includes("maxAge: 0")) throw new Error("TikTok callback must verify and clear OAuth state.");
if (!callback.includes("TIKTOK_ADVERTISER_INFO_ENDPOINT")) throw new Error("TikTok callback must require explicit advertiser endpoint configuration.");
if (!status.includes("schedulesActivated: false")) throw new Error("TikTok status must not imply scheduler activation.");
if (!accounts.includes("sameOrigin(request)") || !accounts.includes("65_536") && !accounts.includes("65536")) throw new Error("TikTok account mutation must enforce request boundaries.");
if (!accounts.includes("schedulesActivated:false") && !accounts.includes("schedulesActivated: false")) throw new Error("TikTok selection must not activate schedules.");

console.log("tiktok-ads-routes tests passed");
