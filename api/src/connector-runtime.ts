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
export const CONNECTOR_RUNTIME_TASK_DIAGNOSTIC_EVENT_LIMIT = 25;
export const CONNECTOR_RUNTIME_DURABLE_HEARTBEAT_MIN_INTERVAL_MS = 10000;
export const CONNECTOR_RUNTIME_QUEUE_ENQUEUE_MAX_ATTEMPTS = 4;
export const CONNECTOR_RUNTIME_QUEUE_ENQUEUE_BASE_DELAY_MS = 250;
export const CONNECTOR_RUNTIME_QUEUE_ENQUEUE_MAX_DELAY_MS = 2000;
export const CONNECTOR_RUNTIME_QUEUE_ENQUEUE_JITTER_MS = 100;

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
  task_id: string;
  job_id: string;
  connector_id: string;
  task_type: string;
  phase: string;
};

export type ConnectorRuntimeAdminRequeueTaskMessage = {
  runtime_task_id: string;
  task_id: string;
  job_id: string;
  task_type: string;
};

export type ConnectorRuntimeQueueSendEvent = {
  event: "connector_runtime.queue.enqueue_retry" | "connector_runtime.queue.enqueue_retry_success" | "connector_runtime.queue.enqueue_retry_exhausted";
  details: Record<string, any>;
};

export type ConnectorRuntimeInlineDebugDiagnosticEvent = {
  event?: string | null;
  details?: Record<string, any> | null;
  at?: string | null;
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
    task_id: task.id,
    job_id: task.job_id,
    connector_id: task.connector_id,
    task_type: task.task_type,
    phase: task.phase,
  };
}

export function connectorRuntimeAdminRequeueTaskMessage(task: {
  id: string;
  job_id: string;
  task_type: string;
}): ConnectorRuntimeAdminRequeueTaskMessage {
  return {
    runtime_task_id: task.id,
    task_id: task.id,
    job_id: task.job_id,
    task_type: task.task_type,
  };
}

export function connectorRuntimeRequeueTaskDecision(args: {
  task?: { id?: string | null; job_id?: string | null; task_type?: string | null; status?: string | null } | null;
  job?: { id?: string | null; status?: string | null } | null;
  progress?: ConnectorRuntimeProgress | null;
  now: string;
}) {
  if (!args.task) {
    return { ok: false as const, status: 404, error: "not_found", message: "Connector runtime task not found." };
  }
  if (args.task.status !== "queued") {
    return { ok: false as const, status: 409, error: "task_not_queued", message: "Connector runtime task must be queued before it can be re-enqueued." };
  }
  if (!args.job) {
    return { ok: false as const, status: 404, error: "job_not_found", message: "Import job not found for connector runtime task." };
  }

  const jobPatch = args.progress?.status === "completed_with_errors"
    ? {
      ...args.progress,
      status: "retrying" as const,
      completed_at: null,
      records_failed: 0,
      next_run_at: args.now,
      updated_at: args.now,
    }
    : null;

  return {
    ok: true as const,
    message: connectorRuntimeAdminRequeueTaskMessage({
      id: cleanText(args.task.id),
      job_id: cleanText(args.task.job_id),
      task_type: cleanText(args.task.task_type),
    }),
    job_patch: jobPatch,
    create_task: false,
  };
}

function connectorRuntimeTaskTimestampMs(value: unknown) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function appendConnectorRuntimeTaskDiagnostic(
  summary: Record<string, any> | null | undefined,
  event: string,
  details: Record<string, any> = {},
  now: string = new Date().toISOString(),
) {
  const base = summary && typeof summary === "object" ? { ...summary } : {};
  const events = Array.isArray(base.diagnostic_events) ? base.diagnostic_events.slice(-CONNECTOR_RUNTIME_TASK_DIAGNOSTIC_EVENT_LIMIT + 1) : [];
  return {
    ...base,
    heartbeat_at: now,
    heartbeat_event: event,
    heartbeat_count: Number(base.heartbeat_count || 0) + 1,
    diagnostic_events: [
      ...events,
      {
        at: now,
        event,
        ...details,
      },
    ],
  };
}

export function appendConnectorRuntimeTaskDiagnosticBatch(
  summary: Record<string, any> | null | undefined,
  heartbeatEvent: string,
  eventsToAppend: Array<{ event: string; details?: Record<string, any>; at?: string | null }>,
  now: string = new Date().toISOString(),
) {
  const base = summary && typeof summary === "object" ? { ...summary } : {};
  const existingEvents = Array.isArray(base.diagnostic_events) ? base.diagnostic_events : [];
  const batchEvents = eventsToAppend.map((item) => ({
    at: item.at || now,
    event: item.event,
    ...(item.details || {}),
  }));
  const lastEvent = batchEvents[batchEvents.length - 1] || null;
  return {
    ...base,
    heartbeat_at: now,
    heartbeat_event: heartbeatEvent,
    heartbeat_count: Number(base.heartbeat_count || 0) + 1,
    diagnostic_event: lastEvent?.event || base.diagnostic_event || heartbeatEvent,
    diagnostic_event_count: Number(base.diagnostic_event_count || 0) + batchEvents.length,
    diagnostic_events: [
      ...existingEvents,
      ...batchEvents,
    ].slice(-CONNECTOR_RUNTIME_TASK_DIAGNOSTIC_EVENT_LIMIT),
  };
}

function connectorRuntimeErrorText(error: unknown) {
  const message = (error as any)?.message || String(error || "");
  const name = (error as any)?.name || "";
  return `${name} ${message}`.trim();
}

export function isCloudflareSubrequestLimitError(error: unknown) {
  return /too many subrequests/i.test(connectorRuntimeErrorText(error));
}

function normalizeConnectorRuntimeInlineDebugEvent(item: any) {
  if (!item || typeof item !== "object") return null;
  const event = String(item.event || "").trim();
  if (!event) return null;
  const details = item.details && typeof item.details === "object" ? item.details : item;
  const { details: _nestedDetails, ...rest } = details || {};
  return {
    ...rest,
    event,
    at: item.at || details?.at || details?.timestamp || null,
  };
}

export function compactConnectorRuntimeInlineDebugDiagnostics(args: {
  summary?: Record<string, any> | null;
  target_diagnostic_events?: ConnectorRuntimeInlineDebugDiagnosticEvent[] | null;
  subrequest_tracker?: Record<string, any> | null;
  identity_resolution_metrics?: Record<string, any> | null;
  error?: unknown;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(100, Math.floor(Number(args.limit || 50))));
  const summary = args.summary && typeof args.summary === "object" ? args.summary : {};
  const bufferedTargetEvents = [
    ...(Array.isArray(args.target_diagnostic_events) ? args.target_diagnostic_events : []),
    ...(Array.isArray(summary.target_diagnostic_events) ? summary.target_diagnostic_events : []),
  ].map(normalizeConnectorRuntimeInlineDebugEvent).filter(Boolean) as Record<string, any>[];
  const summaryEvents = (Array.isArray(summary.diagnostic_events) ? summary.diagnostic_events : [])
    .map(normalizeConnectorRuntimeInlineDebugEvent)
    .filter(Boolean) as Record<string, any>[];
  const sourceEvents = bufferedTargetEvents.length ? bufferedTargetEvents : summaryEvents;
  const tracker = args.subrequest_tracker && typeof args.subrequest_tracker === "object" ? args.subrequest_tracker : null;
  const byOperation = tracker?.by_operation && typeof tracker.by_operation === "object"
    ? Object.fromEntries(Object.entries(tracker.by_operation).map(([key, value]) => {
      const stats = value && typeof value === "object" ? value as Record<string, any> : {};
      return [key, {
        operation: stats.operation || null,
        repository_method: stats.repository_method || null,
        count: Number(stats.count || 0),
        completed: Number(stats.completed || 0),
        errors: Number(stats.errors || 0),
        timeouts: Number(stats.timeouts || 0),
        elapsed_ms: Number(stats.elapsed_ms || 0),
        max_elapsed_ms: Number(stats.max_elapsed_ms || 0),
      }];
    }))
    : {};
  const lastEvent = sourceEvents[sourceEvents.length - 1] || summaryEvents[summaryEvents.length - 1] || null;
  return {
    last_50_buffered_diagnostic_events: sourceEvents.slice(-limit),
    buffered_diagnostic_event_count: sourceEvents.length,
    diagnostic_event_source: bufferedTargetEvents.length ? "target_diagnostic_events" : "summary_diagnostic_events",
    subrequest_tracker_count: Number(tracker?.count || 0),
    subrequest_tracker_completed: Number(tracker?.completed || 0),
    subrequest_tracker_errors: Number(tracker?.errors || 0),
    subrequest_tracker_timeouts: Number(tracker?.timeouts || 0),
    totals_grouped_by_operation: byOperation,
    identity_resolution_metrics: args.identity_resolution_metrics && typeof args.identity_resolution_metrics === "object"
      ? args.identity_resolution_metrics
      : summary.identity_resolution_metrics || null,
    last_successfully_entered_operation: lastEvent?.operation || lastEvent?.event || summary.diagnostic_event || null,
    error_name: (args.error as any)?.name || "Error",
    error_message: (args.error as any)?.message || String(args.error || ""),
  };
}

export function appendConnectorRuntimeTaskDiagnosticSample(
  summary: Record<string, any> | null | undefined,
  event: string,
  details: Record<string, any> = {},
  now: string = new Date().toISOString(),
) {
  const base = summary && typeof summary === "object" ? { ...summary } : {};
  const events = Array.isArray(base.diagnostic_events) ? base.diagnostic_events.slice(-CONNECTOR_RUNTIME_TASK_DIAGNOSTIC_EVENT_LIMIT + 1) : [];
  return {
    ...base,
    diagnostic_event: event,
    diagnostic_event_count: Number(base.diagnostic_event_count || 0) + 1,
    diagnostic_events: [
      ...events,
      {
        at: now,
        event,
        ...details,
      },
    ],
  };
}

export function shouldWriteConnectorRuntimeDurableHeartbeat(args: {
  force?: boolean;
  last_heartbeat_ms?: number | null;
  now_ms?: number;
  min_interval_ms?: number;
}) {
  if (args.force) return true;
  const lastHeartbeatMs = Number(args.last_heartbeat_ms || 0);
  if (!lastHeartbeatMs) return true;
  const nowMs = Number(args.now_ms ?? Date.now());
  const minIntervalMs = Math.max(1, Number(args.min_interval_ms || CONNECTOR_RUNTIME_DURABLE_HEARTBEAT_MIN_INTERVAL_MS));
  return Math.max(0, nowMs - lastHeartbeatMs) >= minIntervalMs;
}

export function connectorRuntimeTaskHeartbeatTimestampMs(task: {
  locked_at?: string | null;
  updated_at?: string | null;
  result_summary?: Record<string, any> | null;
}) {
  return Math.max(
    connectorRuntimeTaskTimestampMs(task.result_summary?.heartbeat_at),
    connectorRuntimeTaskTimestampMs(task.locked_at),
    connectorRuntimeTaskTimestampMs(task.updated_at),
  );
}

export function isConnectorRuntimeTaskStale(task: {
  status?: string | null;
  locked_at?: string | null;
  updated_at?: string | null;
  result_summary?: Record<string, any> | null;
}, args: { now_ms?: number; stale_ms: number }) {
  if (task.status !== "running") return false;
  const heartbeatMs = connectorRuntimeTaskHeartbeatTimestampMs(task);
  if (!heartbeatMs) return false;
  return Math.max(0, Number(args.now_ms ?? Date.now()) - heartbeatMs) >= args.stale_ms;
}

export function connectorRuntimeStaleRunningTaskRecoveryDecision(task: {
  status?: string | null;
  locked_at?: string | null;
  updated_at?: string | null;
  attempt_count?: number | null;
  max_attempts?: number | null;
  cursor?: string | null;
  payload?: Record<string, any> | null;
  result_summary?: Record<string, any> | null;
}, args: {
  stale_ms: number;
  now_ms?: number;
  now?: string;
  recovered_event: string;
  exhausted_event: string;
  reason?: string | null;
  last_error: string;
}) {
  const nowMs = Number(args.now_ms ?? Date.now());
  const now = args.now || new Date(nowMs).toISOString();
  if (!isConnectorRuntimeTaskStale(task, { now_ms: nowMs, stale_ms: args.stale_ms })) {
    return { action: "active" as const, patch: null, attempt_count: Number(task.attempt_count || 0) };
  }
  const currentAttempt = Math.max(0, Number(task.attempt_count || 0));
  const maxAttempts = Math.max(1, Number(task.max_attempts || 5));
  if (currentAttempt >= maxAttempts) {
    return {
      action: "fail" as const,
      attempt_count: currentAttempt,
      patch: {
        status: "failed",
        locked_at: null,
        completed_at: now,
        last_error: args.last_error,
        result_summary: appendConnectorRuntimeTaskDiagnostic(task.result_summary, args.exhausted_event, {
          reason: args.reason || "stale_running_task",
          previous_status: task.status || null,
          previous_locked_at: task.locked_at || null,
          attempt_count: currentAttempt,
          max_attempts: maxAttempts,
          cursor_preserved: task.cursor || null,
          payload_preserved: true,
        }, now),
      },
    };
  }
  const nextAttempt = currentAttempt + 1;
  return {
    action: "reclaim" as const,
    attempt_count: nextAttempt,
    patch: {
      status: "running",
      locked_at: now,
      completed_at: null,
      attempt_count: nextAttempt,
      last_error: null,
      result_summary: appendConnectorRuntimeTaskDiagnostic(task.result_summary, args.recovered_event, {
        reason: args.reason || "stale_running_task",
        previous_status: task.status || null,
        previous_locked_at: task.locked_at || null,
        attempt_count: nextAttempt,
        max_attempts: maxAttempts,
        cursor_preserved: task.cursor || null,
        payload_preserved: true,
      }, now),
    },
  };
}

export function connectorRuntimeStaleRunningTaskRequeueDecision(task: {
  status?: string | null;
  locked_at?: string | null;
  updated_at?: string | null;
  attempt_count?: number | null;
  max_attempts?: number | null;
  cursor?: string | null;
  payload?: Record<string, any> | null;
  result_summary?: Record<string, any> | null;
}, args: {
  stale_ms: number;
  now_ms?: number;
  now?: string;
  recovered_event: string;
  exhausted_event: string;
  reason?: string | null;
  last_error: string;
}) {
  const nowMs = Number(args.now_ms ?? Date.now());
  const now = args.now || new Date(nowMs).toISOString();
  if (!isConnectorRuntimeTaskStale(task, { now_ms: nowMs, stale_ms: args.stale_ms })) {
    return { action: "active" as const, patch: null, attempt_count: Number(task.attempt_count || 0) };
  }
  const currentAttempt = Math.max(0, Number(task.attempt_count || 0));
  const maxAttempts = Math.max(1, Number(task.max_attempts || 5));
  if (currentAttempt >= maxAttempts) {
    return {
      action: "fail" as const,
      attempt_count: currentAttempt,
      patch: {
        status: "failed",
        locked_at: null,
        completed_at: now,
        last_error: args.last_error,
        result_summary: appendConnectorRuntimeTaskDiagnostic(task.result_summary, args.exhausted_event, {
          reason: args.reason || "stale_running_task",
          previous_status: task.status || null,
          previous_locked_at: task.locked_at || null,
          attempt_count: currentAttempt,
          max_attempts: maxAttempts,
          cursor_preserved: task.cursor || null,
          payload_preserved: true,
        }, now),
      },
    };
  }
  const nextAttempt = currentAttempt + 1;
  return {
    action: "requeue" as const,
    attempt_count: nextAttempt,
    patch: {
      status: "queued",
      available_at: now,
      locked_at: null,
      completed_at: null,
      attempt_count: nextAttempt,
      last_error: null,
      result_summary: appendConnectorRuntimeTaskDiagnostic(task.result_summary, args.recovered_event, {
        reason: args.reason || "stale_running_task",
        previous_status: task.status || null,
        previous_locked_at: task.locked_at || null,
        attempt_count: nextAttempt,
        max_attempts: maxAttempts,
        cursor_preserved: task.cursor || null,
        payload_preserved: true,
        reclaimed_attempt_count: nextAttempt,
      }, now),
    },
  };
}

export function connectorRuntimeQueuedTaskRepublishDecision(task: {
  status?: string | null;
  available_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}, args: {
  now_ms?: number;
  orphan_ms: number;
  force?: boolean;
}) {
  const status = cleanText(task.status);
  if (status !== "queued" && status !== "retrying") {
    return { action: "ignore" as const, reason: "task_not_queued", age_ms: 0 };
  }
  const nowMs = Number(args.now_ms ?? Date.now());
  const availableMs = task.available_at ? Date.parse(task.available_at) : 0;
  if (Number.isFinite(availableMs) && availableMs > nowMs) {
    return { action: "ignore" as const, reason: "task_not_available_yet", age_ms: 0 };
  }
  const referenceMs = Math.max(
    Number.isFinite(availableMs) ? availableMs : 0,
    task.updated_at ? Date.parse(task.updated_at) : 0,
    task.created_at ? Date.parse(task.created_at) : 0,
  );
  const ageMs = referenceMs ? Math.max(0, nowMs - referenceMs) : Number.POSITIVE_INFINITY;
  if (!args.force && ageMs < Math.max(1, Number(args.orphan_ms || 1))) {
    return { action: "ignore" as const, reason: "queued_recently", age_ms: ageMs };
  }
  return {
    action: "republish" as const,
    reason: status === "retrying" ? "retrying_task_available" : "orphan_queued_task",
    age_ms: ageMs,
  };
}

export function connectorRuntimeAttemptAlreadyIncremented(task: {
  attempt_count?: number | null;
  result_summary?: Record<string, any> | null;
}) {
  const attemptCount = Number(task.attempt_count || 0);
  const events = Array.isArray(task.result_summary?.diagnostic_events) ? task.result_summary?.diagnostic_events : [];
  return events.some((event: any) => Number(event?.reclaimed_attempt_count || 0) === attemptCount);
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
    /57014|statement timeout|canceling statement due to statement timeout|timeout|timed out|aborted|aborterror|deadline|network|fetch failed|headers timeout|socket hang up|econnreset|etimedout/i.test(String(args.message || ""))
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

function headerValue(headers: unknown, name: string) {
  if (!headers) return "";
  const getter = (headers as any).get;
  if (typeof getter === "function") return cleanText(getter.call(headers, name));
  const record = headers as Record<string, any>;
  return cleanText(record[name] ?? record[name.toLowerCase()] ?? record[name.toUpperCase()]);
}

export function connectorRuntimeQueueRetryAfterMs(error: unknown, nowMs = Date.now()) {
  const record = error && typeof error === "object" ? error as Record<string, any> : {};
  const retryAfter = cleanText(
    headerValue(record.headers, "Retry-After") ||
    headerValue(record.response?.headers, "Retry-After") ||
    record.retry_after ||
    record.retryAfter,
  );
  if (!retryAfter) return null;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000));
  const dateMs = Date.parse(retryAfter);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - nowMs);
  return null;
}

export function isCloudflareQueueRateLimitError(error: unknown) {
  const record = error && typeof error === "object" ? error as Record<string, any> : {};
  const status = Number(record.status ?? record.statusCode ?? record.response?.status ?? 0);
  const message = [
    record.message,
    record.statusText,
    record.response?.statusText,
    stringifyUnknownError(error),
  ].map((value) => cleanText(value)).filter(Boolean).join(" ");
  return status === 429 || /too many requests/i.test(message);
}

export function connectorRuntimeQueueEnqueueRetryDelayMs(args: {
  attempt: number;
  error?: unknown;
  now_ms?: number;
  random?: () => number;
}) {
  const retryAfterMs = connectorRuntimeQueueRetryAfterMs(args.error, Number(args.now_ms ?? Date.now()));
  if (retryAfterMs !== null) return retryAfterMs;
  return connectorRuntimeRetryDelayMs({
    attempt: args.attempt,
    base_ms: CONNECTOR_RUNTIME_QUEUE_ENQUEUE_BASE_DELAY_MS,
    cap_ms: CONNECTOR_RUNTIME_QUEUE_ENQUEUE_MAX_DELAY_MS,
    jitter_ms: CONNECTOR_RUNTIME_QUEUE_ENQUEUE_JITTER_MS,
    random: args.random,
  });
}

export class ConnectorRuntimeQueueEnqueueRetryExhaustedError extends Error {
  status = 429;
  transient = true;
  attempts: number;
  cause: unknown;

  constructor(message: string, attempts: number, cause: unknown) {
    super(message);
    this.name = "ConnectorRuntimeQueueEnqueueRetryExhaustedError";
    this.attempts = attempts;
    this.cause = cause;
  }
}

export async function sendConnectorRuntimeQueueMessageWithRetry<TMessage = unknown, TOptions = unknown>(args: {
  send: (message: TMessage, options?: TOptions) => Promise<unknown>;
  message: TMessage;
  options?: TOptions;
  runtime_task_id?: string | null;
  job_id?: string | null;
  max_attempts?: number;
  random?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
  onEvent?: (event: ConnectorRuntimeQueueSendEvent) => void | Promise<void>;
  now_ms?: () => number;
}) {
  const maxAttempts = Math.max(1, Math.min(CONNECTOR_RUNTIME_QUEUE_ENQUEUE_MAX_ATTEMPTS, Math.floor(Number(args.max_attempts || CONNECTOR_RUNTIME_QUEUE_ENQUEUE_MAX_ATTEMPTS))));
  const sleep = args.sleep || ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  const startedMs = args.now_ms?.() ?? Date.now();
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await args.send(args.message, args.options);
      if (attempt > 1) {
        await Promise.resolve(args.onEvent?.({
          event: "connector_runtime.queue.enqueue_retry_success",
          details: {
            attempt,
            elapsed_ms: Math.max(0, (args.now_ms?.() ?? Date.now()) - startedMs),
            runtime_task_id: cleanText(args.runtime_task_id) || null,
            job_id: cleanText(args.job_id) || null,
          },
        })).catch(() => {});
      }
      return { ok: true, attempts: attempt, retried: attempt > 1 };
    } catch (error: any) {
      lastError = error;
      if (!isCloudflareQueueRateLimitError(error)) throw error;
      if (attempt >= maxAttempts) {
        await Promise.resolve(args.onEvent?.({
          event: "connector_runtime.queue.enqueue_retry_exhausted",
          details: {
            attempts: maxAttempts,
            runtime_task_id: cleanText(args.runtime_task_id) || null,
            job_id: cleanText(args.job_id) || null,
            reason: cleanText(error?.message) || "Too Many Requests",
          },
        })).catch(() => {});
        throw new ConnectorRuntimeQueueEnqueueRetryExhaustedError(
          `Queue send failed after ${maxAttempts} attempts: ${cleanText(error?.message) || "Too Many Requests"}`,
          maxAttempts,
          error,
        );
      }
      const delayMs = connectorRuntimeQueueEnqueueRetryDelayMs({
        attempt,
        error,
        now_ms: args.now_ms?.() ?? Date.now(),
        random: args.random,
      });
      await Promise.resolve(args.onEvent?.({
        event: "connector_runtime.queue.enqueue_retry",
        details: {
          attempt,
          delay_ms: delayMs,
          reason: cleanText(error?.message) || "Too Many Requests",
          runtime_task_id: cleanText(args.runtime_task_id) || null,
          job_id: cleanText(args.job_id) || null,
        },
      })).catch(() => {});
      await sleep(delayMs);
    }
  }
  throw new ConnectorRuntimeQueueEnqueueRetryExhaustedError(
    `Queue send failed after ${maxAttempts} attempts`,
    maxAttempts,
    lastError,
  );
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
  const dryRun = Boolean(metadata.dry_run);
  const leakedPeopleCreated = dryRun ? Number(metadata.people_created ?? 0) : 0;
  const leakedPeopleMatched = dryRun ? Number(metadata.people_matched ?? 0) : 0;
  const leakedReviewRequired = dryRun ? Number(metadata.review_required ?? 0) : 0;
  const leakedSkippedNoIdentifiers = dryRun ? Number(metadata.skipped_no_identifiers ?? 0) : 0;
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
    people_created: dryRun ? 0 : Number(metadata.people_created ?? 0),
    people_matched: dryRun ? 0 : Number(metadata.people_matched ?? 0),
    attached: dryRun ? 0 : Number(metadata.attached ?? 0),
    would_create_person: Number(metadata.would_create_person ?? 0) + leakedPeopleCreated,
    would_match_existing: Number(metadata.would_match_existing ?? 0) + leakedPeopleMatched,
    would_require_review: Number(metadata.would_require_review ?? 0) + leakedReviewRequired,
    would_skip_no_identifiers: Number(metadata.would_skip_no_identifiers ?? 0) + leakedSkippedNoIdentifiers,
    already_linked: Number(metadata.already_linked ?? 0),
    skipped_no_identifiers: dryRun ? 0 : Number(metadata.skipped_no_identifiers ?? 0),
    review_required: dryRun ? 0 : Number(metadata.review_required ?? 0),
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
