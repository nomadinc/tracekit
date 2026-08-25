import { runCommasQuotaProbe } from "../lib/commerce/commas-continuous-worker.ts";

const connectionFlag = process.argv.find((value) => value.startsWith("--connection-id="));
const connectionId = connectionFlag?.slice("--connection-id=".length);
const confirm = process.argv.includes("--confirm-commas-quota-probe");
if (!connectionId) throw new Error("--connection-id is required.");
void (async () => {
  const result = await runCommasQuotaProbe({ connectionId, confirm });
  console.log(JSON.stringify({ ok: true, provider: result.provider, connection_id: result.connectionId, provider_requests: result.providerRequests, quota_limit: result.quotaLimit, quota_remaining: result.quotaRemaining, quota_reset: result.quotaReset, observed_at: result.observedAt, source: result.source }));
})().catch((error) => { console.error(error instanceof Error ? error.message : "Quota probe failed."); process.exitCode = 1; });
