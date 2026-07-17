import test from "node:test";
import assert from "node:assert/strict";
import {
  adaptConnectorResponse,
  buildPublicImportJobPayload,
  cancelImportProgress,
  compactWowBoostBackfillProgress,
  createInitialImportProgress,
  failImportProgress,
  IMPORT_PROGRESS_RECENT_PERMANENTLY_MISSING_ID_LIMIT,
  IMPORT_PROGRESS_RECENT_RATE_LIMIT_WARNING_LIMIT,
  IMPORT_PROGRESS_RECENT_WARNING_LIMIT,
  importProgressPercent,
  mergeImportProgress,
  mergeImportWarnings,
  resumeImportProgress,
  shouldBlockDuplicateImport,
} from "./import-progress.ts";

test("continues multi-page imports and accumulates metrics", () => {
  const started = createInitialImportProgress({
    workspace_id: "default",
    platform: "paypal",
    connector_id: "paypal:merchant",
    from: "2026-07-01",
    to: "2026-07-02",
    filter: "all_financial_records",
    now: "2026-07-12T10:00:00.000Z",
  });

  const first = mergeImportProgress(
    started,
    {
      ok: true,
      has_more: true,
      next_page: 2,
      next_window_index: 0,
      current_window: { from: "2026-07-01T00:00:00.000Z", to: "2026-07-02T00:00:00.000Z" },
      metrics: {
        fetched: 15,
        processed: 15,
        matched: 10,
        unmatched: 4,
        ambiguous: 1,
        rows_upserted: 17,
        payment_transactions_upserted: 15,
        platform_orders_upserted: 2,
        ledger_inserted: 12,
        ledger_skipped: 1,
        duplicate_sales_skipped: 1,
        duplicates_skipped: 2,
        warnings: ["rollup_deferred"],
      },
    },
    { now: "2026-07-12T10:01:00.000Z" },
  );

  assert.equal(first.status, "importing");
  assert.equal(first.current_page, 2);
  assert.equal(first.records_processed, 15);
  assert.equal(first.matched, 10);
  assert.equal(first.payment_transactions_upserted, 15);
  assert.equal(first.platform_orders_upserted, 2);
  assert.equal(first.ledger_skipped, 1);
  assert.equal(first.duplicate_sales_skipped, 1);
  assert.deepEqual(first.warnings, ["rollup_deferred"]);

  const second = mergeImportProgress(
    first,
    {
      ok: true,
      has_more: false,
      next_page: null,
      next_window_index: null,
      current_window: { from: "2026-07-01T00:00:00.000Z", to: "2026-07-02T00:00:00.000Z" },
      metrics: {
        fetched: 3,
        processed: 3,
        matched: 2,
        unmatched: 1,
        rows_upserted: 4,
        ledger_inserted: 3,
        duplicates_skipped: 1,
      },
    },
    { now: "2026-07-12T10:02:00.000Z" },
  );

  assert.equal(second.status, "completed");
  assert.equal(second.current_page, null);
  assert.equal(second.current_window_index, null);
  assert.equal(second.records_processed, 18);
  assert.equal(second.rows_upserted, 21);
  assert.equal(second.ledger_inserted, 15);
  assert.equal(second.duplicate_rows_skipped, 3);
  assert.equal(second.completed_at, "2026-07-12T10:02:00.000Z");
});

test("continues multi-window imports", () => {
  const started = createInitialImportProgress({
    platform: "paypal",
    connector_id: "paypal:merchant",
    from: "2026-01-01",
    to: "2026-03-15",
  });

  const next = mergeImportProgress(started, {
    ok: true,
    has_more: true,
    next_page: 1,
    next_window_index: 1,
    current_window: { from: "2026-01-01T00:00:00.000Z", to: "2026-02-01T00:00:00.000Z" },
    metrics: {
      fetched: 50,
      processed: 50,
    },
  });

  assert.equal(next.status, "importing");
  assert.equal(next.current_page, 1);
  assert.equal(next.current_window_index, 1);
  assert.equal(next.current_window?.from, "2026-01-01T00:00:00.000Z");
});

test("job cursor advances safely and resume keeps the last saved cursor", () => {
  const current = {
    ...createInitialImportProgress({
      platform: "paypal",
      connector_id: "paypal:merchant",
      from: "2026-07-01",
      to: "2026-07-31",
    }),
    current_page: 51,
    current_window_index: 0,
    records_processed: 540,
  };

  const resumed = resumeImportProgress(
    failImportProgress(current, new Error("lookup timeout"), "2026-07-12T10:05:00.000Z"),
    "2026-07-12T10:06:00.000Z",
  );

  assert.equal(resumed.current_page, 51);
  assert.equal(resumed.current_window_index, 0);
  assert.equal(resumed.records_processed, 540);

  const advanced = mergeImportProgress(
    resumed,
    {
      ok: true,
      has_more: true,
      next_page: 52,
      next_window_index: 0,
      metrics: {
        fetched: 15,
        processed: 15,
        rows_upserted: 15,
        ledger_inserted: 12,
        warnings: ["commerce_reference_lookup_deferred: 15 records"],
      },
    },
    { now: "2026-07-12T10:07:00.000Z" },
  );

  assert.equal(advanced.status, "importing");
  assert.equal(advanced.current_page, 52);
  assert.equal(advanced.records_processed, 555);
  assert.deepEqual(advanced.warnings, ["commerce_reference_lookup_deferred: 15 records"]);
});

test("supports failure, resume, cancellation, and unknown total progress", () => {
  const started = createInitialImportProgress({
    platform: "shopify",
    connector_id: "tracekit-demo.myshopify.com",
    from: "2026-07-01",
    to: "2026-07-02",
  });

  assert.equal(importProgressPercent(started), null);

  const failed = failImportProgress(started, new Error("rate limited"), "2026-07-12T10:03:00.000Z");
  assert.equal(failed.status, "failed");
  assert.equal(failed.last_error, "rate limited");

  const resumed = resumeImportProgress(failed, "2026-07-12T10:04:00.000Z");
  assert.equal(resumed.status, "queued");
  assert.equal(resumed.last_error, null);
  assert.equal(resumed.completed_at, null);

  const cancelled = cancelImportProgress(resumed, "2026-07-12T10:05:00.000Z");
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.completed_at, "2026-07-12T10:05:00.000Z");
});

test("repeated import warnings aggregate instead of appending duplicates", () => {
  const warnings = mergeImportWarnings(
    [
      "phone_matching_deferred: skipped synchronous phone lookup for 15 unmatched PayPal record(s).",
      "commerce_reference_lookup_deferred: 15 records",
      "rollup_deferred",
    ],
    [
      "phone_matching_deferred: 20 records",
      "commerce_reference_lookup_deferred: 10 records",
      "commerce_transaction_lookup_deferred: 3 records",
      "rollup_deferred",
    ],
  );

  assert.deepEqual(warnings, [
    "commerce_reference_lookup_deferred: 25 records",
    "commerce_transaction_lookup_deferred: 3 records",
    "phone_matching_deferred: 35 records",
    "rollup_deferred",
  ]);
});

test("prevents duplicate active imports for the same connector and date range", () => {
  const progress = createInitialImportProgress({
    workspace_id: "default",
    platform: "paypal",
    connector_id: "paypal:merchant",
    from: "2026-07-01",
    to: "2026-07-02",
    filter: "all_financial_records",
  });

  assert.equal(
    shouldBlockDuplicateImport(
      {
        platform: "paypal",
        from_date: "2026-07-01",
        to_date: "2026-07-02",
        filter: "all_financial_records",
        status: "importing",
        progress,
      },
      {
        workspace_id: "default",
        platform: "paypal",
        connector_id: "paypal:merchant",
        from: "2026-07-01",
        to: "2026-07-02",
        filter: "all_financial_records",
      },
    ),
    true,
  );

  assert.equal(
    shouldBlockDuplicateImport(
      {
        platform: "paypal",
        from_date: "2026-07-01",
        to_date: "2026-07-02",
        filter: "all_financial_records",
        status: "completed",
        progress: { ...progress, status: "completed" },
      },
      {
        workspace_id: "default",
        platform: "paypal",
        connector_id: "paypal:merchant",
        from: "2026-07-01",
        to: "2026-07-02",
        filter: "all_financial_records",
      },
    ),
    false,
  );
});

test("adapts connector responses into the shared chunk contract", () => {
  const chunk = adaptConnectorResponse({
    ok: true,
    has_more: true,
    next_page: 3,
    records_fetched: 15,
    records_processed: 15,
    matched: 8,
    unmatched: 7,
    payment_transactions_upserted: 15,
    platform_orders_upserted: 4,
    ledger_inserted: 12,
    platform_order_rows_deduplicated: 2,
    rollup_warnings: ["rollup_deferred"],
  });

  assert.equal(chunk.ok, true);
  assert.equal(chunk.has_more, true);
  assert.equal(chunk.next_page, 3);
  assert.equal(chunk.metrics.fetched, 15);
  assert.equal(chunk.metrics.rows_upserted, 19);
  assert.equal(chunk.metrics.payment_transactions_upserted, 15);
  assert.equal(chunk.metrics.platform_orders_upserted, 4);
  assert.equal(chunk.metrics.duplicates_skipped, 2);
  assert.deepEqual(chunk.metrics.warnings, ["rollup_deferred"]);
});

test("computes determinate percentages when total count is known", () => {
  const progress = {
    ...createInitialImportProgress({
      platform: "checkoutchamp",
      connector_id: "checkoutchamp",
      from: "2026-07-01",
      to: "2026-07-02",
    }),
    records_processed: 25,
    total_records: 100,
  };

  assert.equal(importProgressPercent(progress), 25);
});

test("compacts thousands of historical WowBoost warnings to bounded samples and counters", () => {
  const historicalWarnings = [
    ...Array.from({ length: 1200 }, (_, index) => `legacy_order_number_mapping_deferred:${100000 + index}:pages_1_to_5`),
    ...Array.from({ length: 75 }, (_, index) => `order_detail_not_found:WB-${index}`),
    ...Array.from({ length: 50 }, (_, index) => `order_detail_lookup_failed:WB-F-${index}:timeout`),
  ];
  const historicalRateLimitWarnings = Array.from(
    { length: 333 },
    (_, index) => `wowboost_order_detail_rate_limited:WB-RL-${index}:attempt_1:wait_1000ms`,
  );

  const started = {
    ...createInitialImportProgress({
      platform: "wowboost",
      connector_id: "wowboost-commerce-reference-backfill",
      from: "2026-07-01",
      to: "2026-07-13",
    }),
    current_cursor: "{\"current_platform\":\"wowsuite:wowboost\",\"platform_order_id\":\"wowsuite:wowboost:25105330\"}",
    current_page: 42,
    export_page: 42,
    legacy_export_page: 42,
    export_cursor: "{\"current_platform\":\"wowsuite:wowboost\",\"platform_order_id\":\"wowsuite:wowboost:25105330\"}",
    legacy_export_cursor: "{\"current_platform\":\"wowsuite:wowboost\",\"platform_order_id\":\"wowsuite:wowboost:25105330\"}",
    export_continuation_token: "token-42",
    legacy_export_continuation_token: "token-42",
    export_order_number_mappings_loaded: 700,
    export_pages_processed: 41,
    warnings: historicalWarnings,
    rate_limit_warnings: historicalRateLimitWarnings,
    permanently_missing_order_ids: Array.from({ length: 75 }, (_, index) => `WB-${index}`),
  };

  const { progress: compacted, changed } = compactWowBoostBackfillProgress(started);

  assert.equal(changed, true);
  assert.equal(compacted.warning_count, historicalWarnings.length + historicalRateLimitWarnings.length);
  assert.equal(compacted.rate_limit_warning_count, historicalRateLimitWarnings.length);
  assert.equal(compacted.rate_limit_retry_count, historicalRateLimitWarnings.length);
  assert.equal(compacted.deferred_mapping_count, 1200);
  assert.equal(compacted.permanently_missing_count, 75);
  assert.equal(compacted.recent_warnings.length, IMPORT_PROGRESS_RECENT_WARNING_LIMIT);
  assert.equal(compacted.warnings.length, IMPORT_PROGRESS_RECENT_WARNING_LIMIT);
  assert.equal(compacted.recent_rate_limit_warnings.length, IMPORT_PROGRESS_RECENT_RATE_LIMIT_WARNING_LIMIT);
  assert.equal(compacted.rate_limit_warnings.length, IMPORT_PROGRESS_RECENT_RATE_LIMIT_WARNING_LIMIT);
  assert.equal(compacted.recent_permanently_missing_ids.length, IMPORT_PROGRESS_RECENT_PERMANENTLY_MISSING_ID_LIMIT);
  assert.equal(compacted.permanently_missing_order_ids.length, IMPORT_PROGRESS_RECENT_PERMANENTLY_MISSING_ID_LIMIT);
});

test("WowBoost progress compaction is idempotent and preserves cursor and export state", () => {
  const started = {
    ...createInitialImportProgress({
      platform: "wowboost",
      connector_id: "wowboost-commerce-reference-backfill",
      from: "2026-07-01",
      to: "2026-07-13",
    }),
    status: "importing" as const,
    current_cursor: "{\"current_platform\":\"wowboost\",\"platform_order_id\":\"wowboost:200\"}",
    current_page: 12,
    export_page: 9,
    legacy_export_page: 9,
    export_cursor: "{\"current_platform\":\"wowboost\",\"platform_order_id\":\"wowboost:100\"}",
    legacy_export_cursor: "{\"current_platform\":\"wowboost\",\"platform_order_id\":\"wowboost:100\"}",
    export_continuation_token: "export-token",
    legacy_export_continuation_token: "export-token",
    warnings: ["legacy_order_number_mapping_deferred:100:pages_1_to_2"],
    rate_limit_warnings: ["wowboost_order_detail_rate_limited:100:attempt_1:wait_1000ms"],
  };

  const first = compactWowBoostBackfillProgress(started);
  const second = compactWowBoostBackfillProgress(first.progress);

  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.deepEqual(second.progress, first.progress);
  assert.equal(second.progress.status, "importing");
  assert.equal(second.progress.current_cursor, started.current_cursor);
  assert.equal(second.progress.current_page, 12);
  assert.equal(second.progress.export_page, 9);
  assert.equal(second.progress.export_cursor, started.export_cursor);
  assert.equal(second.progress.export_continuation_token, "export-token");
});

test("WowBoost progress compaction removes recovered permanent-missing IDs and corrects counters", () => {
  const started = {
    ...createInitialImportProgress({
      platform: "wowboost",
      connector_id: "wowboost-commerce-reference-backfill",
      from: "2026-07-01",
      to: "2026-07-13",
    }),
    permanently_missing_orders: 4,
    permanently_missing_order_ids: ["WB-1", "WB-2", "WB-3", "WB-4"],
    warnings: [
      "order_detail_not_found:WB-1",
      "order_detail_not_found:WB-2",
      "order_detail_not_found:WB-3",
      "order_detail_not_found:WB-4",
    ],
  };

  const { progress } = compactWowBoostBackfillProgress(started, {
    recoveredPermanentlyMissingIds: ["WB-2", "WB-4"],
  });

  assert.equal(progress.permanently_missing_count, 2);
  assert.equal(progress.permanently_missing_orders, 2);
  assert.deepEqual(progress.recent_permanently_missing_ids, ["WB-1", "WB-3"]);
  assert.deepEqual(progress.permanently_missing_order_ids, ["WB-1", "WB-3"]);
});

test("compact job payload hides full progress by default and exposes it with full_progress", () => {
  const hugeWarnings = Array.from({ length: 100 }, (_, index) => `order_detail_lookup_failed:WB-${index}:timeout`);
  const compacted = compactWowBoostBackfillProgress({
    ...createInitialImportProgress({
      platform: "wowboost",
      connector_id: "wowboost-commerce-reference-backfill",
      from: "2026-07-01",
      to: "2026-07-13",
    }),
    status: "importing",
    current_cursor: "{\"current_platform\":\"wowboost\",\"platform_order_id\":\"wowboost:100\"}",
    warnings: hugeWarnings,
  }).progress;
  const job = {
    id: "295502cf-d247-4de1-8175-1395bfbfe899",
    platform: "wowboost",
    module: "wowboost_commerce_reference_backfill",
    status: "importing",
    from_date: "2026-07-01",
    to_date: "2026-07-13",
    filter: "commerce_reference_backfill",
  };

  const normal = buildPublicImportJobPayload(job, compacted);
  assert.equal("progress" in normal, false);
  assert.equal(normal.id, job.id);
  assert.equal(normal.current_cursor, compacted.current_cursor);
  assert.equal(normal.recent_warnings.length, IMPORT_PROGRESS_RECENT_WARNING_LIMIT);
  assert.equal(normal.aggregate_counters.warning_count, hugeWarnings.length);

  const full = buildPublicImportJobPayload(job, compacted, { full_progress: true });
  assert.equal(full.progress.current_cursor, compacted.current_cursor);
  assert.equal(full.progress.warning_count, hugeWarnings.length);
});

test("current WowBoost job can resume after compaction with new incremental diagnostics", () => {
  const currentJobProgress = compactWowBoostBackfillProgress({
    ...createInitialImportProgress({
      platform: "wowboost",
      connector_id: "wowboost-commerce-reference-backfill",
      from: "2026-07-01",
      to: "2026-07-13",
    }),
    status: "importing",
    current_cursor: "{\"current_platform\":\"wowsuite:wowboost\",\"platform_order_id\":\"wowsuite:wowboost:25105330\"}",
    records_fetched: 100,
    records_processed: 90,
    rows_upserted: 12,
    warnings: Array.from({ length: 25 }, (_, index) => `legacy_order_number_mapping_deferred:${index}:pages_1_to_3`),
  }).progress;

  const resumed = compactWowBoostBackfillProgress(currentJobProgress, {
    incomingWarnings: ["legacy_order_number_mapping_deferred:999:pages_4_to_6"],
    incomingRateLimitWarnings: ["wowboost_order_detail_rate_limited:999:attempt_1:wait_1000ms"],
    rateLimitRetryCount: 1,
    permanentlyMissingIds: ["WB-404"],
    permanentlyMissingCount: 1,
  }).progress;

  assert.equal(resumed.status, "importing");
  assert.equal(resumed.current_cursor, currentJobProgress.current_cursor);
  assert.equal(resumed.warning_count, 28);
  assert.equal(resumed.deferred_mapping_count, 26);
  assert.equal(resumed.rate_limit_retry_count, 1);
  assert.equal(resumed.rate_limit_warning_count, 1);
  assert.equal(resumed.permanently_missing_count, 1);
  assert.deepEqual(resumed.recent_permanently_missing_ids, ["WB-404"]);
});
