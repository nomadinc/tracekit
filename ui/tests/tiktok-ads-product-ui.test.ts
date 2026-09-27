import fs from "node:fs";
import path from "node:path";
const panel=fs.readFileSync(path.join(process.cwd(),"components/integrations/tiktok-ads-integration-panel.tsx"),"utf8");
const page=fs.readFileSync(path.join(process.cwd(),"app/(app)/settings/integrations/tiktok-ads/page.tsx"),"utf8");
for(const text of ["Live TikTok developer-app access is not currently available","Live certification:</strong> Blocked","Automatic scheduling:</strong> Disabled","Run Now"])if(!panel.includes(text))throw new Error("TikTok UI missing required state: "+text);
if(!panel.includes("disabled className")||!panel.includes("Connect TikTok"))throw new Error("TikTok Connect must remain disabled while live access is blocked.");
if(!panel.includes("/v1/integrations/tiktok/status")||!panel.includes("/v1/integrations/tiktok/accounts")||!panel.includes("/v1/integrations/tiktok/run-now"))throw new Error("TikTok UI is not wired to certified routes.");
if(!page.includes("TikTokAdsIntegrationPanel"))throw new Error("TikTok settings page is not wired.");
console.log("tiktok-ads-product-ui tests passed");
