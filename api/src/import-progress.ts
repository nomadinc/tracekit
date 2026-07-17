export const IMPORT_JOB_STATUSES = [
  "queued",
  "running",
  "preparing",
  "importing",
  "reconciling",
  "finalizing",
  "paused",
  "retrying",
  "completed",
  "completed_with_errors",
  "failed",
  "cancelled",
] as const;

export type ImportJobStatus = (typeof IMPORT_JOB_STATUSES)[number];

export type ImportChunkResponse = {
  ok: boolean;
  has_more: boolean;
  next_cursor?: string | null;
  next_page?: number | null;
  next_window_index?: number | null;
  current_window?: {
    from: string;
    to: string;
  } | null;
  metrics: {
    fetched: number;
    processed: number;
    matched?: number;
    unmatched?: number;
    ambiguous?: number;
    rows_upserted?: number;
    payment_transactions_upserted?: number;
    platform_orders_upserted?: number;
    ledger_inserted?: number;
    ledger_skipped?: number;
    duplicate_sales_skipped?: number;
    duplicates_skipped?: number;
    warnings?: string[];
  };
};

export type ImportProgressState = {
  workspace_id: string;
  platform: string;
  connector_id: string;
  requested_from: string;
  requested_to: string;
  filter: string | null;
  status: ImportJobStatus;
  current_cursor: string | null;
  current_page: number | null;
  current_window_index: number | null;
  records_fetched: number;
  records_processed: number;
  matched: number;
  unmatched: number;
  ambiguous: number;
  rows_upserted: number;
  payment_transactions_upserted: number;
  platform_orders_upserted: number;
  ledger_inserted: number;
  ledger_skipped: number;
  duplicate_sales_skipped: number;
  duplicate_rows_skipped: number;
  warnings: string[];
  last_error: string | null;
  started_at: string | null;
  updated_at: string | null;
  completed_at: string | null;
  total_records?: number | null;
  current_window?: {
    from: string;
    to: string;
  } | null;
  warning_count?: number;
  rate_limit_retry_count?: number;
  rate_limit_warning_count?: number;
  recent_warnings?: string[];
  recent_rate_limit_warnings?: string[];
  deferred_mapping_count?: number;
  permanently_missing_count?: number;
  recent_permanently_missing_ids?: string[];
  progress_compaction_version?: number;
};

export const WOWBOOST_BACKFILL_PROGRESS_COMPACTION_VERSION = 1;
export const IMPORT_PROGRESS_RECENT_WARNING_LIMIT = 10;
export const IMPORT_PROGRESS_RECENT_RATE_LIMIT_WARNING_LIMIT = 10;
export const IMPORT_PROGRESS_RECENT_PERMANENTLY_MISSING_ID_LIMIT = 20;

export const ACTIVE_IMPORT_STATUSES = new Set<ImportJobStatus>([
  "queued",
  "running",
  "preparing",
  "importing",
  "reconciling",
  "finalizing",
  "paused",
  "retrying",
]);

export function normalizeImportStatus(status: unknown): ImportJobStatus {
  const value = String(status ?? "").trim().toLowerCase();
  if ((IMPORT_JOB_STATUSES as readonly string[]).includes(value)) return value as ImportJobStatus;
  return "queued";
}

export function isActiveImportStatus(status: unknown) {
  return ACTIVE_IMPORT_STATUSES.has(normalizeImportStatus(status));
}

export function createInitialImportProgress(args: {
  workspace_id?: string | null;
  platform: string;
  connector_id?: string | null;
  from: string;
  to: string;
  filter?: string | null;
  now?: string;
}): ImportProgressState {
  const now = args.now || new Date().toISOString();
  return {
    workspace_id: String(args.workspace_id || "default").trim() || "default",
    platform: String(args.platform || "").trim(),
    connector_id: String(args.connector_id || args.platform || "default").trim() || "default",
    requested_from: args.from,
    requested_to: args.to,
    filter: args.filter ?? null,
    status: "queued",
    current_cursor: null,
    current_page: 1,
    current_window_index: 0,
    records_fetched: 0,
    records_processed: 0,
    matched: 0,
    unmatched: 0,
    ambiguous: 0,
    rows_upserted: 0,
    payment_transactions_upserted: 0,
    platform_orders_upserted: 0,
    ledger_inserted: 0,
    ledger_skipped: 0,
    duplicate_sales_skipped: 0,
    duplicate_rows_skipped: 0,
    warnings: [],
    last_error: null,
    started_at: null,
    updated_at: now,
    completed_at: null,
    current_window: null,
  };
}

export function adaptConnectorResponse(raw: any): ImportChunkResponse {
  const metrics = raw?.metrics || {};
  const fetched = Number(metrics.fetched ?? raw?.records_fetched ?? raw?.fetched ?? 0);
  const processed = Number(metrics.processed ?? raw?.records_processed ?? fetched);
  const compositeRowsUpserted =
    raw?.payment_transactions_upserted !== undefined || raw?.platform_orders_upserted !== undefined
      ? Number(raw?.payment_transactions_upserted || 0) + Number(raw?.platform_orders_upserted || 0)
      : undefined;
  const rowsUpserted = Number(metrics.rows_upserted ?? raw?.rows_upserted ?? compositeRowsUpserted ?? raw?.upserted ?? 0);
  const paymentTransactionsUpserted = optionalNumber(metrics.payment_transactions_upserted ?? raw?.payment_transactions_upserted) ?? 0;
  const platformOrdersUpserted = optionalNumber(metrics.platform_orders_upserted ?? raw?.platform_orders_upserted) ?? 0;
  const ledgerInserted = Number(metrics.ledger_inserted ?? raw?.ledger_inserted ?? 0);
  const ledgerSkipped = optionalNumber(metrics.ledger_skipped ?? raw?.ledger_skipped) ?? 0;
  const duplicateSalesSkipped = optionalNumber(metrics.duplicate_sales_skipped ?? raw?.duplicate_sales_skipped) ?? 0;
  const duplicateRowsSkipped = Number(metrics.duplicates_skipped ?? raw?.duplicates_skipped ?? raw?.duplicate_rows_skipped ?? raw?.platform_order_rows_deduplicated ?? raw?.ledger_skipped ?? raw?.duplicate_sales_skipped ?? 0);
  const warnings = [
    ...arrayOfStrings(metrics.warnings),
    ...arrayOfStrings(raw?.warnings),
    ...arrayOfStrings(raw?.rollup_warnings),
    ...arrayOfStrings(raw?.phone_match_warnings),
    ...arrayOfStrings(raw?.reconciliation_lookup_warnings),
  ];

  return {
    ok: raw?.ok !== false,
    has_more: Boolean(raw?.has_more ?? raw?.hasMore ?? raw?.has_more_pages),
    next_cursor: raw?.next_cursor ?? raw?.nextCursor ?? null,
    next_page: raw?.next_page ?? raw?.nextPage ?? null,
    next_window_index: raw?.next_window_index ?? raw?.nextWindowIndex ?? null,
    current_window: raw?.current_window ?? raw?.currentWindow ?? null,
    metrics: {
      fetched,
      processed,
      matched: optionalNumber(metrics.matched ?? raw?.matched),
      unmatched: optionalNumber(metrics.unmatched ?? raw?.unmatched),
      ambiguous: optionalNumber(metrics.ambiguous ?? raw?.ambiguous),
      rows_upserted: rowsUpserted,
      payment_transactions_upserted: paymentTransactionsUpserted,
      platform_orders_upserted: platformOrdersUpserted,
      ledger_inserted: ledgerInserted,
      ledger_skipped: ledgerSkipped,
      duplicate_sales_skipped: duplicateSalesSkipped,
      duplicates_skipped: duplicateRowsSkipped,
      warnings,
    },
  };
}

export function mergeImportProgress(
  current: ImportProgressState,
  chunk: ImportChunkResponse,
  args: { now?: string } = {},
): ImportProgressState {
  const now = args.now || new Date().toISOString();
  const next: ImportProgressState = {
    ...current,
    status: chunk.has_more ? "importing" : "completed",
    current_cursor: chunk.next_cursor ?? current.current_cursor,
    current_page: chunk.next_page ?? current.current_page,
    current_window_index: chunk.next_window_index ?? current.current_window_index,
    current_window: chunk.current_window ?? current.current_window ?? null,
    records_fetched: current.records_fetched + Number(chunk.metrics.fetched || 0),
    records_processed: current.records_processed + Number(chunk.metrics.processed || 0),
    matched: current.matched + Number(chunk.metrics.matched || 0),
    unmatched: current.unmatched + Number(chunk.metrics.unmatched || 0),
    ambiguous: current.ambiguous + Number(chunk.metrics.ambiguous || 0),
    rows_upserted: current.rows_upserted + Number(chunk.metrics.rows_upserted || 0),
    payment_transactions_upserted: current.payment_transactions_upserted + Number(chunk.metrics.payment_transactions_upserted || 0),
    platform_orders_upserted: current.platform_orders_upserted + Number(chunk.metrics.platform_orders_upserted || 0),
    ledger_inserted: current.ledger_inserted + Number(chunk.metrics.ledger_inserted || 0),
    ledger_skipped: current.ledger_skipped + Number(chunk.metrics.ledger_skipped || 0),
    duplicate_sales_skipped: current.duplicate_sales_skipped + Number(chunk.metrics.duplicate_sales_skipped || 0),
    duplicate_rows_skipped: current.duplicate_rows_skipped + Number(chunk.metrics.duplicates_skipped || 0),
    warnings: mergeImportWarnings(current.warnings, chunk.metrics.warnings),
    last_error: null,
    updated_at: now,
    completed_at: chunk.has_more ? null : now,
  };

  if (chunk.next_cursor === null) next.current_cursor = null;
  if (chunk.next_page === null && !chunk.has_more) next.current_page = null;
  if (chunk.next_window_index === null && !chunk.has_more) next.current_window_index = null;

  return next;
}

export function failImportProgress(current: ImportProgressState, error: unknown, now = new Date().toISOString()): ImportProgressState {
  return {
    ...current,
    status: "failed",
    last_error: error instanceof Error ? error.message : String(error || "Import failed"),
    updated_at: now,
  };
}

export function cancelImportProgress(current: ImportProgressState, now = new Date().toISOString()): ImportProgressState {
  return {
    ...current,
    status: "cancelled",
    updated_at: now,
    completed_at: now,
  };
}

export function resumeImportProgress(current: ImportProgressState, now = new Date().toISOString()): ImportProgressState {
  return {
    ...current,
    status: "queued",
    last_error: null,
    updated_at: now,
    completed_at: null,
  };
}

export function shouldBlockDuplicateImport(
  job: { platform?: string | null; from_date?: string | null; to_date?: string | null; filter?: string | null; status?: string | null; progress?: any },
  args: { workspace_id?: string | null; platform: string; connector_id?: string | null; from: string; to: string; filter?: string | null },
) {
  if (!isActiveImportStatus(job.status || job.progress?.status)) return false;
  const progress = job.progress || {};
  const workspace = String(progress.workspace_id || "default");
  const connector = String(progress.connector_id || args.platform);
  return (
    String(job.platform || progress.platform) === args.platform &&
    workspace === String(args.workspace_id || "default") &&
    connector === String(args.connector_id || args.platform) &&
    String(job.from_date || progress.requested_from) === args.from &&
    String(job.to_date || progress.requested_to) === args.to &&
    String(job.filter || progress.filter || "") === String(args.filter || "")
  );
}

export function importProgressPercent(progress: ImportProgressState) {
  const total = Number(progress.total_records || 0);
  if (!total) return null;
  return Math.max(0, Math.min(100, Math.round((progress.records_processed / total) * 100)));
}

export function mergeImportWarnings(current: unknown, incoming: unknown) {
  const warnings = [...arrayOfStrings(current), ...arrayOfStrings(incoming)];
  const counted = new Map<string, number>();
  const plain: string[] = [];
  const seenPlain = new Set<string>();

  for (const warning of warnings) {
    const parsed = parseCountedWarning(warning);
    if (parsed) {
      counted.set(parsed.key, (counted.get(parsed.key) || 0) + parsed.count);
      continue;
    }

    if (!seenPlain.has(warning)) {
      plain.push(warning);
      seenPlain.add(warning);
    }
  }

  const aggregate = Array.from(counted.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => `${key}: ${count} records`);

  return [...aggregate, ...plain];
}

export type CompactWowBoostBackfillProgressOptions = {
  incomingWarnings?: unknown;
  incomingRateLimitWarnings?: unknown;
  rateLimitRetryCount?: unknown;
  permanentlyMissingIds?: unknown;
  permanentlyMissingCount?: unknown;
  recoveredPermanentlyMissingIds?: unknown;
  deferredMappingCount?: unknown;
};

export type CompactWowBoostBackfillProgressResult = {
  progress: ImportProgressState & Record<string, any>;
  changed: boolean;
};

type ProgressDiagnostics = {
  warningCount: number;
  rateLimitWarningCount: number;
  deferredMappingCount: number;
  permanentlyMissingCount: number;
  recentWarnings: string[];
  recentRateLimitWarnings: string[];
  permanentlyMissingIds: string[];
};

export function compactWowBoostBackfillProgress(
  progress: ImportProgressState | (Record<string, any> & Partial<ImportProgressState>),
  options: CompactWowBoostBackfillProgressOptions = {},
): CompactWowBoostBackfillProgressResult {
  const source = { ...(progress || {}) } as ImportProgressState & Record<string, any>;
  const wasCompacted = Number(source.progress_compaction_version || 0) >= WOWBOOST_BACKFILL_PROGRESS_COMPACTION_VERSION;

  const legacyDiagnostics = collectWowBoostProgressDiagnostics(
    wasCompacted ? [] : source.warnings,
    wasCompacted ? [] : source.rate_limit_warnings,
  );
  const incomingDiagnostics = collectWowBoostProgressDiagnostics(
    options.incomingWarnings,
    options.incomingRateLimitWarnings,
  );
  const incomingPermanentIds = arrayOfStrings(options.permanentlyMissingIds);
  const recoveredIds = new Set(arrayOfStrings(options.recoveredPermanentlyMissingIds));
  const incomingPermanentCount = Math.max(
    Number(incomingPermanentIds.length || 0),
    optionalNumber(options.permanentlyMissingCount) ?? 0,
  );

  const existingWarningCount = nonNegativeNumber(source.warning_count);
  const existingRateLimitWarningCount = nonNegativeNumber(source.rate_limit_warning_count);
  const existingRateLimitRetryCount = Math.max(
    nonNegativeNumber(source.rate_limit_retry_count),
    nonNegativeNumber(source.rate_limit_retries),
  );
  const existingDeferredMappingCount = nonNegativeNumber(source.deferred_mapping_count);
  const existingPermanentlyMissingCount = Math.max(
    nonNegativeNumber(source.permanently_missing_count),
    nonNegativeNumber(source.permanently_missing_orders),
  );

  const warningCountBase = wasCompacted
    ? existingWarningCount
    : Math.max(existingWarningCount, legacyDiagnostics.warningCount);
  const rateLimitWarningCountBase = wasCompacted
    ? existingRateLimitWarningCount
    : Math.max(existingRateLimitWarningCount, legacyDiagnostics.rateLimitWarningCount);
  const rateLimitRetryCountBase = wasCompacted
    ? existingRateLimitRetryCount
    : Math.max(existingRateLimitRetryCount, legacyDiagnostics.rateLimitWarningCount);
  const deferredMappingCountBase = wasCompacted
    ? existingDeferredMappingCount
    : Math.max(existingDeferredMappingCount, legacyDiagnostics.deferredMappingCount);

  const existingPermanentIds = [
    ...arrayOfStrings(source.recent_permanently_missing_ids),
    ...(wasCompacted ? arrayOfStrings(source.permanently_missing_order_ids) : []),
    ...legacyDiagnostics.permanentlyMissingIds,
    ...(wasCompacted ? [] : arrayOfStrings(source.permanently_missing_order_ids)),
  ];
  const knownPermanentIdSet = new Set(existingPermanentIds);
  for (const id of incomingPermanentIds) knownPermanentIdSet.add(id);
  for (const id of recoveredIds) knownPermanentIdSet.delete(id);

  const recoveredKnownCount = new Set(existingPermanentIds.filter((id) => recoveredIds.has(id))).size;
  const permanentCountBase = wasCompacted
    ? existingPermanentlyMissingCount
    : Math.max(
        existingPermanentlyMissingCount,
        legacyDiagnostics.permanentlyMissingCount,
        legacyDiagnostics.permanentlyMissingIds.length,
        arrayOfStrings(source.permanently_missing_order_ids).length,
      );

  const warningCount = warningCountBase + incomingDiagnostics.warningCount + incomingPermanentCount;
  const rateLimitWarningCount = rateLimitWarningCountBase + incomingDiagnostics.rateLimitWarningCount;
  const incomingRateLimitRetryCount =
    optionalNumber(options.rateLimitRetryCount) ?? incomingDiagnostics.rateLimitWarningCount;
  const rateLimitRetryCount = rateLimitRetryCountBase + Math.max(0, incomingRateLimitRetryCount || 0);
  const deferredMappingCount =
    deferredMappingCountBase +
    incomingDiagnostics.deferredMappingCount +
    Math.max(0, optionalNumber(options.deferredMappingCount) ?? 0);
  const permanentlyMissingCount = Math.max(
    0,
    permanentCountBase + incomingPermanentCount - recoveredKnownCount,
  );

  const recentWarnings = boundedRecentUnique(
    [
      ...arrayOfStrings(source.recent_warnings),
      ...(wasCompacted ? arrayOfStrings(source.warnings) : legacyDiagnostics.recentWarnings),
      ...incomingDiagnostics.recentWarnings,
    ],
    IMPORT_PROGRESS_RECENT_WARNING_LIMIT,
  );
  const recentRateLimitWarnings = boundedRecentUnique(
    [
      ...arrayOfStrings(source.recent_rate_limit_warnings),
      ...(wasCompacted ? arrayOfStrings(source.rate_limit_warnings) : legacyDiagnostics.recentRateLimitWarnings),
      ...incomingDiagnostics.recentRateLimitWarnings,
    ],
    IMPORT_PROGRESS_RECENT_RATE_LIMIT_WARNING_LIMIT,
  );
  const recentPermanentlyMissingIds = boundedRecentUnique(
    Array.from(knownPermanentIdSet).filter((id) => !recoveredIds.has(id)),
    IMPORT_PROGRESS_RECENT_PERMANENTLY_MISSING_ID_LIMIT,
  );

  const compacted: ImportProgressState & Record<string, any> = {
    ...source,
    warning_count: warningCount,
    rate_limit_retry_count: rateLimitRetryCount,
    rate_limit_retries: rateLimitRetryCount,
    rate_limit_warning_count: rateLimitWarningCount,
    recent_warnings: recentWarnings,
    warnings: recentWarnings,
    recent_rate_limit_warnings: recentRateLimitWarnings,
    rate_limit_warnings: recentRateLimitWarnings,
    deferred_mapping_count: deferredMappingCount,
    permanently_missing_count: permanentlyMissingCount,
    permanently_missing_orders: permanentlyMissingCount,
    recent_permanently_missing_ids: recentPermanentlyMissingIds,
    permanently_missing_order_ids: recentPermanentlyMissingIds,
    progress_compaction_version: WOWBOOST_BACKFILL_PROGRESS_COMPACTION_VERSION,
  };

  const changed =
    !wasCompacted ||
    incomingDiagnostics.warningCount > 0 ||
    incomingPermanentCount > 0 ||
    recoveredIds.size > 0 ||
    recentWarnings.length !== arrayOfStrings(source.recent_warnings).length ||
    recentRateLimitWarnings.length !== arrayOfStrings(source.recent_rate_limit_warnings).length ||
    recentPermanentlyMissingIds.length !== arrayOfStrings(source.recent_permanently_missing_ids).length;

  return { progress: compacted, changed };
}

export function buildPublicImportJobPayload(
  job: Record<string, any> | null,
  progress: ImportProgressState & Record<string, any>,
  options: { full_progress?: boolean; fullProgress?: boolean } = {},
) {
  if (!job) return null;
  const status = normalizeImportStatus(progress.status || job.status);
  const active = isActiveImportStatus(status);
  const percent = importProgressPercent(progress);
  if (options.full_progress || options.fullProgress) {
    return {
      ...job,
      status,
      progress,
      active,
      percent,
    };
  }

  const warningCount = nonNegativeNumber(progress.warning_count);
  const rateLimitRetryCount = Math.max(
    nonNegativeNumber(progress.rate_limit_retry_count),
    nonNegativeNumber((progress as any).rate_limit_retries),
  );
  const rateLimitWarningCount = nonNegativeNumber(progress.rate_limit_warning_count);
  const permanentlyMissingCount = Math.max(
    nonNegativeNumber(progress.permanently_missing_count),
    nonNegativeNumber((progress as any).permanently_missing_orders),
  );

  return {
    id: job.id,
    platform: job.platform,
    module: job.module ?? null,
    status,
    active,
    percent,
    from_date: job.from_date,
    to_date: job.to_date,
    filter: job.filter ?? null,
    fetched: Number(progress.records_fetched ?? job.fetched ?? 0) || 0,
    upserted: Number(progress.rows_upserted ?? job.upserted ?? 0) || 0,
    current_cursor: progress.current_cursor ?? null,
    current_page: progress.current_page ?? null,
    current_window_index: progress.current_window_index ?? null,
    current_window: progress.current_window ?? null,
    current_phase: status,
    records_fetched: Number(progress.records_fetched || 0),
    records_processed: Number(progress.records_processed || 0),
    rows_upserted: Number(progress.rows_upserted || 0),
    aggregate_counters: {
      warning_count: warningCount,
      rate_limit_retry_count: rateLimitRetryCount,
      rate_limit_warning_count: rateLimitWarningCount,
      deferred_mapping_count: nonNegativeNumber((progress as any).deferred_mapping_count),
      permanently_missing_count: permanentlyMissingCount,
      missing_reference: nonNegativeNumber((progress as any).missing_reference),
      mapped_order_numbers: nonNegativeNumber((progress as any).mapped_order_numbers),
      export_order_number_mappings_loaded: nonNegativeNumber((progress as any).export_order_number_mappings_loaded),
      export_pages_processed: nonNegativeNumber((progress as any).export_pages_processed),
      unresolved_legacy_order_numbers: nonNegativeNumber((progress as any).unresolved_legacy_order_numbers),
      ambiguous_legacy_order_numbers: nonNegativeNumber((progress as any).ambiguous_legacy_order_numbers),
    },
    recent_warnings: boundedRecentUnique(
      arrayOfStrings((progress as any).recent_warnings).length
        ? (progress as any).recent_warnings
        : progress.warnings,
      IMPORT_PROGRESS_RECENT_WARNING_LIMIT,
    ),
    recent_rate_limit_warnings: boundedRecentUnique(
      arrayOfStrings((progress as any).recent_rate_limit_warnings).length
        ? (progress as any).recent_rate_limit_warnings
        : (progress as any).rate_limit_warnings,
      IMPORT_PROGRESS_RECENT_RATE_LIMIT_WARNING_LIMIT,
    ),
    recent_permanently_missing_ids: boundedRecentUnique(
      arrayOfStrings((progress as any).recent_permanently_missing_ids).length
        ? (progress as any).recent_permanently_missing_ids
        : (progress as any).permanently_missing_order_ids,
      IMPORT_PROGRESS_RECENT_PERMANENTLY_MISSING_ID_LIMIT,
    ),
    last_error: progress.last_error ?? job.error ?? null,
    started_at: progress.started_at ?? job.started_at ?? null,
    updated_at: progress.updated_at ?? job.updated_at ?? null,
    completed_at: progress.completed_at ?? job.completed_at ?? null,
  };
}

function collectWowBoostProgressDiagnostics(warningsValue: unknown, rateLimitWarningsValue: unknown): ProgressDiagnostics {
  const diagnostics: ProgressDiagnostics = {
    warningCount: 0,
    rateLimitWarningCount: 0,
    deferredMappingCount: 0,
    permanentlyMissingCount: 0,
    recentWarnings: [],
    recentRateLimitWarnings: [],
    permanentlyMissingIds: [],
  };
  const allWarnings = [
    ...arrayOfStrings(warningsValue).map((warning) => ({ warning, source: "warnings" as const })),
    ...arrayOfStrings(rateLimitWarningsValue).map((warning) => ({ warning, source: "rate_limit_warnings" as const })),
  ];

  for (const item of allWarnings) {
    const warning = item.warning;
    const count = warningUnitCount(warning);
    diagnostics.warningCount += count;

    if (isWowBoostRateLimitWarning(warning) || item.source === "rate_limit_warnings") {
      diagnostics.rateLimitWarningCount += count;
      diagnostics.recentRateLimitWarnings.push(warning);
      continue;
    }

    if (isWowBoostDeferredMappingWarning(warning)) {
      diagnostics.deferredMappingCount += count;
      diagnostics.recentWarnings.push(warning);
      continue;
    }

    const permanentlyMissingId = wowBoostPermanentlyMissingIdFromWarning(warning);
    if (permanentlyMissingId) {
      diagnostics.permanentlyMissingCount += 1;
      diagnostics.permanentlyMissingIds.push(permanentlyMissingId);
      continue;
    }

    if (isWowBoostPermanentMissingAggregateWarning(warning)) {
      diagnostics.permanentlyMissingCount += count;
      continue;
    }

    diagnostics.recentWarnings.push(warning);
  }

  diagnostics.recentWarnings = boundedRecentUnique(diagnostics.recentWarnings, IMPORT_PROGRESS_RECENT_WARNING_LIMIT);
  diagnostics.recentRateLimitWarnings = boundedRecentUnique(
    diagnostics.recentRateLimitWarnings,
    IMPORT_PROGRESS_RECENT_RATE_LIMIT_WARNING_LIMIT,
  );
  diagnostics.permanentlyMissingIds = boundedRecentUnique(
    diagnostics.permanentlyMissingIds,
    IMPORT_PROGRESS_RECENT_PERMANENTLY_MISSING_ID_LIMIT,
  );
  return diagnostics;
}

function isWowBoostRateLimitWarning(warning: string) {
  return warning.startsWith("wowboost_order_detail_rate_limited:");
}

function isWowBoostDeferredMappingWarning(warning: string) {
  return warning.startsWith("legacy_order_number_mapping_deferred:");
}

function isWowBoostPermanentMissingAggregateWarning(warning: string) {
  return /^order_detail_not_found:\s*\d+\s+records?\b/i.test(warning);
}

function wowBoostPermanentlyMissingIdFromWarning(warning: string) {
  const match = warning.match(/^order_detail_not_found:\s*([^:\s][^:]*)$/i);
  if (!match) return "";
  const value = String(match[1] || "").trim();
  if (!value || /\d+\s+records?\b/i.test(value)) return "";
  return value;
}

function warningUnitCount(warning: string) {
  const counted = parseCountedWarning(warning);
  return counted ? counted.count : 1;
}

function boundedRecentUnique(value: unknown, limit: number) {
  const normalizedLimit = Math.max(0, Number(limit) || 0);
  if (!normalizedLimit) return [];
  const values = arrayOfStrings(value);
  const seen = new Set<string>();
  const recent: string[] = [];
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const item = values[index];
    if (seen.has(item)) continue;
    seen.add(item);
    recent.push(item);
    if (recent.length >= normalizedLimit) break;
  }
  return recent.reverse();
}

function nonNegativeNumber(value: unknown) {
  const n = optionalNumber(value) ?? 0;
  return Math.max(0, n);
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function arrayOfStrings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function parseCountedWarning(value: string) {
  const keyMatch = value.match(/^\s*([a-z][a-z0-9_]*):/i);
  if (!keyMatch) return null;

  const key = keyMatch[1].toLowerCase();
  const countPatterns = [
    /:\s*(\d+)\s+records?\b/i,
    /\bfor\s+(\d+)\s+[^.]*records?\b/i,
    /\b(\d+)\s+[^.]*records?\b/i,
  ];

  for (const pattern of countPatterns) {
    const countMatch = value.match(pattern);
    if (!countMatch) continue;
    const count = Number(countMatch[1]);
    if (Number.isFinite(count)) return { key, count };
  }

  return null;
}
