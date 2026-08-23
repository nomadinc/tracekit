import { spawn } from "node:child_process";
import { historicalBatchMadeProgress, historicalQuotaAllowed, historicalWarningDelta, parseHistoricalBatchArgs, type OrderingState } from "../lib/commerce/commas-historical-backfill";

type Row = Record<string, any>;
const MAX_PAGES_PER_CHUNK = 8;
const PER_PAGE = 100;

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Historical batch persistence configuration unavailable.");
  return { url, key };
}

async function db(path: string) {
  const { url, key } = config();
  const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  const response = await fetch(`${url}/rest/v1/${path}`, { headers });
  if (!response.ok) throw new Error(`Historical batch read failed (${response.status}).`);
  const value = await response.json() as unknown;
  return (Array.isArray(value) ? value : [value]) as Row[];
}

function jsonLines(output: string) {
  return output.split("\n").map((line) => { try { return JSON.parse(line) as Row; } catch { return null; } }).filter((value): value is Row => value !== null);
}

function invokeChunk(args: ReturnType<typeof parseHistoricalBatchArgs>) {
  return new Promise<Row[]>((resolve, reject) => {
    const child = spawn(process.execPath, ["--env-file-if-exists=.env.local", "./node_modules/tsx/dist/cli.mjs", "scripts/run-commas-shadow-sync.ts", "--historical-backfill", "--confirm-historical-commas-backfill", `--from-date=${args.fromDate}`, `--to-date=${args.toDate}`, `--run-id=${args.runId}`, `--max-pages=${MAX_PAGES_PER_CHUNK}`, `--per-page=${PER_PAGE}`], { cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(jsonLines(stdout)) : reject(new Error(stderr.trim() || `Historical chunk exited with status ${code}.`)));
  });
}

function ordering(value: unknown): OrderingState {
  return value === "newest_first" || value === "oldest_first" || value === "unknown" || value === "ambiguous" ? value : "unknown";
}

async function main() {
  const args = parseHistoricalBatchArgs(process.argv.slice(2));
  let chunksCompleted = 0; let providerRequestsTotal = 0; let stopReason = "max_chunks";
  let previousOrdering: OrderingState = "unknown";
  while (chunksCompleted < args.maxChunks) {
    const [run] = await db(`commerce_sync_runs?id=eq.${encodeURIComponent(args.runId!)}&select=status,organization_id,connection_id,lease_owner,lease_expires_at,metadata,pages_completed,warnings_count,records_seen,records_created,records_updated&limit=1`);
    if (!run) throw new Error("Historical batch run not found.");
    const metadata = run.metadata || {};
    const startPage = Number(metadata.resume_page);
    const before = { resumePage: Number.isInteger(startPage) ? startPage : 0, inRange: Number(metadata.in_range_records || 0), earliest: typeof metadata.earliest_seen_timestamp === "string" ? metadata.earliest_seen_timestamp : null, warnings: Number(run.warnings_count || 0), recordsSeen: Number(run.records_seen || 0), recordsCreated: Number(run.records_created || 0), recordsUpdated: Number(run.records_updated || 0) };
    if (run.status !== "paused" || run.lease_owner !== null || run.lease_expires_at !== null) { stopReason = "run_not_resumable"; throw new Error(`Historical batch stopped: ${stopReason}.`); }
    if (metadata.range_complete === true) { stopReason = "range_complete"; break; }
    const currentOrdering = ordering(metadata.ordering_state);
    if (currentOrdering === "unknown" || currentOrdering === "ambiguous" || (previousOrdering !== "unknown" && currentOrdering !== previousOrdering)) { stopReason = "ordering_inconsistent"; throw new Error(`Historical batch stopped: ${stopReason}.`); }
    previousOrdering = currentOrdering;
    const quotaRows = await db(`commerce_sync_runs?organization_id=eq.${encodeURIComponent(String(run.organization_id || ""))}&connection_id=eq.${encodeURIComponent(String(run.connection_id || ""))}&select=metadata&order=created_at.desc&limit=50`);
    const quota = quotaRows.map((row) => Number(row.metadata?.rate_limit_end)).find((value) => Number.isFinite(value));
    if (quota === undefined || !historicalQuotaAllowed(quota, MAX_PAGES_PER_CHUNK)) { stopReason = "quota_unknown_or_insufficient"; throw new Error(`Historical batch stopped: ${stopReason}.`); }
    const lines = await invokeChunk(args);
    const completion = lines.find((line) => line.event === "shadow_sync_completed");
    const started = lines.find((line) => line.event === "shadow_sync_started");
    if (!completion || Number(completion.providerRequests) > MAX_PAGES_PER_CHUNK) { stopReason = "chunk_failed_or_unsafe"; throw new Error(`Historical batch stopped: ${stopReason}.`); }
    const [afterRun] = await db(`commerce_sync_runs?id=eq.${encodeURIComponent(args.runId!)}&select=status,metadata,pages_completed,warnings_count,records_seen,records_created,records_updated&limit=1`);
    if (!afterRun || !["paused", "completed", "completed_with_warnings"].includes(String(afterRun.status))) { stopReason = "unexpected_run_state"; throw new Error(`Historical batch stopped: ${stopReason}.`); }
    const afterMetadata = afterRun?.metadata || {};
    const after = { resumePage: Number(afterMetadata.resume_page), inRange: Number(afterMetadata.in_range_records || 0), earliest: typeof afterMetadata.earliest_seen_timestamp === "string" ? afterMetadata.earliest_seen_timestamp : null, rangeComplete: afterMetadata.range_complete === true };
    const warningDelta = historicalWarningDelta(before.warnings, Number(afterRun.warnings_count || 0), Number(completion.warnings || 0));
    if (warningDelta > 0) { stopReason = "chunk_warnings"; throw new Error(`Historical batch stopped: ${stopReason}.`); }
    if (!historicalBatchMadeProgress(before, after)) { stopReason = "no_progress"; throw new Error(`Historical batch stopped: ${stopReason}.`); }
    const endPage = after.resumePage - 1;
    const chunkRequests = Number(completion.providerRequests || 0); providerRequestsTotal += chunkRequests; chunksCompleted += 1;
    console.log(JSON.stringify({ chunk: chunksCompleted, startPage: Number(started?.startPage || before.resumePage), endPage, providerRequests: chunkRequests, warningDelta, recordsSeenDelta: Number(afterRun?.records_seen || 0) - before.recordsSeen, recordsCreatedDelta: Number(afterRun?.records_created || 0) - before.recordsCreated, recordsUpdatedDelta: Number(afterRun?.records_updated || 0) - before.recordsUpdated, cumulativePagesCompleted: Number(afterRun?.pages_completed || 0), resumePage: after.resumePage, earliestTimestamp: after.earliest, inRangeTotal: after.inRange, quotaRemaining: quota, rangeComplete: after.rangeComplete }));
    if (after.rangeComplete) { stopReason = "range_complete"; break; }
  }
  const [finalRun] = await db(`commerce_sync_runs?id=eq.${encodeURIComponent(args.runId!)}&select=status,metadata,pages_completed&limit=1`);
  console.log(JSON.stringify({ event: "historical_batch_completed", chunksCompleted, providerRequests: providerRequestsTotal, cumulativePages: Number(finalRun?.pages_completed || 0), resumePage: Number(finalRun?.metadata?.resume_page || 0), earliestTimestamp: finalRun?.metadata?.earliest_seen_timestamp || null, rangeComplete: finalRun?.metadata?.range_complete === true, stopReason }));
}

if (process.argv[1]?.endsWith("run-commas-historical-batch.ts")) void main();
