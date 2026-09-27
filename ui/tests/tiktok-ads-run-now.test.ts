import { runTikTokManualSync } from "../lib/integrations/tiktok-ads-run-now";

const db: any[] = [];
async function transport(path: string, init: RequestInit = {}) {
  if ((init.method || "GET") === "POST") {
    const row = { id: path === "marketing_sync_runs" ? "run-1" : `row-${db.length+1}`, ...JSON.parse(String(init.body)) };
    db.push({ path, row }); return [row];
  }
  if ((init.method || "GET") === "PATCH") { db.push({ path, patch: JSON.parse(String(init.body)) }); return [{ id: "run-1", ...JSON.parse(String(init.body)) }]; }
  return [];
}
const account: any = { id: "pa", connectionId: "conn", provider: "tiktok_ads", externalId: "7001", label: "Fixture", parentProviderAccountId: null, accountType: "advertiser", hierarchyDepth: 0, isManager: false, eligibleForSpendSync: true, currency: "USD", timezoneName: "America/Los_Angeles", status: "active", selectedForSync: true, metadata: {} };

const result = await runTikTokManualSync({
  organizationId: "org", connectionId: "conn", providerAccountId: "pa", requestedByUserId: "user",
  since: "2026-09-24", until: "2026-09-26", overlapDays: 2, transport,
  listAccounts: async () => [account], resolveToken: async () => "secret-token",
  fetchReport: async ({ accessToken, advertiserId, since, until }: any) => {
    if (accessToken !== "secret-token" || advertiserId !== "7001" || since !== "2026-09-22" || until !== "2026-09-26") throw new Error("TikTok manual sync planning/token boundary failed.");
    return [{ page: 1, totalPages: 1, rows: [{ dimensions: { stat_time_day: "2026-09-25", campaign_id: "1", adgroup_id: "2", ad_id: "3" }, metrics: { spend: "5.00", impressions: "10", clicks: "1" } }] }];
  },
  persistRows: async () => ({ seen: 1, created: 1, updated: 0, unchanged: 0, evidenceCreated: 1, costsCreated: 1, costsUpdated: 0 }),
});
if (result.status !== "completed" || result.seen !== 1 || result.costsCreated !== 1 || result.schedulesActivated !== false) throw new Error("TikTok manual sync success accounting failed.");
if (!db.some(x => x.path === "marketing_sync_checkpoints")) throw new Error("TikTok manual sync must checkpoint provider pages.");

let failed = false;
try {
  await runTikTokManualSync({ organizationId: "org", connectionId: "conn", providerAccountId: "pa", requestedByUserId: "user", since: "2026-09-25", until: "2026-09-26", transport, listAccounts: async () => [{ ...account, selectedForSync: false }] });
} catch { failed = true; }
if (!failed) throw new Error("TikTok manual sync must reject unselected advertisers.");

console.log("tiktok-ads-run-now tests passed");
