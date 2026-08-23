import { historicalQuotaObservationUsable } from "../lib/commerce/commas-historical-backfill";

type Row = Record<string, any>;
const RUN_ID = "59bf7114-5902-481b-ba49-baa698114109";

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Historical quota inspection configuration unavailable.");
  return { url, key };
}

async function db(path: string) {
  const { url, key } = config();
  const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  const response = await fetch(`${url}/rest/v1/${path}`, { headers });
  if (!response.ok) throw new Error(`Historical quota inspection read failed (${response.status}).`);
  const value = await response.json() as unknown;
  return (Array.isArray(value) ? value : [value]) as Row[];
}

async function main() {
  const [run] = await db(`commerce_sync_runs?id=eq.${RUN_ID}&select=organization_id,connection_id,metadata,updated_at&limit=1`);
  if (!run) throw new Error("Historical backfill run not found.");
  const bootstrap = await db(`commerce_sync_runs?organization_id=eq.${encodeURIComponent(String(run.organization_id))}&connection_id=eq.${encodeURIComponent(String(run.connection_id))}&metadata->>quota_bootstrap_attempted=eq.true&select=metadata,updated_at&order=updated_at.desc&limit=1`);
  const checkpoints = await db(`commerce_sync_checkpoints?sync_run_id=eq.${RUN_ID}&state=eq.completed&select=page,metadata,updated_at,completed_at&order=page.desc&limit=100`);
  const bootstrapQuota = bootstrap[0] ? Number(bootstrap[0].metadata?.rate_limit_end) : null;
  const runObservation = historicalQuotaObservationUsable(run.metadata?.rate_limit_remaining, run.metadata?.rate_limit_observed_at || run.updated_at);
  const checkpointObservation = checkpoints.map((row) => ({ page: row.page, observation: historicalQuotaObservationUsable(row.metadata?.rate_limit_remaining, row.metadata?.rate_limit_observed_at || row.completed_at || row.updated_at) })).find((entry) => entry.observation);
  const selected = runObservation ? { source: "historical_run", ...runObservation } : checkpointObservation?.observation ? { source: `historical_checkpoint_page_${checkpointObservation.page}`, ...checkpointObservation.observation } : null;
  console.log(JSON.stringify({ bootstrapQuota: Number.isFinite(bootstrapQuota) ? bootstrapQuota : null, latestHistoricalRun: runObservation ? { quota: runObservation.quota, observedAt: runObservation.observedAt } : null, latestHistoricalCheckpoint: checkpointObservation?.observation ? { page: checkpointObservation.page, quota: checkpointObservation.observation.quota, observedAt: checkpointObservation.observation.observedAt } : null, selectedQuota: selected?.quota ?? null, selectedSource: selected?.source ?? null, selectedObservedAt: selected?.observedAt ?? null, observationAgeSeconds: selected ? Math.max(0, Math.floor((Date.now() - Date.parse(selected.observedAt)) / 1000)) : null }));
}

if (process.argv[1]?.endsWith("inspect-commas-historical-quota.ts")) void main();
