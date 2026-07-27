import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWowBoostCommerceReferenceBackfillDecision,
  buildWowBoostOrderNumberToOrderIdMap,
  buildWowBoostOrderDetailsReferenceBackfillDecision,
  capWowBoostPermanentMissingOrderIds,
  classifyWowBoostOrderDetailsLookupFailure,
  appendWowBoostRuntimePageFingerprint,
  extractWowBoostCommerceReference,
  extractWowBoostCommerceReferenceEvidence,
  extractWowBoostLegacyOrderNumberEvidence,
  extractWowBoostOrderDetailsCommerceReference,
  filterWowBoostOrderDetailsBackfillRowsForScan,
  isWowBoostOrderDetailsAuthFailureStatus,
  isWowBoostOrderDetailsPermanentNotFound,
  isWowBoostOrderDetailsBackfillStatementTimeout,
  isTransientWowBoostOrderDetailsStatus,
  isWowBoostPlatformValue,
  normalizeWowBoostOrderDetailsBackfillDateRange,
  normalizeWowBoostOrderDetailsBackfillLimit,
  normalizeWowBoostOrderDetailsPacingMs,
  normalizeWowBoostCommerceReferenceExportRow,
  normalizeWowBoostExportHeader,
  normalizeWowBoostRuntimeMaxExportPages,
  normalizeWowBoostLegacyMaxExportPagesPerInvocation,
  nextWowBoostOrderDetailsBackfillPlatform,
  parseWowBoostOrderDetailsBackfillCursor,
  parseWowBoostRetryAfterMs,
  restoreWowBoostLegacyExportPage,
  resolveWowBoostLegacyOrderNumber,
  resolveWowBoostOrderDetailsLookupOrderId,
  scanWowBoostLegacyOrderNumberExportPages,
  serializeWowBoostOrderDetailsBackfillCursor,
  summarizeWowBoostCommerceReferenceBackfillBatch,
  summarizeWowBoostCommerceReferenceExportBackfill,
  summarizeWowBoostOrderDetailsReferenceBackfillDecisions,
  wowBoostExportContinuationTokenWithDateRange,
  wowBoostLegacyExportPageForRequest,
  wowBoostLegacyExportPagingProgress,
  wowBoostLegacyOrderNumberDeferredWarning,
  wowBoostOrderDetailsBackfillScanPlan,
  wowBoostOrderDetailsBackfillRowMatchesDateRange,
  wowBoostOrderDetailsRetryDelayMs,
  wowBoostExportHeaderDiagnostics,
  wowBoostExportPageFingerprint,
  wowBoostOrderDetailsBackfillNextCursor,
  wowBoostOrderReferenceDiagnostics,
  wowBoostRuntimeRepeatedPageDetected,
  wowBoostRuntimeStagingStopDecision,
} from "./wowboost.ts";

test("maps WowBoost ReferenceId to canonical commerce reference", () => {
  const reference = "66FE31EE-C521-432E-9822-0A07FF85230F";
  const evidence = extractWowBoostCommerceReferenceEvidence({
    OrderId: "1001",
    ReferenceId: reference,
  });

  assert.equal(evidence.value, reference);
  assert.equal(evidence.source_field, "ReferenceId");
  assert.equal(extractWowBoostCommerceReference({ ReferenceId: reference }), reference);
});

test("maps WowBoost Reference ID to canonical commerce reference", () => {
  const reference = "66FE31EE-C521-432E-9822-0A07FF85230F";
  const evidence = extractWowBoostCommerceReferenceEvidence({
    "Order ID": "1001",
    "Reference ID": reference,
  });

  assert.equal(evidence.value, reference);
  assert.equal(evidence.source_field, "Reference ID");
});

test("normalizes UTF-8 BOM on ReferenceId header", () => {
  const reference = "4F4DA0F1-3DEE-437B-A849-32E7B25D174C";
  const evidence = extractWowBoostCommerceReferenceEvidence({
    "\uFEFFReferenceId": reference,
  });

  assert.equal(normalizeWowBoostExportHeader("\uFEFFReferenceId"), "referenceid");
  assert.equal(evidence.value, reference);
  assert.equal(evidence.source_field, "\uFEFFReferenceId");
});

test("normalizes Reference Id capitalization and spacing", () => {
  const reference = "4F4DA0F1-3DEE-437B-A849-32E7B25D174C";
  const evidence = extractWowBoostCommerceReferenceEvidence({
    " Reference Id ": reference,
  });

  assert.equal(evidence.value, reference);
  assert.equal(evidence.source_field, " Reference Id ");
});

test("normalizes trailing whitespace on reference header", () => {
  const reference = "4F4DA0F1-3DEE-437B-A849-32E7B25D174C";
  const evidence = extractWowBoostCommerceReferenceEvidence({
    "ReferenceId   ": reference,
  });

  assert.equal(evidence.value, reference);
  assert.equal(evidence.source_field, "ReferenceId   ");
});

test("normalizes punctuation underscore and hyphen reference header variants", () => {
  const reference = "4F4DA0F1-3DEE-437B-A849-32E7B25D174C";

  assert.equal(extractWowBoostCommerceReference({ reference_id: reference }), reference);
  assert.equal(extractWowBoostCommerceReference({ "reference-id": reference }), reference);
  assert.equal(extractWowBoostCommerceReference({ "Reference.Id": reference }), reference);
});

test("diagnoses missing ReferenceId export column without exposing row values", () => {
  const diagnostics = wowBoostExportHeaderDiagnostics(
    ["Order ID", "TransactionId", "ShippingReference"],
    {
      "Order ID": "105330",
      TransactionId: "ce1b46d8-e744-426d-8e34-b5db88d7a2e8",
      ShippingReference: "25105330N",
    },
  );

  assert.equal(diagnostics.reference_header_detected, false);
  assert.equal(diagnostics.reference_header_name, null);
  assert.deepEqual(diagnostics.warnings, ["reference_column_missing_from_export"]);
  assert.deepEqual(diagnostics.normalized_export_headers, ["orderid", "transactionid", "shippingreference"]);
  assert.deepEqual(diagnostics.first_row_keys, ["Order ID", "TransactionId", "ShippingReference"]);
});

test("diagnoses detected ReferenceId header name", () => {
  const diagnostics = wowBoostExportHeaderDiagnostics(
    ["Order ID", "Reference Id ", "TransactionId"],
    {
      "Order ID": "105330",
      "Reference Id ": "4F4DA0F1-3DEE-437B-A849-32E7B25D174C",
    },
  );

  assert.equal(diagnostics.reference_header_detected, true);
  assert.equal(diagnostics.reference_header_name, "Reference Id ");
  assert.deepEqual(diagnostics.warnings, []);
});

test("builds backfill patch from historical WowBoost raw_json ReferenceId", () => {
  const reference = "66FE31EE-C521-432E-9822-0A07FF85230F";
  const decision = buildWowBoostCommerceReferenceBackfillDecision({
    platform: "wowsuite:wowboost",
    platform_order_id: "wowboost:1001",
    order_id: "1001",
    commerce_reference: null,
    raw_json: {
      ReferenceId: reference,
      Email: "buyer@example.com",
    },
  });

  assert.equal(decision.action, "update");
  if (decision.action === "update") {
    assert.equal(decision.commerce_reference, reference);
    assert.equal(decision.source_field, "ReferenceId");
  }
});

test("never overwrites existing WowBoost commerce_reference", () => {
  const decision = buildWowBoostCommerceReferenceBackfillDecision({
    platform: "wowboost",
    platform_order_id: "wowboost:1002",
    order_id: "1002",
    commerce_reference: "EXISTING",
    raw_json: {
      ReferenceId: "NEW",
    },
  });

  assert.deepEqual(decision, {
    action: "skip",
    reason: "already_populated",
    platform_order_id: "wowboost:1002",
    order_id: "1002",
  });
});

test("missing WowBoost reference remains unchanged", () => {
  const decision = buildWowBoostCommerceReferenceBackfillDecision({
    platform: "wowboost",
    platform_order_id: "wowboost:1003",
    order_id: "1003",
    commerce_reference: null,
    raw_json: {
      OrderId: "1003",
    },
  });

  assert.equal(decision.action, "skip");
  if (decision.action === "skip") assert.equal(decision.reason, "missing_reference");
});

test("dry-run summarizes WowBoost backfill without update patches", () => {
  const reference = "66FE31EE-C521-432E-9822-0A07FF85230F";
  const summary = summarizeWowBoostCommerceReferenceBackfillBatch(
    [
      {
        platform: "wowboost",
        platform_order_id: "wowboost:1004",
        order_id: "1004",
        commerce_reference: null,
        raw_json: { "Reference ID": reference },
      },
    ],
    { dryRun: true },
  );

  assert.equal(summary.scanned, 1);
  assert.equal(summary.eligible, 1);
  assert.equal(summary.updated, 0);
  assert.equal(summary.would_update, 1);
  assert.equal(summary.patches.length, 0);
  assert.equal(summary.sample[0].commerce_reference, reference);
});

test("rerunning WowBoost backfill is idempotent after reference is populated", () => {
  const reference = "66FE31EE-C521-432E-9822-0A07FF85230F";
  const first = summarizeWowBoostCommerceReferenceBackfillBatch([
    {
      platform: "wowboost",
      platform_order_id: "wowboost:1005",
      order_id: "1005",
      commerce_reference: null,
      raw_json: { ReferenceId: reference },
    },
  ]);
  const second = summarizeWowBoostCommerceReferenceBackfillBatch([
    {
      platform: "wowboost",
      platform_order_id: "wowboost:1005",
      order_id: "1005",
      commerce_reference: first.patches[0].commerce_reference,
      raw_json: { ReferenceId: reference },
    },
  ]);

  assert.equal(first.patches.length, 1);
  assert.equal(second.patches.length, 0);
  assert.equal(second.already_populated, 1);
});

test("WowPay rows are excluded from WowBoost commerce-reference backfill", () => {
  assert.equal(isWowBoostPlatformValue("wowpay"), false);
  assert.equal(isWowBoostPlatformValue("wowsuite:wowpay"), false);

  const summary = summarizeWowBoostCommerceReferenceBackfillBatch([
    {
      platform: "wowsuite:wowpay",
      platform_order_id: "wowpay:1006",
      order_id: "1006",
      commerce_reference: null,
      raw_json: { ReferenceId: "PAYPAL-REF" },
    },
  ]);

  assert.equal(summary.scanned, 1);
  assert.equal(summary.eligible, 0);
  assert.equal(summary.patches.length, 0);
});

test("export backfill maps confirmed WowBoost ReferenceId fixture only to commerce_reference", () => {
  const exportRow = {
    "Order ID": "105330",
    "Order Number": "25105330",
    TransactionId: "ce1b46d8-e744-426d-8e34-b5db88d7a2e8",
    ShippingReference: "25105330N",
    ReferenceId: "4F4DA0F1-3DEE-437B-A849-32E7B25D174C",
    "Updated Date": "2026-07-01T12:00:00Z",
  };
  const normalized = normalizeWowBoostCommerceReferenceExportRow(exportRow);
  const summary = summarizeWowBoostCommerceReferenceExportBackfill(
    [exportRow],
    [
      {
        platform: "wowsuite:wowboost",
        platform_order_id: "wowboost:105330",
        order_id: "105330",
        transaction_id: "ce1b46d8-e744-426d-8e34-b5db88d7a2e8",
        commerce_reference: null,
      },
    ],
  );

  assert.equal(normalized.order_id, "105330");
  assert.equal(normalized.order_number, "25105330");
  assert.equal(normalized.transaction_id, "ce1b46d8-e744-426d-8e34-b5db88d7a2e8");
  assert.equal(normalized.commerce_reference, "4F4DA0F1-3DEE-437B-A849-32E7B25D174C");
  assert.equal(summary.patches.length, 1);
  assert.equal(summary.patches[0].platform_order_id, "wowboost:105330");
  assert.equal(summary.patches[0].order_id, "105330");
  assert.equal(summary.patches[0].transaction_id, "ce1b46d8-e744-426d-8e34-b5db88d7a2e8");
  assert.equal(summary.patches[0].commerce_reference, "4F4DA0F1-3DEE-437B-A849-32E7B25D174C");
});

test("legacy Order Number maps to true WowBoost Order ID through export rows", () => {
  const mappings = buildWowBoostOrderNumberToOrderIdMap([
    {
      "Order ID": "105330",
      "Order Number": "25105330",
      TransactionId: "ce1b46d8-e744-426d-8e34-b5db88d7a2e8",
      ReferenceId: "4F4DA0F1-3DEE-437B-A849-32E7B25D174C",
    },
  ]);

  assert.equal(mappings.size, 1);
  assert.deepEqual(resolveWowBoostLegacyOrderNumber(mappings, "25105330"), {
    status: "mapped",
    legacy_order_number: "25105330",
    order_id: "105330",
    candidate_count: 1,
  });
});

test("legacy Order Number mapping recognizes spaced Order ID header", () => {
  const normalized = normalizeWowBoostCommerceReferenceExportRow({
    "Order ID": "105330",
    "Order Number": "25105330",
  });
  const mappings = buildWowBoostOrderNumberToOrderIdMap([
    {
      "Order ID": "105330",
      "Order Number": "25105330",
    },
  ]);

  assert.equal(normalized.order_id, "105330");
  assert.equal(resolveWowBoostLegacyOrderNumber(mappings, "25105330").status, "mapped");
});

test("legacy Order Number mapping leaves missing and duplicate mappings unresolved or ambiguous", () => {
  const mappings = buildWowBoostOrderNumberToOrderIdMap([
    {
      "Order ID": "105330",
      "Order Number": "25105330",
    },
    {
      "Order ID": "105331",
      "Order Number": "25105330",
    },
  ]);

  assert.deepEqual(resolveWowBoostLegacyOrderNumber(mappings, "999999"), {
    status: "unresolved",
    legacy_order_number: "999999",
    order_id: null,
    candidate_count: 0,
  });
  assert.deepEqual(resolveWowBoostLegacyOrderNumber(mappings, "25105330"), {
    status: "ambiguous",
    legacy_order_number: "25105330",
    order_id: null,
    candidate_count: 2,
    candidate_order_ids: ["105330", "105331"],
  });
});

test("runtime staging stop decision ignores hasMore once all targets are mapped", () => {
  const decision = wowBoostRuntimeStagingStopDecision({
    target_total: 4532,
    target_remaining: 0,
    rows_fetched: 500,
    has_more: true,
    page: 115,
    max_pages: 150,
  });

  assert.deepEqual(decision, {
    should_stop: true,
    reason: "all_targets_mapped",
  });
});

test("runtime staging keeps page forty target mapping even when Order Create Date is before requested range", () => {
  const mappings = buildWowBoostOrderNumberToOrderIdMap([
    {
      "Order ID": "116819",
      "Order Number": "26116819",
      "Order Create Date": "2026-03-27T12:00:00Z",
    },
  ]);

  assert.deepEqual(resolveWowBoostLegacyOrderNumber(mappings, "26116819"), {
    status: "mapped",
    legacy_order_number: "26116819",
    order_id: "116819",
    candidate_count: 1,
  });
});

test("runtime staging can filter unrelated export rows by target order number", () => {
  const targets = new Set(["26116819"]);
  const rows = [
    normalizeWowBoostCommerceReferenceExportRow({ "Order ID": "116819", "Order Number": "26116819" }),
    normalizeWowBoostCommerceReferenceExportRow({ "Order ID": "999999", "Order Number": "29999999" }),
  ];
  const useful = rows.filter((row) => targets.has(String(row.order_number || "")));

  assert.equal(useful.length, 1);
  assert.equal(useful[0].order_id, "116819");
  assert.equal(useful[0].order_number, "26116819");
});

test("runtime staging stop decision handles export end empty pages repeated pages and max page limit", () => {
  assert.equal(wowBoostRuntimeStagingStopDecision({
    target_total: 10,
    target_remaining: 2,
    rows_fetched: 500,
    has_more: false,
    page: 12,
    max_pages: 150,
  }).reason, "export_ended");

  assert.equal(wowBoostRuntimeStagingStopDecision({
    target_total: 10,
    target_remaining: 2,
    rows_fetched: 0,
    has_more: true,
    page: 12,
    max_pages: 150,
  }).reason, "empty_page");

  assert.equal(wowBoostRuntimeStagingStopDecision({
    target_total: 10,
    target_remaining: 2,
    rows_fetched: 500,
    has_more: true,
    repeated_page: true,
    page: 12,
    max_pages: 150,
  }).reason, "paging_loop_detected");

  assert.equal(wowBoostRuntimeStagingStopDecision({
    target_total: 10,
    target_remaining: 2,
    rows_fetched: 500,
    has_more: true,
    page: 150,
    max_pages: 150,
  }).reason, "max_export_pages_reached");
});

test("runtime page fingerprint detects bounded repeated export pages", () => {
  const first = wowBoostExportPageFingerprint([
    { "Order ID": "116819", "Order Number": "26116819" },
    { "Order ID": "116820", "Order Number": "26116820" },
  ]);
  const sameDifferentOrder = wowBoostExportPageFingerprint([
    { "Order Number": "26116820", "Order ID": "116820" },
    { "Order Number": "26116819", "Order ID": "116819" },
  ]);
  const history = appendWowBoostRuntimePageFingerprint({ fingerprint: first, history: ["old-1", "old-2"], limit: 2 });

  assert.equal(first, sameDifferentOrder);
  assert.deepEqual(history, ["old-2", first]);
  assert.equal(wowBoostRuntimeRepeatedPageDetected({ fingerprint: sameDifferentOrder, history }), true);
  assert.equal(wowBoostRuntimeRepeatedPageDetected({ fingerprint: "different", history }), false);
});

test("runtime max export pages default and override are clamped", () => {
  assert.equal(normalizeWowBoostRuntimeMaxExportPages(undefined), 150);
  assert.equal(normalizeWowBoostRuntimeMaxExportPages(40), 40);
  assert.equal(normalizeWowBoostRuntimeMaxExportPages(0), 1);
  assert.equal(normalizeWowBoostRuntimeMaxExportPages(5000), 1000);
});

test("legacy export paging resumes from persisted page for the same pinned cursor", () => {
  const cursor = "{\"current_platform\":\"wowsuite:wowboost\",\"platform_order_id\":\"wowsuite:wowboost:25105330\"}";
  const progress = wowBoostLegacyExportPagingProgress({
    pending: true,
    cursor,
    next_page: 3,
    continuation_token: "next-export-token",
  });

  assert.deepEqual(progress, {
    export_page: 3,
    legacy_export_page: 3,
    export_cursor: cursor,
    legacy_export_cursor: cursor,
    export_continuation_token: "next-export-token",
    legacy_export_continuation_token: "next-export-token",
  });
  assert.equal(restoreWowBoostLegacyExportPage({
    progress,
    current_cursor: cursor,
  }), 3);
});

test("WowBoost export continuation token preserves requested date filters", () => {
  const token = wowBoostExportContinuationTokenWithDateRange({
    token: "https://public-api.tryemanagecrm.com/api/orders/export/20/500?StartDate=01/01/0001%2000%3A00%3A00&EndDate=01/01/0001%2000%3A00%3A00",
    from: "2026-04-01",
    to: "2026-07-13",
  });
  const url = new URL(token || "");

  assert.equal(url.searchParams.get("StartDate"), "2026-04-01");
  assert.equal(url.searchParams.get("EndDate"), "2026-07-13");
  assert.equal(url.pathname, "/api/orders/export/20/500");
});

test("legacy export paging fetches page 2 after resume even when request has generic page 1", () => {
  const cursor = "{\"current_platform\":\"wowsuite:wowboost\",\"platform_order_id\":\"wowsuite:wowboost:25105330\"}";
  const progress = {
    ...wowBoostLegacyExportPagingProgress({
      pending: true,
      cursor,
      next_page: 2,
    }),
    current_page: 1,
  };

  assert.equal(wowBoostLegacyExportPageForRequest({
    body: { job_id: "job-1", page: 1 },
    progress,
    current_cursor: cursor,
  }), 2);
});

test("legacy export paging does not reuse page state after the platform cursor changes", () => {
  const progress = wowBoostLegacyExportPagingProgress({
    pending: true,
    cursor: "{\"current_platform\":\"wowsuite:wowboost\",\"platform_order_id\":\"wowsuite:wowboost:25105330\"}",
    next_page: 4,
  });

  assert.equal(restoreWowBoostLegacyExportPage({
    progress,
    current_cursor: "{\"current_platform\":\"wowsuite:wowboost\",\"platform_order_id\":\"wowsuite:wowboost:25105331\"}",
  }), 1);
});

test("explicit legacy export page request overrides persisted progress", () => {
  const progress = wowBoostLegacyExportPagingProgress({
    pending: true,
    cursor: "same-cursor",
    next_page: 4,
  });

  assert.equal(restoreWowBoostLegacyExportPage({
    requested_page: 7,
    progress,
    current_cursor: "same-cursor",
  }), 7);
});

test("legacy export scan processes multiple pages and finds a later mapping in one invocation", async () => {
  const pagesFetched: number[] = [];
  const result = await scanWowBoostLegacyOrderNumberExportPages({
    legacy_order_number: "26116819",
    start_page: 4,
    max_pages_per_invocation: 5,
    fetch_page: async (page) => {
      pagesFetched.push(page);
      return {
        page,
        has_more: true,
        next_page: page + 1,
        rows: page === 5
          ? [{ "Order Number": "26116819", "Order ID": "105330" }]
          : [{ "Order Number": "11111111", "Order ID": "100001" }],
      };
    },
  });

  assert.deepEqual(pagesFetched, [4, 5]);
  assert.equal(result.pages_processed, 2);
  assert.equal(result.start_page, 4);
  assert.equal(result.end_page, 5);
  assert.equal(result.resolution.status, "mapped");
  if (result.resolution.status === "mapped") {
    assert.equal(result.resolution.order_id, "105330");
  }
  assert.equal(result.execution_budget_reached, false);
});

test("legacy export scan keeps platform cursor pinned while export pages remain pending", async () => {
  const rows = [
    { platform: "wowsuite:wowboost", platform_order_id: "wowsuite:wowboost:26116819", order_id: null },
  ];
  const result = await scanWowBoostLegacyOrderNumberExportPages({
    legacy_order_number: "26116819",
    start_page: 2,
    max_pages_per_invocation: 2,
    fetch_page: async (page) => ({
      page,
      has_more: true,
      next_page: page + 1,
      rows: [{ "Order Number": String(10000000 + page), "Order ID": String(200000 + page) }],
    }),
  });
  const cursor = wowBoostOrderDetailsBackfillNextCursor(rows, true, {
    processedCount: 0,
    inputCursor: "wowsuite:wowboost:121438",
    blocked: result.execution_budget_reached,
  });

  assert.equal(result.execution_budget_reached, true);
  assert.equal(result.next_page, 4);
  assert.equal(cursor, "wowsuite:wowboost:121438");
});

test("legacy export scan exhaustion marks unresolved and allows platform cursor advancement", async () => {
  const rows = [
    { platform: "wowsuite:wowboost", platform_order_id: "wowsuite:wowboost:26116819", order_id: null },
  ];
  const result = await scanWowBoostLegacyOrderNumberExportPages({
    legacy_order_number: "26116819",
    start_page: 7,
    fetch_page: async (page) => ({
      page,
      has_more: false,
      next_page: null,
      rows: [{ "Order Number": "99999999", "Order ID": "109999" }],
    }),
  });
  const cursor = wowBoostOrderDetailsBackfillNextCursor(rows, true, {
    processedCount: 1,
    inputCursor: "wowsuite:wowboost:121438",
    blocked: false,
  });

  assert.equal(result.resolution.status, "unresolved");
  assert.equal(result.has_more, false);
  assert.equal(cursor, "wowsuite:wowboost:26116819");
});

test("legacy export scan ambiguity marks ambiguous and allows platform cursor advancement", async () => {
  const rows = [
    { platform: "wowsuite:wowboost", platform_order_id: "wowsuite:wowboost:26116819", order_id: null },
  ];
  const result = await scanWowBoostLegacyOrderNumberExportPages({
    legacy_order_number: "26116819",
    start_page: 3,
    fetch_page: async (page) => ({
      page,
      has_more: true,
      next_page: page + 1,
      rows: [
        { "Order Number": "26116819", "Order ID": "105330" },
        { "Order Number": "26116819", "Order ID": "105331" },
      ],
    }),
  });
  const cursor = wowBoostOrderDetailsBackfillNextCursor(rows, true, {
    processedCount: 1,
    inputCursor: "wowsuite:wowboost:121438",
    blocked: false,
  });

  assert.equal(result.resolution.status, "ambiguous");
  assert.equal(result.pages_processed, 1);
  assert.equal(cursor, "wowsuite:wowboost:26116819");
});

test("legacy export scan elapsed budget stops safely and persists the next page", async () => {
  let now = 100;
  const result = await scanWowBoostLegacyOrderNumberExportPages({
    legacy_order_number: "26116819",
    start_page: 8,
    max_pages_per_invocation: 10,
    max_elapsed_ms: 5000,
    started_at_ms: 100,
    now_ms: () => now,
    fetch_page: async (page) => {
      now = 5200;
      return {
        page,
        has_more: true,
        next_page: page + 1,
        rows: [{ "Order Number": "99999999", "Order ID": "109999" }],
      };
    },
  });

  assert.equal(result.pages_processed, 1);
  assert.equal(result.execution_budget_reached, true);
  assert.equal(result.next_page, 9);
});

test("legacy export max pages per invocation is clamped", () => {
  assert.equal(normalizeWowBoostLegacyMaxExportPagesPerInvocation(0), 1);
  assert.equal(normalizeWowBoostLegacyMaxExportPagesPerInvocation(99), 10);
  assert.equal(normalizeWowBoostLegacyMaxExportPagesPerInvocation(undefined), 5);
});

test("legacy export deferred warning aggregates page ranges", () => {
  assert.equal(
    wowBoostLegacyOrderNumberDeferredWarning({
      legacy_order_number: "26116819",
      start_page: 4,
      end_page: 8,
    }),
    "legacy_order_number_mapping_deferred:26116819:pages_4_to_8",
  );
});

test("legacy export state resets after the pinned row is resolved", () => {
  assert.deepEqual(wowBoostLegacyExportPagingProgress({
    pending: false,
    cursor: "same-cursor",
    next_page: 9,
    continuation_token: "token",
  }), {
    export_page: 1,
    legacy_export_page: 1,
    export_cursor: null,
    legacy_export_cursor: null,
    export_continuation_token: null,
    legacy_export_continuation_token: null,
  });
});

test("export backfill never substitutes TransactionId, Order Number, or ShippingReference for ReferenceId", () => {
  const summary = summarizeWowBoostCommerceReferenceExportBackfill(
    [
      {
        "Order ID": "105330",
        "Order Number": "25105330",
        TransactionId: "ce1b46d8-e744-426d-8e34-b5db88d7a2e8",
        ShippingReference: "25105330N",
        ReferenceId: "",
      },
    ],
    [
      {
        platform: "wowboost",
        platform_order_id: "wowboost:105330",
        order_id: "105330",
        transaction_id: "ce1b46d8-e744-426d-8e34-b5db88d7a2e8",
        commerce_reference: null,
      },
    ],
  );

  assert.equal(summary.missing_reference, 1);
  assert.equal(summary.patches.length, 0);
  assert.equal(summary.would_update, 0);
});

test("export dry-run performs no updates and shows existing commerce reference sample fields", () => {
  const summary = summarizeWowBoostCommerceReferenceExportBackfill(
    [
      {
        "Order ID": "105330",
        TransactionId: "ce1b46d8-e744-426d-8e34-b5db88d7a2e8",
        ReferenceId: "4F4DA0F1-3DEE-437B-A849-32E7B25D174C",
      },
    ],
    [
      {
        platform: "wowsuite:wowboost",
        platform_order_id: "wowboost:105330",
        order_id: "105330",
        transaction_id: "ce1b46d8-e744-426d-8e34-b5db88d7a2e8",
        commerce_reference: null,
      },
    ],
    { dryRun: true },
  );

  assert.equal(summary.updated, 0);
  assert.equal(summary.patches.length, 0);
  assert.equal(summary.would_update, 1);
  assert.equal(summary.sample[0].platform_order_id, "wowboost:105330");
  assert.equal(summary.sample[0].existing_commerce_reference, null);
});

test("export backfill falls back to unique WowBoost platform order_id match", () => {
  const summary = summarizeWowBoostCommerceReferenceExportBackfill(
    [
      {
        "Order ID": "105331",
        ReferenceId: "4F4DA0F1-3DEE-437B-A849-32E7B25D174D",
      },
    ],
    [
      {
        platform: "wowboost",
        platform_order_id: "legacy-wowboost-105331",
        order_id: "105331",
        transaction_id: "TXN-105331",
        commerce_reference: null,
      },
    ],
  );

  assert.equal(summary.patches.length, 1);
  assert.equal(summary.patches[0].platform_order_id, "legacy-wowboost-105331");
});

test("order detail diagnostics detects the known WowBoost UI Reference ID safely", () => {
  const expectedReference = "4F4DA0F1-3DEE-437B-A849-32E7B25D174C";
  const diagnostics = wowBoostOrderReferenceDiagnostics({
    status: "success",
    order: {
      "Order ID": "105330",
      "Order Number": "25105330",
      TransactionId: "ce1b46d8-e744-426d-8e34-b5db88d7a2e8",
      ShippingReference: "25105330N",
      ReferenceId: expectedReference,
      CustomerEmail: "buyer@example.com",
      BillingAddress: "123 Private Street",
      CartUuid: "cart-uuid-105330",
    },
  }, expectedReference);

  assert.deepEqual(diagnostics.top_level_response_keys, ["status", "order"]);
  assert.deepEqual(diagnostics.order_object_keys[0], {
    index: 0,
    path: "order",
    keys: [
      "Order ID",
      "Order Number",
      "TransactionId",
      "ShippingReference",
      "ReferenceId",
      "CustomerEmail",
      "BillingAddress",
      "CartUuid",
    ],
  });
  assert.equal(diagnostics.expected_reference_found, true);
  assert.deepEqual(diagnostics.expected_reference_paths, ["order.ReferenceId"]);
  assert.ok(diagnostics.detected_candidate_reference_values.includes(expectedReference));
  assert.ok(diagnostics.detected_candidate_reference_values.includes("25105330N"));
  assert.ok(diagnostics.detected_candidate_reference_values.includes("cart-uuid-105330"));
  assert.equal(
    diagnostics.matching_field_diagnostics.some((field) => String(field.value || "").includes("@")),
    false,
  );
  assert.equal(
    diagnostics.matching_field_diagnostics.some((field) => String(field.value || "").includes("Private Street")),
    false,
  );
});

test("order detail diagnostics reports when expected WowBoost Reference ID is absent", () => {
  const diagnostics = wowBoostOrderReferenceDiagnostics({
    customerOrders: [
      {
        OrderId: "105330",
        ShippingReference: "25105330N",
        ExternalOrderUuid: "not-the-ui-reference",
      },
    ],
  });

  assert.equal(diagnostics.order_object_keys[0].path, "customerOrders[0]");
  assert.equal(diagnostics.expected_reference_found, false);
  assert.deepEqual(diagnostics.expected_reference_paths, []);
  assert.ok(diagnostics.detected_candidate_reference_values.includes("not-the-ui-reference"));
});

test("extracts only top-level WowBoost order details referenceId", () => {
  const evidence = extractWowBoostOrderDetailsCommerceReference({
    orderId: "105330",
    referenceId: "4F4DA0F1-3DEE-437B-A849-32E7B25D174C",
    TransactionId: "ce1b46d8-e744-426d-8e34-b5db88d7a2e8",
    ShippingReference: "25105330N",
  });

  assert.equal(evidence.value, "4F4DA0F1-3DEE-437B-A849-32E7B25D174C");
  assert.equal(evidence.source_field, "referenceId");
});

test("order details backfill maps known WowBoost fixture order 105330", () => {
  const decision = buildWowBoostOrderDetailsReferenceBackfillDecision(
    {
      platform: "wowsuite:wowboost",
      platform_order_id: "wowboost:105330",
      order_id: "105330",
      transaction_id: "ce1b46d8-e744-426d-8e34-b5db88d7a2e8",
      commerce_reference: null,
    },
    {
      orderId: "105330",
      referenceId: "4F4DA0F1-3DEE-437B-A849-32E7B25D174C",
      orderNumber: "25105330",
      shippingReference: "25105330N",
    },
  );

  assert.equal(decision.action, "update");
  if (decision.action === "update") {
    assert.equal(decision.platform_order_id, "wowboost:105330");
    assert.equal(decision.order_id, "105330");
    assert.equal(decision.transaction_id, "ce1b46d8-e744-426d-8e34-b5db88d7a2e8");
    assert.equal(decision.commerce_reference, "4F4DA0F1-3DEE-437B-A849-32E7B25D174C");
    assert.equal(decision.source_field, "referenceId");
  }
});

test("order details backfill never substitutes transaction order or shipping fields", () => {
  const decision = buildWowBoostOrderDetailsReferenceBackfillDecision(
    {
      platform: "wowboost",
      platform_order_id: "wowboost:105330",
      order_id: "105330",
      transaction_id: "ce1b46d8-e744-426d-8e34-b5db88d7a2e8",
      commerce_reference: null,
    },
    {
      orderId: "105330",
      orderNumber: "25105330",
      TransactionId: "ce1b46d8-e744-426d-8e34-b5db88d7a2e8",
      ShippingReference: "25105330N",
    },
  );

  assert.equal(decision.action, "skip");
  if (decision.action === "skip") assert.equal(decision.reason, "missing_reference");
});

test("order details backfill does not overwrite existing commerce_reference", () => {
  const decision = buildWowBoostOrderDetailsReferenceBackfillDecision(
    {
      platform: "wowsuite",
      platform_order_id: "wowboost:105330",
      order_id: "105330",
      commerce_reference: "EXISTING-REFERENCE",
    },
    {
      referenceId: "4F4DA0F1-3DEE-437B-A849-32E7B25D174C",
    },
  );

  assert.deepEqual(decision, {
    action: "skip",
    reason: "already_populated",
    platform_order_id: "wowboost:105330",
    order_id: "105330",
    transaction_id: null,
    existing_commerce_reference: "EXISTING-REFERENCE",
  });
});

test("order details dry-run summary performs no update patches", () => {
  const decision = buildWowBoostOrderDetailsReferenceBackfillDecision(
    {
      platform: "wowboost",
      platform_order_id: "wowboost:105330",
      order_id: "105330",
      commerce_reference: null,
    },
    {
      referenceId: "4F4DA0F1-3DEE-437B-A849-32E7B25D174C",
    },
  );
  const summary = summarizeWowBoostOrderDetailsReferenceBackfillDecisions([decision], { dryRun: true });

  assert.equal(summary.scanned, 1);
  assert.equal(summary.eligible, 1);
  assert.equal(summary.updated, 0);
  assert.equal(summary.would_update, 1);
  assert.equal(summary.patches.length, 0);
  assert.equal(summary.sample[0].commerce_reference, "4F4DA0F1-3DEE-437B-A849-32E7B25D174C");
  assert.equal(summary.sample[0].source_field, "referenceId");
});

test("order details backfill enforces bounded batch size", () => {
  assert.equal(normalizeWowBoostOrderDetailsBackfillLimit(undefined), 10);
  assert.equal(normalizeWowBoostOrderDetailsBackfillLimit(1), 1);
  assert.equal(normalizeWowBoostOrderDetailsBackfillLimit(15), 15);
  assert.equal(normalizeWowBoostOrderDetailsBackfillLimit(500), 20);
  assert.equal(normalizeWowBoostOrderDetailsBackfillLimit("bad"), 10);
});

test("order details backfill preserves resume cursor at the last scanned platform order", () => {
  const rows = [
    { platform: "wowboost", platform_order_id: "wowboost:105330", order_id: "105330" },
    { platform: "wowboost", platform_order_id: "wowboost:105331", order_id: "105331" },
  ];

  assert.equal(wowBoostOrderDetailsBackfillNextCursor(rows, true), "wowboost:105331");
  assert.equal(wowBoostOrderDetailsBackfillNextCursor(rows, false), null);
});

test("order details backfill treats 429 timeout and 5xx as transient", () => {
  assert.equal(isTransientWowBoostOrderDetailsStatus(408), true);
  assert.equal(isTransientWowBoostOrderDetailsStatus(429), true);
  assert.equal(isTransientWowBoostOrderDetailsStatus(500), true);
  assert.equal(isTransientWowBoostOrderDetailsStatus(503), true);
  assert.equal(isTransientWowBoostOrderDetailsStatus(404), false);
});

test("order details lookup classifies permanent not found without retry", () => {
  assert.equal(isWowBoostOrderDetailsPermanentNotFound({ status: 404 }), true);
  assert.equal(isWowBoostOrderDetailsPermanentNotFound({ status: 200, error: "Order not found" }), true);
  assert.equal(classifyWowBoostOrderDetailsLookupFailure({
    status: 404,
    error: "Not Found",
  }), "permanent_not_found");
});

test("order details lookup keeps authentication failures blocking", () => {
  assert.equal(isWowBoostOrderDetailsAuthFailureStatus(401), true);
  assert.equal(isWowBoostOrderDetailsAuthFailureStatus(403), true);
  assert.equal(classifyWowBoostOrderDetailsLookupFailure({ status: 401 }), "auth");
  assert.equal(classifyWowBoostOrderDetailsLookupFailure({ status: 403 }), "auth");
});

test("order details lookup keeps 429 and repeated 5xx transient after retry exhaustion", () => {
  assert.equal(classifyWowBoostOrderDetailsLookupFailure({ status: 429 }), "transient");
  assert.equal(classifyWowBoostOrderDetailsLookupFailure({ status: 503 }), "transient");
  assert.equal(classifyWowBoostOrderDetailsLookupFailure({
    status: null,
    error: "fetch failed: network timeout",
  }), "transient");
  assert.equal(classifyWowBoostOrderDetailsLookupFailure({
    status: null,
    error: "Request timed out after 30000ms",
  }), "transient");
  assert.equal(classifyWowBoostOrderDetailsLookupFailure({
    status: null,
    error: "UND_ERR_HEADERS_TIMEOUT",
  }), "transient");
});

test("order details backfill excludes WowPay rows", () => {
  const decision = buildWowBoostOrderDetailsReferenceBackfillDecision(
    {
      platform: "wowsuite:wowpay",
      platform_order_id: "wowpay:105330",
      order_id: "105330",
      commerce_reference: null,
    },
    {
      referenceId: "4F4DA0F1-3DEE-437B-A849-32E7B25D174C",
    },
  );

  assert.equal(decision.action, "skip");
  if (decision.action === "skip") assert.equal(decision.reason, "not_wowboost");
});

test("order details backfill parses 429 Retry-After seconds and HTTP dates", () => {
  const now = Date.parse("2026-07-13T00:00:00Z");

  assert.equal(parseWowBoostRetryAfterMs("3", now), 3000);
  assert.equal(parseWowBoostRetryAfterMs("Mon, 13 Jul 2026 00:00:05 GMT", now), 5000);
  assert.equal(parseWowBoostRetryAfterMs("not-a-date", now), null);
});

test("order details backfill uses exponential retry delay with jitter and cap", () => {
  assert.equal(wowBoostOrderDetailsRetryDelayMs({ attempt: 1, status: 429, jitterMs: 100 }), 600);
  assert.equal(wowBoostOrderDetailsRetryDelayMs({ attempt: 3, status: 429, jitterMs: 125 }), 2125);
  assert.equal(wowBoostOrderDetailsRetryDelayMs({ attempt: 4, status: 429, retryAfterMs: 3000, jitterMs: 100 }), 4100);
  assert.equal(wowBoostOrderDetailsRetryDelayMs({ attempt: 8, status: 429, jitterMs: 999 }), 5000);
});

test("order details pacing defaults conservatively and clamps configuration", () => {
  assert.equal(normalizeWowBoostOrderDetailsPacingMs(undefined), 500);
  assert.equal(normalizeWowBoostOrderDetailsPacingMs(100), 300);
  assert.equal(normalizeWowBoostOrderDetailsPacingMs(400), 400);
  assert.equal(normalizeWowBoostOrderDetailsPacingMs(10_000), 2000);
});

test("order details cursor stops before first failed order and retries it on resume", () => {
  const rows = [
    { platform: "wowboost", platform_order_id: "wowboost:100051", order_id: "100051" },
    { platform: "wowboost", platform_order_id: "wowboost:100052", order_id: "100052" },
    { platform: "wowboost", platform_order_id: "wowboost:100053", order_id: "100053" },
  ];

  const cursor = wowBoostOrderDetailsBackfillNextCursor(rows, true, {
    inputCursor: "wowboost:100050",
    processedCount: 0,
    blocked: true,
  });

  assert.equal(cursor, "wowboost:100050");
});

test("order details cursor preserves earlier success and does not advance to later unprocessed rows", () => {
  const rows = [
    { platform: "wowboost", platform_order_id: "wowboost:100050", order_id: "100050" },
    { platform: "wowboost", platform_order_id: "wowboost:100051", order_id: "100051" },
    { platform: "wowboost", platform_order_id: "wowboost:100052", order_id: "100052" },
  ];

  const cursor = wowBoostOrderDetailsBackfillNextCursor(rows, true, {
    inputCursor: "wowboost:100049",
    processedCount: 1,
    blocked: true,
  });

  assert.equal(cursor, "wowboost:100050");
});

test("order details cursor advances past permanent 404 outcomes", () => {
  const rows = [
    { platform: "wowsuite:wowboost", platform_order_id: "wowsuite:wowboost:121438", order_id: null },
    { platform: "wowsuite:wowboost", platform_order_id: "wowsuite:wowboost:26116819", order_id: null },
    { platform: "wowsuite:wowboost", platform_order_id: "wowsuite:wowboost:26116820", order_id: null },
  ];

  const cursor = wowBoostOrderDetailsBackfillNextCursor(rows, true, {
    inputCursor: "wowsuite:wowboost:121437",
    processedCount: 3,
    blocked: false,
  });

  assert.equal(cursor, "wowsuite:wowboost:26116820");
});

test("order details summary commits successful earlier updates before a blocking failure", () => {
  const success = buildWowBoostOrderDetailsReferenceBackfillDecision(
    {
      platform: "wowboost",
      platform_order_id: "wowboost:100050",
      order_id: "100050",
      commerce_reference: null,
    },
    { referenceId: "REF-100050" },
  );
  const summary = summarizeWowBoostOrderDetailsReferenceBackfillDecisions([success]);

  assert.equal(summary.patches.length, 1);
  assert.equal(summary.patches[0].platform_order_id, "wowboost:100050");
  assert.equal(summary.patches[0].commerce_reference, "REF-100050");
});

test("order details summary updates rows before and after a permanent 404 without writing the 404 row", () => {
  const before = buildWowBoostOrderDetailsReferenceBackfillDecision(
    {
      platform: "wowboost",
      platform_order_id: "wowboost:121438",
      order_id: "121438",
      commerce_reference: null,
    },
    { referenceId: "REF-121438" },
  );
  const missing = buildWowBoostOrderDetailsReferenceBackfillDecision(
    {
      platform: "wowboost",
      platform_order_id: "wowboost:26116819",
      order_id: "26116819",
      commerce_reference: null,
    },
    null,
  );
  const after = buildWowBoostOrderDetailsReferenceBackfillDecision(
    {
      platform: "wowboost",
      platform_order_id: "wowboost:26116820",
      order_id: "26116820",
      commerce_reference: null,
    },
    { referenceId: "REF-26116820" },
  );
  const summary = summarizeWowBoostOrderDetailsReferenceBackfillDecisions([before, missing, after]);

  assert.equal(summary.missing_reference, 1);
  assert.deepEqual(summary.patches.map((patch) => patch.platform_order_id), [
    "wowboost:121438",
    "wowboost:26116820",
  ]);
});

test("order details permanent missing ID sample is capped to the most recent IDs", () => {
  const existing = Array.from({ length: 98 }, (_, index) => String(index + 1));
  const capped = capWowBoostPermanentMissingOrderIds(existing, ["99", "100", "101"], 100);

  assert.equal(capped.length, 100);
  assert.equal(capped[0], "2");
  assert.equal(capped.at(-1), "101");
});

test("order details cursor lets already-populated lower rows be skipped safely during repair", () => {
  const alreadyPopulated = buildWowBoostOrderDetailsReferenceBackfillDecision(
    {
      platform: "wowboost",
      platform_order_id: "wowboost:100050",
      order_id: "100050",
      commerce_reference: "EXISTING",
    },
    { referenceId: "NEW" },
  );
  const retryCursor = wowBoostOrderDetailsBackfillNextCursor(
    [{ platform: "wowboost", platform_order_id: "wowboost:100051", order_id: "100051" }],
    true,
    {
      inputCursor: "wowboost:100050",
      processedCount: 0,
      blocked: true,
    },
  );

  assert.equal(alreadyPopulated.action, "skip");
  if (alreadyPopulated.action === "skip") assert.equal(alreadyPopulated.reason, "already_populated");
  assert.equal(retryCursor, "wowboost:100050");
});

test("order details date range scans only rows on or after 2026-04-01", () => {
  const range = normalizeWowBoostOrderDetailsBackfillDateRange("2026-04-01", "2026-07-13");
  assert.equal(range.ok, true);
  if (!range.ok) return;

  const rows = filterWowBoostOrderDetailsBackfillRowsForScan(
    [
      {
        platform: "wowboost",
        platform_order_id: "wowboost:100000",
        order_id: "100000",
        order_ts: "2026-03-31T23:59:59.999Z",
        commerce_reference: null,
      },
      {
        platform: "wowboost",
        platform_order_id: "wowboost:100001",
        order_id: "100001",
        order_ts: "2026-04-01T00:00:00.000Z",
        commerce_reference: null,
      },
    ],
    { range, cursor: { current_platform: "wowboost", platform_order_id: null }, limit: 20 },
  );

  assert.deepEqual(rows.map((row) => row.platform_order_id), ["wowboost:100001"]);
});

test("order details date range treats to date as inclusive through next-day exclusive", () => {
  const range = normalizeWowBoostOrderDetailsBackfillDateRange("2026-04-01", "2026-07-13");
  assert.equal(range.ok, true);
  if (!range.ok) return;

  assert.equal(wowBoostOrderDetailsBackfillRowMatchesDateRange({
    platform: "wowboost",
    platform_order_id: "wowboost:100010",
    order_id: "100010",
    order_ts: "2026-07-13T23:59:59.999Z",
  }, range), true);
  assert.equal(wowBoostOrderDetailsBackfillRowMatchesDateRange({
    platform: "wowboost",
    platform_order_id: "wowboost:100011",
    order_id: "100011",
    order_ts: "2026-07-14T00:00:00.000Z",
  }, range), false);
});

test("order details date range excludes rows outside range and WowPay rows", () => {
  const range = normalizeWowBoostOrderDetailsBackfillDateRange("2026-04-01", "2026-07-13");
  assert.equal(range.ok, true);
  if (!range.ok) return;

  const rows = filterWowBoostOrderDetailsBackfillRowsForScan(
    [
      {
        platform: "wowsuite:wowpay",
        platform_order_id: "wowpay:100020",
        order_id: "100020",
        order_ts: "2026-05-01T00:00:00.000Z",
        commerce_reference: null,
      },
      {
        platform: "wowsuite:wowboost",
        platform_order_id: "wowboost:100021",
        order_id: "100021",
        order_ts: "2026-08-01T00:00:00.000Z",
        commerce_reference: null,
      },
      {
        platform: "wowsuite",
        platform_order_id: "wowboost:100022",
        order_id: "100022",
        order_ts: "2026-05-01T00:00:00.000Z",
        commerce_reference: null,
      },
    ],
    { range, cursor: { current_platform: "wowsuite", platform_order_id: null }, limit: 20 },
  );

  assert.deepEqual(rows.map((row) => row.platform_order_id), ["wowboost:100022"]);
});

test("order details scan applies cursor and date filter together", () => {
  const range = normalizeWowBoostOrderDetailsBackfillDateRange("2026-04-01", "2026-07-13");
  assert.equal(range.ok, true);
  if (!range.ok) return;

  const rows = filterWowBoostOrderDetailsBackfillRowsForScan(
    [
      {
        platform: "wowboost",
        platform_order_id: "wowboost:100049",
        order_id: "100049",
        order_ts: "2026-05-01T00:00:00.000Z",
        commerce_reference: null,
      },
      {
        platform: "wowboost",
        platform_order_id: "wowboost:100051",
        order_id: "100051",
        order_ts: "2026-05-01T00:00:00.000Z",
        commerce_reference: null,
      },
      {
        platform: "wowboost",
        platform_order_id: "wowboost:100052",
        order_id: "100052",
        order_ts: "2026-03-31T23:59:59.999Z",
        commerce_reference: null,
      },
    ],
    { range, cursor: "wowboost:100050", limit: 20 },
  );

  assert.deepEqual(rows.map((row) => row.platform_order_id), ["wowboost:100051"]);
});

test("order details scan includes legacy WowBoost rows with null order_id", () => {
  const range = normalizeWowBoostOrderDetailsBackfillDateRange("2026-04-01", "2026-07-13");
  assert.equal(range.ok, true);
  if (!range.ok) return;

  const rows = filterWowBoostOrderDetailsBackfillRowsForScan(
    [
      {
        platform: "wowsuite:wowboost",
        platform_order_id: "wowsuite:wowboost:117445",
        order_id: null,
        order_ts: "2026-05-01T00:00:00.000Z",
        commerce_reference: null,
      },
    ],
    {
      range,
      cursor: {
        current_platform: "wowsuite:wowboost",
        platform_order_id: null,
      },
      limit: 20,
    },
  );

  assert.deepEqual(rows.map((row) => row.platform_order_id), ["wowsuite:wowboost:117445"]);
});

test("order details resume preserves persisted date range instead of a new form range", () => {
  const persisted = normalizeWowBoostOrderDetailsBackfillDateRange("2026-04-01", "2026-07-13");
  const newForm = normalizeWowBoostOrderDetailsBackfillDateRange("2026-01-01", "2026-12-31");
  assert.equal(persisted.ok, true);
  assert.equal(newForm.ok, true);
  if (!persisted.ok || !newForm.ok) return;

  const rows = filterWowBoostOrderDetailsBackfillRowsForScan(
    [
      {
        platform: "wowboost",
        platform_order_id: "wowboost:100060",
        order_id: "100060",
        order_ts: "2026-02-01T00:00:00.000Z",
        commerce_reference: null,
      },
      {
        platform: "wowboost",
        platform_order_id: "wowboost:100061",
        order_id: "100061",
        order_ts: "2026-04-02T00:00:00.000Z",
        commerce_reference: null,
      },
    ],
    { range: persisted, limit: 20 },
  );

  assert.equal(newForm.from, "2026-01-01");
  assert.deepEqual(rows.map((row) => row.platform_order_id), ["wowboost:100061"]);
});

test("order details date range rejects missing invalid and reversed dates", () => {
  assert.deepEqual(normalizeWowBoostOrderDetailsBackfillDateRange("", "2026-07-13"), {
    ok: false,
    error: "missing_date_range",
    message: "from and to are required in YYYY-MM-DD format",
  });
  assert.deepEqual(normalizeWowBoostOrderDetailsBackfillDateRange("2026-02-31", "2026-07-13"), {
    ok: false,
    error: "invalid_date_format",
    message: "from and to must be valid YYYY-MM-DD dates",
  });
  assert.deepEqual(normalizeWowBoostOrderDetailsBackfillDateRange("2026-07-14", "2026-07-13"), {
    ok: false,
    error: "invalid_date_order",
    message: "from must be on or before to",
  });
});

test("order details scan plan matches the partial backfill index shape", () => {
  const range = normalizeWowBoostOrderDetailsBackfillDateRange("2026-04-01", "2026-07-13");
  assert.equal(range.ok, true);
  if (!range.ok) return;

  const cursor = {
    current_platform: "wowsuite:wowboost",
    platform_order_id: "wowsuite:wowboost:117445",
  };
  const plan = wowBoostOrderDetailsBackfillScanPlan({ range, cursor, limit: 20 });

  assert.equal(plan.table, "platform_orders");
  assert.deepEqual(plan.indexed_columns, ["platform", "order_ts", "platform_order_id"]);
  assert.equal(plan.current_platform, "wowsuite:wowboost");
  assert.equal(plan.order_ts_gte, "2026-04-01T00:00:00.000Z");
  assert.equal(plan.order_ts_lt, "2026-07-14T00:00:00.000Z");
  assert.equal(plan.platform_order_id_gt, "wowsuite:wowboost:117445");
  assert.equal(plan.order_by, "platform_order_id");
  assert.equal(plan.limit, 21);
  assert.equal(plan.count_exact, false);
  assert.equal(plan.filters.platform_order_id_not_null, true);
  assert.equal(plan.filters.commerce_reference_blank_or_null, true);
});

test("order details scan plan omits exact counts for normal continuation calls", () => {
  const range = normalizeWowBoostOrderDetailsBackfillDateRange("2026-04-01", "2026-07-13");
  assert.equal(range.ok, true);
  if (!range.ok) return;

  const plan = wowBoostOrderDetailsBackfillScanPlan({
    range,
    cursor: serializeWowBoostOrderDetailsBackfillCursor({
      current_platform: "wowboost",
      platform_order_id: "wowboost:100050",
    }),
    limit: 10,
  });

  assert.equal(plan.count_exact, false);
  assert.equal(plan.current_platform, "wowboost");
  assert.equal(plan.platform_order_id_gt, "wowboost:100050");
});

test("order details compound cursor preserves platform and platform_order_id", () => {
  const cursor = {
    current_platform: "wowsuite",
    platform_order_id: "wowboost:999999",
  };
  const token = serializeWowBoostOrderDetailsBackfillCursor(cursor);

  assert.deepEqual(parseWowBoostOrderDetailsBackfillCursor(token), cursor);
  assert.deepEqual(parseWowBoostOrderDetailsBackfillCursor("wowsuite:wowboost:117445"), {
    current_platform: "wowsuite:wowboost",
    platform_order_id: "wowsuite:wowboost:117445",
  });
});

test("order details alias scanner advances through all WowBoost aliases", () => {
  assert.equal(nextWowBoostOrderDetailsBackfillPlatform("wowboost"), "wowsuite:wowboost");
  assert.equal(nextWowBoostOrderDetailsBackfillPlatform("wowsuite:wowboost"), "wowsuite");
  assert.equal(nextWowBoostOrderDetailsBackfillPlatform("wowsuite"), null);
});

test("order details scan statement timeout is recognized and cursor can be preserved", () => {
  const cursor = {
    current_platform: "wowboost",
    platform_order_id: "wowboost:100050",
  };

  assert.equal(isWowBoostOrderDetailsBackfillStatementTimeout({
    code: "57014",
    message: "canceling statement due to statement timeout",
  }), true);
  assert.equal(serializeWowBoostOrderDetailsBackfillCursor(cursor), "{\"current_platform\":\"wowboost\",\"platform_order_id\":\"wowboost:100050\"}");
});

test("order details lookup uses non-empty numeric order_id first", () => {
  assert.deepEqual(resolveWowBoostOrderDetailsLookupOrderId({
    platform: "wowsuite:wowboost",
    platform_order_id: "wowsuite:wowboost:117445",
    order_id: "105330",
  }), {
    value: "105330",
    source_field: "order_id",
  });
});

test("order details lookup parses numeric order ID from current WowBoost platform_order_id formats", () => {
  assert.deepEqual(resolveWowBoostOrderDetailsLookupOrderId({
    platform: "wowboost",
    platform_order_id: "wowboost:117445",
    order_id: null,
  }), {
    value: "117445",
    source_field: "platform_order_id",
  });
});

test("legacy wowsuite:wowboost null order_id suffix is classified as legacy order number", () => {
  assert.deepEqual(resolveWowBoostOrderDetailsLookupOrderId({
    platform: "wowsuite:wowboost",
    platform_order_id: "wowsuite:wowboost:25105330",
    order_id: "",
  }), {
    value: "",
    source_field: "legacy_order_number",
  });

  assert.deepEqual(extractWowBoostLegacyOrderNumberEvidence({
    platform: "wowsuite:wowboost",
    platform_order_id: "wowsuite:wowboost:25105330",
    order_id: null,
  }), {
    legacy_order_number: "25105330",
    platform_order_id: "wowsuite:wowboost:25105330",
    source_field: "platform_order_id",
    source_value: "wowsuite:wowboost:25105330",
  });
});

test("current WowBoost rows are unaffected and WowPay rows are not legacy mapped", () => {
  assert.deepEqual(resolveWowBoostOrderDetailsLookupOrderId({
    platform: "wowboost",
    platform_order_id: "wowboost:105330",
    order_id: null,
  }), {
    value: "105330",
    source_field: "platform_order_id",
  });

  assert.deepEqual(extractWowBoostLegacyOrderNumberEvidence({
    platform: "wowsuite:wowpay",
    platform_order_id: "wowsuite:wowpay:25105330",
    order_id: null,
  }), {
    legacy_order_number: "",
    platform_order_id: "wowsuite:wowpay:25105330",
    source_field: "platform_order_id",
    source_value: "wowsuite:wowpay:25105330",
  });
});

test("order details lookup rejects nonnumeric extracted IDs before API calls", () => {
  assert.deepEqual(resolveWowBoostOrderDetailsLookupOrderId({
    platform: "wowboost",
    platform_order_id: "wowboost:not-numeric",
    order_id: null,
  }), {
    value: "",
    source_field: "platform_order_id",
  });

  assert.deepEqual(resolveWowBoostOrderDetailsLookupOrderId({
    platform: "wowboost",
    platform_order_id: "wowboost:117445",
    order_id: "abc117445",
  }), {
    value: "",
    source_field: "order_id",
  });
});

test("order details backfill updates legacy wowsuite:wowboost row with null order_id", () => {
  const decision = buildWowBoostOrderDetailsReferenceBackfillDecision(
    {
      platform: "wowsuite:wowboost",
      platform_order_id: "wowsuite:wowboost:117445",
      order_id: null,
      transaction_id: "legacy-txn",
      commerce_reference: null,
      order_ts: "2026-05-01T00:00:00.000Z",
    },
    {
      referenceId: "4F4DA0F1-3DEE-437B-A849-32E7B25D174C",
    },
  );

  assert.equal(decision.action, "update");
  if (decision.action === "update") {
    assert.equal(decision.platform_order_id, "wowsuite:wowboost:117445");
    assert.equal(decision.order_id, null);
    assert.equal(decision.transaction_id, "legacy-txn");
    assert.equal(decision.commerce_reference, "4F4DA0F1-3DEE-437B-A849-32E7B25D174C");
  }
});
