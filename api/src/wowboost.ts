export type WowBoostCommerceReferenceEvidence = {
  value: string;
  source_field: string;
};

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
