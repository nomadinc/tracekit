export type HistoricalBackfillArgs = {
  historical: boolean;
  confirmed: boolean;
  fromDate: string | null;
  toDate: string | null;
  startPage: number;
  maxPages: number;
  perPage: number;
};

export type OrderingState = "unknown" | "newest_first" | "oldest_first" | "ambiguous";
export type HistoricalChunkTransition = "paused" | "completed" | "completed_with_warnings";

export function historicalQuotaAllowed(quotaRemaining: number | null, maxRequests: number) {
  return quotaRemaining !== null && Number.isFinite(quotaRemaining) && quotaRemaining - maxRequests >= 1000;
}

export function historicalChunkTransition(rangeComplete: boolean, warnings: number): HistoricalChunkTransition {
  if (!rangeComplete) return "paused";
  return warnings ? "completed_with_warnings" : "completed";
}

export function historicalResumePage(metadata: Record<string, unknown> | null | undefined, fallback: number) {
  const value = Number(metadata?.resume_page);
  return Number.isInteger(value) && value >= 1 ? value : fallback;
}

export function historicalInvocationHasBudget(providerRequests: number, maxPages: number) {
  return providerRequests < maxPages;
}

export function parseHistoricalBackfillArgs(argv: string[]): HistoricalBackfillArgs {
  const historical = argv.includes("--historical-backfill");
  const confirmed = argv.includes("--confirm-historical-commas-backfill");
  const value = (name: string) => argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1) || null;
  const fromDate = value("--from-date");
  const toDate = value("--to-date");
  const startPage = Number(value("--start-page") || "1");
  const maxPages = Number(value("--max-pages") || "1");
  const perPage = Number(value("--per-page") || "100");
  if (!historical) return { historical, confirmed, fromDate, toDate, startPage, maxPages, perPage };
  if (!confirmed) throw new Error("Historical backfill requires --confirm-historical-commas-backfill.");
  if (!fromDate || !toDate || !/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) throw new Error("Historical backfill requires --from-date and --to-date in YYYY-MM-DD format.");
  if (fromDate > toDate) throw new Error("Historical backfill date bounds are reversed.");
  if (!Number.isInteger(startPage) || startPage < 1) throw new Error("Historical backfill start page is invalid.");
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 8) throw new Error("Historical backfill max-pages must be between 1 and 8.");
  if (!Number.isInteger(perPage) || perPage < 1 || perPage > 100) throw new Error("Historical backfill per-page must be between 1 and 100.");
  return { historical, confirmed, fromDate, toDate, startPage, maxPages, perPage };
}

export function orderingForPage(timestamps: string[]): OrderingState {
  const values = timestamps.map((value) => Date.parse(value)).filter(Number.isFinite);
  if (values.length < 2) return "unknown";
  let ascending = false;
  let descending = false;
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] > values[index - 1]) ascending = true;
    if (values[index] < values[index - 1]) descending = true;
  }
  if (ascending && descending) return "ambiguous";
  return ascending ? "oldest_first" : descending ? "newest_first" : "unknown";
}

export function combineOrdering(previous: OrderingState, current: OrderingState, previousLast: string | null, currentFirst: string | null): OrderingState {
  if (previous === "ambiguous" || current === "ambiguous") return "ambiguous";
  const direction = previous === "unknown" ? current : current === "unknown" ? previous : previous === current ? previous : "ambiguous";
  if (!direction || !previousLast || !currentFirst) return direction || "unknown";
  const before = Date.parse(previousLast);
  const after = Date.parse(currentFirst);
  if (!Number.isFinite(before) || !Number.isFinite(after)) return "ambiguous";
  if (direction === "newest_first" && after > before) return "ambiguous";
  if (direction === "oldest_first" && after < before) return "ambiguous";
  return direction;
}

export function inHistoricalRange(timestamp: string, fromDate: string, toDate: string) {
  const date = timestamp.slice(0, 10);
  return date >= fromDate && date <= toDate;
}

export function rangePassed(ordering: OrderingState, pageTimestamps: string[], fromDate: string, toDate: string) {
  if (ordering === "newest_first") return Boolean(pageTimestamps.length && pageTimestamps.every((value) => value.slice(0, 10) < fromDate));
  if (ordering === "oldest_first") return Boolean(pageTimestamps.length && pageTimestamps.every((value) => value.slice(0, 10) > toDate));
  return false;
}
