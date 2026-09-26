import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Google Ads settings page exposes account tree, manual sync, and evidence diagnostics without scheduler activation",async()=>{
 const page=await readFile(new URL("../app/(app)/settings/integrations/google-ads/page.tsx",import.meta.url),"utf8");
 const panel=await readFile(new URL("../components/integrations/google-ads-integration-panel.tsx",import.meta.url),"utf8");
 assert.match(page,/GoogleAdsIntegrationPanel/);
 assert.match(panel,/Google Ads connections/);
 assert.match(panel,/Manager/);
 assert.match(panel,/Run Now/);
 assert.match(panel,/View Google Payload/);
 assert.match(panel,/Automatic scheduling is disabled/);
 assert.doesNotMatch(panel,/Enable schedule|Auto sync/);
});
