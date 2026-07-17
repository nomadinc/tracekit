"use client";

export type ImportProgressStatus =
  | "queued"
  | "preparing"
  | "importing"
  | "reconciling"
  | "finalizing"
  | "completed"
  | "failed"
  | "cancelled";

export type ImportProgressState = {
  platform?: string | null;
  status?: ImportProgressStatus | string;
  requested_from?: string | null;
  requested_to?: string | null;
  filter?: string | null;
  records_fetched?: number | null;
  records_processed?: number | null;
  matched?: number | null;
  unmatched?: number | null;
  ambiguous?: number | null;
  rows_upserted?: number | null;
  payment_transactions_upserted?: number | null;
  platform_orders_upserted?: number | null;
  ledger_inserted?: number | null;
  ledger_skipped?: number | null;
  duplicate_sales_skipped?: number | null;
  duplicate_rows_skipped?: number | null;
  warnings?: string[] | null;
  last_error?: string | null;
  started_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
  total_records?: number | null;
  current_window?: {
    from?: string | null;
    to?: string | null;
  } | null;
};

export type ImportProgressJob = {
  id?: string;
  status?: string;
  active?: boolean;
  percent?: number | null;
  progress?: ImportProgressState | null;
};

export function ImportProgressPanel({
  job,
  platform,
  busy,
  onCancel,
  onResume,
}: {
  job: ImportProgressJob | null;
  platform?: string | null;
  busy?: boolean;
  onCancel?: () => void;
  onResume?: () => void;
}) {
  const progress = job?.progress;
  if (!job || !progress) return null;

  const status = String(progress.status || job.status || "queued");
  const active = Boolean(job.active) || isActiveStatus(status);
  const failed = status === "failed";
  const cancelled = status === "cancelled";
  const complete = status === "completed";
  const percent = typeof job.percent === "number" ? job.percent : progressPercent(progress);
  const warnings = Array.isArray(progress.warnings) ? progress.warnings.filter(Boolean) : [];
  const requestedRange = progress.requested_from || progress.requested_to
    ? friendlyDateRange(progress.requested_from, progress.requested_to)
    : null;
  const processedLabel = String(platform || progress.platform || "").toLowerCase() === "paypal"
    ? "PayPal financial records processed"
    : "Source records processed";

  return (
    <div className="mt-5 border-t pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Import progress</div>
          <div className="mt-1 text-xs text-gray-500">
            {statusLabel(status)}
            {progress.current_window?.from || progress.current_window?.to ? (
              <>
                {" "}for{" "}
                <span className="font-mono">
                  {dateLabel(progress.current_window.from)} - {dateLabel(progress.current_window.to)}
                </span>
              </>
            ) : null}
          </div>
          {requestedRange ? (
            <div className="mt-1 text-xs font-medium text-gray-700 dark:text-gray-200">
              {active || failed || cancelled ? "Resuming import for" : "Import range"} {requestedRange}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {active && onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="rounded-md border px-3 py-2 text-sm disabled:opacity-60"
            >
              Cancel
            </button>
          ) : null}

          {(failed || cancelled) && onResume ? (
            <button
              type="button"
              onClick={onResume}
              disabled={busy}
              className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-60 dark:bg-white dark:text-black"
            >
              {busy ? "Resuming..." : "Resume import"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-slate2/50">
        {percent === null ? (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-black/80 dark:bg-white/80" />
        ) : (
          <div
            className="h-full rounded-full bg-black transition-all dark:bg-white"
            style={{ width: `${percent}%` }}
          />
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
        <ProgressStat label={processedLabel} value={progress.records_processed} />
        <ProgressStat label="Database records written" value={progress.rows_upserted} />
        {hasProgressValue(progress.payment_transactions_upserted) ? (
          <ProgressStat label="New financial records" value={progress.payment_transactions_upserted} />
        ) : null}
        <ProgressStat label="Ledger events created" value={progress.ledger_inserted} />
        <ProgressStat label="Existing/duplicate records skipped" value={progress.duplicate_rows_skipped} />
        <ProgressStat label="Matched" value={progress.matched} />
        <ProgressStat label="Unmatched" value={progress.unmatched} />
        <ProgressStat label="Ambiguous" value={progress.ambiguous} />
        <ProgressStat label="Elapsed" value={elapsedLabel(progress)} />
      </div>

      {complete ? (
        <div className="mt-3 text-xs text-emerald-700 dark:text-emerald-300">
          Completed with {num(progress.records_processed)} {processedLabel.toLowerCase()}, {num(progress.rows_upserted)} database records written, {num(progress.ledger_inserted)} ledger events created, and {num(progress.duplicate_rows_skipped)} existing or duplicate records skipped.
        </div>
      ) : null}

      {progress.last_error ? (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
          {progress.last_error}
        </div>
      ) : null}

      {warnings.length ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="font-medium">Warnings</div>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {warnings.slice(0, 5).map((warning, index) => (
              <li key={`${warning}-${index}`}>{warning}</li>
            ))}
          </ul>
          {warnings.length > 5 ? (
            <div className="mt-1">+{warnings.length - 5} more</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ProgressStat({ label, value }: { label: string; value: number | string | null | undefined }) {
  return (
    <div>
      <div className="text-gray-500">{label}</div>
      <div className="mt-0.5 font-mono text-sm">{typeof value === "number" ? num(value) : value || "-"}</div>
    </div>
  );
}

function isActiveStatus(status: string) {
  return ["queued", "preparing", "importing", "reconciling", "finalizing"].includes(status);
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ").replace(/^\w/, (match) => match.toUpperCase());
}

function progressPercent(progress: ImportProgressState) {
  const total = Number(progress.total_records || 0);
  if (!total) return null;
  return Math.max(0, Math.min(100, Math.round((Number(progress.records_processed || 0) / total) * 100)));
}

function elapsedLabel(progress: ImportProgressState) {
  const start = progress.started_at ? Date.parse(progress.started_at) : NaN;
  const end = progress.completed_at
    ? Date.parse(progress.completed_at)
    : progress.updated_at
      ? Date.parse(progress.updated_at)
      : Date.now();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "-";

  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainder}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "-";
  return String(value).slice(0, 10);
}

function friendlyDateRange(from: string | null | undefined, to: string | null | undefined) {
  return `${friendlyDateLabel(from)} - ${friendlyDateLabel(to)}`;
}

function friendlyDateLabel(value: string | null | undefined) {
  if (!value) return "-";
  const text = String(value).slice(0, 10);
  const date = new Date(`${text}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return text;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function hasProgressValue(value: number | null | undefined) {
  return value !== undefined && value !== null;
}

function num(value: number | null | undefined) {
  return new Intl.NumberFormat().format(Number(value || 0));
}
