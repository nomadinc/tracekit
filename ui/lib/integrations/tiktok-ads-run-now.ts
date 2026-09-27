import "server-only";
import { marketingPersistenceRequest, listMarketingProviderAccounts } from "./marketing-provider-repository";
import { resolveTikTokAdsAccessToken } from "./tiktok-ads-credential";
import { fetchTikTokAdDailyReport } from "./tiktok-ads-reporting-client";
import { persistTikTokAdDailyRows } from "./tiktok-ads-reporting-persistence";
import { planTikTokAdsSync } from "./tiktok-ads-sync-orchestrator";

type Transport = typeof marketingPersistenceRequest;

export async function runTikTokManualSync(input: {
  organizationId: string; connectionId: string; providerAccountId: string; requestedByUserId: string;
  since: string; until: string; overlapDays?: number;
  transport?: Transport; resolveToken?: typeof resolveTikTokAdsAccessToken;
  fetchReport?: typeof fetchTikTokAdDailyReport; persistRows?: typeof persistTikTokAdDailyRows;
  listAccounts?: typeof listMarketingProviderAccounts;
}) {
  const transport = input.transport || marketingPersistenceRequest;
  const accounts = await (input.listAccounts || listMarketingProviderAccounts)(input.organizationId, input.connectionId);
  const account = accounts.find(a => a.id === input.providerAccountId);
  if (!account || !account.selectedForSync || !account.eligibleForSpendSync || !["active", "degraded"].includes(account.status)) {
    throw new Error("tiktok_ads_account_not_selected");
  }
  if (!account.currency || !account.timezoneName) throw new Error("tiktok_ads_account_reporting_context_unavailable");

  const plan = planTikTokAdsSync({ accounts: [{ id: account.id, connectionId: account.connectionId, externalId: account.externalId, eligibleForSpendSync: account.eligibleForSpendSync, selectedForSync: account.selectedForSync, status: account.status }], since: input.since, until: input.until, overlapDays: input.overlapDays ?? 2 });
  const token = await (input.resolveToken || resolveTikTokAdsAccessToken)({ organizationId: input.organizationId, connectionId: input.connectionId });
  const now = new Date().toISOString();
  const created = await transport("marketing_sync_runs", { method: "POST", body: JSON.stringify({
    organization_id: input.organizationId, connection_id: input.connectionId, provider_account_id: account.id,
    sync_type: "tiktok_ads_daily", mode: "incremental", status: "running", started_at: now,
    requested_by_user_id: input.requestedByUserId, metadata: { provider: "tiktok_ads", manual: true, schedulesActivated: false },
    created_at: now, updated_at: now,
  }) });
  if (!created[0]) throw new Error("TikTok sync run could not be created.");
  const runId = String(created[0].id);
  const totals = { pages: 0, seen: 0, created: 0, updated: 0, unchanged: 0, evidenceCreated: 0, costsCreated: 0, costsUpdated: 0 };

  try {
    for (const target of plan.targets) for (const window of target.windows) {
      const pages = await (input.fetchReport || fetchTikTokAdDailyReport)({ accessToken: token, advertiserId: target.advertiserId, since: window.since, until: window.until });
      for (const page of pages) {
        const result = await (input.persistRows || persistTikTokAdDailyRows)({
          organizationId: input.organizationId, connectionId: input.connectionId, providerAccountId: account.id,
          syncRunId: runId, apiVersion: "v1.3", advertiserId: target.advertiserId,
          currency: account.currency, timezoneName: account.timezoneName, rawRows: page.rows,
        });
        totals.pages++; totals.seen += result.seen; totals.created += result.created; totals.updated += result.updated;
        totals.unchanged += result.unchanged; totals.evidenceCreated += result.evidenceCreated;
        totals.costsCreated += result.costsCreated; totals.costsUpdated += result.costsUpdated;
        await transport("marketing_sync_checkpoints", { method: "POST", body: JSON.stringify({
          sync_run_id: runId, organization_id: input.organizationId, connection_id: input.connectionId,
          provider_account_id: account.id, resource: "tiktok_ads_daily", checkpoint_kind: "page",
          page: totals.pages, report_date_start: window.since, report_date_end: window.until,
          records_seen: result.seen, records_persisted: result.created + result.updated + result.unchanged,
          records_failed: 0, state: "completed", completed_at: new Date().toISOString(),
          metadata: { provider: "tiktok_ads", manual: true, providerPage: page.page, totalPages: page.totalPages },
        }) });
      }
    }
    const completedAt = new Date().toISOString();
    await transport(`marketing_sync_runs?id=eq.${encodeURIComponent(runId)}&organization_id=eq.${encodeURIComponent(input.organizationId)}`, { method: "PATCH", body: JSON.stringify({
      status: "completed", completed_at: completedAt, pages_completed: totals.pages, records_seen: totals.seen,
      records_created: totals.created, records_updated: totals.updated, records_unchanged: totals.unchanged,
      records_failed: 0, metadata: { provider: "tiktok_ads", manual: true, schedulesActivated: false, ...totals }, updated_at: completedAt,
    }) });
    return { runId, status: "completed" as const, effectiveSince: plan.effectiveSince, until: plan.until, schedulesActivated: false, ...totals };
  } catch (error: any) {
    const failedAt = new Date().toISOString();
    const errorCode = String(error?.code || error?.message || "tiktok_ads_sync_failed").slice(0, 120);
    await transport(`marketing_sync_runs?id=eq.${encodeURIComponent(runId)}&organization_id=eq.${encodeURIComponent(input.organizationId)}`, { method: "PATCH", body: JSON.stringify({
      status: "failed", completed_at: failedAt, pages_completed: totals.pages, records_seen: totals.seen,
      records_created: totals.created, records_updated: totals.updated, records_unchanged: totals.unchanged,
      records_failed: 1, last_error_code: errorCode, last_error_summary: "TikTok manual sync failed safely.",
      metadata: { provider: "tiktok_ads", manual: true, schedulesActivated: false, ...totals }, updated_at: failedAt,
    }) }).catch(() => undefined);
    throw error;
  }
}
