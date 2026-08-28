import { runCommasQuotaProbe, runFixedRedeliveryQuotaRefresh } from "../lib/commerce/commas-continuous-worker.ts";

const connectionFlag = process.argv.find((value) => value.startsWith("--connection-id="));
const connectionId = connectionFlag?.slice("--connection-id=".length);
const confirm = process.argv.includes("--confirm-commas-quota-probe");
const forStrandedRecovery = process.argv.includes("--for-stranded-recovery");
const forFixedRedelivery = process.argv.includes("--for-fixed-redelivery");
if (forStrandedRecovery && forFixedRedelivery) throw new Error("Quota probe modes are mutually exclusive.");
if (!connectionId && !forFixedRedelivery) throw new Error("--connection-id is required.");
void (async () => {
  const result = forFixedRedelivery ? await runFixedRedeliveryQuotaRefresh({confirm}) : await runCommasQuotaProbe({ connectionId:connectionId!, confirm, forStrandedRecovery });
  console.log(JSON.stringify({ ok: true, provider: result.provider, connection_id: result.connectionId, provider_account_id: result.providerAccountId, run_id:"runId" in result?result.runId:null, provider_requests: result.providerRequests, quota_limit: result.quotaLimit, quota_remaining: result.quotaRemaining, quota_reset: result.quotaReset, observed_at: result.observedAt, source: result.source }));
})().catch((error) => {
  const diagnostic = error && typeof error === "object" && "persistence" in error
    ? (error as { persistence?: unknown }).persistence
    : undefined;
  console.error(JSON.stringify(diagnostic ? { ok: false, persistence: diagnostic } : { ok: false, error: error instanceof Error ? error.message : "Quota probe failed." }));
  process.exitCode = 1;
});
