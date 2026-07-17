import test from "node:test";
import assert from "node:assert/strict";
import {
  CONNECTOR_RUNTIME_EXECUTION_MODE,
  CONNECTOR_RUNTIME_TASK_DIAGNOSTIC_EVENT_LIMIT,
  CONNECTOR_RUNTIME_VERSION,
  appendConnectorRuntimeTaskDiagnostic,
  appendConnectorRuntimeTaskDiagnosticSample,
  classifyConnectorRuntimeFailure,
  compactConnectorRuntimeJobPayload,
  connectorRuntimeErrorSummary,
  connectorRuntimeFinalizeFailureProgress,
  connectorRuntimeFinalizeSuccessProgress,
  connectorRuntimeMarkers,
  connectorRuntimeMetadata,
  connectorRuntimeNextRunAt,
  connectorRuntimeRerunFinalizeProgress,
  connectorRuntimeRetryDelayMs,
  connectorRuntimeTaskDedupeKey,
  connectorRuntimeTaskHeartbeatTimestampMs,
  connectorRuntimeTaskMessage,
  createConnectorRuntimeProgress,
  isConnectorRuntimeTaskStale,
  isActiveConnectorRuntimeJobStatus,
  isConnectorRuntimeV1Job,
  isTerminalConnectorRuntimeJobStatus,
  mergeConnectorRuntimeCounters,
  normalizeConnectorRuntimeJobStatus,
  normalizeConnectorRuntimeTaskStatus,
  selectConnectorRuntimeJobForStart,
  shouldWriteConnectorRuntimeDurableHeartbeat,
} from "./connector-runtime.ts";

test("creates compact runtime progress for durable connector jobs", () => {
  const progress = createConnectorRuntimeProgress({
    workspace_id: "default",
    connector_id: "wowboost-commerce-reference-backfill",
    job_type: "commerce_reference_backfill",
    phase: "stage_export_pages",
    requested_from: "2026-04-01",
    requested_to: "2026-07-13",
    now: "2026-07-15T12:00:00.000Z",
  });

  assert.equal(progress.status, "queued");
  assert.equal(progress.records_processed, 0);
  assert.equal(progress.current_page, null);
  assert.equal(progress.updated_at, "2026-07-15T12:00:00.000Z");
});

test("runtime metadata marks Connector Runtime v1 jobs durably", () => {
  const metadata = connectorRuntimeMetadata({
    connector_id: "wowboost-commerce-reference-backfill",
    metadata: { export_page_size: 500 },
  });

  assert.equal(metadata.runtime_version, CONNECTOR_RUNTIME_VERSION);
  assert.equal(metadata.execution_mode, CONNECTOR_RUNTIME_EXECUTION_MODE);
  assert.equal(metadata.runtime_connector, "wowboost-commerce-reference-backfill");
  assert.equal(metadata.export_page_size, 500);
  assert.deepEqual(connectorRuntimeMarkers({ metadata }), {
    runtime_version: 1,
    execution_mode: "connector_runtime",
    runtime_connector: "wowboost-commerce-reference-backfill",
  });
  assert.equal(isConnectorRuntimeV1Job({ metadata }, "wowboost-commerce-reference-backfill"), true);
  assert.equal(isConnectorRuntimeV1Job({ metadata: { runtime_version: 1 } }, "wowboost-commerce-reference-backfill"), false);
});

test("runtime status helpers preserve paused retrying and completed_with_errors", () => {
  assert.equal(normalizeConnectorRuntimeJobStatus("importing"), "running");
  assert.equal(normalizeConnectorRuntimeJobStatus("paused"), "paused");
  assert.equal(normalizeConnectorRuntimeJobStatus("retrying"), "retrying");
  assert.equal(normalizeConnectorRuntimeJobStatus("completed_with_errors"), "completed_with_errors");
  assert.equal(normalizeConnectorRuntimeTaskStatus("bad"), "queued");
  assert.equal(isActiveConnectorRuntimeJobStatus("paused"), true);
  assert.equal(isTerminalConnectorRuntimeJobStatus("completed_with_errors"), true);
});

test("legacy synchronous jobs are never auto-reused by Connector Runtime v1", () => {
  const legacyJob = {
    id: "legacy-job",
    platform: "wowboost",
    status: "running",
    from_date: "2026-04-01",
    to_date: "2026-07-13",
    filter: "commerce_reference_backfill",
    progress: {
      workspace_id: "default",
      connector_id: "wowboost-commerce-reference-backfill",
      job_type: "commerce_reference_backfill",
      requested_from: "2026-04-01",
      requested_to: "2026-07-13",
    },
  };

  const selected = selectConnectorRuntimeJobForStart({
    jobs: [legacyJob],
    workspace_id: "default",
    connector_id: "wowboost-commerce-reference-backfill",
    job_type: "commerce_reference_backfill",
    requested_from: "2026-04-01",
    requested_to: "2026-07-13",
  });

  assert.equal(selected, null);
});

test("active matching runtime jobs can be deduped", () => {
  const runtimeJob = {
    id: "runtime-job",
    status: "queued",
    workspace_id: "default",
    connector_id: "wowboost-commerce-reference-backfill",
    job_type: "commerce_reference_backfill",
    requested_from: "2026-04-01",
    requested_to: "2026-07-13",
    metadata: connectorRuntimeMetadata({ connector_id: "wowboost-commerce-reference-backfill" }),
  };

  const selected = selectConnectorRuntimeJobForStart({
    jobs: [runtimeJob],
    workspace_id: "default",
    connector_id: "wowboost-commerce-reference-backfill",
    job_type: "commerce_reference_backfill",
    requested_from: "2026-04-01",
    requested_to: "2026-07-13",
  });

  assert.equal(selected?.id, "runtime-job");
});

test("force_new_job always bypasses runtime job reuse", () => {
  const runtimeJob = {
    id: "runtime-job",
    status: "queued",
    workspace_id: "default",
    connector_id: "wowboost-commerce-reference-backfill",
    job_type: "commerce_reference_backfill",
    requested_from: "2026-04-01",
    requested_to: "2026-07-13",
    metadata: connectorRuntimeMetadata({ connector_id: "wowboost-commerce-reference-backfill" }),
  };

  const selected = selectConnectorRuntimeJobForStart({
    jobs: [runtimeJob],
    workspace_id: "default",
    connector_id: "wowboost-commerce-reference-backfill",
    job_type: "commerce_reference_backfill",
    requested_from: "2026-04-01",
    requested_to: "2026-07-13",
    force_new_job: true,
  });

  assert.equal(selected, null);
});

test("explicit runtime job_id resumes only marked runtime jobs", () => {
  const runtimeJob = {
    id: "runtime-job",
    status: "failed",
    workspace_id: "default",
    connector_id: "wowboost-commerce-reference-backfill",
    job_type: "commerce_reference_backfill",
    requested_from: "2026-04-01",
    requested_to: "2026-07-13",
    metadata: connectorRuntimeMetadata({ connector_id: "wowboost-commerce-reference-backfill" }),
  };
  const legacyJob = {
    id: "legacy-job",
    status: "running",
    progress: {
      connector_id: "wowboost-commerce-reference-backfill",
      metadata: {},
    },
  };

  assert.equal(selectConnectorRuntimeJobForStart({
    jobs: [legacyJob, runtimeJob],
    workspace_id: "default",
    connector_id: "wowboost-commerce-reference-backfill",
    job_type: "commerce_reference_backfill",
    requested_from: "2026-04-01",
    requested_to: "2026-07-13",
    explicit_job_id: "runtime-job",
  })?.id, "runtime-job");

  assert.equal(selectConnectorRuntimeJobForStart({
    jobs: [legacyJob, runtimeJob],
    workspace_id: "default",
    connector_id: "wowboost-commerce-reference-backfill",
    job_type: "commerce_reference_backfill",
    requested_from: "2026-04-01",
    requested_to: "2026-07-13",
    explicit_job_id: "legacy-job",
  }), null);
});

test("terminal runtime jobs are not reused implicitly", () => {
  const jobs = ["completed", "completed_with_errors", "failed", "cancelled"].map((status) => ({
    id: status,
    status,
    workspace_id: "default",
    connector_id: "wowboost-commerce-reference-backfill",
    job_type: "commerce_reference_backfill",
    requested_from: "2026-04-01",
    requested_to: "2026-07-13",
    metadata: connectorRuntimeMetadata({ connector_id: "wowboost-commerce-reference-backfill" }),
  }));

  const selected = selectConnectorRuntimeJobForStart({
    jobs,
    workspace_id: "default",
    connector_id: "wowboost-commerce-reference-backfill",
    job_type: "commerce_reference_backfill",
    requested_from: "2026-04-01",
    requested_to: "2026-07-13",
  });

  assert.equal(selected, null);
});

test("replacement runtime job starts at export staging page one with null cursor", () => {
  const progress = createConnectorRuntimeProgress({
    workspace_id: "default",
    connector_id: "wowboost-commerce-reference-backfill",
    job_type: "commerce_reference_backfill",
    phase: "stage_export_pages",
    requested_from: "2026-04-01",
    requested_to: "2026-07-13",
    metadata: connectorRuntimeMetadata({ connector_id: "wowboost-commerce-reference-backfill" }),
    now: "2026-07-15T12:00:00.000Z",
  });
  progress.current_page = 1;

  assert.equal(progress.status, "queued");
  assert.equal(progress.phase, "stage_export_pages");
  assert.equal(progress.current_page, 1);
  assert.equal(progress.current_cursor, null);
  assert.equal(isConnectorRuntimeV1Job({ progress }, "wowboost-commerce-reference-backfill"), true);
});

test("task dedupe key is deterministic and payload order independent", () => {
  const first = connectorRuntimeTaskDedupeKey({
    task_type: "stage_export_page",
    phase: "stage_export_pages",
    page: 40,
    payload: { to: "2026-07-13", from: "2026-04-01" },
  });
  const second = connectorRuntimeTaskDedupeKey({
    task_type: "stage_export_page",
    phase: "stage_export_pages",
    page: 40,
    payload: { from: "2026-04-01", to: "2026-07-13" },
  });

  assert.equal(first, second);
  assert.match(first, /^stage_export_page:stage_export_pages:/);
});

test("queue messages contain identifiers only", () => {
  assert.deepEqual(connectorRuntimeTaskMessage({
    id: "task-1",
    job_id: "job-1",
    connector_id: "wowboost-commerce-reference-backfill",
    task_type: "stage_export_page",
    phase: "stage_export_pages",
  }), {
    runtime_task_id: "task-1",
    job_id: "job-1",
    connector_id: "wowboost-commerce-reference-backfill",
    task_type: "stage_export_page",
    phase: "stage_export_pages",
  });
});

test("task diagnostics append bounded heartbeat breadcrumbs", () => {
  let summary: Record<string, any> = {};
  for (let index = 0; index < CONNECTOR_RUNTIME_TASK_DIAGNOSTIC_EVENT_LIMIT + 5; index += 1) {
    summary = appendConnectorRuntimeTaskDiagnostic(summary, `event-${index}`, { index }, `2026-07-17T00:00:${String(index).padStart(2, "0")}.000Z`);
  }

  assert.equal(summary.heartbeat_event, `event-${CONNECTOR_RUNTIME_TASK_DIAGNOSTIC_EVENT_LIMIT + 4}`);
  assert.equal(summary.heartbeat_count, CONNECTOR_RUNTIME_TASK_DIAGNOSTIC_EVENT_LIMIT + 5);
  assert.equal(summary.diagnostic_events.length, CONNECTOR_RUNTIME_TASK_DIAGNOSTIC_EVENT_LIMIT);
  assert.equal(summary.diagnostic_events[0].event, "event-5");
});

test("task diagnostic samples do not count as durable heartbeats", () => {
  let summary: Record<string, any> = appendConnectorRuntimeTaskDiagnostic({}, "identity_resolve.entry", {}, "2026-07-17T00:00:00.000Z");
  for (let recordIndex = 0; recordIndex < 10; recordIndex += 1) {
    for (let operationIndex = 0; operationIndex < 12; operationIndex += 1) {
      summary = appendConnectorRuntimeTaskDiagnosticSample(
        summary,
        `identity_repository.operation_${operationIndex}.after_await`,
        { processed: recordIndex + 1, operation_index: operationIndex },
        `2026-07-17T00:00:${String(recordIndex).padStart(2, "0")}.000Z`,
      );
    }
  }

  assert.equal(summary.heartbeat_count, 1);
  assert.equal(summary.diagnostic_event_count, 120);
  assert.equal(summary.diagnostic_events.length, CONNECTOR_RUNTIME_TASK_DIAGNOSTIC_EVENT_LIMIT);
});

test("durable heartbeat throttle writes only on interval or force", () => {
  const last = Date.parse("2026-07-17T00:00:00.000Z");
  assert.equal(shouldWriteConnectorRuntimeDurableHeartbeat({
    last_heartbeat_ms: last,
    now_ms: last + 9999,
    min_interval_ms: 10000,
  }), false);
  assert.equal(shouldWriteConnectorRuntimeDurableHeartbeat({
    last_heartbeat_ms: last,
    now_ms: last + 10000,
    min_interval_ms: 10000,
  }), true);
  assert.equal(shouldWriteConnectorRuntimeDurableHeartbeat({
    force: true,
    last_heartbeat_ms: last,
    now_ms: last + 1,
    min_interval_ms: 10000,
  }), true);
});

test("task stale detection uses the newest heartbeat lock or update timestamp", () => {
  const now = Date.parse("2026-07-17T00:05:00.000Z");
  const staleTask = {
    status: "running",
    locked_at: "2026-07-17T00:00:00.000Z",
    updated_at: "2026-07-17T00:00:10.000Z",
    result_summary: { heartbeat_at: "2026-07-17T00:00:30.000Z" },
  };
  const freshTask = {
    status: "running",
    locked_at: "2026-07-17T00:00:00.000Z",
    updated_at: "2026-07-17T00:00:10.000Z",
    result_summary: { heartbeat_at: "2026-07-17T00:04:30.000Z" },
  };

  assert.equal(connectorRuntimeTaskHeartbeatTimestampMs(staleTask), Date.parse("2026-07-17T00:00:30.000Z"));
  assert.equal(isConnectorRuntimeTaskStale(staleTask, { now_ms: now, stale_ms: 120000 }), true);
  assert.equal(isConnectorRuntimeTaskStale(freshTask, { now_ms: now, stale_ms: 120000 }), false);
  assert.equal(isConnectorRuntimeTaskStale({ ...staleTask, status: "queued" }, { now_ms: now, stale_ms: 120000 }), false);
});

test("failure classifier separates transient permanent and blocking errors", () => {
  assert.equal(classifyConnectorRuntimeFailure({ status: 429 }), "transient");
  assert.equal(classifyConnectorRuntimeFailure({ status: 503 }), "transient");
  assert.equal(classifyConnectorRuntimeFailure({ message: "fetch failed: network timeout" }), "transient");
  assert.equal(classifyConnectorRuntimeFailure({ message: "Request timed out after 30000ms" }), "transient");
  assert.equal(classifyConnectorRuntimeFailure({ message: "UND_ERR_HEADERS_TIMEOUT" }), "transient");
  assert.equal(classifyConnectorRuntimeFailure({ message: "Postgres 57014 canceling statement due to statement timeout" }), "transient");
  assert.equal(classifyConnectorRuntimeFailure({ status: 404 }), "permanent");
  assert.equal(classifyConnectorRuntimeFailure({ message: "malformed identifier" }), "permanent");
  assert.equal(classifyConnectorRuntimeFailure({ status: 401 }), "blocking");
  assert.equal(classifyConnectorRuntimeFailure({ status: 403 }), "blocking");
});

test("runtime error summaries preserve message and stack for storage", () => {
  const error = new Error("WowBoost runtime finalize count failed: code=57014");
  error.stack = "Error: WowBoost runtime finalize count failed: code=57014\n    at finalize";
  const summary = connectorRuntimeErrorSummary(error);

  assert.equal(summary.message, "WowBoost runtime finalize count failed: code=57014");
  assert.match(summary.last_error, /at finalize/);
  assert.match(summary.response_excerpt || "", /at finalize/);
});

test("finalize summary failure marks progress completed_with_errors", () => {
  const progress = createConnectorRuntimeProgress({
    connector_id: "wowboost-commerce-reference-backfill",
    job_type: "commerce_reference_backfill",
    phase: "validate_and_finalize",
    requested_from: "2026-04-01",
    requested_to: "2026-07-13",
    now: "2026-07-15T00:00:00.000Z",
  });
  progress.status = "running";
  progress.records_processed = 100;
  const next = connectorRuntimeFinalizeFailureProgress(progress, {
    now: "2026-07-15T00:00:05.000Z",
    message: "WowBoost runtime finalize count failed: code=57014",
    stack: "Error: WowBoost runtime finalize count failed\n    at finalize",
    last_error: "WowBoost runtime finalize count failed: code=57014\n    at finalize",
  });

  assert.equal(next.status, "completed_with_errors");
  assert.equal(next.phase, "validate_and_finalize");
  assert.equal(next.current_cursor, null);
  assert.equal(next.current_page, null);
  assert.equal(next.completed_at, "2026-07-15T00:00:05.000Z");
  assert.equal(next.records_processed, 100);
  assert.equal(next.metadata.finalize_summary_failed, true);
  assert.match(next.last_error || "", /at finalize/);
});

test("successful finalize path completes from deterministic count results", () => {
  const progress = createConnectorRuntimeProgress({
    connector_id: "wowboost-commerce-reference-backfill",
    job_type: "commerce_reference_backfill",
    phase: "validate_and_finalize",
    requested_from: "2026-04-01",
    requested_to: "2026-07-13",
    now: "2026-07-15T00:00:00.000Z",
  });
  progress.status = "running";
  progress.records_processed = 100;

  const clean = connectorRuntimeFinalizeSuccessProgress(progress, {
    now: "2026-07-15T00:00:05.000Z",
    remaining_blank_references: 0,
    unresolved_error_count: 0,
  });
  assert.equal(clean.status, "completed");
  assert.equal(clean.phase, "validate_and_finalize");
  assert.equal(clean.current_cursor, null);
  assert.equal(clean.current_page, null);
  assert.equal(clean.completed_at, "2026-07-15T00:00:05.000Z");
  assert.equal(clean.last_error, null);
  assert.equal(clean.metadata.finalize_summary_failed, false);
  assert.equal(clean.metadata.remaining_blank_references, 0);
  assert.equal(clean.metadata.unresolved_error_count, 0);

  const unresolved = connectorRuntimeFinalizeSuccessProgress(progress, {
    now: "2026-07-15T00:00:06.000Z",
    remaining_blank_references: 3,
    unresolved_error_count: 1,
  });
  assert.equal(unresolved.status, "completed_with_errors");
  assert.equal(unresolved.metadata.remaining_blank_references, 3);
  assert.equal(unresolved.metadata.unresolved_error_count, 1);
  assert.match(unresolved.last_error || "", /unresolved records or errors/);
});

test("rerun finalize resets only finalize state and is idempotent", () => {
  const progress = createConnectorRuntimeProgress({
    connector_id: "wowboost-commerce-reference-backfill",
    job_type: "commerce_reference_backfill",
    phase: "validate_and_finalize",
    requested_from: "2026-04-01",
    requested_to: "2026-07-13",
    now: "2026-07-15T00:00:00.000Z",
  });
  progress.status = "completed_with_errors";
  progress.current_cursor = "wowsuite:wowboost:121438";
  progress.current_page = 115;
  progress.completed_at = "2026-07-15T00:00:10.000Z";
  progress.last_error = "finalize failed";

  const first = connectorRuntimeRerunFinalizeProgress(progress, { now: "2026-07-15T00:01:00.000Z" });
  const second = connectorRuntimeRerunFinalizeProgress(first, { now: "2026-07-15T00:01:00.000Z" });

  assert.equal(first.status, "queued");
  assert.equal(first.phase, "validate_and_finalize");
  assert.equal(first.current_cursor, null);
  assert.equal(first.current_page, null);
  assert.equal(first.completed_at, null);
  assert.equal(first.last_error, null);
  assert.equal(second.status, "queued");
  assert.equal(second.phase, "validate_and_finalize");
  assert.equal(second.current_cursor, null);
  assert.equal(second.current_page, null);
  assert.equal(second.completed_at, null);
});

test("retry delay uses exponential backoff with a cap", () => {
  assert.equal(connectorRuntimeRetryDelayMs({ attempt: 1, base_ms: 500, jitter_ms: 0 }), 500);
  assert.equal(connectorRuntimeRetryDelayMs({ attempt: 3, base_ms: 500, jitter_ms: 0 }), 2000);
  assert.equal(connectorRuntimeRetryDelayMs({ attempt: 10, base_ms: 500, cap_ms: 5000, jitter_ms: 0 }), 5000);
  assert.equal(connectorRuntimeNextRunAt({
    attempt: 2,
    now_ms: Date.parse("2026-07-15T00:00:00.000Z"),
    delay_ms: 1000,
  }), "2026-07-15T00:00:01.000Z");
});

test("counter merges keep large histories out of job JSON", () => {
  const progress = createConnectorRuntimeProgress({
    connector_id: "wowboost-commerce-reference-backfill",
    job_type: "commerce_reference_backfill",
    phase: "stage_export_pages",
    requested_from: "2026-04-01",
    requested_to: "2026-07-13",
    now: "2026-07-15T00:00:00.000Z",
  });
  const next = mergeConnectorRuntimeCounters(progress, {
    records_discovered: 500,
    records_processed: 500,
    records_succeeded: 246,
  }, {
    status: "running",
    phase: "stage_export_pages",
    page: 2,
    metadata: {
      export_pages_processed: 1,
      warning_count: 30,
      recent_warnings: ["compact"],
    },
    now: "2026-07-15T00:00:01.000Z",
  });

  assert.equal(next.status, "running");
  assert.equal(next.records_discovered, 500);
  assert.equal(next.records_succeeded, 246);
  assert.equal(next.current_page, 2);
  assert.deepEqual(next.metadata.recent_warnings, ["compact"]);
});

test("public runtime payload is compact by default", () => {
  const payload = compactConnectorRuntimeJobPayload({
    id: "job-1",
    platform: "wowboost",
    connector_id: "wowboost-commerce-reference-backfill",
    job_type: "commerce_reference_backfill",
    phase: "fetch_order_details",
    status: "retrying",
    requested_from: "2026-04-01",
    requested_to: "2026-07-13",
    records_processed: 10,
    records_succeeded: 8,
    records_failed: 2,
    progress: {
      metadata: {
        export_pages_scanned: 115,
        export_rows_seen: 57000,
        target_order_numbers_total: 4532,
        target_order_numbers_mapped: 4522,
        target_order_numbers_remaining: 10,
        target_mapping_coverage_percent: 99.78,
        staging_stop_reason: null,
        last_export_page: 115,
      },
      huge_warning_array: Array.from({ length: 100 }, (_, index) => `warning-${index}`),
    },
  }, {
    queued_tasks: 3,
    failed_tasks: 2,
    recent_errors: Array.from({ length: 20 }, (_, index) => ({ message: `error-${index}` })),
  });

  assert.equal(payload.status, "retrying");
  assert.equal(payload.queued_tasks, 3);
  assert.deepEqual(payload.metrics, {
    export_pages_scanned: 115,
    export_rows_seen: 57000,
    target_order_numbers_total: 4532,
    target_order_numbers_mapped: 4522,
    target_order_numbers_remaining: 10,
    target_mapping_coverage_percent: 99.78,
    staging_stop_reason: null,
    last_export_page: 115,
    discovered: 0,
    eligible: 0,
    batches_created: 0,
    people_created: 0,
    people_matched: 0,
    attached: 0,
    would_create_person: 0,
    would_match_existing: 0,
    would_require_review: 0,
    would_skip_no_identifiers: 0,
    already_linked: 0,
    skipped_no_identifiers: 0,
    review_required: 0,
    attachment_conflicts: 0,
    permanent_errors: 0,
    transient_retries: 0,
    remaining_unlinked: 0,
    incomplete_discovery: false,
    discovery_completed_platforms: [],
    discovery_pending_platforms: [],
    discovery_failed_platforms: [],
  });
  assert.equal(payload.recent_errors.length, 10);
  assert.equal((payload as any).huge_warning_array, undefined);
});

test("failed runtime task diagnostics are surfaced without exposing full progress", () => {
  const payload = compactConnectorRuntimeJobPayload({
    id: "job-1",
    platform: "wowboost",
    connector_id: "wowboost-commerce-reference-backfill",
    job_type: "commerce_reference_backfill",
    phase: "stage_export_pages",
    status: "failed",
    last_error: "WowBoost stage mapping upsert failed",
    progress: {
      huge_warning_array: Array.from({ length: 100 }, (_, index) => `warning-${index}`),
    },
  }, {
    failed_tasks: 1,
    recent_errors: [{
      task_id: "task-1",
      error_class: "task_execution_failed",
      message: "WowBoost stage mapping upsert failed",
      classification: "blocking",
    }],
  });

  assert.equal(payload.status, "failed");
  assert.equal(payload.failed_tasks, 1);
  assert.equal(payload.last_error, "WowBoost stage mapping upsert failed");
  assert.deepEqual(payload.recent_errors, [{
    task_id: "task-1",
    error_class: "task_execution_failed",
    message: "WowBoost stage mapping upsert failed",
    classification: "blocking",
  }]);
  assert.equal((payload as any).huge_warning_array, undefined);
});
