import { planTikTokAdsSync } from "../lib/integrations/tiktok-ads-sync-orchestrator";

const accounts = [
  { id: "acct-a", connectionId: "conn-a", externalId: "700000000000000001", eligibleForSpendSync: true, selectedForSync: true, status: "active" },
  { id: "acct-b", connectionId: "conn-a", externalId: "700000000000000002", eligibleForSpendSync: true, selectedForSync: false, status: "active" },
  { id: "acct-c", connectionId: "conn-a", externalId: "700000000000000003", eligibleForSpendSync: false, selectedForSync: true, status: "active" },
];

const plan = planTikTokAdsSync({ accounts, since: "2026-09-20", until: "2026-09-26", overlapDays: 2, maxWindowDays: 3 });
if (plan.effectiveSince !== "2026-09-18") throw new Error("TikTok overlap was not applied.");
if (plan.targets.length !== 1 || plan.targets[0].advertiserId !== accounts[0].externalId) throw new Error("TikTok eligibility selection failed.");
if (JSON.stringify(plan.targets[0].windows) !== JSON.stringify([
  { since: "2026-09-18", until: "2026-09-20" },
  { since: "2026-09-21", until: "2026-09-23" },
  { since: "2026-09-24", until: "2026-09-26" },
])) throw new Error("TikTok window planning failed.");

let failed = false;
try { planTikTokAdsSync({ accounts: [], since: "2026-09-26", until: "2026-09-20" }); } catch { failed = true; }
if (!failed) throw new Error("TikTok invalid range must fail closed.");

console.log("tiktok-ads-sync-orchestrator tests passed");
