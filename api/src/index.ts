// src/index.ts
// TraceKit API Worker (Cloudflare Workers + Supabase)
// Integrations: CheckoutChamp/Konnektive + WOWSuite (WowBoost + WowPay umbrella)

import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_SHOPIFY_API_VERSION,
  SHOPIFY_CONNECTION_TEST_QUERY,
  SHOPIFY_ORDERS_QUERY,
  buildShopifyLedgerEventsFromOrder,
  buildShopifyOrderSearchQuery,
  normalizeShopifyApiVersion,
  normalizeShopifyOrderForPlatformOrder,
  normalizeShopifyShopDomain,
  shopifyAdminGraphqlUrl,
} from "./shopify";
import {
  aggregateDailyProfitConversions,
  aggregateProfitConversions,
  conversionMatchesDailyKey,
  conversionMatchesOrderKey,
  profitDailyKeyFromConversion,
  profitDailyKeyId,
  profitOrderKeyFromConversion,
  profitOrderKeyId,
  sumProfitTotals,
  toProfitDailyRollupRow,
  toProfitOrderRollupRow,
  type ProfitConversionRow,
  type ProfitDailyKey,
  type ProfitOrderKey,
} from "./profit";
import {
  CONNECTOR_RUNTIME_DURABLE_HEARTBEAT_MIN_INTERVAL_MS,
  appendConnectorRuntimeTaskDiagnosticSample,
  appendConnectorRuntimeTaskDiagnostic,
  classifyConnectorRuntimeFailure,
  compactConnectorRuntimeJobPayload,
  connectorRuntimeErrorSummary,
  connectorRuntimeFinalizeFailureProgress,
  connectorRuntimeFinalizeSuccessProgress,
  connectorRuntimeMetadata,
  connectorRuntimeNextRunAt,
  connectorRuntimeRerunFinalizeProgress,
  connectorRuntimeRetryDelayMs,
  connectorRuntimeTaskDedupeKey,
  connectorRuntimeTaskMessage,
  createConnectorRuntimeProgress,
  isConnectorRuntimeTaskStale,
  isActiveConnectorRuntimeJobStatus,
  isConnectorRuntimeV1Job,
  isTerminalConnectorRuntimeJobStatus,
  mergeConnectorRuntimeCounters,
  normalizeConnectorRuntimeJobStatus,
  shouldWriteConnectorRuntimeDurableHeartbeat,
  type ConnectorRuntimeProgress,
  type ConnectorRuntimeTaskPlan,
} from "./connector-runtime";
import {
  adaptConnectorResponse,
  buildPublicImportJobPayload,
  cancelImportProgress,
  compactWowBoostBackfillProgress,
  createInitialImportProgress,
  failImportProgress,
  isActiveImportStatus,
  mergeImportProgress,
  normalizeImportStatus,
  resumeImportProgress,
  shouldBlockDuplicateImport,
  type ImportChunkResponse,
  type ImportJobStatus,
  type ImportProgressState,
} from "./import-progress";
import {
  compactIdentityIdentifier,
  compactIdentityPerson,
  createIdentityService,
  createSupabaseIdentityRepository,
  resolveIdentityForSourceRecord,
  withIdentityOperationTimeout,
  type IdentityDiagnostics,
  type IdentityInputIdentifier,
  type IdentityResolutionEvent,
} from "./identity-service";
import {
  IDENTITY_BACKFILL_CONNECTOR_ID,
  IDENTITY_BACKFILL_DEFAULT_BATCH_SIZE,
  IDENTITY_BACKFILL_DISCOVERY_SELECT,
  IDENTITY_BACKFILL_JOB_TYPE,
  IDENTITY_BACKFILL_RESOLVE_SELECT,
  IDENTITY_BACKFILL_RESOLVE_TASK_BUDGET_MS,
  IDENTITY_BACKFILL_TASK_TYPES,
  createIdentityBackfillDiscoveryState,
  dateRangeToTimestamps,
  extractIdentityEvidenceFromPlatformOrder,
  hasIdentityEvidence,
  identityBackfillDiscoverySummary,
  identityBackfillDryRunFinalizeCounts,
  identityBackfillFinalizeStatus,
  identityBackfillResolveContinuationDedupeKey,
  identityBackfillResolveDedupeKey,
  identityBackfillResolveRemainingIds,
  isSupportedIdentityBackfillPlatformOrder,
  markIdentityBackfillPlatformDiscovery,
  mergeIdentityBackfillResolveMetricMetadata,
  normalizeIdentityBackfillDryRunMetadata,
  normalizeIdentityBackfillDryRunResolveSummary,
  nextIdentityBackfillPlatform,
  normalizeIdentityBackfillBatchSize,
  normalizeIdentityBackfillRequest,
  parseIdentityBackfillCursor,
  previewIdentityResolutionReadOnly,
  serializeIdentityBackfillCursor,
  shouldCheckpointIdentityBackfillResolveBatch,
} from "./identity-backfill-runtime";
import { matchIdentityRoute } from "./identity-routes";
import {
  PaypalApiError,
  buildPaypalLedgerEventsFromRecord,
  chunkPaypalRecords,
  collectPaypalChunkLookupKeys,
  dedupePaypalPlatformOrderRows,
  extractPaypalAccountId,
  fetchPaypalTransactionPage,
  fetchPaypalAccessToken,
  filterPaypalDuplicateCommerceSaleEvents,
  maskPaypalClientId,
  isPaypalTransientDatabaseError,
  normalizePaypalCredentialMetadata,
  normalizePaypalEnvironment,
  normalizePaypalPaymentTransactionRow,
  normalizePaypalPlatformOrderRow,
  paypalParentTransactionIds,
  paypalRecordMatchingFields,
  paypalBaseUrlForEnvironment,
  paypalReconciliationLookupWarning,
  paypalTransactionDetails,
  reconcilePaypalPaymentTransactionByCommerceReference,
  reconcilePaypalRecordToCommerceOrder,
  splitPaypalDateRange,
  stablePaypalConnectorId,
  stablePaypalRecordId,
  summarizeDeferredPaypalPhoneMatching,
  testPaypalConnection,
  type PaypalCapabilityStatus,
  type PaypalCommerceOrderCandidate,
  type PaypalCredentialMetadata,
  type PaypalChunkLookupKeys,
  type PaypalMatchedTransaction,
  type PaypalReconciliationResult,
} from "./paypal";
import {
  WOWBOOST_ORDER_REFERENCE_DEBUG_EXPECTED,
  WOWBOOST_PLATFORM_VALUES,
  buildWowBoostOrderNumberToOrderIdMap,
  buildWowBoostOrderDetailsReferenceBackfillDecision,
  capWowBoostPermanentMissingOrderIds,
  classifyWowBoostOrderDetailsLookupFailure,
  extractWowBoostCommerceReferenceEvidence,
  extractWowBoostOrderDetailsCommerceReference,
  extractWowBoostLegacyOrderNumberEvidence,
  isTransientWowBoostOrderDetailsStatus,
  appendWowBoostRuntimePageFingerprint,
  normalizeWowBoostCommerceReferenceExportRow,
  normalizeWowBoostOrderDetailsBackfillDateRange,
  normalizeWowBoostOrderDetailsPacingMs,
  normalizeWowBoostRuntimeMaxExportPages,
  parseWowBoostRetryAfterMs,
  parseWowBoostOrderDetailsBackfillCursor,
  normalizeWowBoostOrderDetailsBackfillLimit,
  normalizeWowBoostLegacyExportMaxElapsedMs,
  normalizeWowBoostLegacyMaxExportPagesPerInvocation,
  isWowBoostOrderDetailsBackfillStatementTimeout,
  nextWowBoostOrderDetailsBackfillPlatform,
  resolveWowBoostLegacyOrderNumber,
  resolveWowBoostOrderDetailsLookupOrderId,
  scanWowBoostLegacyOrderNumberExportPages,
  serializeWowBoostOrderDetailsBackfillCursor,
  summarizeWowBoostOrderDetailsReferenceBackfillDecisions,
  wowBoostExportContinuationTokenWithDateRange,
  wowBoostLegacyExportPageForRequest,
  wowBoostLegacyExportPagingProgress,
  wowBoostLegacyOrderNumberDeferredWarning,
  wowBoostExportPageFingerprint,
  wowBoostOrderDetailsBackfillScanPlan,
  wowBoostOrderDetailsRetryDelayMs,
  wowBoostOrderDetailsBackfillNextCursor,
  wowBoostOrderReferenceDiagnostics,
  wowBoostRuntimeRepeatedPageDetected,
  wowBoostRuntimeStagingStopDecision,
  WOWBOOST_RUNTIME_DEFAULT_MAX_EXPORT_PAGES,
  WOWBOOST_ORDER_DETAILS_RETRY_MAX_ATTEMPTS,
  type WowBoostOrderNumberToOrderIdMapping,
  type WowBoostOrderDetailsReferenceBackfillDecision,
  type WowBoostOrderDetailsReferenceBackfillRow,
} from "./wowboost";
type LedgerType =
  | "sale"
  | "refund"
  | "chargeback"
  | "chargeback_fee"
  | "processor_fee"
  | "bank_fee"
  | "shipping_cost"
  | "tax"
  | "cogs"
  | "affiliate_payout"
  | "ad_spend"
  | "reversal"
  | "adjustment";

const NEGATIVE_LEDGER_TYPES: LedgerType[] = [
  "refund",
  "chargeback",
  "chargeback_fee",
  "processor_fee",
  "bank_fee",
  "shipping_cost",
  "cogs",
  "affiliate_payout",
  "ad_spend",
  "reversal",
];

function normalizeLedgerAmount(ledgerType: LedgerType, amountCents: number) {
  return NEGATIVE_LEDGER_TYPES.includes(ledgerType)
    ? -Math.abs(amountCents)
    : Math.abs(amountCents);
}

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  DEFAULT_WOWSUITE_AUTH_BASE?: string;
  DEFAULT_WOWSUITE_EXPORT_BASE?: string;
  INTEGRATIONS_ENC_KEY: string;
  TK_SECRET_KEY?: string;
  DEFAULT_CC_BASE?: string;
  IDENTITY_WOWBOOST_RESOLUTION_ENABLED?: string;
  IDENTITY_WOWBOOST_MAX_ROWS_PER_PAGE?: string;
  TRACEKIT_BUILD_LABEL?: string;
  TRACEKIT_BUILD_VERSION?: string;
  TRACEKIT_GIT_COMMIT?: string;
  wowboost_imports?: Queue<any>;
};

type RunImportArgs = {
  from: string;
  to: string;
  filter?: string | null;
  pageSize?: number;
  page?: number;
  windowIndex?: number;
  chunkSize?: number;
  maxChunks?: number;
  debug?: boolean;
};

const DEFAULT_CC_BASE = "https://api.checkoutchamp.com";
const DEFAULT_WOWSUITE_AUTH_BASE = "https://public-api.tryemanagecrm.com";
const DEFAULT_WOWSUITE_EXPORT_BASE = "https://ecrm-public-api-prod.azurewebsites.net";
const TRACEKIT_SERVICE_NAME = "tracekit-api";
const TRACEKIT_BUILD_LABEL = "identity-service-v1-route-fingerprint";
const TRACEKIT_BUILD_VERSION = "identity-route-fix-2026-07-17";

function json(data: any, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "Content-Type, Authorization, X-TK-Secret",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      ...extraHeaders,
    },
  });
}

function toCents(value: unknown): number {
  const n = Number(value ?? 0);
  return Math.round(n * 100);
}

function detectLedgerType(payload: any): LedgerType {
  const raw = String(
    payload.ledger_type ||
      payload.type ||
      payload.event ||
      payload.status ||
      ""
  ).toLowerCase();

  if (raw.includes("chargeback_fee")) return "chargeback_fee";
  if (raw.includes("processor_fee")) return "processor_fee";
  if (raw.includes("bank_fee")) return "bank_fee";
  if (raw.includes("chargeback") || raw.includes("dispute")) return "chargeback";
  if (raw.includes("refund")) return "refund";
  if (raw.includes("reversal")) return "reversal";
  if (raw.includes("adjustment")) return "adjustment";

  return "sale";
}

function normalizeLedgerDimension(
  value: unknown,
  fallback = "unknown"
): string {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || fallback;
}

function normalizeEventSource(value: unknown): string {
  return normalizeLedgerDimension(value);
}

function normalizeIngestionMethod(value: unknown): string {
  return normalizeLedgerDimension(value);
}

function normalizeConnectorId(value: unknown): string {
  return normalizeLedgerDimension(value);
}

function corsPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "Content-Type, Authorization, X-TK-Secret",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-max-age": "86400",
    },
  });
}

function safeJsonParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

async function readTextSafe(res: Response) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (e: any) {
    if (String(e?.name || "").toLowerCase() === "aborterror" || String(e?.message || "").toLowerCase().includes("timeout")) {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}


async function readJsonBody(req: Request) {
  return (await req.json().catch(() => ({}))) as any;
}

function parseYmd(v: string | null): Date | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v).trim());
  if (!m) return null;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0));
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function addDaysUTC(d: Date, days: number) {
  return new Date(d.getTime() + days * 86400000);
}

function isoYmdUTC(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function fmtCcMdYy(d: Date) {
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCFullYear()).slice(-2)}`;
}

function normStatusUpper(s: any) {
  return String(s ?? "").trim().toUpperCase();
}

function parseMoneyMaybe(v: any) {
  const s = String(v ?? "").replace(/[^0-9.\-]/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function getSupabase(env: Env) {
  const url = String(env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

type SupabaseClientAny = ReturnType<typeof getSupabase>;

function getIdentityService(env: Env, diagnostics?: IdentityDiagnostics | null) {
  return createIdentityService(createSupabaseIdentityRepository(getSupabase(env), diagnostics), diagnostics);
}

function compactIdentityMetadata(metadata: any) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  const compact: Record<string, any> = {};
  for (const [key, value] of Object.entries(metadata).slice(0, 12)) {
    if (value === null || value === undefined) compact[key] = value;
    else if (typeof value === "string") compact[key] = value.length > 160 ? `${value.slice(0, 157)}...` : value;
    else if (typeof value === "number" || typeof value === "boolean") compact[key] = value;
    else if (Array.isArray(value)) compact[key] = value.slice(0, 10);
    else compact[key] = "[object]";
  }
  return compact;
}

function compactIdentityEvent(event: IdentityResolutionEvent) {
  const inputIdentifiers = Array.isArray(event.input_identifiers) ? event.input_identifiers : [];
  return {
    id: event.id || null,
    workspace_id: event.workspace_id,
    person_id: event.person_id || null,
    candidate_person_ids: Array.isArray(event.candidate_person_ids) ? event.candidate_person_ids.slice(0, 10) : [],
    input_identifiers: inputIdentifiers.slice(0, 12).map((identifier: any) => ({
      identifier_type: identifier?.identifier_type || null,
      normalized_hash: identifier?.normalized_hash || null,
      valid: Boolean(identifier?.valid),
      warnings: Array.isArray(identifier?.warnings) ? identifier.warnings.slice(0, 5) : [],
    })),
    resolution_action: event.resolution_action,
    resolution_reason: event.resolution_reason,
    confidence: event.confidence ?? null,
    source_platform: event.source_platform || null,
    source_record_type: event.source_record_type || null,
    source_record_id: event.source_record_id || null,
    connector_job_id: event.connector_job_id || null,
    created_at: event.created_at || null,
    metadata: compactIdentityMetadata(event.metadata),
  };
}

function identityLimit(value: unknown, fallback = 25) {
  return Math.max(1, Math.min(100, Number(value || fallback) || fallback));
}

function identityOffset(value: unknown) {
  return Math.max(0, Number(value || 0) || 0);
}

function identityWorkspace(value: unknown) {
  return String(value || "default").trim() || "default";
}

function buildFingerprint(env: Env) {
  const gitCommit = String(env.TRACEKIT_GIT_COMMIT || "").trim();
  return {
    service: TRACEKIT_SERVICE_NAME,
    build_label: String(env.TRACEKIT_BUILD_LABEL || TRACEKIT_BUILD_LABEL).trim() || TRACEKIT_BUILD_LABEL,
    build_version: String(env.TRACEKIT_BUILD_VERSION || TRACEKIT_BUILD_VERSION).trim() || TRACEKIT_BUILD_VERSION,
    git_commit: gitCommit || null,
    identity_service_v1: true,
  };
}

const PROFIT_CONVERSION_SELECT =
  "workspace_id,order_id,connector_id,currency,platform,event_source,ledger_type,amount,occurred_at,transaction_id,parent_transaction_id,status,reason,raw,meta";

const PROFIT_ROLLUP_SELECT =
  "workspace_id,day,platform,event_source,connector_id,currency,gross_revenue,refunds,chargebacks,chargeback_fees,processor_fees,bank_fees,shipping_cost,tax,cogs,affiliate_payout,ad_spend,reversals,adjustments,net_revenue,total_costs,net_profit,profit_margin_pct,order_count,event_count";

function parseDateFilter(value: string | null) {
  if (!value) return null;
  const date = parseYmd(value);
  return date ? isoYmdUTC(date) : null;
}

function dayStartIso(day: string) {
  const date = parseYmd(day);
  if (!date) throw new Error(`Invalid day: ${day}`);
  return date.toISOString();
}

function nextDayStartIso(day: string) {
  const date = parseYmd(day);
  if (!date) throw new Error(`Invalid day: ${day}`);
  return addDaysUTC(date, 1).toISOString();
}

type DatabaseCallStats = {
  reads: number;
  writes: number;
};

async function selectAllProfitConversionsForOrder(supabase: SupabaseClientAny, key: ProfitOrderKey, stats?: DatabaseCallStats) {
  const rows: ProfitConversionRow[] = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    if (stats) stats.reads += 1;
    const { data, error } = await supabase
      .from("conversions")
      .select(PROFIT_CONVERSION_SELECT)
      .eq("workspace_id", key.workspaceId)
      .eq("order_id", key.orderId)
      .order("occurred_at", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`Profit order conversion read failed: ${error.message}`);

    const pageRows = ((data || []) as ProfitConversionRow[]).filter((row) =>
      conversionMatchesOrderKey(row, key)
    );
    rows.push(...pageRows);

    if (!data || data.length < pageSize) break;
  }

  return rows;
}

async function selectAllProfitConversionsForDay(supabase: SupabaseClientAny, key: ProfitDailyKey, stats?: DatabaseCallStats) {
  const rows: ProfitConversionRow[] = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    if (stats) stats.reads += 1;
    const { data, error } = await supabase
      .from("conversions")
      .select(PROFIT_CONVERSION_SELECT)
      .eq("workspace_id", key.workspaceId)
      .gte("occurred_at", dayStartIso(key.day))
      .lt("occurred_at", nextDayStartIso(key.day))
      .order("occurred_at", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`Profit daily conversion read failed: ${error.message}`);

    const pageRows = ((data || []) as ProfitConversionRow[]).filter((row) =>
      conversionMatchesDailyKey(row, key)
    );
    rows.push(...pageRows);

    if (!data || data.length < pageSize) break;
  }

  return rows;
}

function uniqueProfitOrderKeys(rows: ProfitConversionRow[]) {
  const byId = new Map<string, ProfitOrderKey>();

  for (const row of rows) {
    const key = profitOrderKeyFromConversion(row);
    if (key) byId.set(profitOrderKeyId(key), key);
  }

  return Array.from(byId.values());
}

function uniqueProfitDailyKeys(rows: ProfitConversionRow[]) {
  const byId = new Map<string, ProfitDailyKey>();

  for (const row of rows) {
    const key = profitDailyKeyFromConversion(row);
    if (key) byId.set(profitDailyKeyId(key), key);
  }

  return Array.from(byId.values());
}

async function refreshProfitOrderRollup(supabase: SupabaseClientAny, key: ProfitOrderKey, stats?: DatabaseCallStats) {
  const rows = await selectAllProfitConversionsForOrder(supabase, key, stats);
  if (!rows.length) return { refreshed: false, rows_scanned: 0, rollup: null };

  const rollup = toProfitOrderRollupRow(key, aggregateProfitConversions(rows));
  if (stats) stats.reads += 1;
  const { data: existing, error: existingError } = await supabase
    .from("profit_order_rollups")
    .select("id")
    .eq("workspace_id", rollup.workspace_id)
    .eq("order_id", rollup.order_id)
    .eq("connector_id", rollup.connector_id)
    .eq("currency", rollup.currency)
    .limit(1)
    .maybeSingle();

  if (existingError) throw new Error(`Profit order rollup lookup failed: ${existingError.message}`);

  if (existing?.id) {
    if (stats) stats.writes += 1;
    const { data, error } = await supabase
      .from("profit_order_rollups")
      .update(rollup)
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) throw new Error(`Profit order rollup update failed: ${error.message}`);

    return { refreshed: true, rows_scanned: rows.length, rollup: data };
  }

  if (stats) stats.writes += 1;
  const { data, error } = await supabase
    .from("profit_order_rollups")
    .insert(rollup)
    .select("*")
    .single();

  if (error) throw new Error(`Profit order rollup insert failed: ${error.message}`);

  return { refreshed: true, rows_scanned: rows.length, rollup: data };
}

async function refreshProfitDailyRollup(supabase: SupabaseClientAny, key: ProfitDailyKey, stats?: DatabaseCallStats) {
  const rows = await selectAllProfitConversionsForDay(supabase, key, stats);
  if (!rows.length) return { refreshed: false, rows_scanned: 0, rollup: null };

  const rollup = toProfitDailyRollupRow(key, aggregateDailyProfitConversions(rows));
  if (stats) stats.writes += 1;
  const { data, error } = await supabase
    .from("profit_daily_rollups")
    .upsert(rollup, { onConflict: "workspace_id,day,connector_id,currency" })
    .select("*")
    .single();

  if (error) throw new Error(`Profit daily rollup upsert failed: ${error.message}`);

  return { refreshed: true, rows_scanned: rows.length, rollup: data };
}

async function refreshProfitRollupsForInsertedRows(env: Env, insertedRows: ProfitConversionRow[], options: { maxOrderKeys?: number; maxDailyKeys?: number; deferMessage?: string } = {}) {
  const supabase = getSupabase(env);
  const orderKeys = uniqueProfitOrderKeys(insertedRows);
  const dailyKeys = uniqueProfitDailyKeys(insertedRows);
  const warnings: string[] = [];
  const stats: DatabaseCallStats = { reads: 0, writes: 0 };
  let ordersRefreshed = 0;
  let dailyRefreshed = 0;

  if (
    (options.maxOrderKeys !== undefined && orderKeys.length > options.maxOrderKeys) ||
    (options.maxDailyKeys !== undefined && dailyKeys.length > options.maxDailyKeys)
  ) {
    return {
      orders_refreshed: 0,
      daily_refreshed: 0,
      warnings: [
        options.deferMessage ||
          `Profit rollup refresh deferred for ${orderKeys.length} order keys and ${dailyKeys.length} daily keys.`,
      ],
      database_reads: 0,
      database_writes: 0,
    };
  }

  for (const key of orderKeys) {
    try {
      const result = await refreshProfitOrderRollup(supabase, key, stats);
      if (result.refreshed) ordersRefreshed += 1;
    } catch (e: any) {
      warnings.push(`order ${key.orderId}: ${e?.message || String(e)}`);
    }
  }

  for (const key of dailyKeys) {
    try {
      const result = await refreshProfitDailyRollup(supabase, key, stats);
      if (result.refreshed) dailyRefreshed += 1;
    } catch (e: any) {
      warnings.push(`day ${key.day}: ${e?.message || String(e)}`);
    }
  }

  return {
    orders_refreshed: ordersRefreshed,
    daily_refreshed: dailyRefreshed,
    warnings,
    database_reads: stats.reads,
    database_writes: stats.writes,
  };
}

async function selectProfitDailyRollups(
  supabase: SupabaseClientAny,
  filters: {
    workspace_id?: string | null;
    from?: string | null;
    to?: string | null;
    connector_id?: string | null;
    platform?: string | null;
    event_source?: string | null;
    currency?: string | null;
  },
) {
  const rows: any[] = [];
  const pageSize = 1000;
  const workspaceId = String(filters.workspace_id || "default").trim() || "default";
  const from = parseDateFilter(filters.from || null);
  const to = parseDateFilter(filters.to || null);

  for (let offset = 0; ; offset += pageSize) {
    let query = supabase
      .from("profit_daily_rollups")
      .select(PROFIT_ROLLUP_SELECT)
      .eq("workspace_id", workspaceId)
      .order("day", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (from) query = query.gte("day", from);
    if (to) query = query.lte("day", to);
    if (filters.connector_id) query = query.eq("connector_id", String(filters.connector_id));
    if (filters.platform) query = query.eq("platform", String(filters.platform));
    if (filters.event_source) query = query.eq("event_source", String(filters.event_source));
    if (filters.currency) query = query.eq("currency", String(filters.currency).toUpperCase());

    const { data, error } = await query;
    if (error) throw new Error(`Profit daily rollups read failed: ${error.message}`);

    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  return rows;
}

function summarizeProfitRollups(rows: any[]) {
  const totals = sumProfitTotals(rows);
  const fees =
    Number(totals.chargeback_fees || 0) +
    Number(totals.processor_fees || 0) +
    Number(totals.bank_fees || 0);

  return {
    ...totals,
    fees,
    shipping: totals.shipping_cost,
  };
}

function ratio(numerator: number, denominator: number) {
  return denominator !== 0 ? numerator / denominator : 0;
}

function deltaPct(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 1;
  return (current - previous) / Math.abs(previous);
}

function kpiPayloadFromSummaries(current: ReturnType<typeof summarizeProfitRollups>, previous: ReturnType<typeof summarizeProfitRollups>) {
  const grossSales = Number(current.gross_revenue || 0);
  const previousGrossSales = Number(previous.gross_revenue || 0);
  const refundRate = ratio(Math.abs(Number(current.refunds || 0)), Math.abs(grossSales));
  const previousRefundRate = ratio(Math.abs(Number(previous.refunds || 0)), Math.abs(previousGrossSales));
  const chargebackRate = ratio(Math.abs(Number(current.chargebacks || 0)), Math.abs(grossSales));
  const previousChargebackRate = ratio(Math.abs(Number(previous.chargebacks || 0)), Math.abs(previousGrossSales));

  return {
    gross_sales: grossSales,
    gross_sales_delta_pct: deltaPct(grossSales, previousGrossSales),
    net_profit: Number(current.net_profit || 0),
    net_margin: ratio(Number(current.net_profit || 0), grossSales),
    refund_rate: refundRate,
    refund_rate_delta_pp: refundRate - previousRefundRate,
    chargebacks: chargebackRate,
    chargebacks_delta_pp: chargebackRate - previousChargebackRate,
  };
}

function inclusiveDaySpan(from: string, to: string) {
  const fromDate = parseYmd(from);
  const toDate = parseYmd(to);
  if (!fromDate || !toDate) return 1;
  return Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86400000) + 1);
}

function previousDateRange(from: string, to: string) {
  const fromDate = parseYmd(from);
  if (!fromDate) return { from, to };
  const days = inclusiveDaySpan(from, to);
  const previousTo = addDaysUTC(fromDate, -1);
  const previousFrom = addDaysUTC(previousTo, -(days - 1));
  return {
    from: isoYmdUTC(previousFrom),
    to: isoYmdUTC(previousTo),
  };
}

function defaultDashboardDateRange(url: URL) {
  const now = new Date();
  const to = parseDateFilter(url.searchParams.get("to")) || isoYmdUTC(now);
  const from = parseDateFilter(url.searchParams.get("from")) || isoYmdUTC(addDaysUTC(parseYmd(to) || now, -6));
  return { from, to };
}

function b64ToU8(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function u8ToB64(u8: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

async function importAesKey(env: Env) {
  const b64 = String(env.INTEGRATIONS_ENC_KEY ?? "").trim();
  if (!b64) throw new Error("Missing INTEGRATIONS_ENC_KEY");
  const raw = b64ToU8(b64);
  if (raw.byteLength !== 32) throw new Error("INTEGRATIONS_ENC_KEY must be base64 of 32 bytes");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptSecret(env: Env, plaintext: string) {
  const key = await importAesKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return { v: 1, alg: "AES-GCM", iv_b64: u8ToB64(iv), ct_b64: u8ToB64(new Uint8Array(ct)) };
}

async function decryptSecret(env: Env, iv_b64: string, ct_b64: string) {
  const key = await importAesKey(env);
  const iv = b64ToU8(String(iv_b64 ?? "").trim());
  const ct = b64ToU8(String(ct_b64 ?? "").trim());
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

async function decryptSecretFromCredRow(env: Env, cred: any) {
  return decryptSecret(env, String(cred.password_iv ?? ""), String(cred.password_ciphertext ?? ""));
}

type WowSuiteSub = "wowboost" | "wowpay";
function wowSuiteKey(sub: WowSuiteSub) {
  return `wowsuite:${sub}`;
}

function coercePlatformKey(raw: any) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "wowboost") return wowSuiteKey("wowboost");
  if (s === "wowpay") return wowSuiteKey("wowpay");
  if (s === "wowsuite:wowboost") return wowSuiteKey("wowboost");
  if (s === "wowsuite:wowpay") return wowSuiteKey("wowpay");
  if (s === "konnektive" || s === "konnective") return "checkoutchamp";
  if (s === "checkoutchamp") return "checkoutchamp";
  if (s === "shopify") return "shopify";
  if (s === "paypal") return "paypal";
  if (s === "wowsuite") return "wowsuite";
  if (s === "nmi") return "nmi";
  return s;
}

function b64BasicFromUserPass(username: string, password: string) {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

function wowSuiteParseToken(text: string) {
  const t = String(text ?? "").trim();
  if (t.length > 40 && t.includes(".") && !t.startsWith("{") && !t.startsWith("[")) return t;
  const js = safeJsonParse(t);
  const token =
    js?.token ||
    js?.access_token ||
    js?.accessToken ||
    js?.data?.token ||
    js?.data?.access_token ||
    js?.data?.accessToken ||
    null;
  return token ? String(token) : null;
}

async function wowSuiteGetBearerToken(args: { authBase: string; username: string; password: string }) {
  const res = await fetch(`${args.authBase.replace(/\/+$/, "")}/auth`, {
    method: "POST",
    headers: {
      Authorization: b64BasicFromUserPass(args.username, args.password),
      Accept: "application/json, text/plain, */*",
    },
  });

  const text = await readTextSafe(res);
  if (!res.ok) throw new Error(`WOWSuite auth failed (${res.status}): ${text || res.statusText}`);

  const token = wowSuiteParseToken(text);
  if (!token) throw new Error(`WOWSuite auth: token not found in response: ${text.slice(0, 200)}`);

  return token;
}

async function runWowPayImportPage(env: Env, args: { from: string; to: string; page: number; pageSize?: number }) {
  const supabase = getSupabase(env);
  const pageSize = Math.max(1, Math.min(1000, Number(args.pageSize ?? 1000)));

  const creds = await getLatestCredential(env, "wowpay");
  if (!creds) throw new Error("WowPay not connected.");

  const authBase = String((creds as any).base_url || env.DEFAULT_WOWSUITE_AUTH_BASE || DEFAULT_WOWSUITE_AUTH_BASE).replace(/\/+$/, "");
  const username = String((creds as any).username ?? "").trim();
  const password = await decryptSecretFromCredRow(env, creds as any);
  const bearer = await wowSuiteGetBearerToken({ authBase, username, password });

  const url = new URL(`${authBase}/order/${args.page}/${pageSize}`);
  url.searchParams.set("StartDate", `${args.from} 00:00:00`);
  url.searchParams.set("EndDate", `${args.to} 23:59:59`);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `bearer ${bearer}`, Accept: "application/json" },
  });

  const text = await readTextSafe(res);
  if (!res.ok) throw new Error(`WowPay order query failed ${res.status}: ${text.slice(0, 300)}`);

  const js = safeJsonParse(text);
  if (!js) throw new Error(`WowPay returned invalid JSON: ${text.slice(0, 300)}`);

  const orders = Array.isArray(js.customerOrders) ? js.customerOrders : Array.isArray(js.orders) ? js.orders : [];

  const upserts = await Promise.all(
    orders.map(async (o: any) => {
      const orderId = String(o.orderId ?? o.orderNumber ?? "").trim();
      if (!orderId) return null;

      const receipts = Array.isArray(o.receipts) ? o.receipts : [];
      const receipt = receipts[0] || {};
      const status = wowSuiteNormalizeStatus(receipt.paymentStatus || o.orderStatus);

      let gross =
		  parseMoneyMaybe(
		    receipt.amountUSD ??
		      receipt.amount ??
		      o.amountUSD ??
		      o.amount ??
		      o.totalAmount ??
		      o.orderTotal ??
		      o.total ??
		      o.price ??
		      o.productPrice ??
		      o.formattedProductPrice,
		  ) ?? 0;
      if (gross == null) gross = 0;
      if ((status === "REFUNDED" || status === "CHARGEBACK" || status === "CANCELLED") && gross > 0) {
        gross = -Math.abs(gross);
      }

      const emailFields = await emailIdentityFields(
        o.email || o.customerEmail || o.customer?.email || receipt.email
      );

      const transactionId = receipt.transactionId || receipt.transactionID || o.transactionId || o.paymentTrackingNumber || null;
      const phone = normalizePhone(o.phoneNumber || o.customerPhone || o.phone || o.customer?.phoneNumber || "");
	  
	  console.log(
		  "WOWPAY AMOUNTS",
		  {
		    amountUSD: o.amountUSD,
		    amount: o.amount,
		    totalAmount: o.totalAmount,
		    orderTotal: o.orderTotal,
		    total: o.total,
		    price: o.price,
		    productPrice: o.productPrice,
		  }
		);
	  
      return {
		  platform: "wowpay",
		  platform_order_id: `wowpay:${orderId}`,
		  platform_store_id: o.campaignId || o.campaignID || o.campaign_id || null,
		  order_id: String(orderId),
		  order_ts: parseDateToIsoMaybe(
		    receipt.createDate || o.orderDate || o.lastUpdateDate
		  ) || `${args.from}T00:00:00.000Z`,
		  status,
		  status_norm: status,
		
		  gross_amount: gross,
		
		  receipt_total:
		    parseMoneyMaybe(
		      receipt.amountUSD ??
		      receipt.amount ??
		      o.amountUSD ??
		      o.amount ??
		      o.totalAmount ??
		      o.orderTotal ??
		      o.total ??
		      o.price ??
		      o.productPrice ??
		      o.formattedProductPrice
		    ) ?? null,
		
		  currency: receipt.currencyCode || o.currencyCode || "USD",

        ...emailFields,
        email: emailFields.customer_email,
        phone: phone || null,

        transaction_id: transactionId,
        everflow_transaction_id: o._ef_transaction_id || o.ef_transaction_id || o.everflow_transaction_id || transactionId || null,
        tkid: o.tkid || o.tk_id || o.tracekit_id || null,
        affiliate_id: o.affiliateId || o.affiliateID || o.affiliate_id || null,
        everflow_offer_id: o.offerId || o.offerID || o.offer_id || o.campaignId || o.campaignID || null,
        source_id: o.sourceId || o.sourceID || o.source_id || null,
        sub1: o.s1 || o.S1 || o.sub1 || null,
        sub2: o.s2 || o.S2 || o.sub2 || null,
        sub3: o.s3 || o.S3 || o.sub3 || null,
        sub4: o.s4 || o.S4 || o.sub4 || null,
        sub5: o.s5 || o.S5 || o.sub5 || null,

        product_subtotal: parseMoneyMaybe(o.productSubtotal ?? o.subtotal ?? o.productPrice) ?? null,
        shipping_amount: parseMoneyMaybe(o.shippingAmount ?? o.shipping ?? o.shipAmount) ?? null,
        tax_amount: parseMoneyMaybe(o.taxAmount ?? o.tax) ?? null,
        product_cost: parseMoneyMaybe(o.productCost ?? o.product_cost) ?? null,
        shipping_cost: parseMoneyMaybe(o.shippingCost ?? o.shipping_cost) ?? null,
        gateway_fee: parseMoneyMaybe(receipt.gatewayFee ?? receipt.processorFee ?? o.gatewayFee) ?? null,
        chargeback_fee: parseMoneyMaybe(o.chargebackFee ?? o.chargeback_fee) ?? null,
        tracking_number: receipt.trackingNumber || o.trackingNumber || o.shipmentTrackingNumber || null,
        shipping_carrier: o.shippingCarrier || o.carrier || null,
        raw_json: o,
      };
    })
  );

  const deduped = dedupePlatformOrders(upserts.filter(Boolean));

  if (deduped.length) {
    const { error } = await supabase.from("platform_orders").upsert(deduped as any[], { onConflict: "platform_order_id" });
    if (error) throw new Error(error.message);
  }

  return {
    fetched: orders.length,
    upserted: deduped.length,
    page: args.page,
    pageSize,
    hasMore: Boolean(js?.paging?.nextPage) || orders.length >= pageSize,
    nextPage: (Boolean(js?.paging?.nextPage) || orders.length >= pageSize) ? args.page + 1 : null,
  };
}

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const outRows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      row.push(cur);
      cur = "";
      continue;
    }

    if (ch === "\n") {
      row.push(cur);
      cur = "";
      if (row.length && row[row.length - 1].endsWith("\r")) row[row.length - 1] = row[row.length - 1].slice(0, -1);
      outRows.push(row);
      row = [];
      continue;
    }

    cur += ch;
  }

  if (cur.length || row.length) {
    row.push(cur);
    if (row.length && row[row.length - 1].endsWith("\r")) row[row.length - 1] = row[row.length - 1].slice(0, -1);
    outRows.push(row);
  }

  if (!outRows.length) return { headers: [], rows: [] };

  const headers = outRows[0].map((h) => String(h ?? "").trim());
  const rows = outRows.slice(1).map((cells) => {
    const r: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) r[headers[i]] = String(cells[i] ?? "");
    return r;
  });

  return { headers, rows };
}

function pickField(row: Record<string, any>, candidates: string[]) {
  const keys = Object.keys(row || {});
  for (const c of candidates) {
    const hit = keys.find((k) => k.toLowerCase().trim() === c.toLowerCase().trim());
    if (hit && row[hit] !== undefined && row[hit] !== null && String(row[hit]).trim() !== "") {
      return String(row[hit]).trim();
    }
  }
  return "";
}

function parseDateToIsoMaybe(v: any) {
  const s = String(v ?? "").trim();
  if (!s) return "";

  const direct = new Date(s);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();

  const normalized = new Date(s.replace(" ", "T") + (s.includes("Z") ? "" : "Z"));
  if (!Number.isNaN(normalized.getTime())) return normalized.toISOString();

  return "";
}

function normalizeOrderStatus(raw: any) {
  const s = normStatusUpper(raw);
  if (!s) return "UNKNOWN";
  if (s.includes("REFUND") || s.includes("RMA")) return "REFUNDED";
  if (s.includes("CHARGEBACK") || s.includes("CHARGEDBACK") || s.includes("DISPUTE")) return "CHARGEBACK";
  if (s.includes("CANCEL") || s.includes("VOID") || s.includes("ABANDON")) return "CANCELLED";
  if (s.includes("DECLIN") || s.includes("REJECT") || s.includes("INVALID") || s.includes("ERROR") || s.includes("FAILED")) return "DECLINED";
  if (s.includes("PENDING") || s.includes("PROCESS") || s.includes("HOLD") || s.includes("REVIEW")) return "PENDING";
  if (s.includes("PAID") || s.includes("COMPLETE") || s.includes("SHIP") || s.includes("SUCCESS") || s.includes("NEW")) return "COMPLETED";
  return s;
}

function normalizeEmail(v: any) {
  const email = String(v ?? "").trim().toLowerCase();
  return email && email.includes("@") ? email : "";
}

async function sha256Hex(v: string) {
  if (!v) return "";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function emailIdentityFields(emailRaw: any) {
  const email = String(emailRaw ?? "").trim();
  const emailNorm = normalizeEmail(email);
  const emailHash = emailNorm ? await sha256Hex(emailNorm) : "";

  return {
    customer_email: email || null,
    customer_email_normalized: emailNorm || null,
    customer_email_hash: emailHash || null,
  };
}

function normalizePhone(v: any) {
  const raw = String(v ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw;
}

function firstNonEmpty(...vals: any[]) {
  for (const v of vals) {
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function rawPayloadPresent(v: any) {
  if (!v) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return String(v).trim() !== "";
}

function pickTrackingId(row: Record<string, any>) {
  return (
    pickField(row, [
      "tkid",
      "tk_id",
      "tracekit_id",
      "TraceKit ID",
      "TraceKitID",
      "custom1",
      "custom2",
      "custom3",
      "custom4",
      "custom5",
      "customField1",
      "customField2",
      "customField3",
      "customField4",
      "customField5",
    ]) || ""
  );
}

function pickEverflowTid(row: Record<string, any>) {
  return (
    pickField(row, [
      "_ef_transaction_id",
      "ef_transaction_id",
      "everflow_transaction_id",
      "Everflow Transaction ID",
      "EF Transaction ID",
      "sub5",
      "Sub5",
      "SUB5",
      "s5",
      "S5",
    ]) || ""
  );
}

const wowSuiteNormalizeStatus = normalizeOrderStatus;

function dedupePlatformOrders(rows: any[]) {
  const map = new Map<string, any>();

  for (const r of rows) {
    const key = String(r.platform_order_id ?? "").trim();
    if (!key) continue;

    const prev = map.get(key);
    if (!prev) {
      map.set(key, r);
      continue;
    }

    const prevStatus = String(prev.status ?? "");
    const nextStatus = String(r.status ?? "");

    let keep = prev;
    if ((!prevStatus || prevStatus === "UNKNOWN") && nextStatus && nextStatus !== "UNKNOWN") keep = r;
    else if (Number(r.gross_amount ?? 0) !== 0 && Number(prev.gross_amount ?? 0) === 0) keep = r;
    else if (String(r.order_ts ?? "") > String(prev.order_ts ?? "")) keep = r;

    map.set(key, keep);
  }

  return Array.from(map.values());
}

function envFlagEnabled(value: unknown, defaultValue = true) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return defaultValue;
  return text === "1" || text === "true" || text === "yes" || text === "on";
}

function wowBoostIdentityMaxRows(env: Env) {
  return Math.max(0, Math.min(20, Number(env.IDENTITY_WOWBOOST_MAX_ROWS_PER_PAGE || 10) || 10));
}

function wowBoostIdentityIdentifiers(row: any): IdentityInputIdentifier[] {
  const raw = row?.raw_json && typeof row.raw_json === "object" ? row.raw_json : {};
  const identifiers: IdentityInputIdentifier[] = [];
  const email = firstNonEmpty(row?.customer_email, row?.email, pickField(raw, ["Email", "email", "Customer Email", "CustomerEmail"]));
  const phone = firstNonEmpty(row?.phone, pickField(raw, ["CustomerPhone", "Customer Phone", "Phone", "phone", "Phone Number"]));
  const customerId = firstNonEmpty(
    pickField(raw, [
      "Customer ID",
      "CustomerId",
      "Customer Id",
      "CustomerNumber",
      "Customer Number",
      "CustomerID",
      "customer_id",
    ]),
  );

  if (customerId) {
    identifiers.push({
      identifier_type: "order_customer_id",
      value: customerId,
      verification_status: "observed",
      metadata: { source_field: "customer_id" },
    });
  }
  if (email) identifiers.push({ identifier_type: "email", value: email, verification_status: "observed" });
  if (phone) identifiers.push({ identifier_type: "phone", value: phone, verification_status: "observed" });
  return identifiers;
}

async function attachIdentityToWowBoostPlatformRows(
  env: Env,
  rows: any[],
  args: { workspace_id?: string | null; connector_job_id?: string | null } = {},
) {
  if (!envFlagEnabled(env.IDENTITY_WOWBOOST_RESOLUTION_ENABLED, true)) {
    return { rows, attempted: 0, linked: 0, review_required: 0, skipped: rows.length, warnings: ["identity_resolution_disabled"] };
  }

  const maxRows = wowBoostIdentityMaxRows(env);
  if (!maxRows) {
    return { rows, attempted: 0, linked: 0, review_required: 0, skipped: rows.length, warnings: ["identity_resolution_limit_zero"] };
  }

  const service = getIdentityService(env);
  const warnings: string[] = [];
  let attempted = 0;
  let linked = 0;
  let reviewRequired = 0;
  let identityUnavailable = false;

  for (const row of rows.slice(0, maxRows)) {
    if (!row || row.person_id || identityUnavailable) continue;
    const identifiers = wowBoostIdentityIdentifiers(row);
    if (!identifiers.length) continue;

    attempted += 1;
    try {
      const result = await resolveIdentityForSourceRecord(service, {
        workspace_id: args.workspace_id || row.workspace_id || "default",
        connector_id: "wowboost",
        connector_job_id: args.connector_job_id || null,
        platform: "wowboost",
        record_type: "platform_order",
        record_id: row.platform_order_id,
        identifiers,
        attributes: {
          display_name: firstNonEmpty(
            pickField(row.raw_json || {}, ["Customer Name", "CustomerName", "Name"]),
          ) || null,
          first_name: firstNonEmpty(pickField(row.raw_json || {}, ["First Name", "FirstName", "first_name"])) || null,
          last_name: firstNonEmpty(pickField(row.raw_json || {}, ["Last Name", "LastName", "last_name"])) || null,
        },
        observed_at: row.order_ts || null,
      });

      if (result.person_id && !result.review_required) {
        row.person_id = result.person_id;
        linked += 1;
      } else if (result.review_required) {
        reviewRequired += 1;
      }
    } catch (e: any) {
      const message = String(e?.message || e || "identity_resolution_failed");
      warnings.push("identity_resolution_failed");
      if (message.includes("does not exist") || message.includes("relation") || message.includes("schema cache")) {
        identityUnavailable = true;
        warnings.push("identity_tables_unavailable");
      }
    }
  }

  const skipped = Math.max(0, rows.length - attempted);
  return { rows, attempted, linked, review_required: reviewRequired, skipped, warnings: Array.from(new Set(warnings)) };
}

type ImportJobRow = {
  id: string;
  platform: string;
  module: string | null;
  status: ImportJobStatus | "running" | "retrying";
  from_date: string;
  to_date: string;
  filter: string | null;
  requested_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  fetched?: number;
  upserted?: number;
  pages?: number;
  error?: string | null;
  progress?: ImportProgressState | Record<string, any> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

async function createImportJob(env: Env, args: {
  platform: string;
  module?: string | null;
  from: string;
  to: string;
  filter?: string | null;
  workspace_id?: string | null;
  connector_id?: string | null;
  progress?: ImportProgressState | Record<string, any> | null;
  status?: ImportJobStatus;
}) {
  const supabase = getSupabase(env);
  const progress = args.progress ?? createInitialImportProgress({
    workspace_id: args.workspace_id,
    platform: args.platform,
    connector_id: args.connector_id,
    from: args.from,
    to: args.to,
    filter: args.filter,
  });

  const payload = {
    platform: args.platform,
    module: args.module ?? null,
    status: args.status ?? normalizeImportStatus((progress as any).status || "queued"),
    from_date: args.from,
    to_date: args.to,
    filter: args.filter ?? null,
    progress,
    requested_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from("integration_import_jobs").insert(payload).select("*").single();
  if (error) throw new Error(`Failed to create import job: ${error.message}`);

  return data as ImportJobRow;
}

async function updateImportJob(env: Env, jobId: string, patch: Partial<ImportJobRow> & Record<string, any>) {
  const supabase = getSupabase(env);
  const { error } = await supabase
    .from("integration_import_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", jobId);

  if (error) throw new Error(`Failed to update import job: ${error.message}`);
}

async function getImportJob(env: Env, jobId: string) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase.from("integration_import_jobs").select("*").eq("id", jobId).maybeSingle();
  if (error) throw new Error(`Failed to read import job: ${error.message}`);
  return (data ?? null) as ImportJobRow | null;
}

type ConnectorImportTaskRow = {
  id: string;
  job_id: string;
  workspace_id: string;
  connector_id: string;
  task_type: string;
  phase: string;
  status: string;
  cursor: string | null;
  page: number | null;
  attempt_count: number;
  max_attempts: number;
  available_at: string | null;
  locked_at: string | null;
  completed_at: string | null;
  last_error: string | null;
  dedupe_key: string;
  payload: Record<string, any>;
  result_summary: Record<string, any>;
  created_at: string | null;
  updated_at: string | null;
};

const WOWBOOST_BACKFILL_CONNECTOR_ID = "wowboost-commerce-reference-backfill";
const WOWBOOST_BACKFILL_JOB_TYPE = "commerce_reference_backfill";
const WOWBOOST_RUNTIME_DEFAULT_EXPORT_PAGE_SIZE = 500;
const WOWBOOST_RUNTIME_DEFAULT_RECONCILE_LIMIT = 100;
const WOWBOOST_RUNTIME_DEFAULT_DETAILS_LIMIT = 5;
const WOWBOOST_RUNTIME_MAX_DETAILS_LIMIT = 20;
const WOWBOOST_RUNTIME_DEFAULT_PACING_MS = 650;
const IDENTITY_RESOLVE_TASK_STALE_MS = 120000;
const IDENTITY_RESOLVE_TASK_RECHECK_DELAY_SECONDS = 30;
const IDENTITY_RESOLVE_OPERATION_TIMEOUT_MS = 15000;

async function createConnectorRuntimeTask(env: Env, plan: ConnectorRuntimeTaskPlan) {
  const supabase = getSupabase(env);
  const dedupeKey = plan.dedupe_key || connectorRuntimeTaskDedupeKey(plan);
  const payload = {
    job_id: plan.job_id,
    workspace_id: plan.workspace_id,
    connector_id: plan.connector_id,
    task_type: plan.task_type,
    phase: plan.phase,
    cursor: plan.cursor ?? null,
    page: plan.page ?? null,
    max_attempts: Math.max(1, Number(plan.max_attempts || 5)),
    available_at: plan.available_at || new Date().toISOString(),
    dedupe_key: dedupeKey,
    payload: plan.payload || {},
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("connector_import_tasks")
    .upsert(payload, { onConflict: "job_id,dedupe_key", ignoreDuplicates: true })
    .select("*")
    .single();

  if (error) {
    const { data: existing, error: existingError } = await supabase
      .from("connector_import_tasks")
      .select("*")
      .eq("job_id", plan.job_id)
      .eq("dedupe_key", dedupeKey)
      .maybeSingle();
    if (existingError || !existing) throw new Error(`Failed to create connector runtime task: ${error.message}`);
    return { task: existing as ConnectorImportTaskRow, created: false };
  }

  return { task: data as ConnectorImportTaskRow, created: true };
}

async function getConnectorRuntimeTask(env: Env, taskId: string) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from("connector_import_tasks")
    .select("*")
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw new Error(`Failed to read connector runtime task: ${error.message}`);
  return (data || null) as ConnectorImportTaskRow | null;
}

async function updateConnectorRuntimeTask(env: Env, taskId: string, patch: Partial<ConnectorImportTaskRow> & Record<string, any>) {
  const supabase = getSupabase(env);
  const { error } = await supabase
    .from("connector_import_tasks")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", taskId);
  if (error) throw new Error(`Failed to update connector runtime task: ${error.message}`);
}

function isIdentityResolveRuntimeTask(task: ConnectorImportTaskRow | null | undefined) {
  return Boolean(
    task
    && task.connector_id === IDENTITY_BACKFILL_CONNECTOR_ID
    && task.task_type === IDENTITY_BACKFILL_TASK_TYPES.resolve
  );
}

function connectorRuntimeTaskLogDetails(task: ConnectorImportTaskRow, event: string, details: Record<string, any> = {}) {
  return {
    event,
    task_id: task.id,
    job_id: task.job_id,
    connector_id: task.connector_id,
    task_type: task.task_type,
    phase: task.phase,
    status: task.status,
    attempt_count: Number(task.attempt_count || 0),
    ...details,
  };
}

function logConnectorRuntimeTaskEvent(task: ConnectorImportTaskRow, event: string, details: Record<string, any> = {}, level: "log" | "error" = "log") {
  const payload = connectorRuntimeTaskLogDetails(task, event, details);
  if (level === "error") console.error("[TraceKit] connector runtime task", payload);
  else console.log("[TraceKit] connector runtime task", payload);
}

type ConnectorRuntimeTaskDiagnosticState = {
  summary: Record<string, any>;
  last_durable_heartbeat_ms: number;
};

function connectorRuntimeTaskDiagnosticState(task: ConnectorImportTaskRow): ConnectorRuntimeTaskDiagnosticState {
  const summary = task.result_summary && typeof task.result_summary === "object" ? { ...task.result_summary } : {};
  const heartbeatMs = Date.parse(String(summary.heartbeat_at || task.locked_at || task.updated_at || ""));
  return {
    summary,
    last_durable_heartbeat_ms: Number.isFinite(heartbeatMs) ? heartbeatMs : 0,
  };
}

function recordConnectorRuntimeTaskDiagnosticSample(
  state: ConnectorRuntimeTaskDiagnosticState,
  event: string,
  details: Record<string, any> = {},
) {
  state.summary = appendConnectorRuntimeTaskDiagnosticSample(state.summary, event, details);
}

async function heartbeatConnectorRuntimeTask(
  env: Env,
  task: ConnectorImportTaskRow,
  state: ConnectorRuntimeTaskDiagnosticState,
  event: string,
  details: Record<string, any> = {},
  options: { force?: boolean; min_interval_ms?: number } = {},
) {
  const nowMs = Date.now();
  if (!shouldWriteConnectorRuntimeDurableHeartbeat({
    force: options.force,
    last_heartbeat_ms: state.last_durable_heartbeat_ms,
    now_ms: nowMs,
    min_interval_ms: options.min_interval_ms || CONNECTOR_RUNTIME_DURABLE_HEARTBEAT_MIN_INTERVAL_MS,
  })) {
    recordConnectorRuntimeTaskDiagnosticSample(state, event, details);
    return false;
  }
  const now = new Date().toISOString();
  state.summary = appendConnectorRuntimeTaskDiagnostic(state.summary, event, details, now);
  state.last_durable_heartbeat_ms = nowMs;
  await updateConnectorRuntimeTask(env, task.id, {
    locked_at: now,
    result_summary: state.summary,
  });
  return true;
}

async function traceIdentityResolveAwait<T>(
  env: Env,
  task: ConnectorImportTaskRow,
  state: ConnectorRuntimeTaskDiagnosticState,
  event: string,
  operation: () => Promise<T>,
  options: { durable_before?: boolean; durable_after?: boolean; details?: Record<string, any> } = {},
) {
  logConnectorRuntimeTaskEvent(task, `${event}.before_await`, options.details || {});
  recordConnectorRuntimeTaskDiagnosticSample(state, `${event}.before_await`, options.details || {});
  if (options.durable_before) await heartbeatConnectorRuntimeTask(env, task, state, `${event}.before_await`, options.details || {}, { force: true });
  const started = Date.now();
  try {
    const result = await withIdentityOperationTimeout(event, operation(), IDENTITY_RESOLVE_OPERATION_TIMEOUT_MS);
    const elapsedDetails = { ...(options.details || {}), elapsed_ms: Date.now() - started };
    logConnectorRuntimeTaskEvent(task, `${event}.after_await`, elapsedDetails);
    recordConnectorRuntimeTaskDiagnosticSample(state, `${event}.after_await`, elapsedDetails);
    if (options.durable_after) await heartbeatConnectorRuntimeTask(env, task, state, `${event}.after_await`, elapsedDetails, { force: true });
    return result;
  } catch (error: any) {
    logConnectorRuntimeTaskEvent(task, `${event}.await_error`, {
      ...(options.details || {}),
      elapsed_ms: Date.now() - started,
      timed_out: error?.name === "IdentityOperationTimeoutError",
      message: error?.message || String(error),
    }, "error");
    await heartbeatConnectorRuntimeTask(env, task, state, `${event}.await_error`, {
      ...(options.details || {}),
      elapsed_ms: Date.now() - started,
      timed_out: error?.name === "IdentityOperationTimeoutError",
      error_name: error?.name || "Error",
    }, { force: true }).catch(() => {});
    throw error;
  }
}

function identityResolveServiceDiagnostics(
  env: Env,
  task: ConnectorImportTaskRow,
  state: ConnectorRuntimeTaskDiagnosticState,
  base: { platform?: string | null; platform_order_id: string; processed: number },
): IdentityDiagnostics {
  return {
    timeout_ms: IDENTITY_RESOLVE_OPERATION_TIMEOUT_MS,
    emit: (event) => {
      const details = {
        platform: base.platform || null,
        platform_order_id: base.platform_order_id,
        processed: base.processed,
        operation: event.operation,
        elapsed_ms: event.elapsed_ms ?? null,
        timed_out: Boolean(event.timed_out),
        error_name: event.error_name || null,
        ...(event.metadata || {}),
      };
      recordConnectorRuntimeTaskDiagnosticSample(state, `${event.operation}.${event.phase}`, details);
    },
  };
}

function identityResolveRecordHeartbeatOptions(processed: number) {
  return { force: processed > 0 && processed % 5 === 0 };
}

async function enqueueConnectorRuntimeTask(env: Env, task: ConnectorImportTaskRow) {
  if (!env.wowboost_imports) throw new Error("wowboost_imports queue binding is missing. Check wrangler.toml.");
  await env.wowboost_imports.send(connectorRuntimeTaskMessage({
    id: task.id,
    job_id: task.job_id,
    connector_id: task.connector_id,
    task_type: task.task_type,
    phase: task.phase,
  }));
}

async function enqueueConnectorRuntimeTaskWithDelay(env: Env, task: ConnectorImportTaskRow, delaySeconds: number) {
  if (!env.wowboost_imports) throw new Error("wowboost_imports queue binding is missing. Check wrangler.toml.");
  await env.wowboost_imports.send(connectorRuntimeTaskMessage({
    id: task.id,
    job_id: task.job_id,
    connector_id: task.connector_id,
    task_type: task.task_type,
    phase: task.phase,
  }), { delaySeconds: Math.max(1, Math.floor(delaySeconds)) } as any);
}

async function recoverStaleIdentityResolveTask(env: Env, task: ConnectorImportTaskRow, args: { enqueue?: boolean; reason?: string } = {}) {
  if (!isIdentityResolveRuntimeTask(task)) return task;
  const now = new Date().toISOString();
  const attempt = Math.max(1, Number(task.attempt_count || 1));
  const maxAttempts = Math.max(1, Number(task.max_attempts || 5));
  const canRetry = attempt < maxAttempts;
  const lastError = `Recovered stale Identity Backfill resolve task after missing heartbeat for ${Math.round(IDENTITY_RESOLVE_TASK_STALE_MS / 1000)} seconds.`;
  const state = connectorRuntimeTaskDiagnosticState(task);
  state.summary = appendConnectorRuntimeTaskDiagnostic(state.summary, "identity_resolve.stale_recovered", {
    reason: args.reason || "stale_running_task",
    previous_status: task.status,
    attempt_count: attempt,
    max_attempts: maxAttempts,
    retrying: canRetry,
  }, now);

  const nextStatus = canRetry ? "queued" : "failed";
  await updateConnectorRuntimeTask(env, task.id, {
    status: nextStatus,
    available_at: now,
    locked_at: null,
    completed_at: canRetry ? null : now,
    last_error: lastError,
    result_summary: state.summary,
  });

  await insertConnectorRuntimeError(env, {
    job_id: task.job_id,
    task_id: task.id,
    connector_id: task.connector_id,
    record_identifier: task.dedupe_key,
    error_class: canRetry ? "identity_backfill_resolve_stale_recovered" : "identity_backfill_resolve_stale_exhausted",
    attempt,
    message: lastError,
    classification: canRetry ? "transient" : "permanent",
  }).catch(() => {});

  const job = await getImportJob(env, task.job_id).catch(() => null);
  if (job) {
    const progress = connectorRuntimeProgressFromJob(job);
    const nextProgress = mergeConnectorRuntimeCounters(progress, canRetry ? { retries: 1 } : { records_failed: 1 }, {
      status: canRetry ? "retrying" : "completed_with_errors",
      phase: task.phase,
      last_error: lastError,
      next_run_at: canRetry ? now : null,
      metadata: {
        stale_resolve_tasks_recovered: Number(progress.metadata?.stale_resolve_tasks_recovered || 0) + 1,
        stale_resolve_task_ids: [...(progress.metadata?.stale_resolve_task_ids || []), task.id].slice(-10),
      },
    });
    await updateConnectorRuntimeJobProgress(env, job, nextProgress).catch(() => {});
  }

  const recoveredTask = {
    ...task,
    status: nextStatus,
    available_at: now,
    locked_at: null,
    completed_at: canRetry ? null : now,
    last_error: lastError,
    result_summary: state.summary,
  };
  if (canRetry && args.enqueue !== false) await enqueueConnectorRuntimeTask(env, recoveredTask);
  return recoveredTask;
}

async function recoverStaleIdentityResolveTasks(env: Env, args: { job_id?: string | null; limit?: number } = {}) {
  const supabase = getSupabase(env);
  const staleBefore = new Date(Date.now() - IDENTITY_RESOLVE_TASK_STALE_MS).toISOString();
  let query = supabase
    .from("connector_import_tasks")
    .select("*")
    .eq("connector_id", IDENTITY_BACKFILL_CONNECTOR_ID)
    .eq("task_type", IDENTITY_BACKFILL_TASK_TYPES.resolve)
    .eq("status", "running")
    .lt("locked_at", staleBefore)
    .order("locked_at", { ascending: true })
    .limit(Math.max(1, Math.min(25, Number(args.limit || 10))));
  if (args.job_id) query = query.eq("job_id", args.job_id);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to scan stale identity resolve tasks: ${error.message}`);
  let recovered = 0;
  for (const task of (data || []) as ConnectorImportTaskRow[]) {
    if (!isConnectorRuntimeTaskStale(task, { stale_ms: IDENTITY_RESOLVE_TASK_STALE_MS })) continue;
    await recoverStaleIdentityResolveTask(env, task, { enqueue: true, reason: "status_recovery_scan" });
    recovered += 1;
  }
  return recovered;
}

async function createAndEnqueueConnectorRuntimeTask(env: Env, plan: ConnectorRuntimeTaskPlan) {
  const result = await createConnectorRuntimeTask(env, plan);
  if (result.task.status !== "completed") await enqueueConnectorRuntimeTask(env, result.task);
  return result;
}

async function resetAndEnqueueConnectorRuntimeTask(env: Env, plan: ConnectorRuntimeTaskPlan) {
  const result = await createConnectorRuntimeTask(env, plan);
  await updateConnectorRuntimeTask(env, result.task.id, {
    status: "queued",
    phase: plan.phase,
    task_type: plan.task_type,
    cursor: plan.cursor ?? null,
    page: plan.page ?? null,
    payload: plan.payload || {},
    max_attempts: Math.max(1, Number(plan.max_attempts || 5)),
    available_at: plan.available_at || new Date().toISOString(),
    locked_at: null,
    completed_at: null,
    last_error: null,
    result_summary: {},
  });
  const task = await getConnectorRuntimeTask(env, result.task.id);
  if (!task) throw new Error("Failed to re-read connector runtime task for enqueue.");
  await enqueueConnectorRuntimeTask(env, task);
  return { task, created: result.created };
}

async function insertConnectorRuntimeError(env: Env, args: {
  job_id: string;
  task_id?: string | null;
  connector_id: string;
  record_identifier?: string | null;
  error_class: string;
  http_status?: number | null;
  attempt?: number | null;
  message?: string | null;
  response_excerpt?: string | null;
  classification?: string | null;
}) {
  const supabase = getSupabase(env);
  await supabase.from("integration_import_errors").insert({
    job_id: args.job_id,
    task_id: args.task_id || null,
    connector_id: args.connector_id,
    record_identifier: args.record_identifier || null,
    error_class: args.error_class,
    http_status: args.http_status ?? null,
    attempt: Math.max(1, Number(args.attempt || 1)),
    message: String(args.message || "").slice(0, 4000) || null,
    response_excerpt: String(args.response_excerpt || "").slice(0, 4000) || null,
    classification: args.classification || "transient",
  });
}

async function updateConnectorRuntimeJobProgress(env: Env, job: ImportJobRow, progress: ConnectorRuntimeProgress & Record<string, any>) {
  await updateImportJob(env, job.id, {
    status: progress.status,
    workspace_id: progress.workspace_id,
    connector_id: progress.connector_id,
    job_type: progress.job_type,
    phase: progress.phase,
    requested_from: progress.requested_from,
    requested_to: progress.requested_to,
    records_discovered: progress.records_discovered,
    records_processed: progress.records_processed,
    records_succeeded: progress.records_succeeded,
    records_failed: progress.records_failed,
    records_skipped: progress.records_skipped,
    retries: progress.retries,
    current_cursor: progress.current_cursor,
    current_page: progress.current_page,
    last_error: progress.last_error,
    next_run_at: progress.next_run_at,
    metadata: progress.metadata || {},
    progress,
    fetched: progress.records_processed,
    upserted: progress.records_succeeded,
    pages: progress.current_page ?? 0,
    error: progress.last_error,
    started_at: progress.started_at,
    completed_at: progress.completed_at,
  });
}

function connectorRuntimeProgressFromJob(job: ImportJobRow): ConnectorRuntimeProgress & Record<string, any> {
  const progress = (job.progress || {}) as Record<string, any>;
  const now = new Date().toISOString();
  return {
    ...createConnectorRuntimeProgress({
      workspace_id: (job as any).workspace_id || progress.workspace_id || "default",
      connector_id: (job as any).connector_id || progress.connector_id || job.platform,
      job_type: (job as any).job_type || progress.job_type || job.filter || "import",
      phase: (job as any).phase || progress.phase || "queued",
      requested_from: (job as any).requested_from || progress.requested_from || job.from_date,
      requested_to: (job as any).requested_to || progress.requested_to || job.to_date,
      now,
      metadata: (job as any).metadata || progress.metadata || {},
    }),
    ...progress,
    status: normalizeConnectorRuntimeJobStatus(job.status || progress.status),
    records_discovered: Number((job as any).records_discovered ?? progress.records_discovered ?? 0),
    records_processed: Number((job as any).records_processed ?? progress.records_processed ?? job.fetched ?? 0),
    records_succeeded: Number((job as any).records_succeeded ?? progress.records_succeeded ?? job.upserted ?? 0),
    records_failed: Number((job as any).records_failed ?? progress.records_failed ?? 0),
    records_skipped: Number((job as any).records_skipped ?? progress.records_skipped ?? 0),
    retries: Number((job as any).retries ?? progress.retries ?? 0),
    current_cursor: (job as any).current_cursor ?? progress.current_cursor ?? null,
    current_page: (job as any).current_page ?? progress.current_page ?? null,
    last_error: (job as any).last_error ?? progress.last_error ?? job.error ?? null,
    next_run_at: (job as any).next_run_at ?? progress.next_run_at ?? null,
    started_at: progress.started_at ?? job.started_at ?? null,
    updated_at: progress.updated_at ?? job.updated_at ?? now,
    completed_at: progress.completed_at ?? job.completed_at ?? null,
    metadata: {
      ...(progress.metadata || {}),
      ...((job as any).metadata || {}),
    },
  };
}

async function connectorRuntimeJobPayload(env: Env, job: ImportJobRow | null, options: { recent_errors?: boolean } = {}) {
  if (!job) return null;
  if (!isTerminalConnectorRuntimeJobStatus(normalizeConnectorRuntimeJobStatus(job.status))) {
    await recoverStaleIdentityResolveTasks(env, { job_id: job.id }).catch((error) => {
      console.error("[TraceKit] stale identity resolve recovery scan failed", {
        job_id: job.id,
        message: error?.message || String(error),
      });
    });
  }
  const supabase = getSupabase(env);
  const [{ count: queuedTasks }, { count: runningTasks }, { count: failedTasks }] = await Promise.all([
    supabase.from("connector_import_tasks").select("id", { count: "exact", head: true }).eq("job_id", job.id).eq("status", "queued"),
    supabase.from("connector_import_tasks").select("id", { count: "exact", head: true }).eq("job_id", job.id).eq("status", "running"),
    supabase.from("connector_import_tasks").select("id", { count: "exact", head: true }).eq("job_id", job.id).eq("status", "failed"),
  ]);
  let recentErrors: any[] = [];
  if (options.recent_errors !== false) {
    const { data } = await supabase
      .from("integration_import_errors")
      .select("record_identifier,error_class,http_status,classification,message,created_at")
      .eq("job_id", job.id)
      .order("created_at", { ascending: false })
      .limit(10);
    recentErrors = data || [];
  }
  return compactConnectorRuntimeJobPayload(job as any, {
    queued_tasks: queuedTasks || 0,
    running_tasks: runningTasks || 0,
    failed_tasks: failedTasks || 0,
    recent_errors: recentErrors,
  });
}

async function findActiveConnectorRuntimeJob(env: Env, args: {
  workspace_id: string;
  connector_id: string;
  job_type: string;
  from: string;
  to: string;
}) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from("integration_import_jobs")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Failed to read connector runtime jobs: ${error.message}`);
  return ((data || []) as ImportJobRow[]).find((job) => {
    if (!isConnectorRuntimeV1Job(job as any, args.connector_id)) return false;
    const progress = connectorRuntimeProgressFromJob(job);
    return (
      isActiveConnectorRuntimeJobStatus(progress.status) &&
      progress.workspace_id === args.workspace_id &&
      progress.connector_id === args.connector_id &&
      progress.job_type === args.job_type &&
      progress.requested_from === args.from &&
      progress.requested_to === args.to
    );
  }) || null;
}

function progressFromJob(job: ImportJobRow): ImportProgressState {
  const progress = (job.progress || {}) as Partial<ImportProgressState>;
  const now = new Date().toISOString();
  return {
    ...createInitialImportProgress({
      workspace_id: progress.workspace_id || "default",
      platform: job.platform,
      connector_id: progress.connector_id || job.platform,
      from: job.from_date,
      to: job.to_date,
      filter: job.filter,
      now,
    }),
    ...progress,
    status: normalizeImportStatus(progress.status || job.status),
    current_page: progress.current_page ?? (Number(job.pages || 1) || 1),
    records_fetched: Number(progress.records_fetched ?? job.fetched ?? 0) || 0,
    records_processed: Number(progress.records_processed ?? job.fetched ?? 0) || 0,
    rows_upserted: Number(progress.rows_upserted ?? job.upserted ?? 0) || 0,
    last_error: progress.last_error ?? job.error ?? null,
    started_at: progress.started_at ?? job.started_at ?? null,
    updated_at: progress.updated_at ?? job.updated_at ?? now,
    completed_at: progress.completed_at ?? job.completed_at ?? null,
  };
}

function publicImportJobPayload(job: ImportJobRow | null, options: { full_progress?: boolean; fullProgress?: boolean } = {}) {
  if (!job) return null;
  const progress = progressFromJob(job);
  return buildPublicImportJobPayload(job, progress, options);
}

function requestFullProgress(value: unknown) {
  return value === true || String(value ?? "").trim().toLowerCase() === "true" || String(value ?? "").trim() === "1";
}

async function updateImportJobProgress(env: Env, job: ImportJobRow, progress: ImportProgressState & Record<string, any>) {
  await updateImportJob(env, job.id, {
    status: progress.status,
    progress,
    fetched: progress.records_processed,
    upserted: progress.rows_upserted,
    pages: progress.current_page ?? job.pages ?? 0,
    error: progress.last_error,
    started_at: progress.started_at,
    completed_at: progress.completed_at,
  });
}

async function compactWowBoostBackfillJobProgress(env: Env, job: ImportJobRow) {
  const progress = progressFromJob(job) as ImportProgressState & Record<string, any>;
  const compacted = compactWowBoostBackfillProgress(progress);
  if (!compacted.changed) return { job, progress: compacted.progress, compacted: false };

  await updateImportJobProgress(env, job, compacted.progress);
  const reloaded = await getImportJob(env, job.id);
  return {
    job: reloaded || { ...job, progress: compacted.progress, status: compacted.progress.status },
    progress: compacted.progress,
    compacted: true,
  };
}

async function findActiveImportJob(env: Env, args: {
  workspace_id?: string | null;
  platform: string;
  connector_id?: string | null;
  from: string;
  to: string;
  filter?: string | null;
}) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from("integration_import_jobs")
    .select("*")
    .eq("platform", args.platform)
    .order("updated_at", { ascending: false })
    .limit(25);

  if (error) throw new Error(`Failed to read active import jobs: ${error.message}`);

  return ((data || []) as ImportJobRow[]).find((job) => shouldBlockDuplicateImport(job, args)) || null;
}

function importJobPlatformAliases(platform: string) {
  const normalized = coercePlatformKey(platform);
  const aliases = new Set<string>([normalized, String(platform || "").trim()]);
  if (normalized === wowSuiteKey("wowboost")) aliases.add("wowboost").add("wowsuite");
  if (normalized === "checkoutchamp") aliases.add("konnektive").add("konnective");
  return Array.from(aliases).filter(Boolean);
}

async function findLatestImportJob(env: Env, args: {
  workspace_id?: string | null;
  platform: string;
  connector_id?: string | null;
  activeOnly?: boolean;
}) {
  const supabase = getSupabase(env);
  const aliases = importJobPlatformAliases(args.platform);
  const { data, error } = await supabase
    .from("integration_import_jobs")
    .select("*")
    .in("platform", aliases)
    .order("updated_at", { ascending: false })
    .limit(25);

  if (error) throw new Error(`Failed to read import jobs: ${error.message}`);

  const workspaceId = String(args.workspace_id || "default");
  const connectorId = args.connector_id ? String(args.connector_id) : null;

  return ((data || []) as ImportJobRow[]).find((job) => {
    const progress = progressFromJob(job);
    if (args.activeOnly && !isActiveImportStatus(progress.status)) return false;
    return (
      progress.workspace_id === workspaceId &&
      (!connectorId || String(progress.connector_id || job.platform) === connectorId)
    );
  }) || null;
}

function connectorModuleForPlatform(platform: string) {
  const normalized = coercePlatformKey(platform);
  if (normalized === "konnektive") return "checkoutchamp";
  if (normalized === "wowsuite:wowboost") return "wowboost";
  return normalized;
}

function isSharedImportPlatform(platform: string) {
  return ["paypal", "shopify", "checkoutchamp", "wowboost"].includes(connectorModuleForPlatform(platform));
}

async function runImportJobChunk(env: Env, job: ImportJobRow): Promise<ImportChunkResponse> {
  const progress = progressFromJob(job);
  const platform = connectorModuleForPlatform(job.module || job.platform);
  const page = Math.max(1, Number(progress.current_page ?? 1) || 1);
  const cursor = progress.current_cursor || null;
  const windowIndex = Math.max(0, Number(progress.current_window_index ?? 0) || 0);

  if (platform === "paypal") {
    return adaptConnectorResponse(await runPaypalImport(env, {
      from: progress.requested_from,
      to: progress.requested_to,
      filter: progress.filter,
      page,
      windowIndex,
    }));
  }

  if (platform === "shopify") {
    return runShopifyImportChunk(env, {
      from: progress.requested_from,
      to: progress.requested_to,
      filter: progress.filter,
      cursor,
    });
  }

  if (platform === "checkoutchamp") {
    return runCheckoutChampImportChunk(env, {
      from: progress.requested_from,
      to: progress.requested_to,
      filter: progress.filter,
      page,
    });
  }

  if (platform === "wowboost" || platform === "wowsuite:wowboost") {
    return runWowBoostImportChunk(env, {
      from: progress.requested_from,
      to: progress.requested_to,
      page,
    });
  }

  throw new Error(`Unsupported import platform: ${platform}`);
}

async function continueImportJob(env: Env, jobId: string, args: { resume?: boolean } = {}) {
  const job = await getImportJob(env, jobId);
  if (!job) throw new Error("Import job not found");

  let progress = progressFromJob(job);
  if (progress.status === "cancelled") return { job, progress, chunk: null };
  if (progress.status === "completed" && !args.resume) return { job, progress, chunk: null };
  if (progress.status === "failed" && !args.resume) return { job, progress, chunk: null };

  progress = {
    ...(args.resume ? resumeImportProgress(progress) : progress),
    status: "importing",
    started_at: progress.started_at || new Date().toISOString(),
    completed_at: null,
    last_error: null,
    updated_at: new Date().toISOString(),
  };
  await updateImportJobProgress(env, job, progress);

  try {
    const chunk = await runImportJobChunk(env, job);
    const nextProgress = mergeImportProgress(progress, chunk);
    await updateImportJobProgress(env, job, nextProgress);
    return {
      job: await getImportJob(env, jobId),
      progress: nextProgress,
      chunk,
    };
  } catch (error) {
    const failed = failImportProgress(progress, error);
    await updateImportJobProgress(env, job, failed);
    throw error;
  }
}

async function getLatestCredential(env: Env, platform: string) {
  const supabase = getSupabase(env);
  const keys =
	  platform === "checkoutchamp"
	    ? ["checkoutchamp"]
	    : [coercePlatformKey(platform), platform];

  const { data, error } = await supabase
    .from("integrations_credentials")
    .select("*")
    .in("platform", keys)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`${platform} creds read failed: ${error.message}`);
  return data as any | null;
}

async function saveCredential(env: Env, args: { platform: string; baseUrl: string; username: string; password: string; metadata?: Record<string, any> }) {
  const supabase = getSupabase(env);
  const platform = coercePlatformKey(args.platform);
  const encrypted = await encryptSecret(env, args.password);

  const payload: Record<string, any> = {
    platform,
    base_url: String(args.baseUrl || "").trim().replace(/\/+$/, ""),
    username: String(args.username || "").trim(),
    password_iv: encrypted.iv_b64,
    password_ciphertext: encrypted.ct_b64,
    updated_at: new Date().toISOString(),
  };

  if (args.metadata !== undefined) {
    payload.metadata = args.metadata ?? {};
  }

  const { error } = await supabase.from("integrations_credentials").upsert(payload as any, { onConflict: "platform" });
  if (error) throw new Error(`Failed to save credentials: ${error.message}`);

  return payload;
}

async function updateCredentialMetadata(env: Env, platform: string, metadata: Record<string, any>) {
  const supabase = getSupabase(env);
  const { error } = await supabase
    .from("integrations_credentials")
    .update({ metadata, updated_at: new Date().toISOString() } as any)
    .eq("platform", coercePlatformKey(platform));

  if (error) throw new Error(`Failed to update credentials metadata: ${error.message}`);
}

function extractArrayFromResponse(js: any): any[] {
  if (Array.isArray(js)) return js;
  if (Array.isArray(js?.data)) return js.data;
  if (Array.isArray(js?.orders)) return js.orders;
  if (Array.isArray(js?.message?.data)) return js.message.data;
  if (Array.isArray(js?.result?.data)) return js.result.data;
  if (Array.isArray(js?.results)) return js.results;
  return [];
}

function classifyShopifyGraphqlError(status: number, text: string, parsed: any) {
  if (status === 429) return "Shopify Admin API rate limit exceeded. Try again after Shopify restores capacity.";
  if (status === 401) return "Shopify rejected the Admin API token.";
  if (status === 403) return "Shopify Admin API token is missing required access scopes.";

  const errors = Array.isArray(parsed?.errors) ? parsed.errors : [];
  const messages = errors.map((err: any) => String(err?.message ?? "")).filter(Boolean);
  const codes = errors.map((err: any) => String(err?.extensions?.code ?? "")).filter(Boolean);
  const combined = [...messages, ...codes].join(" ").toLowerCase();

  if (combined.includes("access_denied") || combined.includes("access denied") || combined.includes("scope") || combined.includes("permission")) {
    return "Shopify Admin API token is missing required access scopes.";
  }

  if (messages.length) return `Shopify Admin API error: ${messages.slice(0, 3).join("; ")}`;
  return `Shopify Admin API failed (${status}): ${text.slice(0, 300)}`;
}

async function shopifyGraphql(args: {
  shopDomain: string;
  apiVersion: string;
  token: string;
  query: string;
  variables?: Record<string, any>;
  timeoutMs?: number;
}) {
  const url = shopifyAdminGraphqlUrl(args.shopDomain, args.apiVersion);
  let res: Response;

  try {
    res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": args.token,
        },
        body: JSON.stringify({
          query: args.query,
          variables: args.variables ?? {},
        }),
      },
      args.timeoutMs ?? 30000,
    );
  } catch (e: any) {
    const message = String(e?.message || e);
    if (message.toLowerCase().includes("timed out")) {
      throw new Error("Shopify Admin API request timed out.");
    }
    throw new Error(`Shopify Admin API request failed. Check the shop domain. ${message}`);
  }

  const text = await readTextSafe(res);
  const parsed = safeJsonParse(text);

  if (!res.ok || !parsed || (Array.isArray(parsed.errors) && parsed.errors.length)) {
    throw new Error(classifyShopifyGraphqlError(res.status, text, parsed));
  }

  return parsed;
}

async function testShopifyConnection(args: { shopDomain: string; apiVersion?: string; token: string }) {
  const shopDomain = normalizeShopifyShopDomain(args.shopDomain);
  if (!shopDomain) {
    return {
      ok: false,
      message: "Invalid Shopify shop domain. Use your-store.myshopify.com or the store handle.",
    };
  }

  const apiVersion = normalizeShopifyApiVersion(args.apiVersion);
  const parsed = await shopifyGraphql({
    shopDomain,
    apiVersion,
    token: args.token,
    query: SHOPIFY_CONNECTION_TEST_QUERY,
    timeoutMs: 15000,
  });

  return {
    ok: true,
    message: "Connection successful.",
    shopDomain,
    apiVersion,
    shop: parsed?.data?.shop ?? null,
  };
}

async function getShopifyConnection(env: Env) {
  const creds = await getLatestCredential(env, "shopify");
  if (!creds) throw new Error("Shopify not connected. Save credentials first.");

  const shopDomain = normalizeShopifyShopDomain(creds.base_url);
  if (!shopDomain) throw new Error("Saved Shopify shop domain is invalid. Reconnect Shopify.");

  return {
    shopDomain,
    apiVersion: normalizeShopifyApiVersion(creds.username || DEFAULT_SHOPIFY_API_VERSION),
    token: await decryptSecretFromCredRow(env, creds),
    creds,
  };
}

async function normalizeShopifyOrderWithIdentity(order: any, shopDomain: string) {
  const normalized = normalizeShopifyOrderForPlatformOrder(order, shopDomain);
  if (!normalized) return null;

  const emailFields = await emailIdentityFields(normalized.email);
  const phone = normalizePhone(normalized.phone);

  return {
    ...normalized,
    ...emailFields,
    email: emailFields.customer_email,
    phone: phone || null,
    everflow_transaction_id: normalized.sub5 || null,
  };
}

async function insertShopifyLedgerEvents(env: Env, shopDomain: string, orders: any[]) {
  const eventsById = new Map<string, ReturnType<typeof buildShopifyLedgerEventsFromOrder>[number]>();

  for (const order of orders) {
    for (const event of buildShopifyLedgerEventsFromOrder(order, shopDomain)) {
      eventsById.set(event.transactionId, event);
    }
  }

  const events = Array.from(eventsById.values());
  if (!events.length) return { inserted: 0, skipped: 0 };

  const supabase = getSupabase(env);
  const eventIds = events.map((event) => event.transactionId);
  const existingIds = new Set<string>();

  for (let i = 0; i < eventIds.length; i += 100) {
    const chunk = eventIds.slice(i, i + 100);
    const { data: existing, error: existingError } = await supabase
      .from("conversions")
      .select("transaction_id")
      .eq("platform", "shopify")
      .in("transaction_id", chunk);

    if (existingError) throw new Error(`Shopify ledger dedupe failed: ${existingError.message}`);

    for (const row of existing || []) {
      existingIds.add(String((row as any).transaction_id || ""));
    }
  }

  const rowsToInsert = events
    .filter((event) => !existingIds.has(event.transactionId))
    .map((event) => {
      const sourceOrder = event.raw?.order || event.raw;
      const normalizedOrder = normalizeShopifyOrderForPlatformOrder(sourceOrder, shopDomain);
      const amountCents = normalizeLedgerAmount(event.ledgerType as LedgerType, toCents(event.amount));

      return {
        workspace_id: "default",
        ledger_type: event.ledgerType,
        event_source: "shopify",
        ingestion_method: "api_import",
        connector_id: shopDomain,
        tkid: normalizedOrder?.tkid || null,
        email: normalizedOrder?.email || null,
        phone: normalizePhone(normalizedOrder?.phone || "") || null,
        order_id: event.orderId,
        transaction_id: event.transactionId,
        parent_transaction_id: event.parentTransactionId || null,
        amount: amountCents / 100,
        currency: event.currency || "USD",
        platform: "shopify",
        source_system: "shopify",
        network: null,
        affiliate_id: normalizedOrder?.affiliate_id || null,
        campaign_id: normalizedOrder?.source_id || null,
        offer_id: normalizedOrder?.everflow_offer_id || null,
        status: event.status,
        reason: event.reason,
        raw: event.raw,
        meta: {
          external_event_id: event.transactionId,
          shop_domain: shopDomain,
          source: "shopify_import",
        },
        occurred_at: event.occurredAt,
      };
    });

  if (!rowsToInsert.length) return { inserted: 0, skipped: events.length };

  const { error: insertError } = await supabase.from("conversions").insert(rowsToInsert);
  if (insertError) throw new Error(`Shopify ledger insert failed: ${insertError.message}`);

  const rollup = await refreshProfitRollupsForInsertedRows(env, rowsToInsert as ProfitConversionRow[]);

  return {
    inserted: rowsToInsert.length,
    skipped: events.length - rowsToInsert.length,
    rollup_orders_refreshed: rollup.orders_refreshed,
    rollup_daily_refreshed: rollup.daily_refreshed,
    rollup_warnings: rollup.warnings,
  };
}

async function runShopifyImport(env: Env, args: RunImportArgs) {
  if (!parseYmd(args.from) || !parseYmd(args.to)) throw new Error("from/to must be YYYY-MM-DD");

  const connection = await getShopifyConnection(env);
  const supabase = getSupabase(env);
  const pageSize = Math.max(1, Math.min(100, Number(args.pageSize ?? 50)));
  const searchQuery = buildShopifyOrderSearchQuery({ from: args.from, to: args.to, filter: args.filter });

  let after: string | null = null;
  let page = 1;
  let totalFetched = 0;
  let totalUpserted = 0;
  let ledgerInserted = 0;
  let ledgerSkipped = 0;
  let rollupOrdersRefreshed = 0;
  let rollupDailyRefreshed = 0;
  const rollupWarnings: string[] = [];
  const maxPages = 250;

  while (page <= maxPages) {
    const parsed = await shopifyGraphql({
      shopDomain: connection.shopDomain,
      apiVersion: connection.apiVersion,
      token: connection.token,
      query: SHOPIFY_ORDERS_QUERY,
      variables: {
        first: pageSize,
        after,
        query: searchQuery,
      },
      timeoutMs: 30000,
    });

    const orderConnection = parsed?.data?.orders;
    const edges = Array.isArray(orderConnection?.edges) ? orderConnection.edges : [];
    const rawOrders = edges.map((edge: any) => edge?.node).filter(Boolean);
    totalFetched += rawOrders.length;

    const normalizedRows = await Promise.all(rawOrders.map((order: any) => normalizeShopifyOrderWithIdentity(order, connection.shopDomain)));
    const rows = dedupePlatformOrders(normalizedRows.filter(Boolean));

    if (rows.length) {
      const { error } = await supabase.from("platform_orders").upsert(rows as any[], { onConflict: "platform_order_id" });
      if (error) throw new Error(`Shopify DB upsert failed: ${error.message}`);
      totalUpserted += rows.length;

      const ledgerResult = await insertShopifyLedgerEvents(env, connection.shopDomain, rawOrders);
      ledgerInserted += ledgerResult.inserted;
      ledgerSkipped += ledgerResult.skipped;
      rollupOrdersRefreshed += Number((ledgerResult as any).rollup_orders_refreshed || 0);
      rollupDailyRefreshed += Number((ledgerResult as any).rollup_daily_refreshed || 0);
      rollupWarnings.push(...((ledgerResult as any).rollup_warnings || []));
    }

    const pageInfo = orderConnection?.pageInfo || {};
    if (!rawOrders.length || !pageInfo.hasNextPage || !pageInfo.endCursor) break;

    after = String(pageInfo.endCursor);
    page += 1;
  }

  return {
    fetched: totalFetched,
    upserted: totalUpserted,
    pages: page,
    ledger_inserted: ledgerInserted,
    ledger_skipped: ledgerSkipped,
    rollup_orders_refreshed: rollupOrdersRefreshed,
    rollup_daily_refreshed: rollupDailyRefreshed,
    rollup_warnings: rollupWarnings,
  };
}

async function runShopifyImportChunk(env: Env, args: { from: string; to: string; filter?: string | null; cursor?: string | null; pageSize?: number }): Promise<ImportChunkResponse> {
  if (!parseYmd(args.from) || !parseYmd(args.to)) throw new Error("from/to must be YYYY-MM-DD");

  const connection = await getShopifyConnection(env);
  const supabase = getSupabase(env);
  const pageSize = Math.max(1, Math.min(100, Number(args.pageSize ?? 50)));
  const searchQuery = buildShopifyOrderSearchQuery({ from: args.from, to: args.to, filter: args.filter });

  const parsed = await shopifyGraphql({
    shopDomain: connection.shopDomain,
    apiVersion: connection.apiVersion,
    token: connection.token,
    query: SHOPIFY_ORDERS_QUERY,
    variables: {
      first: pageSize,
      after: args.cursor || null,
      query: searchQuery,
    },
    timeoutMs: 30000,
  });

  const orderConnection = parsed?.data?.orders;
  const edges = Array.isArray(orderConnection?.edges) ? orderConnection.edges : [];
  const rawOrders = edges.map((edge: any) => edge?.node).filter(Boolean);
  const normalizedRows = await Promise.all(rawOrders.map((order: any) => normalizeShopifyOrderWithIdentity(order, connection.shopDomain)));
  const rows = dedupePlatformOrders(normalizedRows.filter(Boolean));

  if (rows.length) {
    const { error } = await supabase.from("platform_orders").upsert(rows as any[], { onConflict: "platform_order_id" });
    if (error) throw new Error(`Shopify DB upsert failed: ${error.message}`);
  }

  const ledgerResult = rows.length ? await insertShopifyLedgerEvents(env, connection.shopDomain, rawOrders) : { inserted: 0, skipped: 0 };
  const pageInfo = orderConnection?.pageInfo || {};
  const hasMore = Boolean(rawOrders.length && pageInfo.hasNextPage && pageInfo.endCursor);

  return {
    ok: true,
    has_more: hasMore,
    next_cursor: hasMore ? String(pageInfo.endCursor) : null,
    next_page: null,
    next_window_index: null,
    current_window: { from: args.from, to: args.to },
    metrics: {
      fetched: rawOrders.length,
      processed: rawOrders.length,
      rows_upserted: rows.length,
      ledger_inserted: Number((ledgerResult as any).inserted || 0),
      duplicates_skipped: Number((ledgerResult as any).skipped || 0),
      warnings: (ledgerResult as any).rollup_warnings || [],
    },
  };
}

async function testCheckoutChampConnection(args: { baseUrl: string; username: string; password: string }) {
  const base = String(args.baseUrl || DEFAULT_CC_BASE).replace(/\/+$/, "");
  const today = new Date();

  const url = new URL(`${base}/order/query/`);
  url.searchParams.set("loginId", args.username);
  url.searchParams.set("password", args.password);
  url.searchParams.set("startDate", fmtCcMdYy(today));
  url.searchParams.set("endDate", fmtCcMdYy(today));
  url.searchParams.set("resultsPerPage", "1");
  url.searchParams.set("page", "1");

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json, text/plain, */*" },
  });

  const text = await readTextSafe(res);
  const parsed = safeJsonParse(text);
  const resultText = String(parsed?.result || parsed?.status || parsed?.message || "");
  const looksOk = res.ok && !resultText.toUpperCase().includes("ERROR") && !resultText.toUpperCase().includes("FAIL");

  return {
    ok: looksOk,
    http_status: res.status,
    parsed,
    response_snippet: text.slice(0, 500),
  };
}

async function queryCheckoutChampOrders(args: {
  baseUrl: string;
  username: string;
  password: string;
  from: string;
  to: string;
  page: number;
  pageSize: number;
  filter?: string | null;
}) {
  const fromDt = parseYmd(args.from);
  const toDt = parseYmd(args.to);
  if (!fromDt || !toDt) throw new Error("from/to must be YYYY-MM-DD");

  const url = new URL(`${args.baseUrl.replace(/\/+$/, "")}/order/query/`);
  url.searchParams.set("loginId", args.username);
  url.searchParams.set("password", args.password);
  url.searchParams.set("startDate", fmtCcMdYy(fromDt));
  url.searchParams.set("endDate", fmtCcMdYy(toDt));
  url.searchParams.set("resultsPerPage", String(args.pageSize));
  url.searchParams.set("page", String(args.page));

  const filter = String(args.filter || "all_sales").toLowerCase();
  if (filter && filter !== "all_sales") url.searchParams.set("orderStatus", filter);

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetchWithTimeout(
        url.toString(),
        {
          method: "GET",
          headers: { Accept: "application/json, text/plain, */*" },
        },
        30000,
      );

      const text = await readTextSafe(res);
      const retryableStatus = res.status === 429 || res.status >= 500;

      if (!res.ok) {
        const err = new Error(`CheckoutChamp order query failed (${res.status}): ${text.slice(0, 300)}`);
        if (retryableStatus && attempt < 3) {
          lastError = err;
          await sleepMs(500 * attempt);
          continue;
        }
        throw err;
      }

      const js = safeJsonParse(text);
      if (!js) throw new Error(`CheckoutChamp order query returned invalid JSON: ${text.slice(0, 300)}`);

      return js;
    } catch (e: any) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt >= 3) break;
      await sleepMs(500 * attempt);
    }
  }

  throw lastError || new Error("CheckoutChamp order query failed.");
}

function sleepMs(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickProductName(row: Record<string, any>) {
  return pickField(row, [
    "productName",
    "ProductName",
    "Product Name",
    "product_name",
    "productDescription",
    "Product Description",
    "name",
    "title",
  ]);
}

function pickProductSku(row: Record<string, any>) {
  return pickField(row, [
    "sku",
    "SKU",
    "SKUId",
    "skuId",
    "productSku",
    "product_sku",
    "productId",
    "product_id",
  ]);
}

function enrichCheckoutChampRaw(order: any) {
  const productName = pickProductName(order);
  const sku = pickProductSku(order);

  if (!productName && !sku) return order;

  return {
    ...order,
    productName: order.productName ?? (productName || undefined),
    product_name: order.product_name ?? (productName || undefined),
    sku: order.sku ?? (sku || undefined),
  };
}

async function normalizeCheckoutChampOrder(order: any) {
  const id = pickField(order, ["orderId", "order_id", "orderID", "id", "orderNumber", "order_number"]);
  if (!id) return null;

  const statusRaw = pickField(order, [
    "orderStatus",
    "status",
    "order_status",
    "paymentStatus",
    "transactionStatus",
    "responseType",
    "responseText",
  ]);
  const status = normalizeOrderStatus(statusRaw);

  const ts =
    parseDateToIsoMaybe(
      pickField(order, [
        "dateCreated",
        "createdAt",
        "createDate",
        "orderDate",
        "date",
        "lastUpdated",
        "updatedAt",
        "dateUpdated",
      ])
    ) || new Date().toISOString();

  let gross = parseMoneyMaybe(
    pickField(order, [
      "totalAmount",
      "orderTotal",
      "total",
      "amount",
      "price",
      "gross",
      "revenue",
      "order_total",
      "total_amount",
    ])
  );
  if (gross == null) gross = 0;
  if ((status === "REFUNDED" || status === "CHARGEBACK" || status === "CANCELLED") && gross > 0) {
    gross = -Math.abs(gross);
  }

  const emailFields = await emailIdentityFields(
    pickField(order, ["email", "customerEmail", "emailAddress", "shipEmail", "billingEmail", "billing_email"])
  );

  const phone = normalizePhone(
    pickField(order, ["phone", "customerPhone", "phoneNumber", "shipPhone", "billingPhone", "phone_number"])
  );

  const transactionId =
    pickField(order, [
      "transactionId",
      "transaction_id",
      "authId",
      "paymentId",
      "payment_id",
      "gatewayTransactionId",
      "gateway_transaction_id",
    ]) || null;

  const everflowTid = pickEverflowTid(order) || null;

  return {
    platform: "checkoutchamp",
    platform_order_id: `checkoutchamp:${id}`,
    platform_store_id: pickField(order, ["campaignId", "campaign_id", "merchantId", "storeId"]) || null,
    order_id: String(id),
    order_ts: ts,
    status,
    status_norm: status,
    gross_amount: gross,
    currency: pickField(order, ["currency", "currencyCode"]) || "USD",

    ...emailFields,
    email: emailFields.customer_email,
    phone: phone || null,

    transaction_id: transactionId,
    everflow_transaction_id: everflowTid || null,
    tkid: pickTrackingId(order) || null,
    affiliate_id: pickField(order, ["affiliateId", "affiliate_id", "affId", "affid"]) || null,
    everflow_offer_id: pickField(order, ["offerId", "offer_id", "campaignId", "campaign_id"]) || null,
    source_id: pickField(order, ["sourceId", "source_id", "sid", "source"]) || null,
    sub1: pickField(order, ["sub1", "s1", "S1"]) || null,
    sub2: pickField(order, ["sub2", "s2", "S2"]) || null,
    sub3: pickField(order, ["sub3", "s3", "S3"]) || null,
    sub4: pickField(order, ["sub4", "s4", "S4"]) || null,
    sub5: pickField(order, ["sub5", "s5", "S5"]) || null,

    product_subtotal: parseMoneyMaybe(pickField(order, ["productSubtotal", "product_subtotal", "subtotal", "subTotal"])) ?? null,
    shipping_amount: parseMoneyMaybe(pickField(order, ["shippingAmount", "shipping", "shippingTotal", "shipping_total"])) ?? null,
    tax_amount: parseMoneyMaybe(pickField(order, ["taxAmount", "tax", "salesTax", "sales_tax"])) ?? null,
    product_cost: parseMoneyMaybe(pickField(order, ["productCost", "product_cost", "cogs"])) ?? null,
    shipping_cost: parseMoneyMaybe(pickField(order, ["shippingCost", "shipping_cost"])) ?? null,
    gateway_fee: parseMoneyMaybe(pickField(order, ["gatewayFee", "gateway_fee", "processorFee", "processor_fee"])) ?? null,
    chargeback_fee: parseMoneyMaybe(pickField(order, ["chargebackFee", "chargeback_fee"])) ?? null,
    tracking_number: pickField(order, ["trackingNumber", "tracking_number", "shipmentTrackingNumber"]) || null,
    shipping_carrier: pickField(order, ["shippingCarrier", "shipping_carrier", "carrier"]) || null,
    raw_json: enrichCheckoutChampRaw(order),
  };
}

type CheckoutChampLedgerEvent = {
  ledgerType: LedgerType;
  transactionId: string;
  parentTransactionId?: string | null;
  amount: number;
  status: string;
  reason: string;
  occurredAt: string;
  row: any;
};

function stableCheckoutChampEventId(row: any, ledgerType: LedgerType) {
  const base = String(
    row.platform_order_id ||
      (row.order_id ? `checkoutchamp:${row.order_id}` : "") ||
      row.transaction_id ||
      "unknown",
  ).trim();
  const externalTx = String(row.transaction_id || row.order_id || "").trim();
  return `${base}:${externalTx || "no-transaction"}:${ledgerType}`;
}

function buildCheckoutChampLedgerEvents(row: any): CheckoutChampLedgerEvent[] {
  const status = String(row.status || "").toUpperCase();
  const gross = Number(row.gross_amount ?? 0) || 0;
  const grossAbs = Math.abs(gross);
  const occurredAt = String(row.order_ts || new Date().toISOString());
  const events: CheckoutChampLedgerEvent[] = [];

  if (status === "COMPLETED" && gross > 0) {
    events.push({
      ledgerType: "sale",
      transactionId: stableCheckoutChampEventId(row, "sale"),
      parentTransactionId: row.transaction_id || null,
      amount: gross,
      status,
      reason: "Konnektive import sale",
      occurredAt,
      row,
    });
  }

  if (status === "REFUNDED" && grossAbs > 0) {
    events.push({
      ledgerType: "refund",
      transactionId: stableCheckoutChampEventId(row, "refund"),
      parentTransactionId: row.transaction_id || null,
      amount: grossAbs,
      status,
      reason: "Konnektive import refund",
      occurredAt,
      row,
    });
  }

  if (status === "CHARGEBACK" && grossAbs > 0) {
    events.push({
      ledgerType: "chargeback",
      transactionId: stableCheckoutChampEventId(row, "chargeback"),
      parentTransactionId: row.transaction_id || null,
      amount: grossAbs,
      status,
      reason: "Konnektive import chargeback",
      occurredAt,
      row,
    });
  }

  const chargebackFee = Math.abs(Number(row.chargeback_fee ?? 0) || 0);
  if (chargebackFee > 0) {
    events.push({
      ledgerType: "chargeback_fee",
      transactionId: stableCheckoutChampEventId(row, "chargeback_fee"),
      parentTransactionId: row.transaction_id || null,
      amount: chargebackFee,
      status: "chargeback_fee",
      reason: "Konnektive import chargeback fee",
      occurredAt,
      row,
    });
  }

  const processorFee = Math.abs(Number(row.gateway_fee ?? 0) || 0);
  if (processorFee > 0) {
    events.push({
      ledgerType: "processor_fee",
      transactionId: stableCheckoutChampEventId(row, "processor_fee"),
      parentTransactionId: row.transaction_id || null,
      amount: processorFee,
      status: "processor_fee",
      reason: "Konnektive import processor fee",
      occurredAt,
      row,
    });
  }

  return events;
}

async function insertCheckoutChampLedgerEvents(env: Env, rows: any[]) {
  const eventsById = new Map<string, CheckoutChampLedgerEvent>();

  for (const row of rows) {
    for (const event of buildCheckoutChampLedgerEvents(row)) {
      eventsById.set(event.transactionId, event);
    }
  }

  const events = Array.from(eventsById.values());
  if (!events.length) return { inserted: 0, skipped: 0 };

  const supabase = getSupabase(env);
  const eventIds = events.map((event) => event.transactionId);
  const existingIds = new Set<string>();

  for (let i = 0; i < eventIds.length; i += 100) {
    const chunk = eventIds.slice(i, i + 100);
    const { data: existing, error: existingError } = await supabase
      .from("conversions")
      .select("transaction_id")
      .eq("platform", "checkoutchamp")
      .in("transaction_id", chunk);

    if (existingError) throw new Error(`Konnektive ledger dedupe failed: ${existingError.message}`);

    for (const row of existing || []) {
      existingIds.add(String((row as any).transaction_id || ""));
    }
  }
  const rowsToInsert = events
    .filter((event) => !existingIds.has(event.transactionId))
    .map((event) => {
      const row = event.row;
      const amountCents = normalizeLedgerAmount(event.ledgerType, toCents(event.amount));

      return {
		  workspace_id: "default",
		  ledger_type: event.ledgerType,
		
		  event_source: "konnektive",
		  ingestion_method: "api_import",
		  connector_id: String(
		    row.platform_store_id ||
		      row.campaign_id ||
		      "konnektive_default"
		  ),
		
		  tkid: row.tkid || null,
        email: row.email || row.customer_email || null,
        phone: row.phone || null,
        order_id: row.order_id || null,
        transaction_id: event.transactionId,
        parent_transaction_id: event.parentTransactionId || null,
        amount: amountCents / 100,
        currency: row.currency || "USD",
        platform: "checkoutchamp",
        source_system: "konnektive",
        network: null,
        affiliate_id: row.affiliate_id || null,
        campaign_id: row.platform_store_id || null,
        offer_id: row.everflow_offer_id || null,
        status: event.status,
        reason: event.reason,
        raw: row.raw_json || row,
        meta: {
          external_event_id: event.transactionId,
          platform_order_id: row.platform_order_id || null,
          original_transaction_id: row.transaction_id || null,
          source: "konnektive_import",
        },
        occurred_at: event.occurredAt,
      };
    });

  if (!rowsToInsert.length) return { inserted: 0, skipped: events.length };

  const { error: insertError } = await supabase.from("conversions").insert(rowsToInsert);
  if (insertError) throw new Error(`Konnektive ledger insert failed: ${insertError.message}`);

  const rollup = await refreshProfitRollupsForInsertedRows(env, rowsToInsert as ProfitConversionRow[]);

  return {
    inserted: rowsToInsert.length,
    skipped: events.length - rowsToInsert.length,
    rollup_orders_refreshed: rollup.orders_refreshed,
    rollup_daily_refreshed: rollup.daily_refreshed,
    rollup_warnings: rollup.warnings,
  };
}

async function runCheckoutChampImport(env: Env, args: RunImportArgs) {
  const creds = await getLatestCredential(env, "checkoutchamp");
  if (!creds) throw new Error("CheckoutChamp/Konnektive not connected. Save credentials first.");

  const username = String(creds.username ?? "").trim();
  const password = await decryptSecretFromCredRow(env, creds);
  const baseUrl = String(creds.base_url || env.DEFAULT_CC_BASE || DEFAULT_CC_BASE).replace(/\/+$/, "");
  const pageSize = Math.max(1, Math.min(200, Number(args.pageSize ?? 200)));
  const supabase = getSupabase(env);

  let page = 1;
  let totalFetched = 0;
  let totalUpserted = 0;
  let ledgerInserted = 0;
  let ledgerSkipped = 0;
  let rollupOrdersRefreshed = 0;
  let rollupDailyRefreshed = 0;
  const rollupWarnings: string[] = [];
  const maxPages = 250;

  while (page <= maxPages) {
    const js = await queryCheckoutChampOrders({
      baseUrl,
      username,
      password,
      from: args.from,
      to: args.to,
      page,
      pageSize,
      filter: args.filter,
    });

    const rawRows = extractArrayFromResponse(js);
    totalFetched += rawRows.length;

    const normalizedRows = await Promise.all(rawRows.map((o: any) => normalizeCheckoutChampOrder(o)));
	const rows = dedupePlatformOrders(normalizedRows.filter(Boolean));

    if (rows.length) {
      const { error } = await supabase.from("platform_orders").upsert(rows as any[], { onConflict: "platform_order_id" });
      if (error) throw new Error(`CheckoutChamp DB upsert failed: ${error.message}`);
      totalUpserted += rows.length;

      const ledgerResult = await insertCheckoutChampLedgerEvents(env, rows);
      ledgerInserted += ledgerResult.inserted;
      ledgerSkipped += ledgerResult.skipped;
      rollupOrdersRefreshed += Number((ledgerResult as any).rollup_orders_refreshed || 0);
      rollupDailyRefreshed += Number((ledgerResult as any).rollup_daily_refreshed || 0);
      rollupWarnings.push(...((ledgerResult as any).rollup_warnings || []));
    }

    const totalResults = Number(js.totalResults ?? js.total_results ?? js.total ?? 0);
    if (!rawRows.length || rawRows.length < pageSize || (totalResults && page * pageSize >= totalResults)) break;

    page += 1;
  }

  return {
    fetched: totalFetched,
    upserted: totalUpserted,
    pages: page,
    ledger_inserted: ledgerInserted,
    ledger_skipped: ledgerSkipped,
    rollup_orders_refreshed: rollupOrdersRefreshed,
    rollup_daily_refreshed: rollupDailyRefreshed,
    rollup_warnings: rollupWarnings,
  };
}

async function runCheckoutChampImportChunk(env: Env, args: { from: string; to: string; filter?: string | null; page?: number; pageSize?: number }): Promise<ImportChunkResponse> {
  const creds = await getLatestCredential(env, "checkoutchamp");
  if (!creds) throw new Error("CheckoutChamp/Konnektive not connected. Save credentials first.");

  const username = String(creds.username ?? "").trim();
  const password = await decryptSecretFromCredRow(env, creds);
  const baseUrl = String(creds.base_url || env.DEFAULT_CC_BASE || DEFAULT_CC_BASE).replace(/\/+$/, "");
  const pageSize = Math.max(1, Math.min(200, Number(args.pageSize ?? 200)));
  const page = Math.max(1, Number(args.page ?? 1) || 1);
  const supabase = getSupabase(env);

  const js = await queryCheckoutChampOrders({
    baseUrl,
    username,
    password,
    from: args.from,
    to: args.to,
    page,
    pageSize,
    filter: args.filter,
  });

  const rawRows = extractArrayFromResponse(js);
  const normalizedRows = await Promise.all(rawRows.map((o: any) => normalizeCheckoutChampOrder(o)));
  const rows = dedupePlatformOrders(normalizedRows.filter(Boolean));

  if (rows.length) {
    const { error } = await supabase.from("platform_orders").upsert(rows as any[], { onConflict: "platform_order_id" });
    if (error) throw new Error(`CheckoutChamp DB upsert failed: ${error.message}`);
  }

  const ledgerResult = rows.length ? await insertCheckoutChampLedgerEvents(env, rows) : { inserted: 0, skipped: 0 };
  const totalResults = Number(js.totalResults ?? js.total_results ?? js.total ?? 0);
  const hasMore = Boolean(rawRows.length && rawRows.length >= pageSize && (!totalResults || page * pageSize < totalResults));

  return {
    ok: true,
    has_more: hasMore,
    next_cursor: null,
    next_page: hasMore ? page + 1 : null,
    next_window_index: null,
    current_window: { from: args.from, to: args.to },
    metrics: {
      fetched: rawRows.length,
      processed: rawRows.length,
      rows_upserted: rows.length,
      ledger_inserted: Number((ledgerResult as any).inserted || 0),
      duplicates_skipped: Number((ledgerResult as any).skipped || 0),
      warnings: (ledgerResult as any).rollup_warnings || [],
    },
  };
}

async function runWowBoostImportChunk(env: Env, args: { from: string; to: string; page?: number; pageSize?: number }): Promise<ImportChunkResponse> {
  const page = Math.max(1, Number(args.page ?? 1) || 1);
  const pageSize = Math.max(1, Math.min(100, Number(args.pageSize ?? 100)));
  const result = await runWowBoostImportPage(env, {
    from: args.from,
    to: args.to,
    page,
    pageSize,
  });

  return {
    ok: true,
    has_more: Boolean(result.hasMore),
    next_cursor: null,
    next_page: result.hasMore ? Number(result.nextPage ?? page + 1) : null,
    next_window_index: null,
    current_window: { from: args.from, to: args.to },
    metrics: {
      fetched: Number(result.fetched || 0),
      processed: Number(result.fetched || 0),
      rows_upserted: Number(result.upserted || 0),
      ledger_inserted: 0,
      duplicates_skipped: 0,
      warnings: (result as any).identity?.warnings || [],
    },
  };
}

type WowBoostExportResp = { link?: string; hasMoreToExport?: boolean; nextExport?: string };

async function wowBoostExportPage(args: { exportBase: string; bearer: string; page: number; pageSize: number; fromYmd: string; toYmd: string }) {
  const url = new URL(`${args.exportBase.replace(/\/+$/, "")}/order/export/${args.page}/${args.pageSize}`);
  url.searchParams.set("StartDate", args.fromYmd);
  url.searchParams.set("EndDate", args.toYmd);

  const res = await fetchWithTimeout(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `bearer ${args.bearer}`,
      Accept: "application/json, text/plain, */*",
    },
  }, 30000);

  const text = await readTextSafe(res);
  if (!res.ok) throw new Error(`WowBoost export failed (${res.status}): ${text || res.statusText}`);

  const js = safeJsonParse(text) as WowBoostExportResp | null;
  if (!js) throw new Error(`WowBoost export: invalid JSON: ${text.slice(0, 200)}`);

  const link = String(js.link ?? "").trim();
  if (!link) throw new Error(`WowBoost export: missing CSV link. resp=${text.slice(0, 200)}`);

  return {
    link,
    hasMore: Boolean(js.hasMoreToExport),
    nextExport: String(js.nextExport ?? "").trim() || null,
	};
}

async function getWowBoostRuntimeAuth(env: Env) {
  const creds = await getLatestCredential(env, "wowboost");
  if (!creds) throw new Error("WowBoost not connected. Save credentials first.");

  const authBase = String((creds as any).base_url || env.DEFAULT_WOWSUITE_AUTH_BASE || DEFAULT_WOWSUITE_AUTH_BASE).replace(/\/+$/, "");
  const exportBase = String(env.DEFAULT_WOWSUITE_EXPORT_BASE || DEFAULT_WOWSUITE_EXPORT_BASE).replace(/\/+$/, "");
  const username = String((creds as any).username ?? "").trim();
  const password = await decryptSecretFromCredRow(env, creds as any);
  const bearer = await wowSuiteGetBearerToken({ authBase, username, password });
  return { authBase, exportBase, bearer };
}

async function wowBoostStageRowsFromExportRows(args: {
  rows: Record<string, any>[];
  workspace_id: string;
  job_id: string;
  connector_id: string;
  requested_from: string;
  requested_to: string;
  export_page: number;
}) {
  const staged = new Map<string, Record<string, any>>();
  let duplicatesSkipped = 0;
  for (const raw of args.rows || []) {
    const normalized = normalizeWowBoostCommerceReferenceExportRow(raw);
    const orderNumber = String(normalized.order_number || "").trim();
    const orderId = String(normalized.order_id || "").trim();
    if (!orderNumber || !orderId) continue;

    const sourceHash = await sha256Hex(JSON.stringify({
      order_number: orderNumber,
      order_id: orderId,
      transaction_id: normalized.transaction_id || null,
      order_date: normalized.order_ts || null,
      reference_id: normalized.commerce_reference || null,
    }));

    const row = {
      workspace_id: args.workspace_id,
      job_id: args.job_id,
      connector_id: args.connector_id,
      requested_from: args.requested_from,
      requested_to: args.requested_to,
      export_page: args.export_page,
      order_number: orderNumber,
      order_id: orderId,
      transaction_id: normalized.transaction_id || null,
      order_date: parseDateToIsoMaybe(normalized.order_ts) || null,
      reference_id: normalized.commerce_reference || null,
      source_hash: sourceHash,
      updated_at: new Date().toISOString(),
    };

    const key = `${args.job_id}\u0000${orderNumber}\u0000${orderId}`;
    const existing = staged.get(key);
    if (!existing) {
      staged.set(key, row);
      continue;
    }
    duplicatesSkipped += 1;
    staged.set(key, {
      ...existing,
      transaction_id: existing.transaction_id || row.transaction_id,
      order_date: existing.order_date || row.order_date,
      reference_id: existing.reference_id || row.reference_id,
      updated_at: row.updated_at,
    });
  }
  return { rows: Array.from(staged.values()), duplicates_skipped: duplicatesSkipped };
}

type WowBoostRuntimeTargetCoverage = {
  target_order_numbers_total: number;
  target_order_numbers_mapped: number;
  target_order_numbers_remaining: number;
  target_mapping_coverage_percent: number;
};

function normalizeWowBoostRuntimeTargetCoverage(row: Record<string, any> | null | undefined): WowBoostRuntimeTargetCoverage {
  const total = Math.max(0, Number(row?.target_order_numbers_total || 0));
  const mapped = Math.max(0, Number(row?.target_order_numbers_mapped || 0));
  const remaining = Math.max(0, Number(row?.target_order_numbers_remaining ?? Math.max(0, total - mapped)));
  const percent = total ? Math.round((mapped * 10000) / total) / 100 : 100;
  return {
    target_order_numbers_total: total,
    target_order_numbers_mapped: mapped,
    target_order_numbers_remaining: remaining,
    target_mapping_coverage_percent: Number(row?.target_mapping_coverage_percent ?? percent),
  };
}

function wowBoostRuntimeTargetCoverageMetadata(coverage: WowBoostRuntimeTargetCoverage) {
  return {
    target_order_numbers_total: coverage.target_order_numbers_total,
    target_order_numbers_mapped: coverage.target_order_numbers_mapped,
    target_order_numbers_remaining: coverage.target_order_numbers_remaining,
    target_mapping_coverage_percent: coverage.target_mapping_coverage_percent,
  };
}

async function syncWowBoostRuntimeTargetCoverage(env: Env, job: ImportJobRow) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase.rpc("sync_wowboost_order_reference_target_coverage", {
    p_job_id: job.id,
  });
  if (error) throw new Error(`WowBoost runtime target coverage sync failed: ${error.message}`);
  return normalizeWowBoostRuntimeTargetCoverage(Array.isArray(data) ? data[0] : data);
}

async function ensureWowBoostRuntimeTargetSet(env: Env, job: ImportJobRow, progress: ConnectorRuntimeProgress & Record<string, any>) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase.rpc("populate_wowboost_order_reference_targets", {
    p_job_id: job.id,
    p_workspace_id: progress.workspace_id || "default",
    p_connector_id: progress.connector_id || WOWBOOST_BACKFILL_CONNECTOR_ID,
    p_requested_from: progress.requested_from,
    p_requested_to: progress.requested_to,
  });
  if (error) throw new Error(`WowBoost runtime target initialization failed: ${error.message}`);
  return normalizeWowBoostRuntimeTargetCoverage(Array.isArray(data) ? data[0] : data);
}

async function unresolvedWowBoostRuntimeTargetOrderNumbers(env: Env, job: ImportJobRow, orderNumbers: string[]) {
  const uniqueOrderNumbers = Array.from(new Set(orderNumbers.map((value) => String(value || "").trim()).filter(Boolean)));
  if (!uniqueOrderNumbers.length) return new Set<string>();

  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from("wowboost_order_reference_targets")
    .select("order_number")
    .eq("job_id", job.id)
    .is("mapped_at", null)
    .in("order_number", uniqueOrderNumbers);
  if (error) throw new Error(`WowBoost runtime target lookup failed: ${error.message}`);

  return new Set((data || []).map((row: any) => String(row.order_number || "").trim()).filter(Boolean));
}

async function filterWowBoostStageRowsForUnresolvedTargets(env: Env, job: ImportJobRow, rows: Record<string, any>[]) {
  const pageOrderNumbers = rows.map((row) => String(row.order_number || "").trim()).filter(Boolean);
  const unresolvedTargets = await unresolvedWowBoostRuntimeTargetOrderNumbers(env, job, pageOrderNumbers);
  const usefulRows = rows.filter((row) => unresolvedTargets.has(String(row.order_number || "").trim()));
  return {
    rows: usefulRows,
    skipped_unrelated_or_mapped: rows.length - usefulRows.length,
    target_order_numbers_seen: unresolvedTargets.size,
  };
}

async function enqueueWowBoostRuntimeReconciliationStart(env: Env, job: ImportJobRow, progress: ConnectorRuntimeProgress & Record<string, any>) {
  await createAndEnqueueConnectorRuntimeTask(env, {
    job_id: job.id,
    workspace_id: progress.workspace_id,
    connector_id: progress.connector_id,
    task_type: "wowboost_reconcile_legacy_orders",
    phase: "reconcile_legacy_orders",
    cursor: serializeWowBoostOrderDetailsBackfillCursor({ current_platform: "wowboost", platform_order_id: null }),
    payload: {
      cursor: serializeWowBoostOrderDetailsBackfillCursor({ current_platform: "wowboost", platform_order_id: null }),
      limit: WOWBOOST_RUNTIME_DEFAULT_RECONCILE_LIMIT,
    },
    dedupe_key: "reconcile_legacy_orders:start",
    max_attempts: 5,
  });
}

async function stopWowBoostRuntimeStaging(env: Env, args: {
  job: ImportJobRow;
  progress: ConnectorRuntimeProgress & Record<string, any>;
  coverage: WowBoostRuntimeTargetCoverage;
  stop_reason: string;
  page: number | null;
  records_discovered?: number;
  records_succeeded?: number;
  duplicates_skipped?: number;
  skipped_unrelated_or_mapped?: number;
  fingerprint_history?: string[];
  extra_metadata?: Record<string, any>;
}) {
  const progress = args.progress;
  const metadata = {
    ...(progress.metadata || {}),
    ...wowBoostRuntimeTargetCoverageMetadata(args.coverage),
    export_pages_scanned: Number(progress.metadata?.export_pages_scanned || progress.metadata?.export_pages_processed || 0) + (args.records_discovered === undefined ? 0 : 1),
    export_rows_seen: Number(progress.metadata?.export_rows_seen || progress.metadata?.export_rows_fetched || 0) + Number(args.records_discovered || 0),
    export_mappings_staged: Number(progress.metadata?.export_mappings_staged || 0) + Number(args.records_succeeded || 0),
    export_stage_duplicates_skipped: Number(progress.metadata?.export_stage_duplicates_skipped || 0) + Number(args.duplicates_skipped || 0),
    export_stage_unrelated_or_mapped_rows_skipped:
      Number(progress.metadata?.export_stage_unrelated_or_mapped_rows_skipped || 0) + Number(args.skipped_unrelated_or_mapped || 0),
    staging_stop_reason: args.stop_reason,
    last_export_page: args.page,
    targets_not_found_after_export_scan:
      args.stop_reason === "all_targets_mapped" ? 0 : args.coverage.target_order_numbers_remaining,
    ...(args.fingerprint_history ? { export_page_fingerprints: args.fingerprint_history } : {}),
    ...(args.extra_metadata || {}),
  };

  const nextProgress = mergeConnectorRuntimeCounters(progress, {
    records_discovered: Number(args.records_discovered || 0),
    records_succeeded: Number(args.records_succeeded || 0),
    records_skipped: Number(args.skipped_unrelated_or_mapped || 0),
  }, {
    status: "running",
    phase: "reconcile_legacy_orders",
    page: null,
    last_error: null,
    metadata,
  });
  nextProgress.started_at = nextProgress.started_at || new Date().toISOString();
  await updateConnectorRuntimeJobProgress(env, args.job, nextProgress);

  if (args.stop_reason === "paging_loop_detected" || args.stop_reason === "max_export_pages_reached") {
    await insertConnectorRuntimeError(env, {
      job_id: args.job.id,
      connector_id: progress.connector_id,
      record_identifier: String(args.page || ""),
      error_class: args.stop_reason,
      message: `WowBoost staging stopped with ${args.coverage.target_order_numbers_remaining} unresolved target order number(s).`,
      classification: "permanent",
    }).catch(() => {});
  }

  await enqueueWowBoostRuntimeReconciliationStart(env, args.job, nextProgress);

  return {
    rows_fetched: Number(args.records_discovered || 0),
    staged: Number(args.records_succeeded || 0),
    duplicates_skipped: Number(args.duplicates_skipped || 0),
    skipped_unrelated_or_mapped: Number(args.skipped_unrelated_or_mapped || 0),
    has_more: false,
    next_page: null,
    staging_stop_reason: args.stop_reason,
    ...wowBoostRuntimeTargetCoverageMetadata(args.coverage),
  };
}

async function stageWowBoostExportPageRuntimeTask(env: Env, job: ImportJobRow, task: ConnectorImportTaskRow) {
  const progress = connectorRuntimeProgressFromJob(job);
  const page = Math.max(1, Number(task.page || task.payload?.page || 1));
  const pageSize = Math.max(1, Math.min(1000, Number(task.payload?.page_size || WOWBOOST_RUNTIME_DEFAULT_EXPORT_PAGE_SIZE)));
  const maxExportPages = normalizeWowBoostRuntimeMaxExportPages(progress.metadata?.max_export_pages || WOWBOOST_RUNTIME_DEFAULT_MAX_EXPORT_PAGES);
  const initialCoverage = await ensureWowBoostRuntimeTargetSet(env, job, progress);

  const earlyStop = wowBoostRuntimeStagingStopDecision({
    target_total: initialCoverage.target_order_numbers_total,
    target_remaining: initialCoverage.target_order_numbers_remaining,
    rows_fetched: 1,
    has_more: true,
    page,
    max_pages: maxExportPages,
  });
  if (earlyStop.should_stop && earlyStop.reason === "all_targets_mapped") {
    return stopWowBoostRuntimeStaging(env, {
      job,
      progress,
      coverage: initialCoverage,
      stop_reason: earlyStop.reason,
      page: null,
      extra_metadata: {
        max_export_pages: maxExportPages,
      },
    });
  }

  const { exportBase, bearer } = await getWowBoostRuntimeAuth(env);

  const exp = await wowBoostExportPage({
    exportBase,
    bearer,
    page,
    pageSize,
    fromYmd: progress.requested_from,
    toYmd: progress.requested_to,
  });

  const csvRes = await fetchWithTimeout(exp.link, { method: "GET", headers: { Accept: "text/csv,*/*" } }, 30000);
  const csvText = await readTextSafe(csvRes);
  if (!csvRes.ok) throw new Error(`WowBoost runtime export CSV download failed (${csvRes.status}): ${csvText.slice(0, 200)}`);

  const parsed = parseCsv(csvText);
  const pageFingerprint = wowBoostExportPageFingerprint(parsed.rows);
  const pageFingerprintHistory = Array.isArray(progress.metadata?.export_page_fingerprints)
    ? progress.metadata.export_page_fingerprints
    : [];
  const repeatedPage = wowBoostRuntimeRepeatedPageDetected({
    fingerprint: pageFingerprint,
    history: pageFingerprintHistory,
  });
  const nextFingerprintHistory = appendWowBoostRuntimePageFingerprint({
    fingerprint: pageFingerprint,
    history: pageFingerprintHistory,
  });
  const stagedResultAll = await wowBoostStageRowsFromExportRows({
    rows: parsed.rows,
    workspace_id: progress.workspace_id,
    job_id: job.id,
    connector_id: progress.connector_id,
    requested_from: progress.requested_from,
    requested_to: progress.requested_to,
    export_page: page,
  });
  const targetFiltered = await filterWowBoostStageRowsForUnresolvedTargets(env, job, stagedResultAll.rows);
  const staged = targetFiltered.rows;

  let stagedCount = 0;
  if (staged.length) {
    const supabase = getSupabase(env);
    const { data, error } = await supabase
      .from("wowboost_order_reference_stage")
      .upsert(staged, { onConflict: "job_id,order_number,order_id" })
      .select("id");
    if (error) throw new Error(`WowBoost stage mapping upsert failed: ${error.message}`);
    stagedCount = (data || []).length;
  }

  const coverage = await syncWowBoostRuntimeTargetCoverage(env, job);
  const hasMore = Boolean(exp.hasMore);
  const stopDecision = wowBoostRuntimeStagingStopDecision({
    target_total: coverage.target_order_numbers_total,
    target_remaining: coverage.target_order_numbers_remaining,
    rows_fetched: parsed.rows.length,
    has_more: hasMore,
    repeated_page: repeatedPage,
    page,
    max_pages: maxExportPages,
  });
  if (stopDecision.should_stop) {
    return stopWowBoostRuntimeStaging(env, {
      job,
      progress,
      coverage,
      stop_reason: stopDecision.reason || "export_ended",
      page,
      records_discovered: parsed.rows.length,
      records_succeeded: stagedCount,
      duplicates_skipped: stagedResultAll.duplicates_skipped,
      skipped_unrelated_or_mapped: targetFiltered.skipped_unrelated_or_mapped,
      fingerprint_history: nextFingerprintHistory,
      extra_metadata: {
        max_export_pages: maxExportPages,
        last_page_fingerprint: pageFingerprint,
        next_export_continuation_token: wowBoostExportContinuationTokenWithDateRange({
          token: exp.nextExport,
          from: progress.requested_from,
          to: progress.requested_to,
        }),
      },
    });
  }

  const now = new Date().toISOString();
  const nextProgress = mergeConnectorRuntimeCounters(progress, {
    records_discovered: parsed.rows.length,
    records_succeeded: stagedCount,
  }, {
    status: hasMore ? "running" : "running",
    phase: hasMore ? "stage_export_pages" : "reconcile_legacy_orders",
    page: hasMore ? page + 1 : null,
    last_error: null,
    now,
    metadata: {
      ...(progress.metadata || {}),
      export_pages_processed: Number(progress.metadata?.export_pages_processed || 0) + 1,
      export_rows_fetched: Number(progress.metadata?.export_rows_fetched || 0) + parsed.rows.length,
      export_mappings_staged: Number(progress.metadata?.export_mappings_staged || 0) + stagedCount,
      export_pages_scanned: Number(progress.metadata?.export_pages_scanned || progress.metadata?.export_pages_processed || 0) + 1,
      export_rows_seen: Number(progress.metadata?.export_rows_seen || progress.metadata?.export_rows_fetched || 0) + parsed.rows.length,
      export_stage_duplicates_skipped: Number(progress.metadata?.export_stage_duplicates_skipped || 0) + stagedResultAll.duplicates_skipped,
      export_stage_unrelated_or_mapped_rows_skipped:
        Number(progress.metadata?.export_stage_unrelated_or_mapped_rows_skipped || 0) + targetFiltered.skipped_unrelated_or_mapped,
      target_order_numbers_seen_on_page: targetFiltered.target_order_numbers_seen,
      max_export_pages: maxExportPages,
      last_export_page: page,
      last_page_fingerprint: pageFingerprint,
      export_page_fingerprints: nextFingerprintHistory,
      staging_stop_reason: null,
      ...wowBoostRuntimeTargetCoverageMetadata(coverage),
      next_export_continuation_token: wowBoostExportContinuationTokenWithDateRange({
        token: exp.nextExport,
        from: progress.requested_from,
        to: progress.requested_to,
      }),
    },
  });
  nextProgress.started_at = nextProgress.started_at || now;
  await updateConnectorRuntimeJobProgress(env, job, nextProgress);

  await createAndEnqueueConnectorRuntimeTask(env, {
    job_id: job.id,
    workspace_id: progress.workspace_id,
    connector_id: progress.connector_id,
    task_type: "wowboost_stage_export_page",
    phase: "stage_export_pages",
    page: page + 1,
    payload: { page: page + 1, page_size: pageSize },
    dedupe_key: `stage_export_page:${page + 1}:${pageSize}`,
    max_attempts: 5,
  });

  return {
    rows_fetched: parsed.rows.length,
    staged: stagedCount,
    duplicates_skipped: stagedResultAll.duplicates_skipped,
    skipped_unrelated_or_mapped: targetFiltered.skipped_unrelated_or_mapped,
    has_more: hasMore,
    next_page: hasMore ? page + 1 : null,
    staging_stop_reason: null,
    ...wowBoostRuntimeTargetCoverageMetadata(coverage),
  };
}

async function queryWowBoostRuntimeBackfillRows(env: Env, args: {
  progress: ConnectorRuntimeProgress & Record<string, any>;
  cursor: string | null;
  limit: number;
}) {
  const range = normalizeWowBoostOrderDetailsBackfillDateRange(args.progress.requested_from, args.progress.requested_to);
  if (range.ok !== true) throw new Error("Invalid WowBoost runtime date range.");
  let cursorState = parseWowBoostOrderDetailsBackfillCursor(args.cursor);
  const supabase = getSupabase(env);

  for (;;) {
    const plan = wowBoostOrderDetailsBackfillScanPlan({ range, cursor: cursorState, limit: args.limit });
    let query = supabase
      .from("platform_orders")
      .select("platform,platform_order_id,order_id,transaction_id,commerce_reference,order_ts")
      .eq("platform", plan.current_platform)
      .or("commerce_reference.is.null,commerce_reference.eq.")
      .not("platform_order_id", "is", null)
      .gte("order_ts", plan.order_ts_gte)
      .lt("order_ts", plan.order_ts_lt)
      .order("platform_order_id", { ascending: true })
      .limit(plan.limit);

    if (plan.platform_order_id_gt) query = query.gt("platform_order_id", plan.platform_order_id_gt);
    const { data, error } = await query;
    if (error) throw new Error(`WowBoost runtime reconcile scan failed: ${error.message}`);

    const rows = data || [];
    if (rows.length) return { rows: rows.slice(0, args.limit), cursorState, currentPlatform: plan.current_platform };

    const nextPlatform = nextWowBoostOrderDetailsBackfillPlatform(plan.current_platform);
    if (!nextPlatform) return { rows: [], cursorState, currentPlatform: plan.current_platform };
    cursorState = { current_platform: nextPlatform, platform_order_id: null };
  }
}

async function reconcileWowBoostLegacyOrdersRuntimeTask(env: Env, job: ImportJobRow, task: ConnectorImportTaskRow) {
  const progress = connectorRuntimeProgressFromJob(job);
  const limit = Math.max(1, Math.min(WOWBOOST_RUNTIME_MAX_DETAILS_LIMIT, Number(task.payload?.limit || WOWBOOST_RUNTIME_DEFAULT_DETAILS_LIMIT)));
  const cursor = String(task.payload?.cursor || task.cursor || progress.current_cursor || "").trim() || null;
  const { rows, cursorState } = await queryWowBoostRuntimeBackfillRows(env, { progress, cursor, limit });
  const supabase = getSupabase(env);

  const legacyRows = rows.filter((row: any) => extractWowBoostLegacyOrderNumberEvidence(row).legacy_order_number);
  const legacyNumbers = Array.from(new Set(legacyRows.map((row: any) => extractWowBoostLegacyOrderNumberEvidence(row).legacy_order_number).filter(Boolean)));
  const stagedByOrderNumber = new Map<string, any[]>();

  if (legacyNumbers.length) {
    const { data, error } = await supabase
      .from("wowboost_order_reference_stage")
      .select("order_number,order_id,transaction_id,order_date,reference_id")
      .eq("job_id", job.id)
      .in("order_number", legacyNumbers);
    if (error) throw new Error(`WowBoost runtime stage lookup failed: ${error.message}`);
    for (const staged of data || []) {
      const key = String(staged.order_number || "").trim();
      if (!key) continue;
      const bucket = stagedByOrderNumber.get(key) || [];
      bucket.push(staged);
      stagedByOrderNumber.set(key, bucket);
    }
  }

  const detailItems: any[] = [];
  let processed = 0;
  let skipped = 0;
  let failed = 0;
  const recentWarnings: string[] = [];

  for (const row of rows as WowBoostOrderDetailsReferenceBackfillRow[]) {
    processed += 1;
    const legacy = extractWowBoostLegacyOrderNumberEvidence(row);
    let lookup = resolveWowBoostOrderDetailsLookupOrderId(row);

    if (legacy.legacy_order_number) {
      const staged = stagedByOrderNumber.get(legacy.legacy_order_number) || [];
      const orderIds = Array.from(new Set(staged.map((candidate) => String(candidate.order_id || "").trim()).filter(Boolean)));
      if (orderIds.length === 1) {
        lookup = { value: orderIds[0], source_field: "order_id" };
      } else {
        skipped += 1;
        const errorClass = orderIds.length > 1 ? "ambiguous_legacy_order_number" : "missing_legacy_order_number_mapping";
        recentWarnings.push(`${errorClass}:${legacy.legacy_order_number}`);
        await insertConnectorRuntimeError(env, {
          job_id: job.id,
          task_id: task.id,
          connector_id: progress.connector_id,
          record_identifier: legacy.legacy_order_number,
          error_class: errorClass,
          message: orderIds.length > 1
            ? `Legacy Order Number ${legacy.legacy_order_number} matched ${orderIds.length} true Order IDs.`
            : `Legacy Order Number ${legacy.legacy_order_number} was not found in staged export mappings.`,
          classification: "permanent",
        });
        continue;
      }
    }

    if (!lookup.value) {
      skipped += 1;
      await insertConnectorRuntimeError(env, {
        job_id: job.id,
        task_id: task.id,
        connector_id: progress.connector_id,
        record_identifier: String(row.platform_order_id || ""),
        error_class: "missing_lookup_order_id",
        message: "No numeric WowBoost Order ID could be resolved for this platform order.",
        classification: "permanent",
      });
      continue;
    }

    detailItems.push({
      platform_order_id: row.platform_order_id,
      order_id: row.order_id || null,
      transaction_id: row.transaction_id || null,
      lookup_order_id: lookup.value,
      source_field: lookup.source_field,
    });
  }

  const lastCursor = serializeWowBoostOrderDetailsBackfillCursor({
    current_platform: cursorState.current_platform,
    platform_order_id: wowBoostOrderDetailsBackfillNextCursor(rows as WowBoostOrderDetailsReferenceBackfillRow[], true, {
      processedCount: rows.length,
      inputCursor: cursorState.platform_order_id,
      blocked: false,
    }),
  });
  const hasMore = rows.length >= limit;
  let finalCursor: string | null = null;
  if (hasMore) {
    finalCursor = lastCursor;
  } else {
    const nextPlatform = nextWowBoostOrderDetailsBackfillPlatform(cursorState.current_platform);
    finalCursor = nextPlatform
      ? serializeWowBoostOrderDetailsBackfillCursor({ current_platform: nextPlatform, platform_order_id: null })
      : null;
  }
  const now = new Date().toISOString();
  const nextProgress = mergeConnectorRuntimeCounters(progress, {
    records_processed: processed,
    records_skipped: skipped,
    records_failed: failed,
  }, {
    status: "running",
    phase: detailItems.length ? "fetch_order_details" : (finalCursor ? "reconcile_legacy_orders" : "validate_and_finalize"),
    cursor: finalCursor,
    now,
    metadata: {
      ...(progress.metadata || {}),
      recent_warnings: [...(progress.metadata?.recent_warnings || []), ...recentWarnings].slice(-10),
      pending_order_detail_items: Number(progress.metadata?.pending_order_detail_items || 0) + detailItems.length,
    },
  });
  await updateConnectorRuntimeJobProgress(env, job, nextProgress);

  if (detailItems.length) {
    await createAndEnqueueConnectorRuntimeTask(env, {
      job_id: job.id,
      workspace_id: progress.workspace_id,
      connector_id: progress.connector_id,
      task_type: "wowboost_fetch_order_details",
      phase: "fetch_order_details",
      payload: {
        items: detailItems.slice(0, WOWBOOST_RUNTIME_MAX_DETAILS_LIMIT),
        next_reconcile_cursor: finalCursor,
        has_more_reconcile: Boolean(finalCursor),
        pacing_ms: WOWBOOST_RUNTIME_DEFAULT_PACING_MS,
      },
      dedupe_key: `fetch_order_details:${lastCursor}:${detailItems.map((item) => item.platform_order_id).join(",")}`,
      max_attempts: 5,
    });
  } else if (finalCursor) {
    await createAndEnqueueConnectorRuntimeTask(env, {
      job_id: job.id,
      workspace_id: progress.workspace_id,
      connector_id: progress.connector_id,
      task_type: "wowboost_reconcile_legacy_orders",
      phase: "reconcile_legacy_orders",
      cursor: finalCursor,
      payload: { cursor: finalCursor, limit },
      dedupe_key: `reconcile_legacy_orders:${finalCursor}`,
      max_attempts: 5,
    });
  } else {
    await createAndEnqueueConnectorRuntimeTask(env, {
      job_id: job.id,
      workspace_id: progress.workspace_id,
      connector_id: progress.connector_id,
      task_type: "wowboost_validate_and_finalize",
      phase: "validate_and_finalize",
      payload: {},
      dedupe_key: "validate_and_finalize",
      max_attempts: 3,
    });
  }

  return { processed, skipped, detail_items: detailItems.length, next_cursor: finalCursor };
}

async function fetchWowBoostOrderDetailsRuntimeTask(env: Env, job: ImportJobRow, task: ConnectorImportTaskRow) {
  const progress = connectorRuntimeProgressFromJob(job);
  const items = Array.isArray(task.payload?.items) ? task.payload.items.slice(0, WOWBOOST_RUNTIME_MAX_DETAILS_LIMIT) : [];
  const pacingMs = normalizeWowBoostOrderDetailsPacingMs(task.payload?.pacing_ms || WOWBOOST_RUNTIME_DEFAULT_PACING_MS);
  const { authBase, bearer } = await getWowBoostRuntimeAuth(env);
  const decisions: WowBoostOrderDetailsReferenceBackfillDecision[] = [];
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  let retries = 0;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] || {};
    const row: WowBoostOrderDetailsReferenceBackfillRow = {
      platform: "wowsuite:wowboost",
      platform_order_id: item.platform_order_id,
      order_id: item.order_id,
      transaction_id: item.transaction_id,
      commerce_reference: null,
    };
    const lookupOrderId = String(item.lookup_order_id || "").trim();
    if (!lookupOrderId) {
      skipped += 1;
      decisions.push(buildWowBoostOrderDetailsReferenceBackfillDecision(row, null));
      continue;
    }

    const details = await fetchWowBoostOrderDetailsReference({ authBase, bearer, orderId: lookupOrderId });
    retries += Number(details.rate_limit_retries || 0);
    if (!details.ok) {
      const classification = details.failure_classification || classifyWowBoostOrderDetailsLookupFailure({
        status: details.status,
        error: details.error,
        transient: details.transient,
      });
      if (classification === "permanent_not_found") skipped += 1;
      else failed += 1;
      await insertConnectorRuntimeError(env, {
        job_id: job.id,
        task_id: task.id,
        connector_id: progress.connector_id,
        record_identifier: lookupOrderId,
        error_class: classification === "permanent_not_found" ? "order_detail_not_found" : "order_detail_lookup_failed",
        http_status: details.status ?? null,
        attempt: task.attempt_count || 1,
        message: details.error || "WowBoost Order Details lookup failed",
        classification: classification === "transient" ? "transient" : classification === "auth" ? "blocking" : "permanent",
      });
      decisions.push(buildWowBoostOrderDetailsReferenceBackfillDecision(row, null));
    } else {
      decisions.push(buildWowBoostOrderDetailsReferenceBackfillDecision(row, {
        [details.source_field || "referenceId"]: details.reference,
      }));
    }

    if (index < items.length - 1) await sleepMs(pacingMs);
  }

  const summary = summarizeWowBoostOrderDetailsReferenceBackfillDecisions(decisions);
  let updated = 0;
  if (summary.patches.length) {
    const supabase = getSupabase(env);
    const { data, error } = await supabase.rpc("backfill_platform_order_commerce_references", {
      patches: summary.patches.map((patch) => ({
        platform_order_id: patch.platform_order_id,
        commerce_reference: patch.commerce_reference,
      })),
    });
    if (error) throw new Error(`WowBoost runtime commerce_reference update failed: ${error.message}`);
    updated = (data || []).length;
    succeeded += updated;
    skipped += Math.max(0, summary.patches.length - updated);
  }

  const nextReconcileCursor = String(task.payload?.next_reconcile_cursor || "").trim() || null;
  const nextProgress = mergeConnectorRuntimeCounters(progress, {
    records_succeeded: succeeded,
    records_failed: failed,
    records_skipped: skipped,
    retries,
  }, {
    status: "running",
    phase: nextReconcileCursor ? "reconcile_legacy_orders" : "validate_and_finalize",
    cursor: nextReconcileCursor,
    last_error: failed ? `${failed} WowBoost order detail lookup(s) failed.` : null,
    metadata: {
      ...(progress.metadata || {}),
      references_updated: Number(progress.metadata?.references_updated || 0) + updated,
    },
  });
  await updateConnectorRuntimeJobProgress(env, job, nextProgress);

  if (nextReconcileCursor) {
    await createAndEnqueueConnectorRuntimeTask(env, {
      job_id: job.id,
      workspace_id: progress.workspace_id,
      connector_id: progress.connector_id,
      task_type: "wowboost_reconcile_legacy_orders",
      phase: "reconcile_legacy_orders",
      cursor: nextReconcileCursor,
      payload: { cursor: nextReconcileCursor, limit: WOWBOOST_RUNTIME_DEFAULT_RECONCILE_LIMIT },
      dedupe_key: `reconcile_legacy_orders:${nextReconcileCursor}`,
      max_attempts: 5,
    });
  } else {
    await createAndEnqueueConnectorRuntimeTask(env, {
      job_id: job.id,
      workspace_id: progress.workspace_id,
      connector_id: progress.connector_id,
      task_type: "wowboost_validate_and_finalize",
      phase: "validate_and_finalize",
      payload: {},
      dedupe_key: "validate_and_finalize",
      max_attempts: 3,
    });
  }

  return { updated, succeeded, failed, skipped };
}

function describeRuntimeSupabaseError(error: any) {
  const parts = [
    error?.message,
    error?.details,
    error?.hint,
    error?.code ? `code=${error.code}` : null,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean);
  if (parts.length) return parts.join(" | ");
  try {
    const json = JSON.stringify(error);
    if (json && json !== "{}") return json;
  } catch {
    // Fall back below.
  }
  return String(error || "unknown");
}

function runtimeSupabaseError(prefix: string, error: any) {
  const wrapped = new Error(`${prefix}: ${describeRuntimeSupabaseError(error)}`);
  (wrapped as any).cause = error;
  (wrapped as any).code = error?.code ?? null;
  (wrapped as any).status = error?.status ?? null;
  (wrapped as any).transient = error?.code === "57014" || /statement timeout|canceling statement due to statement timeout/i.test(describeRuntimeSupabaseError(error));
  return wrapped;
}

async function validateAndFinalizeWowBoostRuntimeTask(env: Env, job: ImportJobRow, task: ConnectorImportTaskRow) {
  const progress = connectorRuntimeProgressFromJob(job);
  try {
    const range = normalizeWowBoostOrderDetailsBackfillDateRange(progress.requested_from, progress.requested_to);
    if (range.ok !== true) throw new Error("Invalid WowBoost runtime date range.");
    const supabase = getSupabase(env);
    const { data: finalizeCounts, error: finalizeError } = await supabase.rpc("wowboost_runtime_finalize_counts", {
      p_job_id: job.id,
      p_requested_from: range.from,
      p_requested_to: range.to,
    });
    if (finalizeError) throw runtimeSupabaseError("WowBoost runtime finalize count failed", finalizeError);

    const finalizeRow = Array.isArray(finalizeCounts) ? finalizeCounts[0] : finalizeCounts;
    const remainingCount = Number(finalizeRow?.remaining_blank_references || 0);
    const errorCount = Number(finalizeRow?.unresolved_error_count || 0);
    const now = new Date().toISOString();
    const nextProgress = connectorRuntimeFinalizeSuccessProgress(progress, {
      now,
      remaining_blank_references: remainingCount,
      unresolved_error_count: errorCount,
    });
    await updateConnectorRuntimeJobProgress(env, job, nextProgress);
    return { remaining_blank_references: remainingCount, error_count: errorCount, status: nextProgress.status };
  } catch (error) {
    const summary = connectorRuntimeErrorSummary(error);
    const now = new Date().toISOString();
    await insertConnectorRuntimeError(env, {
      job_id: job.id,
      task_id: task.id,
      connector_id: progress.connector_id,
      record_identifier: "validate_and_finalize",
      error_class: "finalize_summary_failed",
      message: summary.last_error,
      response_excerpt: summary.response_excerpt,
      classification: "permanent",
    }).catch(() => {});

    const nextProgress = connectorRuntimeFinalizeFailureProgress(progress, {
      now,
      message: summary.message,
      stack: summary.stack,
      last_error: summary.last_error,
    });
    await updateConnectorRuntimeJobProgress(env, job, nextProgress);
    return {
      status: "completed_with_errors",
      finalize_summary_failed: true,
      error: summary.message,
    };
  }
}

function identityBackfillPlatformsFromProgress(progress: ConnectorRuntimeProgress & Record<string, any>) {
  const platforms = Array.isArray(progress.metadata?.platforms)
    ? progress.metadata.platforms.map((platform: any) => String(platform || "").trim().toLowerCase()).filter(Boolean)
    : ["wowboost", "wowsuite:wowboost"];
  return platforms.length ? platforms : ["wowboost", "wowsuite:wowboost"];
}

async function queryIdentityBackfillRows(env: Env, args: {
  progress: ConnectorRuntimeProgress & Record<string, any>;
  cursor: string | null;
  limit: number;
}) {
  const range = dateRangeToTimestamps(args.progress.requested_from, args.progress.requested_to);
  if (!range) throw new Error("Invalid identity backfill date range.");
  const platforms = identityBackfillPlatformsFromProgress(args.progress);
  const cursorState = parseIdentityBackfillCursor(args.cursor, platforms);
  const supabase = getSupabase(env);

  let query = supabase
    .from("platform_orders")
    .select(IDENTITY_BACKFILL_DISCOVERY_SELECT)
    .eq("workspace_id", args.progress.workspace_id || "default")
    .eq("platform", cursorState.current_platform)
    .is("person_id", null)
    .not("platform_order_id", "is", null)
    .gte("order_ts", range.from_ts)
    .lt("order_ts", range.to_exclusive_ts)
    .order("platform_order_id", { ascending: true })
    .limit(args.limit);

  if (cursorState.platform_order_id) query = query.gt("platform_order_id", cursorState.platform_order_id);
  const { data, error } = await query;
  if (error) throw runtimeSupabaseError("Identity backfill platform_orders scan failed", error);

  return { rows: data || [], cursorState, platforms };
}

async function previewIdentityResolution(env: Env, args: {
  workspace_id: string;
  identifiers: IdentityInputIdentifier[];
}) {
  return previewIdentityResolutionReadOnly(createSupabaseIdentityRepository(getSupabase(env)), args);
}

async function discoverIdentityBackfillRuntimeTask(env: Env, job: ImportJobRow, task: ConnectorImportTaskRow) {
  const progress = connectorRuntimeProgressFromJob(job);
  const limit = normalizeIdentityBackfillBatchSize(task.payload?.limit || progress.metadata?.batch_size || IDENTITY_BACKFILL_DEFAULT_BATCH_SIZE);
  const cursor = String(task.payload?.cursor || task.cursor || progress.current_cursor || "").trim() || null;
  const { rows, cursorState, platforms } = await queryIdentityBackfillRows(env, { progress, cursor, limit });
  const currentPlatform = cursorState.current_platform;

  const eligibleIds: string[] = [];
  let unsupported = 0;
  let alreadyLinked = 0;

  for (const row of rows as any[]) {
    if (row.person_id) {
      alreadyLinked += 1;
      continue;
    }
    if (!isSupportedIdentityBackfillPlatformOrder(row)) {
      unsupported += 1;
      continue;
    }
    eligibleIds.push(String(row.platform_order_id));
  }

  const lastRow = rows[rows.length - 1] as any;
  const platformCompleted = rows.length < limit;
  let discoveryPlatforms = progress.metadata?.discovery_platforms
    ? { ...(progress.metadata.discovery_platforms as Record<string, any>) }
    : createIdentityBackfillDiscoveryState(platforms);
  let nextCursor: string | null = null;
  if (!platformCompleted && lastRow) {
    nextCursor = serializeIdentityBackfillCursor({
      current_platform: currentPlatform,
      platform_order_id: String(lastRow.platform_order_id || ""),
    });
  } else {
    discoveryPlatforms = markIdentityBackfillPlatformDiscovery({ discovery_platforms: discoveryPlatforms }, currentPlatform, "completed");
    const nextPlatform = nextIdentityBackfillPlatform(currentPlatform, platforms);
    nextCursor = nextPlatform
      ? serializeIdentityBackfillCursor({ current_platform: nextPlatform, platform_order_id: null })
      : null;
  }
  const discoverySummary = identityBackfillDiscoverySummary({ discovery_platforms: discoveryPlatforms }, platforms);

  const batchesCreated = eligibleIds.length ? 1 : 0;
  const nextPhase = eligibleIds.length
    ? "resolve_identity_batch"
    : nextCursor
      ? "discover_unlinked_records"
      : "validate_and_finalize";
  const now = new Date().toISOString();
  const nextProgress = mergeConnectorRuntimeCounters(progress, {
    records_discovered: rows.length,
    records_skipped: unsupported + alreadyLinked,
  }, {
    status: "running",
    phase: nextPhase,
    cursor: nextCursor,
    now,
    metadata: {
      ...(progress.metadata || {}),
      current_platform: nextCursor ? parseIdentityBackfillCursor(nextCursor, platforms).current_platform : null,
      discovery_platforms: discoveryPlatforms,
      discovery_completed_platforms: discoverySummary.completed,
      discovery_failed_platforms: discoverySummary.failed,
      discovery_pending_platforms: discoverySummary.pending,
      incomplete_discovery: discoverySummary.incomplete,
      discovered: Number(progress.metadata?.discovered || 0) + rows.length,
      eligible: Number(progress.metadata?.eligible || 0) + eligibleIds.length,
      unsupported_platform: Number(progress.metadata?.unsupported_platform || 0) + unsupported,
      already_linked: Number(progress.metadata?.already_linked || 0) + alreadyLinked,
      batches_created: Number(progress.metadata?.batches_created || 0) + batchesCreated,
    },
  });
  nextProgress.started_at = nextProgress.started_at || now;
  await updateConnectorRuntimeJobProgress(env, job, nextProgress);

  if (eligibleIds.length) {
    await createAndEnqueueConnectorRuntimeTask(env, {
      job_id: job.id,
      workspace_id: progress.workspace_id,
      connector_id: progress.connector_id,
      task_type: IDENTITY_BACKFILL_TASK_TYPES.resolve,
      phase: "resolve_identity_batch",
      payload: {
        platform_order_ids: eligibleIds,
        next_discovery_cursor: nextCursor,
        has_more_discovery: Boolean(nextCursor),
        dry_run: Boolean(progress.metadata?.dry_run),
      },
      dedupe_key: identityBackfillResolveDedupeKey(job.id, eligibleIds),
      max_attempts: 5,
    });
  } else if (nextCursor) {
    await createAndEnqueueConnectorRuntimeTask(env, {
      job_id: job.id,
      workspace_id: progress.workspace_id,
      connector_id: progress.connector_id,
      task_type: IDENTITY_BACKFILL_TASK_TYPES.discover,
      phase: "discover_unlinked_records",
      cursor: nextCursor,
      payload: { cursor: nextCursor, limit },
      dedupe_key: `identity_discover:${nextCursor}`,
      max_attempts: 5,
    });
  } else {
    await createAndEnqueueConnectorRuntimeTask(env, {
      job_id: job.id,
      workspace_id: progress.workspace_id,
      connector_id: progress.connector_id,
      task_type: IDENTITY_BACKFILL_TASK_TYPES.finalize,
      phase: "validate_and_finalize",
      payload: {},
      dedupe_key: "identity_validate_and_finalize",
      max_attempts: 3,
    });
  }

  return {
    scanned: rows.length,
    eligible: eligibleIds.length,
    unsupported_platform: unsupported,
    skipped_no_identifiers: 0,
    already_linked: alreadyLinked,
    discovery_platforms: discoveryPlatforms,
    discovery_completed_platforms: discoverySummary.completed,
    discovery_pending_platforms: discoverySummary.pending,
    discovery_failed_platforms: discoverySummary.failed,
    next_cursor: nextCursor,
    next_phase: nextPhase,
    batches_created: batchesCreated,
  };
}

async function resolveIdentityBackfillRuntimeTask(env: Env, job: ImportJobRow, task: ConnectorImportTaskRow) {
  const progress = connectorRuntimeProgressFromJob(job);
  const dryRun = Boolean(progress.metadata?.dry_run);
  const platformOrderIds = Array.from(new Set((Array.isArray(task.payload?.platform_order_ids) ? task.payload.platform_order_ids : [])
    .map((value: any) => String(value || "").trim())
    .filter(Boolean)));
  const diagnostics = connectorRuntimeTaskDiagnosticState(task);
  const entryDetails = { dry_run: dryRun, platform_order_ids: platformOrderIds.length };
  let finalSummary: Record<string, any> | null = null;
  let caughtError: any = null;
  logConnectorRuntimeTaskEvent(task, "identity_resolve.entry.before_first_await", entryDetails);

  try {
    await heartbeatConnectorRuntimeTask(env, task, diagnostics, "identity_resolve.entry", entryDetails, { force: true });
    if (!platformOrderIds.length) {
      finalSummary = { processed: 0, attached: 0, skipped: 0, diagnostics: diagnostics.summary };
      return finalSummary;
    }

    const supabase = getSupabase(env);
    const { data, error } = await traceIdentityResolveAwait(env, task, diagnostics, "identity_resolve.reload_platform_orders", async () => await supabase
      .from("platform_orders")
      .select(IDENTITY_BACKFILL_RESOLVE_SELECT)
      .eq("workspace_id", progress.workspace_id || "default")
      .in("platform_order_id", platformOrderIds), {
      durable_after: true,
      details: { platform_order_ids: platformOrderIds.length },
    });
    if (error) throw runtimeSupabaseError("Identity backfill platform order reload failed", error);

    const rowsById = new Map((data || []).map((row: any) => [String(row.platform_order_id), row]));
    let processed = 0;
    let peopleCreated = 0;
    let peopleMatched = 0;
    let attached = 0;
    let alreadyLinked = 0;
    let skippedNoIdentifiers = 0;
    let reviewRequired = 0;
    let permanentErrors = 0;
    let transientRetries = 0;
    let attachmentConflicts = 0;
    let wouldCreatePerson = 0;
    let wouldMatchExisting = 0;
    let wouldRequireReview = 0;
    let wouldSkipNoIdentifiers = 0;
    const recentWarnings: string[] = [];
	    const transientRetryIds: string[] = [];
	    const retryAttempt = Math.max(0, Number(task.payload?.retry_attempt || 0));
	    const maxRecordRetryAttempts = Math.max(1, Number(task.max_attempts || 5));
	    const taskStartedMs = Date.now();
	    const completedRecordIds: string[] = [];
	    let budgetCheckpointReached = false;
	    let budgetContinuationIds: string[] = [];
	    const deferNextPhase = Boolean(task.payload?.defer_next_phase);
	    const markRecordCompleteAndMaybeCheckpoint = async (platformOrderId: string, options: { completed?: boolean } = {}) => {
	      if (options.completed !== false) completedRecordIds.push(platformOrderId);
	      if (!shouldCheckpointIdentityBackfillResolveBatch({
	        started_ms: taskStartedMs,
	        budget_ms: IDENTITY_BACKFILL_RESOLVE_TASK_BUDGET_MS,
	        processed,
	        total: platformOrderIds.length,
	      })) {
	        return false;
	      }
	      budgetCheckpointReached = true;
	      budgetContinuationIds = identityBackfillResolveRemainingIds(platformOrderIds, processed);
	      await heartbeatConnectorRuntimeTask(env, task, diagnostics, "identity_resolve.budget_checkpoint", {
	        processed,
	        total: platformOrderIds.length,
	        remaining: budgetContinuationIds.length,
	        completed_record_ids: completedRecordIds.length,
	        elapsed_ms: Date.now() - taskStartedMs,
	      }, { force: true });
	      return true;
	    };

	    for (const platformOrderId of platformOrderIds) {
      processed += 1;
      logConnectorRuntimeTaskEvent(task, "identity_resolve.record.start", { platform_order_id: platformOrderId, processed });
      await heartbeatConnectorRuntimeTask(env, task, diagnostics, "identity_resolve.record.start", {
        platform_order_id: platformOrderId,
        processed,
      }, identityResolveRecordHeartbeatOptions(processed));
      if (processed === 1 || processed % 10 === 0 || processed === platformOrderIds.length) {
        logConnectorRuntimeTaskEvent(task, "identity_resolve.record_progress_heartbeat.before_await", { processed, total: platformOrderIds.length });
        await heartbeatConnectorRuntimeTask(env, task, diagnostics, "identity_resolve.record_progress", {
          processed,
          total: platformOrderIds.length,
          platform_order_id: platformOrderId,
        }, identityResolveRecordHeartbeatOptions(processed));
        logConnectorRuntimeTaskEvent(task, "identity_resolve.record_progress_heartbeat.after_await", { processed, total: platformOrderIds.length });
      }

      const row = rowsById.get(platformOrderId);
      if (!row) {
        permanentErrors += 1;
        await traceIdentityResolveAwait(env, task, diagnostics, "identity_resolve.insert_row_gone_error", async () => await insertConnectorRuntimeError(env, {
          job_id: job.id,
          task_id: task.id,
          connector_id: progress.connector_id,
          record_identifier: platformOrderId,
          error_class: "identity_backfill_row_gone",
          message: "Platform order no longer exists.",
          classification: "permanent",
        }).catch(() => {}), { details: { platform_order_id: platformOrderId } });
	        await heartbeatConnectorRuntimeTask(env, task, diagnostics, "identity_resolve.record.error", {
	          platform_order_id: platformOrderId,
	          processed,
	          operation: "row_lookup",
	          permanent: true,
	        }, { force: true });
	        if (await markRecordCompleteAndMaybeCheckpoint(platformOrderId)) break;
	        continue;
	      }
	      if (row.person_id) {
        alreadyLinked += 1;
        await heartbeatConnectorRuntimeTask(env, task, diagnostics, "identity_resolve.record.complete", {
          platform: row.platform,
          platform_order_id: platformOrderId,
	          processed,
	          already_linked: true,
	        }, identityResolveRecordHeartbeatOptions(processed));
	        if (await markRecordCompleteAndMaybeCheckpoint(platformOrderId)) break;
	        continue;
	      }
	      if (!isSupportedIdentityBackfillPlatformOrder(row)) {
        permanentErrors += 1;
        await heartbeatConnectorRuntimeTask(env, task, diagnostics, "identity_resolve.record.complete", {
          platform: row.platform,
          platform_order_id: platformOrderId,
	          processed,
	          unsupported_platform: true,
	        }, identityResolveRecordHeartbeatOptions(processed));
	        if (await markRecordCompleteAndMaybeCheckpoint(platformOrderId)) break;
	        continue;
	      }

      const evidence = await traceIdentityResolveAwait(env, task, diagnostics, "identity_resolve.extract_evidence", async () => await extractIdentityEvidenceFromPlatformOrder(row), {
        details: { platform_order_id: platformOrderId },
      });
      if (!hasIdentityEvidence(evidence)) {
        if (dryRun) {
          wouldSkipNoIdentifiers += 1;
        } else {
          skippedNoIdentifiers += 1;
          await traceIdentityResolveAwait(env, task, diagnostics, "identity_resolve.insert_no_identifier_error", async () => await insertConnectorRuntimeError(env, {
            job_id: job.id,
            task_id: task.id,
            connector_id: progress.connector_id,
            record_identifier: platformOrderId,
            error_class: "identity_backfill_no_identifiers",
            message: "Platform order has no deterministic person identity identifiers.",
            classification: "permanent",
          }).catch(() => {}), { details: { platform_order_id: platformOrderId } });
        }
        await heartbeatConnectorRuntimeTask(env, task, diagnostics, "identity_resolve.record.complete", {
          platform: row.platform,
          platform_order_id: platformOrderId,
          processed,
	          identifier_count: 0,
	          skipped_no_identifiers: true,
	        }, identityResolveRecordHeartbeatOptions(processed));
	        if (await markRecordCompleteAndMaybeCheckpoint(platformOrderId)) break;
	        continue;
	      }
      for (const warning of evidence.warnings) recentWarnings.push(warning);

      try {
        if (dryRun) {
          const preview = await traceIdentityResolveAwait(env, task, diagnostics, "identity_resolve.preview_identity", async () => await previewIdentityResolution(env, {
            workspace_id: progress.workspace_id || "default",
            identifiers: evidence.identifiers,
          }), { details: { platform_order_id: platformOrderId, identifiers: evidence.identifiers.length } });
          if (preview.preview_action === "would_create_person") wouldCreatePerson += 1;
          if (preview.preview_action === "would_match_existing") wouldMatchExisting += 1;
          if (preview.preview_action === "would_require_review") {
            wouldRequireReview += 1;
          }
          if (preview.preview_action === "would_skip_no_identifiers") wouldSkipNoIdentifiers += 1;
          await heartbeatConnectorRuntimeTask(env, task, diagnostics, "identity_resolve.record.complete", {
            platform: row.platform,
            platform_order_id: platformOrderId,
            processed,
	            operation: "previewIdentityResolution",
	            preview_action: preview.preview_action,
	          }, identityResolveRecordHeartbeatOptions(processed));
	          if (await markRecordCompleteAndMaybeCheckpoint(platformOrderId)) break;
	          continue;
	        }

        const recordDiagnostics = identityResolveServiceDiagnostics(env, task, diagnostics, {
          platform: row.platform,
          platform_order_id: platformOrderId,
          processed,
        });
        const service = getIdentityService(env, recordDiagnostics);
        const result = await traceIdentityResolveAwait(env, task, diagnostics, "identity_resolve.resolve_identity", async () => await resolveIdentityForSourceRecord(service!, {
          workspace_id: progress.workspace_id || row.workspace_id || "default",
          connector_id: IDENTITY_BACKFILL_CONNECTOR_ID,
          connector_job_id: job.id,
          platform: row.platform,
          record_type: "platform_order",
          record_id: platformOrderId,
          identifiers: evidence.identifiers,
          attributes: evidence.attributes,
          observed_at: evidence.observed_at,
        }, recordDiagnostics), { details: { platform: row.platform, platform_order_id: platformOrderId, identifier_count: evidence.identifiers.length } });

        if (result.review_required || result.action === "review_required") {
          reviewRequired += 1;
          await heartbeatConnectorRuntimeTask(env, task, diagnostics, "identity_resolve.record.complete", {
            platform: row.platform,
            platform_order_id: platformOrderId,
            processed,
	            review_required: true,
	            identity_action: result.action,
	          }, identityResolveRecordHeartbeatOptions(processed));
	          if (await markRecordCompleteAndMaybeCheckpoint(platformOrderId)) break;
	          continue;
	        }
        if (result.action === "created_person") peopleCreated += 1;
        if (result.action === "matched_existing_person") peopleMatched += 1;

        if (!result.person_id) {
          permanentErrors += 1;
          await heartbeatConnectorRuntimeTask(env, task, diagnostics, "identity_resolve.record.error", {
            platform: row.platform,
            platform_order_id: platformOrderId,
            processed,
	            operation: "resolveIdentityForSourceRecord",
	            missing_person_id: true,
	          }, { force: true });
	          if (await markRecordCompleteAndMaybeCheckpoint(platformOrderId)) break;
	          continue;
	        }

        const { data: updated, error: updateError } = await traceIdentityResolveAwait(env, task, diagnostics, "identity_resolve.link_source_record", async () => await supabase
          .from("platform_orders")
          .update({ person_id: result.person_id })
          .eq("workspace_id", progress.workspace_id || "default")
          .eq("platform_order_id", platformOrderId)
          .is("person_id", null)
          .select("platform_order_id,person_id")
          .maybeSingle(), { details: { platform_order_id: platformOrderId } });
        if (updateError) throw runtimeSupabaseError("Identity backfill person attachment failed", updateError);
        if (updated?.person_id) attached += 1;
        else attachmentConflicts += 1;
        await heartbeatConnectorRuntimeTask(env, task, diagnostics, "identity_resolve.record.complete", {
          platform: row.platform,
          platform_order_id: platformOrderId,
          processed,
          operation: "link_source_record",
          identity_action: result.action,
	          attached: Boolean(updated?.person_id),
	          attachment_conflict: !updated?.person_id,
	        }, identityResolveRecordHeartbeatOptions(processed));
	        if (await markRecordCompleteAndMaybeCheckpoint(platformOrderId)) break;
	      } catch (e: any) {
        const classification = classifyConnectorRuntimeFailure({ message: e?.message || e });
        if (classification === "blocking") throw e;
        if (classification === "transient" && retryAttempt < maxRecordRetryAttempts) {
          transientRetries += 1;
          transientRetryIds.push(platformOrderId);
          await traceIdentityResolveAwait(env, task, diagnostics, "identity_resolve.insert_transient_retry_error", async () => await insertConnectorRuntimeError(env, {
            job_id: job.id,
            task_id: task.id,
            connector_id: progress.connector_id,
            record_identifier: platformOrderId,
            error_class: "identity_backfill_transient_retry",
            message: e?.message || String(e),
            classification,
          }).catch(() => {}), { details: { platform_order_id: platformOrderId } });
          await heartbeatConnectorRuntimeTask(env, task, diagnostics, "identity_resolve.record.error", {
            platform: row.platform,
            platform_order_id: platformOrderId,
            processed,
            classification,
            retrying: true,
	            timed_out: e?.name === "IdentityOperationTimeoutError",
	            operation: e?.operation || null,
	          }, { force: true });
	          if (await markRecordCompleteAndMaybeCheckpoint(platformOrderId, { completed: false })) break;
	          continue;
	        }
        permanentErrors += 1;
        await traceIdentityResolveAwait(env, task, diagnostics, "identity_resolve.insert_record_error", async () => await insertConnectorRuntimeError(env, {
          job_id: job.id,
          task_id: task.id,
          connector_id: progress.connector_id,
          record_identifier: platformOrderId,
          error_class: classification === "transient"
            ? "identity_backfill_transient_exhausted"
            : "identity_backfill_record_error",
          message: e?.message || String(e),
          classification,
        }).catch(() => {}), { details: { platform_order_id: platformOrderId, classification } });
        await heartbeatConnectorRuntimeTask(env, task, diagnostics, "identity_resolve.record.error", {
          platform: row.platform,
          platform_order_id: platformOrderId,
          processed,
          classification,
          retrying: false,
	          timed_out: e?.name === "IdentityOperationTimeoutError",
	          operation: e?.operation || null,
	        }, { force: true });
	        if (await markRecordCompleteAndMaybeCheckpoint(platformOrderId)) break;
	      }
	    }

	    const nextDiscoveryCursor = String(task.payload?.next_discovery_cursor || "").trim() || null;
	    const retryingTransientRecords = transientRetryIds.length && retryAttempt < maxRecordRetryAttempts;
	    const nextPhase = budgetCheckpointReached || retryingTransientRecords || deferNextPhase
	      ? "resolve_identity_batch"
	      : nextDiscoveryCursor
	        ? "discover_unlinked_records"
	        : "validate_and_finalize";
    const rawMetricSummary = {
      people_created: peopleCreated,
      people_matched: peopleMatched,
      attached,
      skipped_no_identifiers: skippedNoIdentifiers,
      review_required: reviewRequired,
      would_create_person: wouldCreatePerson,
      would_match_existing: wouldMatchExisting,
      would_require_review: wouldRequireReview,
      would_skip_no_identifiers: wouldSkipNoIdentifiers,
    };
    const metricSummary = normalizeIdentityBackfillDryRunResolveSummary(rawMetricSummary, dryRun);
    const nextMetadata = mergeIdentityBackfillResolveMetricMetadata(progress.metadata, rawMetricSummary, dryRun);
    const nextProgress = mergeConnectorRuntimeCounters(progress, {
      records_processed: processed,
      records_succeeded: Number(metricSummary.attached || 0),
      records_failed: permanentErrors + Number(metricSummary.attachment_conflicts || attachmentConflicts),
      records_skipped: alreadyLinked + Number(metricSummary.skipped_no_identifiers || 0) + Number(metricSummary.review_required || 0),
      retries: transientRetries,
    }, {
      status: "running",
      phase: nextPhase,
      cursor: nextDiscoveryCursor,
      metadata: {
        ...nextMetadata,
        already_linked: Number(progress.metadata?.already_linked || 0) + alreadyLinked,
        permanent_errors: Number(progress.metadata?.permanent_errors || 0) + permanentErrors,
        transient_retries: Number(progress.metadata?.transient_retries || 0) + transientRetries,
        attachment_conflicts: Number(progress.metadata?.attachment_conflicts || 0) + attachmentConflicts,
        dry_run_records_simulated: Number(progress.metadata?.dry_run_records_simulated || 0) + (dryRun ? processed : 0),
	        recent_warnings: [...(progress.metadata?.recent_warnings || []), ...recentWarnings].slice(-10),
	        recent_completed_record_ids: [
	          ...((Array.isArray(progress.metadata?.recent_completed_record_ids) ? progress.metadata.recent_completed_record_ids : []) as string[]),
	          ...completedRecordIds,
	        ].slice(-100),
	        last_identity_resolve_budget_checkpoint: budgetCheckpointReached
	          ? {
	            task_id: task.id,
	            processed,
	            remaining: budgetContinuationIds.length,
	            completed_record_ids: completedRecordIds.length,
	            elapsed_ms: Date.now() - taskStartedMs,
	          }
	          : progress.metadata?.last_identity_resolve_budget_checkpoint || null,
	      },
	    });
    await traceIdentityResolveAwait(env, task, diagnostics, "identity_resolve.update_job_progress", async () => await updateConnectorRuntimeJobProgress(env, job, nextProgress), {
      durable_before: true,
      durable_after: true,
      details: { processed, next_phase: nextPhase },
    });

	    if (retryingTransientRecords) {
	      await traceIdentityResolveAwait(env, task, diagnostics, "identity_resolve.enqueue_retry_batch", async () => await createAndEnqueueConnectorRuntimeTask(env, {
	        job_id: job.id,
	        workspace_id: progress.workspace_id,
        connector_id: progress.connector_id,
        task_type: IDENTITY_BACKFILL_TASK_TYPES.resolve,
        phase: "resolve_identity_batch",
	        payload: {
	          platform_order_ids: transientRetryIds,
	          next_discovery_cursor: budgetCheckpointReached ? null : nextDiscoveryCursor,
	          has_more_discovery: !budgetCheckpointReached && Boolean(nextDiscoveryCursor),
	          dry_run: dryRun,
	          retry_attempt: retryAttempt + 1,
	          defer_next_phase: budgetCheckpointReached || deferNextPhase,
	        },
	        dedupe_key: identityBackfillResolveDedupeKey(job.id, transientRetryIds) + `:retry:${retryAttempt + 1}`,
	        max_attempts: maxRecordRetryAttempts,
	      }), { durable_before: true, durable_after: true, details: { transient_retry_ids: transientRetryIds.length } });
	    }
	    if (budgetCheckpointReached && budgetContinuationIds.length) {
	      await traceIdentityResolveAwait(env, task, diagnostics, "identity_resolve.enqueue_budget_continuation", async () => await createAndEnqueueConnectorRuntimeTask(env, {
	        job_id: job.id,
	        workspace_id: progress.workspace_id,
	        connector_id: progress.connector_id,
	        task_type: IDENTITY_BACKFILL_TASK_TYPES.resolve,
	        phase: "resolve_identity_batch",
	        payload: {
	          platform_order_ids: budgetContinuationIds,
	          next_discovery_cursor: nextDiscoveryCursor,
	          has_more_discovery: Boolean(nextDiscoveryCursor),
	          dry_run: dryRun,
	          retry_attempt: retryAttempt,
	          continuation_of_task_id: task.id,
	        },
	        dedupe_key: identityBackfillResolveContinuationDedupeKey({
	          job_id: job.id,
	          task_id: task.id,
	          processed,
	          remaining_platform_order_ids: budgetContinuationIds,
	        }),
	        max_attempts: maxRecordRetryAttempts,
	      }), { durable_before: true, durable_after: true, details: { remaining_platform_order_ids: budgetContinuationIds.length } });
	    } else if (!retryingTransientRecords && !deferNextPhase && nextDiscoveryCursor) {
	      await traceIdentityResolveAwait(env, task, diagnostics, "identity_resolve.enqueue_discovery", async () => await createAndEnqueueConnectorRuntimeTask(env, {
	        job_id: job.id,
	        workspace_id: progress.workspace_id,
        connector_id: progress.connector_id,
        task_type: IDENTITY_BACKFILL_TASK_TYPES.discover,
        phase: "discover_unlinked_records",
        cursor: nextDiscoveryCursor,
        payload: { cursor: nextDiscoveryCursor, limit: progress.metadata?.batch_size || IDENTITY_BACKFILL_DEFAULT_BATCH_SIZE },
        dedupe_key: `identity_discover:${nextDiscoveryCursor}`,
        max_attempts: 5,
      }), { durable_before: true, durable_after: true, details: { next_discovery_cursor: nextDiscoveryCursor } });
	    } else if (!retryingTransientRecords && !deferNextPhase) {
	      await traceIdentityResolveAwait(env, task, diagnostics, "identity_resolve.enqueue_finalize", async () => await createAndEnqueueConnectorRuntimeTask(env, {
	        job_id: job.id,
	        workspace_id: progress.workspace_id,
        connector_id: progress.connector_id,
        task_type: IDENTITY_BACKFILL_TASK_TYPES.finalize,
        phase: "validate_and_finalize",
        payload: {},
        dedupe_key: "identity_validate_and_finalize",
        max_attempts: 3,
      }), { durable_before: true, durable_after: true });
    }

    finalSummary = {
      processed,
      people_created: Number(metricSummary.people_created || 0),
      people_matched: Number(metricSummary.people_matched || 0),
      attached: Number(metricSummary.attached || 0),
      already_linked: alreadyLinked,
      skipped_no_identifiers: Number(metricSummary.skipped_no_identifiers || 0),
      would_create_person: Number(metricSummary.would_create_person || 0),
      would_match_existing: Number(metricSummary.would_match_existing || 0),
      would_require_review: Number(metricSummary.would_require_review || 0),
      would_skip_no_identifiers: Number(metricSummary.would_skip_no_identifiers || 0),
      review_required: Number(metricSummary.review_required || 0),
      permanent_errors: permanentErrors,
      transient_retries: transientRetries,
	      transient_retry_ids: transientRetryIds.length,
	      attachment_conflicts: attachmentConflicts,
	      dry_run: dryRun,
	      budget_checkpoint_reached: budgetCheckpointReached,
	      completed_record_ids: completedRecordIds,
	      continuation_platform_order_ids: budgetContinuationIds,
	      next_phase: nextPhase,
	      diagnostics: diagnostics.summary,
	    };
    return finalSummary;
  } catch (error: any) {
    caughtError = error;
    logConnectorRuntimeTaskEvent(task, "identity_resolve.top_level_catch", { message: error?.message || String(error) }, "error");
    await heartbeatConnectorRuntimeTask(env, task, diagnostics, "identity_resolve.top_level_catch", {
      error_name: error?.name || "Error",
      timed_out: error?.name === "IdentityOperationTimeoutError",
      operation: error?.operation || null,
    }, { force: true }).catch(() => {});
    throw error;
  } finally {
    const outcome = caughtError ? "error" : "success";
    logConnectorRuntimeTaskEvent(task, "identity_resolve.top_level_finally.before_await", { outcome });
    await heartbeatConnectorRuntimeTask(env, task, diagnostics, "identity_resolve.top_level_finally", {
      outcome,
      processed: Number(finalSummary?.processed || 0),
    }, { force: true }).catch((heartbeatError) => {
      console.error("[TraceKit] connector runtime task final heartbeat failed", connectorRuntimeTaskLogDetails(task, "identity_resolve.top_level_finally.heartbeat_error", {
        message: heartbeatError?.message || String(heartbeatError),
      }));
    });
    if (finalSummary) finalSummary.diagnostics = diagnostics.summary;
    logConnectorRuntimeTaskEvent(task, "identity_resolve.top_level_finally.after_await", { outcome });
  }
}

async function validateAndFinalizeIdentityBackfillRuntimeTask(env: Env, job: ImportJobRow, task: ConnectorImportTaskRow) {
  const progress = connectorRuntimeProgressFromJob(job);
  try {
    const range = dateRangeToTimestamps(progress.requested_from, progress.requested_to);
    if (!range) throw new Error("Invalid identity backfill date range.");
    const platforms = identityBackfillPlatformsFromProgress(progress);
    const dryRun = Boolean(progress.metadata?.dry_run);
    const baseMetadata = dryRun ? normalizeIdentityBackfillDryRunMetadata(progress.metadata) : progress.metadata || {};
    const discoverySummary = identityBackfillDiscoverySummary(baseMetadata, platforms);
    let finalizeRow: Record<string, any> | null | undefined;
    if (dryRun) {
      finalizeRow = identityBackfillDryRunFinalizeCounts({ ...progress, metadata: baseMetadata });
    } else {
      const supabase = getSupabase(env);
      const { data: finalizeCounts, error: finalizeError } = await supabase.rpc("identity_backfill_finalize_counts", {
        p_job_id: job.id,
        p_workspace_id: progress.workspace_id || "default",
        p_requested_from: range.from_ts,
        p_requested_to: range.to_exclusive_ts,
        p_platforms: platforms,
      });
      if (finalizeError) throw runtimeSupabaseError("Identity backfill finalize count failed", finalizeError);
      finalizeRow = Array.isArray(finalizeCounts) ? finalizeCounts[0] : finalizeCounts;
    }
    const status = identityBackfillFinalizeStatus(finalizeRow || {}, {
      dry_run: dryRun,
      discovery_incomplete: discoverySummary.incomplete,
      would_require_review: dryRun ? 0 : Number(baseMetadata?.would_require_review || 0),
      permanent_errors: dryRun ? 0 : Number(baseMetadata?.permanent_errors || 0),
      attachment_conflicts: dryRun ? 0 : Number(baseMetadata?.attachment_conflicts || 0),
    });
    const now = new Date().toISOString();
    const lastError = discoverySummary.incomplete
      ? `Identity backfill discovery incomplete. Failed platforms: ${discoverySummary.failed.join(",") || "none"}; pending platforms: ${discoverySummary.pending.join(",") || "none"}.`
      : status === "completed_with_errors"
        ? "Identity backfill completed with review items or runtime errors."
        : null;
    const nextProgress = mergeConnectorRuntimeCounters(progress, {}, {
      status: status as any,
      phase: "validate_and_finalize",
      cursor: null,
      page: null,
      last_error: lastError,
      next_run_at: null,
      now,
      metadata: {
        ...baseMetadata,
        finalize_summary_failed: false,
        discovery_platforms: discoverySummary.state,
        discovery_completed_platforms: discoverySummary.completed,
        discovery_failed_platforms: discoverySummary.failed,
        discovery_pending_platforms: discoverySummary.pending,
        incomplete_discovery: discoverySummary.incomplete,
        total_in_scope: Number(finalizeRow?.total_in_scope || 0),
        linked_person_id: Number(finalizeRow?.linked_person_id || 0),
        remaining_unlinked: Number(finalizeRow?.remaining_unlinked || 0),
        review_required_count: Number(finalizeRow?.review_required_count || 0),
        no_identifier_count: Number(finalizeRow?.no_identifier_count || 0),
        runtime_error_count: Number(finalizeRow?.runtime_error_count || 0),
      },
    });
    nextProgress.completed_at = now;
    await updateConnectorRuntimeJobProgress(env, job, nextProgress);
    return {
      status: nextProgress.status,
      total_in_scope: Number(finalizeRow?.total_in_scope || 0),
      linked_person_id: Number(finalizeRow?.linked_person_id || 0),
      remaining_unlinked: Number(finalizeRow?.remaining_unlinked || 0),
      review_required_count: Number(finalizeRow?.review_required_count || 0),
      no_identifier_count: Number(finalizeRow?.no_identifier_count || 0),
      runtime_error_count: Number(finalizeRow?.runtime_error_count || 0),
      incomplete_discovery: discoverySummary.incomplete,
      discovery_completed_platforms: discoverySummary.completed,
      discovery_pending_platforms: discoverySummary.pending,
      discovery_failed_platforms: discoverySummary.failed,
    };
  } catch (error) {
    const summary = connectorRuntimeErrorSummary(error);
    const now = new Date().toISOString();
    const classification = classifyConnectorRuntimeFailure({
      status: (error as any)?.status,
      message: summary.last_error,
      transient: (error as any)?.transient || (error as any)?.code === "57014",
    });
    await insertConnectorRuntimeError(env, {
      job_id: job.id,
      task_id: task.id,
      connector_id: progress.connector_id,
      record_identifier: "validate_and_finalize",
      error_class: "identity_backfill_finalize_failed",
      message: summary.last_error,
      response_excerpt: summary.response_excerpt,
      classification,
    }).catch(() => {});

    if (classification === "transient") {
      if (error instanceof Error) {
        (error as any).transient = true;
        throw error;
      }
      const retryable = new Error(summary.message);
      (retryable as any).transient = true;
      throw retryable;
    }

    const nextProgress = connectorRuntimeFinalizeFailureProgress(progress, {
      now,
      message: summary.message,
      stack: summary.stack,
      last_error: summary.last_error,
    });
    await updateConnectorRuntimeJobProgress(env, job, nextProgress);
    return {
      status: "completed_with_errors",
      finalize_summary_failed: true,
      error: summary.message,
    };
  }
}

async function executeConnectorRuntimeTask(env: Env, task: ConnectorImportTaskRow) {
  const job = await getImportJob(env, task.job_id);
  if (!job) return { skipped: true, reason: "job_not_found" };
  const progress = connectorRuntimeProgressFromJob(job);
  if (progress.status === "paused" || progress.status === "cancelled" || isTerminalConnectorRuntimeJobStatus(progress.status)) {
    return { skipped: true, reason: `job_${progress.status}` };
  }

  if (task.status === "completed") return { skipped: true, reason: "task_completed" };
  const lockNow = new Date().toISOString();
  const runningPatch: Partial<ConnectorImportTaskRow> & Record<string, any> = {
    status: "running",
    locked_at: lockNow,
    attempt_count: Number(task.attempt_count || 0) + 1,
    last_error: null,
  };
  if (isIdentityResolveRuntimeTask(task)) {
    runningPatch.result_summary = appendConnectorRuntimeTaskDiagnostic(task.result_summary, "identity_resolve.lock_acquired", {
      previous_status: task.status,
      attempt_count: Number(task.attempt_count || 0) + 1,
    }, lockNow);
  }
  await updateConnectorRuntimeTask(env, task.id, runningPatch);
  task = { ...task, ...runningPatch } as ConnectorImportTaskRow;

  let summary: Record<string, any>;
  if (task.task_type === "wowboost_stage_export_page") {
    summary = await stageWowBoostExportPageRuntimeTask(env, job, task);
  } else if (task.task_type === "wowboost_reconcile_legacy_orders") {
    summary = await reconcileWowBoostLegacyOrdersRuntimeTask(env, job, task);
  } else if (task.task_type === "wowboost_fetch_order_details") {
    summary = await fetchWowBoostOrderDetailsRuntimeTask(env, job, task);
  } else if (task.task_type === "wowboost_validate_and_finalize") {
    summary = await validateAndFinalizeWowBoostRuntimeTask(env, job, task);
  } else if (task.task_type === IDENTITY_BACKFILL_TASK_TYPES.discover) {
    summary = await discoverIdentityBackfillRuntimeTask(env, job, task);
  } else if (task.task_type === IDENTITY_BACKFILL_TASK_TYPES.resolve) {
    summary = await resolveIdentityBackfillRuntimeTask(env, job, task);
  } else if (task.task_type === IDENTITY_BACKFILL_TASK_TYPES.finalize) {
    summary = await validateAndFinalizeIdentityBackfillRuntimeTask(env, job, task);
  } else {
    throw new Error(`Unsupported connector runtime task type: ${task.task_type}`);
  }

  await updateConnectorRuntimeTask(env, task.id, {
    status: "completed",
    completed_at: new Date().toISOString(),
    locked_at: null,
    result_summary: summary,
    last_error: null,
  });
  return { skipped: false, summary };
}

function wowBoostRuntimeTaskPlanForProgress(job: ImportJobRow, progress: ConnectorRuntimeProgress & Record<string, any>): ConnectorRuntimeTaskPlan {
  const workspaceId = progress.workspace_id || "default";
  const connectorId = progress.connector_id || WOWBOOST_BACKFILL_CONNECTOR_ID;
  const phase = progress.phase || "stage_export_pages";
  if (phase === "reconcile_legacy_orders") {
    const cursor = progress.current_cursor || serializeWowBoostOrderDetailsBackfillCursor({ current_platform: "wowboost", platform_order_id: null });
    return {
      job_id: job.id,
      workspace_id: workspaceId,
      connector_id: connectorId,
      task_type: "wowboost_reconcile_legacy_orders",
      phase: "reconcile_legacy_orders",
      cursor,
      payload: {
        cursor,
        limit: progress.metadata?.details_limit || WOWBOOST_RUNTIME_DEFAULT_DETAILS_LIMIT,
      },
      dedupe_key: `reconcile_legacy_orders:${cursor || "start"}`,
      max_attempts: 5,
    };
  }

  if (phase === "validate_and_finalize") {
    return {
      job_id: job.id,
      workspace_id: workspaceId,
      connector_id: connectorId,
      task_type: "wowboost_validate_and_finalize",
      phase: "validate_and_finalize",
      payload: {},
      dedupe_key: "validate_and_finalize",
      max_attempts: 3,
    };
  }

  const page = Math.max(1, Number(progress.current_page || progress.metadata?.export_page || 1));
  const pageSize = Math.max(1, Math.min(1000, Number(progress.metadata?.export_page_size || WOWBOOST_RUNTIME_DEFAULT_EXPORT_PAGE_SIZE)));
  return {
    job_id: job.id,
    workspace_id: workspaceId,
    connector_id: connectorId,
    task_type: "wowboost_stage_export_page",
    phase: "stage_export_pages",
    page,
    payload: { page, page_size: pageSize },
    dedupe_key: `stage_export_page:${page}:${pageSize}`,
    max_attempts: 5,
  };
}

function identityBackfillRuntimeTaskPlanForProgress(job: ImportJobRow, progress: ConnectorRuntimeProgress & Record<string, any>): ConnectorRuntimeTaskPlan {
  const workspaceId = progress.workspace_id || "default";
  const connectorId = progress.connector_id || IDENTITY_BACKFILL_CONNECTOR_ID;
  const phase = progress.phase || "discover_unlinked_records";
  if (phase === "validate_and_finalize") {
    return {
      job_id: job.id,
      workspace_id: workspaceId,
      connector_id: connectorId,
      task_type: IDENTITY_BACKFILL_TASK_TYPES.finalize,
      phase: "validate_and_finalize",
      payload: {},
      dedupe_key: "identity_validate_and_finalize",
      max_attempts: 3,
    };
  }

  if (phase === "resolve_identity_batch") {
    return {
      job_id: job.id,
      workspace_id: workspaceId,
      connector_id: connectorId,
      task_type: IDENTITY_BACKFILL_TASK_TYPES.discover,
      phase: "discover_unlinked_records",
      cursor: progress.current_cursor,
      payload: {
        cursor: progress.current_cursor,
        limit: progress.metadata?.batch_size || IDENTITY_BACKFILL_DEFAULT_BATCH_SIZE,
      },
      dedupe_key: `identity_discover:${progress.current_cursor || "start"}`,
      max_attempts: 5,
    };
  }

  const cursor = progress.current_cursor || serializeIdentityBackfillCursor({
    current_platform: identityBackfillPlatformsFromProgress(progress)[0] || "wowboost",
    platform_order_id: null,
  });
  return {
    job_id: job.id,
    workspace_id: workspaceId,
    connector_id: connectorId,
    task_type: IDENTITY_BACKFILL_TASK_TYPES.discover,
    phase: "discover_unlinked_records",
    cursor,
    payload: {
      cursor,
      limit: progress.metadata?.batch_size || IDENTITY_BACKFILL_DEFAULT_BATCH_SIZE,
    },
    dedupe_key: `identity_discover:${cursor || "start"}`,
    max_attempts: 5,
  };
}

function connectorRuntimeTaskPlanForProgress(job: ImportJobRow, progress: ConnectorRuntimeProgress & Record<string, any>): ConnectorRuntimeTaskPlan {
  if (progress.connector_id === IDENTITY_BACKFILL_CONNECTOR_ID) {
    return identityBackfillRuntimeTaskPlanForProgress(job, progress);
  }
  return wowBoostRuntimeTaskPlanForProgress(job, progress);
}

async function startWowBoostCommerceReferenceRuntimeJob(env: Env, args: {
  workspace_id: string;
  from: string;
  to: string;
  job_id?: string | null;
  export_page_size?: number | null;
  details_limit?: number | null;
  pacing_ms?: number | null;
  max_export_pages?: number | null;
  force_new_job?: boolean | null;
}) {
  if (!env.wowboost_imports) {
    return {
      ok: false,
      status: 500,
      body: {
        ok: false,
        error: "queue_not_configured",
        message: "wowboost_imports queue binding is missing. Check wrangler.toml.",
      },
    };
  }

  let job: ImportJobRow | null = null;
  const forceNewJob = Boolean(args.force_new_job);
  if (args.job_id && !forceNewJob) {
    job = await getImportJob(env, args.job_id);
    if (!job) {
      return {
        ok: false,
        status: 404,
        body: {
          ok: false,
          error: "job_not_found",
          message: `Import job ${args.job_id} was not found.`,
        },
      };
    }
    if (!isConnectorRuntimeV1Job(job as any, WOWBOOST_BACKFILL_CONNECTOR_ID)) {
      return {
        ok: false,
        status: 400,
        body: {
          ok: false,
          error: "legacy_job_not_runtime_v1",
          message: "The supplied job_id is not a Connector Runtime v1 WowBoost commerce-reference backfill job. Omit job_id or set force_new_job=true to create a replacement runtime job.",
          job_id: job.id,
        },
      };
    }
  }
  if (!job && !forceNewJob) {
    job = await findActiveConnectorRuntimeJob(env, {
      workspace_id: args.workspace_id,
      connector_id: WOWBOOST_BACKFILL_CONNECTOR_ID,
      job_type: WOWBOOST_BACKFILL_JOB_TYPE,
      from: args.from,
      to: args.to,
    });
  }

  const now = new Date().toISOString();
  if (!job) {
    const progress = createConnectorRuntimeProgress({
      workspace_id: args.workspace_id,
      connector_id: WOWBOOST_BACKFILL_CONNECTOR_ID,
      job_type: WOWBOOST_BACKFILL_JOB_TYPE,
      phase: "stage_export_pages",
      requested_from: args.from,
      requested_to: args.to,
      now,
      metadata: connectorRuntimeMetadata({
        connector_id: WOWBOOST_BACKFILL_CONNECTOR_ID,
        metadata: {
          export_page_size: Math.max(1, Math.min(1000, Number(args.export_page_size || WOWBOOST_RUNTIME_DEFAULT_EXPORT_PAGE_SIZE))),
          details_limit: Math.max(1, Math.min(WOWBOOST_RUNTIME_MAX_DETAILS_LIMIT, Number(args.details_limit || WOWBOOST_RUNTIME_DEFAULT_DETAILS_LIMIT))),
          pacing_ms: normalizeWowBoostOrderDetailsPacingMs(args.pacing_ms || WOWBOOST_RUNTIME_DEFAULT_PACING_MS),
          max_export_pages: normalizeWowBoostRuntimeMaxExportPages(args.max_export_pages || WOWBOOST_RUNTIME_DEFAULT_MAX_EXPORT_PAGES),
        },
      }),
    });
    progress.status = "queued";
    progress.current_page = 1;
    job = await createImportJob(env, {
      platform: "wowboost",
      module: "connector_runtime",
      from: args.from,
      to: args.to,
      filter: WOWBOOST_BACKFILL_JOB_TYPE,
      workspace_id: args.workspace_id,
      connector_id: WOWBOOST_BACKFILL_CONNECTOR_ID,
      progress,
      status: "queued",
    });
    await updateConnectorRuntimeJobProgress(env, job, progress);
    job = await getImportJob(env, job.id) || job;
  }

  let progress = connectorRuntimeProgressFromJob(job);
  const explicitRuntimeResume = Boolean(args.job_id && !forceNewJob);
  const canResumeFailedRuntimeJob = explicitRuntimeResume && progress.status === "failed";
  if (
    progress.status === "paused" ||
    progress.status === "cancelled" ||
    (isTerminalConnectorRuntimeJobStatus(progress.status) && !canResumeFailedRuntimeJob)
  ) {
    return {
      ok: true,
      status: 202,
      body: {
        ok: true,
        job_id: job.id,
        status: progress.status,
        phase: progress.phase,
        queued: false,
        progress: await connectorRuntimeJobPayload(env, job),
        operations_status_url: `/v1/import-jobs/${job.id}`,
      },
    };
  }

  progress = {
    ...progress,
    status: "queued",
    started_at: progress.started_at || now,
    updated_at: now,
    completed_at: null,
    last_error: null,
  };
  await updateConnectorRuntimeJobProgress(env, job, progress);
  job = await getImportJob(env, job.id) || job;
  progress = connectorRuntimeProgressFromJob(job);
  const plan = wowBoostRuntimeTaskPlanForProgress(job, progress);
  const task = await createAndEnqueueConnectorRuntimeTask(env, plan);

  return {
    ok: true,
    status: 202,
    body: {
      ok: true,
      job_id: job.id,
      status: progress.status,
      phase: progress.phase,
      queued: true,
      task_id: task.task.id,
      duplicate_task_prevented: !task.created,
      progress: await connectorRuntimeJobPayload(env, job),
      operations_status_url: `/v1/import-jobs/${job.id}`,
    },
  };
}

async function startIdentityBackfillRuntimeJob(env: Env, args: {
  workspace_id: string;
  from: string;
  to: string;
  platforms: string[];
  batch_size: number;
  dry_run?: boolean | null;
  job_id?: string | null;
  force_new_job?: boolean | null;
}) {
  if (!env.wowboost_imports) {
    return {
      ok: false,
      status: 500,
      body: {
        ok: false,
        error: "queue_not_configured",
        message: "wowboost_imports queue binding is missing. Check wrangler.toml.",
      },
    };
  }

  let job: ImportJobRow | null = null;
  const forceNewJob = Boolean(args.force_new_job);
  if (args.job_id && !forceNewJob) {
    job = await getImportJob(env, args.job_id);
    if (!job) {
      return {
        ok: false,
        status: 404,
        body: {
          ok: false,
          error: "job_not_found",
          message: `Import job ${args.job_id} was not found.`,
        },
      };
    }
    if (!isConnectorRuntimeV1Job(job as any, IDENTITY_BACKFILL_CONNECTOR_ID)) {
      return {
        ok: false,
        status: 400,
        body: {
          ok: false,
          error: "legacy_job_not_runtime_v1",
          message: "The supplied job_id is not a Connector Runtime v1 Identity Backfill job. Omit job_id or set force_new_job=true to create a replacement runtime job.",
          job_id: job.id,
        },
      };
    }
  }

  if (!job && !forceNewJob) {
    const candidate = await findActiveConnectorRuntimeJob(env, {
      workspace_id: args.workspace_id,
      connector_id: IDENTITY_BACKFILL_CONNECTOR_ID,
      job_type: IDENTITY_BACKFILL_JOB_TYPE,
      from: args.from,
      to: args.to,
    });
    if (candidate) {
      const candidateProgress = connectorRuntimeProgressFromJob(candidate);
      const samePlatforms = JSON.stringify(identityBackfillPlatformsFromProgress(candidateProgress)) === JSON.stringify(args.platforms);
      const sameDryRun = Boolean(candidateProgress.metadata?.dry_run) === Boolean(args.dry_run);
      if (samePlatforms && sameDryRun) job = candidate;
    }
  }

  const now = new Date().toISOString();
  if (!job) {
    const cursor = serializeIdentityBackfillCursor({
      current_platform: args.platforms[0] || "wowboost",
      platform_order_id: null,
    });
    const progress = createConnectorRuntimeProgress({
      workspace_id: args.workspace_id,
      connector_id: IDENTITY_BACKFILL_CONNECTOR_ID,
      job_type: IDENTITY_BACKFILL_JOB_TYPE,
      phase: "discover_unlinked_records",
      requested_from: args.from,
      requested_to: args.to,
      now,
      metadata: connectorRuntimeMetadata({
        connector_id: IDENTITY_BACKFILL_CONNECTOR_ID,
        metadata: {
          platforms: args.platforms,
          batch_size: normalizeIdentityBackfillBatchSize(args.batch_size),
          dry_run: Boolean(args.dry_run),
          counters_version: 1,
          discovery_platforms: createIdentityBackfillDiscoveryState(args.platforms),
        },
      }),
    });
    progress.status = "queued";
    progress.current_cursor = cursor;
    progress.current_page = null;
    job = await createImportJob(env, {
      platform: "identity",
      module: "connector_runtime",
      from: args.from,
      to: args.to,
      filter: IDENTITY_BACKFILL_JOB_TYPE,
      workspace_id: args.workspace_id,
      connector_id: IDENTITY_BACKFILL_CONNECTOR_ID,
      progress,
      status: "queued",
    });
    await updateConnectorRuntimeJobProgress(env, job, progress);
    job = await getImportJob(env, job.id) || job;
  }

  let progress = connectorRuntimeProgressFromJob(job);
  const explicitRuntimeResume = Boolean(args.job_id && !forceNewJob);
  const canResumeFailedRuntimeJob = explicitRuntimeResume && progress.status === "failed";
  if (
    progress.status === "paused" ||
    progress.status === "cancelled" ||
    (isTerminalConnectorRuntimeJobStatus(progress.status) && !canResumeFailedRuntimeJob)
  ) {
    return {
      ok: true,
      status: 202,
      body: {
        ok: true,
        job_id: job.id,
        status: progress.status,
        phase: progress.phase,
        queued: false,
        progress: await connectorRuntimeJobPayload(env, job),
        operations_status_url: `/v1/import-jobs/${job.id}`,
      },
    };
  }

  progress = {
    ...progress,
    status: "queued",
    started_at: progress.started_at || now,
    updated_at: now,
    completed_at: null,
    last_error: null,
  };
  await updateConnectorRuntimeJobProgress(env, job, progress);
  job = await getImportJob(env, job.id) || job;
  progress = connectorRuntimeProgressFromJob(job);
  const task = await createAndEnqueueConnectorRuntimeTask(env, connectorRuntimeTaskPlanForProgress(job, progress));

  return {
    ok: true,
    status: 202,
    body: {
      ok: true,
      job_id: job.id,
      status: progress.status,
      phase: progress.phase,
      queued: true,
      task_id: task.task.id,
      duplicate_task_prevented: !task.created,
      progress: await connectorRuntimeJobPayload(env, job),
      operations_status_url: `/v1/import-jobs/${job.id}`,
    },
  };
}

async function runWowSuiteWowBoostImport(env: Env, args: { from: string; to: string; pageSize?: number; debug?: boolean }) {
  const supabase = getSupabase(env);

  const { data: creds, error } = await supabase
    .from("integrations_credentials")
    .select("*")
    .in("platform", [wowSuiteKey("wowboost"), "wowboost", "wowsuite"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`WOWSuite(wowboost) creds read failed: ${error.message}`);
  if (!creds) throw new Error("WowBoost not connected. Save credentials first.");

  const authBase = String((creds as any).base_url || env.DEFAULT_WOWSUITE_AUTH_BASE || DEFAULT_WOWSUITE_AUTH_BASE).replace(/\/+$/, "");
  const exportBase = String(env.DEFAULT_WOWSUITE_EXPORT_BASE || DEFAULT_WOWSUITE_EXPORT_BASE).replace(/\/+$/, "");
  const username = String((creds as any).username ?? "").trim();
  const password = await decryptSecretFromCredRow(env, creds as any);

  if (!parseYmd(args.from) || !parseYmd(args.to)) throw new Error("from/to must be YYYY-MM-DD");

  const bearer = await wowSuiteGetBearerToken({ authBase, username, password });
  const pageSize = Math.max(1, Math.min(2000, Number(args.pageSize ?? 1000)));

  let page = 1;
  let totalFetched = 0;
  let totalUpserted = 0;
  const maxPages = 250;

  while (page <= maxPages) {
    const exp = await wowBoostExportPage({ exportBase, bearer, page, pageSize, fromYmd: args.from, toYmd: args.to });

    const csvRes = await fetchWithTimeout(exp.link, { method: "GET", headers: { Accept: "text/csv,*/*" } }, 30000);
    const csvText = await readTextSafe(csvRes);
    if (!csvRes.ok) throw new Error(`WowBoost CSV download failed (${csvRes.status}): ${csvText.slice(0, 160)}`);

    const parsed = parseCsv(csvText);
    totalFetched += parsed.rows.length;

    const upserts = await Promise.all(
      parsed.rows.map(async (r) => {
        const orderId =
          pickField(r, ["Order ID", "OrderId", "OrderID", "order_id", "orderid", "Id", "ID"]) ||
          pickField(r, ["Order Number", "OrderNumber", "orderNumber", "Master Order Number", "MasterOrderNumber"]);

        if (!orderId) return null;

        const status = wowSuiteNormalizeStatus(
          pickField(r, ["Order Status Name", "OrderStatus", "orderStatus", "Status", "status"]) ||
            pickField(r, ["Receipt Status Name", "PaymentStatus", "paymentStatus", "Payment Status"])
        );

        const isoTs =
          parseDateToIsoMaybe(
            pickField(r, ["Order Create Date", "createDate", "CreateDate", "orderDate", "OrderDate", "Date", "CreatedAt", "Created", "lastUpdateDate", "LastUpdateDate", "Updated Date"])
          ) || `${args.from}T00:00:00.000Z`;

        let gross = parseMoneyMaybe(
          pickField(r, [
            "Order Price USD",
            "Order Price",
            "productPrice",
            "Product Price",
            "ProductPrice",
            "Amount USD",
            "Amount",
            "AmountUSD",
            "Total",
            "OrderTotal",
            "Gross",
            "Revenue",
            "amount",
          ])
        );

        if (gross == null) gross = 0;
        if ((status === "REFUNDED" || status === "CHARGEBACK" || status === "CANCELLED") && gross > 0) gross = -Math.abs(gross);

        const emailFields = await emailIdentityFields(
          pickField(r, ["CustomerEmail", "Customer Email", "Email", "email", "customerEmail"])
        );
        const phone = normalizePhone(pickField(r, ["CustomerPhone", "Customer Phone", "Phone", "phone", "Phone Number"]));
        const transactionId =
          pickField(r, ["PaymentTrackingNumber", "Payment Tracking Number", "TransactionId", "Transaction ID", "transaction_id", "ReferenceId", "Reference ID"]) || null;
        const commerceReferenceEvidence = extractWowBoostCommerceReferenceEvidence(r);
        const commerceReference = commerceReferenceEvidence.value || null;
        const efTid = pickEverflowTid(r) || null;

        return {
          platform: "wowboost",
          platform_order_id: `wowboost:${orderId}`,
          platform_store_id: pickField(r, ["Campaign ID", "CampaignId", "Campaign", "Brand Campaign"]) || null,
          order_id: String(orderId),
          commerce_reference: commerceReference,
          order_ts: isoTs,
          status: status || "UNKNOWN",
          status_norm: status || "UNKNOWN",
          gross_amount: gross,
          receipt_total: parseMoneyMaybe(pickField(r, ["Amount USD", "Amount", "AmountUSD", "amount"])) ?? null,
          currency: pickField(r, ["currencyCode", "CurrencyCode", "Currency", "currency", "Transaction Currency"]) || "USD",

          ...emailFields,
          email: emailFields.customer_email,
          phone: phone || null,

          transaction_id: transactionId,
          everflow_transaction_id: efTid,
          tkid: pickTrackingId(r) || null,
          affiliate_id: pickField(r, ["AffiliateId", "Affiliate ID", "affiliate_id", "Partner ID", "PartnerId"]) || null,
          everflow_offer_id: pickField(r, ["Offer ID", "OfferId", "Campaign ID", "CampaignId"]) || null,
          source_id: pickField(r, ["Source ID", "SourceId", "source_id"]) || null,
          sub1: pickField(r, ["S1", "s1", "sub1", "Sub1"]) || null,
          sub2: pickField(r, ["S2", "s2", "sub2", "Sub2"]) || null,
          sub3: pickField(r, ["S3", "s3", "sub3", "Sub3"]) || null,
          sub4: pickField(r, ["S4", "s4", "sub4", "Sub4"]) || null,
          sub5: pickField(r, ["S5", "s5", "sub5", "Sub5"]) || null,

          product_subtotal: parseMoneyMaybe(
			  pickField(r, [
			    "Order Price USD",
			    "Order Price",
			    "productPrice",
			    "Product Price",
			  ])
			) ?? null,
          shipping_amount: parseMoneyMaybe(pickField(r, ["Shipping Amount", "Shipping", "Shipping Price"])) ?? null,
          tax_amount: parseMoneyMaybe(pickField(r, ["Tax Amount", "Tax"])) ?? null,
          product_cost: parseMoneyMaybe(pickField(r, ["Product Cost", "COGS"])) ?? null,
          shipping_cost: parseMoneyMaybe(pickField(r, ["Shipping Cost"])) ?? null,
          gateway_fee: parseMoneyMaybe(pickField(r, ["Gateway Fee", "Processor Fee"])) ?? null,
          chargeback_fee: parseMoneyMaybe(pickField(r, ["Chargeback Fee"])) ?? null,
          tracking_number: pickField(r, ["ShipmentTrackingNumber", "Shipment Tracking Number", "FulfillmentTrackingNumber", "Tracking Number"]) || null,
          shipping_carrier: pickField(r, ["Shipping Carrier", "Carrier"]) || null,
          raw_json: {
            ...r,
            tracekit_commerce_reference_evidence: commerceReference
              ? {
                  source: "wowboost",
                  source_field: commerceReferenceEvidence.source_field,
                  value: commerceReference,
                }
              : null,
          },
        };
      })
    ).then((rows) => rows.filter(Boolean));

    const deduped = dedupePlatformOrders(upserts);

    if (deduped.length) {
      const { error: upErr } = await supabase.from("platform_orders").upsert(deduped as any[], { onConflict: "platform_order_id" });
      if (upErr) throw new Error(`WowBoost DB upsert failed: ${upErr.message}`);
      totalUpserted += deduped.length;
    }

    if (!exp.hasMore || parsed.rows.length === 0 || parsed.rows.length < pageSize) break;
    page += 1;
  }

  return { fetched: totalFetched, upserted: totalUpserted, pages: page };
}

async function runWowBoostImportJob(env: Env, args: { jobId: string; from: string; to: string; filter?: string | null; pageSize?: number; debug?: boolean }) {
  await updateImportJob(env, args.jobId, { status: "running", started_at: new Date().toISOString(), error: null });

  try {
    const res = await runWowSuiteWowBoostImport(env, { from: args.from, to: args.to, pageSize: args.pageSize, debug: args.debug });

    await updateImportJob(env, args.jobId, {
      status: "completed",
      completed_at: new Date().toISOString(),
      fetched: Number(res.fetched ?? 0),
      upserted: Number(res.upserted ?? 0),
      pages: Number(res.pages ?? 0),
      error: null,
    });
  } catch (e: any) {
    await updateImportJob(env, args.jobId, {
      status: "failed",
      completed_at: new Date().toISOString(),
      error: String(e?.message || e || "unknown"),
    });
    throw e;
  }
}

async function runScheduledCheckoutChampImport(env: Env) {
  const supabase = getSupabase(env);

  await supabase.from("integrations_settings").upsert(
    {
      platform: "checkoutchamp",
      auto_import_enabled: false,
      auto_import_interval_minutes: 60,
      auto_import_lookback_hours: 2,
      updated_at: new Date().toISOString(),
    } as any,
    { onConflict: "platform" }
  );

  const { data: s, error } = await supabase.from("integrations_settings").select("*").eq("platform", "checkoutchamp").maybeSingle();
  if (error) {
    console.error("[cron] settings read failed", error);
    return;
  }

  if (!s || !(s as any).auto_import_enabled) return;

  const lookbackHours = Math.max(1, Math.min(168, Number((s as any).auto_import_lookback_hours ?? 48)));
  const now = new Date();
  const from = isoYmdUTC(new Date(now.getTime() - lookbackHours * 3600000));
  const to = isoYmdUTC(now);

  await supabase
    .from("integrations_settings")
    .update({ last_run_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
    .eq("platform", "checkoutchamp");

  try {
    const res = await runCheckoutChampImport(env, { from, to, filter: "all_sales" });

    await supabase
      .from("integrations_settings")
      .update({ last_success_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
      .eq("platform", "checkoutchamp");

    console.log("[cron] checkoutchamp import ok", { from, to, ...res });
  } catch (e: any) {
    await supabase
      .from("integrations_settings")
      .update({ last_error: String(e?.message || e), updated_at: new Date().toISOString() })
      .eq("platform", "checkoutchamp");

    console.error("[cron] checkoutchamp import failed", e);
  }
}

async function runScheduledShopifyImport(env: Env) {
  const supabase = getSupabase(env);

  await supabase.from("integrations_settings").upsert(
    {
      platform: "shopify",
      auto_import_enabled: false,
      auto_import_interval_minutes: 60,
      auto_import_lookback_hours: 2,
      updated_at: new Date().toISOString(),
    } as any,
    { onConflict: "platform" }
  );

  const { data: s, error } = await supabase.from("integrations_settings").select("*").eq("platform", "shopify").maybeSingle();
  if (error) {
    console.error("[cron] shopify settings read failed", error);
    return;
  }

  if (!s || !(s as any).auto_import_enabled) return;

  const lookbackHours = Math.max(1, Math.min(168, Number((s as any).auto_import_lookback_hours ?? 48)));
  const now = new Date();
  const from = isoYmdUTC(new Date(now.getTime() - lookbackHours * 3600000));
  const to = isoYmdUTC(now);

  await supabase
    .from("integrations_settings")
    .update({ last_run_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
    .eq("platform", "shopify");

  try {
    const res = await runShopifyImport(env, { from, to, filter: "all_sales" });

    await supabase
      .from("integrations_settings")
      .update({ last_success_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
      .eq("platform", "shopify");

    console.log("[cron] shopify import ok", { from, to, ...res });
  } catch (e: any) {
    await supabase
      .from("integrations_settings")
      .update({ last_error: String(e?.message || e), updated_at: new Date().toISOString() })
      .eq("platform", "shopify");

    console.error("[cron] shopify import failed", e);
  }
}

function paypalErrorStatus(error: any) {
  if (error instanceof PaypalApiError) {
    if (error.status === 429) return 429;
    if (error.status === 408) return 408;
    if (error.status === 401 || error.status === 403) return 400;
    if (error.status >= 500) return 502;
  }
  return 500;
}

function paypalErrorPayload(error: any) {
  if (error instanceof PaypalApiError) {
    return {
      ok: false,
      error: error.code,
      message: error.message,
      paypal_status: error.status,
      capability: error.capability ?? null,
    };
  }

  return {
    ok: false,
    error: "paypal_failed",
    message: error?.message || String(error),
  };
}

async function getPaypalConnection(env: Env) {
  const creds = await getLatestCredential(env, "paypal");
  if (!creds) throw new Error("PayPal not connected. Save credentials first.");

  const metadata = normalizePaypalCredentialMetadata((creds as any).metadata);
  const environment = normalizePaypalEnvironment(metadata.environment) || "sandbox";
  const clientId = String((creds as any).username ?? "").trim();
  const clientSecret = await decryptSecretFromCredRow(env, creds as any);
  const baseUrl = paypalBaseUrlForEnvironment(environment);
  const connectorId = metadata.connector_id || stablePaypalConnectorId({
    merchantAccountId: metadata.merchant_account_id,
    clientId,
  });

  return {
    creds,
    metadata,
    environment,
    clientId,
    clientSecret,
    baseUrl,
    connectorId,
  };
}

async function mergePaypalCredentialMetadata(env: Env, patch: Partial<PaypalCredentialMetadata> & Record<string, any>) {
  const creds = await getLatestCredential(env, "paypal");
  if (!creds) return;

  const current = normalizePaypalCredentialMetadata((creds as any).metadata);
  const next = {
    ...current,
    ...patch,
    capabilities: {
      ...(current.capabilities || {}),
      ...(patch.capabilities || {}),
    },
  };

  await updateCredentialMetadata(env, "paypal", next);
}

function dedupeRowsByKey<T>(rows: T[], keyFn: (row: T) => string) {
  const map = new Map<string, T>();
  for (const row of rows) {
    const key = keyFn(row);
    if (key) map.set(key, row);
  }
  return Array.from(map.values());
}

const PAYPAL_COMMERCE_PLATFORMS = [
  "shopify",
  "checkoutchamp",
  "konnektive",
  "wowboost",
  "wowpay",
  "wowsuite",
  "wowsuite:wowboost",
  "wowsuite:wowpay",
];

const PAYPAL_CANDIDATE_SELECT =
  "platform,platform_order_id,order_id,commerce_reference,transaction_id,customer_email,customer_email_normalized,email,phone,gross_amount,currency,order_ts";

const PAYPAL_IMPORT_CHUNK_SIZE = 15;
const PAYPAL_MAX_CHUNKS_PER_INVOCATION = 1;
const PAYPAL_ROLLUP_MAX_ORDER_KEYS = 4;
const PAYPAL_ROLLUP_MAX_DAILY_KEYS = 2;
const MAINTENANCE_BATCH_LIMIT = 500;

type PaypalImportMetrics = {
  records_fetched: number;
  records_processed: number;
  chunks_processed: number;
  database_reads: number;
  database_writes: number;
  matched: number;
  unmatched: number;
  ambiguous: number;
  phone_matching_attempted: number;
  phone_matching_skipped: number;
  phone_matching_deferred: number;
  phone_match_warnings: string[];
  commerce_reference_lookup_deferred: number;
  commerce_transaction_lookup_deferred: number;
  reconciliation_lookup_warnings: string[];
  platform_order_rows_generated: number;
  platform_order_rows_deduplicated: number;
  platform_order_rows_skipped_no_reference: number;
  payment_transactions_upserted: number;
  platform_orders_upserted: number;
  ledger_inserted: number;
  ledger_skipped: number;
  duplicate_sales_skipped: number;
  rollup_orders_refreshed: number;
  rollup_daily_refreshed: number;
  rollup_warnings: string[];
};

function emptyPaypalImportMetrics(): PaypalImportMetrics {
  return {
    records_fetched: 0,
    records_processed: 0,
    chunks_processed: 0,
    database_reads: 0,
    database_writes: 0,
    matched: 0,
    unmatched: 0,
    ambiguous: 0,
    phone_matching_attempted: 0,
    phone_matching_skipped: 0,
    phone_matching_deferred: 0,
    phone_match_warnings: [],
    commerce_reference_lookup_deferred: 0,
    commerce_transaction_lookup_deferred: 0,
    reconciliation_lookup_warnings: [],
    platform_order_rows_generated: 0,
    platform_order_rows_deduplicated: 0,
    platform_order_rows_skipped_no_reference: 0,
    payment_transactions_upserted: 0,
    platform_orders_upserted: 0,
    ledger_inserted: 0,
    ledger_skipped: 0,
    duplicate_sales_skipped: 0,
    rollup_orders_refreshed: 0,
    rollup_daily_refreshed: 0,
    rollup_warnings: [],
  };
}

function addPaypalImportMetrics(target: PaypalImportMetrics, source: Partial<PaypalImportMetrics>) {
  for (const key of [
    "records_fetched",
    "records_processed",
    "chunks_processed",
    "database_reads",
    "database_writes",
    "matched",
    "unmatched",
    "ambiguous",
    "phone_matching_attempted",
    "phone_matching_skipped",
    "phone_matching_deferred",
    "commerce_reference_lookup_deferred",
    "commerce_transaction_lookup_deferred",
    "platform_order_rows_generated",
    "platform_order_rows_deduplicated",
    "platform_order_rows_skipped_no_reference",
    "payment_transactions_upserted",
    "platform_orders_upserted",
    "ledger_inserted",
    "ledger_skipped",
    "duplicate_sales_skipped",
    "rollup_orders_refreshed",
    "rollup_daily_refreshed",
  ] as const) {
    target[key] += Number(source[key] || 0);
  }
  if (source.phone_match_warnings?.length) target.phone_match_warnings.push(...source.phone_match_warnings);
  if (source.reconciliation_lookup_warnings?.length) target.reconciliation_lookup_warnings.push(...source.reconciliation_lookup_warnings);
  if (source.rollup_warnings?.length) target.rollup_warnings.push(...source.rollup_warnings);
}

function paypalComparableId(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function paypalCandidateKey(row: any) {
  return String(row?.platform_order_id || row?.order_id || row?.transaction_id || JSON.stringify(row));
}

function addPaypalCandidateRows(target: Map<string, PaypalCommerceOrderCandidate>, rows: any[] | null | undefined) {
  for (const row of rows || []) {
    const key = paypalCandidateKey(row);
    if (key) target.set(key, row as PaypalCommerceOrderCandidate);
  }
}

function maintenanceLimit(value: unknown, fallback = MAINTENANCE_BATCH_LIMIT) {
  return Math.max(1, Math.min(MAINTENANCE_BATCH_LIMIT, Number(value ?? fallback) || fallback));
}

function maintenanceCursor(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function isTransientWowBoostOrderDetailsError(error: unknown) {
  const text = String((error as any)?.message || error || "").toLowerCase();
  return text.includes("timeout") || text.includes("temporarily") || text.includes("network") || text.includes("fetch");
}

async function fetchWowBoostOrderDetailsReference(args: {
  authBase: string;
  bearer: string;
  orderId: string;
  maxAttempts?: number;
}) {
  const maxAttempts = Math.max(1, Math.min(WOWBOOST_ORDER_DETAILS_RETRY_MAX_ATTEMPTS, Number(args.maxAttempts ?? WOWBOOST_ORDER_DETAILS_RETRY_MAX_ATTEMPTS) || WOWBOOST_ORDER_DETAILS_RETRY_MAX_ATTEMPTS));
  let lastError = "";
  let lastStatus: number | null = null;
  let attempts = 0;
  let transient = false;
  let rateLimitRetries = 0;
  let retryAfterMsTotal = 0;
  let nextBackoffMs: number | null = null;
  const rateLimitWarnings: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attempts = attempt;
    try {
      const res = await fetchWithTimeout(`${args.authBase}/order/${encodeURIComponent(args.orderId)}`, {
        method: "GET",
        headers: {
          Authorization: `bearer ${args.bearer}`,
          Accept: "application/json, text/plain, */*",
        },
      }, 15000);
      lastStatus = res.status;
      const text = await readTextSafe(res);
      const parsed = safeJsonParse(text);
      const retryAfterMs = parseWowBoostRetryAfterMs(res.headers.get("Retry-After"));
      const failureClassification = classifyWowBoostOrderDetailsLookupFailure({
        status: res.status,
        error: text,
      });

      if (failureClassification === "permanent_not_found") {
        return {
          ok: false,
          status: res.status,
          reference: "",
          source_field: "",
          attempts: attempt,
          transient: false,
          failure_classification: failureClassification,
          rate_limit_retries: rateLimitRetries,
          retry_after_seconds: Math.ceil(retryAfterMsTotal / 1000),
          rate_limit_warnings: rateLimitWarnings,
          next_backoff_ms: nextBackoffMs,
          error: `WowBoost order ${args.orderId} not found`,
        };
      }

      if (res.ok && parsed) {
        const evidence = extractWowBoostOrderDetailsCommerceReference(parsed);
        return {
          ok: true,
          status: res.status,
          reference: evidence.value,
          source_field: evidence.source_field,
          attempts: attempt,
          failure_classification: null,
          rate_limit_retries: rateLimitRetries,
          retry_after_seconds: Math.ceil(retryAfterMsTotal / 1000),
          rate_limit_warnings: rateLimitWarnings,
        };
      }

      lastError = res.ok
        ? `WowBoost order ${args.orderId} returned invalid JSON`
        : `WowBoost order ${args.orderId} lookup failed (${res.status})`;
      transient = failureClassification === "transient";

      if (!transient || attempt >= maxAttempts) break;

      const jitterMs = res.status === 429 ? Math.floor(Math.random() * 250) : Math.floor(Math.random() * 100);
      nextBackoffMs = wowBoostOrderDetailsRetryDelayMs({
        attempt,
        status: res.status,
        retryAfterMs,
        jitterMs,
      });

      if (res.status === 429) {
        rateLimitRetries += 1;
        if (retryAfterMs !== null) retryAfterMsTotal += retryAfterMs;
        rateLimitWarnings.push(
          `wowboost_order_detail_rate_limited:${args.orderId}:attempt_${attempt}:wait_${nextBackoffMs}ms`,
        );
      }
    } catch (error: any) {
      lastError = error?.message || String(error);
      transient = isTransientWowBoostOrderDetailsError(error);
      if (!transient || attempt >= maxAttempts) break;

      nextBackoffMs = wowBoostOrderDetailsRetryDelayMs({
        attempt,
        status: null,
        jitterMs: Math.floor(Math.random() * 100),
      });
    }

    await sleepMs(nextBackoffMs || 0);
  }

  return {
    ok: false,
    status: lastStatus,
    reference: "",
    source_field: "",
    attempts,
    transient,
    failure_classification: classifyWowBoostOrderDetailsLookupFailure({
      status: lastStatus,
      error: lastError,
      transient,
    }),
    rate_limit_retries: rateLimitRetries,
    retry_after_seconds: Math.ceil(retryAfterMsTotal / 1000),
    rate_limit_warnings: rateLimitWarnings,
    next_backoff_ms: nextBackoffMs,
    error: lastError || `WowBoost order ${args.orderId} lookup failed`,
  };
}

function commerceReferenceKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function groupCommerceCandidatesByReference(rows: PaypalCommerceOrderCandidate[]) {
  const byReference = new Map<string, PaypalCommerceOrderCandidate[]>();
  for (const row of rows || []) {
    const key = commerceReferenceKey(row.commerce_reference);
    if (!key) continue;
    const existing = byReference.get(key) || [];
    existing.push(row);
    byReference.set(key, existing);
  }
  return byReference;
}

async function runPaypalRead(metrics: PaypalImportMetrics, label: string, query: any) {
  metrics.database_reads += 1;
  const { data, error } = await query;
  if (error) throw new Error(`${label} failed: ${error.message}`);
  return data || [];
}

type PaypalOptionalLookupResult = {
  data: any[];
  deferred: boolean;
};

async function runPaypalOptionalCommerceRead(
  metrics: PaypalImportMetrics,
  label: string,
  query: any,
): Promise<PaypalOptionalLookupResult> {
  metrics.database_reads += 1;
  const { data, error } = await query;
  if (!error) return { data: data || [], deferred: false };

  if (isPaypalTransientDatabaseError(error)) {
    return { data: [], deferred: true };
  }

  throw new Error(`${label} failed: ${error.message}`);
}

function recordPaypalReconciliationLookupDeferred(
  metrics: PaypalImportMetrics,
  kind: "commerce_reference_lookup_deferred" | "commerce_transaction_lookup_deferred",
  affectedRecords: number,
) {
  const count = Math.max(0, Math.floor(Number(affectedRecords) || 0));
  if (!count) return;

  metrics[kind] += count;
  metrics.reconciliation_lookup_warnings.push(paypalReconciliationLookupWarning(kind, count));
}

async function selectPaypalLinkedTransactionsBulk(
  supabase: SupabaseClientAny,
  keys: PaypalChunkLookupKeys,
  accountId: string,
  metrics: PaypalImportMetrics,
) {
  const currentChunkTransactions = new Set(keys.transactionIds.map(paypalComparableId).filter(Boolean));
  const parentIds = keys.parentTransactionIds.filter((id) => {
    const normalized = paypalComparableId(id);
    return normalized && !currentChunkTransactions.has(normalized);
  });

  if (!parentIds.length) return [] as PaypalMatchedTransaction[];

  const data = await runPaypalRead(
    metrics,
    "PayPal parent match lookup",
    supabase
      .from("payment_transactions")
      .select("transaction_id,parent_transaction_id,matched_platform_order_id,matched_order_id,match_confidence")
      .eq("platform", "paypal")
      .eq("account_id", accountId)
      .in("transaction_id", parentIds)
      .not("matched_platform_order_id", "is", null),
  );

  return data as PaypalMatchedTransaction[];
}

async function selectPaypalCommerceCandidatesBulk(
  supabase: SupabaseClientAny,
  keys: PaypalChunkLookupKeys,
  metrics: PaypalImportMetrics,
) {
  const byId = new Map<string, PaypalCommerceOrderCandidate>();

  if (keys.commerceReferences.length) {
    const commerceReferenceCandidates = await runPaypalOptionalCommerceRead(
      metrics,
      "PayPal commerce reference candidate lookup",
      supabase
        .from("platform_orders")
        .select(PAYPAL_CANDIDATE_SELECT)
        .in("platform", PAYPAL_COMMERCE_PLATFORMS)
        .in("commerce_reference", keys.commerceReferences)
        .limit(250),
    );
    addPaypalCandidateRows(byId, commerceReferenceCandidates.data);

    if (commerceReferenceCandidates.deferred) {
      recordPaypalReconciliationLookupDeferred(
        metrics,
        "commerce_reference_lookup_deferred",
        keys.commerceReferences.length,
      );
    }
  }

  if (keys.referenceIds.length) {
    const orderIdCandidates = await runPaypalOptionalCommerceRead(
      metrics,
      "PayPal commerce order_id candidate lookup",
      supabase
        .from("platform_orders")
        .select(PAYPAL_CANDIDATE_SELECT)
        .in("platform", PAYPAL_COMMERCE_PLATFORMS)
        .in("order_id", keys.referenceIds)
        .limit(250),
    );
    addPaypalCandidateRows(byId, orderIdCandidates.data);

    const platformOrderCandidates = await runPaypalOptionalCommerceRead(
      metrics,
      "PayPal commerce platform_order_id candidate lookup",
      supabase
        .from("platform_orders")
        .select(PAYPAL_CANDIDATE_SELECT)
        .in("platform", PAYPAL_COMMERCE_PLATFORMS)
        .in("platform_order_id", keys.referenceIds)
        .limit(250),
    );
    addPaypalCandidateRows(byId, platformOrderCandidates.data);

    if (orderIdCandidates.deferred || platformOrderCandidates.deferred) {
      recordPaypalReconciliationLookupDeferred(
        metrics,
        "commerce_reference_lookup_deferred",
        keys.referenceIds.length,
      );
    }
  }

  if (keys.transactionIds.length) {
    const storedTransactionCandidates = await runPaypalOptionalCommerceRead(
      metrics,
      "PayPal commerce stored transaction candidate lookup",
      supabase
        .from("platform_orders")
        .select(PAYPAL_CANDIDATE_SELECT)
        .in("platform", PAYPAL_COMMERCE_PLATFORMS)
        .in("transaction_id", keys.transactionIds)
        .limit(250),
    );
    addPaypalCandidateRows(byId, storedTransactionCandidates.data);

    if (storedTransactionCandidates.deferred) {
      recordPaypalReconciliationLookupDeferred(
        metrics,
        "commerce_transaction_lookup_deferred",
        keys.transactionIds.length,
      );
    }
  }

  if (keys.emails.length && keys.fromIso && keys.toIso) {
    addPaypalCandidateRows(
      byId,
      await runPaypalRead(
        metrics,
        "PayPal commerce email candidate lookup",
        supabase
          .from("platform_orders")
          .select(PAYPAL_CANDIDATE_SELECT)
          .in("platform", PAYPAL_COMMERCE_PLATFORMS)
          .in("customer_email_normalized", keys.emails)
          .gte("order_ts", keys.fromIso)
          .lte("order_ts", keys.toIso)
          .limit(500),
      ),
    );
  }

  return Array.from(byId.values());
}

async function reconcilePaypalRecordsBulk(supabase: SupabaseClientAny, records: any[], accountId: string, metrics: PaypalImportMetrics) {
  const keys = collectPaypalChunkLookupKeys(records);
  const priorLinks = await selectPaypalLinkedTransactionsBulk(supabase, keys, accountId, metrics);
  const candidates = await selectPaypalCommerceCandidatesBulk(supabase, keys, metrics);
  const results = new Map<string, PaypalReconciliationResult>();

  for (const record of records) {
    const recordId = stablePaypalRecordId(record, accountId);
    results.set(recordId, reconcilePaypalRecordToCommerceOrder({
      record,
      candidates,
      linkedPaypalTransactions: priorLinks,
    }));
  }

  const sameChunkLinks: PaypalMatchedTransaction[] = [];
  for (const record of records) {
    const recordId = stablePaypalRecordId(record, accountId);
    const match = results.get(recordId);
    const txId = paypalRecordMatchingFields(record).transactionId;
    if (match?.matched && txId) {
      sameChunkLinks.push({
        transaction_id: txId,
        matched_platform_order_id: match.matched_platform_order_id,
        matched_order_id: match.matched_order_id,
        match_confidence: match.match_confidence,
      });
    }
  }

  if (sameChunkLinks.length) {
    const allLinks = [...sameChunkLinks, ...priorLinks];
    for (const record of records) {
      const recordId = stablePaypalRecordId(record, accountId);
      if (!paypalParentTransactionIds(record).length) continue;

      const next = reconcilePaypalRecordToCommerceOrder({
        record,
        candidates,
        linkedPaypalTransactions: allLinks,
      });
      if (next.match_method === "parent_paypal_transaction") results.set(recordId, next);
    }
  }

  const phoneSummary = summarizeDeferredPaypalPhoneMatching(records, results, accountId);
  metrics.phone_matching_attempted += phoneSummary.phone_matching_attempted;
  metrics.phone_matching_skipped += phoneSummary.phone_matching_skipped;
  metrics.phone_matching_deferred += phoneSummary.phone_matching_deferred;
  metrics.phone_match_warnings.push(...phoneSummary.phone_match_warnings);

  return results;
}

async function selectExistingCommerceSaleOrderIds(supabase: SupabaseClientAny, reconciliations: Map<string, PaypalReconciliationResult>, metrics: PaypalImportMetrics) {
  const orderIds = Array.from(
    new Set(
      Array.from(reconciliations.values())
        .filter((match) => match.matched && match.matched_order_id)
        .map((match) => String(match.matched_order_id)),
    ),
  );

  if (!orderIds.length) return new Set<string>();

  const existing = new Set<string>();
  const data = await runPaypalRead(
    metrics,
    "PayPal commerce sale lookup",
    supabase
      .from("conversions")
      .select("order_id")
      .eq("ledger_type", "sale")
      .neq("platform", "paypal")
      .in("order_id", orderIds),
  );

  for (const row of data || []) {
    if ((row as any).order_id) existing.add(String((row as any).order_id));
  }

  return existing;
}

async function insertPaypalLedgerEvents(
  env: Env,
  records: any[],
  args: {
    supabase: SupabaseClientAny;
    accountId: string;
    connectorId: string;
    reconciliations?: Map<string, PaypalReconciliationResult>;
    existingCommerceSaleOrderIds?: Set<string>;
    metrics: PaypalImportMetrics;
  },
) {
  const eventsById = new Map<string, ReturnType<typeof buildPaypalLedgerEventsFromRecord>[number]>();
  let duplicateSalesSkipped = 0;

  for (const record of records) {
    const recordId = stablePaypalRecordId(record, args.accountId);
    const reconciliation = args.reconciliations?.get(recordId) || null;
    const events = buildPaypalLedgerEventsFromRecord(record, {
      accountId: args.accountId,
      connectorId: args.connectorId,
      orderId: reconciliation?.matched_order_id,
    });
    const filteredEvents = filterPaypalDuplicateCommerceSaleEvents(events, args.existingCommerceSaleOrderIds || new Set());
    duplicateSalesSkipped += events.length - filteredEvents.length;
    for (const event of filteredEvents) {
      eventsById.set(event.transactionId, event);
    }
  }

  const events = Array.from(eventsById.values());
  if (!events.length) {
    return {
      inserted: 0,
      skipped: 0,
      duplicate_sales_skipped: duplicateSalesSkipped,
      rollup_orders_refreshed: 0,
      rollup_daily_refreshed: 0,
      rollup_warnings: [] as string[],
    };
  }

  const eventIds = events.map((event) => event.transactionId);
  const existingIds = new Set<string>();

  const existing = await runPaypalRead(
    args.metrics,
    "PayPal ledger dedupe lookup",
    args.supabase
      .from("conversions")
      .select("transaction_id")
      .eq("platform", "paypal")
      .in("transaction_id", eventIds),
  );

  for (const row of existing || []) {
    existingIds.add(String((row as any).transaction_id || ""));
  }

  const rowsToInsert = events
    .filter((event) => !existingIds.has(event.transactionId))
    .map((event) => ({
      workspace_id: "default",
      ledger_type: event.ledgerType,
      event_source: "paypal",
      ingestion_method: "api_import",
      connector_id: event.connectorId,
      tkid: null,
      email: null,
      phone: null,
      order_id: event.orderId,
      transaction_id: event.transactionId,
      parent_transaction_id: event.parentTransactionId || null,
      amount: event.amount,
      currency: event.currency || "USD",
      platform: "paypal",
      source_system: "paypal",
      network: null,
      affiliate_id: null,
      campaign_id: null,
      offer_id: null,
      status: event.status,
      reason: event.reason,
      raw: event.raw,
      meta: {
        external_event_id: event.transactionId,
        paypal_account_id: event.accountId,
        source: "paypal_import",
      },
      occurred_at: event.occurredAt,
    }));

  if (!rowsToInsert.length) {
    return {
      inserted: 0,
      skipped: events.length,
      duplicate_sales_skipped: duplicateSalesSkipped,
      rollup_orders_refreshed: 0,
      rollup_daily_refreshed: 0,
      rollup_warnings: [] as string[],
    };
  }

  args.metrics.database_writes += 1;
  const { error: insertError } = await args.supabase.from("conversions").insert(rowsToInsert);
  if (insertError) throw new Error(`PayPal ledger insert failed: ${insertError.message}`);

  const rollup = await refreshProfitRollupsForInsertedRows(env, rowsToInsert as ProfitConversionRow[], {
    maxOrderKeys: PAYPAL_ROLLUP_MAX_ORDER_KEYS,
    maxDailyKeys: PAYPAL_ROLLUP_MAX_DAILY_KEYS,
    deferMessage: `PayPal import deferred Profit Engine refresh for ${uniqueProfitOrderKeys(rowsToInsert as ProfitConversionRow[]).length} order keys and ${uniqueProfitDailyKeys(rowsToInsert as ProfitConversionRow[]).length} daily keys to stay below the Worker subrequest budget.`,
  });
  args.metrics.database_reads += Number(rollup.database_reads || 0);
  args.metrics.database_writes += Number(rollup.database_writes || 0);

  return {
    inserted: rowsToInsert.length,
    skipped: events.length - rowsToInsert.length,
    duplicate_sales_skipped: duplicateSalesSkipped,
    rollup_orders_refreshed: rollup.orders_refreshed,
    rollup_daily_refreshed: rollup.daily_refreshed,
    rollup_warnings: rollup.warnings,
  };
}

async function processPaypalImportChunk(
  env: Env,
  supabase: SupabaseClientAny,
  records: any[],
  args: { accountId: string; connectorId: string },
) {
  const metrics = emptyPaypalImportMetrics();
  metrics.records_processed = records.length;
  metrics.chunks_processed = records.length ? 1 : 0;

  const reconciliations = await reconcilePaypalRecordsBulk(supabase, records, args.accountId, metrics);

  for (const match of reconciliations.values()) {
    if (match.matched) metrics.matched += 1;
    else if (match.ambiguous) metrics.ambiguous += 1;
    else metrics.unmatched += 1;
  }

  const existingCommerceSaleOrderIds = await selectExistingCommerceSaleOrderIds(supabase, reconciliations, metrics);

  const paymentRows = dedupeRowsByKey(
    await Promise.all(
      records.map((record) => {
        const recordId = stablePaypalRecordId(record, args.accountId);
        return normalizePaypalPaymentTransactionRow(record, {
          accountId: args.accountId,
          match: reconciliations.get(recordId) || null,
        });
      }),
    ),
    (row: any) => `${row.platform}\u001f${row.account_id}\u001f${row.external_record_id || row.transaction_id || ""}`,
  );

  if (paymentRows.length) {
    metrics.database_writes += 1;
    const { error } = await supabase
      .from("payment_transactions")
      .upsert(paymentRows as any[], { onConflict: "platform,account_id,external_record_id" });
    if (error) throw new Error(`PayPal payment transaction upsert failed: ${error.message}`);
    metrics.payment_transactions_upserted = paymentRows.length;
  }

  const platformOrderDedupe = dedupePaypalPlatformOrderRows(
    await Promise.all(
      records.map((record) =>
        normalizePaypalPlatformOrderRow(record, {
          accountId: args.accountId,
        }),
      ),
    ),
    { sourceRecordCount: records.length },
  );
  const platformRows = platformOrderDedupe.rows;
  metrics.platform_order_rows_generated += platformOrderDedupe.generated;
  metrics.platform_order_rows_deduplicated += platformOrderDedupe.deduplicated;
  metrics.platform_order_rows_skipped_no_reference += platformOrderDedupe.skippedNoReference;

  if (platformRows.length) {
    metrics.database_writes += 1;
    const { error } = await supabase.from("platform_orders").upsert(platformRows as any[], { onConflict: "platform_order_id" });
    if (error) throw new Error(`PayPal platform order upsert failed: ${error.message}`);
    metrics.platform_orders_upserted = platformRows.length;
  }

  const ledgerResult = await insertPaypalLedgerEvents(env, records, {
    supabase,
    accountId: args.accountId,
    connectorId: args.connectorId,
    reconciliations,
    existingCommerceSaleOrderIds,
    metrics,
  });

  metrics.ledger_inserted += ledgerResult.inserted;
  metrics.ledger_skipped += ledgerResult.skipped;
  metrics.duplicate_sales_skipped += ledgerResult.duplicate_sales_skipped;
  metrics.rollup_orders_refreshed += ledgerResult.rollup_orders_refreshed;
  metrics.rollup_daily_refreshed += ledgerResult.rollup_daily_refreshed;
  metrics.rollup_warnings.push(...ledgerResult.rollup_warnings);

  return metrics;
}

async function runPaypalImport(env: Env, args: RunImportArgs & { jobId?: string | null }) {
  if (!parseYmd(args.from) || !parseYmd(args.to)) throw new Error("from/to must be YYYY-MM-DD");

  const connection = await getPaypalConnection(env);
  const accessToken = await fetchPaypalAccessToken({
    environment: connection.environment,
    clientId: connection.clientId,
    clientSecret: connection.clientSecret,
  });

  const windows = splitPaypalDateRange(args.from, args.to);
  const windowIndex = Math.max(0, Math.min(windows.length - 1, Number(args.windowIndex ?? 0) || 0));
  const page = Math.max(1, Number(args.page ?? 1) || 1);
  const chunkSize = Math.max(10, Math.min(20, Number(args.chunkSize ?? args.pageSize ?? PAYPAL_IMPORT_CHUNK_SIZE) || PAYPAL_IMPORT_CHUNK_SIZE));
  const maxChunks = Math.max(1, Math.min(PAYPAL_MAX_CHUNKS_PER_INVOCATION, Number(args.maxChunks ?? PAYPAL_MAX_CHUNKS_PER_INVOCATION) || PAYPAL_MAX_CHUNKS_PER_INVOCATION));
  const pageSize = chunkSize * maxChunks;
  const supabase = getSupabase(env);
  const activeWindow = windows[windowIndex];
  const metrics = emptyPaypalImportMetrics();

  const parsed = await fetchPaypalTransactionPage({
    baseUrl: connection.baseUrl,
    accessToken: accessToken.access_token,
    startDate: activeWindow.startIso,
    endDate: activeWindow.endIso,
    page,
    pageSize,
  });
  const pageRecords = paypalTransactionDetails(parsed);
  const totalPages = Math.max(1, Number(parsed?.total_pages ?? parsed?.totalPages ?? page));
  metrics.records_fetched = pageRecords.length;

  if (args.jobId) {
    await updateImportJob(env, args.jobId, {
      status: "running",
      pages: page,
      fetched: pageRecords.length,
    });
  }

  const discoveredAccountId =
    pageRecords.map((record) => extractPaypalAccountId(record, connection.metadata.merchant_account_id)).find(Boolean) ||
    connection.metadata.merchant_account_id ||
    connection.connectorId;
  const connectorId = stablePaypalConnectorId({
    merchantAccountId: discoveredAccountId && !String(discoveredAccountId).startsWith("paypal:") ? discoveredAccountId : connection.metadata.merchant_account_id,
    clientId: connection.clientId,
  });

  const orderedRecords = [...pageRecords].sort((a, b) => {
    const parentDelta = paypalParentTransactionIds(a).length - paypalParentTransactionIds(b).length;
    if (parentDelta !== 0) return parentDelta;
    return String(paypalRecordMatchingFields(a).occurredAt || "").localeCompare(String(paypalRecordMatchingFields(b).occurredAt || ""));
  });

  for (const chunk of chunkPaypalRecords(orderedRecords, chunkSize).slice(0, maxChunks)) {
    const chunkMetrics = await processPaypalImportChunk(env, supabase, chunk, {
      accountId: discoveredAccountId,
      connectorId,
    });
    addPaypalImportMetrics(metrics, chunkMetrics);
  }

  const warnings = [...((connection.metadata.capabilities as PaypalCapabilityStatus | undefined)?.warnings || [])];
  const capabilities = {
    transaction_reporting: true,
    disputes: Boolean((connection.metadata.capabilities as PaypalCapabilityStatus | undefined)?.disputes),
    fees: true,
    webhooks: false,
    warnings,
  };

  const nextMetadata = {
    ...connection.metadata,
    environment: connection.environment,
    merchant_account_id: discoveredAccountId && !String(discoveredAccountId).startsWith("paypal:") ? discoveredAccountId : connection.metadata.merchant_account_id,
    connector_id: connectorId,
    last_successful_sync_at: new Date().toISOString(),
    capabilities: {
      ...(connection.metadata.capabilities || {}),
      ...capabilities,
    },
  };
  await updateCredentialMetadata(env, "paypal", nextMetadata);
  metrics.database_writes += 1;

  const hasMorePages = page < totalPages;
  const hasMoreWindows = !hasMorePages && windowIndex < windows.length - 1;
  const hasMore = hasMorePages || hasMoreWindows;
  const nextPage = hasMorePages ? page + 1 : hasMoreWindows ? 1 : null;
  const nextWindowIndex = hasMorePages ? windowIndex : hasMoreWindows ? windowIndex + 1 : null;

  return {
    fetched: metrics.records_fetched,
    upserted: metrics.platform_orders_upserted,
    pages: page,
    windows: windows.length,
    window_index: windowIndex,
    total_pages: totalPages,
    has_more: hasMore,
    next_page: nextPage,
    next_window_index: nextWindowIndex,
    current_window: {
      from: activeWindow.startIso,
      to: activeWindow.endIso,
    },
    chunk_size: chunkSize,
    max_chunks_per_invocation: maxChunks,
    records_fetched: metrics.records_fetched,
    records_processed: metrics.records_processed,
    chunks_processed: metrics.chunks_processed,
    database_reads: metrics.database_reads,
    database_writes: metrics.database_writes,
    matched: metrics.matched,
    unmatched: metrics.unmatched,
    ambiguous: metrics.ambiguous,
    phone_matching_attempted: metrics.phone_matching_attempted,
    phone_matching_skipped: metrics.phone_matching_skipped,
    phone_matching_deferred: metrics.phone_matching_deferred,
    phone_match_warnings: metrics.phone_match_warnings,
    commerce_reference_lookup_deferred: metrics.commerce_reference_lookup_deferred,
    commerce_transaction_lookup_deferred: metrics.commerce_transaction_lookup_deferred,
    reconciliation_lookup_warnings: metrics.reconciliation_lookup_warnings,
    platform_order_rows_generated: metrics.platform_order_rows_generated,
    platform_order_rows_deduplicated: metrics.platform_order_rows_deduplicated,
    platform_order_rows_skipped_no_reference: metrics.platform_order_rows_skipped_no_reference,
    payment_transactions_upserted: metrics.payment_transactions_upserted,
    platform_orders_upserted: metrics.platform_orders_upserted,
    ledger_inserted: metrics.ledger_inserted,
    ledger_skipped: metrics.ledger_skipped,
    duplicate_sales_skipped: metrics.duplicate_sales_skipped,
    rollup_orders_refreshed: metrics.rollup_orders_refreshed,
    rollup_daily_refreshed: metrics.rollup_daily_refreshed,
    rollup_warnings: metrics.rollup_warnings,
    connector_id: connectorId,
    account_id: discoveredAccountId,
  };
}

async function runScheduledPaypalImport(env: Env) {
  const supabase = getSupabase(env);

  await supabase.from("integrations_settings").upsert(
    {
      platform: "paypal",
      auto_import_enabled: false,
      auto_import_interval_minutes: 60,
      auto_import_lookback_hours: 30,
      updated_at: new Date().toISOString(),
    } as any,
    { onConflict: "platform" }
  );

  const { data: s, error } = await supabase.from("integrations_settings").select("*").eq("platform", "paypal").maybeSingle();
  if (error) {
    console.error("[cron] paypal settings read failed", error);
    return;
  }

  if (!s || !(s as any).auto_import_enabled) return;

  const lookbackHours = Math.max(1, Math.min(168, Number((s as any).auto_import_lookback_hours ?? 30)));
  const overlapHours = 24;
  const now = new Date();
  const from = isoYmdUTC(new Date(now.getTime() - (lookbackHours + overlapHours) * 3600000));
  const to = isoYmdUTC(now);

  await supabase
    .from("integrations_settings")
    .update({ last_run_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
    .eq("platform", "paypal");

  try {
    const res = await runPaypalImport(env, { from, to, filter: "all_financial_records" });

    await supabase
      .from("integrations_settings")
      .update({ last_success_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
      .eq("platform", "paypal");

    console.log("[cron] paypal import ok", { from, to, ...res });
  } catch (e: any) {
    await supabase
      .from("integrations_settings")
      .update({ last_error: String(e?.message || e), updated_at: new Date().toISOString() })
      .eq("platform", "paypal");

    console.error("[cron] paypal import failed", e);
  }
}

async function handleTestConnect(req: Request, env: Env) {
  const body = await readJsonBody(req);
  const platform = coercePlatformKey(body.platform);

  if (platform === "shopify") {
    const shopDomain = normalizeShopifyShopDomain(body.shopDomain || body.shop_domain || body.baseUrl || body.base_url);
    const token = String(body.adminAccessToken || body.admin_access_token || body.password || "").trim();
    const apiVersion = normalizeShopifyApiVersion(body.apiVersion || body.api_version);

    if (!shopDomain) {
      return json({ ok: false, message: "Invalid Shopify shop domain. Use your-store.myshopify.com or the store handle." }, 400);
    }

    if (!token) {
      return json({ ok: false, message: "Admin API access token is required." }, 400);
    }

    const result = await testShopifyConnection({ shopDomain, apiVersion, token });
    return json({ platform, ...result }, result.ok ? 200 : 400);
  }

  if (platform === "paypal") {
    const environment = normalizePaypalEnvironment(body.environment);
    const clientId = String(body.clientId || body.client_id || body.username || "").trim();
    const clientSecret = String(body.clientSecret || body.client_secret || body.password || "").trim();

    if (!environment) {
      return json({ ok: false, message: "PayPal environment must be sandbox or live." }, 400);
    }

    if (!clientId || !clientSecret) {
      return json({ ok: false, message: "PayPal client ID and client secret are required." }, 400);
    }

    try {
      const result = await testPaypalConnection({ environment, clientId, clientSecret });
      return json({ platform, ...result });
    } catch (e: any) {
      return json(paypalErrorPayload(e), paypalErrorStatus(e));
    }
  }

  const baseUrl = String(
    body.baseUrl || body.base_url || (platform === "checkoutchamp" ? env.DEFAULT_CC_BASE || DEFAULT_CC_BASE : DEFAULT_WOWSUITE_AUTH_BASE)
  ).replace(/\/+$/, "");
  const username = String(body.username || body.loginId || body.login_id || "").trim();
  const password = String(body.password || "");

  if (!platform || !baseUrl || !username || !password) {
    return json({ ok: false, message: "platform, baseUrl, username, and password are required." }, 400);
  }

  if (platform === "checkoutchamp") {
    const result = await testCheckoutChampConnection({ baseUrl, username, password });
    return json(
      {
        platform,
        message: result.ok ? "Connection successful." : "Connection failed.",
        ...result,
      },
      result.ok ? 200 : 400
    );
  }

  if (platform.startsWith("wowsuite") || platform === "wowsuite") {
    const token = await wowSuiteGetBearerToken({ authBase: baseUrl, username, password });
    return json({ ok: true, platform, message: "Connection successful.", token_preview: `${token.slice(0, 8)}…` });
  }

  return json({ ok: false, message: `Unsupported platform: ${platform}` }, 400);
}

async function handleSaveCredentials(req: Request, env: Env) {
  const body = await readJsonBody(req);
  const platform = coercePlatformKey(body.platform);

  if (platform === "shopify") {
    const shopDomain = normalizeShopifyShopDomain(body.shopDomain || body.shop_domain || body.baseUrl || body.base_url);
    const token = String(body.adminAccessToken || body.admin_access_token || body.password || "").trim();
    const apiVersion = normalizeShopifyApiVersion(body.apiVersion || body.api_version);

    if (!shopDomain) {
      return json({ ok: false, message: "Invalid Shopify shop domain. Use your-store.myshopify.com or the store handle." }, 400);
    }

    if (!token) {
      return json({ ok: false, message: "Admin API access token is required." }, 400);
    }

    await saveCredential(env, {
      platform,
      baseUrl: shopDomain,
      username: apiVersion,
      password: token,
    });

    return json({ ok: true, platform, shopDomain, apiVersion, message: "Credentials saved." });
  }

  if (platform === "paypal") {
    const environment = normalizePaypalEnvironment(body.environment);
    const clientId = String(body.clientId || body.client_id || body.username || "").trim();
    const clientSecret = String(body.clientSecret || body.client_secret || body.password || "").trim();

    if (!environment) {
      return json({ ok: false, message: "PayPal environment must be sandbox or live." }, 400);
    }

    if (!clientId || !clientSecret) {
      return json({ ok: false, message: "PayPal client ID and client secret are required." }, 400);
    }

    try {
      const result = await testPaypalConnection({ environment, clientId, clientSecret });
      const connectorId = stablePaypalConnectorId({
        merchantAccountId: result.merchant_account_id,
        clientId,
      });
      const metadata: PaypalCredentialMetadata = {
        environment,
        merchant_account_id: result.merchant_account_id ?? null,
        webhook_id: body.webhookId || body.webhook_id || null,
        connector_label: body.connectorLabel || body.connector_label || null,
        connector_id: connectorId,
        last_successful_sync_at: null,
        capabilities: result.capabilities,
      };

      await saveCredential(env, {
        platform,
        baseUrl: paypalBaseUrlForEnvironment(environment),
        username: clientId,
        password: clientSecret,
        metadata,
      });

      return json({
        ok: true,
        platform,
        environment,
        merchant_account_id: result.merchant_account_id ?? null,
        connector_id: connectorId,
        capabilities: result.capabilities,
        message: "PayPal credentials saved.",
      });
    } catch (e: any) {
      return json(paypalErrorPayload(e), paypalErrorStatus(e));
    }
  }

  const baseUrl = String(
    body.baseUrl || body.base_url || (platform === "checkoutchamp" ? env.DEFAULT_CC_BASE || DEFAULT_CC_BASE : DEFAULT_WOWSUITE_AUTH_BASE)
  ).replace(/\/+$/, "");
  const username = String(body.username || body.loginId || body.login_id || "").trim();
  const password = String(body.password || "");

  if (!platform || !baseUrl || !username || !password) {
    return json({ ok: false, message: "platform, baseUrl, username, and password are required." }, 400);
  }

  await saveCredential(env, { platform, baseUrl, username, password });

  return json({ ok: true, platform, message: "Credentials saved." });
}

async function runNmiImportPage(env: Env, args: { from: string; to: string; offset?: number; pageSize?: number }) {
  const supabase = getSupabase(env);
  const pageSize = Math.max(1, Math.min(1000, Number(args.pageSize ?? 1000)));
  const offset = Math.max(0, Number(args.offset ?? 0));

  const creds = await getLatestCredential(env, "nmi:lifeheater14090");
  if (!creds) throw new Error("NMI not connected.");

  const apiKey = await decryptSecretFromCredRow(env, creds as any);
  const baseUrl = String((creds as any).base_url || "https://api.nmi.com").replace(/\/+$/, "");

  const auth = btoa(`api_key:${apiKey}`);

	const res = await fetch(`${baseUrl}/api/v4/transactions/reports`, {
	  method: "POST",
	  headers: {
		  Authorization: apiKey.trim(),
		  "Content-Type": "application/json",
		  Accept: "application/json",
		},
	  body: JSON.stringify({
	    maxResults: pageSize,
	    offset,
	    date: {
	      startDate: args.from,
	      endDate: args.to,
	    },
	  }),
	});

  const text = await readTextSafe(res);
  if (!res.ok) throw new Error(`NMI transaction report failed ${res.status}: ${text.slice(0, 500)}`);

  const js = safeJsonParse(text);
  if (!js) throw new Error(`NMI returned invalid JSON: ${text.slice(0, 500)}`);

  const rows =
    Array.isArray(js.data) ? js.data :
    Array.isArray(js.transactions) ? js.transactions :
    Array.isArray(js.results) ? js.results :
    [];

  const upserts = await Promise.all(
    rows.map(async (t: any) => {
    const id = String(t.transactionId ?? t.transactionID ?? t.id ?? t.transaction_id ?? "").trim();
    if (!id) return null;

    const status = normalizeOrderStatus(t.status ?? t.condition ?? t.responseText ?? t.actionType);
    let gross = parseMoneyMaybe(t.amount ?? t.amountAuthorized ?? t.settlementAmount ?? t.totalAmount);
    if (gross == null) gross = 0;

    if ((status === "REFUNDED" || status === "CHARGEBACK" || status === "CANCELLED") && gross > 0) {
      gross = -Math.abs(gross);
    }

    const emailFields = await emailIdentityFields(t.email ?? t.customerEmail ?? t.billingEmail ?? t.billing?.email);
    const phone = normalizePhone(t.phone ?? t.customerPhone ?? t.billingPhone ?? t.billing?.phone);
    const orderId = String(t.orderId ?? t.orderID ?? t.order_id ?? t.orderNumber ?? t.invoiceNumber ?? id).trim();

    return {
      platform: "nmi:lifeheater14090",
      platform_order_id: `nmi:lifeheater14090:${id}`,
      order_id: orderId || id,
      order_ts: parseDateToIsoMaybe(t.createdAt ?? t.date ?? t.transactionDate ?? t.actionDate) || `${args.from}T00:00:00.000Z`,
      status,
      status_norm: status,
      gross_amount: gross,
      currency: t.currency ?? "USD",

      ...emailFields,
      email: emailFields.customer_email,
      phone: phone || null,
      transaction_id: id,
      raw_json: t,
    };
    })
  ).then((rows) => rows.filter(Boolean));

  const deduped = dedupePlatformOrders(upserts);

  if (deduped.length) {
    const { error } = await supabase
      .from("platform_orders")
      .upsert(deduped as any[], { onConflict: "platform_order_id" });

    if (error) throw new Error(error.message);
  }

  return {
    fetched: rows.length,
    upserted: deduped.length,
    offset,
    pageSize,
    hasMore: rows.length >= pageSize,
    nextOffset: rows.length >= pageSize ? offset + pageSize : null,
    rawKeys: Object.keys(js || {}),
  };
}

function nmiClassicDate(ymd: string, end = false) {
  return `${ymd.replace(/-/g, "")}${end ? "235959" : "000000"}`;
}

function xmlValue(block: string, tag: string) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = re.exec(block);
  return m ? m[1].trim() : "";
}

function xmlBlocks(xml: string, tag: string) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const out: string[] = [];
  let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

async function runNmiClassicImportPage(env: Env, args: { from: string; to: string; page?: number; pageSize?: number }) {
  const supabase = getSupabase(env);
  const page = Math.max(0, Number(args.page ?? 0));
  const pageSize = Math.max(1, Math.min(1000, Number(args.pageSize ?? 1000)));

  const creds = await getLatestCredential(env, "nmi:lifeheater14090");
  if (!creds) throw new Error("NMI LifeHeater14090 not connected.");

  const securityKey = await decryptSecretFromCredRow(env, creds as any);
  const baseUrl = String((creds as any).base_url || "https://secure.networkmerchants.com").replace(/\/+$/, "");

  const form = new URLSearchParams();
  form.set("security_key", securityKey.trim());
  form.set("start_date", nmiClassicDate(args.from, false));
  form.set("end_date", nmiClassicDate(args.to, true));
  form.set("result_limit", String(pageSize));
  form.set("page_number", String(page));
  form.set("result_order", "standard");
  form.set("condition", "pending,pendingsettlement,in_progress,abandoned,failed,canceled,complete,unknown");

  const res = await fetch(`${baseUrl}/api/query.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const xml = await readTextSafe(res);
  if (!res.ok) throw new Error(`NMI classic query failed ${res.status}: ${xml.slice(0, 500)}`);

  const transactions = xmlBlocks(xml, "transaction");

  const upserts = transactions.map((tx) => {
    const id = xmlValue(tx, "transaction_id");
    if (!id) return null;

    const condition = xmlValue(tx, "condition");
    const currency = xmlValue(tx, "currency") || "USD";
    const actions = xmlBlocks(tx, "action");
    const primaryAction = actions.find((a) => xmlValue(a, "action_type") === "sale") || actions[0] || "";

    const actionType = xmlValue(primaryAction, "action_type");
    const actionDate = xmlValue(primaryAction, "date");
    const amountRaw = xmlValue(primaryAction, "amount") || xmlValue(primaryAction, "requested_amount");

    let status = normalizeOrderStatus(condition || actionType || xmlValue(primaryAction, "response_text"));
    let gross = parseMoneyMaybe(amountRaw);
    if (gross == null) gross = 0;

    if (
      actionType === "refund" ||
      actionType === "credit" ||
      actionType === "return" ||
      status === "REFUNDED" ||
      status === "CHARGEBACK" ||
      status === "CANCELLED"
    ) {
      gross = -Math.abs(gross);
    }

    const isoTs = actionDate
      ? `${actionDate.slice(0, 4)}-${actionDate.slice(4, 6)}-${actionDate.slice(6, 8)}T${actionDate.slice(8, 10)}:${actionDate.slice(10, 12)}:${actionDate.slice(12, 14)}.000Z`
      : `${args.from}T00:00:00.000Z`;

    const rawJson = {
      transaction_id: id,
      condition,
      action_type: actionType,
      action_date: actionDate,
      amount: amountRaw,
      currency,
      xml: tx,
    };

    const emailFields = {
      customer_email: null,
      customer_email_normalized: null,
      customer_email_hash: null,
    };

    return {
      platform: "nmi:lifeheater14090",
      platform_order_id: `nmi:lifeheater14090:${id}`,
      order_id: id,
      order_ts: isoTs,
      status,
      status_norm: status,
      gross_amount: gross,
      currency,
      ...emailFields,
      transaction_id: id,
      raw_json: rawJson,
    };
  }).filter(Boolean);

  const deduped = dedupePlatformOrders(upserts);

  if (deduped.length) {
    const { error } = await supabase
      .from("platform_orders")
      .upsert(deduped as any[], { onConflict: "platform_order_id" });

    if (error) throw new Error(error.message);
  }

  return {
    fetched: transactions.length,
    upserted: deduped.length,
    page,
    pageSize,
    hasMore: transactions.length >= pageSize,
    nextPage: transactions.length >= pageSize ? page + 1 : null,
  };
}

async function runPayDiverseClassicImportPage(env: Env, args: { from: string; to: string; page?: number; pageSize?: number }) {
  const supabase = getSupabase(env);
  const page = Math.max(0, Number(args.page ?? 0));
  const pageSize = Math.max(1, Math.min(1000, Number(args.pageSize ?? 1000)));

  const creds = await getLatestCredential(env, "paydiverse");
  if (!creds) throw new Error("PayDiverse not connected.");

  const securityKey = await decryptSecretFromCredRow(env, creds as any);
  const baseUrl = String((creds as any).base_url || "https://paydiverse.transactiongateway.com").replace(/\/+$/, "");

  const form = new URLSearchParams();
  form.set("security_key", securityKey.trim());
  form.set("start_date", nmiClassicDate(args.from, false));
  form.set("end_date", nmiClassicDate(args.to, true));
  form.set("result_limit", String(pageSize));
  form.set("page_number", String(page));
  form.set("result_order", "standard");
  form.set("condition", "pending,pendingsettlement,in_progress,abandoned,failed,canceled,complete,unknown");

  const res = await fetch(`${baseUrl}/api/query.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const xml = await readTextSafe(res);
  if (!res.ok) throw new Error(`PayDiverse classic query failed ${res.status}: ${xml.slice(0, 500)}`);

  const transactions = xmlBlocks(xml, "transaction");

  const upserts = transactions.map((tx) => {
    const id = xmlValue(tx, "transaction_id");
    if (!id) return null;

    const condition = xmlValue(tx, "condition");
    const currency = xmlValue(tx, "currency") || "USD";
    const actions = xmlBlocks(tx, "action");
    const primaryAction = actions.find((a) => xmlValue(a, "action_type") === "sale") || actions[0] || "";

    const actionType = xmlValue(primaryAction, "action_type");
    const actionDate = xmlValue(primaryAction, "date");
    const amountRaw = xmlValue(primaryAction, "amount") || xmlValue(primaryAction, "requested_amount");

    let status = normalizeOrderStatus(condition || actionType || xmlValue(primaryAction, "response_text"));
    let gross = parseMoneyMaybe(amountRaw);
    if (gross == null) gross = 0;

    if (
      actionType === "refund" ||
      actionType === "credit" ||
      actionType === "return" ||
      status === "REFUNDED" ||
      status === "CHARGEBACK" ||
      status === "CANCELLED"
    ) {
      gross = -Math.abs(gross);
    }

    const isoTs = actionDate
      ? `${actionDate.slice(0, 4)}-${actionDate.slice(4, 6)}-${actionDate.slice(6, 8)}T${actionDate.slice(8, 10)}:${actionDate.slice(10, 12)}:${actionDate.slice(12, 14)}.000Z`
      : `${args.from}T00:00:00.000Z`;

    const rawJson = {
      transaction_id: id,
      condition,
      action_type: actionType,
      action_date: actionDate,
      amount: amountRaw,
      currency,
      xml: tx,
    };

    return {
      platform: "paydiverse",
      platform_order_id: `paydiverse:${id}`,
      order_id: id,
      order_ts: isoTs,
      status,
      status_norm: status,
      gross_amount: gross,
      currency,
      transaction_id: id,
      raw_json: rawJson,
    };
  }).filter(Boolean);

  const deduped = dedupePlatformOrders(upserts);

  if (deduped.length) {
    const { error } = await supabase
      .from("platform_orders")
      .upsert(deduped as any[], { onConflict: "platform_order_id" });

    if (error) throw new Error(error.message);
  }

  return {
    fetched: transactions.length,
    upserted: deduped.length,
    page,
    pageSize,
    hasMore: transactions.length >= pageSize,
    nextPage: transactions.length >= pageSize ? page + 1 : null,
  };
}

async function runGatewayClassicImportPage(env: Env, args: {
  platform: string;
  from: string;
  to: string;
  page?: number;
  pageSize?: number;
}) {
  const supabase = getSupabase(env);
  const platform = String(args.platform || "").trim();
  const page = Math.max(0, Number(args.page ?? 0));
  const pageSize = Math.max(1, Math.min(1000, Number(args.pageSize ?? 1000)));

  if (!platform) throw new Error("platform is required");

  const creds = await getLatestCredential(env, platform);
  if (!creds) throw new Error(`${platform} not connected.`);

  const securityKey = await decryptSecretFromCredRow(env, creds as any);
  const baseUrl = String((creds as any).base_url || "https://secure.networkmerchants.com").replace(/\/+$/, "");

  const form = new URLSearchParams();
  form.set("security_key", securityKey.trim());
  form.set("start_date", nmiClassicDate(args.from, false));
  form.set("end_date", nmiClassicDate(args.to, true));
  form.set("result_limit", String(pageSize));
  form.set("page_number", String(page));
  form.set("result_order", "standard");
  form.set("condition", "pending,pendingsettlement,in_progress,abandoned,failed,canceled,complete,unknown");

  const res = await fetch(`${baseUrl}/api/query.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const xml = await readTextSafe(res);
  if (!res.ok) throw new Error(`Gateway classic query failed ${res.status}: ${xml.slice(0, 500)}`);

  const transactions = xmlBlocks(xml, "transaction");

  const upserts = transactions.map((tx) => {
    const id = xmlValue(tx, "transaction_id");
    if (!id) return null;

    const condition = xmlValue(tx, "condition");
    const currency = xmlValue(tx, "currency") || "USD";
    const actions = xmlBlocks(tx, "action");
    const primaryAction = actions.find((a) => xmlValue(a, "action_type") === "sale") || actions[0] || "";

    const actionType = xmlValue(primaryAction, "action_type");
    const actionDate = xmlValue(primaryAction, "date");
    const amountRaw = xmlValue(primaryAction, "amount") || xmlValue(primaryAction, "requested_amount");

    let status = normalizeOrderStatus(condition || actionType || xmlValue(primaryAction, "response_text"));
    let gross = parseMoneyMaybe(amountRaw);
    if (gross == null) gross = 0;

    if (
      actionType === "refund" ||
      actionType === "credit" ||
      actionType === "return" ||
      status === "REFUNDED" ||
      status === "CHARGEBACK" ||
      status === "CANCELLED"
    ) {
      gross = -Math.abs(gross);
    }

    const isoTs = actionDate
      ? `${actionDate.slice(0, 4)}-${actionDate.slice(4, 6)}-${actionDate.slice(6, 8)}T${actionDate.slice(8, 10)}:${actionDate.slice(10, 12)}:${actionDate.slice(12, 14)}.000Z`
      : `${args.from}T00:00:00.000Z`;

    const rawJson = {
      transaction_id: id,
      condition,
      action_type: actionType,
      action_date: actionDate,
      amount: amountRaw,
      currency,
      xml: tx,
    };

    return {
      platform,
      platform_order_id: `${platform}:${id}`,
      order_id: id,
      order_ts: isoTs,
      status,
      status_norm: status,
      gross_amount: gross,
      currency,
      transaction_id: id,
      raw_json: rawJson,
    };
  }).filter(Boolean);

  const deduped = dedupePlatformOrders(upserts);

  if (deduped.length) {
    const { error } = await supabase
      .from("platform_orders")
      .upsert(deduped as any[], { onConflict: "platform_order_id" });

    if (error) throw new Error(error.message);
  }

  return {
    fetched: transactions.length,
    upserted: deduped.length,
    page,
    pageSize,
    hasMore: transactions.length >= pageSize,
    nextPage: transactions.length >= pageSize ? page + 1 : null,
  };
}


async function rebuildCustomerProfiles(env: Env) {
  const supabase = getSupabase(env);
  const { error: deleteError } = await supabase
	  .from("customer_profiles")
	  .delete()
	  .not("identity_key", "is", null);
	
	if (deleteError) {
	  throw new Error(deleteError.message);
	}

  const allOrders: any[] = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("platform_orders")
      .select(
        "platform_order_id, identity_key, customer_email, customer_email_normalized, email, phone, gross_amount, order_ts"
      )
      .not("identity_key", "is", null)
      .order("platform_order_id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(error.message);

    allOrders.push(...(data || []));

    if (!data || data.length < pageSize) break;

    offset += pageSize;
  }

  const grouped = new Map<string, any>();

  for (const o of allOrders) {
    const key = String(o.identity_key || "").trim();
    if (!key) continue;

    const gross = Number(o.gross_amount || 0);
    const ts = o.order_ts ? new Date(o.order_ts).toISOString() : null;

    const existing = grouped.get(key) || {
      identity_key: key,
      primary_email:
        o.customer_email_normalized || o.customer_email || o.email || null,
      primary_phone: o.phone || null,
      order_count: 0,
      lifetime_revenue: 0,
      first_order_ts: ts,
      last_order_ts: ts,
    };

    existing.order_count += 1;
    existing.lifetime_revenue += Number.isFinite(gross) ? gross : 0;

    if (!existing.primary_email) {
      existing.primary_email =
        o.customer_email_normalized || o.customer_email || o.email || null;
    }

    if (!existing.primary_phone && o.phone) {
      existing.primary_phone = o.phone;
    }

    if (ts) {
      if (!existing.first_order_ts || ts < existing.first_order_ts) {
        existing.first_order_ts = ts;
      }

      if (!existing.last_order_ts || ts > existing.last_order_ts) {
        existing.last_order_ts = ts;
      }
    }

    grouped.set(key, existing);
  }

  const profiles = Array.from(grouped.values()).map((p) => ({
    identity_key: p.identity_key,
    primary_email: p.primary_email,
    primary_phone: p.primary_phone,
    order_count: p.order_count,
    lifetime_revenue: p.lifetime_revenue,
    average_order_value:
      p.order_count > 0 ? p.lifetime_revenue / p.order_count : 0,
    first_order_ts: p.first_order_ts,
    last_order_ts: p.last_order_ts,
    updated_at: new Date().toISOString(),
  }));

  const batchSize = 500;

  for (let i = 0; i < profiles.length; i += batchSize) {
    const batch = profiles.slice(i, i + batchSize);

    const { error: upsertError } = await supabase
      .from("customer_profiles")
      .upsert(batch, { onConflict: "identity_key" });

    if (upsertError) throw new Error(upsertError.message);
  }

  return {
    scanned_orders: allOrders.length,
    rebuilt_profiles: profiles.length,
  };
}


async function router(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "OPTIONS") return corsPreflight();

  if (path === "/__ping" && req.method === "GET") {
    return json({
      ok: true,
      path,
      now: new Date().toISOString(),
      ...buildFingerprint(env),
    });
  }

  const identityRoute = matchIdentityRoute(req.method, url.pathname);
  if (identityRoute?.kind === "method_not_allowed") {
    return json({
      ok: false,
      error: "method_not_allowed",
      message: `${identityRoute.path} requires ${identityRoute.allowed_methods.join(", ")}.`,
      allowed_methods: identityRoute.allowed_methods,
    }, 405, { Allow: identityRoute.allowed_methods.join(", ") });
  }

  if (identityRoute?.kind === "identity_resolve") {
    try {
      const body = await readJsonBody(req);
      const result = await getIdentityService(env).resolveIdentity({
        workspace_id: body.workspace_id,
        identifiers: Array.isArray(body.identifiers) ? body.identifiers : [],
        source_platform: body.source_platform,
        source_record_type: body.source_record_type,
        source_record_id: body.source_record_id,
        source_connector_id: body.source_connector_id,
        connector_job_id: body.connector_job_id,
        person_attributes: body.person_attributes || body.attributes || null,
        observed_at: body.observed_at,
        metadata: compactIdentityMetadata(body.metadata),
      });
      return json({ ok: true, ...result });
    } catch (e: any) {
      return json({ ok: false, error: "identity_resolve_failed", message: e?.message || String(e) }, 400);
    }
  }

  if (identityRoute?.kind === "identity_review") {
    const service = getIdentityService(env);
    const workspaceId = identityWorkspace(url.searchParams.get("workspace_id"));
    const events = await service.reviewQueue({
      workspace_id: workspaceId,
      limit: identityLimit(url.searchParams.get("limit")),
      offset: identityOffset(url.searchParams.get("offset")),
    });
    return json({
      ok: true,
      workspace_id: workspaceId,
      review_items: events.map(compactIdentityEvent),
    });
  }

  if (path === "/v1/identity/backfill-platform-orders" && req.method === "POST") {
    const body = await readJsonBody(req);
    const parsed = normalizeIdentityBackfillRequest(body);
    if (!parsed.ok) return json({ ok: false, error: parsed.error, message: parsed.message }, parsed.status);
    const result = await startIdentityBackfillRuntimeJob(env, parsed.value);
    return json(result.body, result.status);
  }

  if (path === "/v1/identity/backfill-platform-orders" && req.method !== "POST") {
    return json({
      ok: false,
      error: "method_not_allowed",
      message: "/v1/identity/backfill-platform-orders requires POST.",
      allowed_methods: ["POST"],
    }, 405, { Allow: "POST" });
  }

  if (path === "/v1/operations/identity" && req.method === "GET") {
    const supabase = getSupabase(env);
    const workspaceId = identityWorkspace(url.searchParams.get("workspace_id"));
    const today = isoYmdUTC(new Date());
    const identifierTypes = [
      "email",
      "phone",
      "paypal_payer_id",
      "stripe_customer_id",
      "shopify_customer_id",
      "woocommerce_customer_id",
      "checkoutchamp_customer_id",
      "fanbasis_customer_id",
      "everflow_transaction_id",
      "external_customer_id",
      "order_customer_id",
    ];

    const [
      activePeople,
      createdToday,
      matchedToday,
      conflicts,
      manualMerges,
      recordsWithoutPerson,
      resolutionEventsToday,
      recentErrors,
      ...identifierCounts
    ] = await Promise.all([
      supabase.from("people").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "active"),
      supabase.from("identity_resolution_events").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("resolution_action", "created_person").gte("created_at", `${today}T00:00:00.000Z`),
      supabase.from("identity_resolution_events").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("resolution_action", "matched_existing_person").gte("created_at", `${today}T00:00:00.000Z`),
      supabase.from("identity_resolution_events").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).in("resolution_action", ["conflict_detected", "review_required"]),
      supabase.from("person_merge_history").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
      supabase.from("platform_orders").select("platform_order_id", { count: "exact", head: true }).eq("workspace_id", workspaceId).is("person_id", null),
      supabase.from("identity_resolution_events").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).gte("created_at", `${today}T00:00:00.000Z`),
      supabase
        .from("identity_resolution_events")
        .select("id,resolution_action,resolution_reason,source_platform,source_record_type,source_record_id,created_at")
        .eq("workspace_id", workspaceId)
        .in("resolution_action", ["conflict_detected", "review_required", "no_match"])
        .order("created_at", { ascending: false })
        .limit(10),
      ...identifierTypes.map((identifierType) =>
        supabase
          .from("person_identifiers")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .eq("identifier_type", identifierType)
          .in("verification_status", ["observed", "verified"]),
      ),
    ]);

    const errors = [
      activePeople,
      createdToday,
      matchedToday,
      conflicts,
      manualMerges,
      recordsWithoutPerson,
      resolutionEventsToday,
      recentErrors,
      ...identifierCounts,
    ].map((result: any) => result?.error?.message).filter(Boolean);
    if (errors.length) throw new Error(`Identity operations metrics failed: ${errors[0]}`);

    const identifiersByType: Record<string, number> = {};
    identifierTypes.forEach((identifierType, index) => {
      identifiersByType[identifierType] = Number((identifierCounts[index] as any)?.count || 0);
    });
    const totalResolutionEvents = Number((resolutionEventsToday as any).count || 0);
    const matchedResolutionEvents = Number((matchedToday as any).count || 0) + Number((createdToday as any).count || 0);
    const { data: identityBackfillJobs } = await supabase
      .from("integration_import_jobs")
      .select("*")
      .eq("connector_id", IDENTITY_BACKFILL_CONNECTOR_ID)
      .in("status", ["queued", "running", "retrying", "paused"])
      .order("updated_at", { ascending: false })
      .limit(5);
    const activeBackfillJobs = [];
    for (const job of (identityBackfillJobs || []) as ImportJobRow[]) {
      if (isConnectorRuntimeV1Job(job as any, IDENTITY_BACKFILL_CONNECTOR_ID)) {
        activeBackfillJobs.push(await connectorRuntimeJobPayload(env, job, { recent_errors: false }));
      }
    }

    return json({
      ok: true,
      workspace_id: workspaceId,
      active_people: Number((activePeople as any).count || 0),
      identifiers_by_type: identifiersByType,
      identities_created_today: Number((createdToday as any).count || 0),
      existing_identities_matched_today: Number((matchedToday as any).count || 0),
      conflicts_awaiting_review: Number((conflicts as any).count || 0),
      manual_merges: Number((manualMerges as any).count || 0),
      records_without_person_id: Number((recordsWithoutPerson as any).count || 0),
      resolution_rate: totalResolutionEvents ? matchedResolutionEvents / totalResolutionEvents : null,
      recent_identity_errors: (recentErrors as any).data || [],
      active_identity_backfill_jobs: activeBackfillJobs,
    });
  }

  if (path === "/v1/people/search" && req.method === "GET") {
    const workspaceId = identityWorkspace(url.searchParams.get("workspace_id"));
    const externalCustomerId = url.searchParams.get("external_customer_id");
    const people = await getIdentityService(env).searchPeople({
      workspace_id: workspaceId,
      person_id: url.searchParams.get("person_id"),
      email: url.searchParams.get("email"),
      phone: url.searchParams.get("phone"),
      country: url.searchParams.get("country"),
      identifier_type: externalCustomerId ? "external_customer_id" : url.searchParams.get("identifier_type"),
      value: externalCustomerId ?? url.searchParams.get("value"),
      limit: identityLimit(url.searchParams.get("limit")),
      offset: identityOffset(url.searchParams.get("offset")),
    });
    return json({
      ok: true,
      workspace_id: workspaceId,
      people: people.map(compactIdentityPerson),
    });
  }

  if (path === "/v1/people/merge-preview" && req.method === "POST") {
    const body = await readJsonBody(req);
    const preview = await getIdentityService(env).previewMerge({
      workspace_id: body.workspace_id,
      source_person_id: String(body.source_person_id || "").trim(),
      target_person_id: String(body.target_person_id || "").trim(),
    });
    return json({ ok: true, ...preview });
  }

  if (path === "/v1/people/merge" && req.method === "POST") {
    const body = await readJsonBody(req);
    const result = await getIdentityService(env).mergePeople({
      workspace_id: body.workspace_id,
      source_person_id: String(body.source_person_id || "").trim(),
      target_person_id: String(body.target_person_id || "").trim(),
      reason: String(body.reason || "manual_merge").trim() || "manual_merge",
      performed_by: body.performed_by ? String(body.performed_by).trim() : null,
    });
    return json({ ok: true, ...result });
  }

  const peopleRoute = path.match(/^\/v1\/people\/([^/]+)(?:\/([^/]+))?$/);
  if (peopleRoute) {
    const personId = decodeURIComponent(peopleRoute[1] || "");
    const action = peopleRoute[2] || "";
    const service = getIdentityService(env);

    if (req.method === "GET" && !action) {
      const workspaceId = identityWorkspace(url.searchParams.get("workspace_id"));
      const person = await service.getPerson(workspaceId, personId);
      if (!person) return json({ ok: false, error: "not_found", message: "Person not found." }, 404);
      return json({ ok: true, person: compactIdentityPerson(person) });
    }

    if (req.method === "GET" && action === "identifiers") {
      const workspaceId = identityWorkspace(url.searchParams.get("workspace_id"));
      const identifiers = await service.getPersonIdentifiers(workspaceId, personId);
      return json({
        ok: true,
        person_id: personId,
        identifiers: identifiers.map(compactIdentityIdentifier),
      });
    }

    if (req.method === "GET" && action === "history") {
      const workspaceId = identityWorkspace(url.searchParams.get("workspace_id"));
      const events = await service.getIdentityResolutionHistory(
        workspaceId,
        personId,
        identityLimit(url.searchParams.get("limit")),
        identityOffset(url.searchParams.get("offset")),
      );
      return json({
        ok: true,
        person_id: personId,
        history: events.map(compactIdentityEvent),
      });
    }

    if (req.method === "POST" && action === "identifiers") {
      const body = await readJsonBody(req);
      const identifier = await service.attachIdentifier({
        workspace_id: body.workspace_id,
        person_id: personId,
        identifier_type: body.identifier_type,
        value: body.value ?? body.raw_value,
        country: body.country,
        verification_status: body.verification_status,
        source_platform: body.source_platform,
        source_record_type: body.source_record_type,
        source_record_id: body.source_record_id,
        source_connector_id: body.source_connector_id,
        observed_at: body.observed_at,
      });
      return json({ ok: true, identifier: identifier ? compactIdentityIdentifier(identifier) : null });
    }

    return json({ ok: false, error: "not_found", message: "Unknown people route." }, 404);
  }

  if (path === "/v1/integrations/import-jobs/active" && req.method === "GET") {
    const platform = coercePlatformKey(url.searchParams.get("platform") || "");
    const connectorId = url.searchParams.has("connector_id")
      ? String(url.searchParams.get("connector_id") || "").trim() || null
      : null;
    const workspaceId = String(url.searchParams.get("workspace_id") || "default").trim() || "default";

    if (!platform) {
      return json({ ok: false, error: "bad_request", message: "platform is required" }, 400);
    }

    if (!isSharedImportPlatform(platform)) {
      return json({
        ok: false,
        error: "unsupported_import_platform",
        message: "This platform does not support shared import progress.",
      }, 400);
    }

    let job = await findLatestImportJob(env, {
      workspace_id: workspaceId,
      platform,
      connector_id: connectorId,
      activeOnly: true,
    });

    if (!job) {
      const latest = await findLatestImportJob(env, {
        workspace_id: workspaceId,
        platform,
        connector_id: connectorId,
        activeOnly: false,
      });
      const latestStatus = latest ? progressFromJob(latest).status : null;
      if (latestStatus === "failed" || latestStatus === "cancelled") job = latest;
    }

    return json({
      ok: true,
      job: publicImportJobPayload(job),
      active: job ? isActiveImportStatus(progressFromJob(job).status) : false,
    });
  }

  if (path === "/v1/integrations/import-jobs/status" && req.method === "GET") {
    const jobId = String(url.searchParams.get("job_id") || "").trim();
    const fullProgress = requestFullProgress(url.searchParams.get("full_progress") ?? url.searchParams.get("fullProgress"));
    if (!jobId) return json({ ok: false, error: "bad_request", message: "job_id is required" }, 400);

    const job = await getImportJob(env, jobId);
    if (!job) return json({ ok: false, error: "not_found", message: "Import job not found" }, 404);

    const progress = progressFromJob(job);
    const payload = buildPublicImportJobPayload(job, progress, { full_progress: fullProgress });
    return json({
      ok: true,
      job: payload,
      done: !isActiveImportStatus(progress.status),
    });
  }

  if (path === "/v1/integrations/import-jobs/start" && req.method === "POST") {
    const body = await readJsonBody(req);
    const rawPlatform = String(body.platform || "").trim();
    const platform = coercePlatformKey(rawPlatform);
    const connectorId = String(body.connector_id || platform).trim() || platform;
    const workspaceId = String(body.workspace_id || "default").trim() || "default";
    const from = String(body.from || body.requested_from || "").trim();
    const to = String(body.to || body.requested_to || "").trim();
    const filter = String(body.filter ?? "all_sales").trim();

    if (!platform) {
      return json({ ok: false, error: "bad_request", message: "platform is required" }, 400);
    }

    if (!isSharedImportPlatform(platform)) {
      return json({
        ok: false,
        error: "unsupported_import_platform",
        message: "This platform does not support shared import progress.",
      }, 400);
    }

    if (!parseYmd(from) || !parseYmd(to)) {
      return json({ ok: false, error: "bad_request", message: "from/to must be YYYY-MM-DD" }, 400);
    }

    const existing = await findActiveImportJob(env, {
      workspace_id: workspaceId,
      platform,
      connector_id: connectorId,
      from,
      to,
      filter,
    });

    if (existing) {
      return json({
        ok: true,
        duplicate_prevented: true,
        job_id: existing.id,
        job: publicImportJobPayload(existing),
        message: "An import for this range is already active.",
      });
    }

    const progress = createInitialImportProgress({
      workspace_id: workspaceId,
      platform,
      connector_id: connectorId,
      from,
      to,
      filter,
    });

    const job = await createImportJob(env, {
      platform,
      module: connectorModuleForPlatform(platform),
      from,
      to,
      filter,
      workspace_id: workspaceId,
      connector_id: connectorId,
      progress,
      status: "queued",
    });

    return json({
      ok: true,
      duplicate_prevented: false,
      job_id: job.id,
      job: publicImportJobPayload(job),
      message: "Import queued.",
    });
  }

  if ((path === "/v1/integrations/import-jobs/continue" || path === "/v1/integrations/import-jobs/resume") && req.method === "POST") {
    const body = await readJsonBody(req);
    const jobId = String(body.job_id || body.jobId || "").trim();
    const fullProgress = requestFullProgress(body.full_progress ?? body.fullProgress);
    if (!jobId) return json({ ok: false, error: "bad_request", message: "job_id is required" }, 400);

    try {
      const result = await continueImportJob(env, jobId, {
        resume: path.endsWith("/resume") || Boolean(body.resume),
      });
      const latest = result.job?.id ? await getImportJob(env, result.job.id) : await getImportJob(env, jobId);
      const latestProgress = latest ? progressFromJob(latest) : null;
      const payload = latest && latestProgress
        ? buildPublicImportJobPayload(latest, latestProgress, { full_progress: fullProgress })
        : null;

      return json({
        ok: true,
        job_id: jobId,
        job: payload,
        progress: fullProgress ? (payload as any)?.progress : null,
        chunk: result.chunk,
        done: latestProgress ? !isActiveImportStatus(latestProgress.status) : true,
      });
    } catch (e: any) {
      const latest = await getImportJob(env, jobId).catch(() => null);
      return json({
        ok: false,
        error: "import_job_continue_failed",
        message: e?.message || String(e),
        job_id: jobId,
        job: publicImportJobPayload(latest),
      }, 500);
    }
  }

	  if (path === "/v1/integrations/import-jobs/cancel" && req.method === "POST") {
    const body = await readJsonBody(req);
    const jobId = String(body.job_id || body.jobId || "").trim();
    if (!jobId) return json({ ok: false, error: "bad_request", message: "job_id is required" }, 400);

    const job = await getImportJob(env, jobId);
    if (!job) return json({ ok: false, error: "not_found", message: "Import job not found" }, 404);

    const progress = cancelImportProgress(progressFromJob(job));
    await updateImportJobProgress(env, job, progress);
    const latest = await getImportJob(env, jobId);

    return json({
      ok: true,
      job_id: jobId,
      job: publicImportJobPayload(latest),
      progress,
      message: "Import cancelled.",
	    });
	  }

  const runtimeJobRoute = path.match(/^\/v1\/import-jobs\/([^/]+)(?:\/([^/]+))?$/);
  if (runtimeJobRoute) {
    const jobId = decodeURIComponent(runtimeJobRoute[1] || "");
    const action = runtimeJobRoute[2] || "";
    const job = await getImportJob(env, jobId);
    if (!job) return json({ ok: false, error: "not_found", message: "Import job not found" }, 404);

    if (req.method === "GET" && !action) {
      return json({ ok: true, job: await connectorRuntimeJobPayload(env, job) });
    }

    if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

    const progress = connectorRuntimeProgressFromJob(job);
    if (action === "pause") {
      const nextProgress = mergeConnectorRuntimeCounters(progress, {}, { status: "paused", last_error: null });
      await updateConnectorRuntimeJobProgress(env, job, nextProgress);
      return json({ ok: true, job_id: job.id, status: "paused", job: await connectorRuntimeJobPayload(env, await getImportJob(env, job.id)) });
    }

    if (action === "resume") {
      const nextProgress = mergeConnectorRuntimeCounters(progress, {}, {
        status: "queued",
        last_error: null,
        next_run_at: null,
      });
      nextProgress.completed_at = null;
      await updateConnectorRuntimeJobProgress(env, job, nextProgress);
      const latest = await getImportJob(env, job.id) || job;
      const task = await createAndEnqueueConnectorRuntimeTask(env, connectorRuntimeTaskPlanForProgress(latest, connectorRuntimeProgressFromJob(latest)));
      return json({
        ok: true,
        job_id: job.id,
        status: "queued",
        task_id: task.task.id,
        queued: true,
        job: await connectorRuntimeJobPayload(env, await getImportJob(env, job.id)),
      });
    }

    if (action === "cancel") {
      const now = new Date().toISOString();
      const nextProgress = mergeConnectorRuntimeCounters(progress, {}, { status: "cancelled", now });
      nextProgress.completed_at = now;
      await updateConnectorRuntimeJobProgress(env, job, nextProgress);
      return json({ ok: true, job_id: job.id, status: "cancelled", job: await connectorRuntimeJobPayload(env, await getImportJob(env, job.id)) });
    }

    if (action === "rerun-finalize") {
      if (!isConnectorRuntimeV1Job(job, progress.connector_id)) {
        return json({ ok: false, error: "not_runtime_job", message: "Only Connector Runtime v1 jobs support rerun-finalize." }, 409);
      }
      const nextProgress = connectorRuntimeRerunFinalizeProgress(progress);
      await updateConnectorRuntimeJobProgress(env, job, nextProgress);
      const latest = await getImportJob(env, job.id) || job;
      const finalizePlan = progress.connector_id === IDENTITY_BACKFILL_CONNECTOR_ID
        ? {
          job_id: job.id,
          workspace_id: progress.workspace_id,
          connector_id: progress.connector_id,
          task_type: IDENTITY_BACKFILL_TASK_TYPES.finalize,
          phase: "validate_and_finalize",
          payload: {},
          dedupe_key: "identity_validate_and_finalize",
          max_attempts: 3,
        }
        : {
          job_id: job.id,
          workspace_id: progress.workspace_id,
          connector_id: progress.connector_id,
          task_type: "wowboost_validate_and_finalize",
          phase: "validate_and_finalize",
          payload: {},
          dedupe_key: "validate_and_finalize",
          max_attempts: 3,
        };
      const task = await resetAndEnqueueConnectorRuntimeTask(env, finalizePlan);
      return json({
        ok: true,
        job_id: job.id,
        status: "queued",
        phase: "validate_and_finalize",
        task_id: task.task.id,
        queued: true,
        job: await connectorRuntimeJobPayload(env, latest),
      });
    }

    if (action === "retry-failed") {
      const supabase = getSupabase(env);
      const { data: failedTasks, error } = await supabase
        .from("connector_import_tasks")
        .select("*")
        .eq("job_id", job.id)
        .eq("status", "failed")
        .order("updated_at", { ascending: true })
        .limit(25);
      if (error) throw new Error(`Failed to read failed runtime tasks: ${error.message}`);
      let queued = 0;
      for (const task of (failedTasks || []) as ConnectorImportTaskRow[]) {
        await updateConnectorRuntimeTask(env, task.id, {
          status: "queued",
          available_at: new Date().toISOString(),
          locked_at: null,
          completed_at: null,
          last_error: null,
        });
        await enqueueConnectorRuntimeTask(env, task);
        queued += 1;
      }
      const nextProgress = mergeConnectorRuntimeCounters(progress, {}, { status: queued ? "queued" : progress.status, last_error: null });
      await updateConnectorRuntimeJobProgress(env, job, nextProgress);
      return json({
        ok: true,
        job_id: job.id,
        queued,
        job: await connectorRuntimeJobPayload(env, await getImportJob(env, job.id)),
      });
    }

    return json({ ok: false, error: "not_found", message: "Unknown import job operation." }, 404);
  }

  if (path === "/v1/operations/jobs" && req.method === "GET") {
    const supabase = getSupabase(env);
    const { data, error } = await supabase
      .from("integration_import_jobs")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(Math.max(1, Math.min(50, Number(url.searchParams.get("limit") || 25))));
    if (error) throw new Error(`Failed to read operation jobs: ${error.message}`);
    const jobs = [];
    for (const job of (data || []) as ImportJobRow[]) jobs.push(await connectorRuntimeJobPayload(env, job, { recent_errors: false }));
    return json({ ok: true, jobs });
  }

  const operationsJobRoute = path.match(/^\/v1\/operations\/jobs\/([^/]+)$/);
  if (operationsJobRoute && req.method === "GET") {
    const job = await getImportJob(env, decodeURIComponent(operationsJobRoute[1] || ""));
    if (!job) return json({ ok: false, error: "not_found", message: "Import job not found" }, 404);
    return json({ ok: true, job: await connectorRuntimeJobPayload(env, job) });
  }

  if (path === "/v1/operations/connectors/health" && req.method === "GET") {
    const supabase = getSupabase(env);
    const [{ count: activeJobs }, { count: queuedTasks }, { count: failedTasks }, { data: recentErrors }] = await Promise.all([
      supabase.from("integration_import_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "running", "retrying", "paused"]),
      supabase.from("connector_import_tasks").select("id", { count: "exact", head: true }).eq("status", "queued"),
      supabase.from("connector_import_tasks").select("id", { count: "exact", head: true }).eq("status", "failed"),
      supabase.from("integration_import_errors").select("connector_id,error_class,classification,message,created_at").order("created_at", { ascending: false }).limit(10),
    ]);
    return json({
      ok: true,
      connectors: [
        {
          connector_id: WOWBOOST_BACKFILL_CONNECTOR_ID,
          status: Number(failedTasks || 0) ? "degraded" : "ok",
          active_jobs: Number(activeJobs || 0),
          queued_tasks: Number(queuedTasks || 0),
          failed_tasks: Number(failedTasks || 0),
          recent_errors: recentErrors || [],
        },
        {
          connector_id: IDENTITY_BACKFILL_CONNECTOR_ID,
          status: Number(failedTasks || 0) ? "degraded" : "ok",
          active_jobs: Number(activeJobs || 0),
          queued_tasks: Number(queuedTasks || 0),
          failed_tasks: Number(failedTasks || 0),
          recent_errors: recentErrors || [],
        },
      ],
    });
  }

	  if (path === "/v1/profit/rebuild-order" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const workspaceId = String(body.workspace_id || "default").trim() || "default";
      const orderId = String(body.order_id || "").trim();
      const connectorId = String(body.connector_id || "").trim();
      const currency = String(body.currency || "").trim().toUpperCase();

      if (!orderId || !connectorId || !currency) {
        return json({
          ok: false,
          error: "bad_request",
          message: "workspace_id, order_id, connector_id, and currency are required",
        }, 400);
      }

      const supabase = getSupabase(env);
      const key = { workspaceId, orderId, connectorId, currency };
      const orderResult = await refreshProfitOrderRollup(supabase, key);
      const sourceRows = await selectAllProfitConversionsForOrder(supabase, key);
      const dailyKeys = uniqueProfitDailyKeys(sourceRows);
      const warnings: string[] = [];
      let dailyRefreshed = 0;

      for (const dailyKey of dailyKeys) {
        try {
          const dailyResult = await refreshProfitDailyRollup(supabase, dailyKey);
          if (dailyResult.refreshed) dailyRefreshed += 1;
        } catch (e: any) {
          warnings.push(`day ${dailyKey.day}: ${e?.message || String(e)}`);
        }
      }

      return json({
        ok: true,
        order_refreshed: orderResult.refreshed,
        rows_scanned: sourceRows.length,
        daily_refreshed: dailyRefreshed,
        warnings,
        rollup: orderResult.rollup,
      });
    } catch (e: any) {
      return json({
        ok: false,
        error: "profit_rebuild_order_failed",
        message: e?.message || String(e),
      }, 500);
    }
  }

  if (path === "/v1/profit/rebuild" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const supabase = getSupabase(env);
      const workspaceId = String(body.workspace_id || "default").trim() || "default";
      const from = parseDateFilter(body.from ? String(body.from) : null);
      const to = parseDateFilter(body.to ? String(body.to) : null);
      const connectorId = String(body.connector_id || "").trim();
      const orderId = String(body.order_id || "").trim();
      const orderKeys = new Map<string, ProfitOrderKey>();
      const dailyKeys = new Map<string, ProfitDailyKey>();
      const warnings: string[] = [];
      const pageSize = 1000;
      let scannedConversions = 0;

      for (let offset = 0; ; offset += pageSize) {
        let query = supabase
          .from("conversions")
          .select(PROFIT_CONVERSION_SELECT)
          .eq("workspace_id", workspaceId)
          .not("order_id", "is", null)
          .order("occurred_at", { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (from) query = query.gte("occurred_at", `${from}T00:00:00.000Z`);
        if (to) query = query.lt("occurred_at", nextDayStartIso(to));
        if (connectorId) query = query.eq("connector_id", connectorId);
        if (orderId) query = query.eq("order_id", orderId);

        const { data, error } = await query;
        if (error) throw new Error(`Profit rebuild conversion scan failed: ${error.message}`);

        const rows = (data || []) as ProfitConversionRow[];
        scannedConversions += rows.length;

        for (const row of rows) {
          const orderKey = profitOrderKeyFromConversion(row);
          if (orderKey) orderKeys.set(profitOrderKeyId(orderKey), orderKey);

          const dailyKey = profitDailyKeyFromConversion(row);
          if (dailyKey) dailyKeys.set(profitDailyKeyId(dailyKey), dailyKey);
        }

        if (!data || data.length < pageSize) break;
      }

      let ordersRefreshed = 0;
      let dailyRefreshed = 0;

      for (const key of orderKeys.values()) {
        try {
          const result = await refreshProfitOrderRollup(supabase, key);
          if (result.refreshed) ordersRefreshed += 1;
        } catch (e: any) {
          warnings.push(`order ${key.orderId}: ${e?.message || String(e)}`);
        }
      }

      for (const key of dailyKeys.values()) {
        try {
          const result = await refreshProfitDailyRollup(supabase, key);
          if (result.refreshed) dailyRefreshed += 1;
        } catch (e: any) {
          warnings.push(`day ${key.day}: ${e?.message || String(e)}`);
        }
      }

      return json({
        ok: true,
        scanned_conversions: scannedConversions,
        affected_orders: orderKeys.size,
        affected_days: dailyKeys.size,
        orders_refreshed: ordersRefreshed,
        daily_refreshed: dailyRefreshed,
        warnings,
      });
    } catch (e: any) {
      return json({
        ok: false,
        error: "profit_rebuild_failed",
        message: e?.message || String(e),
      }, 500);
    }
  }

  if (path.startsWith("/v1/profit/orders/") && req.method === "GET") {
    try {
      const orderId = decodeURIComponent(path.slice("/v1/profit/orders/".length)).trim();
      const workspaceId = String(url.searchParams.get("workspace_id") || "default").trim() || "default";
      const connectorId = String(url.searchParams.get("connector_id") || "").trim();
      const currency = String(url.searchParams.get("currency") || "").trim().toUpperCase();

      if (!orderId) {
        return json({ ok: false, error: "bad_request", message: "order_id is required" }, 400);
      }

      const supabase = getSupabase(env);
      let rollupQuery = supabase
        .from("profit_order_rollups")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("order_id", orderId)
        .order("updated_at", { ascending: false });

      let ledgerQuery = supabase
        .from("conversions")
        .select(PROFIT_CONVERSION_SELECT)
        .eq("workspace_id", workspaceId)
        .eq("order_id", orderId)
        .order("occurred_at", { ascending: true });

      if (connectorId) {
        rollupQuery = rollupQuery.eq("connector_id", connectorId);
        ledgerQuery = ledgerQuery.eq("connector_id", connectorId);
      }

      if (currency) {
        rollupQuery = rollupQuery.eq("currency", currency);
        ledgerQuery = ledgerQuery.eq("currency", currency);
      }

      const [{ data: rollups, error: rollupError }, { data: ledgerRows, error: ledgerError }] =
        await Promise.all([rollupQuery, ledgerQuery]);

      if (rollupError) throw new Error(rollupError.message);
      if (ledgerError) throw new Error(ledgerError.message);

      const rows = (ledgerRows || []) as ProfitConversionRow[];
      const breakdown = aggregateProfitConversions(rows);

      return json({
        ok: true,
        order_id: orderId,
        rollup: (rollups || [])[0] || null,
        rollups: rollups || [],
        category_breakdown: {
          gross_revenue: breakdown.gross_revenue,
          refunds: breakdown.refunds,
          chargebacks: breakdown.chargebacks,
          fees: breakdown.chargeback_fees + breakdown.processor_fees + breakdown.bank_fees,
          shipping: breakdown.shipping_cost,
          tax: breakdown.tax,
          cogs: breakdown.cogs,
          affiliate_payout: breakdown.affiliate_payout,
          ad_spend: breakdown.ad_spend,
          reversals: breakdown.reversals,
          adjustments: breakdown.adjustments,
          net_revenue: breakdown.net_revenue,
          total_costs: breakdown.total_costs,
          net_profit: breakdown.net_profit,
          profit_margin_pct: breakdown.profit_margin_pct,
        },
        ledger_rows: rows,
      });
    } catch (e: any) {
      return json({
        ok: false,
        error: "profit_order_read_failed",
        message: e?.message || String(e),
      }, 500);
    }
  }

  if (path === "/v1/profit/summary" && req.method === "GET") {
    try {
      const supabase = getSupabase(env);
      const rows = await selectProfitDailyRollups(supabase, {
        workspace_id: url.searchParams.get("workspace_id") || "default",
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
        connector_id: url.searchParams.get("connector_id"),
        platform: url.searchParams.get("platform"),
        event_source: url.searchParams.get("event_source"),
        currency: url.searchParams.get("currency"),
      });

      return json({
        ok: true,
        ...summarizeProfitRollups(rows),
      });
    } catch (e: any) {
      return json({
        ok: false,
        error: "profit_summary_failed",
        message: e?.message || String(e),
      }, 500);
    }
  }

  if (path === "/v1/kpis" && req.method === "GET") {
    try {
      const supabase = getSupabase(env);
      const currentRange = defaultDashboardDateRange(url);
      const previousRange = previousDateRange(currentRange.from, currentRange.to);
      const workspaceId = url.searchParams.get("workspace_id") || "default";

      const [currentRows, previousRows] = await Promise.all([
        selectProfitDailyRollups(supabase, {
          workspace_id: workspaceId,
          from: currentRange.from,
          to: currentRange.to,
          connector_id: url.searchParams.get("connector_id"),
          platform: url.searchParams.get("platform"),
          event_source: url.searchParams.get("event_source"),
          currency: url.searchParams.get("currency"),
        }),
        selectProfitDailyRollups(supabase, {
          workspace_id: workspaceId,
          from: previousRange.from,
          to: previousRange.to,
          connector_id: url.searchParams.get("connector_id"),
          platform: url.searchParams.get("platform"),
          event_source: url.searchParams.get("event_source"),
          currency: url.searchParams.get("currency"),
        }),
      ]);

      return json(kpiPayloadFromSummaries(
        summarizeProfitRollups(currentRows),
        summarizeProfitRollups(previousRows),
      ));
    } catch (e: any) {
      return json({
        gross_sales: 0,
        gross_sales_delta_pct: 0,
        net_profit: 0,
        net_margin: 0,
        refund_rate: 0,
        refund_rate_delta_pp: 0,
        chargebacks: 0,
        chargebacks_delta_pp: 0,
        ok: false,
        error: "kpis_failed",
        message: e?.message || String(e),
      }, 500);
    }
  }

  if (path === "/v1/revenue-spend" && req.method === "GET") {
    try {
      const supabase = getSupabase(env);
      const range = defaultDashboardDateRange(url);
      const rows = await selectProfitDailyRollups(supabase, {
        workspace_id: url.searchParams.get("workspace_id") || "default",
        from: range.from,
        to: range.to,
        connector_id: url.searchParams.get("connector_id"),
        platform: url.searchParams.get("platform"),
        event_source: url.searchParams.get("event_source"),
        currency: url.searchParams.get("currency"),
      });

      const byDay = new Map<string, any>();

      for (const row of rows) {
        const day = String(row.day || "").slice(0, 10);
        if (!day) continue;
        const existing = byDay.get(day) || { date: day, revenue: 0, spend: 0, net_profit: 0, refunds: 0, chargebacks: 0 };
        existing.revenue += Number(row.net_revenue || 0);
        existing.spend += Math.abs(Number(row.ad_spend || 0));
        existing.net_profit += Number(row.net_profit || 0);
        existing.refunds += Number(row.refunds || 0);
        existing.chargebacks += Number(row.chargebacks || 0);
        byDay.set(day, existing);
      }

      return json({
        ok: true,
        series: Array.from(byDay.values()).sort((a, b) => String(a.date).localeCompare(String(b.date))),
      });
    } catch (e: any) {
      return json({
        ok: false,
        error: "revenue_spend_failed",
        message: e?.message || String(e),
        series: [],
      }, 500);
    }
  }

  if (path.startsWith("/v1/postbacks/") && req.method === "POST") {
  const platform = path.split("/").pop() || "unknown";
  const payload = await readJsonBody(req);

  const ledgerType = detectLedgerType(payload);

  const amountCents = normalizeLedgerAmount(
    ledgerType,
    toCents(
      payload.amount ??
        payload.sale_amount ??
        payload.total ??
        payload.fee ??
        payload.chargeback_fee ??
        payload.refund_amount
    )
  );

  const ledgerRow = {
  workspace_id: payload.workspace_id || "default",
  ledger_type: ledgerType,

  event_source: normalizeEventSource(
    payload.event_source ||
      payload.source_system ||
      payload.platform ||
      platform
  ),

  ingestion_method: normalizeIngestionMethod(
    payload.ingestion_method || "webhook"
  ),

  connector_id: normalizeConnectorId(
    payload.connector_id ||
      payload.integration_instance_id ||
      payload.account_id ||
      payload.store_id ||
      payload.platform_store_id ||
      platform
  ),

    tkid: payload.tkid || null,
    email: payload.email || payload.customer_email || null,
    phone: payload.phone || null,
    order_id: payload.order_id || payload.orderNumber || payload.order_number || null,
    transaction_id: payload.transaction_id || payload.transactionId || null,
    parent_transaction_id:
      payload.parent_transaction_id || payload.parentTransactionId || null,
    amount: amountCents / 100,
    currency: payload.currency || "USD",
    platform,
    source_system: platform,
    network: payload.network || null,
    affiliate_id: payload.affiliate_id || payload.affid || null,
    campaign_id: payload.campaign_id || payload.oid || null,
    offer_id: payload.offer_id || payload.oid || null,
    status: payload.status || ledgerType,
    reason: payload.reason || null,
    raw: payload,
    meta: payload,
    occurred_at:
      payload.occurred_at || payload.created_at || new Date().toISOString(),
  };

  const supabase = getSupabase(env);

  const { data, error } = await supabase
    .from("conversions")
    .insert(ledgerRow)
    .select("*")
    .single();

  if (error) {
    return json(
      { ok: false, error: "ledger_insert_failed", message: error.message },
      500
    );
  }

  const rollup = await refreshProfitRollupsForInsertedRows(env, [(data || ledgerRow) as ProfitConversionRow]);
  if (rollup.warnings.length) console.warn("[profit] postback rollup refresh warnings", rollup.warnings);

  return json({ ok: true, ledger: data, rollup });
}

  if (path === "/v1/integrations/test-connect" && req.method === "POST") {
    return handleTestConnect(req, env);
  }

  if (path === "/v1/integrations/save-credentials" && req.method === "POST") {
    return handleSaveCredentials(req, env);
  }

  if (path === "/v1/integrations/paypal/status" && req.method === "GET") {
    const creds = await getLatestCredential(env, "paypal");

    if (!creds) {
      return json({
        ok: true,
        connected: false,
        platform: "paypal",
        baseUrl: null,
        username: null,
        environment: null,
        merchant_account_id: null,
        connector_id: null,
        capabilities: null,
        last_successful_sync_at: null,
        created_at: null,
        updated_at: null,
      });
    }

    const metadata = normalizePaypalCredentialMetadata((creds as any).metadata);
    const connectorId = metadata.connector_id || stablePaypalConnectorId({
      merchantAccountId: metadata.merchant_account_id,
      clientId: (creds as any).username,
    });

    return json({
      ok: true,
      connected: true,
      platform: "paypal",
      baseUrl: paypalBaseUrlForEnvironment(metadata.environment),
      username: maskPaypalClientId((creds as any).username),
      environment: metadata.environment,
      merchant_account_id: metadata.merchant_account_id ?? null,
      connector_id: connectorId,
      webhook_id: metadata.webhook_id ?? null,
      capabilities: metadata.capabilities ?? {
        transaction_reporting: false,
        disputes: false,
        fees: false,
        webhooks: false,
        warnings: ["Reconnect PayPal to refresh capability status."],
      },
      last_successful_sync_at: metadata.last_successful_sync_at ?? null,
      created_at: (creds as any).created_at ?? null,
      updated_at: (creds as any).updated_at ?? null,
    });
  }

  if (path === "/v1/integrations/paypal/settings" && req.method === "GET") {
    const supabase = getSupabase(env);

    await supabase.from("integrations_settings").upsert(
      {
        platform: "paypal",
        auto_import_enabled: false,
        auto_import_interval_minutes: 60,
        auto_import_lookback_hours: 30,
        updated_at: new Date().toISOString(),
      } as any,
      { onConflict: "platform" },
    );

    const { data, error } = await supabase.from("integrations_settings").select("*").eq("platform", "paypal").maybeSingle();
    if (error) throw new Error(error.message);

    return json({ ok: true, platform: "paypal", ...(data || {}) });
  }

  if (path === "/v1/integrations/paypal/settings" && req.method === "POST") {
    const body = await readJsonBody(req);
    const supabase = getSupabase(env);

    const patch = {
      platform: "paypal",
      auto_import_enabled: Boolean(body.auto_import_enabled),
      auto_import_interval_minutes: Math.max(15, Math.min(1440, Number(body.auto_import_interval_minutes ?? 60) || 60)),
      auto_import_lookback_hours: Math.max(1, Math.min(168, Number(body.auto_import_lookback_hours ?? 30) || 30)),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("integrations_settings").upsert(patch as any, { onConflict: "platform" });
    if (error) throw new Error(error.message);

    return json({ ok: true, message: "Settings saved." });
  }

  if (path === "/v1/integrations/paypal/reconcile-commerce-references" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const workspaceId = String(body.workspace_id || "default").trim() || "default";
      const limit = maintenanceLimit(body.limit);
      const cursor = maintenanceCursor(body.cursor);
      const dryRun = Boolean(body.dry_run);
      const supabase = getSupabase(env);

      let query = supabase
        .from("payment_transactions")
        .select("id,platform,transaction_id,commerce_reference,matched_platform_order_id,matched_order_id,match_status")
        .eq("platform", "paypal")
        .not("commerce_reference", "is", null)
        .neq("commerce_reference", "")
        .is("matched_platform_order_id", null)
        .is("matched_order_id", null)
        .order("id", { ascending: true })
        .limit(limit + 1);

      if (cursor) query = query.gt("id", cursor);

      const { data, error } = await query;
      if (error) throw new Error(`PayPal commerce-reference scan failed: ${error.message}`);

      const scannedRows = ((data || []) as any[]).slice(0, limit);
      const hasMore = (data || []).length > limit;
      const nextCursor = hasMore ? String(scannedRows.at(-1)?.id || "") || null : null;
      const references = Array.from(new Set(scannedRows.map((row) => String(row.commerce_reference || "").trim()).filter(Boolean)));

      let candidates: PaypalCommerceOrderCandidate[] = [];
      if (references.length) {
        const { data: candidateRows, error: candidateError } = await supabase.rpc(
          "lookup_wowboost_orders_by_commerce_references",
          { refs: references },
        );
        if (candidateError) throw new Error(`WowBoost commerce-reference lookup failed: ${candidateError.message}`);
        candidates = (candidateRows || []) as PaypalCommerceOrderCandidate[];
      }

      const candidatesByReference = groupCommerceCandidatesByReference(candidates);
      const patches: any[] = [];
      const sample: any[] = [];
      let missingReference = 0;
      let matched = 0;
      let unmatched = 0;
      let ambiguous = 0;

      for (const row of scannedRows) {
        const referenceKey = commerceReferenceKey(row.commerce_reference);
        if (!referenceKey) {
          missingReference += 1;
          unmatched += 1;
          continue;
        }

        const result = reconcilePaypalPaymentTransactionByCommerceReference({
          payment: row,
          candidates: candidatesByReference.get(referenceKey) || [],
        });

        if (result.matched) {
          matched += 1;
          const patch = {
            id: row.id,
            transaction_id: row.transaction_id,
            commerce_reference: row.commerce_reference,
            matched_platform_order_id: result.matched_platform_order_id,
            matched_order_id: result.matched_order_id,
            match_reason: result.match_reason,
          };
          patches.push(patch);
          if (sample.length < 10) sample.push(patch);
        } else if (result.ambiguous) {
          ambiguous += 1;
        } else {
          unmatched += 1;
        }
      }

      let updated = 0;
      if (!dryRun && patches.length) {
        const { data: updatedRows, error: updateError } = await supabase.rpc(
          "reconcile_paypal_commerce_reference_matches",
          { patches },
        );
        if (updateError) throw new Error(`PayPal commerce-reference reconciliation update failed: ${updateError.message}`);
        updated = (updatedRows || []).length;
      }

      return json({
        ok: true,
        workspace_id: workspaceId,
        scanned: scannedRows.length,
        eligible: scannedRows.length,
        matched,
        unmatched,
        ambiguous,
        updated,
        missing_reference: missingReference,
        has_more: hasMore,
        next_cursor: nextCursor,
        sample,
        dry_run: dryRun,
      });
    } catch (e: any) {
      return json({
        ok: false,
        error: "paypal_commerce_reference_reconciliation_failed",
        message: e?.message || String(e),
      }, 500);
    }
  }

  if ((path === "/v1/integrations/paypal/import-transactions" || path === "/v1/integrations/paypal/run-now") && req.method === "POST") {
    const body = await readJsonBody(req);
    const from = String(body.from ?? "").trim();
    const to = String(body.to ?? "").trim();
    const filter = String(body.filter ?? "all_financial_records").trim();
    const page = Math.max(1, Number(body.page ?? 1) || 1);
    const windowIndex = Math.max(0, Number(body.windowIndex ?? body.window_index ?? 0) || 0);
    const chunkSize = Math.max(10, Math.min(20, Number(body.chunkSize ?? body.chunk_size ?? body.pageSize ?? body.page_size ?? PAYPAL_IMPORT_CHUNK_SIZE) || PAYPAL_IMPORT_CHUNK_SIZE));

    if (!parseYmd(from) || !parseYmd(to)) {
      return json({ ok: false, error: "bad_request", message: "from/to must be YYYY-MM-DD" }, 400);
    }

    const supabase = getSupabase(env);

    if (path.endsWith("/run-now")) {
      await supabase
        .from("integrations_settings")
        .update({ last_run_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
        .eq("platform", "paypal");
    }

    const job = await createImportJob(env, {
      platform: "paypal",
      module: "paypal",
      from,
      to,
      filter,
    });

    await updateImportJob(env, job.id, {
      status: "running",
      started_at: new Date().toISOString(),
      pages: 0,
      fetched: 0,
      upserted: 0,
      error: null,
    });

    try {
      const res = await runPaypalImport(env, {
        from,
        to,
        filter,
        jobId: job.id,
        page,
        windowIndex,
        chunkSize,
      });

      await updateImportJob(env, job.id, {
        status: "completed",
        completed_at: new Date().toISOString(),
        fetched: res.records_processed,
        upserted: res.payment_transactions_upserted,
        pages: res.pages,
        error: null,
      });

      if (path.endsWith("/run-now")) {
        await supabase
          .from("integrations_settings")
          .update({ last_success_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
          .eq("platform", "paypal");
      }

      const updatedJob = await getImportJob(env, job.id);

      return json({
        ok: true,
        platform: "paypal",
        from,
        to,
        filter,
        job_id: job.id,
        job: updatedJob,
        ...res,
        message: res.has_more
          ? `Processed ${res.records_processed} PayPal financial records. More records are available at page ${res.next_page ?? 1}, window ${res.next_window_index ?? res.window_index}.`
          : `Imported ${res.payment_transactions_upserted} PayPal financial records (fetched ${res.fetched}).`,
      });
    } catch (e: any) {
      await updateImportJob(env, job.id, {
        status: "failed",
        completed_at: new Date().toISOString(),
        error: e?.message || String(e),
      }).catch(() => {});

      if (path.endsWith("/run-now")) {
        await supabase
          .from("integrations_settings")
          .update({ last_error: String(e?.message || e), updated_at: new Date().toISOString() })
          .eq("platform", "paypal");
      }

      return json(paypalErrorPayload(e), paypalErrorStatus(e));
    }
  }

  if (path === "/v1/integrations/shopify/status" && req.method === "GET") {
    const creds = await getLatestCredential(env, "shopify");

    if (!creds) {
      return json({
        ok: true,
        connected: false,
        platform: "shopify",
        baseUrl: null,
        apiVersion: null,
        username: null,
        created_at: null,
        updated_at: null,
      });
    }

    return json({
      ok: true,
      connected: true,
      platform: "shopify",
      baseUrl: normalizeShopifyShopDomain(creds.base_url) || creds.base_url || null,
      apiVersion: normalizeShopifyApiVersion(creds.username || DEFAULT_SHOPIFY_API_VERSION),
      username: null,
      created_at: creds.created_at ?? null,
      updated_at: creds.updated_at ?? null,
    });
  }

  if (path === "/v1/integrations/shopify/settings" && req.method === "GET") {
    const supabase = getSupabase(env);

    await supabase.from("integrations_settings").upsert(
      {
        platform: "shopify",
        auto_import_enabled: false,
        auto_import_interval_minutes: 60,
        auto_import_lookback_hours: 2,
        updated_at: new Date().toISOString(),
      } as any,
      { onConflict: "platform" },
    );

    const { data, error } = await supabase.from("integrations_settings").select("*").eq("platform", "shopify").maybeSingle();
    if (error) throw new Error(error.message);

    return json({ ok: true, platform: "shopify", ...(data || {}) });
  }

  if (path === "/v1/integrations/shopify/settings" && req.method === "POST") {
    const body = await readJsonBody(req);
    const supabase = getSupabase(env);

    const patch = {
      platform: "shopify",
      auto_import_enabled: Boolean(body.auto_import_enabled),
      auto_import_interval_minutes: Math.max(15, Math.min(1440, Number(body.auto_import_interval_minutes ?? 60) || 60)),
      auto_import_lookback_hours: Math.max(1, Math.min(168, Number(body.auto_import_lookback_hours ?? 2) || 2)),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("integrations_settings").upsert(patch as any, { onConflict: "platform" });
    if (error) throw new Error(error.message);

    return json({ ok: true, message: "Settings saved." });
  }

  if ((path === "/v1/integrations/shopify/import-orders" || path === "/v1/integrations/shopify/run-now") && req.method === "POST") {
    const body = await readJsonBody(req);
    const from = String(body.from ?? "").trim();
    const to = String(body.to ?? "").trim();
    const filter = String(body.filter ?? "all_sales").trim();

    if (!parseYmd(from) || !parseYmd(to)) {
      return json({ ok: false, error: "bad_request", message: "from/to must be YYYY-MM-DD" }, 400);
    }

    const supabase = getSupabase(env);

    if (path.endsWith("/run-now")) {
      await supabase
        .from("integrations_settings")
        .update({ last_run_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
        .eq("platform", "shopify");
    }

    try {
      const res = await runShopifyImport(env, { from, to, filter });

      if (path.endsWith("/run-now")) {
        await supabase
          .from("integrations_settings")
          .update({ last_success_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
          .eq("platform", "shopify");
      }

      return json({
        ok: true,
        platform: "shopify",
        from,
        to,
        filter,
        ...res,
        message: `Imported ${res.upserted} orders (fetched ${res.fetched}).`,
      });
    } catch (e: any) {
      if (path.endsWith("/run-now")) {
        await supabase
          .from("integrations_settings")
          .update({ last_error: String(e?.message || e), updated_at: new Date().toISOString() })
          .eq("platform", "shopify");
      }
      throw e;
    }
  }

  if (path === "/v1/integrations/checkoutchamp/status" && req.method === "GET") {
    const creds = await getLatestCredential(env, "checkoutchamp");

    if (!creds) {
      return json({
        ok: true,
        connected: false,
        platform: "checkoutchamp",
        baseUrl: null,
        username: null,
        created_at: null,
        updated_at: null,
      });
    }

    return json({
      ok: true,
      connected: true,
      platform: "checkoutchamp",
      baseUrl: creds.base_url ?? null,
      username: creds.username ?? null,
      created_at: creds.created_at ?? null,
      updated_at: creds.updated_at ?? null,
    });
  }
  
  if (path === "/v1/platform-orders/detail" && req.method === "GET") {
	  try {
	    const platformOrderId = String(
	      url.searchParams.get("platform_order_id") || ""
	    ).trim();
	
	    if (!platformOrderId) {
	      return json(
	        {
	          ok: false,
	          error: "bad_request",
	          message: "platform_order_id is required",
	        },
	        400
	      );
	    }
	
	    const supabase = getSupabase(env);
	
	    const { data, error } = await supabase
	      .from("platform_orders")
	      .select("*")
	      .eq("platform_order_id", platformOrderId)
	      .maybeSingle();
	
	    if (error) throw new Error(error.message);
	
	    return json({
	      ok: true,
	      order: data || null,
	    });
	  } catch (e: any) {
	    return json(
	      {
	        ok: false,
	        error: "platform_order_detail_failed",
	        message: e?.message || String(e),
	      },
	      500
	    );
	  }
	}
  
  if (path === "/v1/customers/detail" && req.method === "GET") {
	  const identityKey = url.searchParams.get("identity_key");
	
	  if (!identityKey) {
	    return json({ ok: false, message: "identity_key required" }, 400);
	  }
	
	  const supabase = getSupabase(env);
	
	  const { data: customer, error: customerError } = await supabase
	    .from("customer_profiles")
	    .select("*")
	    .eq("identity_key", identityKey)
	    .maybeSingle();
	
	  if (customerError) {
	    return json({ ok: false, message: customerError.message }, 500);
	  }
	
	  const { data: orders, error: ordersError } = await supabase
	    .from("platform_orders")
	    .select("*")
	    .eq("identity_key", identityKey)
	    .order("order_ts", { ascending: false })
	    .limit(100);
	
	  if (ordersError) {
	    return json({ ok: false, message: ordersError.message }, 500);
	  }
	
	  return json({
	    ok: true,
	    customer,
	    orders: orders || [],
	  });
	}
	
	if (path === "/v1/customers/search" && req.method === "GET") {
  try {
    const q = String(url.searchParams.get("q") || "").trim();

    if (!q) {
      return json({ ok: true, results: [] });
    }

    const supabase = getSupabase(env);
    const safeQ = q.replace(/[%_]/g, "");

    const { data: orders, error: orderError } = await supabase
      .from("platform_orders")
      .select(
        "identity_key, customer_email, email, phone, order_id, platform_order_id, transaction_id, everflow_transaction_id, tkid, tracking_number, gross_amount, order_ts, platform"
      )
      .or(
        [
          `customer_email.ilike.%${safeQ}%`,
          `email.ilike.%${safeQ}%`,
          `phone.ilike.%${safeQ}%`,
          `order_id.ilike.%${safeQ}%`,
          `platform_order_id.ilike.%${safeQ}%`,
          `transaction_id.ilike.%${safeQ}%`,
          `everflow_transaction_id.ilike.%${safeQ}%`,
          `tkid.ilike.%${safeQ}%`,
          `tracking_number.ilike.%${safeQ}%`,
        ].join(",")
      )
      .not("identity_key", "is", null)
      .order("order_ts", { ascending: false })
      .limit(50);

    if (orderError) throw new Error(orderError.message);

    const identityKeys = Array.from(
      new Set((orders || []).map((o: any) => o.identity_key).filter(Boolean))
    );

    if (!identityKeys.length) {
      return json({ ok: true, results: [] });
    }

    const { data: profiles, error: profileError } = await supabase
      .from("customer_profiles")
      .select("*")
      .in("identity_key", identityKeys);

    if (profileError) throw new Error(profileError.message);

    const profileByKey = new Map(
      (profiles || []).map((p: any) => [p.identity_key, p])
    );

    const results = identityKeys.map((identityKey) => {
      const profile = profileByKey.get(identityKey) || null;
      const matches = (orders || []).filter(
        (o: any) => o.identity_key === identityKey
      );

      return {
        identity_key: identityKey,
        customer: profile,
        matches,
        match_count: matches.length,
        latest_order_ts: matches[0]?.order_ts || profile?.last_order_ts || null,
        latest_order_id: matches[0]?.order_id || null,
        latest_platform: matches[0]?.platform || null,
      };
    });

    return json({
      ok: true,
      q,
      results,
    });
  } catch (e: any) {
    return json(
      {
        ok: false,
        error: "customer_search_failed",
        message: e?.message || String(e),
      },
      500
    );
  }
}
	
	if (path === "/v1/order-groups" && req.method === "GET") {
		  const supabase = getSupabase(env);
		  const identityKey = url.searchParams.get("identity_key");
		
		  let query = supabase
		    .from("order_groups")
		    .select("*")
		    .order("first_order_ts", { ascending: false });
		
		  if (identityKey) {
		    query = query.eq("identity_key", identityKey);
		  }
		
		  const { data, error } = await query;
		
		  if (error) {
		    return json(
		      {
		        ok: false,
		        message: error.message,
		      },
		      500
		    );
		  }
		
		  return json({
		    ok: true,
		    groups: data || [],
		  });
		}
		
		  if (path === "/v1/customers/rebuild" && req.method === "POST") {
		    try {
		      const result = await rebuildCustomerProfiles(env);
		
		      return json({
		        ok: true,
		        ...result,
		        message: `Rebuilt ${result.rebuilt_profiles} customer profiles.`,
		      });
		    } catch (e: any) {
		      return json(
		        {
		          ok: false,
		          error: "customers_rebuild_failed",
		          message: e?.message || String(e),
		        },
		        500
		      );
		    }
		  }
  
  

  if (path === "/v1/customers/by-identity" && req.method === "GET") {
    try {
      const identityKey = String(url.searchParams.get("identity_key") ?? "").trim();

      if (!identityKey) {
        return json(
          {
            ok: false,
            error: "bad_request",
            message: "identity_key is required",
          },
          400
        );
      }

      const supabase = getSupabase(env);

      const { data, error } = await supabase
        .from("customer_profiles")
        .select("*")
        .eq("identity_key", identityKey)
        .maybeSingle();

      if (error) throw new Error(error.message);

      return json({
        ok: true,
        customer: data ?? null,
      });
    } catch (e: any) {
      return json(
        {
          ok: false,
          error: "customer_lookup_failed",
          message: e?.message || String(e),
        },
        500
      );
    }
  }

if (path === "/v1/platforms" && req.method === "GET") {
  return json({
    ok: true,
    platforms: [
      { value: "checkoutchamp", label: "CheckoutChamp" },
      { value: "wowsuite", label: "WowSuite" },
      { value: "wowboost", label: "WowBoost" },
      { value: "wowpay", label: "WowPay" },
      { value: "nmi:lifeheater14090", label: "NMI • lifeheater14090" },
      { value: "nmi:tpaul9204", label: "NMI • tpaul9204" },
      { value: "paydiverse", label: "PayDiverse" },
    ],
  });
}

if (path === "/v1/product-costs/detected" && req.method === "GET") {
  try {
    const supabase = getSupabase(env);

    const { data, error } = await supabase
      .from("detected_products")
      .select("*")
      .order("revenue", { ascending: false })
      .limit(500);

    if (error) throw new Error(error.message);

    return json({
      ok: true,
      products: data || [],
    });
  } catch (e: any) {
    return json(
      {
        ok: false,
        error: "product_costs_detected_failed",
        message: e?.message || String(e),
      },
      500,
    );
  }
}

if (path === "/v1/product-catalog/rebuild" && req.method === "POST") {
  try {
    const supabase = getSupabase(env);

    const { data: orders, error } = await supabase
      .from("platform_orders")
      .select("platform, gross_amount, order_ts, raw_json")
      .not("raw_json", "is", null)
      .order("order_ts", { ascending: false, nullsFirst: false })
      .range(0, 49999)

    if (error) throw new Error(error.message);

    const usableOrders = (orders || []).filter((order: any) => {
      const raw =
		  typeof order.raw_json === "string"
		    ? JSON.parse(order.raw_json || "{}")
		    : order.raw_json || {};
      return raw && typeof raw === "object" && Object.keys(raw).length > 0;
    });

    const products = new Map<string, any>();
    const now = new Date().toISOString();

    for (const order of usableOrders) {
      const raw = order.raw_json || {};
      const statusText = String(
		  raw["Order Status Name"] ||
		    raw["Receipt Status Name"] ||
		    raw.status ||
		    raw.orderStatus ||
		    order.status ||
		    "",
		).toLowerCase();
		
		const isNonSale =
		  statusText.includes("abandon") ||
		  statusText.includes("aborted") ||
		  statusText.includes("declin") ||
		  statusText.includes("cancel") ||
		  statusText.includes("void") ||
		  statusText.includes("failed");
		
		if (isNonSale || Number(order.gross_amount || 0) < 0) {
		  continue;
		}
      const ts = order.order_ts ? new Date(order.order_ts).toISOString() : null;

      let items: any[] = [];

      if (raw.items && typeof raw.items === "object" && !Array.isArray(raw.items)) {
        items = Object.values(raw.items);
      } else if (Array.isArray(raw.items)) {
        items = raw.items;
      } else if (Array.isArray(raw.line_items)) {
        items = raw.line_items;
      } else if (Array.isArray(raw.lineItems)) {
        items = raw.lineItems;
      } else if (Array.isArray(raw.products)) {
        items = raw.products;
      } else if (Array.isArray(raw.orderItems)) {
        items = raw.orderItems;
      } else if (
		  raw["Product Name"] ||
		  raw.productName ||
		  raw.product_name ||
		  raw.name ||
		  raw.SKUId ||
		  raw.sku ||
		  raw.productSku ||
		  raw.productId ||
		  raw.product_id
		) {
		  items = [raw];
	  }
	  
	  const isWowBoost =
		  order.platform === "wowboost" ||
		  order.platform === "wowsuite:wowboost";

      for (const item of items) {
        const sku =
		  item.SKUId ||
		  item.skuId ||
		  item.productSku ||
		  item.product_sku ||
		  item.sku ||
		  item.SKU ||
		  null;

        const productId =
		  isWowBoost
		    ? item.SKUId ||
		      item.skuId ||
		      item.sku ||
		      item.SKU ||
		      null
		    : item.productId ||
		      item.product_id ||
		      item.actualProductId ||
		      item.currentProductId ||
		      item.externalProductId ||
		      item.id ||
		      null;

        const name =
		  item["Product Name"] ||
		  item.name ||
		  item.productName ||
		  item.product_name ||
		  item.title ||
		  item.productDescription ||
		  null;

        if (!productId && !sku && !name) continue;

        const key = [
          order.platform || "",
          productId || "",
          sku || "",
          name || "",
        ].join("|");

        if (!products.has(key)) {
          products.set(key, {
            platform: order.platform,
            external_product_id: productId ? String(productId) : null,
            sku: sku ? String(sku) : null,
            name: name ? String(name) : null,
            campaign_id:
              raw.campaignId ||
              raw.campaign_id ||
              item.campaignId ||
              item.campaign_id ||
              null,
            campaign_name:
              raw.campaignName ||
              raw.campaign_name ||
              item.campaignName ||
              item.campaign_name ||
              null,
            first_seen: ts,
            last_seen: ts,
            order_count: 0,
            revenue: 0,
            updated_at: now,
          });
        }

        const existing = products.get(key);

        const qty = Math.max(
          1,
          Number(item.qty || item.quantity || item.currentQty || 1) || 1,
        );
        // Skip abandoned/refunded WowBoost records
		if (
		  isWowBoost &&
		  Number(raw["Order Quantity (Units Sold)"] || 1) <= 0
		) {
		  continue;
		}
        let itemRevenue =
		  parseMoneyMaybe(
		    item.price ??
		      item.amount ??
		      item.total ??
		      item.productPrice ??
		      item.product_price ??
		      item.currentPrice ??
		      item.current_price ??
		      item.linePrice ??
		      item.line_price ??
		      item.finalLinePrice ??
		      item.final_line_price ??
		      item.discountedPrice ??
		      item.discounted_price ??
		      item.productSubtotal ??
		      item.product_subtotal ??
		      raw.productPrice ??
		      raw.product_price,
		  ) ?? 0;
		
		if (isWowBoost) {
		  itemRevenue =
		    parseMoneyMaybe(
		      item["Order Price USD"] ??
		      item["Order Price"] ??
		      raw["Order Price USD"] ??
		      raw["Order Price"]
		    ) ?? Number(order.gross_amount || 0);
		} else if (itemRevenue === 0) {
		  itemRevenue = Number(order.gross_amount || 0);
		}

        existing.order_count += 1;
        existing.revenue += itemRevenue;

        if (ts) {
          if (!existing.first_seen || ts < existing.first_seen) {
            existing.first_seen = ts;
          }

          if (!existing.last_seen || ts > existing.last_seen) {
            existing.last_seen = ts;
          }
        }
      }
    }

    const rows = Array.from(products.values());

    const { error: deleteError } = await supabase
      .from("product_catalog")
      .delete()
      .neq("id", 0);

    if (deleteError) throw new Error(deleteError.message);

    if (rows.length) {
      const { error: upsertError } = await supabase
        .from("product_catalog")
        .upsert(rows, {
          onConflict: "platform,external_product_id,sku,name,campaign_id",
        });

      if (upsertError) throw new Error(upsertError.message);
    }

    return json({
      ok: true,
      products_found: rows.length,
      orders_scanned: usableOrders.length,
      total_orders_checked: orders?.length || 0,
      skipped_empty_raw_json: (orders?.length || 0) - usableOrders.length,
    });
  } catch (e: any) {
    return json(
      {
        ok: false,
        error: "product_catalog_rebuild_failed",
        message: e?.message || String(e),
      },
      500,
    );
  }
}

if (path === "/v1/product-catalog" && req.method === "GET") {
  try {
    const supabase = getSupabase(env);

    const { data, error } = await supabase
      .from("product_catalog")
      .select("*")
      .order("revenue", { ascending: false, nullsFirst: false })
      .limit(50000);

    if (error) throw new Error(error.message);

    return json({
      ok: true,
      products: data || [],
    });
  } catch (e: any) {
    return json({
      ok: false,
      error: "product_catalog_failed",
      message: e?.message || String(e),
    }, 500);
  }
}

if (path === "/v1/product-costs/rules" && req.method === "GET") {
  try {
    const supabase = getSupabase(env);

    const { data, error } = await supabase
      .from("product_cost_rules")
      .select("*")
      .order("platform", { ascending: true })
      .order("product_name", { ascending: true })
      .order("package_quantity", { ascending: true });

    if (error) throw new Error(error.message);

    return json({
      ok: true,
      rules: data || [],
    });
  } catch (e: any) {
    return json(
      {
        ok: false,
        error: "product_costs_rules_failed",
        message: e?.message || String(e),
      },
      500,
    );
  }
}

if (path === "/v1/product-costs/apply" && req.method === "POST") {
  try {
    const supabase = getSupabase(env);

    const { data: orders, error: ordersError } = await supabase
      .from("platform_orders")
      .select("id, platform, gross_amount, raw_json")
      .not("raw_json", "is", null)
      .limit(50000);

    if (ordersError) throw new Error(ordersError.message);

    const { data: rules, error: rulesError } = await supabase
      .from("product_cost_rules")
      .select("*")
      .eq("is_active", true);

    if (rulesError) throw new Error(rulesError.message);

    let updated = 0;
    let unmatched = 0;

    for (const order of orders || []) {
      const raw = order.raw_json || {};
      const items =
        raw.items && typeof raw.items === "object"
          ? Object.values(raw.items)
          : Array.isArray(raw.items)
            ? raw.items
            : Array.isArray(raw.line_items)
              ? raw.line_items
              : [];

      let productCost = 0;
      let shippingCost = 0;
      let matchedRuleId: number | null = null;

      for (const item of items as any[]) {
        const sku =
          item.productSku ||
          item.product_sku ||
          item.sku ||
          null;

        const name =
          item.name ||
          item.productName ||
          item.product_name ||
          item.title ||
          null;

        const qty = Number(item.qty || item.quantity || 1);

        const rule = (rules || []).find((r: any) => {
          return (
            r.platform === order.platform &&
            (
              (r.sku && sku && r.sku === sku) ||
              (r.product_name && name && r.product_name === name)
            )
          );
        });

        if (rule) {
          matchedRuleId = rule.id;
          productCost += Number(rule.package_cost || 0);
          shippingCost += Number(rule.shipping_cost || 0);
        }
      }

      if (!matchedRuleId) {
        unmatched++;
        continue;
      }

      const totalCost = productCost + shippingCost;
      const grossProfit = gross - totalCost;
      const marginPct = gross > 0 ? (grossProfit / gross) * 100 : 0;

      const { error: updateError } = await supabase
        .from("platform_orders")
        .update({
          applied_product_cost: productCost,
          applied_shipping_cost: shippingCost,
          applied_total_cost: totalCost,
          gross_profit: grossProfit,
          gross_margin_pct: marginPct,
          cost_rule_id: matchedRuleId,
          cost_applied_at: new Date().toISOString(),
        })
        .eq("id", order.id);

      if (updateError) throw new Error(updateError.message);

      updated++;
    }

    return json({
      ok: true,
      orders_scanned: orders?.length || 0,
      updated,
      unmatched,
    });
  } catch (e: any) {
    return json(
      {
        ok: false,
        error: "cost_apply_failed",
        message: e?.message || String(e),
      },
      500,
    );
  }
}

if (path === "/v1/product-costs/rules" && req.method === "POST") {
  try {
    const body = await readJsonBody(req);
    const supabase = getSupabase(env);

    const payload = {
      id: body.id || undefined,
      platform: String(body.platform || "").trim() || null,
      product_name: String(body.product_name || "").trim() || null,
      sku: String(body.sku || "").trim() || null,
      product_type: String(body.product_type || "physical").trim(),
      package_quantity: Math.max(1, Number(body.package_quantity || 1)),
      package_cost: Math.max(0, Number(body.package_cost || 0)),
      shipping_cost: Math.max(0, Number(body.shipping_cost || 0)),
      allow_unit_fallback: Boolean(body.allow_unit_fallback),
      currency: String(body.currency || "USD").trim() || "USD",
      effective_from: body.effective_from || new Date().toISOString(),
      effective_to: body.effective_to || null,
      is_active: body.is_active !== false,
      notes: body.notes ? String(body.notes) : null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("product_cost_rules")
      .upsert(payload as any)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    return json({
      ok: true,
      rule: data,
      message: "Product cost rule saved.",
    });
  } catch (e: any) {
    return json(
      {
        ok: false,
        error: "product_costs_rule_save_failed",
        message: e?.message || String(e),
      },
      500,
    );
  }
}

if (
  path === "/v1/product-costs/import/preview" &&
  req.method === "POST"
) {
  try {
    const body = await readJsonBody(req);

    const parsed = parseCsv(body.csv || "");
    const rows = parsed.rows;

    let newRules = 0;
    let updates = 0;

    const supabase = getSupabase(env);

    for (const row of rows) {
      const { data } = await supabase
        .from("product_cost_rules")
        .select("id")
        .eq("platform", row.platform || "")
        .eq("product_name", row.product_name || "")
        .eq("sku", row.sku || "")
        .limit(1);

      if (data?.length) {
        updates++;
      } else {
        newRules++;
      }
    }

    return json({
      ok: true,
      total_rows: rows.length,
      new_rules: newRules,
      updates,
    });
  } catch (e: any) {
    return json(
      {
        ok: false,
        message: e?.message || String(e),
      },
      500,
    );
  }
}



if (
  path === "/v1/product-costs/import" &&
  req.method === "POST"
) {
  try {
    const body = await readJsonBody(req);

    const parsed = parseCsv(body.csv || "");
    const rows = parsed.rows;

    const supabase = getSupabase(env);

    let inserted = 0;
    let updated = 0;

    for (const row of rows) {
      const payload = {
        platform: row.platform || null,
        product_name: row.product_name || null,
        sku: row.sku || null,
        product_type: row.product_type || "physical",
        package_quantity: Number(row.package_quantity || 1),
        package_cost: Number(row.package_cost || 0),
        shipping_cost: Number(row.shipping_cost || 0),
        allow_unit_fallback: false,
        currency: "USD",
        is_active: true,
      };

      const { data: existing } = await supabase
        .from("product_cost_rules")
        .select("id")
        .eq("platform", payload.platform)
        .eq("product_name", payload.product_name)
        .eq("sku", payload.sku)
        .limit(1);

      if (existing?.length) {
        await supabase
          .from("product_cost_rules")
          .update(payload)
          .eq("id", existing[0].id);

        updated++;
      } else {
        await supabase
          .from("product_cost_rules")
          .insert(payload);

        inserted++;
      }
    }

    return json({
      ok: true,
      inserted,
      updated,
      total_rows: rows.length,
    });
  } catch (e: any) {
    return json(
      {
        ok: false,
        message: e?.message || String(e),
      },
      500,
    );
  }
}



if (path === "/v1/product-costs/import-csv" && req.method === "POST") {
  try {
    const body = await readJsonBody(req);
    const preview = Boolean(body.preview);
    const csvText = String(body.csv_text || "").trim();

    if (!csvText) {
      return json({ ok: false, message: "csv_text is required" }, 400);
    }

    const parsed = parseCsv(csvText);
    const errors: any[] = [];
    const rows: any[] = [];

    for (let i = 0; i < parsed.rows.length; i++) {
      const r = parsed.rows[i];
      const rowNum = i + 2;

      const platform = pickField(r, ["platform"]);
      const productName = pickField(r, ["product_name", "product", "name"]);
      const sku = pickField(r, ["sku"]);
      const productType = pickField(r, ["product_type", "type"]) || "physical";
      const packageQuantity = Number(pickField(r, ["package_quantity", "qty", "quantity"]) || 1);
      const packageCost = Number(pickField(r, ["package_cost", "cost", "product_cost"]) || 0);
      const shippingCost = Number(pickField(r, ["shipping_cost", "shipping"]) || 0);
      const currency = pickField(r, ["currency"]) || "USD";

      if (!platform) errors.push({ row: rowNum, message: "Missing platform" });
      if (!productName && !sku) errors.push({ row: rowNum, message: "Missing product_name or sku" });
      if (!Number.isFinite(packageQuantity) || packageQuantity < 1) errors.push({ row: rowNum, message: "Invalid package_quantity" });
      if (!Number.isFinite(packageCost) || packageCost < 0) errors.push({ row: rowNum, message: "Invalid package_cost" });

      rows.push({
        platform,
        product_name: productName || null,
        sku: sku || null,
        product_type: productType,
        package_quantity: Math.max(1, packageQuantity || 1),
        package_cost: Math.max(0, packageCost || 0),
        shipping_cost: Math.max(0, shippingCost || 0),
        allow_unit_fallback: false,
        currency,
        is_active: true,
        updated_at: new Date().toISOString(),
      });
    }

    if (errors.length) {
      return json({
        ok: false,
        preview,
        rows_found: parsed.rows.length,
        valid_rows: rows.length - errors.length,
        errors,
      }, 400);
    }

    if (preview) {
      return json({
        ok: true,
        preview: true,
        rows_found: parsed.rows.length,
        valid_rows: rows.length,
        sample: rows.slice(0, 10),
      });
    }

    const supabase = getSupabase(env);

    const { error } = await supabase
      .from("product_cost_rules")
      .upsert(rows as any[]);

    if (error) throw new Error(error.message);

    return json({
      ok: true,
      imported: rows.length,
      message: `Imported ${rows.length} cost rules.`,
    });
  } catch (e: any) {
    return json({
      ok: false,
      error: "product_cost_csv_import_failed",
      message: e?.message || String(e),
    }, 500);
  }
}

if (path === "/v1/product-costs/rules/update" && req.method === "POST") {
  try {
    const body = await readJsonBody(req);
    const id = Number(body.id || 0);

    if (!id) {
      return json({ ok: false, message: "id is required" }, 400);
    }

    const supabase = getSupabase(env);

    const payload = {
      product_type: body.product_type || "physical",
      package_quantity: Math.max(1, Number(body.package_quantity || 1)),
      package_cost: Math.max(0, Number(body.package_cost || 0)),
      shipping_cost: Math.max(0, Number(body.shipping_cost || 0)),
      allow_unit_fallback: Boolean(body.allow_unit_fallback),
      currency: body.currency || "USD",
      is_active: body.is_active !== false,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("product_cost_rules")
      .update(payload)
      .eq("id", id);

    if (error) throw new Error(error.message);

    return json({
      ok: true,
      updated_id: id,
    });
  } catch (e: any) {
    return json(
      {
        ok: false,
        error: "product_cost_rule_update_failed",
        message: e?.message || String(e),
      },
      500,
    );
  }
}

if (path === "/v1/merchant-accounts/rebuild" && req.method === "POST") {
  try {
    const supabase = getSupabase(env);

    const { data, error } = await supabase.rpc("rebuild_merchant_accounts");

    if (error) throw new Error(error.message);

    return json(data || { ok: true });
  } catch (e: any) {
    return json(
      {
        ok: false,
        error: "merchant_accounts_rebuild_failed",
        message: e?.message || String(e),
      },
      500,
    );
  }
}

if (path === "/v1/product-costs/rules/delete" && req.method === "POST") {
  try {
    const body = await readJsonBody(req);
    const id = Number(body.id || 0);

    if (!id) {
      return json({ ok: false, message: "id is required" }, 400);
    }

    const supabase = getSupabase(env);

    const { error } = await supabase
      .from("product_cost_rules")
      .delete()
      .eq("id", id);

    if (error) throw new Error(error.message);

    return json({
      ok: true,
      deleted_id: id,
    });
  } catch (e: any) {
    return json(
      {
        ok: false,
        error: "product_cost_rule_delete_failed",
        message: e?.message || String(e),
      },
      500,
    );
  }
}
  


  if (path === "/v1/integrations/checkoutchamp/settings" && req.method === "GET") {
    const supabase = getSupabase(env);

    await supabase.from("integrations_settings").upsert(
      {
        platform: "checkoutchamp",
        auto_import_enabled: false,
        auto_import_interval_minutes: 60,
        auto_import_lookback_hours: 2,
        updated_at: new Date().toISOString(),
      } as any,
      { onConflict: "platform" }
    );

    const { data, error } = await supabase.from("integrations_settings").select("*").eq("platform", "checkoutchamp").maybeSingle();
    if (error) throw new Error(error.message);

    return json({ ok: true, platform: "checkoutchamp", ...(data || {}) });
  }

  if (path === "/v1/integrations/checkoutchamp/settings" && req.method === "POST") {
    const body = await readJsonBody(req);
    const supabase = getSupabase(env);

    const patch = {
      platform: "checkoutchamp",
      auto_import_enabled: Boolean(body.auto_import_enabled),
      auto_import_interval_minutes: Math.max(15, Math.min(1440, Number(body.auto_import_interval_minutes ?? 60) || 60)),
      auto_import_lookback_hours: Math.max(1, Math.min(168, Number(body.auto_import_lookback_hours ?? 2) || 2)),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("integrations_settings").upsert(patch as any, { onConflict: "platform" });
    if (error) throw new Error(error.message);

    return json({ ok: true, message: "Settings saved." });
  }

  if ((path === "/v1/integrations/checkoutchamp/import-orders" || path === "/v1/integrations/checkoutchamp/run-now") && req.method === "POST") {
    const body = await readJsonBody(req);
    const from = String(body.from ?? "").trim();
    const to = String(body.to ?? "").trim();
    const filter = String(body.filter ?? "all_sales").trim();

    if (!parseYmd(from) || !parseYmd(to)) {
      return json({ ok: false, error: "bad_request", message: "from/to must be YYYY-MM-DD" }, 400);
    }

    const supabase = getSupabase(env);

    if (path.endsWith("/run-now")) {
      await supabase
        .from("integrations_settings")
        .update({ last_run_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
        .eq("platform", "checkoutchamp");
    }

    try {
      const res = await runCheckoutChampImport(env, { from, to, filter });

      if (path.endsWith("/run-now")) {
        await supabase
          .from("integrations_settings")
          .update({ last_success_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
          .eq("platform", "checkoutchamp");
      }

      return json({
        ok: true,
        platform: "checkoutchamp",
        from,
        to,
        filter,
        ...res,
        message: `Imported ${res.upserted} orders (fetched ${res.fetched}).`,
      });
    } catch (e: any) {
      if (path.endsWith("/run-now")) {
        await supabase
          .from("integrations_settings")
          .update({ last_error: String(e?.message || e), updated_at: new Date().toISOString() })
          .eq("platform", "checkoutchamp");
      }
      throw e;
    }
  }

  if (path === "/v1/integrations/wowboost/import-status" && req.method === "GET") {
    const jobId = String(url.searchParams.get("job_id") ?? "").trim();

    if (!jobId) return json({ ok: false, error: "bad_request", message: "job_id is required" }, 400);

    const job = await getImportJob(env, jobId);
    if (!job) return json({ ok: false, error: "not_found", message: "Import job not found" }, 404);

    return json({
      ok: true,
      job: buildPublicImportJobPayload(job, progressFromJob(job), {
        full_progress: requestFullProgress(url.searchParams.get("full_progress") ?? url.searchParams.get("fullProgress")),
      }),
    });
  }

  if (path === "/v1/integrations/wowboost/status" && req.method === "GET") {
    const creds = await getLatestCredential(env, "wowboost");

    if (!creds) {
      return json({
        ok: true,
        connected: false,
        platform: "wowboost",
        baseUrl: null,
        username: null,
        created_at: null,
        updated_at: null,
      });
    }

    return json({
      ok: true,
      connected: true,
      platform: "wowboost",
      baseUrl: creds.base_url ?? null,
      username: creds.username ?? null,
      created_at: creds.created_at ?? null,
      updated_at: creds.updated_at ?? null,
    });
  }

  // Temporary validation endpoint. Remove after WowBoost referenceId field validation is no longer needed.
  if (path === "/v1/integrations/wowboost/debug-order-reference" && req.method === "GET") {
    try {
      const orderId = String(url.searchParams.get("order_id") || "").trim();
      const expectedReference = String(
        url.searchParams.get("expected_reference") || WOWBOOST_ORDER_REFERENCE_DEBUG_EXPECTED,
      ).trim();

      if (!orderId) {
        return json({ ok: false, error: "bad_request", message: "order_id is required" }, 400);
      }

      const supabase = getSupabase(env);
      const { data: creds, error } = await supabase
        .from("integrations_credentials")
        .select("*")
        .in("platform", [wowSuiteKey("wowboost"), "wowboost", "wowsuite"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw new Error(`WOWSuite(wowboost) creds read failed: ${error.message}`);
      if (!creds) throw new Error("WowBoost not connected. Save credentials first.");

      const authBase = String((creds as any).base_url || env.DEFAULT_WOWSUITE_AUTH_BASE || DEFAULT_WOWSUITE_AUTH_BASE).replace(/\/+$/, "");
      const username = String((creds as any).username ?? "").trim();
      const password = await decryptSecretFromCredRow(env, creds as any);
      const bearer = await wowSuiteGetBearerToken({ authBase, username, password });

      const detailsRes = await fetchWithTimeout(`${authBase}/order/${encodeURIComponent(orderId)}`, {
        method: "GET",
        headers: {
          Authorization: `bearer ${bearer}`,
          Accept: "application/json, text/plain, */*",
        },
      }, 30000);
      const detailsText = await readTextSafe(detailsRes);
      const detailsJson = safeJsonParse(detailsText);

      if (!detailsRes.ok) {
        return json({
          ok: false,
          error: "wowboost_order_reference_debug_failed",
          message: `WowBoost order details failed (${detailsRes.status})`,
          platform: "wowsuite:wowboost",
          order_id: orderId,
          details_status: detailsRes.status,
          top_level_response_keys: detailsJson ? Object.keys(detailsJson) : [],
        }, 502);
      }

      if (!detailsJson) {
        return json({
          ok: false,
          error: "wowboost_order_reference_debug_invalid_json",
          message: `WowBoost order details returned non-JSON response (${detailsRes.status})`,
          platform: "wowsuite:wowboost",
          order_id: orderId,
          details_status: detailsRes.status,
        }, 502);
      }

      return json({
        ok: true,
        temporary: true,
        remove_after_validation: true,
        platform: "wowsuite:wowboost",
        order_id: orderId,
        details_status: detailsRes.status,
        ...wowBoostOrderReferenceDiagnostics(detailsJson, expectedReference),
      });
    } catch (e: any) {
      return json({
        ok: false,
        error: "wowboost_order_reference_debug_failed",
        message: e?.message || String(e),
      }, 500);
    }
  }

  if (path === "/v1/integrations/wowboost/backfill-commerce-references" && req.method === "POST") {
    try {
      const requestStartedAtMs = Date.now();
      const body = await readJsonBody(req);
      const workspaceId = String(body.workspace_id || "default").trim() || "default";
      const limit = normalizeWowBoostOrderDetailsBackfillLimit(body.limit ?? body.page_size ?? body.pageSize);
      const pacingMs = normalizeWowBoostOrderDetailsPacingMs(body.pacing_ms ?? body.pacingMs);
      const dryRun = Boolean(body.dry_run);
      const supabase = getSupabase(env);
      const requestedJobId = String(body.job_id || body.jobId || "").trim();
      const fullProgress = requestFullProgress(body.full_progress ?? body.fullProgress);
      const compactOnly =
        requestFullProgress(body.compact_progress_only ?? body.compactProgressOnly) ||
        String(body.action || "").trim() === "compact_progress";
      let exportPageInput = wowBoostLegacyExportPageForRequest({ body });
      const exportPageSize = Math.max(1, Math.min(1000, Number(body.export_page_size ?? body.exportPageSize ?? 500) || 500));
      const maxExportPagesPerInvocation = normalizeWowBoostLegacyMaxExportPagesPerInvocation(
        body.max_export_pages_per_invocation ?? body.maxExportPagesPerInvocation,
      );
      const maxExportElapsedMs = normalizeWowBoostLegacyExportMaxElapsedMs(
        body.max_export_elapsed_ms ?? body.maxExportElapsedMs,
      );
      const requestedExportContinuationToken = body.export_continuation_token ?? body.exportContinuationToken ?? body.export_cursor ?? body.exportCursor ?? null;
      let exportContinuationTokenInput = String(requestedExportContinuationToken ?? "").trim() || null;
      const restartFrom = body.restart_from ?? body.restartFrom ?? null;
      const repairMode = Boolean(restartFrom);
      let from = String(body.from ?? "").trim();
      let to = String(body.to ?? "").trim();
      let job: ImportJobRow | null = null;
      let cursorInput: unknown = repairMode ? restartFrom : body.cursor ?? null;

      if (requestedJobId) {
        job = await getImportJob(env, requestedJobId);
        if (!job) return json({ ok: false, error: "not_found", message: "Backfill job not found" }, 404);
        const compactedJob = await compactWowBoostBackfillJobProgress(env, job);
        job = compactedJob.job;
        const progress = compactedJob.progress;
        from = String(progress.requested_from || job.from_date || "").trim();
        to = String(progress.requested_to || job.to_date || "").trim();
        if (compactOnly) {
          return json({
            ok: true,
            strategy: "wowboost_order_details",
            workspace_id: workspaceId,
            job_id: job.id,
            compacted: compactedJob.compacted,
            job: buildPublicImportJobPayload(job, progress, { full_progress: fullProgress }),
            message: compactedJob.compacted
              ? "Backfill job progress compacted."
              : "Backfill job progress was already compact.",
          });
        }
        if (
          (progress.status === "completed" || progress.status === "cancelled") &&
          !body.restart &&
          !body.cursor &&
          !restartFrom
        ) {
          return json({
            ok: true,
            strategy: "wowboost_order_details",
            workspace_id: workspaceId,
            job_id: job.id,
            cursor: progress.current_cursor,
            cursor_state: parseWowBoostOrderDetailsBackfillCursor(progress.current_cursor),
            from,
            to,
            limit,
            pacing_ms: pacingMs,
            scanned: 0,
            scanned_in_range: 0,
            processed: 0,
            eligible: 0,
            updated: 0,
            remaining_in_range: null,
            already_populated: 0,
            missing_reference: 0,
            failed_order_lookups: 0,
            failed_order_ids: (progress as any).failed_order_ids || [],
            permanently_missing_orders: Number((progress as any).permanently_missing_orders || 0),
            permanently_missing_order_ids: (progress as any).permanently_missing_order_ids || [],
            unresolved_transient_order_ids: (progress as any).unresolved_transient_order_ids || [],
            last_successful_cursor: (progress as any).last_successful_cursor || progress.current_cursor || null,
            rate_limit_retries: (progress as any).rate_limit_retries || 0,
            retry_after_seconds: (progress as any).retry_after_seconds || 0,
            rate_limit_warnings: (progress as any).rate_limit_warnings || [],
            mapped_order_numbers: Number((progress as any).mapped_order_numbers || 0),
            unresolved_legacy_order_numbers: Number((progress as any).unresolved_legacy_order_numbers || 0),
            ambiguous_legacy_order_numbers: Number((progress as any).ambiguous_legacy_order_numbers || 0),
            export_page: Number((progress as any).export_page || (progress as any).legacy_export_page || progress.current_page || 1),
            export_continuation_token: (progress as any).export_continuation_token || (progress as any).legacy_export_continuation_token || null,
            invalid_reference: 0,
            has_more: false,
            next_cursor: null,
            next_page: null,
            warnings: progress.warnings || [],
            sample: [],
            dry_run: dryRun,
            would_update: 0,
            job: buildPublicImportJobPayload(job, progress, { full_progress: fullProgress }),
            message: `Backfill job is already ${progress.status}.`,
          });
        }
        if (!cursorInput) cursorInput = progress.current_cursor;
        exportPageInput = wowBoostLegacyExportPageForRequest({
          body,
          progress: progress as any,
          current_cursor: cursorInput || progress.current_cursor,
        });
        if (!exportContinuationTokenInput) {
          const persistedExportCursor = String((progress as any).export_cursor || (progress as any).legacy_export_cursor || "").trim();
          const currentCursor = String(cursorInput || progress.current_cursor || "").trim();
          if (persistedExportCursor && persistedExportCursor === currentCursor) {
            exportContinuationTokenInput = String(
              (progress as any).export_continuation_token ||
                (progress as any).legacy_export_continuation_token ||
                "",
            ).trim() || null;
          }
        }
      }

      const dateRange = normalizeWowBoostOrderDetailsBackfillDateRange(from, to);
      if (dateRange.ok !== true) {
        const invalidDateRange = dateRange as { error: string; message: string };
        return json({
          ok: false,
          error: invalidDateRange.error,
          message: invalidDateRange.message,
        }, 400);
      }
      exportContinuationTokenInput = wowBoostExportContinuationTokenWithDateRange({
        token: exportContinuationTokenInput,
        from: dateRange.from,
        to: dateRange.to,
      });

      const synchronousDebugMode =
        Boolean(body.synchronous_debug || body.synchronousDebug || body.run_synchronously || body.runSynchronously) ||
        String(body.mode || "").trim() === "synchronous_debug";
      if (!synchronousDebugMode) {
        const runtime = await startWowBoostCommerceReferenceRuntimeJob(env, {
          workspace_id: workspaceId,
          from: dateRange.from,
          to: dateRange.to,
          job_id: requestedJobId || null,
          export_page_size: exportPageSize,
          details_limit: limit,
          pacing_ms: pacingMs,
          max_export_pages: normalizeWowBoostRuntimeMaxExportPages(body.max_export_pages ?? body.maxExportPages),
          force_new_job: Boolean(body.force_new_job || body.forceNewJob),
        });
        return json(runtime.body, runtime.status);
      }

      if (!requestedJobId && body.persist_job !== false) {
        const now = new Date().toISOString();
        const progress = createInitialImportProgress({
          workspace_id: workspaceId,
          platform: "wowboost",
          connector_id: "wowboost-commerce-reference-backfill",
          from: dateRange.from,
          to: dateRange.to,
          filter: "commerce_reference_backfill",
          now,
        });
        progress.status = "importing";
        progress.started_at = now;
        progress.updated_at = now;
        job = await createImportJob(env, {
          platform: "wowboost",
          module: "wowboost_commerce_reference_backfill",
          from: dateRange.from,
          to: dateRange.to,
          filter: "commerce_reference_backfill",
          workspace_id: workspaceId,
          connector_id: "wowboost-commerce-reference-backfill",
          progress,
          status: "importing",
        });
      }
      let cursorState = parseWowBoostOrderDetailsBackfillCursor(cursorInput, body.current_platform ?? body.currentPlatform);

      const { data: creds, error: credsError } = await supabase
        .from("integrations_credentials")
        .select("*")
        .in("platform", [wowSuiteKey("wowboost"), "wowboost", "wowsuite"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (credsError) throw new Error(`WOWSuite(wowboost) creds read failed: ${credsError.message}`);
      if (!creds) throw new Error("WowBoost not connected. Save credentials first.");

      const authBase = String((creds as any).base_url || env.DEFAULT_WOWSUITE_AUTH_BASE || DEFAULT_WOWSUITE_AUTH_BASE).replace(/\/+$/, "");
      const exportBase = String(env.DEFAULT_WOWSUITE_EXPORT_BASE || DEFAULT_WOWSUITE_EXPORT_BASE).replace(/\/+$/, "");
      const username = String((creds as any).username ?? "").trim();
      const password = await decryptSecretFromCredRow(env, creds as any);
      const bearer = await wowSuiteGetBearerToken({ authBase, username, password });

      let scanData: any[] = [];
      let hasMore = false;
      let scanPlan = wowBoostOrderDetailsBackfillScanPlan({
        range: dateRange,
        cursor: cursorState,
        limit,
      });

      for (;;) {
        let query = supabase
          .from("platform_orders")
          .select("platform,platform_order_id,order_id,transaction_id,commerce_reference,order_ts")
          .eq("platform", scanPlan.current_platform)
          .or("commerce_reference.is.null,commerce_reference.eq.")
          .not("platform_order_id", "is", null)
          .gte("order_ts", scanPlan.order_ts_gte)
          .lt("order_ts", scanPlan.order_ts_lt)
          .order("platform_order_id", { ascending: true })
          .limit(scanPlan.limit);

        if (scanPlan.platform_order_id_gt) query = query.gt("platform_order_id", scanPlan.platform_order_id_gt);

        const { data, error: scanError } = await query;
        if (scanError) {
          const warning = `wowboost_backfill_scan_failed:${scanPlan.current_platform}:${scanError.message}`;
          if (isWowBoostOrderDetailsBackfillStatementTimeout(scanError)) {
            if (job) {
              const progress = progressFromJob(job);
              const nextProgress = {
                ...progress,
                status: "importing",
                current_cursor: serializeWowBoostOrderDetailsBackfillCursor(cursorState),
                last_error: scanError.message,
                updated_at: new Date().toISOString(),
                last_successful_cursor: serializeWowBoostOrderDetailsBackfillCursor(cursorState),
              } as ImportProgressState & Record<string, any>;
              const compactedProgress = compactWowBoostBackfillProgress(nextProgress, {
                incomingWarnings: [warning],
              }).progress;
              await updateImportJobProgress(env, job, compactedProgress);
              job = await getImportJob(env, job.id);
            }

            return json({
              ok: false,
              error: "wowboost_commerce_reference_scan_timeout",
              message: `WowBoost commerce-reference scan timed out for ${scanPlan.current_platform}. Resume with the returned cursor.`,
              strategy: "wowboost_order_details",
              workspace_id: workspaceId,
              job_id: job?.id || null,
              from: dateRange.from,
              to: dateRange.to,
              cursor: serializeWowBoostOrderDetailsBackfillCursor(cursorState),
              cursor_state: cursorState,
              next_cursor: serializeWowBoostOrderDetailsBackfillCursor(cursorState),
              next_cursor_state: cursorState,
              has_more: true,
              warnings: [warning],
              job: job
                ? buildPublicImportJobPayload(job, progressFromJob(job), { full_progress: fullProgress })
                : null,
            }, 503);
          }

          throw new Error(`WowBoost commerce-reference scan failed: ${scanError.message}`);
        }

        scanData = data || [];
        hasMore = scanData.length > limit;
        if (scanData.length || hasMore) break;

        const nextPlatform = nextWowBoostOrderDetailsBackfillPlatform(scanPlan.current_platform);
        if (!nextPlatform) break;

        cursorState = {
          current_platform: nextPlatform,
          platform_order_id: null,
        };
        scanPlan = wowBoostOrderDetailsBackfillScanPlan({
          range: dateRange,
          cursor: cursorState,
          limit,
        });
      }

      const scannedRows = ((scanData || []) as WowBoostOrderDetailsReferenceBackfillRow[]).slice(0, limit);
      const legacyRows = scannedRows.filter((row) => extractWowBoostLegacyOrderNumberEvidence(row).legacy_order_number);
      let legacyOrderNumberMappings = new Map<string, WowBoostOrderNumberToOrderIdMapping>();
      let legacyExportHasMore = false;
      let legacyNextPage: number | null = null;
      let legacyNextContinuationToken: string | null = null;
      let exportPagesProcessedThisInvocation = 0;
      let exportPageStart: number | null = null;
      let exportPageEnd: number | null = null;
      let executionBudgetReached = false;
      let exportRowsFetched = 0;
      let exportOrderNumberMappingsLoaded = 0;
      let exportOrderNumberMappingProgressIncrement = 0;
      let persistedExportOrderNumberMappingProgressIncrement = 0;
      let persistedExportPagesProcessedThisInvocation = 0;

      if (legacyRows.length) {
        const pinnedExportCursor = serializeWowBoostOrderDetailsBackfillCursor(cursorState);
        const targetLegacyOrderNumber = extractWowBoostLegacyOrderNumberEvidence(legacyRows[0]).legacy_order_number;
        const scan = await scanWowBoostLegacyOrderNumberExportPages({
          legacy_order_number: targetLegacyOrderNumber,
          start_page: exportPageInput,
          max_pages_per_invocation: maxExportPagesPerInvocation,
          max_elapsed_ms: maxExportElapsedMs,
          started_at_ms: requestStartedAtMs,
          fetch_page: async (page) => {
            const exp = await wowBoostExportPage({
              exportBase,
              bearer,
              page,
              pageSize: exportPageSize,
              fromYmd: dateRange.from,
              toYmd: dateRange.to,
            });

            const csvRes = await fetchWithTimeout(exp.link, { method: "GET", headers: { Accept: "text/csv,*/*" } }, 30000);
            const csvText = await readTextSafe(csvRes);
            if (!csvRes.ok) {
              throw new Error(`WowBoost legacy order-number export CSV download failed (${csvRes.status}): ${csvText.slice(0, 200)}`);
            }

            const parsed = parseCsv(csvText);
            return {
              page,
              rows: parsed.rows,
              has_more: Boolean(exp.hasMore),
              next_page: exp.hasMore ? page + 1 : null,
              continuation_token: wowBoostExportContinuationTokenWithDateRange({
                token: exp.nextExport,
                from: dateRange.from,
                to: dateRange.to,
              }),
            };
          },
          on_page_processed: async (state) => {
            exportOrderNumberMappingProgressIncrement += state.mappings_loaded_this_page;
            if (!job || !state.pending) return;

            const progress = progressFromJob(job);
            const exportPaging = wowBoostLegacyExportPagingProgress({
              pending: true,
              cursor: pinnedExportCursor,
              next_page: state.next_page,
              continuation_token: state.continuation_token,
            });
            const nextProgress = {
              ...progress,
              status: "importing",
              current_cursor: pinnedExportCursor,
              current_page: exportPaging.export_page,
              updated_at: new Date().toISOString(),
              last_successful_cursor: pinnedExportCursor,
              export_page: exportPaging.export_page,
              legacy_export_page: exportPaging.legacy_export_page,
              export_cursor: exportPaging.export_cursor,
              legacy_export_cursor: exportPaging.legacy_export_cursor,
              export_continuation_token: exportPaging.export_continuation_token,
              legacy_export_continuation_token: exportPaging.legacy_export_continuation_token,
              export_order_number_mappings_loaded:
                Number((progress as any).export_order_number_mappings_loaded || 0) + state.mappings_loaded_this_page,
              export_pages_processed:
                Number((progress as any).export_pages_processed || 0) + 1,
            } as ImportProgressState & Record<string, any>;
            await updateImportJobProgress(env, job, nextProgress);
            persistedExportOrderNumberMappingProgressIncrement += state.mappings_loaded_this_page;
            persistedExportPagesProcessedThisInvocation += 1;
            job = await getImportJob(env, job.id);
          },
        });

        legacyOrderNumberMappings = scan.mappings;
        legacyExportHasMore = scan.has_more;
        legacyNextPage = scan.next_page;
        legacyNextContinuationToken = scan.next_continuation_token;
        exportPagesProcessedThisInvocation = scan.pages_processed;
        exportPageStart = scan.start_page;
        exportPageEnd = scan.end_page;
        executionBudgetReached = scan.execution_budget_reached;
        exportRowsFetched = scan.rows_fetched;
        exportOrderNumberMappingsLoaded = scan.mappings_loaded;
      }

      const decisions: WowBoostOrderDetailsReferenceBackfillDecision[] = [];
      const processedRows: WowBoostOrderDetailsReferenceBackfillRow[] = [];
      const processedLookupOrderIds: string[] = [];
      const attemptedRows: WowBoostOrderDetailsReferenceBackfillRow[] = [];
      const warnings: string[] = [];
      const rateLimitWarnings: string[] = [];
      const failedOrderIds: string[] = [];
      const permanentlyMissingOrderIds: string[] = [];
      const unresolvedTransientOrderIds: string[] = [];
      const unresolvedLegacyOrderNumberSamples: string[] = [];
      const ambiguousLegacyOrderNumberSamples: string[] = [];
      let failedOrderLookups = 0;
      let permanentlyMissingOrders = 0;
      let mappedOrderNumbers = 0;
      let unresolvedLegacyOrderNumbers = 0;
      let ambiguousLegacyOrderNumbers = 0;
      let rateLimitRetries = 0;
      let retryAfterSeconds = 0;
      let legacyExportPending = false;
      let blockingFailure: {
        order_id: string;
        platform_order_id: string | null;
        error: string;
        status: number | null;
        next_backoff_ms: number | null;
        failure_classification?: string | null;
      } | null = null;

      for (let index = 0; index < scannedRows.length; index += 1) {
        const row = scannedRows[index];
        attemptedRows.push(row);
        const legacyOrderNumber = extractWowBoostLegacyOrderNumberEvidence(row);
        let lookupOrderId = resolveWowBoostOrderDetailsLookupOrderId(row);

        if (legacyOrderNumber.legacy_order_number) {
          const resolution = resolveWowBoostLegacyOrderNumber(
            legacyOrderNumberMappings,
            legacyOrderNumber.legacy_order_number,
          );

          if (resolution.status === "mapped") {
            mappedOrderNumbers += 1;
            lookupOrderId = {
              value: resolution.order_id,
              source_field: "order_id",
            };
          } else if (resolution.status === "ambiguous") {
            ambiguousLegacyOrderNumbers += 1;
            if (ambiguousLegacyOrderNumberSamples.length < 25) {
              ambiguousLegacyOrderNumberSamples.push(resolution.legacy_order_number);
            }
            warnings.push(`ambiguous_legacy_order_number:${resolution.legacy_order_number}`);
            decisions.push(buildWowBoostOrderDetailsReferenceBackfillDecision(row, null));
            processedRows.push(row);
            continue;
          } else if (legacyExportHasMore && legacyNextPage) {
            legacyExportPending = true;
            warnings.push(wowBoostLegacyOrderNumberDeferredWarning({
              legacy_order_number: legacyOrderNumber.legacy_order_number,
              start_page: exportPageStart ?? exportPageInput,
              end_page: exportPageEnd ?? exportPageInput,
            }));
            break;
          } else {
            unresolvedLegacyOrderNumbers += 1;
            if (unresolvedLegacyOrderNumberSamples.length < 25) {
              unresolvedLegacyOrderNumberSamples.push(legacyOrderNumber.legacy_order_number);
            }
            warnings.push(`unresolved_legacy_order_number:${legacyOrderNumber.legacy_order_number}`);
            decisions.push(buildWowBoostOrderDetailsReferenceBackfillDecision(row, null));
            processedRows.push(row);
            continue;
          }
        }

        if (!lookupOrderId.value) {
          decisions.push(buildWowBoostOrderDetailsReferenceBackfillDecision(row, null));
          processedRows.push(row);
          continue;
        }

        const details = await fetchWowBoostOrderDetailsReference({
          authBase,
          bearer,
          orderId: lookupOrderId.value,
        });
        rateLimitRetries += Number(details.rate_limit_retries || 0);
        retryAfterSeconds += Number(details.retry_after_seconds || 0);
        if (details.rate_limit_warnings?.length) rateLimitWarnings.push(...details.rate_limit_warnings);

        if (!details.ok) {
          const failureClassification = details.failure_classification || classifyWowBoostOrderDetailsLookupFailure({
            status: details.status,
            error: details.error,
            transient: details.transient,
          });

          if (failureClassification === "permanent_not_found") {
            decisions.push(legacyOrderNumber.legacy_order_number
              ? {
                  action: "skip",
                  reason: "missing_reference",
                  platform_order_id: String(row.platform_order_id || "").trim() || null,
                  order_id: String(row.order_id || "").trim() || null,
                  transaction_id: String(row.transaction_id || "").trim() || null,
                  existing_commerce_reference: String(row.commerce_reference || "").trim() || null,
                }
              : buildWowBoostOrderDetailsReferenceBackfillDecision(row, null));
            processedRows.push(row);
            processedLookupOrderIds.push(lookupOrderId.value);
            permanentlyMissingOrders += 1;
            permanentlyMissingOrderIds.push(lookupOrderId.value);
            warnings.push(`order_detail_not_found:${lookupOrderId.value}`);
            if (index < scannedRows.length - 1) {
              await sleepMs(pacingMs);
            }
            continue;
          }

          failedOrderLookups += 1;
          failedOrderIds.push(lookupOrderId.value);
          if (failureClassification === "transient") unresolvedTransientOrderIds.push(lookupOrderId.value);
          warnings.push(`order_detail_lookup_failed:${lookupOrderId.value}:${details.error || details.status || "unknown"}`);
          blockingFailure = {
            order_id: lookupOrderId.value,
            platform_order_id: String(row.platform_order_id || "").trim() || null,
            error: details.error || "WowBoost order detail lookup failed",
            status: details.status ?? null,
            next_backoff_ms: details.next_backoff_ms ?? null,
            failure_classification: failureClassification,
          };
          break;
        }

        decisions.push(buildWowBoostOrderDetailsReferenceBackfillDecision(row, {
          [details.source_field || "referenceId"]: details.reference,
        }));
        processedRows.push(row);
        processedLookupOrderIds.push(lookupOrderId.value);

        if (index < scannedRows.length - 1) {
          await sleepMs(pacingMs);
        }
      }

      const summary = summarizeWowBoostOrderDetailsReferenceBackfillDecisions(decisions, {
        dryRun,
        sampleLimit: 10,
      });

      let updated = 0;
      if (!dryRun && summary.patches.length) {
        const { data: updatedRows, error: updateError } = await supabase.rpc(
          "backfill_platform_order_commerce_references",
          {
            patches: summary.patches.map((patch) => ({
              platform_order_id: patch.platform_order_id,
              commerce_reference: patch.commerce_reference,
            })),
          },
        );
        if (updateError) throw new Error(`WowBoost commerce-reference backfill update failed: ${updateError.message}`);
        updated = (updatedRows || []).length;
      }
      const concurrentlyPopulated = Math.max(0, summary.patches.length - updated);
      const alreadyPopulated = summary.already_populated + concurrentlyPopulated;
      let remainingInRange: number | null = null;
      if (body.include_remaining_count === true && !hasMore && !blockingFailure) {
        try {
          const { count: remainingCount, error: remainingError } = await supabase
            .from("platform_orders")
            .select("platform_order_id", { count: "exact", head: true })
            .eq("platform", scanPlan.current_platform)
            .or("commerce_reference.is.null,commerce_reference.eq.")
            .not("platform_order_id", "is", null)
            .gte("order_ts", dateRange.from_iso)
            .lt("order_ts", dateRange.to_exclusive_iso);
          if (remainingError) throw remainingError;
          remainingInRange = Number(remainingCount || 0);
        } catch (error: any) {
          warnings.push(`remaining_in_range_count_failed:${error?.message || String(error)}`);
        }
      }
      const lastSuccessfulPlatformOrderId = wowBoostOrderDetailsBackfillNextCursor(scannedRows, true, {
        processedCount: processedRows.length,
        inputCursor: cursorState.platform_order_id,
        blocked: Boolean(blockingFailure || legacyExportPending),
      });
      const lastSuccessfulCursorState = {
        current_platform: scanPlan.current_platform,
        platform_order_id: lastSuccessfulPlatformOrderId,
      };
      let nextCursorState: typeof lastSuccessfulCursorState | null = null;
      if (blockingFailure || legacyExportPending || hasMore) {
        nextCursorState = lastSuccessfulCursorState;
      } else {
        const nextPlatform = nextWowBoostOrderDetailsBackfillPlatform(scanPlan.current_platform);
        if (nextPlatform) {
          nextCursorState = {
            current_platform: nextPlatform,
            platform_order_id: null,
          };
        }
      }
      const lastSuccessfulCursor = serializeWowBoostOrderDetailsBackfillCursor(lastSuccessfulCursorState);
      const nextCursor = serializeWowBoostOrderDetailsBackfillCursor(nextCursorState);
      const hasMoreAfterThisChunk = Boolean(nextCursorState);
      const nextPage = legacyExportPending ? legacyNextPage : null;
      const exportPagingProgress = wowBoostLegacyExportPagingProgress({
        pending: Boolean(legacyExportPending && nextPage),
        cursor: lastSuccessfulCursor,
        next_page: nextPage,
        continuation_token: legacyNextContinuationToken,
      });

      if (job) {
        const progress = progressFromJob(job);
        const failedOrderIdSet = new Set<string>(
          Array.isArray((progress as any).failed_order_ids)
            ? (progress as any).failed_order_ids.map((value: unknown) => String(value || "").trim()).filter(Boolean)
            : [],
        );
        for (const orderId of processedLookupOrderIds) failedOrderIdSet.delete(orderId);
        for (const orderId of failedOrderIds) failedOrderIdSet.add(orderId);
        const unresolvedTransientOrderIdSet = new Set<string>(
          Array.isArray((progress as any).unresolved_transient_order_ids)
            ? (progress as any).unresolved_transient_order_ids.map((value: unknown) => String(value || "").trim()).filter(Boolean)
            : [],
        );
        for (const orderId of processedLookupOrderIds) unresolvedTransientOrderIdSet.delete(orderId);
        for (const orderId of unresolvedTransientOrderIds) unresolvedTransientOrderIdSet.add(orderId);
        const remainingExportMappingProgressIncrement = Math.max(
          0,
          exportOrderNumberMappingProgressIncrement - persistedExportOrderNumberMappingProgressIncrement,
        );
        const remainingExportPagesProcessed = Math.max(
          0,
          exportPagesProcessedThisInvocation - persistedExportPagesProcessedThisInvocation,
        );

        const nextProgress: ImportProgressState = {
          ...progress,
          status: hasMoreAfterThisChunk ? "importing" : "completed",
          current_cursor: nextCursor,
          records_fetched: Number(progress.records_fetched || 0) + attemptedRows.length,
          records_processed: Number(progress.records_processed || 0) + processedRows.length,
          rows_upserted: Number(progress.rows_upserted || 0) + updated,
          current_page: exportPagingProgress.export_page,
          last_error: null,
          started_at: progress.started_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          completed_at: hasMoreAfterThisChunk ? null : new Date().toISOString(),
          last_successful_cursor: lastSuccessfulCursor,
          failed_order_ids: Array.from(failedOrderIdSet),
          missing_reference: Number((progress as any).missing_reference || 0) + summary.missing_reference,
          unresolved_transient_order_ids: Array.from(unresolvedTransientOrderIdSet).slice(-100),
          mapped_order_numbers: Number((progress as any).mapped_order_numbers || 0) + mappedOrderNumbers,
          export_order_number_mappings_loaded:
            Number((progress as any).export_order_number_mappings_loaded || 0) + remainingExportMappingProgressIncrement,
          export_pages_processed:
            Number((progress as any).export_pages_processed || 0) + remainingExportPagesProcessed,
          unresolved_legacy_order_numbers: Number((progress as any).unresolved_legacy_order_numbers || 0) + unresolvedLegacyOrderNumbers,
          ambiguous_legacy_order_numbers: Number((progress as any).ambiguous_legacy_order_numbers || 0) + ambiguousLegacyOrderNumbers,
          unresolved_legacy_order_number_samples: capWowBoostPermanentMissingOrderIds(
            (progress as any).unresolved_legacy_order_number_samples,
            unresolvedLegacyOrderNumberSamples,
            100,
          ),
          ambiguous_legacy_order_number_samples: capWowBoostPermanentMissingOrderIds(
            (progress as any).ambiguous_legacy_order_number_samples,
            ambiguousLegacyOrderNumberSamples,
            100,
          ),
          export_page: exportPagingProgress.export_page,
          legacy_export_page: exportPagingProgress.legacy_export_page,
          export_cursor: exportPagingProgress.export_cursor,
          legacy_export_cursor: exportPagingProgress.legacy_export_cursor,
          export_continuation_token: exportPagingProgress.export_continuation_token,
          legacy_export_continuation_token: exportPagingProgress.legacy_export_continuation_token,
          retry_after_seconds: Number((progress as any).retry_after_seconds || 0) + retryAfterSeconds,
          current_backoff_ms: blockingFailure?.next_backoff_ms ?? null,
        } as ImportProgressState & Record<string, any>;
        const nextCompactedProgress = compactWowBoostBackfillProgress(nextProgress, {
          incomingWarnings: warnings.filter((warning) => !warning.startsWith("order_detail_not_found:")),
          incomingRateLimitWarnings: rateLimitWarnings,
          rateLimitRetryCount: rateLimitRetries,
          permanentlyMissingIds: permanentlyMissingOrderIds,
          permanentlyMissingCount: permanentlyMissingOrders,
          recoveredPermanentlyMissingIds: processedLookupOrderIds,
        }).progress;
        await updateImportJobProgress(env, job, nextCompactedProgress);
        job = await getImportJob(env, job.id);
      }

      return json({
        ok: true,
        strategy: "wowboost_order_details",
        workspace_id: workspaceId,
        job_id: job?.id || null,
        cursor: serializeWowBoostOrderDetailsBackfillCursor(cursorState),
        cursor_state: cursorState,
        from: dateRange.from,
        to: dateRange.to,
        limit,
        pacing_ms: pacingMs,
        repair_mode: repairMode,
        scanned: attemptedRows.length,
        scanned_in_range: attemptedRows.length,
        processed: processedRows.length,
        eligible: summary.eligible,
        updated,
        remaining_in_range: remainingInRange,
        already_populated: alreadyPopulated,
        missing_reference: summary.missing_reference,
        permanently_missing_orders: permanentlyMissingOrders,
        permanently_missing_order_ids: permanentlyMissingOrderIds,
        failed_order_lookups: failedOrderLookups,
        failed_order_ids: failedOrderIds,
        unresolved_transient_order_ids: unresolvedTransientOrderIds,
        export_page: exportPageInput,
        export_page_size: exportPageSize,
        max_export_pages_per_invocation: maxExportPagesPerInvocation,
        max_export_elapsed_ms: maxExportElapsedMs,
        export_continuation_token: exportContinuationTokenInput,
        export_pages_processed_this_invocation: exportPagesProcessedThisInvocation,
        export_page_start: exportPageStart,
        export_page_end: exportPageEnd,
        export_rows_fetched: exportRowsFetched,
        export_order_number_mappings_loaded: exportOrderNumberMappingsLoaded,
        mapped_order_numbers: mappedOrderNumbers,
        unresolved_legacy_order_numbers: unresolvedLegacyOrderNumbers,
        unresolved_legacy_order_number_samples: unresolvedLegacyOrderNumberSamples,
        ambiguous_legacy_order_numbers: ambiguousLegacyOrderNumbers,
        ambiguous_legacy_order_number_samples: ambiguousLegacyOrderNumberSamples,
        last_successful_cursor: lastSuccessfulCursor,
        last_successful_cursor_state: lastSuccessfulCursorState,
        rate_limit_retries: rateLimitRetries,
        retry_after_seconds: retryAfterSeconds,
        rate_limit_warnings: rateLimitWarnings,
        invalid_reference: summary.invalid_reference,
        has_more: hasMoreAfterThisChunk,
        next_cursor: hasMoreAfterThisChunk ? nextCursor : null,
        next_cursor_state: nextCursorState,
        next_page: nextPage,
        next_export_page: nextPage,
        next_export_continuation_token: legacyNextContinuationToken,
        execution_budget_reached: executionBudgetReached,
        blocking_failure: blockingFailure,
        warnings: [...warnings, ...rateLimitWarnings],
        sample: summary.sample.map((row) => ({
          platform_order_id: row.platform_order_id,
          order_id: row.order_id,
          extracted_reference_id: row.commerce_reference,
          existing_commerce_reference: row.existing_commerce_reference,
          source_field: row.source_field,
        })),
        dry_run: dryRun,
        would_update: summary.would_update,
        job: job ? buildPublicImportJobPayload(job, progressFromJob(job), { full_progress: fullProgress }) : null,
      });
    } catch (e: any) {
      return json({
        ok: false,
        error: "wowboost_commerce_reference_backfill_failed",
        message: e?.message || String(e),
      }, 500);
    }
  }
  
  if (path === "/v1/integrations/wowpay/import-one-page" && req.method === "POST") {
	  const body = await readJsonBody(req);
	  const from = String(body.from ?? "").trim();
	  const to = String(body.to ?? "").trim();
	  const page = Math.max(1, Number(body.page ?? 1));
	  const pageSize = Math.max(1, Math.min(1000, Number(body.pageSize ?? 1000)));
	
	  if (!parseYmd(from) || !parseYmd(to)) {
	    return json({ ok: false, error: "bad_request", message: "from/to must be YYYY-MM-DD" }, 400);
	  }
	
	  const result = await runWowPayImportPage(env, { from, to, page, pageSize });
	  return json({ ok: true, platform: wowSuiteKey("wowpay"), from, to, ...result });
	}

  if (path === "/v1/integrations/wowsuite/status" && req.method === "GET") {
    const supabase = getSupabase(env);

    const { data, error } = await supabase
      .from("integrations_credentials")
      .select("platform,base_url,username,created_at,updated_at")
      .in("platform", [wowSuiteKey("wowboost"), wowSuiteKey("wowpay"), "wowboost", "wowpay", "wowsuite"]);

    if (error) throw new Error(error.message);

    const rows = (data ?? []) as any[];
    const wowboost = rows.find((r) => [wowSuiteKey("wowboost"), "wowboost", "wowsuite"].includes(String(r.platform))) || null;
    const wowpay = rows.find((r) => String(r.platform) === wowSuiteKey("wowpay") || String(r.platform) === "wowpay") || null;

    return json({
      ok: true,
      platform: "wowsuite",
      connected: Boolean(wowboost || wowpay),
      subs: {
        wowboost: wowboost
          ? {
              connected: true,
              baseUrl: wowboost.base_url ?? null,
              username: wowboost.username ?? null,
              updated_at: wowboost.updated_at ?? null,
            }
          : { connected: false },
        wowpay: wowpay
          ? {
              connected: true,
              baseUrl: wowpay.base_url ?? null,
              username: wowpay.username ?? null,
              updated_at: wowpay.updated_at ?? null,
            }
          : { connected: false },
      },
    });
  }
  
  if (path === "/v1/platform-orders" && req.method === "GET") {
    try {
      const platform = String(url.searchParams.get("platform") || "").trim();
      const status = String(url.searchParams.get("status") || "").trim();
      const from = String(url.searchParams.get("from") || "").trim();
      const to = String(url.searchParams.get("to") || "").trim();
      const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") || 200)));
      const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
      const search = String(url.searchParams.get("q") || "").trim();

      const sortRaw = String(url.searchParams.get("sort") || "order_ts").trim();
      const dirRaw = String(url.searchParams.get("dir") || "desc").trim().toLowerCase();

      const allowedSorts = new Set([
        "order_ts",
        "gross_amount",
        "status",
        "platform",
        "platform_order_id",
        "transaction_id",
        "customer_email",
        "tkid",
        "currency",
      ]);

      const sort = allowedSorts.has(sortRaw) ? sortRaw : "order_ts";
      const dir = dirRaw === "asc" ? "asc" : "desc";

      const supabase = getSupabase(env);

      let q = supabase
        .from("platform_orders")
        .select("*", { count: "exact" });

      if (platform) q = q.eq("platform", platform);
      if (status && status !== "ALL_SALES") q = q.eq("status", status);
      if (from) q = q.gte("order_ts", `${from}T00:00:00.000Z`);
      if (to) q = q.lte("order_ts", `${to}T23:59:59.999Z`);

      if (search) {
        const safeSearch = search.replace(/[%_]/g, "");

        q = q.or(
          [
            `platform_order_id.ilike.%${safeSearch}%`,
            `transaction_id.ilike.%${safeSearch}%`,
            `customer_email.ilike.%${safeSearch}%`,
            `tkid.ilike.%${safeSearch}%`,
          ].join(",")
        );
      }

      q = q
        .order(sort, { ascending: dir === "asc" })
        .range(offset, offset + limit - 1);

      const { data, error, count } = await q;
      if (error) throw new Error(error.message);

      return json({
        ok: true,
        orders: data || [],
        count: data?.length || 0,
        total: count || 0,
        limit,
        offset,
        page: Math.floor(offset / limit) + 1,
        totalPages: Math.max(1, Math.ceil((count || 0) / limit)),
        sort,
        dir,
        search,
      });
    } catch (e: any) {
      return json({
        ok: false,
        error: "platform_orders_failed",
        message: e?.message || String(e),
      }, 500);
    }
  }

  if (path === "/v1/integrations/wowboost/debug-export" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const from = String(body.from ?? "").trim();
      const to = String(body.to ?? "").trim();

      if (!parseYmd(from) || !parseYmd(to)) {
        return json({ ok: false, error: "bad_request", message: "from/to must be YYYY-MM-DD" }, 400);
      }

      const supabase = getSupabase(env);

      const { data: creds, error } = await supabase
        .from("integrations_credentials")
        .select("*")
        .in("platform", [wowSuiteKey("wowboost"), "wowboost", "wowsuite"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw new Error(`WOWSuite(wowboost) creds read failed: ${error.message}`);
      if (!creds) throw new Error("WowBoost not connected. Save credentials first.");

      const authBase = String(
        (creds as any).base_url || env.DEFAULT_WOWSUITE_AUTH_BASE || DEFAULT_WOWSUITE_AUTH_BASE
      ).replace(/\/+$/, "");

      const exportBase = String(env.DEFAULT_WOWSUITE_EXPORT_BASE || DEFAULT_WOWSUITE_EXPORT_BASE).replace(/\/+$/, "");
      const username = String((creds as any).username ?? "").trim();
      const password = await decryptSecretFromCredRow(env, creds as any);

      const bearer = await wowSuiteGetBearerToken({ authBase, username, password });

      const exportUrl = new URL(`${exportBase}/order/export/1/10`);
      exportUrl.searchParams.set("StartDate", from);
      exportUrl.searchParams.set("EndDate", to);

      const exportRes = await fetchWithTimeout(exportUrl.toString(), {
        method: "GET",
        headers: {
          Authorization: `bearer ${bearer}`,
          Accept: "application/json, text/plain, */*",
        },
      }, 30000);

      const exportText = await readTextSafe(exportRes);
      const exportJson = safeJsonParse(exportText);
      const link = String(exportJson?.link ?? "").trim();

      let csvStatus: number | null = null;
      let csvSnippet: string | null = null;
      let csvHeaders: string[] = [];
      let csvRowCount: number | null = null;

      if (link) {
        const csvRes = await fetchWithTimeout(link, { method: "GET", headers: { Accept: "text/csv,*/*" } }, 30000);
        csvStatus = csvRes.status;
        const csvText = await readTextSafe(csvRes);
        csvSnippet = csvText.slice(0, 500);

        if (csvRes.ok) {
          const parsed = parseCsv(csvText);
          csvHeaders = parsed.headers;
          csvRowCount = parsed.rows.length;
        }
      }

      return json({
        ok: true,
        platform: "wowsuite:wowboost",
        from,
        to,
        sort,
        dir,
        authBase,
        exportBase,
        exportUrl: exportUrl.toString(),
        exportStatus: exportRes.status,
        exportOk: exportRes.ok,
        exportJson,
        exportSnippet: exportText.slice(0, 500),
        csvLinkFound: Boolean(link),
        csvStatus,
        csvHeaders,
        csvRowCount,
        csvSnippet,
      });
    } catch (e: any) {
      return json({
        ok: false,
        error: "wowboost_debug_failed",
        message: e?.message || String(e),
      }, 500);
    }
  }
  
    if (path === "/v1/integrations/wowboost/import-orders-now" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const from = String(body.from ?? "").trim();
      const to = String(body.to ?? "").trim();

      if (!parseYmd(from) || !parseYmd(to)) {
        return json({ ok: false, error: "bad_request", message: "from/to must be YYYY-MM-DD" }, 400);
      }

      const res = await runWowSuiteWowBoostImport(env, {
        from,
        to,
        pageSize: Number(body.pageSize ?? 10),
        debug: Boolean(body.debug),
      });

      return json({
        ok: true,
        platform: "wowsuite:wowboost",
        from,
        to,
        ...res,
      });
    } catch (e: any) {
      return json(
        {
          ok: false,
          error: "wowboost_import_now_failed",
          message: e?.message || String(e),
        },
        500
      );
    }
  }
  
  if (path === "/v1/integrations/gateway-classic/import-one-page" && req.method === "POST") {
  try {
    const body = await readJsonBody(req);
    const platform = String(body.platform ?? "").trim();
    const from = String(body.from ?? "").trim();
    const to = String(body.to ?? "").trim();
    const page = Math.max(0, Number(body.page ?? 0));
    const pageSize = Math.max(1, Math.min(1000, Number(body.pageSize ?? 1000)));

    if (!platform) return json({ ok: false, error: "bad_request", message: "platform is required" }, 400);
    if (!parseYmd(from) || !parseYmd(to)) {
      return json({ ok: false, error: "bad_request", message: "from/to must be YYYY-MM-DD" }, 400);
    }

    const result = await runGatewayClassicImportPage(env, { platform, from, to, page, pageSize });

    return json({
      ok: true,
      platform,
      connector: "classic_query",
      from,
      to,
      ...result,
    });
  } catch (e: any) {
    return json({
      ok: false,
      error: "gateway_classic_import_failed",
      message: e?.message || String(e),
    }, 500);
  }
}

if (path === "/v1/integrations/gateway-classic/status" && req.method === "GET") {
  try {
    const url = new URL(req.url);
    const platform = String(url.searchParams.get("platform") || "").trim();

    if (!platform) {
      return json({
        ok: false,
        error: "bad_request",
        message: "platform is required",
      }, 400);
    }

    const creds = await getLatestCredential(env, platform);

    if (!creds) {
      return json({
        ok: true,
        connected: false,
        platform,
      });
    }

    return json({
      ok: true,
      connected: true,
      platform,
      baseUrl: (creds as any).base_url || "",
      username: (creds as any).username || "",
      created_at: (creds as any).created_at || null,
      updated_at: (creds as any).updated_at || null,
    });
  } catch (e: any) {
    return json({
      ok: false,
      error: "gateway_status_failed",
      message: e?.message || String(e),
    }, 500);
  }
}

if (path === "/v1/integrations/gateway-classic/list" && req.method === "GET") {
  try {
    const supabase = getSupabase(env);

    const { data, error } = await supabase
      .from("integrations_credentials")
      .select("platform,base_url,username,created_at,updated_at")
      .or("platform.like.nmi:%,platform.eq.paydiverse")
      .order("updated_at", { ascending: false });

    if (error) throw new Error(error.message);

    return json({
      ok: true,
      accounts: data || [],
    });
  } catch (e: any) {
    return json({
      ok: false,
      error: "gateway_list_failed",
      message: e?.message || String(e),
    }, 500);
  }
}
  
    if (path === "/v1/integrations/wowboost/import-one-page" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const from = String(body.from ?? "").trim();
      const to = String(body.to ?? "").trim();
      const page = Math.max(1, Number(body.page ?? 1));
      const pageSize = Math.max(1, Math.min(1000, Number(body.pageSize ?? 1000)));

      if (!parseYmd(from) || !parseYmd(to)) {
        return json({ ok: false, error: "bad_request", message: "from/to must be YYYY-MM-DD" }, 400);
      }

      const supabase = getSupabase(env);

      const { data: creds, error } = await supabase
        .from("integrations_credentials")
        .select("*")
        .in("platform", [wowSuiteKey("wowboost"), "wowboost", "wowsuite"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!creds) throw new Error("WowBoost not connected.");

      const authBase = String((creds as any).base_url || env.DEFAULT_WOWSUITE_AUTH_BASE || DEFAULT_WOWSUITE_AUTH_BASE).replace(/\/+$/, "");
      const exportBase = String(env.DEFAULT_WOWSUITE_EXPORT_BASE || DEFAULT_WOWSUITE_EXPORT_BASE).replace(/\/+$/, "");
      const username = String((creds as any).username ?? "").trim();
      const password = await decryptSecretFromCredRow(env, creds as any);

      const bearer = await wowSuiteGetBearerToken({ authBase, username, password });

      const exp = await wowBoostExportPage({
        exportBase,
        bearer,
        page,
        pageSize,
        fromYmd: from,
        toYmd: to,
      });

      const csvRes = await fetchWithTimeout(exp.link, { method: "GET", headers: { Accept: "text/csv,*/*" } }, 30000);
      const csvText = await readTextSafe(csvRes);

      if (!csvRes.ok) {
        throw new Error(`CSV download failed ${csvRes.status}: ${csvText.slice(0, 200)}`);
      }

      const parsed = parseCsv(csvText);
      
      console.log("WOWBOOST CSV HEADERS", parsed.headers);
	  console.log("WOWBOOST FIRST ROW", parsed.rows[0]);

      const upserts = await Promise.all(
        parsed.rows.map(async (r) => {
          const orderId =
            pickField(r, ["Order ID", "OrderId", "OrderID", "order_id", "Id", "ID"]) ||
            pickField(r, ["Order Number", "OrderNumber", "orderNumber"]);

          if (!orderId) return null;

          const status = wowSuiteNormalizeStatus(
            pickField(r, ["Order Status Name", "OrderStatus", "orderStatus", "Status", "status"]) ||
              pickField(r, ["Receipt Status Name", "PaymentStatus", "paymentStatus"])
          );

          let gross = parseMoneyMaybe(
            pickField(r, [
              "Order Price USD",
              "Order Price",
              "productPrice",
              "Product Price",
              "ProductPrice",
              "Amount USD",
              "Amount",
              "Total",
              "OrderTotal",
            ])
          );

          if (gross == null) gross = 0;
          if ((status === "REFUNDED" || status === "CHARGEBACK" || status === "CANCELLED") && gross > 0) {
            gross = -Math.abs(gross);
          }

          const isoTs =
            parseDateToIsoMaybe(
              pickField(r, ["Order Create Date", "Updated Date", "Create Date (Receipts)", "OrderDate", "Date"])
            ) || `${from}T00:00:00.000Z`;

          const emailFields = await emailIdentityFields(
            pickField(r, ["CustomerEmail", "Customer Email", "Email", "email", "customerEmail"])
          );
          const transactionId =
            pickField(r, ["PaymentTrackingNumber", "Payment Tracking Number", "TransactionId", "Transaction ID", "transaction_id", "ReferenceId", "Reference ID"]) || null;
          const commerceReferenceEvidence = extractWowBoostCommerceReferenceEvidence(r);
          const commerceReference = commerceReferenceEvidence.value || null;
          const efTid = pickEverflowTid(r) || null;
          const phone = normalizePhone(pickField(r, ["CustomerPhone", "Customer Phone", "Phone", "phone", "Phone Number"]));

          return {
            platform: "wowboost",
            platform_order_id: `wowboost:${orderId}`,
            platform_store_id: pickField(r, ["Campaign ID", "CampaignId", "Campaign", "Brand Campaign"]) || null,
            order_id: String(orderId),
            commerce_reference: commerceReference,
            order_ts: isoTs,
            status,
            status_norm: status,
            gross_amount: gross,
            receipt_total: parseMoneyMaybe(pickField(r, ["Amount USD", "Amount", "AmountUSD", "amount"])) ?? null,
            currency: pickField(r, ["Currency Code", "Currency", "currencyCode", "Transaction Currency"]) || "USD",

            ...emailFields,
            email: emailFields.customer_email,
            phone: phone || null,
            transaction_id: transactionId,
            everflow_transaction_id: efTid,
            tkid: pickTrackingId(r) || null,
            affiliate_id: pickField(r, ["Affiliate ID", "AffiliateId", "affiliate_id", "Partner ID", "PartnerId"]) || null,
            everflow_offer_id: pickField(r, ["Offer ID", "OfferId", "Campaign ID", "CampaignId"]) || null,
            source_id: pickField(r, ["Source ID", "SourceId", "source_id"]) || null,
            sub1: pickField(r, ["S1", "s1", "sub1", "Sub1"]) || null,
            sub2: pickField(r, ["S2", "s2", "sub2", "Sub2"]) || null,
            sub3: pickField(r, ["S3", "s3", "sub3", "Sub3"]) || null,
            sub4: pickField(r, ["S4", "s4", "sub4", "Sub4"]) || null,
            sub5: pickField(r, ["S5", "s5", "sub5", "Sub5"]) || null,
            product_subtotal: parseMoneyMaybe(
              pickField(r, [
                "Order Price USD",
                "Order Price",
                "productPrice",
                "Product Price",
                "ProductPrice",
                "Product Subtotal",
                "Subtotal",
              ])
            ) ?? null,
            shipping_amount: parseMoneyMaybe(pickField(r, ["Shipping Amount", "Shipping", "Shipping Price"])) ?? null,
            tax_amount: parseMoneyMaybe(pickField(r, ["Tax Amount", "Tax"])) ?? null,
            product_cost: parseMoneyMaybe(pickField(r, ["Product Cost", "COGS"])) ?? null,
            shipping_cost: parseMoneyMaybe(pickField(r, ["Shipping Cost"])) ?? null,
            gateway_fee: parseMoneyMaybe(pickField(r, ["Gateway Fee", "Processor Fee"])) ?? null,
            chargeback_fee: parseMoneyMaybe(pickField(r, ["Chargeback Fee"])) ?? null,
            tracking_number: pickField(r, ["ShipmentTrackingNumber", "Shipment Tracking Number", "FulfillmentTrackingNumber", "Tracking Number"]) || null,
            shipping_carrier: pickField(r, ["Shipping Carrier", "Carrier"]) || null,
            raw_json: {
              ...r,
              tracekit_commerce_reference_evidence: commerceReference
                ? {
                    source: "wowboost",
                    source_field: commerceReferenceEvidence.source_field,
                    value: commerceReference,
                  }
                : null,
            },
          };
        })
      ).then((rows) => rows.filter(Boolean));

      const deduped = dedupePlatformOrders(upserts);

      if (deduped.length) {
        const { error: upErr } = await supabase
          .from("platform_orders")
          .upsert(deduped as any[], { onConflict: "platform_order_id" });

        if (upErr) throw new Error(upErr.message);
      }

      return json({
        ok: true,
        platform: "wowsuite:wowboost",
        from,
        to,
        page,
        pageSize,
        fetched: parsed.rows.length,
        upserted: deduped.length,
        hasMore: exp.hasMore,
        nextPage: exp.hasMore ? page + 1 : null,
      });
    } catch (e: any) {
      return json({
        ok: false,
        error: "wowboost_import_one_page_failed",
        message: e?.message || String(e),
      }, 500);
    }
  }
  
    if (path === "/v1/integrations/wowboost/import-next-page" && req.method === "POST") {
  return json(
    {
      ok: false,
      error: "deprecated_endpoint",
      message: "import-next-page is deprecated. Use import-orders-async and queue status polling.",
    },
    410
  );
}
  
    if (path === "/v1/integrations/nmi/import-one-page" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const from = String(body.from ?? "").trim();
      const to = String(body.to ?? "").trim();
      const offset = Math.max(0, Number(body.offset ?? 0));
      const pageSize = Math.max(1, Math.min(1000, Number(body.pageSize ?? 1000)));

      if (!parseYmd(from) || !parseYmd(to)) {
        return json({ ok: false, error: "bad_request", message: "from/to must be YYYY-MM-DD" }, 400);
      }

      const result = await runNmiImportPage(env, { from, to, offset, pageSize });

      return json({
        ok: true,
        platform: "nmi:lifeheater14090",
        from,
        to,
        ...result,
      });
    } catch (e: any) {
      return json({
        ok: false,
        error: "nmi_import_one_page_failed",
        message: e?.message || String(e),
      }, 500);
    }
  }
  
    if (path === "/v1/integrations/nmi/status" && req.method === "GET") {
    const creds = await getLatestCredential(env, "nmi:lifeheater14090");

    if (!creds) {
      return json({
        ok: true,
        connected: false,
        platform: "nmi:lifeheater14090",
        baseUrl: null,
        username: null,
        created_at: null,
        updated_at: null,
      });
    }

    return json({
      ok: true,
      connected: true,
      platform: "nmi:lifeheater14090",
      baseUrl: creds.base_url ?? null,
      username: creds.username ?? null,
      created_at: creds.created_at ?? null,
      updated_at: creds.updated_at ?? null,
    });
  }
  
  if (path === "/v1/integrations/nmi-lifeheater14090/import-one-page-classic" && req.method === "POST") {
  try {
    const body = await readJsonBody(req);
    const from = String(body.from ?? "").trim();
    const to = String(body.to ?? "").trim();
    const page = Math.max(0, Number(body.page ?? 0));
    const pageSize = Math.max(1, Math.min(1000, Number(body.pageSize ?? 1000)));

    if (!parseYmd(from) || !parseYmd(to)) {
      return json({ ok: false, error: "bad_request", message: "from/to must be YYYY-MM-DD" }, 400);
    }

    const result = await runNmiClassicImportPage(env, { from, to, page, pageSize });

    return json({
      ok: true,
      platform: "nmi:lifeheater14090",
      connector: "classic_query",
      from,
      to,
      ...result,
    });
  } catch (e: any) {
    return json({
      ok: false,
      error: "nmi_classic_import_failed",
      message: e?.message || String(e),
    }, 500);
  }
}

if (path === "/v1/integrations/nmi-lifeheater14090/debug-classic" && req.method === "POST") {
  try {
    const body = await readJsonBody(req);
    const from = String(body.from ?? "").trim();
    const to = String(body.to ?? "").trim();

    const creds = await getLatestCredential(env, "nmi:lifeheater14090");
    if (!creds) throw new Error("NMI LifeHeater14090 not connected.");

    const securityKey = await decryptSecretFromCredRow(env, creds as any);
    const baseUrl = String((creds as any).base_url || "https://secure.networkmerchants.com").replace(/\/+$/, "");

    const form = new URLSearchParams();
    form.set("security_key", securityKey.trim());
    form.set("start_date", nmiClassicDate(from, false));
    form.set("end_date", nmiClassicDate(to, true));
    form.set("result_limit", "10");
    form.set("page_number", "0");
    form.set("result_order", "standard");
    form.set("condition", "pending,pendingsettlement,in_progress,abandoned,failed,canceled,complete,unknown");

    const res = await fetch(`${baseUrl}/api/query.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });

    const xml = await readTextSafe(res);

    return json({
      ok: true,
      status: res.status,
      baseUrl,
      submittedStartDate: nmiClassicDate(from, false),
      submittedEndDate: nmiClassicDate(to, true),
      transactionCount: xmlBlocks(xml, "transaction").length,
      responseSnippet: xml.slice(0, 3000),
      debugVersion: "nmi-classic-v3",
    });
  } catch (e: any) {
    return json({ ok: false, error: "nmi_debug_failed", message: e?.message || String(e) }, 500);
  }
}


  if (path === "/v1/integrations/paydiverse/debug-classic" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const from = String(body.from ?? "").trim();
      const to = String(body.to ?? "").trim();

      const creds = await getLatestCredential(env, "paydiverse");
      if (!creds) throw new Error("PayDiverse not connected.");

      const securityKey = await decryptSecretFromCredRow(env, creds as any);
      const baseUrl = String((creds as any).base_url || "https://paydiverse.transactiongateway.com").replace(/\/+$/, "");

      const form = new URLSearchParams();
      form.set("security_key", securityKey.trim());
      form.set("start_date", nmiClassicDate(from, false));
      form.set("end_date", nmiClassicDate(to, true));
      form.set("result_limit", "10");
      form.set("page_number", "0");
      form.set("result_order", "standard");
      form.set("condition", "pending,pendingsettlement,in_progress,abandoned,failed,canceled,complete,unknown");

      const res = await fetch(`${baseUrl}/api/query.php`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });

      const xml = await readTextSafe(res);

      return json({
        ok: true,
        platform: "paydiverse",
        status: res.status,
        baseUrl,
        submittedStartDate: nmiClassicDate(from, false),
        submittedEndDate: nmiClassicDate(to, true),
        transactionCount: xmlBlocks(xml, "transaction").length,
        responseSnippet: xml.slice(0, 3000),
        debugVersion: "paydiverse-classic-v1",
      });
    } catch (e: any) {
      return json({ ok: false, error: "paydiverse_debug_failed", message: e?.message || String(e) }, 500);
    }
  }

  if (path === "/v1/integrations/paydiverse/import-one-page" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const from = String(body.from ?? "").trim();
      const to = String(body.to ?? "").trim();
      const page = Math.max(0, Number(body.page ?? 0));
      const pageSize = Math.max(1, Math.min(1000, Number(body.pageSize ?? 1000)));

      if (!parseYmd(from) || !parseYmd(to)) {
        return json({ ok: false, error: "bad_request", message: "from/to must be YYYY-MM-DD" }, 400);
      }

      const result = await runPayDiverseClassicImportPage(env, { from, to, page, pageSize });

      return json({
        ok: true,
        platform: "paydiverse",
        connector: "classic_query",
        from,
        to,
        ...result,
      });
    } catch (e: any) {
      return json({
        ok: false,
        error: "paydiverse_classic_import_failed",
        message: e?.message || String(e),
      }, 500);
    }
  }

  return json({ ok: false, error: "not_found" }, 404);
}

async function runWowBoostImportPage(
  env: Env,
  args: { from: string; to: string; page: number; pageSize?: number; connector_job_id?: string | null }
) {
  const supabase = getSupabase(env);
  const pageSize = Math.max(1, Math.min(100, Number(args.pageSize ?? 100)));

  const fromMs = Date.parse(`${args.from}T00:00:00.000Z`);
  const toExclusive = new Date(`${args.to}T00:00:00.000Z`);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  const toMs = toExclusive.getTime();

  const { data: creds, error } = await supabase
    .from("integrations_credentials")
    .select("*")
    .in("platform", [wowSuiteKey("wowboost"), "wowboost", "wowsuite"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!creds) throw new Error("WowBoost not connected.");

  const authBase = String((creds as any).base_url || env.DEFAULT_WOWSUITE_AUTH_BASE || DEFAULT_WOWSUITE_AUTH_BASE).replace(/\/+$/, "");
  const exportBase = String(env.DEFAULT_WOWSUITE_EXPORT_BASE || DEFAULT_WOWSUITE_EXPORT_BASE).replace(/\/+$/, "");
  const username = String((creds as any).username ?? "").trim();
  const password = await decryptSecretFromCredRow(env, creds as any);

  const bearer = await wowSuiteGetBearerToken({ authBase, username, password });

  const exp = await wowBoostExportPage({
    exportBase,
    bearer,
    page: args.page,
    pageSize,
    fromYmd: args.from,
    toYmd: args.to,
  });

  const csvRes = await fetchWithTimeout(
    exp.link,
    { method: "GET", headers: { Accept: "text/csv,*/*" } },
    30000
  );

  const csvText = await readTextSafe(csvRes);

  if (!csvRes.ok) {
    throw new Error(`CSV download failed ${csvRes.status}: ${csvText.slice(0, 200)}`);
  }

  const parsed = parseCsv(csvText);

  const mapped = await Promise.all(
    parsed.rows.map(async (r) => {
      const orderId =
        pickField(r, ["Order ID", "OrderId", "OrderID", "order_id", "Id", "ID"]) ||
        pickField(r, ["Order Number", "OrderNumber", "orderNumber"]);

      if (!orderId) return null;

      const rawDate = pickField(r, [
        "Order Create Date",
        "Updated Date",
        "Create Date (Receipts)",
        "OrderDate",
        "Date",
      ]);

      const isoTs = parseDateToIsoMaybe(rawDate);
      if (!isoTs) return null;

      const orderMs = Date.parse(isoTs);
      if (!Number.isFinite(orderMs)) return null;

      if (orderMs < fromMs || orderMs >= toMs) return null;

      const status = wowSuiteNormalizeStatus(
        pickField(r, ["Order Status Name", "OrderStatus", "orderStatus", "Status", "status"]) ||
          pickField(r, ["Receipt Status Name", "PaymentStatus", "paymentStatus"])
      );

      let gross = parseMoneyMaybe(
        pickField(r, [
          "Order Price USD",
          "Order Price",
          "productPrice",
          "Product Price",
          "Amount USD",
          "Amount",
          "Total",
          "OrderTotal",
        ])
      );

      if (gross == null) gross = 0;

      if ((status === "REFUNDED" || status === "CHARGEBACK" || status === "CANCELLED") && gross > 0) {
        gross = -Math.abs(gross);
      }

      const emailFields = await emailIdentityFields(pickField(r, ["Email", "email"]));

      const transactionId =
        pickField(r, [
          "PaymentTrackingNumber",
          "Payment Tracking Number",
          "TransactionId",
          "Transaction ID",
          "transaction_id",
          "ReferenceId",
          "Reference ID",
        ]) || null;
      const commerceReferenceEvidence = extractWowBoostCommerceReferenceEvidence(r);
      const commerceReference = commerceReferenceEvidence.value || null;

      const efTid =
        pickField(r, [
          "_ef_transaction_id",
          "ef_transaction_id",
          "everflow_transaction_id",
          "sub5",
          "Sub5",
          "SUB5",
          "s5",
          "S5",
        ]) || null;

      const phone = normalizePhone(
        pickField(r, ["CustomerPhone", "Customer Phone", "Phone", "phone", "Phone Number"])
      );

      return {
        platform: "wowboost",
        platform_order_id: `wowboost:${orderId}`,
        platform_store_id:
          pickField(r, ["Campaign ID", "CampaignId", "Campaign", "Brand Campaign"]) || null,
        order_id: String(orderId),
        commerce_reference: commerceReference,
        order_ts: isoTs,
        status,
        status_norm: status,
        gross_amount: gross,

        receipt_total: parseMoneyMaybe(pickField(r, ["Amount USD", "Amount"])) ?? null,

        currency:
          pickField(r, [
            "Currency Code",
            "Currency",
            "currencyCode",
            "Transaction Currency",
          ]) || "USD",

        ...emailFields,
        email: emailFields.customer_email,
        phone: phone || null,
        transaction_id: transactionId,
        everflow_transaction_id: efTid,
        tkid: pickTrackingId(r) || null,

        affiliate_id:
          pickField(r, [
            "Affiliate ID",
            "AffiliateId",
            "affiliate_id",
            "Partner ID",
            "PartnerId",
          ]) || null,

        everflow_offer_id:
          pickField(r, ["Offer ID", "OfferId", "Campaign ID", "CampaignId"]) || null,

        source_id: pickField(r, ["Source ID", "SourceId", "source_id"]) || null,
        sub1: pickField(r, ["S1", "s1", "sub1", "Sub1"]) || null,
        sub2: pickField(r, ["S2", "s2", "sub2", "Sub2"]) || null,
        sub3: pickField(r, ["S3", "s3", "sub3", "Sub3"]) || null,
        sub4: pickField(r, ["S4", "s4", "sub4", "Sub4"]) || null,
        sub5: pickField(r, ["S5", "s5", "sub5", "Sub5"]) || null,

        product_subtotal:
          parseMoneyMaybe(
            pickField(r, ["Order Price USD", "Order Price", "productPrice", "Product Price"])
          ) ?? null,

        shipping_amount:
          parseMoneyMaybe(pickField(r, ["Shipping Amount", "Shipping", "Shipping Price"])) ?? null,

        tax_amount: parseMoneyMaybe(pickField(r, ["Tax Amount", "Tax"])) ?? null,
        product_cost: parseMoneyMaybe(pickField(r, ["Product Cost", "COGS"])) ?? null,
        shipping_cost: parseMoneyMaybe(pickField(r, ["Shipping Cost"])) ?? null,
        gateway_fee: parseMoneyMaybe(pickField(r, ["Gateway Fee", "Processor Fee"])) ?? null,
        chargeback_fee: parseMoneyMaybe(pickField(r, ["Chargeback Fee"])) ?? null,

        tracking_number:
          pickField(r, [
            "ShipmentTrackingNumber",
            "Shipment Tracking Number",
            "FulfillmentTrackingNumber",
            "Tracking Number",
          ]) || null,

        shipping_carrier: pickField(r, ["Shipping Carrier", "Carrier"]) || null,
        raw_json: {
          ...r,
          tracekit_commerce_reference_evidence: commerceReference
            ? {
                source: "wowboost",
                source_field: commerceReferenceEvidence.source_field,
                value: commerceReference,
              }
            : null,
        },
      };
    })
  );

  const validRows = mapped.filter(Boolean);
  const deduped = dedupePlatformOrders(validRows);
  const identity = deduped.length
    ? await attachIdentityToWowBoostPlatformRows(env, deduped, {
        workspace_id: "default",
        connector_job_id: args.connector_job_id || null,
      })
    : { attempted: 0, linked: 0, review_required: 0, skipped: 0, warnings: [] as string[] };

  if (deduped.length) {
    const { error: upErr } = await supabase
      .from("platform_orders")
      .upsert(deduped as any[], { onConflict: "platform_order_id" });

    if (upErr) throw new Error(upErr.message);
  }

  const sourceRows = parsed.rows.length;
  const validInRangeRows = validRows.length;

  const hasMore =
    sourceRows >= pageSize &&
    validInRangeRows > 0 &&
    Boolean(exp.hasMore);

  return {
    fetched: validInRangeRows,
    sourceRows,
    upserted: deduped.length,
    page: args.page,
    pageSize,
    hasMore,
    nextPage: hasMore ? args.page + 1 : null,
    identity,
  };
}

  export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(req.url);
      const path = url.pathname;

      if (path === "/v1/integrations/wowboost/import-orders-async" && req.method === "POST") {
        const body = await readJsonBody(req);
        const from = String(body.from ?? "").trim();
        const to = String(body.to ?? "").trim();
        const filter = String(body.filter ?? "all_sales").trim();

        if (!parseYmd(from) || !parseYmd(to)) {
          return json({ ok: false, error: "bad_request", message: "from/to must be YYYY-MM-DD" }, 400);
        }

        if (!env.wowboost_imports) {
          return json({
            ok: false,
            error: "queue_not_configured",
            message: "wowboost_imports queue binding is missing. Check wrangler.toml.",
          }, 500);
        }

        const job = await createImportJob(env, {
          platform: wowSuiteKey("wowboost"),
          module: "wowboost",
          from,
          to,
          filter,
        });
  
  const pageSize = Math.max(1, Math.min(100, Number(body.pageSize ?? 100)));

  await updateImportJob(env, job.id, {
    status: "queued",
    pages: 0,
    fetched: 0,
    upserted: 0,
    retries: 0,
    error: null,
    started_at: new Date().toISOString(),
  });

  await env.wowboost_imports.send({
    job_id: job.id,
    from,
    to,
    filter,
    page: 1,
    pageSize,
    attempt: 1,
  });

  const updated = await getImportJob(env, job.id);

  return json({
    ok: true,
    job_id: job.id,
    job: buildPublicImportJobPayload(updated, progressFromJob(updated || job), {
      full_progress: requestFullProgress(body.full_progress ?? body.fullProgress),
    }),
    status: updated?.status ?? "queued",
    platform: wowSuiteKey("wowboost"),
    module: "wowboost",
    from,
    to,
    filter,
    pageSize,
    message: "Import job queued. Background worker will process pages.",
  });
}

if (path === "/v1/integrations/wowboost/import-job-status" && req.method === "GET") {
  const jobId = url.searchParams.get("job_id") || "";

  if (!jobId) {
    return json({ ok: false, error: "bad_request", message: "job_id is required" }, 400);
  }

  const job = await getImportJob(env, jobId);

  if (!job) {
    return json({ ok: false, error: "not_found", message: "Import job not found" }, 404);
  }

  return json({
    ok: true,
    job: buildPublicImportJobPayload(job, progressFromJob(job), {
      full_progress: requestFullProgress(url.searchParams.get("full_progress") ?? url.searchParams.get("fullProgress")),
    }),
    done: job.status === "completed" || job.status === "failed" || job.status === "cancelled",
  });
}


      return await router(req, env);
    } catch (e: any) {
      console.error("[TraceKit] unhandled error", e);
      return json({ ok: false, error: "server_error", message: e?.message || "unknown" }, e?.status || 500);
    }
  },
  
	  async queue(batch: MessageBatch<any>, env: Env, ctx: ExecutionContext) {
	  for (const msg of batch.messages) {
	    const body = msg.body || {};
	    const runtimeTaskId = String(body.runtime_task_id ?? body.task_id ?? "").trim();

	    if (runtimeTaskId) {
	      try {
	        let task = await getConnectorRuntimeTask(env, runtimeTaskId);
	        if (!task || task.status === "completed" || task.status === "cancelled") {
	          msg.ack();
	          continue;
	        }

	        if (isIdentityResolveRuntimeTask(task) && task.status === "running") {
	          if (isConnectorRuntimeTaskStale(task, { stale_ms: IDENTITY_RESOLVE_TASK_STALE_MS })) {
	            task = await recoverStaleIdentityResolveTask(env, task, { enqueue: false, reason: "queue_redelivery_stale" });
	            if (task.status === "failed") {
	              msg.ack();
	              continue;
	            }
	          } else {
	            await enqueueConnectorRuntimeTaskWithDelay(env, task, IDENTITY_RESOLVE_TASK_RECHECK_DELAY_SECONDS);
	            msg.ack();
	            continue;
	          }
	        }

	        const availableAt = task.available_at ? Date.parse(task.available_at) : 0;
	        if (availableAt && availableAt > Date.now()) {
	          const delaySeconds = Math.max(1, Math.ceil((availableAt - Date.now()) / 1000));
	          if (env.wowboost_imports) {
	            await env.wowboost_imports.send(connectorRuntimeTaskMessage({
	              id: task.id,
	              job_id: task.job_id,
	              connector_id: task.connector_id,
	              task_type: task.task_type,
	              phase: task.phase,
	            }), { delaySeconds } as any);
	          }
	          msg.ack();
	          continue;
	        }

	        await executeConnectorRuntimeTask(env, task);
	        msg.ack();
	        continue;
	      } catch (e: any) {
	        const diagnostic = connectorRuntimeErrorSummary(e);
	        const task = await getConnectorRuntimeTask(env, runtimeTaskId).catch(() => null);
	        const classification = classifyConnectorRuntimeFailure({
	          status: e?.status,
	          message: diagnostic.last_error,
	          transient: e?.transient,
	        });
	        if (task) {
	          const attempt = Math.max(1, Number(task.attempt_count || 1));
	          await insertConnectorRuntimeError(env, {
	            job_id: task.job_id,
	            task_id: task.id,
	            connector_id: task.connector_id,
	            record_identifier: task.dedupe_key,
	            error_class: "task_execution_failed",
	            http_status: e?.status ?? null,
	            attempt,
	            message: diagnostic.last_error,
	            response_excerpt: diagnostic.response_excerpt,
	            classification,
	          }).catch(() => {});

	          const job = await getImportJob(env, task.job_id).catch(() => null);
	          const progress = job ? connectorRuntimeProgressFromJob(job) : null;
	          if (classification === "transient" && attempt < Number(task.max_attempts || 5)) {
	            const delayMs = connectorRuntimeRetryDelayMs({ attempt });
	            const nextRunAt = connectorRuntimeNextRunAt({ attempt, delay_ms: delayMs });
	              await updateConnectorRuntimeTask(env, task.id, {
	                status: "retrying",
	                available_at: nextRunAt,
	                locked_at: null,
	                last_error: diagnostic.last_error,
	              }).catch(() => {});
	              if (job && progress) {
	                let retryMetadata: Record<string, any> | undefined;
	                if (task.connector_id === IDENTITY_BACKFILL_CONNECTOR_ID) {
	                  retryMetadata = {
	                    transient_retries: Number(progress.metadata?.transient_retries || 0) + 1,
	                    discovery_transient_retries: task.task_type === IDENTITY_BACKFILL_TASK_TYPES.discover
	                      ? Number(progress.metadata?.discovery_transient_retries || 0) + 1
	                      : Number(progress.metadata?.discovery_transient_retries || 0),
	                    finalize_transient_retries: task.task_type === IDENTITY_BACKFILL_TASK_TYPES.finalize
	                      ? Number(progress.metadata?.finalize_transient_retries || 0) + 1
	                      : Number(progress.metadata?.finalize_transient_retries || 0),
	                  };
	                }
	                const nextProgress = mergeConnectorRuntimeCounters(progress, { retries: 1 }, {
	                  status: "retrying",
	                  phase: task.phase,
	                  last_error: diagnostic.last_error,
	                  next_run_at: nextRunAt,
	                  metadata: retryMetadata,
	                });
	              await updateConnectorRuntimeJobProgress(env, job, nextProgress).catch(() => {});
	            }
	            if (env.wowboost_imports) {
	              await env.wowboost_imports.send(connectorRuntimeTaskMessage({
	                id: task.id,
	                job_id: task.job_id,
	                connector_id: task.connector_id,
	                task_type: task.task_type,
	                phase: task.phase,
	              }), { delaySeconds: Math.max(1, Math.ceil(delayMs / 1000)) } as any);
	            }
	          } else {
	            await updateConnectorRuntimeTask(env, task.id, {
	              status: "failed",
	              completed_at: new Date().toISOString(),
	              locked_at: null,
	              last_error: diagnostic.last_error,
	            }).catch(() => {});
	            if (job && progress) {
	              let failureMetadata: Record<string, any> | undefined;
	              if (task.connector_id === IDENTITY_BACKFILL_CONNECTOR_ID && task.task_type === IDENTITY_BACKFILL_TASK_TYPES.discover) {
	                const platforms = identityBackfillPlatformsFromProgress(progress);
	                const cursorValue = task.payload?.cursor || task.cursor || progress.current_cursor || null;
	                const failedCursor = parseIdentityBackfillCursor(cursorValue, platforms);
	                const discoveryPlatforms = markIdentityBackfillPlatformDiscovery(progress.metadata, failedCursor.current_platform, "failed");
	                const discoverySummary = identityBackfillDiscoverySummary({ discovery_platforms: discoveryPlatforms }, platforms);
	                failureMetadata = {
	                  discovery_platforms: discoveryPlatforms,
	                  discovery_completed_platforms: discoverySummary.completed,
	                  discovery_failed_platforms: discoverySummary.failed,
	                  discovery_pending_platforms: discoverySummary.pending,
	                  incomplete_discovery: discoverySummary.incomplete,
	                  exhausted_discovery_failures: Number(progress.metadata?.exhausted_discovery_failures || 0) + 1,
	                };
	              }
	              const nextProgress = mergeConnectorRuntimeCounters(progress, { records_failed: 1 }, {
	                status: classification === "blocking" ? "failed" : "completed_with_errors",
	                phase: task.phase,
	                last_error: diagnostic.last_error,
	                metadata: failureMetadata,
	              });
	              if (classification === "blocking") nextProgress.completed_at = new Date().toISOString();
	              await updateConnectorRuntimeJobProgress(env, job, nextProgress).catch(() => {});
	            }
	          }
	        }
	        msg.ack();
	        continue;
	      }
	    }

	    const jobId = String(body.job_id ?? body.jobId ?? "").trim();
    const page = Math.max(1, Number(body.page ?? 1));
    const pageSize = Math.max(1, Math.min(100, Number(body.pageSize ?? 100)));
    const attempt = Math.max(1, Number(body.attempt ?? 1));
    const maxAttempts = 10;

    if (!jobId) {
      msg.ack();
      continue;
    }

    try {
      const job = await getImportJob(env, jobId);

      if (!job) {
        msg.ack();
        continue;
      }

      if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
        msg.ack();
        continue;
      }

      await updateImportJob(env, jobId, {
        status: "running",
        started_at: job.started_at || new Date().toISOString(),
        completed_at: null,
        error: null,
      });

      const result = await runWowBoostImportPage(env, {
        from: job.from_date,
        to: job.to_date,
        page,
        pageSize,
        connector_job_id: jobId,
      });

      const fetchedThisPage = Number(result.fetched ?? 0);
      const upsertedThisPage = Number(result.upserted ?? 0);

      const nextFetched = Number(job.fetched ?? 0) + fetchedThisPage;
      const nextUpserted = Number(job.upserted ?? 0) + upsertedThisPage;

      const hasMore = Boolean(result.hasMore);

      await updateImportJob(env, jobId, {
        status: hasMore ? "running" : "completed",
        pages: Math.max(Number(job.pages ?? 0), page),
        fetched: nextFetched,
        upserted: nextUpserted,
        retries: 0,
        last_success_page: page,
        last_success_at: new Date().toISOString(),
        last_error_at: null,
        completed_at: hasMore ? null : new Date().toISOString(),
        error: null,
      });

      if (hasMore) {
        await env.wowboost_imports.send({
          job_id: jobId,
          page: page + 1,
          pageSize,
          attempt: 1,
        });
      }

      msg.ack();
    } catch (e: any) {
      const message = e?.message || String(e) || "unknown";

      console.error("[TraceKit] wowboost queue import page failed", {
        jobId,
        page,
        pageSize,
        attempt,
        message,
      });

      if (attempt >= maxAttempts) {
        await updateImportJob(env, jobId, {
          status: "failed",
          completed_at: new Date().toISOString(),
          error: `Page ${page} failed after ${attempt} attempts: ${message}`,
          retries: 0,
          last_error_at: new Date().toISOString(),
        }).catch(() => {});

        msg.ack();
        continue;
      }

      await updateImportJob(env, jobId, {
        status: "retrying",
        completed_at: null,
        error: `Page ${page} attempt ${attempt} failed: ${message}`,
        last_error_at: new Date().toISOString(),
      }).catch(() => {});

      await env.wowboost_imports.send({
        job_id: jobId,
        page,
        pageSize,
        attempt: attempt + 1,
      });

      msg.ack();
    }
  }
},

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduledCheckoutChampImport(env));
    ctx.waitUntil(runScheduledShopifyImport(env));
    ctx.waitUntil(runScheduledPaypalImport(env));
  },
};
