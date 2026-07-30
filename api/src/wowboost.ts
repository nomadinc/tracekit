export type WowBoostCommerceReferenceEvidence = {
  value: string;
  source_field: string;
};

export type WowBoostRefundSource = "csv_receipt" | "json_receipt" | "order_status_fallback";

export type WowBoostRefundEvent = {
  workspace_id: string;
  platform: string;
  platform_order_id: string;
  order_id: string;
  connector_id: string;
  ledger_type: "refund";
  transaction_id: string;
  parent_transaction_id: string | null;
  amount: number;
  currency: string;
  occurred_at: string;
  status: string;
  source: WowBoostRefundSource;
  source_id: string | null;
  raw: Record<string, unknown>;
  meta: Record<string, unknown>;
};

export type WowBoostSnapshotMergeResult = {
  row: Record<string, any>;
  changed: boolean;
  protected_fields: string[];
};

export type WowBoostImportPageContinuation = {
  has_more: boolean;
  next_page: number | null;
};

export type WowBoostImportPageDateDiagnostics = {
  source_record_count: number;
  first_record_date: string | null;
  last_record_date: string | null;
  earliest_record_date: string | null;
  latest_record_date: string | null;
  in_range_record_count: number;
  out_of_range_record_count: number;
  before_range_record_count: number;
  after_range_record_count: number;
  invalid_or_missing_date_count: number;
  range_position: "empty" | "inside_or_overlapping" | "before_requested_window" | "after_requested_window" | "indeterminate";
};

export const WOWBOOST_IMPORT_MODES = [
  "order_snapshot_import",
  "receipt_event_backfill",
] as const;

export type WowBoostImportMode = (typeof WOWBOOST_IMPORT_MODES)[number];

export const WOWBOOST_SNAPSHOT_BEFORE_RANGE_PAGE_THRESHOLD = 2;
export const WOWBOOST_ORDER_SNAPSHOT_MAX_PAGES = 100;
export const WOWBOOST_RECEIPT_BACKFILL_DEFAULT_MAX_PAGES = 50;
export const WOWBOOST_RECEIPT_BACKFILL_MAX_PAGES = 250;
export const WOWBOOST_RECEIPT_BACKFILL_DEFAULT_MAX_SOURCE_ROWS = 5_000;
export const WOWBOOST_RECEIPT_BACKFILL_MAX_SOURCE_ROWS = 25_000;
export const WOWBOOST_SCHEDULED_COMMERCE_LOOKBACK_DAYS = 2;
export const WOWBOOST_SCHEDULED_COMMERCE_ACTIVE_JOB_STALE_MS = 2 * 60 * 60 * 1000;

export const WOWBOOST_IMPORT_MUTABLE_JOB_STATUSES = [
  "queued",
  "running",
  "importing",
  "retrying",
] as const;

export type WowBoostImportContinuationDecision = {
  mode: WowBoostImportMode;
  status: "importing" | "paused" | "completed";
  has_more: boolean;
  enqueue_next: boolean;
  next_page: number | null;
  continuation_page: number | null;
  termination_reason:
    | "upstream_has_more"
    | "upstream_exhausted"
    | "order_snapshot_window_passed"
    | "order_snapshot_max_pages_reached"
    | "receipt_backfill_max_pages_reached"
    | "receipt_backfill_max_source_rows_reached";
  partial: boolean;
  snapshot_phase_complete: boolean;
  consecutive_pages_before_range: number;
  receipt_pages_processed: number;
  receipt_source_rows_processed: number;
};

export function normalizeWowBoostImportMode(
  value: unknown,
  fallback: WowBoostImportMode = "order_snapshot_import",
): WowBoostImportMode {
  const normalized = cleanText(value).toLowerCase();
  return WOWBOOST_IMPORT_MODES.includes(normalized as WowBoostImportMode)
    ? normalized as WowBoostImportMode
    : fallback;
}

export function normalizeWowBoostReceiptBackfillMaxPages(value: unknown) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return WOWBOOST_RECEIPT_BACKFILL_DEFAULT_MAX_PAGES;
  return Math.min(WOWBOOST_RECEIPT_BACKFILL_MAX_PAGES, parsed);
}

export function normalizeWowBoostReceiptBackfillMaxSourceRows(value: unknown) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return WOWBOOST_RECEIPT_BACKFILL_DEFAULT_MAX_SOURCE_ROWS;
  return Math.min(WOWBOOST_RECEIPT_BACKFILL_MAX_SOURCE_ROWS, parsed);
}

export function wowBoostImportJobCanProcess(status: unknown) {
  return WOWBOOST_IMPORT_MUTABLE_JOB_STATUSES.includes(
    cleanText(status).toLowerCase() as (typeof WOWBOOST_IMPORT_MUTABLE_JOB_STATUSES)[number],
  );
}

function ymdInTimeZone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function addDaysToYmd(ymd: string, days: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return ymd;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function normalizeWowBoostScheduledTimezone(value: unknown, fallback = "UTC") {
  const candidate = cleanText(value) || fallback;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return fallback;
  }
}

export function buildWowBoostScheduledCommerceWindow(args: {
  now?: Date | string | number | null;
  timezone?: string | null;
  lookback_days?: number | string | null;
} = {}) {
  const now = args.now instanceof Date ? args.now : new Date(args.now ?? Date.now());
  const safeNow = Number.isFinite(now.getTime()) ? now : new Date();
  const timezone = normalizeWowBoostScheduledTimezone(args.timezone);
  const lookbackDays = Math.max(
    WOWBOOST_SCHEDULED_COMMERCE_LOOKBACK_DAYS,
    Math.min(14, Math.floor(Number(args.lookback_days ?? WOWBOOST_SCHEDULED_COMMERCE_LOOKBACK_DAYS)) || WOWBOOST_SCHEDULED_COMMERCE_LOOKBACK_DAYS),
  );
  const to = ymdInTimeZone(safeNow, timezone);
  const from = addDaysToYmd(to, -lookbackDays);
  return {
    from,
    to,
    timezone,
    lookback_days: lookbackDays,
  };
}

function uuidFromDigest(bytes: Uint8Array) {
  const value = Array.from(bytes.slice(0, 16));
  value[6] = (value[6] & 0x0f) | 0x50;
  value[8] = (value[8] & 0x3f) | 0x80;
  const hex = value.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function buildWowBoostScheduledImportDedupeKey(args: {
  workspace_id?: string | null;
  platform?: string | null;
  account_key?: string | null;
  mode?: string | null;
  filter?: string | null;
  schedule_key?: string | null;
  from: string;
  to: string;
}) {
  const workspaceId = cleanText(args.workspace_id) || "default";
  const platform = cleanText(args.platform) || "wowsuite:wowboost";
  const accountKey = cleanText(args.account_key) || platform;
  const mode = normalizeWowBoostImportMode(args.mode, "order_snapshot_import");
  const filter = cleanText(args.filter) || "all_sales";
  const scheduleKey = cleanText(args.schedule_key) || "unspecified";
  return [
    "wowboost_scheduled_commerce_snapshot_v1",
    scheduleKey,
    workspaceId,
    platform,
    accountKey,
    mode,
    filter,
    args.from,
    args.to,
  ].join(":");
}

export async function buildWowBoostScheduledImportJobId(args: {
  workspace_id?: string | null;
  platform?: string | null;
  account_key?: string | null;
  mode?: string | null;
  filter?: string | null;
  schedule_key?: string | null;
  from: string;
  to: string;
}) {
  const key = buildWowBoostScheduledImportDedupeKey(args);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return uuidFromDigest(new Uint8Array(digest));
}

export function wowBoostScheduledImportJobBlocks(job: Record<string, any>, args: {
  workspace_id?: string | null;
  platform?: string | null;
  account_key?: string | null;
  from: string;
  to: string;
  filter?: string | null;
  now?: Date | string | number | null;
  stale_ms?: number | null;
}) {
  const progress = job?.progress && typeof job.progress === "object" ? job.progress : {};
  const metadata = {
    ...((progress.metadata && typeof progress.metadata === "object") ? progress.metadata : {}),
    ...((job?.metadata && typeof job.metadata === "object") ? job.metadata : {}),
  };
  if (!wowBoostImportJobCanProcess(job?.status ?? progress.status)) return false;

  const now = args.now instanceof Date ? args.now : new Date(args.now ?? Date.now());
  const nowMs = Number.isFinite(now.getTime()) ? now.getTime() : Date.now();
  const staleMs = Math.max(1, Number(args.stale_ms ?? WOWBOOST_SCHEDULED_COMMERCE_ACTIVE_JOB_STALE_MS) || WOWBOOST_SCHEDULED_COMMERCE_ACTIVE_JOB_STALE_MS);
  const heartbeat = Date.parse(cleanText(job?.updated_at ?? progress.updated_at ?? job?.started_at ?? job?.requested_at));
  if (Number.isFinite(heartbeat) && nowMs - heartbeat > staleMs) return false;

  const mode = normalizeWowBoostImportMode(metadata.import_mode ?? progress.import_mode ?? "order_snapshot_import");
  if (mode !== "order_snapshot_import") return false;

  const workspaceId = cleanText(args.workspace_id) || "default";
  const jobWorkspace = cleanText(job?.workspace_id ?? progress.workspace_id ?? metadata.workspace_id) || "default";
  if (jobWorkspace !== workspaceId) return false;

  const platform = cleanText(args.platform) || "wowsuite:wowboost";
  const jobPlatform = cleanText(job?.platform ?? progress.platform);
  if (jobPlatform !== platform) return false;

  const filter = cleanText(args.filter) || "all_sales";
  const jobFilter = cleanText(job?.filter ?? progress.filter) || "all_sales";
  if (jobFilter !== filter) return false;

  const accountKey = cleanText(args.account_key);
  const jobAccountKey = cleanText(metadata.account_key ?? metadata.credential_platform);
  if (accountKey && jobAccountKey && accountKey !== jobAccountKey) return false;

  return (
    cleanText(job?.from_date ?? progress.requested_from) === args.from &&
    cleanText(job?.to_date ?? progress.requested_to) === args.to
  );
}

export function decideWowBoostImportContinuation(args: {
  mode: WowBoostImportMode;
  current_page: number;
  upstream_has_more: unknown;
  page_range_position: WowBoostImportPageDateDiagnostics["range_position"];
  previous_consecutive_pages_before_range?: number;
  snapshot_before_range_page_threshold?: number;
  snapshot_max_pages?: number;
  previous_receipt_pages_processed?: number;
  previous_receipt_source_rows_processed?: number;
  source_rows?: number;
  receipt_max_pages?: number;
  receipt_max_source_rows?: number;
}): WowBoostImportContinuationDecision {
  const mode = normalizeWowBoostImportMode(args.mode);
  const currentPage = Math.max(1, Math.floor(Number(args.current_page) || 1));
  const upstreamHasMore = Boolean(args.upstream_has_more);
  const priorBeforeRange = Math.max(0, Math.floor(Number(args.previous_consecutive_pages_before_range) || 0));
  const consecutivePagesBeforeRange = args.page_range_position === "before_requested_window"
    ? priorBeforeRange + 1
    : 0;
  const snapshotThreshold = Math.max(
    1,
    Math.floor(Number(args.snapshot_before_range_page_threshold) || WOWBOOST_SNAPSHOT_BEFORE_RANGE_PAGE_THRESHOLD),
  );
  const snapshotMaxPages = Math.max(
    snapshotThreshold,
    Math.floor(Number(args.snapshot_max_pages) || WOWBOOST_ORDER_SNAPSHOT_MAX_PAGES),
  );
  const receiptPagesProcessed = Math.max(
    0,
    Math.floor(Number(args.previous_receipt_pages_processed) || 0),
  ) + 1;
  const receiptSourceRowsProcessed = Math.max(
    0,
    Math.floor(Number(args.previous_receipt_source_rows_processed) || 0),
  ) + Math.max(0, Math.floor(Number(args.source_rows) || 0));
  const receiptMaxPages = normalizeWowBoostReceiptBackfillMaxPages(args.receipt_max_pages);
  const receiptMaxSourceRows = normalizeWowBoostReceiptBackfillMaxSourceRows(args.receipt_max_source_rows);

  const completed = (terminationReason: WowBoostImportContinuationDecision["termination_reason"]) => ({
    mode,
    status: "completed" as const,
    has_more: false,
    enqueue_next: false,
    next_page: null,
    continuation_page: null,
    termination_reason: terminationReason,
    partial: false,
    snapshot_phase_complete: mode === "order_snapshot_import",
    consecutive_pages_before_range: consecutivePagesBeforeRange,
    receipt_pages_processed: receiptPagesProcessed,
    receipt_source_rows_processed: receiptSourceRowsProcessed,
  });

  const paused = (terminationReason: WowBoostImportContinuationDecision["termination_reason"]) => ({
    mode,
    status: "paused" as const,
    has_more: true,
    enqueue_next: false,
    next_page: null,
    continuation_page: currentPage + 1,
    termination_reason: terminationReason,
    partial: true,
    snapshot_phase_complete: false,
    consecutive_pages_before_range: consecutivePagesBeforeRange,
    receipt_pages_processed: receiptPagesProcessed,
    receipt_source_rows_processed: receiptSourceRowsProcessed,
  });

  if (!upstreamHasMore) return completed("upstream_exhausted");

  if (mode === "order_snapshot_import") {
    if (consecutivePagesBeforeRange >= snapshotThreshold) {
      return completed("order_snapshot_window_passed");
    }
    if (currentPage >= snapshotMaxPages) {
      return paused("order_snapshot_max_pages_reached");
    }
  } else {
    if (receiptPagesProcessed >= receiptMaxPages) {
      return paused("receipt_backfill_max_pages_reached");
    }
    if (receiptSourceRowsProcessed >= receiptMaxSourceRows) {
      return paused("receipt_backfill_max_source_rows_reached");
    }
  }

  return {
    mode,
    status: "importing",
    has_more: true,
    enqueue_next: true,
    next_page: currentPage + 1,
    continuation_page: currentPage + 1,
    termination_reason: "upstream_has_more",
    partial: false,
    snapshot_phase_complete: false,
    consecutive_pages_before_range: consecutivePagesBeforeRange,
    receipt_pages_processed: receiptPagesProcessed,
    receipt_source_rows_processed: receiptSourceRowsProcessed,
  };
}

export function wowBoostRefundEventIsInRange(
  event: { occurred_at?: unknown },
  from: string,
  to: string,
) {
  const range = normalizeWowSuiteImportDateRange(from, to);
  const occurredAt = wowBoostEventTimestamp(event?.occurred_at);
  if (!range.ok || !occurredAt) return false;
  const timestamp = Date.parse(occurredAt);
  const fromTimestamp = Date.parse(`${range.from}T00:00:00.000Z`);
  const toExclusive = new Date(`${range.to}T00:00:00.000Z`);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  return Number.isFinite(timestamp) && timestamp >= fromTimestamp && timestamp < toExclusive.getTime();
}

export const WOWBOOST_COMMERCE_REFERENCE_FIELDS = [
  "ReferenceId",
  "Reference ID",
  "Reference Id",
  "reference_id",
  "reference-id",
] as const;
export const WOWBOOST_PLATFORM_VALUES = ["wowboost", "wowsuite:wowboost", "wowsuite"] as const;
export const WOWBOOST_ORDER_REFERENCE_DEBUG_EXPECTED = "4F4DA0F1-3DEE-437B-A849-32E7B25D174C";
export const WOWBOOST_ORDER_REFERENCE_DEBUG_KEYWORDS = [
  "reference",
  "external",
  "custom",
  "uuid",
  "cart",
  "master",
] as const;
export const WOWBOOST_ORDER_DETAILS_BACKFILL_DEFAULT_LIMIT = 10;
export const WOWBOOST_ORDER_DETAILS_BACKFILL_MAX_LIMIT = 20;
export const WOWBOOST_ORDER_DETAILS_PACING_DEFAULT_MS = 500;
export const WOWBOOST_ORDER_DETAILS_PACING_MIN_MS = 300;
export const WOWBOOST_ORDER_DETAILS_PACING_MAX_MS = 2_000;
export const WOWBOOST_ORDER_DETAILS_RATE_LIMIT_MAX_RETRIES = 5;
export const WOWBOOST_ORDER_DETAILS_RETRY_MAX_ATTEMPTS = WOWBOOST_ORDER_DETAILS_RATE_LIMIT_MAX_RETRIES + 1;
export const WOWBOOST_ORDER_DETAILS_RETRY_BASE_MS = 500;
export const WOWBOOST_ORDER_DETAILS_RETRY_CAP_MS = 5_000;
export const WOWBOOST_ORDER_DETAILS_BACKFILL_DEFAULT_FROM = "2026-04-01";
export const WOWBOOST_ORDER_DETAILS_PERMANENT_MISSING_ID_SAMPLE_LIMIT = 100;
export const WOWBOOST_LEGACY_EXPORT_DEFAULT_MAX_PAGES_PER_INVOCATION = 5;
export const WOWBOOST_LEGACY_EXPORT_MAX_PAGES_PER_INVOCATION = 10;
export const WOWBOOST_LEGACY_EXPORT_DEFAULT_MAX_ELAPSED_MS = 45_000;
export const WOWBOOST_LEGACY_EXPORT_MIN_MAX_ELAPSED_MS = 5_000;
export const WOWBOOST_LEGACY_EXPORT_MAX_MAX_ELAPSED_MS = 50_000;
export const WOWBOOST_RUNTIME_DEFAULT_MAX_EXPORT_PAGES = 150;
export const WOWBOOST_RUNTIME_MAX_EXPORT_PAGES = 1000;
export const WOWBOOST_RUNTIME_PAGE_FINGERPRINT_HISTORY_LIMIT = 8;

export type WowSuiteCredentialStatusRow = {
  platform?: string | null;
  base_url?: string | null;
  username?: string | null;
  password_ciphertext?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export function buildWowSuiteCredentialStatus(
  platform: "wowboost" | "wowpay",
  credential: WowSuiteCredentialStatusRow | null | undefined,
) {
  const baseUrl = credential?.base_url ? String(credential.base_url).trim() || null : null;
  const username = credential?.username ? String(credential.username).trim() || null : null;
  const hasPassword = Boolean(String(credential?.password_ciphertext ?? "").trim());
  const missing: string[] = [];

  if (!baseUrl) missing.push("base_url");
  if (!username) missing.push("username");
  if (!hasPassword) missing.push("password");

  return {
    ok: true,
    connected: Boolean(credential) && missing.length === 0,
    platform,
    credential_platform: credential?.platform ?? null,
    base_url: baseUrl,
    baseUrl,
    username,
    created_at: credential?.created_at ?? null,
    updated_at: credential?.updated_at ?? null,
    missing,
  };
}

export function normalizeWowSuiteImportDateRange(fromValue: unknown, toValue: unknown) {
  const from = String(fromValue ?? "").trim();
  const to = String(toValue ?? "").trim();

  const parseExactDate = (value: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;

    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    const canonical = [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0"),
    ].join("-");

    return canonical === value ? date : null;
  };

  const fromDate = parseExactDate(from);
  const toDate = parseExactDate(to);

  if (!fromDate || !toDate) {
    return { ok: false as const, error: "from/to must be valid YYYY-MM-DD dates" };
  }

  if (fromDate.getTime() > toDate.getTime()) {
    return { ok: false as const, error: "from must be on or before to" };
  }

  return { ok: true as const, from, to };
}

export type WowBoostCommerceReferenceBackfillRow = {
  platform?: string | null;
  platform_order_id?: string | null;
  order_id?: string | null;
  commerce_reference?: string | null;
  raw_json?: Record<string, any> | null;
};

export type WowBoostCommerceReferenceBackfillPatch = {
  platform_order_id: string;
  order_id: string | null;
  commerce_reference: string;
  source_field: string;
};

export type WowBoostCommerceReferenceExportRow = {
  order_id: string;
  order_number: string | null;
  transaction_id: string | null;
  commerce_reference: string;
  source_field: string;
  order_ts: string | null;
  raw: Record<string, any>;
};

export type WowBoostExistingPlatformOrderRow = {
  platform?: string | null;
  platform_order_id?: string | null;
  order_id?: string | null;
  transaction_id?: string | null;
  commerce_reference?: string | null;
};

export type WowBoostCommerceReferenceExportBackfillPatch = {
  platform_order_id: string;
  order_id: string | null;
  transaction_id: string | null;
  commerce_reference: string;
  existing_commerce_reference: string | null;
  source_field: string;
};

export type WowBoostCommerceReferenceBackfillDecision =
  | ({ action: "update" } & WowBoostCommerceReferenceBackfillPatch)
  | {
      action: "skip";
      reason: "not_wowboost" | "already_populated" | "missing_reference" | "invalid_reference";
      platform_order_id: string | null;
      order_id: string | null;
    };

export type WowBoostOrderDetailsReferenceBackfillRow = {
  platform?: string | null;
  platform_order_id?: string | null;
  order_id?: string | null;
  transaction_id?: string | null;
  commerce_reference?: string | null;
  order_ts?: string | null;
};

export type WowBoostOrderDetailsReferenceBackfillPatch = {
  platform_order_id: string;
  order_id: string | null;
  transaction_id: string | null;
  commerce_reference: string;
  existing_commerce_reference: string | null;
  source_field: string;
};

export type WowBoostOrderDetailsReferenceBackfillDecision =
  | ({ action: "update" } & WowBoostOrderDetailsReferenceBackfillPatch)
  | {
      action: "skip";
      reason: "not_wowboost" | "already_populated" | "missing_reference" | "invalid_reference";
      platform_order_id: string | null;
      order_id: string | null;
      transaction_id: string | null;
      existing_commerce_reference: string | null;
    };

export type WowBoostOrderDetailsBackfillDateRange =
  | {
      ok: true;
      from: string;
      to: string;
      from_iso: string;
      to_exclusive_iso: string;
    }
  | {
      ok: false;
      error: "missing_date_range" | "invalid_date_format" | "invalid_date_order";
      message: string;
    };

export type WowBoostOrderDetailsLookupOrderId = {
  value: string;
  source_field: "order_id" | "platform_order_id" | "legacy_order_number" | "";
};

export type WowBoostLegacyOrderNumberEvidence = {
  legacy_order_number: string;
  platform_order_id: string | null;
  source_field: "platform_order_id" | "";
  source_value: string | null;
};

export type WowBoostOrderNumberToOrderIdMapping = {
  order_number: string;
  order_ids: string[];
  row_count: number;
};

export type WowBoostLegacyOrderNumberResolution =
  | {
      status: "mapped";
      legacy_order_number: string;
      order_id: string;
      candidate_count: 1;
    }
  | {
      status: "unresolved";
      legacy_order_number: string;
      order_id: null;
      candidate_count: 0;
    }
  | {
      status: "ambiguous";
      legacy_order_number: string;
      order_id: null;
      candidate_count: number;
      candidate_order_ids: string[];
    };

export type WowBoostLegacyExportPagingProgress = {
  export_page: number;
  legacy_export_page: number;
  export_cursor: string | null;
  legacy_export_cursor: string | null;
  export_continuation_token: string | null;
  legacy_export_continuation_token: string | null;
};

export type WowBoostLegacyExportPage = {
  page: number;
  rows: Record<string, any>[];
  has_more: boolean;
  next_page?: number | null;
  continuation_token?: string | null;
};

export type WowBoostLegacyExportPageProcessedState = {
  page: number;
  next_page: number | null;
  continuation_token: string | null;
  rows_fetched: number;
  mappings_loaded_this_page: number;
  mappings_loaded: number;
  mapping_entries_loaded: number;
  resolution: WowBoostLegacyOrderNumberResolution;
  pending: boolean;
};

export type WowBoostLegacyExportScanResult = {
  legacy_order_number: string;
  start_page: number;
  end_page: number | null;
  next_page: number | null;
  next_continuation_token: string | null;
  pages_processed: number;
  rows_fetched: number;
  mappings_loaded: number;
  mapping_entries_loaded: number;
  mappings: Map<string, WowBoostOrderNumberToOrderIdMapping>;
  resolution: WowBoostLegacyOrderNumberResolution;
  has_more: boolean;
  execution_budget_reached: boolean;
};

export type WowBoostRuntimeStagingStopReason =
  | "all_targets_mapped"
  | "export_ended"
  | "empty_page"
  | "paging_loop_detected"
  | "max_export_pages_reached";

export type WowBoostRuntimeStagingStopDecision = {
  should_stop: boolean;
  reason: WowBoostRuntimeStagingStopReason | null;
};

export type WowBoostOrderDetailsLookupFailureClassification =
  | "permanent_not_found"
  | "transient"
  | "auth"
  | "blocking";

export type WowBoostOrderDetailsBackfillCursor = {
  current_platform: string;
  platform_order_id: string | null;
};

export type WowBoostOrderDetailsBackfillScanPlan = {
  table: "platform_orders";
  indexed_columns: readonly ["platform", "order_ts", "platform_order_id"];
  current_platform: string;
  platform_order_id_gt: string | null;
  order_ts_gte: string;
  order_ts_lt: string;
  order_by: "platform_order_id";
  limit: number;
  count_exact: false;
  filters: {
    platform_order_id_not_null: true;
    commerce_reference_blank_or_null: true;
    platform_in: readonly string[];
  };
};

export type WowBoostOrderReferenceFieldDiagnostic = {
  path: string;
  key: string;
  normalized_key: string;
  value?: string | number | boolean | null;
  value_type?: string;
  value_redacted?: boolean;
};

export type WowBoostOrderObjectKeyDiagnostic = {
  index: number;
  path: string;
  keys: string[];
};

export function extractWowBoostCommerceReference(row: Record<string, any>) {
  return extractWowBoostCommerceReferenceEvidence(row).value;
}

export function extractWowBoostCommerceReferenceEvidence(row: Record<string, any>): WowBoostCommerceReferenceEvidence {
  return pickWowBoostFieldWithSource(row, WOWBOOST_COMMERCE_REFERENCE_FIELDS);
}

export function normalizeWowBoostExportHeader(value: unknown) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

const WOWBOOST_RECEIPT_STATUS_FIELDS = [
  "Receipt Status Name",
  "Receipt Status",
  "Payment Status",
  "PaymentStatus",
  "paymentStatus",
  "status",
] as const;

const WOWBOOST_ORDER_STATUS_FIELDS = [
  "Order Status Name",
  "Order Status",
  "OrderStatus",
  "orderStatus",
] as const;

const WOWBOOST_REFUND_AMOUNT_FIELDS = [
  "Refund Amount",
  "Refunded Amount",
  "Return Amount",
  "refundAmount",
  "refundedAmount",
  "Amount USD",
  "Amount",
  "amountUSD",
  "amount",
] as const;

const WOWBOOST_REFUND_DATE_FIELDS = [
  "Refund Date",
  "Refund Created Date",
  "Refund Create Date",
  "Refund Completed Date",
  "Create Date (Receipts)",
  "Receipt Date",
  "Transaction Date",
  "createDate",
  "transactionDate",
  "updatedAt",
  "date",
] as const;

const WOWBOOST_RECEIPT_ID_FIELDS = [
  "Refund ID",
  "RefundId",
  "refundId",
  "Receipt ID",
  "ReceiptId",
  "receiptId",
  "Payment Receipt ID",
  "PaymentReceiptId",
  "Return ID",
  "ReturnId",
  "returnId",
] as const;

const WOWBOOST_RECEIPT_TRANSACTION_FIELDS = [
  "Refund Transaction ID",
  "RefundTransactionId",
  "refundTransactionId",
  "Receipt Transaction ID",
  "ReceiptTransactionId",
  "receiptTransactionId",
  "PaymentTrackingNumber",
  "Payment Tracking Number",
  "paymentTrackingNumber",
] as const;

const WOWBOOST_PARENT_TRANSACTION_FIELDS = [
  "TransactionId",
  "Transaction ID",
  "transactionId",
  "transactionID",
  "transaction_id",
] as const;

function wowBoostMoney(value: unknown) {
  const cleaned = String(value ?? "").replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? Math.abs(amount) : null;
}

function wowBoostEventTimestamp(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;

  const usDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (usDate) {
    const timestamp = Date.UTC(
      Number(usDate[3]),
      Number(usDate[1]) - 1,
      Number(usDate[2]),
      Number(usDate[4] || 0),
      Number(usDate[5] || 0),
      Number(usDate[6] || 0),
    );
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
  }

  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function wowBoostRefundStatus(value: unknown) {
  const status = cleanText(value);
  if (!status) return null;
  const normalized = status.toLowerCase();
  if (!/(^|\b)(refund|refunded|partiallyrefunded|partial refund|return)(\b|$)/.test(normalized)) return null;
  if (/declin|reject|failed|cancelled request|canceled request/.test(normalized)) return null;
  return status;
}

function wowBoostCurrency(value: unknown) {
  return cleanText(value).toUpperCase() || "USD";
}

function wowBoostEventComponent(value: unknown) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

function wowBoostSourceIdentityComponent(value: unknown) {
  return encodeURIComponent(cleanText(value));
}

function wowBoostSafeReceiptMetadata(record: Record<string, any>) {
  const metadata: Record<string, unknown> = {};
  const allowedFields = [
    ...WOWBOOST_RECEIPT_STATUS_FIELDS,
    ...WOWBOOST_REFUND_AMOUNT_FIELDS,
    ...WOWBOOST_REFUND_DATE_FIELDS,
    ...WOWBOOST_RECEIPT_ID_FIELDS,
    ...WOWBOOST_RECEIPT_TRANSACTION_FIELDS,
    ...WOWBOOST_PARENT_TRANSACTION_FIELDS,
    "Currency",
    "Currency Code",
    "currencyCode",
  ];
  const allowed = new Set(allowedFields.map(normalizeWowBoostExportHeader));

  for (const [key, value] of Object.entries(record || {})) {
    if (!allowed.has(normalizeWowBoostExportHeader(key))) continue;
    if (value == null || typeof value === "object") continue;
    metadata[key] = String(value).slice(0, 200);
  }

  return metadata;
}

function buildWowBoostRefundEvent(args: {
  record: Record<string, any>;
  order: Record<string, any>;
  workspace_id?: unknown;
  platform?: unknown;
  connector_id?: unknown;
  platform_order_id?: unknown;
  order_id?: unknown;
  source: WowBoostRefundSource;
}): WowBoostRefundEvent | null {
  const workspaceId = cleanText(args.workspace_id) || "default";
  const platform = cleanText(args.platform) || "wowboost";
  const orderId = cleanText(args.order_id);
  const platformOrderId = cleanText(args.platform_order_id) || `${platform}:${orderId}`;
  const connectorId = cleanText(args.connector_id) || platform;
  if (!orderId) return null;

  const receiptStatus = pickWowBoostField(args.record, WOWBOOST_RECEIPT_STATUS_FIELDS);
  const orderStatus = pickWowBoostField(args.order, WOWBOOST_ORDER_STATUS_FIELDS);
  const sourceStatus = args.source === "order_status_fallback"
    ? wowBoostRefundStatus(orderStatus)
    : wowBoostRefundStatus(receiptStatus);
  if (!sourceStatus) return null;

  const amountEvidence = pickWowBoostField(args.record, WOWBOOST_REFUND_AMOUNT_FIELDS)
    || (args.source === "order_status_fallback"
      ? pickWowBoostField(args.order, WOWBOOST_REFUND_AMOUNT_FIELDS)
      : "");
  const amount = wowBoostMoney(amountEvidence);
  if (amount == null || amount <= 0) return null;

  const occurredAt = wowBoostEventTimestamp(
    pickWowBoostField(args.record, WOWBOOST_REFUND_DATE_FIELDS)
      || pickWowBoostField(args.order, WOWBOOST_REFUND_DATE_FIELDS),
  );
  if (!occurredAt) return null;

  const receiptId = pickWowBoostField(args.record, WOWBOOST_RECEIPT_ID_FIELDS)
    || (args.source === "json_receipt" ? pickWowBoostField(args.record, ["id", "ID"]) : "");
  const receiptTransactionId = pickWowBoostField(args.record, WOWBOOST_RECEIPT_TRANSACTION_FIELDS);
  const genericReceiptTransactionId = args.source === "order_status_fallback"
    ? ""
    : pickWowBoostField(args.record, WOWBOOST_PARENT_TRANSACTION_FIELDS);
  const parentTransactionId = pickWowBoostField(args.order, WOWBOOST_PARENT_TRANSACTION_FIELDS)
    || (args.source === "order_status_fallback"
      ? pickWowBoostField(args.record, WOWBOOST_PARENT_TRANSACTION_FIELDS)
      : "")
    || null;
  const sourceId = receiptId || receiptTransactionId || genericReceiptTransactionId || null;
  const sourceIdentity = sourceId
    ? `source:${wowBoostSourceIdentityComponent(sourceId)}`
    : [
        "composite",
        wowBoostEventComponent(occurredAt),
        amount.toFixed(2),
        wowBoostEventComponent(sourceStatus),
      ].join(":");
  const transactionId = [
    "wowboost",
    "refund",
    wowBoostEventComponent(workspaceId),
    wowBoostEventComponent(platform),
    wowBoostEventComponent(connectorId),
    wowBoostEventComponent(orderId),
    sourceIdentity,
  ].join(":");

  return {
    workspace_id: workspaceId,
    platform,
    platform_order_id: platformOrderId,
    order_id: orderId,
    connector_id: connectorId,
    ledger_type: "refund",
    transaction_id: transactionId,
    parent_transaction_id: parentTransactionId,
    amount: -Math.abs(amount),
    currency: wowBoostCurrency(
      pickWowBoostField(args.record, ["Currency Code", "Currency", "currencyCode", "currency"])
        || pickWowBoostField(args.order, ["Currency Code", "Currency", "currencyCode", "currency"]),
    ),
    occurred_at: occurredAt,
    status: sourceStatus,
    source: args.source,
    source_id: sourceId,
    raw: wowBoostSafeReceiptMetadata(args.record),
    meta: {
      external_event_id: transactionId,
      platform_order_id: platformOrderId,
      receipt_id: receiptId || null,
      receipt_transaction_id: receiptTransactionId || genericReceiptTransactionId || null,
      source_status: sourceStatus,
      source: "wowboost_receipt_import",
      source_record_type: args.source,
    },
  };
}

export function extractWowBoostRefundEventsFromCsvRows(
  rows: Record<string, any>[],
  args: { workspace_id?: unknown; platform?: unknown; connector_id?: unknown } = {},
) {
  const events = new Map<string, WowBoostRefundEvent>();

  for (const row of rows || []) {
    const orderId = pickWowBoostField(row, [
      "Order ID",
      "OrderId",
      "OrderID",
      "order_id",
      "Id",
      "ID",
      "Order Number",
      "OrderNumber",
    ]);
    if (!orderId) continue;

    const receiptStatus = pickWowBoostField(row, WOWBOOST_RECEIPT_STATUS_FIELDS);
    const source: WowBoostRefundSource = receiptStatus
      ? "csv_receipt"
      : "order_status_fallback";
    const event = buildWowBoostRefundEvent({
      record: row,
      order: row,
      workspace_id: args.workspace_id,
      platform: args.platform,
      connector_id: args.connector_id,
      platform_order_id: `${cleanText(args.platform) || "wowboost"}:${orderId}`,
      order_id: orderId,
      source,
    });
    if (event) events.set(event.transaction_id, event);
  }

  return Array.from(events.values());
}

export function extractWowBoostRefundEventsFromJsonOrders(
  orders: Record<string, any>[],
  args: { workspace_id?: unknown; platform?: unknown; connector_id?: unknown } = {},
) {
  const events = new Map<string, WowBoostRefundEvent>();
  const platform = cleanText(args.platform) || "wowboost";

  for (const order of orders || []) {
    const orderId = cleanText(order?.orderId ?? order?.orderID ?? order?.id ?? order?.orderNumber);
    if (!orderId) continue;
    const receipts = Array.isArray(order?.receipts) ? order.receipts : [];

    if (receipts.length) {
      for (const receipt of receipts) {
        if (!receipt || typeof receipt !== "object") continue;
        const event = buildWowBoostRefundEvent({
          record: receipt,
          order,
          workspace_id: args.workspace_id,
          platform,
          connector_id: args.connector_id,
          platform_order_id: `${platform}:${orderId}`,
          order_id: orderId,
          source: "json_receipt",
        });
        if (event) events.set(event.transaction_id, event);
      }
      continue;
    }

    const event = buildWowBoostRefundEvent({
      record: order,
      order,
      workspace_id: args.workspace_id,
      platform,
      connector_id: args.connector_id,
      platform_order_id: `${platform}:${orderId}`,
      order_id: orderId,
      source: "order_status_fallback",
    });
    if (event) events.set(event.transaction_id, event);
  }

  return Array.from(events.values());
}

function wowBoostSparseMerge(existing: unknown, incoming: unknown): unknown {
  if (incoming === null || incoming === undefined) return existing;
  if (typeof incoming === "string" && !incoming.trim()) return existing;
  if (
    existing &&
    incoming &&
    typeof existing === "object" &&
    typeof incoming === "object" &&
    !Array.isArray(existing) &&
    !Array.isArray(incoming)
  ) {
    const merged: Record<string, unknown> = { ...(existing as Record<string, unknown>) };
    for (const [key, value] of Object.entries(incoming as Record<string, unknown>)) {
      merged[key] = wowBoostSparseMerge(merged[key], value);
    }
    return merged;
  }
  return incoming;
}

function stableWowBoostJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableWowBoostJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => (
      `${JSON.stringify(key)}:${stableWowBoostJson((value as Record<string, unknown>)[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function mergeWowBoostPlatformOrderSnapshot(
  existing: Record<string, any> | null | undefined,
  incoming: Record<string, any>,
): WowBoostSnapshotMergeResult {
  if (!existing) return { row: incoming, changed: true, protected_fields: [] };

  const row: Record<string, any> = {};
  const protectedFields: string[] = [];
  for (const [key, incomingValue] of Object.entries(incoming)) {
    const existingValue = existing[key];
    const sparse = incomingValue === null
      || incomingValue === undefined
      || (typeof incomingValue === "string" && !incomingValue.trim())
      || (
        (key === "status" || key === "status_norm")
        && String(incomingValue || "").trim().toUpperCase() === "UNKNOWN"
      );
    if (sparse && existingValue !== null && existingValue !== undefined && String(existingValue).trim()) {
      protectedFields.push(key);
    }
    row[key] = sparse
      ? wowBoostSparseMerge(existingValue, null)
      : wowBoostSparseMerge(existingValue, incomingValue);
  }

  return {
    row,
    changed: stableWowBoostJson(row) !== stableWowBoostJson(
      Object.fromEntries(Object.keys(incoming).map((key) => [key, existing[key]])),
    ),
    protected_fields: protectedFields,
  };
}

export function wowBoostImportPageContinuation(
  upstreamHasMore: unknown,
  currentPage: number,
): WowBoostImportPageContinuation {
  const hasMore = Boolean(upstreamHasMore);
  return {
    has_more: hasMore,
    next_page: hasMore ? Math.max(1, Number(currentPage) || 1) + 1 : null,
  };
}

export function summarizeWowBoostImportPageDates(
  values: unknown[],
  from: string,
  to: string,
): WowBoostImportPageDateDiagnostics {
  const range = normalizeWowSuiteImportDateRange(from, to);
  const sourceValues = Array.isArray(values) ? values : [];
  const parsedValues = sourceValues.map((value) => wowBoostEventTimestamp(value));
  const validDates = parsedValues
    .filter((value): value is string => Boolean(value))
    .map((value) => ({ iso: value, timestamp: Date.parse(value) }))
    .filter((value) => Number.isFinite(value.timestamp));

  if (!range.ok) {
    return {
      source_record_count: sourceValues.length,
      first_record_date: parsedValues[0] || null,
      last_record_date: parsedValues.length ? parsedValues[parsedValues.length - 1] || null : null,
      earliest_record_date: null,
      latest_record_date: null,
      in_range_record_count: 0,
      out_of_range_record_count: 0,
      before_range_record_count: 0,
      after_range_record_count: 0,
      invalid_or_missing_date_count: sourceValues.length - validDates.length,
      range_position: sourceValues.length ? "indeterminate" : "empty",
    };
  }

  const fromTimestamp = Date.parse(`${range.from}T00:00:00.000Z`);
  const toExclusive = new Date(`${range.to}T00:00:00.000Z`);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  const toTimestamp = toExclusive.getTime();
  const beforeRange = validDates.filter((value) => value.timestamp < fromTimestamp).length;
  const afterRange = validDates.filter((value) => value.timestamp >= toTimestamp).length;
  const inRange = validDates.length - beforeRange - afterRange;
  const invalidOrMissing = sourceValues.length - validDates.length;
  const timestamps = validDates.map((value) => value.timestamp);

  let rangePosition: WowBoostImportPageDateDiagnostics["range_position"] = "indeterminate";
  if (!sourceValues.length) {
    rangePosition = "empty";
  } else if (inRange > 0 || (beforeRange > 0 && afterRange > 0)) {
    rangePosition = "inside_or_overlapping";
  } else if (beforeRange === sourceValues.length) {
    rangePosition = "before_requested_window";
  } else if (afterRange === sourceValues.length) {
    rangePosition = "after_requested_window";
  }

  return {
    source_record_count: sourceValues.length,
    first_record_date: parsedValues[0] || null,
    last_record_date: parsedValues.length ? parsedValues[parsedValues.length - 1] || null : null,
    earliest_record_date: timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : null,
    latest_record_date: timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null,
    in_range_record_count: inRange,
    out_of_range_record_count: beforeRange + afterRange,
    before_range_record_count: beforeRange,
    after_range_record_count: afterRange,
    invalid_or_missing_date_count: invalidOrMissing,
    range_position: rangePosition,
  };
}

export function wowBoostExportContinuationTokenWithDateRange(args: {
  token?: unknown;
  from: string;
  to: string;
}) {
  const token = cleanText(args.token);
  if (!token) return null;

  try {
    const absolute = /^[a-z][a-z\d+\-.]*:/i.test(token);
    const url = new URL(token, "https://tracekit.local");
    url.searchParams.set("StartDate", args.from);
    url.searchParams.set("EndDate", args.to);
    return absolute ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return token;
  }
}

export function wowBoostExportHeaderDiagnostics(headers: string[], firstRow: Record<string, any> | null | undefined) {
  const normalizedExportHeaders = (headers || []).map((header) => normalizeWowBoostExportHeader(header));
  const firstRowKeys = Object.keys(firstRow || {});
  const detected = findWowBoostHeaderName(headers || [], WOWBOOST_COMMERCE_REFERENCE_FIELDS);

  return {
    export_headers: headers || [],
    normalized_export_headers: normalizedExportHeaders,
    first_row_keys: firstRowKeys,
    reference_header_detected: Boolean(detected),
    reference_header_name: detected || null,
    warnings: detected ? [] : ["reference_column_missing_from_export"],
  };
}

export function wowBoostOrderReferenceDiagnostics(
  payload: unknown,
  expectedReference = WOWBOOST_ORDER_REFERENCE_DEBUG_EXPECTED,
) {
  const topLevelResponseKeys = objectKeys(payload);
  const orderObjects = extractWowBoostOrderObjects(payload);
  const matchingFields: WowBoostOrderReferenceFieldDiagnostic[] = [];
  const candidateValues = new Set<string>();
  const expectedReferencePaths: string[] = [];
  const expectedComparable = cleanComparable(expectedReference);
  const visited = new WeakSet<object>();

  walkDiagnosticPayload(payload, [], visited, (entry) => {
    const normalizedKey = normalizeWowBoostExportHeader(entry.key);
    const normalizedPath = normalizeWowBoostExportHeader(entry.path.join("."));
    const keyMatches = WOWBOOST_ORDER_REFERENCE_DEBUG_KEYWORDS.some(
      (keyword) => normalizedKey.includes(keyword) || normalizedPath.includes(keyword),
    );
    const primitive = diagnosticPrimitiveValue(entry.value);

    if (expectedComparable && primitive !== undefined && cleanComparable(primitive) === expectedComparable) {
      expectedReferencePaths.push(entry.path.join("."));
    }

    if (!keyMatches) return;

    const path = entry.path.join(".");
    const redacted = shouldRedactDiagnosticValue(entry.path);
    const field: WowBoostOrderReferenceFieldDiagnostic = {
      path,
      key: entry.key,
      normalized_key: normalizedKey,
    };

    if (primitive === undefined) {
      field.value_type = Array.isArray(entry.value) ? "array" : typeof entry.value;
    } else if (redacted) {
      field.value_redacted = true;
      field.value_type = typeof primitive;
    } else {
      field.value = truncateDiagnosticValue(primitive);
      if (primitive !== null && String(primitive).trim()) candidateValues.add(String(primitive).trim());
    }

    matchingFields.push(field);
  });

  return {
    top_level_response_keys: topLevelResponseKeys,
    order_object_keys: orderObjects.map((order, index) => ({
      index,
      path: order.path,
      keys: Object.keys(order.value),
    })),
    matching_field_diagnostics: matchingFields.slice(0, 100),
    detected_candidate_reference_values: Array.from(candidateValues).slice(0, 100),
    expected_reference: expectedReference,
    expected_reference_found: expectedReferencePaths.length > 0,
    expected_reference_paths: expectedReferencePaths.slice(0, 25),
    warnings: orderObjects.length ? [] : ["order_object_not_detected"],
  };
}

export function extractWowBoostOrderDetailsCommerceReference(payload: unknown): WowBoostCommerceReferenceEvidence {
  if (!isPlainRecord(payload)) {
    return {
      value: "",
      source_field: "",
    };
  }

  const hit = Object.keys(payload).find((key) => normalizeWowBoostExportHeader(key) === "referenceid") || "";
  const value = hit ? cleanText(payload[hit]) : "";

  return {
    value,
    source_field: value ? hit : "",
  };
}

export function normalizeWowBoostOrderDetailsBackfillLimit(value: unknown) {
  return Math.max(
    1,
    Math.min(
      WOWBOOST_ORDER_DETAILS_BACKFILL_MAX_LIMIT,
      Number(value ?? WOWBOOST_ORDER_DETAILS_BACKFILL_DEFAULT_LIMIT) ||
        WOWBOOST_ORDER_DETAILS_BACKFILL_DEFAULT_LIMIT,
    ),
  );
}

export function normalizeWowBoostOrderDetailsBackfillDateRange(from: unknown, to: unknown): WowBoostOrderDetailsBackfillDateRange {
  const fromText = cleanText(from);
  const toText = cleanText(to);

  if (!fromText || !toText) {
    return {
      ok: false,
      error: "missing_date_range",
      message: "from and to are required in YYYY-MM-DD format",
    };
  }

  const fromDate = parseWowBoostYmd(fromText);
  const toDate = parseWowBoostYmd(toText);
  if (!fromDate || !toDate) {
    return {
      ok: false,
      error: "invalid_date_format",
      message: "from and to must be valid YYYY-MM-DD dates",
    };
  }

  if (fromDate.getTime() > toDate.getTime()) {
    return {
      ok: false,
      error: "invalid_date_order",
      message: "from must be on or before to",
    };
  }

  return {
    ok: true,
    from: formatWowBoostYmd(fromDate),
    to: formatWowBoostYmd(toDate),
    from_iso: fromDate.toISOString(),
    to_exclusive_iso: addWowBoostDaysUTC(toDate, 1).toISOString(),
  };
}

export function wowBoostOrderDetailsBackfillRowMatchesDateRange(
  row: WowBoostOrderDetailsReferenceBackfillRow,
  range: Extract<WowBoostOrderDetailsBackfillDateRange, { ok: true }>,
) {
  const ts = Date.parse(cleanText(row.order_ts));
  if (!Number.isFinite(ts)) return false;

  return ts >= Date.parse(range.from_iso) && ts < Date.parse(range.to_exclusive_iso);
}

export function filterWowBoostOrderDetailsBackfillRowsForScan(
  rows: WowBoostOrderDetailsReferenceBackfillRow[],
  args: {
    range: Extract<WowBoostOrderDetailsBackfillDateRange, { ok: true }>;
    cursor?: string | WowBoostOrderDetailsBackfillCursor | null;
    limit?: number;
  },
) {
  const cursor = parseWowBoostOrderDetailsBackfillCursor(args.cursor);
  const limit = normalizeWowBoostOrderDetailsBackfillLimit(args.limit);

  return (rows || [])
    .filter((row) => isWowBoostPlatformValue(row.platform))
    .filter((row) => cleanText(row.platform) === cursor.current_platform)
    .filter((row) => cleanText(row.platform_order_id))
    .filter((row) => !cleanText(row.commerce_reference))
    .filter((row) => wowBoostOrderDetailsBackfillRowMatchesDateRange(row, args.range))
    .filter((row) => !cursor.platform_order_id || cleanText(row.platform_order_id) > cursor.platform_order_id)
    .sort((a, b) => cleanText(a.platform_order_id).localeCompare(cleanText(b.platform_order_id)))
    .slice(0, limit);
}

export function normalizeWowBoostOrderDetailsBackfillPlatform(value: unknown) {
  const platform = cleanComparable(value);
  return (WOWBOOST_PLATFORM_VALUES as readonly string[]).includes(platform)
    ? platform
    : WOWBOOST_PLATFORM_VALUES[0];
}

export function inferWowBoostOrderDetailsBackfillPlatformFromOrderId(value: unknown) {
  const text = cleanText(value);
  if (text.startsWith("wowsuite:wowboost:")) return "wowsuite:wowboost";
  if (text.startsWith("wowboost:")) return "wowboost";
  if (text.startsWith("wowsuite:")) return "wowsuite";
  return WOWBOOST_PLATFORM_VALUES[0];
}

export function parseWowBoostOrderDetailsBackfillCursor(
  value: unknown,
  fallbackPlatform?: unknown,
): WowBoostOrderDetailsBackfillCursor {
  if (isPlainRecord(value)) {
    return {
      current_platform: normalizeWowBoostOrderDetailsBackfillPlatform(value.current_platform ?? fallbackPlatform),
      platform_order_id: cleanText(value.platform_order_id) || null,
    };
  }

  const text = cleanText(value);
  if (!text) {
    return {
      current_platform: normalizeWowBoostOrderDetailsBackfillPlatform(fallbackPlatform),
      platform_order_id: null,
    };
  }

  if (text.startsWith("{")) {
    try {
      return parseWowBoostOrderDetailsBackfillCursor(JSON.parse(text), fallbackPlatform);
    } catch {
      // Fall through to legacy cursor handling.
    }
  }

  return {
    current_platform: normalizeWowBoostOrderDetailsBackfillPlatform(
      fallbackPlatform || inferWowBoostOrderDetailsBackfillPlatformFromOrderId(text),
    ),
    platform_order_id: text,
  };
}

export function serializeWowBoostOrderDetailsBackfillCursor(cursor: WowBoostOrderDetailsBackfillCursor | null) {
  if (!cursor) return null;
  return JSON.stringify({
    current_platform: normalizeWowBoostOrderDetailsBackfillPlatform(cursor.current_platform),
    platform_order_id: cleanText(cursor.platform_order_id) || null,
  });
}

export function nextWowBoostOrderDetailsBackfillPlatform(platform: unknown) {
  const normalized = normalizeWowBoostOrderDetailsBackfillPlatform(platform);
  const index = (WOWBOOST_PLATFORM_VALUES as readonly string[]).indexOf(normalized);
  const next = index >= 0 ? WOWBOOST_PLATFORM_VALUES[index + 1] : null;
  return next || null;
}

export function wowBoostOrderDetailsBackfillScanPlan(args: {
  range: Extract<WowBoostOrderDetailsBackfillDateRange, { ok: true }>;
  cursor?: string | WowBoostOrderDetailsBackfillCursor | null;
  limit?: number;
}): WowBoostOrderDetailsBackfillScanPlan {
  const cursor = parseWowBoostOrderDetailsBackfillCursor(args.cursor);

  return {
    table: "platform_orders",
    indexed_columns: ["platform", "order_ts", "platform_order_id"],
    current_platform: cursor.current_platform,
    platform_order_id_gt: cursor.platform_order_id,
    order_ts_gte: args.range.from_iso,
    order_ts_lt: args.range.to_exclusive_iso,
    order_by: "platform_order_id",
    limit: normalizeWowBoostOrderDetailsBackfillLimit(args.limit) + 1,
    count_exact: false,
    filters: {
      platform_order_id_not_null: true,
      commerce_reference_blank_or_null: true,
      platform_in: WOWBOOST_PLATFORM_VALUES,
    },
  };
}

export function isWowBoostOrderDetailsBackfillStatementTimeout(error: unknown) {
  const message = cleanComparable((error as any)?.message || error);
  const code = cleanComparable((error as any)?.code);
  return code === "57014" || message.includes("statement timeout") || message.includes("canceling statement");
}

export function resolveWowBoostOrderDetailsLookupOrderId(
  row: WowBoostOrderDetailsReferenceBackfillRow,
): WowBoostOrderDetailsLookupOrderId {
  const orderId = cleanText(row.order_id);
  if (orderId) {
    return /^\d+$/.test(orderId)
      ? { value: orderId, source_field: "order_id" }
      : { value: "", source_field: "order_id" };
  }

  const legacyOrderNumber = extractWowBoostLegacyOrderNumberEvidence(row);
  if (legacyOrderNumber.legacy_order_number) {
    return { value: "", source_field: "legacy_order_number" };
  }

  const platformOrderId = cleanText(row.platform_order_id);
  const platformOrderIdTail = platformOrderId.split(":").filter(Boolean).pop() || "";

  return /^\d+$/.test(platformOrderIdTail)
    ? { value: platformOrderIdTail, source_field: "platform_order_id" }
    : { value: "", source_field: platformOrderId ? "platform_order_id" : "" };
}

export function normalizeWowBoostLegacyOrderNumber(value: unknown) {
  const text = cleanText(value);
  return /^\d+$/.test(text) ? text : "";
}

export function extractWowBoostLegacyOrderNumberEvidence(
  row: WowBoostOrderDetailsReferenceBackfillRow,
): WowBoostLegacyOrderNumberEvidence {
  const platform = cleanComparable(row.platform);
  const orderId = cleanText(row.order_id);
  const platformOrderId = cleanText(row.platform_order_id);
  if (platform !== "wowsuite:wowboost" || orderId || !platformOrderId) {
    return {
      legacy_order_number: "",
      platform_order_id: platformOrderId || null,
      source_field: platformOrderId ? "platform_order_id" : "",
      source_value: platformOrderId || null,
    };
  }

  const suffix = platformOrderId.split(":").filter(Boolean).pop() || "";
  return {
    legacy_order_number: normalizeWowBoostLegacyOrderNumber(suffix),
    platform_order_id: platformOrderId,
    source_field: "platform_order_id",
    source_value: platformOrderId,
  };
}

export function buildWowBoostOrderNumberToOrderIdMap(
  exportRows: Record<string, any>[],
): Map<string, WowBoostOrderNumberToOrderIdMapping> {
  const mappings = new Map<string, WowBoostOrderNumberToOrderIdMapping>();

  for (const rawRow of exportRows || []) {
    const exportRow = normalizeWowBoostCommerceReferenceExportRow(rawRow);
    const orderNumber = normalizeWowBoostLegacyOrderNumber(exportRow.order_number);
    const orderId = normalizeWowBoostLegacyOrderNumber(exportRow.order_id);
    if (!orderNumber || !orderId) continue;

    const existing = mappings.get(orderNumber) || {
      order_number: orderNumber,
      order_ids: [],
      row_count: 0,
    };
    existing.row_count += 1;
    if (!existing.order_ids.includes(orderId)) existing.order_ids.push(orderId);
    mappings.set(orderNumber, existing);
  }

  return mappings;
}

export function mergeWowBoostOrderNumberToOrderIdMappings(
  target: Map<string, WowBoostOrderNumberToOrderIdMapping>,
  source: Map<string, WowBoostOrderNumberToOrderIdMapping>,
) {
  for (const [orderNumber, mapping] of source.entries()) {
    const existing = target.get(orderNumber) || {
      order_number: orderNumber,
      order_ids: [],
      row_count: 0,
    };
    existing.row_count += mapping.row_count;
    for (const orderId of mapping.order_ids) {
      if (!existing.order_ids.includes(orderId)) existing.order_ids.push(orderId);
    }
    target.set(orderNumber, existing);
  }

  return target;
}

export function resolveWowBoostLegacyOrderNumber(
  mappings: Map<string, WowBoostOrderNumberToOrderIdMapping>,
  legacyOrderNumber: unknown,
): WowBoostLegacyOrderNumberResolution {
  const normalized = normalizeWowBoostLegacyOrderNumber(legacyOrderNumber);
  const mapping = normalized ? mappings.get(normalized) : null;
  if (!normalized || !mapping || !mapping.order_ids.length) {
    return {
      status: "unresolved",
      legacy_order_number: normalized,
      order_id: null,
      candidate_count: 0,
    };
  }

  if (mapping.order_ids.length > 1) {
    return {
      status: "ambiguous",
      legacy_order_number: normalized,
      order_id: null,
      candidate_count: mapping.order_ids.length,
      candidate_order_ids: [...mapping.order_ids],
    };
  }

  return {
    status: "mapped",
    legacy_order_number: normalized,
    order_id: mapping.order_ids[0],
    candidate_count: 1,
  };
}

export function normalizeWowBoostLegacyExportPage(value: unknown, fallback = 1) {
  return Math.max(1, Number(value ?? fallback) || fallback);
}

export function normalizeWowBoostLegacyMaxExportPagesPerInvocation(value: unknown) {
  const raw = value === undefined || value === null || value === ""
    ? WOWBOOST_LEGACY_EXPORT_DEFAULT_MAX_PAGES_PER_INVOCATION
    : Number(value);
  const pages = Number.isFinite(raw) ? raw : WOWBOOST_LEGACY_EXPORT_DEFAULT_MAX_PAGES_PER_INVOCATION;
  return Math.max(
    1,
    Math.min(
      WOWBOOST_LEGACY_EXPORT_MAX_PAGES_PER_INVOCATION,
      pages,
    ),
  );
}

export function normalizeWowBoostLegacyExportMaxElapsedMs(value: unknown) {
  const raw = value === undefined || value === null || value === ""
    ? WOWBOOST_LEGACY_EXPORT_DEFAULT_MAX_ELAPSED_MS
    : Number(value);
  const elapsedMs = Number.isFinite(raw) ? raw : WOWBOOST_LEGACY_EXPORT_DEFAULT_MAX_ELAPSED_MS;
  return Math.max(
    WOWBOOST_LEGACY_EXPORT_MIN_MAX_ELAPSED_MS,
    Math.min(
      WOWBOOST_LEGACY_EXPORT_MAX_MAX_ELAPSED_MS,
      elapsedMs,
    ),
  );
}

export function normalizeWowBoostRuntimeMaxExportPages(value: unknown) {
  const raw = value === undefined || value === null || value === ""
    ? WOWBOOST_RUNTIME_DEFAULT_MAX_EXPORT_PAGES
    : Number(value);
  const pages = Number.isFinite(raw) ? raw : WOWBOOST_RUNTIME_DEFAULT_MAX_EXPORT_PAGES;
  return Math.max(1, Math.min(WOWBOOST_RUNTIME_MAX_EXPORT_PAGES, pages));
}

export function wowBoostExportPageFingerprint(rows: Record<string, any>[]) {
  const entries = (rows || []).map((row) => {
    const normalized = normalizeWowBoostCommerceReferenceExportRow(row);
    const orderNumber = normalizeWowBoostLegacyOrderNumber(normalized.order_number) || cleanComparable(normalized.order_number);
    const orderId = normalizeWowBoostLegacyOrderNumber(normalized.order_id) || cleanComparable(normalized.order_id);
    return `${orderNumber}:${orderId}`;
  }).sort();
  return `rows=${entries.length};hash=${stableWowBoostHash(entries.join("|"))}`;
}

export function wowBoostRuntimeRepeatedPageDetected(args: {
  fingerprint: unknown;
  history?: unknown;
}) {
  const fingerprint = cleanText(args.fingerprint);
  const history = Array.isArray(args.history) ? args.history.map((value) => cleanText(value)).filter(Boolean) : [];
  return Boolean(fingerprint && history.includes(fingerprint));
}

export function appendWowBoostRuntimePageFingerprint(args: {
  fingerprint: unknown;
  history?: unknown;
  limit?: number;
}) {
  const fingerprint = cleanText(args.fingerprint);
  const history = Array.isArray(args.history) ? args.history.map((value) => cleanText(value)).filter(Boolean) : [];
  const limit = Math.max(1, Number(args.limit || WOWBOOST_RUNTIME_PAGE_FINGERPRINT_HISTORY_LIMIT) || WOWBOOST_RUNTIME_PAGE_FINGERPRINT_HISTORY_LIMIT);
  return [...history, fingerprint].filter(Boolean).slice(-limit);
}

export function wowBoostRuntimeStagingStopDecision(args: {
  target_total?: unknown;
  target_remaining?: unknown;
  rows_fetched?: unknown;
  has_more?: boolean;
  repeated_page?: boolean;
  page?: unknown;
  max_pages?: unknown;
}): WowBoostRuntimeStagingStopDecision {
  const total = Math.max(0, Number(args.target_total || 0));
  const remaining = Math.max(0, Number(args.target_remaining || 0));
  const rowsFetched = Math.max(0, Number(args.rows_fetched || 0));
  const page = Math.max(1, Number(args.page || 1) || 1);
  const maxPages = normalizeWowBoostRuntimeMaxExportPages(args.max_pages);

  if (total === 0 || remaining === 0) return { should_stop: true, reason: "all_targets_mapped" };
  if (rowsFetched === 0) return { should_stop: true, reason: "empty_page" };
  if (args.repeated_page) return { should_stop: true, reason: "paging_loop_detected" };
  if (!args.has_more) return { should_stop: true, reason: "export_ended" };
  if (page >= maxPages) return { should_stop: true, reason: "max_export_pages_reached" };
  return { should_stop: false, reason: null };
}

export function restoreWowBoostLegacyExportPage(args: {
  requested_page?: unknown;
  progress?: Record<string, any> | null;
  current_cursor?: unknown;
  fallback?: number;
}) {
  const requestedPage = args.requested_page;
  if (requestedPage !== undefined && requestedPage !== null && String(requestedPage).trim() !== "") {
    return normalizeWowBoostLegacyExportPage(requestedPage, args.fallback ?? 1);
  }

  const progress = args.progress || {};
  const currentCursor = cleanText(args.current_cursor);
  const exportCursor = cleanText(progress.export_cursor || progress.legacy_export_cursor);
  if (!currentCursor || !exportCursor || exportCursor !== currentCursor) {
    return normalizeWowBoostLegacyExportPage(args.fallback ?? 1);
  }

  return normalizeWowBoostLegacyExportPage(
    progress.export_page ?? progress.legacy_export_page ?? progress.current_page,
    args.fallback ?? 1,
  );
}

export function requestedWowBoostLegacyExportPage(body: unknown) {
  const record = (body || {}) as Record<string, any>;
  const value = record.export_page ?? record.exportPage;
  if (value === undefined || value === null || String(value).trim() === "") return undefined;
  return value;
}

export function wowBoostLegacyExportPageForRequest(args: {
  body?: unknown;
  progress?: Record<string, any> | null;
  current_cursor?: unknown;
  fallback?: number;
}) {
  return restoreWowBoostLegacyExportPage({
    requested_page: requestedWowBoostLegacyExportPage(args.body),
    progress: args.progress,
    current_cursor: args.current_cursor,
    fallback: args.fallback,
  });
}

export function wowBoostLegacyExportPagingProgress(args: {
  pending: boolean;
  cursor: unknown;
  next_page?: unknown;
  continuation_token?: unknown;
}): WowBoostLegacyExportPagingProgress {
  if (!args.pending) {
    return {
      export_page: 1,
      legacy_export_page: 1,
      export_cursor: null,
      legacy_export_cursor: null,
      export_continuation_token: null,
      legacy_export_continuation_token: null,
    };
  }

  const exportPage = normalizeWowBoostLegacyExportPage(args.next_page, 1);
  const cursor = cleanText(args.cursor) || null;
  const token = cleanText(args.continuation_token) || null;

  return {
    export_page: exportPage,
    legacy_export_page: exportPage,
    export_cursor: cursor,
    legacy_export_cursor: cursor,
    export_continuation_token: token,
    legacy_export_continuation_token: token,
  };
}

export function wowBoostLegacyOrderNumberDeferredWarning(args: {
  legacy_order_number: unknown;
  start_page?: unknown;
  end_page?: unknown;
}) {
  const orderNumber = normalizeWowBoostLegacyOrderNumber(args.legacy_order_number) || cleanText(args.legacy_order_number) || "unknown";
  const startPage = normalizeWowBoostLegacyExportPage(args.start_page, 1);
  const endPage = normalizeWowBoostLegacyExportPage(args.end_page, startPage);
  return `legacy_order_number_mapping_deferred:${orderNumber}:pages_${startPage}_to_${Math.max(startPage, endPage)}`;
}

export async function scanWowBoostLegacyOrderNumberExportPages(args: {
  legacy_order_number: unknown;
  start_page?: unknown;
  max_pages_per_invocation?: unknown;
  max_elapsed_ms?: unknown;
  started_at_ms?: number;
  now_ms?: () => number;
  fetch_page: (page: number) => Promise<WowBoostLegacyExportPage>;
  on_page_processed?: (state: WowBoostLegacyExportPageProcessedState) => void | Promise<void>;
}): Promise<WowBoostLegacyExportScanResult> {
  const legacyOrderNumber = normalizeWowBoostLegacyOrderNumber(args.legacy_order_number);
  const startPage = normalizeWowBoostLegacyExportPage(args.start_page, 1);
  const maxPages = normalizeWowBoostLegacyMaxExportPagesPerInvocation(args.max_pages_per_invocation);
  const maxElapsedMs = normalizeWowBoostLegacyExportMaxElapsedMs(args.max_elapsed_ms);
  const nowMs = args.now_ms || (() => Date.now());
  const startedAtMs = Number(args.started_at_ms ?? nowMs()) || nowMs();
  const mappings = new Map<string, WowBoostOrderNumberToOrderIdMapping>();
  let currentPage = startPage;
  let pagesProcessed = 0;
  let rowsFetched = 0;
  let mappingEntriesLoaded = 0;
  let endPage: number | null = null;
  let nextPage: number | null = null;
  let nextContinuationToken: string | null = null;
  let hasMore = false;
  let executionBudgetReached = false;
  let resolution = resolveWowBoostLegacyOrderNumber(mappings, legacyOrderNumber);

  for (;;) {
    if (pagesProcessed >= maxPages) {
      executionBudgetReached = true;
      break;
    }
    if (pagesProcessed > 0 && nowMs() - startedAtMs >= maxElapsedMs) {
      executionBudgetReached = true;
      break;
    }

    const page = await args.fetch_page(currentPage);
    const pageMappings = buildWowBoostOrderNumberToOrderIdMap(page.rows || []);
    mergeWowBoostOrderNumberToOrderIdMappings(mappings, pageMappings);

    pagesProcessed += 1;
    rowsFetched += (page.rows || []).length;
    mappingEntriesLoaded += pageMappings.size;
    endPage = page.page;
    hasMore = Boolean(page.has_more);
    nextPage = hasMore ? normalizeWowBoostLegacyExportPage(page.next_page, page.page + 1) : null;
    nextContinuationToken = hasMore ? cleanText(page.continuation_token) || null : null;
    resolution = resolveWowBoostLegacyOrderNumber(mappings, legacyOrderNumber);

    const terminal = resolution.status !== "unresolved" || !hasMore;
    const pending = !terminal;
    if (args.on_page_processed) {
      await args.on_page_processed({
        page: page.page,
        next_page: nextPage,
        continuation_token: nextContinuationToken,
        rows_fetched: (page.rows || []).length,
        mappings_loaded_this_page: pageMappings.size,
        mappings_loaded: mappings.size,
        mapping_entries_loaded: mappingEntriesLoaded,
        resolution,
        pending,
      });
    }

    if (terminal) break;

    currentPage = nextPage || page.page + 1;
  }

  if (executionBudgetReached && hasMore) {
    nextPage = nextPage || currentPage;
  }

  return {
    legacy_order_number: legacyOrderNumber,
    start_page: startPage,
    end_page: endPage,
    next_page: hasMore ? nextPage : null,
    next_continuation_token: hasMore ? nextContinuationToken : null,
    pages_processed: pagesProcessed,
    rows_fetched: rowsFetched,
    mappings_loaded: mappings.size,
    mapping_entries_loaded: mappingEntriesLoaded,
    mappings,
    resolution,
    has_more: Boolean(hasMore && resolution.status === "unresolved"),
    execution_budget_reached: Boolean(executionBudgetReached && hasMore && resolution.status === "unresolved"),
  };
}

export function normalizeWowBoostOrderDetailsPacingMs(value: unknown) {
  return Math.max(
    WOWBOOST_ORDER_DETAILS_PACING_MIN_MS,
    Math.min(
      WOWBOOST_ORDER_DETAILS_PACING_MAX_MS,
      Number(value ?? WOWBOOST_ORDER_DETAILS_PACING_DEFAULT_MS) ||
        WOWBOOST_ORDER_DETAILS_PACING_DEFAULT_MS,
    ),
  );
}

export function isTransientWowBoostOrderDetailsStatus(status: unknown) {
  const code = Number(status);
  return code === 408 || code === 409 || code === 425 || code === 429 || (code >= 500 && code <= 599);
}

export function isWowBoostOrderDetailsAuthFailureStatus(status: unknown) {
  const code = Number(status);
  return code === 401 || code === 403;
}

export function isWowBoostOrderDetailsPermanentNotFound(args: {
  status?: number | string | null;
  error?: unknown;
}) {
  const status = Number(args.status);
  if (status === 404) return true;

  const text = cleanComparable(args.error);
  const compact = normalizeWowBoostExportHeader(text);
  return (
    compact.includes("ordernotfound") ||
    compact.includes("orderdoesnotexist") ||
    compact.includes("orderwasnotfound")
  );
}

export function classifyWowBoostOrderDetailsLookupFailure(args: {
  status?: number | string | null;
  error?: unknown;
  transient?: boolean | null;
}): WowBoostOrderDetailsLookupFailureClassification {
  if (isWowBoostOrderDetailsAuthFailureStatus(args.status)) return "auth";
  if (isWowBoostOrderDetailsPermanentNotFound(args)) return "permanent_not_found";
  if (args.transient || isTransientWowBoostOrderDetailsStatus(args.status)) return "transient";

  const text = cleanComparable(args.error);
  if (
    text.includes("timeout") ||
    text.includes("timed out") ||
    text.includes("abort") ||
    text.includes("aborted") ||
    text.includes("aborterror") ||
    text.includes("deadline") ||
    text.includes("headers timeout") ||
    text.includes("socket hang up") ||
    text.includes("econnreset") ||
    text.includes("etimedout") ||
    text.includes("und_err_headers_timeout") ||
    text.includes("temporarily") ||
    text.includes("network") ||
    text.includes("fetch")
  ) {
    return "transient";
  }

  return "blocking";
}

export function capWowBoostPermanentMissingOrderIds(
  existing: unknown,
  incoming: unknown,
  limit = WOWBOOST_ORDER_DETAILS_PERMANENT_MISSING_ID_SAMPLE_LIMIT,
) {
  const normalizedLimit = Math.max(0, Number(limit) || 0);
  const values = [
    ...(Array.isArray(existing) ? existing : []),
    ...(Array.isArray(incoming) ? incoming : []),
  ].map((value) => cleanText(value)).filter(Boolean);
  const recentUnique: string[] = [];

  for (const value of values) {
    const existingIndex = recentUnique.indexOf(value);
    if (existingIndex >= 0) recentUnique.splice(existingIndex, 1);
    recentUnique.push(value);
  }

  return normalizedLimit ? recentUnique.slice(-normalizedLimit) : [];
}

export function parseWowBoostRetryAfterMs(value: unknown, nowMs = Date.now()) {
  const text = cleanText(value);
  if (!text) return null;

  const seconds = Number(text);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);

  const dateMs = Date.parse(text);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - nowMs);

  return null;
}

export function wowBoostOrderDetailsRetryDelayMs(args: {
  attempt: number;
  status?: number | null;
  retryAfterMs?: number | null;
  jitterMs?: number;
  baseMs?: number;
  capMs?: number;
}) {
  const attempt = Math.max(1, Number(args.attempt) || 1);
  const baseMs = Math.max(1, Number(args.baseMs ?? WOWBOOST_ORDER_DETAILS_RETRY_BASE_MS) || WOWBOOST_ORDER_DETAILS_RETRY_BASE_MS);
  const capMs = Math.max(baseMs, Number(args.capMs ?? WOWBOOST_ORDER_DETAILS_RETRY_CAP_MS) || WOWBOOST_ORDER_DETAILS_RETRY_CAP_MS);
  const jitterMs = Math.max(0, Number(args.jitterMs ?? 0) || 0);
  const exponential = baseMs * Math.pow(2, attempt - 1);
  const retryAfterMs = args.retryAfterMs === null || args.retryAfterMs === undefined ? null : Math.max(0, Number(args.retryAfterMs) || 0);
  const rawDelay = retryAfterMs === null ? exponential + jitterMs : Math.max(retryAfterMs, exponential) + jitterMs;

  return Math.min(capMs, Math.round(rawDelay));
}

export function wowBoostOrderDetailsBackfillNextCursor(
  rows: WowBoostOrderDetailsReferenceBackfillRow[],
  hasMore: boolean,
  args: { processedCount?: number; inputCursor?: string | null; blocked?: boolean } = {},
) {
  const blocked = Boolean(args.blocked);
  if (!hasMore && !blocked) return null;

  const processedCount = Math.max(0, Math.min(rows.length, Number(args.processedCount ?? rows.length) || 0));
  if (!processedCount) return cleanText(args.inputCursor) || null;

  return cleanText(rows[processedCount - 1]?.platform_order_id) || cleanText(args.inputCursor) || null;
}

export function buildWowBoostOrderDetailsReferenceBackfillDecision(
  row: WowBoostOrderDetailsReferenceBackfillRow,
  orderDetailsPayload: unknown,
): WowBoostOrderDetailsReferenceBackfillDecision {
  const platformOrderId = cleanText(row.platform_order_id) || null;
  const orderId = cleanText(row.order_id) || null;
  const transactionId = cleanText(row.transaction_id) || null;
  const existingCommerceReference = cleanText(row.commerce_reference) || null;
  const lookupOrderId = resolveWowBoostOrderDetailsLookupOrderId(row);

  if (!isWowBoostPlatformValue(row.platform)) {
    return {
      action: "skip",
      reason: "not_wowboost",
      platform_order_id: platformOrderId,
      order_id: orderId,
      transaction_id: transactionId,
      existing_commerce_reference: existingCommerceReference,
    };
  }

  if (!platformOrderId || (!lookupOrderId.value && !orderDetailsPayload)) {
    return {
      action: "skip",
      reason: "invalid_reference",
      platform_order_id: platformOrderId,
      order_id: orderId,
      transaction_id: transactionId,
      existing_commerce_reference: existingCommerceReference,
    };
  }

  if (existingCommerceReference) {
    return {
      action: "skip",
      reason: "already_populated",
      platform_order_id: platformOrderId,
      order_id: orderId,
      transaction_id: transactionId,
      existing_commerce_reference: existingCommerceReference,
    };
  }

  const evidence = extractWowBoostOrderDetailsCommerceReference(orderDetailsPayload);
  if (!evidence.value) {
    return {
      action: "skip",
      reason: "missing_reference",
      platform_order_id: platformOrderId,
      order_id: orderId,
      transaction_id: transactionId,
      existing_commerce_reference: existingCommerceReference,
    };
  }

  return {
    action: "update",
    platform_order_id: platformOrderId,
    order_id: orderId,
    transaction_id: transactionId,
    commerce_reference: evidence.value,
    existing_commerce_reference: null,
    source_field: evidence.source_field,
  };
}

export function summarizeWowBoostOrderDetailsReferenceBackfillDecisions(
  decisions: WowBoostOrderDetailsReferenceBackfillDecision[],
  args: { dryRun?: boolean; sampleLimit?: number } = {},
) {
  const sampleLimit = Math.max(0, Number(args.sampleLimit ?? 10) || 0);
  const patches: WowBoostOrderDetailsReferenceBackfillPatch[] = [];
  const sample: WowBoostOrderDetailsReferenceBackfillPatch[] = [];
  let eligible = 0;
  let alreadyPopulated = 0;
  let missingReference = 0;
  let invalidReference = 0;

  for (const decision of decisions || []) {
    if (decision.action === "update") {
      eligible += 1;
      patches.push(decision);
      if (sample.length < sampleLimit) sample.push(decision);
      continue;
    }

    if (decision.reason === "already_populated") alreadyPopulated += 1;
    if (decision.reason === "missing_reference") {
      eligible += 1;
      missingReference += 1;
    }
    if (decision.reason === "invalid_reference") {
      eligible += 1;
      invalidReference += 1;
    }
  }

  return {
    scanned: decisions.length,
    eligible,
    updated: args.dryRun ? 0 : patches.length,
    already_populated: alreadyPopulated,
    missing_reference: missingReference,
    invalid_reference: invalidReference,
    patches: args.dryRun ? [] : patches,
    would_update: patches.length,
    sample,
  };
}

export function isWowBoostPlatformValue(value: unknown) {
  const platform = String(value ?? "").trim().toLowerCase();
  return (WOWBOOST_PLATFORM_VALUES as readonly string[]).includes(platform);
}

export function buildWowBoostCommerceReferenceBackfillDecision(
  row: WowBoostCommerceReferenceBackfillRow,
): WowBoostCommerceReferenceBackfillDecision {
  const platformOrderId = cleanText(row.platform_order_id) || null;
  const orderId = cleanText(row.order_id) || null;

  if (!isWowBoostPlatformValue(row.platform)) {
    return {
      action: "skip",
      reason: "not_wowboost",
      platform_order_id: platformOrderId,
      order_id: orderId,
    };
  }

  if (!platformOrderId) {
    return {
      action: "skip",
      reason: "invalid_reference",
      platform_order_id: null,
      order_id: orderId,
    };
  }

  if (cleanText(row.commerce_reference)) {
    return {
      action: "skip",
      reason: "already_populated",
      platform_order_id: platformOrderId,
      order_id: orderId,
    };
  }

  const evidence = extractWowBoostCommerceReferenceEvidence(row.raw_json || {});
  if (!evidence.value) {
    return {
      action: "skip",
      reason: "missing_reference",
      platform_order_id: platformOrderId,
      order_id: orderId,
    };
  }

  return {
    action: "update",
    platform_order_id: platformOrderId,
    order_id: orderId,
    commerce_reference: evidence.value,
    source_field: evidence.source_field,
  };
}

export function summarizeWowBoostCommerceReferenceBackfillBatch(
  rows: WowBoostCommerceReferenceBackfillRow[],
  args: { dryRun?: boolean; sampleLimit?: number } = {},
) {
  const sampleLimit = Math.max(0, Number(args.sampleLimit ?? 10) || 0);
  const patches: WowBoostCommerceReferenceBackfillPatch[] = [];
  const sample: WowBoostCommerceReferenceBackfillPatch[] = [];
  let eligible = 0;
  let alreadyPopulated = 0;
  let missingReference = 0;
  let invalidReference = 0;

  for (const row of rows || []) {
    const decision = buildWowBoostCommerceReferenceBackfillDecision(row);

    if (decision.action === "update") {
      eligible += 1;
      patches.push(decision);
      if (sample.length < sampleLimit) sample.push(decision);
      continue;
    }

    if (decision.reason === "already_populated") alreadyPopulated += 1;
    if (decision.reason === "missing_reference") {
      eligible += 1;
      missingReference += 1;
    }
    if (decision.reason === "invalid_reference") {
      eligible += 1;
      invalidReference += 1;
    }
  }

  return {
    scanned: rows.length,
    eligible,
    updated: args.dryRun ? 0 : patches.length,
    already_populated: alreadyPopulated,
    missing_reference: missingReference,
    invalid_reference: invalidReference,
    patches: args.dryRun ? [] : patches,
    would_update: patches.length,
    sample,
  };
}

export function normalizeWowBoostCommerceReferenceExportRow(row: Record<string, any>): WowBoostCommerceReferenceExportRow {
  const reference = extractWowBoostCommerceReferenceEvidence(row);

  return {
    order_id: pickWowBoostField(row, [
      "Order ID",
      "OrderId",
      "OrderID",
      "order_id",
      "orderid",
      "Id",
      "ID",
    ]),
    order_number: pickWowBoostField(row, [
      "Order Number",
      "OrderNumber",
      "orderNumber",
      "Master Order Number",
      "MasterOrderNumber",
    ]) || null,
    transaction_id: pickWowBoostField(row, [
      "TransactionId",
      "Transaction ID",
      "transaction_id",
      "PaymentTrackingNumber",
      "Payment Tracking Number",
    ]) || null,
    commerce_reference: reference.value,
    source_field: reference.source_field,
    order_ts: pickWowBoostField(row, [
      "Order Create Date",
      "createDate",
      "CreateDate",
      "orderDate",
      "OrderDate",
      "Date",
      "CreatedAt",
      "Created",
      "lastUpdateDate",
      "LastUpdateDate",
      "Updated Date",
    ]) || null,
    raw: row,
  };
}

export function summarizeWowBoostCommerceReferenceExportBackfill(
  exportRows: Record<string, any>[],
  existingRows: WowBoostExistingPlatformOrderRow[],
  args: { dryRun?: boolean; sampleLimit?: number } = {},
) {
  const sampleLimit = Math.max(0, Number(args.sampleLimit ?? 10) || 0);
  const existingByPlatformOrderId = new Map<string, WowBoostExistingPlatformOrderRow>();
  const existingByOrderId = new Map<string, WowBoostExistingPlatformOrderRow[]>();

  for (const row of existingRows || []) {
    if (!isWowBoostPlatformValue(row.platform)) continue;

    const platformOrderId = cleanComparable(row.platform_order_id);
    if (platformOrderId) existingByPlatformOrderId.set(platformOrderId, row);

    const orderId = cleanComparable(row.order_id);
    if (orderId) {
      const rows = existingByOrderId.get(orderId) || [];
      rows.push(row);
      existingByOrderId.set(orderId, rows);
    }
  }

  const patches: WowBoostCommerceReferenceExportBackfillPatch[] = [];
  const sample: WowBoostCommerceReferenceExportBackfillPatch[] = [];
  let alreadyPopulated = 0;
  let missingReference = 0;
  let invalidReference = 0;

  for (const rawRow of exportRows || []) {
    const exportRow = normalizeWowBoostCommerceReferenceExportRow(rawRow);
    const orderId = cleanText(exportRow.order_id);

    if (!exportRow.commerce_reference) {
      missingReference += 1;
      continue;
    }

    if (!orderId) {
      invalidReference += 1;
      continue;
    }

    const expectedPlatformOrderId = `wowboost:${orderId}`;
    const exact = existingByPlatformOrderId.get(cleanComparable(expectedPlatformOrderId));
    const fallback = (existingByOrderId.get(cleanComparable(orderId)) || []).filter(isWowBoostExistingOrder);
    const candidate = exact || (fallback.length === 1 ? fallback[0] : null);

    if (!candidate) {
      invalidReference += 1;
      continue;
    }

    const existingCommerceReference = cleanText(candidate.commerce_reference) || null;
    if (existingCommerceReference) {
      alreadyPopulated += 1;
      continue;
    }

    const patch: WowBoostCommerceReferenceExportBackfillPatch = {
      platform_order_id: cleanText(candidate.platform_order_id) || expectedPlatformOrderId,
      order_id: cleanText(candidate.order_id) || orderId,
      transaction_id: cleanText(candidate.transaction_id) || exportRow.transaction_id,
      commerce_reference: exportRow.commerce_reference,
      existing_commerce_reference: existingCommerceReference,
      source_field: exportRow.source_field,
    };

    patches.push(patch);
    if (sample.length < sampleLimit) sample.push(patch);
  }

  return {
    scanned: exportRows.length,
    eligible: patches.length + missingReference + invalidReference,
    updated: args.dryRun ? 0 : patches.length,
    already_populated: alreadyPopulated,
    missing_reference: missingReference,
    invalid_reference: invalidReference,
    patches: args.dryRun ? [] : patches,
    would_update: patches.length,
    sample,
  };
}

function pickWowBoostFieldWithSource(
  row: Record<string, any>,
  candidates: readonly string[],
): WowBoostCommerceReferenceEvidence {
  const keys = Object.keys(row || {});
  const normalizedCandidates = new Set(candidates.map(normalizeWowBoostExportHeader).filter(Boolean));
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeWowBoostExportHeader(candidate);
    if (!normalizedCandidate || !normalizedCandidates.has(normalizedCandidate)) continue;
    const hit = keys.find((key) => normalizeWowBoostExportHeader(key) === normalizedCandidate);
    if (!hit) continue;

    const value = String(row[hit] ?? "").trim();
    if (value) {
      return {
        value,
        source_field: hit,
      };
    }
  }

  return {
    value: "",
    source_field: "",
  };
}

function pickWowBoostField(row: Record<string, any>, candidates: readonly string[]) {
  return pickWowBoostFieldWithSource(row, candidates).value;
}

function findWowBoostHeaderName(headers: string[], candidates: readonly string[]) {
  const normalizedCandidates = new Set(candidates.map(normalizeWowBoostExportHeader).filter(Boolean));
  return (headers || []).find((header) => normalizedCandidates.has(normalizeWowBoostExportHeader(header))) || "";
}

function isWowBoostExistingOrder(row: WowBoostExistingPlatformOrderRow) {
  return isWowBoostPlatformValue(row.platform);
}

function extractWowBoostOrderObjects(payload: unknown) {
  const objects: Array<{ path: string; value: Record<string, any> }> = [];

  if (Array.isArray(payload)) {
    payload.forEach((item, index) => {
      if (isPlainRecord(item)) objects.push({ path: `[${index}]`, value: item });
    });
    return objects;
  }

  if (!isPlainRecord(payload)) return objects;

  for (const [key, value] of Object.entries(payload)) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (isPlainRecord(item)) objects.push({ path: `${key}[${index}]`, value: item });
      });
      continue;
    }

    if (isPlainRecord(value) && looksLikeOrderContainerKey(key)) {
      objects.push({ path: key, value });
    }
  }

  return objects.length ? objects : [{ path: "$", value: payload }];
}

function walkDiagnosticPayload(
  value: unknown,
  path: string[],
  visited: WeakSet<object>,
  visit: (entry: { key: string; path: string[]; value: unknown }) => void,
  depth = 0,
) {
  if (depth > 8 || value === null || value === undefined) return;

  if (Array.isArray(value)) {
    if (visited.has(value)) return;
    visited.add(value);

    value.slice(0, 100).forEach((item, index) => {
      walkDiagnosticPayload(item, [...path, `[${index}]`], visited, visit, depth + 1);
    });
    return;
  }

  if (!isPlainRecord(value)) return;
  if (visited.has(value)) return;
  visited.add(value);

  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, key];
    visit({ key, path: childPath, value: child });
    walkDiagnosticPayload(child, childPath, visited, visit, depth + 1);
  }
}

function objectKeys(value: unknown) {
  return isPlainRecord(value) ? Object.keys(value) : [];
}

function isPlainRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function looksLikeOrderContainerKey(key: string) {
  const normalized = normalizeWowBoostExportHeader(key);
  return ["order", "orders", "customerorders", "data", "result", "results", "item", "items"].includes(normalized);
}

function diagnosticPrimitiveValue(value: unknown): string | number | boolean | null | undefined {
  if (value === null) return null;
  if (["string", "number", "boolean"].includes(typeof value)) return value as string | number | boolean;
  return undefined;
}

function truncateDiagnosticValue(value: string | number | boolean | null) {
  if (typeof value !== "string") return value;
  return value.length > 160 ? `${value.slice(0, 157)}...` : value;
}

function shouldRedactDiagnosticValue(path: string[]) {
  const normalizedPath = normalizeWowBoostExportHeader(path.join("."));
  return [
    "address",
    "card",
    "customeremail",
    "email",
    "firstname",
    "lastname",
    "name",
    "payment",
    "phone",
    "postal",
    "street",
    "zip",
  ].some((keyword) => normalizedPath.includes(keyword));
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function cleanComparable(value: unknown) {
  return cleanText(value).toLowerCase();
}

function stableWowBoostHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function parseWowBoostYmd(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cleanText(value));
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function addWowBoostDaysUTC(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

function formatWowBoostYmd(date: Date) {
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}
