export const CONNECTOR_RUNTIME_JOB_STATUSES = [
  "queued",
  "running",
  "paused",
  "retrying",
  "completed",
  "completed_with_errors",
  "failed",
  "cancelled",
] as const;

export const CONNECTOR_RUNTIME_TASK_STATUSES = [
  "queued",
  "running",
  "retrying",
  "completed",
  "failed",
  "cancelled",
] as const;

export const CONNECTOR_RUNTIME_WOWBOOST_PHASES = [
  "stage_export_pages",
  "reconcile_legacy_orders",
  "fetch_order_details",
  "validate_and_finalize",
] as const;

export const CONNECTOR_RUNTIME_VERSION = 1;
export const CONNECTOR_RUNTIME_EXECUTION_MODE = "connector_runtime";

export type ConnectorRuntimeJobStatus = (typeof CONNECTOR_RUNTIME_JOB_STATUSES)[number];
export type ConnectorRuntimeTaskStatus = (typeof CONNECTOR_RUNTIME_TASK_STATUSES)[number];
export type ConnectorRuntimeWowBoostPhase = (typeof CONNECTOR_RUNTIME_WOWBOOST_PHASES)[number];
export type ConnectorRuntimeFailureClass = "transient" | "permanent" | "blocking";

export type ConnectorRuntimeProgress = {
  workspace_id: string;
  connector_id: string;
  job_type: string;
  phase: string;
  status: ConnectorRuntimeJobStatus;
  requested_from: string;
  requested_to: string;
  records_discovered: number;
  records_processed: number;
  records_succeeded: number;
  records_failed: number;
  records_skipped: number;
  retries: number;
  current_cursor: string | null;
  current_page: number | null;
  last_error: string | null;
  next_run_at: string | null;
  started_at: string | null;
  updated_at: string;
  completed_at: string | null;
  metadata: Record<string, any>;
};

export type ConnectorRuntimeTaskMessage = {
  runtime_task_id: string;
  job_id: string;
  connector_id: string;
  task_type: string;
  phase: string;
};

export type ConnectorRuntimeTaskPlan = {
  job_id: string;
  workspace_id: string;
  connector_id: string;
  task_type: string;
  phase: string;
  cursor?: string | null;
  page?: number | null;
  payload?: Record<string, any>;
  dedupe_key?: string | null;
  max_attempts?: number;
  available_at?: string | null;
};

export const ACTIVE_CONNECTOR_RUNTIME_JOB_STATUSES = new Set<ConnectorRuntimeJobStatus>([
  "queued",
  "running",
  "paused",
  "retrying",
]);

export const TERMINAL_CONNECTOR_RUNTIME_JOB_STATUSES = new Set<ConnectorRuntimeJobStatus>([
  "completed",
  "completed_with_errors",
  "failed",
  "cancelled",
]);

export type ConnectorRuntimeJobCandidate = Record<string, any>;

export function connectorRuntimeMetadata(args: {
  connector_id: string;
  metadata?: Record<string, any> | null;
  version?: number;
}) {
  return {
    ...(args.metadata || {}),
    runtime_version: Number(args.version || CONNECTOR_RUNTIME_VERSION),
    execution_mode: CONNECTOR_RUNTIME_EXECUTION_MODE,
    runtime_connector: cleanText(args.connector_id),
  };
}

export function connectorRuntimeMarkers(job: ConnectorRuntimeJobCandidate | null | undefined) {
  const progress = ((job?.progress || {}) as Record<string, any>) || {};
  const metadata = {
    ...((progress.metadata || {}) as Record<string, any>),
    ...(((job as Record<string, any> | null | undefined)?.metadata || {}) as Record<string, any>),
  };
  return {
    runtime_version: Number(metadata.runtime_version ?? progress.runtime_version ?? (job as any)?.runtime_version ?? 0),
    execution_mode: cleanText(metadata.execution_mode ?? progress.execution_mode ?? (job as any)?.execution_mode),
    runtime_connector: cleanText(metadata.runtime_connector ?? progress.runtime_connector ?? (job as any)?.runtime_connector),
  };
}

export function isConnectorRuntimeV1Job(job: ConnectorRuntimeJobCandidate | null | undefined, connectorId?: string | null) {
  const markers = connectorRuntimeMarkers(job);
  return (
    markers.runtime_version === CONNECTOR_RUNTIME_VERSION &&
    markers.execution_mode === CONNECTOR_RUNTIME_EXECUTION_MODE &&
    (!cleanText(connectorId) || markers.runtime_connector === cleanText(connectorId))
  );
}

export function connectorRuntimeJobField(job: ConnectorRuntimeJobCandidate, field: string, fallback?: unknown) {
  const progress = ((job.progress || {}) as Record<string, any>) || {};
  const value = job[field] ?? progress[field] ?? fallback;
  return cleanText(value);
}

export function connectorRuntimeJobMatches(args: {
  job: ConnectorRuntimeJobCandidate;
  workspace_id: string;
  connector_id: string;
  job_type: string;
  requested_from: string;
  requested_to: string;
}) {
  if (!isConnectorRuntimeV1Job(args.job, args.connector_id)) return false;
  return (
    connectorRuntimeJobField(args.job, "workspace_id", "default") === cleanText(args.workspace_id || "default") &&
    connectorRuntimeJobField(args.job, "connector_id") === cleanText(args.connector_id) &&
    connectorRuntimeJobField(args.job, "job_type", args.job.filter) === cleanText(args.job_type) &&
    connectorRuntimeJobField(args.job, "requested_from", args.job.from_date) === cleanText(args.requested_from) &&
    connectorRuntimeJobField(args.job, "requested_to", args.job.to_date) === cleanText(args.requested_to)
  );
}

export function selectConnectorRuntimeJobForStart(args: {
  jobs: ConnectorRuntimeJobCandidate[];
  workspace_id: string;
  connector_id: string;
  job_type: string;
  requested_from: string;
  requested_to: string;
  explicit_job_id?: string | null;
  force_new_job?: boolean;
}) {
  if (args.force_new_job) return null;
  const explicitJobId = cleanText(args.explicit_job_id);
  if (explicitJobId) {
    const explicitJob = args.jobs.find((job) => cleanText(job.id) === explicitJobId) || null;
    return explicitJob && isConnectorRuntimeV1Job(explicitJob, args.connector_id) ? explicitJob : null;
  }
  return args.jobs.find((job) => {
    return (
      isActiveConnectorRuntimeJobStatus(job.status ?? job.progress?.status) &&
      connectorRuntimeJobMatches({
        job,
        workspace_id: args.workspace_id,
        connector_id: args.connector_id,
        job_type: args.job_type,
        requested_from: args.requested_from,
        requested_to: args.requested_to,
      })
    );
  }) || null;
}

export function normalizeConnectorRuntimeJobStatus(value: unknown): ConnectorRuntimeJobStatus {
  const status = String(value ?? "").trim().toLowerCase();
  if (status === "importing" || status === "preparing" || status === "reconciling" || status === "finalizing") {
    return "running";
  }
  if ((CONNECTOR_RUNTIME_JOB_STATUSES as readonly string[]).includes(status)) {
    return status as ConnectorRuntimeJobStatus;
  }
  return "queued";
}

export function normalizeConnectorRuntimeTaskStatus(value: unknown): ConnectorRuntimeTaskStatus {
  const status = String(value ?? "").trim().toLowerCase();
  if ((CONNECTOR_RUNTIME_TASK_STATUSES as readonly string[]).includes(status)) {
    return status as ConnectorRuntimeTaskStatus;
  }
  return "queued";
}

export function isActiveConnectorRuntimeJobStatus(value: unknown) {
  return ACTIVE_CONNECTOR_RUNTIME_JOB_STATUSES.has(normalizeConnectorRuntimeJobStatus(value));
}

export function isTerminalConnectorRuntimeJobStatus(value: unknown) {
  return TERMINAL_CONNECTOR_RUNTIME_JOB_STATUSES.has(normalizeConnectorRuntimeJobStatus(value));
}

export function createConnectorRuntimeProgress(args: {
  workspace_id?: string | null;
  connector_id: string;
  job_type: string;
  phase: string;
  requested_from: string;
  requested_to: string;
  now?: string;
  metadata?: Record<string, any> | null;
}): ConnectorRuntimeProgress {
  const now = args.now || new Date().toISOString();
  return {
    workspace_id: cleanText(args.workspace_id) || "default",
    connector_id: cleanText(args.connector_id),
    job_type: cleanText(args.job_type),
    phase: cleanText(args.phase),
    status: "queued",
    requested_from: cleanText(args.requested_from),
    requested_to: cleanText(args.requested_to),
    records_discovered: 0,
    records_processed: 0,
    records_succeeded: 0,
    records_failed: 0,
    records_skipped: 0,
    retries: 0,
    current_cursor: null,
    current_page: null,
    last_error: null,
    next_run_at: null,
    started_at: null,
    updated_at: now,
    completed_at: null,
    metadata: args.metadata || {},
  };
}

export function connectorRuntimeTaskDedupeKey(plan: {
  task_type: string;
  phase?: string | null;
  cursor?: string | null;
  page?: number | null;
  payload?: Record<string, any> | null;
}) {
  const taskType = cleanText(plan.task_type);
  const phase = cleanText(plan.phase);
  const cursor = cleanText(plan.cursor);
  const page = plan.page === null || plan.page === undefined ? "" : String(Number(plan.page) || 0);
  const payloadKey = stableJson(plan.payload || {});
  return [taskType, phase, cursor, page, payloadKey].map((value) => encodeURIComponent(value)).join(":");
}

export function connectorRuntimeTaskMessage(task: {
  id: string;
  job_id: string;
  connector_id: string;
  task_type: string;
  phase: string;
}): ConnectorRuntimeTaskMessage {
  return {
    runtime_task_id: task.id,
    job_id: task.job_id,
    connector_id: task.connector_id,
    task_type: task.task_type,
    phase: task.phase,
  };
}

export function classifyConnectorRuntimeFailure(args: {
  status?: number | null;
  message?: unknown;
  transient?: boolean;
  permanent?: boolean;
  blocking?: boolean;
}): ConnectorRuntimeFailureClass {
  if (args.blocking || args.status === 401 || args.status === 403) return "blocking";
  if (args.permanent || args.status === 404 || /not found|malformed|invalid identifier/i.test(String(args.message || ""))) {
    return "permanent";
  }
  if (
    args.transient ||
    args.status === 408 ||
    args.status === 409 ||
    args.status === 425 ||
    args.status === 429 ||
    (Number(args.status) >= 500 && Number(args.status) <= 599) ||
    /timeout|timed out|aborted|aborterror|deadline|network|fetch failed|headers timeout|socket hang up|econnreset|etimedout/i.test(String(args.message || ""))
  ) {
    return "transient";
  }
  return "blocking";
}

function truncateText(value: unknown, limit = 4000) {
  const text = String(value ?? "");
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 15))}...[truncated]`;
}

function stringifyUnknownError(error: unknown) {
  if (typeof error === "string") return error;
  try {
    const json = JSON.stringify(error);
    if (json && json !== "{}") return json;
  } catch {
    // Fall back below.
  }
  return String(error ?? "");
}

export type ConnectorRuntimeErrorSummary = {
  message: string;
  stack: string | null;
  last_error: string;
  response_excerpt: string | null;
};

export function connectorRuntimeErrorSummary(error: unknown, limit = 4000): ConnectorRuntimeErrorSummary {
  const record = error && typeof error === "object" ? error as Record<string, any> : null;
  const cause = record?.cause ? connectorRuntimeErrorSummary(record.cause, limit) : null;
  const message = cleanText(record?.message) || cleanText(stringifyUnknownError(error)) || "unknown";
  const stack = cleanText(record?.stack);
  const fullStack = [stack, cause?.stack ? `Caused by: ${cause.stack}` : null].filter(Boolean).join("\n") || null;
  const lastError = [message, fullStack].filter(Boolean).join("\n");

  return {
    message: truncateText(message, limit),
    stack: fullStack ? truncateText(fullStack, limit) : null,
    last_error: truncateText(lastError || message, limit),
    response_excerpt: fullStack ? truncateText(fullStack, limit) : (cause?.last_error || null),
  };
}

export function connectorRuntimeRetryDelayMs(args: {
  attempt: number;
  base_ms?: number;
  cap_ms?: number;
  jitter_ms?: number;
  random?: () => number;
}) {
  const attempt = Math.max(1, Number(args.attempt || 1));
  const base = Math.max(100, Number(args.base_ms ?? 500));
  const cap = Math.max(base, Number(args.cap_ms ?? 30_000));
  const jitter = Math.max(0, Number(args.jitter_ms ?? 250));
  const random = args.random || Math.random;
  const exponential = Math.min(cap, base * 2 ** Math.max(0, attempt - 1));
  return Math.min(cap, Math.round(exponential + random() * jitter));
}

export function connectorRuntimeNextRunAt(args: {
  attempt: number;
  now_ms?: number;
  delay_ms?: number;
}) {
  const nowMs = Number(args.now_ms ?? Date.now());
  const delayMs = Number(args.delay_ms ?? connectorRuntimeRetryDelayMs({ attempt: args.attempt }));
  return new Date(nowMs + delayMs).toISOString();
}

export function mergeConnectorRuntimeCounters(
  progress: ConnectorRuntimeProgress & Record<string, any>,
  delta: Partial<Pick<
    ConnectorRuntimeProgress,
    "records_discovered" | "records_processed" | "records_succeeded" | "records_failed" | "records_skipped" | "retries"
  >>,
  args: {
    phase?: string | null;
    status?: ConnectorRuntimeJobStatus;
    cursor?: string | null;
    page?: number | null;
    last_error?: string | null;
    next_run_at?: string | null;
    now?: string;
    metadata?: Record<string, any> | null;
  } = {},
): ConnectorRuntimeProgress & Record<string, any> {
  const now = args.now || new Date().toISOString();
  return {
    ...progress,
    phase: cleanText(args.phase) || progress.phase,
    status: args.status || progress.status,
    records_discovered: Number(progress.records_discovered || 0) + Number(delta.records_discovered || 0),
    records_processed: Number(progress.records_processed || 0) + Number(delta.records_processed || 0),
    records_succeeded: Number(progress.records_succeeded || 0) + Number(delta.records_succeeded || 0),
    records_failed: Number(progress.records_failed || 0) + Number(delta.records_failed || 0),
    records_skipped: Number(progress.records_skipped || 0) + Number(delta.records_skipped || 0),
    retries: Number(progress.retries || 0) + Number(delta.retries || 0),
    current_cursor: args.cursor === undefined ? progress.current_cursor : args.cursor,
    current_page: args.page === undefined ? progress.current_page : args.page,
    last_error: args.last_error === undefined ? progress.last_error : args.last_error,
    next_run_at: args.next_run_at === undefined ? progress.next_run_at : args.next_run_at,
    updated_at: now,
    metadata: {
      ...(progress.metadata || {}),
      ...(args.metadata || {}),
    },
  };
}

export function connectorRuntimeFinalizeFailureProgress(
  progress: ConnectorRuntimeProgress & Record<string, any>,
  args: {
    now?: string;
    message: string;
    stack?: string | null;
    last_error: string;
  },
) {
  const now = args.now || new Date().toISOString();
  const next = mergeConnectorRuntimeCounters(progress, {}, {
    status: "completed_with_errors",
    phase: "validate_and_finalize",
    cursor: null,
    page: null,
    last_error: args.last_error,
    next_run_at: null,
    now,
    metadata: {
      finalize_summary_failed: true,
      finalize_error_message: args.message,
      finalize_error_stack: args.stack || null,
    },
  });
  next.completed_at = now;
  return next;
}

export function connectorRuntimeFinalizeSuccessProgress(
  progress: ConnectorRuntimeProgress & Record<string, any>,
  args: {
    now?: string;
    remaining_blank_references: number;
    unresolved_error_count: number;
  },
) {
  const remainingBlankReferences = Math.max(0, Number(args.remaining_blank_references || 0));
  const unresolvedErrorCount = Math.max(0, Number(args.unresolved_error_count || 0));
  const status: ConnectorRuntimeJobStatus = remainingBlankReferences || unresolvedErrorCount
    ? "completed_with_errors"
    : "completed";
  const now = args.now || new Date().toISOString();
  const next = mergeConnectorRuntimeCounters(progress, {}, {
    status,
    phase: "validate_and_finalize",
    cursor: null,
    page: null,
    last_error: status === "completed_with_errors" ? "Backfill completed with unresolved records or errors." : null,
    next_run_at: null,
    now,
    metadata: {
      finalize_summary_failed: false,
      remaining_blank_references: remainingBlankReferences,
      unresolved_error_count: unresolvedErrorCount,
    },
  });
  next.completed_at = now;
  return next;
}

export function connectorRuntimeRerunFinalizeProgress(
  progress: ConnectorRuntimeProgress & Record<string, any>,
  args: { now?: string } = {},
) {
  const now = args.now || new Date().toISOString();
  const next = mergeConnectorRuntimeCounters(progress, {}, {
    status: "queued",
    phase: "validate_and_finalize",
    cursor: null,
    page: null,
    last_error: null,
    next_run_at: null,
    now,
  });
  next.completed_at = null;
  return next;
}

export function boundedRecent<T>(values: readonly T[], limit = 10) {
  return values.slice(Math.max(0, values.length - Math.max(0, limit)));
}

export function compactConnectorRuntimeJobPayload(
  job: Record<string, any>,
  args: {
    queued_tasks?: number;
    running_tasks?: number;
    failed_tasks?: number;
    recent_errors?: any[];
  } = {},
) {
  const progress = (job.progress || {}) as Record<string, any>;
  const metadata = {
    ...((progress.metadata || {}) as Record<string, any>),
    ...((job.metadata || {}) as Record<string, any>),
  };
  return {
    id: job.id,
    job_id: job.id,
    workspace_id: job.workspace_id || progress.workspace_id || "default",
    connector_id: job.connector_id || progress.connector_id || job.platform,
    job_type: job.job_type || progress.job_type || job.module || job.filter,
    phase: job.phase || progress.phase || null,
    status: normalizeConnectorRuntimeJobStatus(job.status || progress.status),
    requested_from: job.requested_from || progress.requested_from || job.from_date,
    requested_to: job.requested_to || progress.requested_to || job.to_date,
    records_discovered: Number(job.records_discovered ?? progress.records_discovered ?? 0),
    records_processed: Number(job.records_processed ?? progress.records_processed ?? 0),
    records_succeeded: Number(job.records_succeeded ?? progress.records_succeeded ?? 0),
    records_failed: Number(job.records_failed ?? progress.records_failed ?? 0),
    records_skipped: Number(job.records_skipped ?? progress.records_skipped ?? 0),
    retries: Number(job.retries ?? progress.retries ?? 0),
    current_cursor: job.current_cursor ?? progress.current_cursor ?? null,
    current_page: job.current_page ?? progress.current_page ?? null,
    last_error: job.last_error ?? progress.last_error ?? job.error ?? null,
    next_run_at: job.next_run_at ?? progress.next_run_at ?? null,
    created_at: job.created_at ?? job.requested_at ?? null,
    started_at: job.started_at ?? progress.started_at ?? null,
    updated_at: job.updated_at ?? progress.updated_at ?? null,
    completed_at: job.completed_at ?? progress.completed_at ?? null,
    queued_tasks: Number(args.queued_tasks || 0),
    running_tasks: Number(args.running_tasks || 0),
    failed_tasks: Number(args.failed_tasks || 0),
    metrics: compactConnectorRuntimeMetrics(metadata),
    recent_errors: boundedRecent(args.recent_errors || [], 10),
  };
}

export function compactConnectorRuntimeMetrics(metadata: Record<string, any>) {
  return {
    export_pages_scanned: Number(metadata.export_pages_scanned ?? metadata.export_pages_processed ?? 0),
    export_rows_seen: Number(metadata.export_rows_seen ?? metadata.export_rows_fetched ?? 0),
    target_order_numbers_total: Number(metadata.target_order_numbers_total ?? 0),
    target_order_numbers_mapped: Number(metadata.target_order_numbers_mapped ?? 0),
    target_order_numbers_remaining: Number(metadata.target_order_numbers_remaining ?? 0),
    target_mapping_coverage_percent: Number(metadata.target_mapping_coverage_percent ?? 0),
    staging_stop_reason: metadata.staging_stop_reason ?? null,
    last_export_page: metadata.last_export_page ?? null,
    discovered: Number(metadata.discovered ?? 0),
    eligible: Number(metadata.eligible ?? 0),
    batches_created: Number(metadata.batches_created ?? 0),
    people_created: Number(metadata.people_created ?? 0),
    people_matched: Number(metadata.people_matched ?? 0),
    attached: Number(metadata.attached ?? 0),
    would_create_person: Number(metadata.would_create_person ?? 0),
    would_match_existing: Number(metadata.would_match_existing ?? 0),
    would_require_review: Number(metadata.would_require_review ?? 0),
    would_skip_no_identifiers: Number(metadata.would_skip_no_identifiers ?? 0),
    already_linked: Number(metadata.already_linked ?? 0),
    skipped_no_identifiers: Number(metadata.skipped_no_identifiers ?? 0),
    review_required: Number(metadata.review_required ?? 0),
    attachment_conflicts: Number(metadata.attachment_conflicts ?? 0),
    permanent_errors: Number(metadata.permanent_errors ?? 0),
    transient_retries: Number(metadata.transient_retries ?? 0),
    remaining_unlinked: Number(metadata.remaining_unlinked ?? 0),
    incomplete_discovery: Boolean(metadata.incomplete_discovery),
    discovery_completed_platforms: Array.isArray(metadata.discovery_completed_platforms) ? metadata.discovery_completed_platforms : [],
    discovery_pending_platforms: Array.isArray(metadata.discovery_pending_platforms) ? metadata.discovery_pending_platforms : [],
    discovery_failed_platforms: Array.isArray(metadata.discovery_failed_platforms) ? metadata.discovery_failed_platforms : [],
  };
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function stableJson(value: unknown): string {
  if (!value || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}
