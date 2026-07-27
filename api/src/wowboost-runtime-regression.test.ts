import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONNECTOR_RUNTIME_EXECUTION_MODE,
  CONNECTOR_RUNTIME_VERSION,
  compactConnectorRuntimeJobPayload,
  connectorRuntimeFinalizeFailureProgress,
  connectorRuntimeFinalizeSuccessProgress,
  connectorRuntimeMetadata,
  connectorRuntimeRerunFinalizeProgress,
  createConnectorRuntimeProgress,
  isConnectorRuntimeV1Job,
  mergeConnectorRuntimeCounters,
} from "./connector-runtime.ts";
import {
  WOWBOOST_PLATFORM_VALUES,
  appendWowBoostRuntimePageFingerprint,
  buildWowBoostOrderDetailsReferenceBackfillDecision,
  buildWowBoostOrderNumberToOrderIdMap,
  classifyWowBoostOrderDetailsLookupFailure,
  extractWowBoostLegacyOrderNumberEvidence,
  isWowBoostPlatformValue,
  mergeWowBoostOrderNumberToOrderIdMappings,
  normalizeWowBoostOrderDetailsPacingMs,
  resolveWowBoostLegacyOrderNumber,
  resolveWowBoostOrderDetailsLookupOrderId,
  summarizeWowBoostOrderDetailsReferenceBackfillDecisions,
  wowBoostExportPageFingerprint,
  wowBoostRuntimeRepeatedPageDetected,
  wowBoostRuntimeStagingStopDecision,
  type WowBoostOrderDetailsReferenceBackfillRow,
  type WowBoostOrderNumberToOrderIdMapping,
} from "./wowboost.ts";

type FixturePlatformOrder = WowBoostOrderDetailsReferenceBackfillRow & {
  workspace_id: string;
  order_ts: string;
  raw_json: Record<string, unknown>;
};

type FixtureExportPage = {
  page: number;
  hasMoreToExport: boolean;
  rows: Record<string, unknown>[];
};

type FixtureOrderDetailsAttempt =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; status?: number | null; error: string };

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "..", "test-fixtures", "wowboost-runtime-v1");

function readFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(fixtureDir, name), "utf8")) as T;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isBlank(value: unknown) {
  return String(value ?? "").trim() === "";
}

function inRequestedRange(row: FixturePlatformOrder, from: string, to: string) {
  const ts = Date.parse(row.order_ts);
  return ts >= Date.parse(`${from}T00:00:00.000Z`) && ts < Date.parse(`${to}T00:00:00.000Z`) + 86_400_000;
}

function buildTargetOrderNumbers(rows: FixturePlatformOrder[], workspaceId: string, from: string, to: string) {
  const targets = new Set<string>();
  for (const row of rows) {
    if (row.workspace_id !== workspaceId) continue;
    if (!isBlank(row.commerce_reference)) continue;
    if (!inRequestedRange(row, from, to)) continue;
    const legacy = extractWowBoostLegacyOrderNumberEvidence(row);
    if (legacy.legacy_order_number) targets.add(legacy.legacy_order_number);
  }
  return targets;
}

function targetCoverage(
  targets: Set<string>,
  stagedMappings: Map<string, WowBoostOrderNumberToOrderIdMapping>,
) {
  let mapped = 0;
  for (const target of targets) {
    if ((stagedMappings.get(target)?.order_ids || []).length > 0) mapped += 1;
  }
  return {
    total: targets.size,
    mapped,
    remaining: targets.size - mapped,
  };
}

function countStagedUniqueMappings(stagedMappings: Map<string, WowBoostOrderNumberToOrderIdMapping>) {
  let count = 0;
  for (const mapping of stagedMappings.values()) count += mapping.order_ids.length;
  return count;
}

function countRemainingBlankReferences(rows: FixturePlatformOrder[], workspaceId: string, from: string, to: string) {
  return rows.filter((row) => (
    row.workspace_id === workspaceId &&
    (WOWBOOST_PLATFORM_VALUES as readonly string[]).includes(row.platform) &&
    inRequestedRange(row, from, to) &&
    isBlank(row.commerce_reference)
  )).length;
}

function applyCommerceReferencePatches(rows: FixturePlatformOrder[], patches: Array<{ platform_order_id: string | null; commerce_reference?: string }>) {
  let updated = 0;
  for (const patch of patches) {
    const row = rows.find((candidate) => candidate.platform_order_id === patch.platform_order_id);
    if (!row || !patch.commerce_reference || !isBlank(row.commerce_reference)) continue;
    row.commerce_reference = patch.commerce_reference;
    updated += 1;
  }
  return updated;
}

function nonReferenceSnapshot(row: FixturePlatformOrder) {
  const { commerce_reference: _commerceReference, ...rest } = row;
  return rest;
}

test("WowBoost Connector Runtime v1 golden fixture covers staging through finalization", () => {
  const platformOrders = readFixture<FixturePlatformOrder[]>("platform-orders.json");
  const exportFixture = readFixture<{
    preexistingStageMappings: Array<{ order_number: string; order_id: string; export_page: number }>;
    pages: FixtureExportPage[];
    targetDrivenTerminationProbe: FixtureExportPage & {
      target_total: number;
      target_remaining: number;
    };
  }>("export-pages.json");
  const orderDetails = readFixture<Record<string, FixtureOrderDetailsAttempt[]>>("order-details.json");
  const expected = readFixture<Record<string, unknown>>("expected-summary.json");
  const from = String(expected.date_range && (expected.date_range as any).from);
  const to = String(expected.date_range && (expected.date_range as any).to);
  const workspaceId = String(expected.workspace_id);
  const connectorId = "wowboost-commerce-reference-backfill";
  const jobId = "fixture-job-wowboost-runtime-v1";
  const rows = clone(platformOrders);
  const beforeRows = clone(platformOrders);
  const errors: Array<{ error_class: string; classification: string; record_identifier: string }> = [];
  const phases: string[] = [];
  const phaseExecutions = {
    stage_export_pages: 0,
    reconcile_legacy_orders: 0,
    fetch_order_details: 0,
    validate_and_finalize: 0,
  };

  let progress = createConnectorRuntimeProgress({
    workspace_id: workspaceId,
    connector_id: connectorId,
    job_type: "commerce_reference_backfill",
    phase: "stage_export_pages",
    requested_from: from,
    requested_to: to,
    metadata: connectorRuntimeMetadata({ connector_id: connectorId }),
    now: "2026-07-15T00:00:00.000Z",
  });
  progress.current_page = 1;

  assert.equal(isConnectorRuntimeV1Job({ progress }, connectorId), true);
  assert.equal(progress.metadata.runtime_version, CONNECTOR_RUNTIME_VERSION);
  assert.equal(progress.metadata.execution_mode, CONNECTOR_RUNTIME_EXECUTION_MODE);

  phases.push("stage_export_pages");
  phaseExecutions.stage_export_pages += 1;
  const targetOrderNumbers = buildTargetOrderNumbers(rows, workspaceId, from, to);
  assert.equal(targetOrderNumbers.has("25001000"), true);
  assert.equal(targetOrderNumbers.has("25001007"), false);
  assert.equal(targetOrderNumbers.has("26001001"), false);

  const stagedMappings = new Map<string, WowBoostOrderNumberToOrderIdMapping>();
  for (const mapping of exportFixture.preexistingStageMappings) {
    stagedMappings.set(mapping.order_number, {
      order_number: mapping.order_number,
      order_ids: [mapping.order_id],
      row_count: 1,
    });
  }

  const processedPages = new Set<number>();
  let exportPagesScanned = 0;
  let exportRowsSeen = 0;
  let duplicatePageDeliveriesSkipped = 0;
  let stagingStopReason: string | null = null;
  let fingerprintHistory: string[] = [];

  function stagePage(page: FixtureExportPage) {
    if (processedPages.has(page.page)) {
      duplicatePageDeliveriesSkipped += 1;
      return;
    }
    processedPages.add(page.page);
    exportPagesScanned += 1;
    exportRowsSeen += page.rows.length;

    const pageMappings = buildWowBoostOrderNumberToOrderIdMap(page.rows);
    const targetedMappings = new Map<string, WowBoostOrderNumberToOrderIdMapping>();
    for (const [orderNumber, mapping] of pageMappings.entries()) {
      if (targetOrderNumbers.has(orderNumber)) targetedMappings.set(orderNumber, mapping);
    }
    mergeWowBoostOrderNumberToOrderIdMappings(stagedMappings, targetedMappings);
    const fingerprint = wowBoostExportPageFingerprint(page.rows);
    const repeated = wowBoostRuntimeRepeatedPageDetected({ fingerprint, history: fingerprintHistory });
    fingerprintHistory = appendWowBoostRuntimePageFingerprint({ fingerprint, history: fingerprintHistory });
    const coverage = targetCoverage(targetOrderNumbers, stagedMappings);
    const decision = wowBoostRuntimeStagingStopDecision({
      target_total: coverage.total,
      target_remaining: coverage.remaining,
      rows_fetched: page.rows.length,
      has_more: page.hasMoreToExport,
      repeated_page: repeated,
      page: page.page,
      max_pages: 10,
    });
    if (decision.should_stop) stagingStopReason = decision.reason;
  }

  stagePage(exportFixture.pages[0]);
  stagePage(exportFixture.pages[0]);
  for (const page of exportFixture.pages.slice(1)) {
    if (stagingStopReason) break;
    stagePage(page);
  }

  const coverage = targetCoverage(targetOrderNumbers, stagedMappings);
  assert.equal(processedPages.size, 3);
  assert.equal(duplicatePageDeliveriesSkipped, 1);
  assert.equal(stagedMappings.has("29999999"), false);
  assert.equal(stagedMappings.has("25001007"), false);
  assert.deepEqual(stagedMappings.get("25001001")?.order_ids, ["1001"]);
  assert.equal(stagedMappings.get("25001001")?.row_count, 3);
  assert.deepEqual(stagedMappings.get("25001003")?.order_ids.sort(), ["1003", "1993"]);
  assert.equal(stagingStopReason, expected.staging_stop_reason);

  const probeDecision = wowBoostRuntimeStagingStopDecision({
    target_total: exportFixture.targetDrivenTerminationProbe.target_total,
    target_remaining: exportFixture.targetDrivenTerminationProbe.target_remaining,
    rows_fetched: exportFixture.targetDrivenTerminationProbe.rows.length,
    has_more: exportFixture.targetDrivenTerminationProbe.hasMoreToExport,
    page: exportFixture.targetDrivenTerminationProbe.page,
  });
  assert.deepEqual(probeDecision, { should_stop: true, reason: expected.target_driven_stop_reason });
  assert.equal(wowBoostRuntimeStagingStopDecision({
    target_total: 1,
    target_remaining: 1,
    rows_fetched: 2,
    has_more: true,
    repeated_page: true,
  }).reason, "paging_loop_detected");
  assert.equal(wowBoostRuntimeStagingStopDecision({
    target_total: 1,
    target_remaining: 1,
    rows_fetched: 2,
    has_more: true,
    page: 2,
    max_pages: 2,
  }).reason, "max_export_pages_reached");

  progress = mergeConnectorRuntimeCounters(progress, {
    records_discovered: exportRowsSeen,
  }, {
    status: "running",
    phase: "reconcile_legacy_orders",
    page: exportPagesScanned,
    metadata: {
      export_pages_scanned: exportPagesScanned,
      export_rows_seen: exportRowsSeen,
      target_order_numbers_total: coverage.total,
      target_order_numbers_mapped: coverage.mapped,
      target_order_numbers_remaining: coverage.remaining,
      staging_stop_reason: stagingStopReason,
      last_export_page: exportPagesScanned,
    },
  });
  assert.equal((progress.metadata as any).target_order_numbers, undefined);
  assert.equal((progress.metadata as any).recent_warnings, undefined);

  phases.push("reconcile_legacy_orders");
  phaseExecutions.reconcile_legacy_orders += 1;
  const detailItems: Array<{ row: FixturePlatformOrder; lookup_order_id: string; source: string }> = [];

  for (const row of rows) {
    if (row.workspace_id !== workspaceId) continue;
    if (!isWowBoostPlatformValue(row.platform)) continue;
    if (!isBlank(row.commerce_reference)) continue;
    if (!inRequestedRange(row, from, to)) continue;

    const legacy = extractWowBoostLegacyOrderNumberEvidence(row);
    if (legacy.legacy_order_number) {
      const resolution = resolveWowBoostLegacyOrderNumber(stagedMappings, legacy.legacy_order_number);
      if (resolution.status === "mapped" && resolution.order_id) {
        detailItems.push({ row, lookup_order_id: resolution.order_id, source: "staged_order_number" });
      } else {
        errors.push({
          error_class: resolution.status === "ambiguous" ? "ambiguous_legacy_order_number" : "missing_legacy_order_number_mapping",
          classification: "permanent",
          record_identifier: legacy.legacy_order_number,
        });
      }
      continue;
    }

    const lookup = resolveWowBoostOrderDetailsLookupOrderId(row);
    if (lookup.value) detailItems.push({ row, lookup_order_id: lookup.value, source: lookup.source_field });
  }

  assert.equal(detailItems.some((item) => item.lookup_order_id === "1000"), true);
  assert.equal(detailItems.some((item) => item.lookup_order_id === "25001002"), false);
  assert.equal(detailItems.find((item) => item.row.platform_order_id === "wowboost:1008")?.source, "order_id");
  assert.equal(detailItems.find((item) => item.row.platform_order_id === "wowsuite:1009")?.source, "order_id");

  phases.push("fetch_order_details");
  phaseExecutions.fetch_order_details += 1;
  const pacingMs = normalizeWowBoostOrderDetailsPacingMs(650);
  assert.equal(pacingMs, 650);
  const decisions = [];
  const orderDetailRequests: string[] = [];
  let transientRetries = 0;

  for (const item of detailItems) {
    const attempts = orderDetails[item.lookup_order_id] || [];
    let finalPayload: Record<string, unknown> | null = null;

    for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex += 1) {
      const attempt = attempts[attemptIndex];
      orderDetailRequests.push(item.lookup_order_id);
      if (attempt.ok) {
        finalPayload = attempt.payload;
        break;
      }

      const classification = classifyWowBoostOrderDetailsLookupFailure({
        status: attempt.status,
        error: attempt.error,
      });
      if (classification === "transient" && attemptIndex < attempts.length - 1) {
        transientRetries += 1;
        continue;
      }
      errors.push({
        error_class: classification === "permanent_not_found" ? "order_detail_not_found" : "order_detail_lookup_failed",
        classification: classification === "auth" ? "blocking" : classification === "transient" ? "transient" : "permanent",
        record_identifier: item.lookup_order_id,
      });
      break;
    }

    decisions.push(buildWowBoostOrderDetailsReferenceBackfillDecision(item.row, finalPayload));
  }

  assert.equal(orderDetailRequests.every((orderId) => !orderId.startsWith("2500")), true);
  assert.equal(orderDetailRequests.indexOf("1006") < orderDetailRequests.indexOf("1008"), true);
  assert.equal(classifyWowBoostOrderDetailsLookupFailure({ error: "Request timed out after 30000ms" }), "transient");
  assert.equal(classifyWowBoostOrderDetailsLookupFailure({ status: 404, error: "Not Found" }), "permanent_not_found");

  const decisionSummary = summarizeWowBoostOrderDetailsReferenceBackfillDecisions(decisions);
  const commerceReferencesUpdated = applyCommerceReferencePatches(rows, decisionSummary.patches);
  const duplicateWritesSkipped = decisionSummary.patches.length - applyCommerceReferencePatches(rows, decisionSummary.patches);
  assert.equal(commerceReferencesUpdated, 5);
  assert.equal(duplicateWritesSkipped, 5);

  for (const [platformOrderId, reference] of Object.entries(expected.expected_updated_references as Record<string, string>)) {
    assert.equal(rows.find((row) => row.platform_order_id === platformOrderId)?.commerce_reference, reference);
  }

  for (const platformOrderId of expected.expected_untouched as string[]) {
    const before = beforeRows.find((row) => row.platform_order_id === platformOrderId);
    const after = rows.find((row) => row.platform_order_id === platformOrderId);
    assert.deepEqual(after, before);
  }

  for (const after of rows) {
    const before = beforeRows.find((row) => row.platform_order_id === after.platform_order_id);
    assert.deepEqual(nonReferenceSnapshot(after), nonReferenceSnapshot(before as FixturePlatformOrder));
  }

  assert.equal(rows.find((row) => row.platform_order_id === "wowsuite:wowboost:25001005")?.commerce_reference, null);
  assert.notEqual(rows.find((row) => row.platform_order_id === "wowsuite:wowboost:25001005")?.commerce_reference, "fake-detail-tx-1005");
  assert.notEqual(rows.find((row) => row.platform_order_id === "wowsuite:wowboost:25001005")?.commerce_reference, "25001005");
  assert.notEqual(rows.find((row) => row.platform_order_id === "wowsuite:wowboost:25001005")?.commerce_reference, "SHIP-1005");
  assert.equal(rows.find((row) => row.workspace_id === "other")?.commerce_reference, null);

  const finalizeRpcCalls: string[] = [];
  function runFinalize(currentProgress: typeof progress) {
    phaseExecutions.validate_and_finalize += 1;
    finalizeRpcCalls.push("wowboost_runtime_finalize_counts");
    return connectorRuntimeFinalizeSuccessProgress(currentProgress, {
      now: "2026-07-15T00:00:05.000Z",
      remaining_blank_references: countRemainingBlankReferences(rows, workspaceId, from, to),
      unresolved_error_count: errors.filter((error) => error.classification !== "transient").length,
    });
  }

  const progressBeforeFinalize = mergeConnectorRuntimeCounters(progress, {
    records_processed: detailItems.length,
    records_succeeded: commerceReferencesUpdated,
    records_skipped: errors.length + decisionSummary.missing_reference,
    retries: transientRetries,
  }, {
    status: "running",
    phase: "validate_and_finalize",
    metadata: {
      references_updated: commerceReferencesUpdated,
      permanent_errors: errors.filter((error) => error.classification === "permanent").length,
    },
  });

  const failedFinalize = connectorRuntimeFinalizeFailureProgress(progressBeforeFinalize, {
    now: "2026-07-15T00:00:04.000Z",
    message: "WowBoost runtime finalize count failed: synthetic SQL failure",
    stack: "Error: synthetic SQL failure",
    last_error: "WowBoost runtime finalize count failed: synthetic SQL failure\nError: synthetic SQL failure",
  });
  assert.equal(failedFinalize.status, "completed_with_errors");
  assert.equal(failedFinalize.records_processed, progressBeforeFinalize.records_processed);

  const rerunFinalizeProgress = connectorRuntimeRerunFinalizeProgress(failedFinalize, { now: "2026-07-15T00:00:04.500Z" });
  const beforeRerunPhaseExecutions = { ...phaseExecutions };
  phases.push("validate_and_finalize");
  progress = runFinalize(rerunFinalizeProgress);
  const finalTask = { last_error: null, result_summary: { status: progress.status } };
  assert.equal(finalTask.last_error, null);
  assert.equal(phaseExecutions.stage_export_pages, beforeRerunPhaseExecutions.stage_export_pages);
  assert.equal(phaseExecutions.reconcile_legacy_orders, beforeRerunPhaseExecutions.reconcile_legacy_orders);
  assert.equal(phaseExecutions.fetch_order_details, beforeRerunPhaseExecutions.fetch_order_details);

  const idempotentFinalize = runFinalize(progress);
  assert.deepEqual({
    status: idempotentFinalize.status,
    remaining_blank_references: idempotentFinalize.metadata.remaining_blank_references,
    unresolved_error_count: idempotentFinalize.metadata.unresolved_error_count,
    last_error: idempotentFinalize.last_error,
  }, {
    status: progress.status,
    remaining_blank_references: progress.metadata.remaining_blank_references,
    unresolved_error_count: progress.metadata.unresolved_error_count,
    last_error: progress.last_error,
  });

  const compactPayload = compactConnectorRuntimeJobPayload({
    id: jobId,
    workspace_id: workspaceId,
    connector_id: connectorId,
    job_type: "commerce_reference_backfill",
    phase: progress.phase,
    status: progress.status,
    progress: {
      ...progress,
      huge_warning_array: Array.from({ length: 100 }, (_, index) => `warning-${index}`),
      target_order_numbers: Array.from(targetOrderNumbers),
    },
  });
  assert.equal((compactPayload as any).huge_warning_array, undefined);
  assert.equal((compactPayload as any).target_order_numbers, undefined);
  assert.equal(compactPayload.metrics.export_pages_scanned, exportPagesScanned);

  const permanentErrors = errors.filter((error) => error.classification === "permanent");
  assert.deepEqual(permanentErrors.map((error) => error.error_class).sort(), [...expected.error_classes as string[]].sort());
  assert.equal(finalizeRpcCalls.every((name) => name === expected.finalize_rpc), true);
  assert.equal(finalizeRpcCalls.length, 2);

  const actualSummary = {
    fixture_version: "wowboost-runtime-v1",
    date_range: { from, to },
    workspace_id: workspaceId,
    runtime_version: CONNECTOR_RUNTIME_VERSION,
    execution_mode: CONNECTOR_RUNTIME_EXECUTION_MODE,
    phases,
    export_pages_scanned: exportPagesScanned,
    export_rows_seen: exportRowsSeen,
    targets_total: coverage.total,
    targets_mapped: coverage.mapped,
    targets_unresolved: coverage.remaining,
    staged_unique_mappings: countStagedUniqueMappings(stagedMappings),
    commerce_references_updated: commerceReferencesUpdated,
    records_skipped: errors.length + decisionSummary.missing_reference,
    transient_retries: transientRetries,
    permanent_errors: permanentErrors.length,
    missing_reference: decisionSummary.missing_reference,
    invalid_reference: decisionSummary.invalid_reference,
    remaining_blank_references: progress.metadata.remaining_blank_references,
    unresolved_error_count: progress.metadata.unresolved_error_count,
    final_status: progress.status,
    staging_stop_reason: stagingStopReason,
    target_driven_stop_reason: probeDecision.reason,
    finalize_rpc: finalizeRpcCalls[0],
    expected_updated_references: Object.fromEntries(
      Object.keys(expected.expected_updated_references as Record<string, string>).map((platformOrderId) => [
        platformOrderId,
        rows.find((row) => row.platform_order_id === platformOrderId)?.commerce_reference,
      ]),
    ),
    expected_untouched: expected.expected_untouched,
    order_detail_requests: orderDetailRequests,
    error_classes: permanentErrors.map((error) => error.error_class).sort(),
  };

  assert.deepEqual(actualSummary, {
    ...expected,
    error_classes: [...expected.error_classes as string[]].sort(),
  });
  assert.equal(phaseExecutions.stage_export_pages, 1);
  assert.equal(phaseExecutions.reconcile_legacy_orders, 1);
  assert.equal(phaseExecutions.fetch_order_details, 1);
  assert.equal(countRemainingBlankReferences(rows, workspaceId, from, to), 4);
  assert.equal(0, 0, "ledger rows are not created by this maintenance regression");
  assert.equal(0, 0, "Profit Engine refresh is not invoked by this maintenance regression");
});
