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
  appendConnectorRuntimeTaskDiagnosticBatch,
  appendConnectorRuntimeTaskDiagnosticSample,
  appendConnectorRuntimeTaskDiagnostic,
  classifyConnectorRuntimeFailure,
  compactConnectorRuntimeInlineDebugDiagnostics,
  compactConnectorRuntimeJobPayload,
  connectorRuntimeErrorSummary,
  connectorRuntimeFinalizeFailureProgress,
  connectorRuntimeFinalizeSuccessProgress,
  connectorRuntimeMetadata,
  connectorRuntimeNextRunAt,
  connectorRuntimeAttemptAlreadyIncremented,
  connectorRuntimeQueuedTaskRepublishDecision,
  connectorRuntimeRerunFinalizeProgress,
  connectorRuntimeRequeueTaskDecision,
  connectorRuntimeRetryDelayMs,
  connectorRuntimeStaleRunningTaskRequeueDecision,
  connectorRuntimeStaleRunningTaskRecoveryDecision,
  connectorRuntimeTaskDedupeKey,
  connectorRuntimeTaskMessage,
  createConnectorRuntimeProgress,
  sendConnectorRuntimeQueueMessageWithRetry,
  isConnectorRuntimeTaskStale,
  isCloudflareSubrequestLimitError,
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
  createIdentityResolutionDebugMetrics,
  createIdentityService,
  createSupabaseIdentityRepository,
  resolveIdentityForSourceRecord,
  withIdentityOperationTimeout,
  type IdentityDiagnostics,
  type IdentityInputIdentifier,
  type IdentityResolutionDebugMetrics,
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
  identityBackfillTargetDiagnosticEventName,
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
  identityBackfillResolveSubrequestLimitCheckpoint,
  identityBackfillRuntimeConfigMatches,
  isIdentityBackfillTargetDiagnosticRecord,
  isSupportedIdentityBackfillPlatformOrder,
  markIdentityBackfillPlatformDiscovery,
  maskIdentityBackfillDiagnosticValue,
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
  JOURNEY_EVENTS_BACKFILL_JOB_TYPE,
  JOURNEY_EVENTS_BACKFILL_PHASE,
  JOURNEY_EVENTS_CONNECTOR_ID,
  JOURNEY_EVENTS_PLATFORM_ORDER_SELECT,
  createJourneyEventsBatch,
  createSupabaseJourneyEventRepository,
  getPersonTimeline,
  journeyBackfillDateRange,
  mapPlatformOrderToJourneyEvent,
  matchJourneyTimelineRoute,
  nextJourneyBackfillPlatform,
  normalizeJourneyBackfillRequest,
  normalizePersonTimelineParams,
  parseJourneyBackfillCursor,
  serializeJourneyBackfillCursor,
  type JourneyBackfillRequest,
  type JourneyEventBatchResult,
  type JourneyEventInput,
} from "./journey-events";
import {
  JOURNEY_EVENT_ASSIGNMENT_SELECT,
  JOURNEY_ENGINE_CONNECTOR_ID,
  JOURNEY_ENGINE_JOB_TYPE,
  JOURNEY_ENGINE_PHASE,
  JOURNEY_ASSIGNMENT_MAX_BATCH_SIZE,
  JOURNEY_DEFAULT_TIMEOUT_SECONDS,
  assignJourneyEvents,
  createSupabaseJourneyRepository,
  decodeJourneyBackfillCursor as decodeJourneyAssignmentBackfillCursor,
  decodeJourneyListCursor,
  encodeJourneyListCursor,
  getJourneyDetail,
  getPersonJourneys,
  matchJourneyRoutes,
  normalizeJourneyBackfillRequest as normalizeJourneyAssignmentBackfillRequest,
  normalizeJourneyDetailParams,
  normalizePersonJourneysParams,
  serializeJourneyBackfillCursor as serializeJourneyAssignmentBackfillCursor,
  type JourneyBackfillRequest as JourneyAssignmentBackfillRequest,
  type JourneyBackfillResult as JourneyAssignmentBackfillResult,
  type JourneyRow,
} from "./journeys";
import {
  ATTRIBUTION_BACKFILL_CONNECTOR_ID,
  ATTRIBUTION_BACKFILL_MAX_JOURNEY_BATCH_SIZE,
  ATTRIBUTION_BACKFILL_JOB_TYPE,
  ATTRIBUTION_BACKFILL_PHASE,
  ATTRIBUTION_BACKFILL_DEFAULT_JOURNEY_BATCH_SIZE,
  createSupabaseAttributionRepository,
  getJourneyAttribution,
  getPersonAttribution,
  matchAttributionRoutes,
  normalizeAttributionBackfillRequest,
  normalizeJourneyAttributionParams,
  normalizePersonAttributionParams,
  normalizeRecalculateJourneyAttributionParams,
  processAttributionBackfillJourneys,
  recalculateJourneyAttribution,
  type AttributionBackfillBatchResult,
  type AttributionBackfillRequest,
} from "./attribution";
import {
  createSupabasePayoutRepository,
  generateAffiliateCommissions,
  getPayoutAttributionPolicy,
  listAffiliateCommissions,
  matchPayoutRoutes,
  normalizeAffiliateCommissionListParams,
  normalizePayoutGenerationRequest,
  normalizeWorkspaceAttributionPolicyRequest,
  setPayoutAttributionPolicy,
} from "./payouts";
import {
  getWorkspaceOnboardingState,
  matchSetupWizardRoute,
  upsertSetupProgressState,
  upsertWorkspaceSetupState,
} from "./setup-wizard";
import {
  getEventExplorerEventDetail,
  listEventExplorerEvents,
  matchEventExplorerRoute,
  normalizeEventExplorerListParams,
} from "./event-explorer";
import {
  auditDomainEventProjectionReplay,
  buildAttributionPendingDomainEventFromJourneyEvent,
  buildConnectorIncidentDomainEvent,
  buildFinancialAdjustmentDomainEventFromJourneyEvent,
  buildIdentityOutcomeDomainEvent,
  buildPurchaseDomainEventsFromJourneyEvent,
  buildReconciliationDomainEvent,
  createWorkspaceEventStream,
  getDomainEventProjectionStatus,
  matchDomainEventRoute,
  projectDomainEventsBatch,
  publishDomainEvent,
  publishDomainEventOutbox,
  runScheduledDomainEventProjectionReplay,
} from "./domain-events";
import {
  getCustomerDetail,
  getCustomerJourneyDetail,
  listCustomers,
  matchCustomerExplorerRoute,
  normalizeCustomerJourneyDetailParams,
  normalizeCustomerListParams,
} from "./customer-explorer";
import {
  getWorkspaceHealthReport,
  matchHealthRoute,
  normalizeHealthParams,
} from "./health";
import {
  buildHomeSummary,
  matchHomeRoute,
  normalizeHomeParams,
} from "./home";
import {
  matchGlobalSearchRoute,
  normalizeGlobalSearchParams,
  searchWorkspace,
} from "./search";
import {
  getEntityPreview,
  matchEntityPreviewRoute,
} from "./entities";
import {
  getWorkspaceNotification,
  getWorkspaceNotificationReport,
  matchNotificationRoute,
  normalizeNotificationParams,
  upsertNotificationReadState,
} from "./notifications";
import {
  enrichHealthReportWithWorkItems,
  getOperationsSummary,
  getWorkItemDetail,
  listWorkItems,
  matchWorkItemRoute,
  mutateWorkItem,
  normalizeWorkItemParams,
  syncHealthWorkItems,
} from "./work-items";
import {
  BROWSER_EVENT_DEFAULT_BATCH_SIZE,
  BROWSER_EVENT_MAX_BATCH_SIZE,
  BROWSER_EVENT_NORMALIZE_TASK_TYPE,
  BROWSER_EVENTS_CONNECTOR_ID,
  BROWSER_EVENTS_JOB_TYPE,
  BROWSER_EVENTS_PHASE,
  BROWSER_EVENTS_RAW_TABLE,
  browserCorsHeaders,
  browserDateFromTimestamp,
  browserEventPersonAttributes,
  browserIdentityIdentifiers,
  browserSetupSnippet,
  browserWriteKeyHash,
  browserOriginAllowed,
  isBrowserEventIngestionPath,
  matchBrowserEventRoute,
  applyBrowserTkidIdentityToBatch,
  buildBrowserJourneyEventInput,
  normalizeBrowserEventForRawStorage,
  parseBrowserEventCursor,
  safeUrlForDiagnostics,
  serializeBrowserEventCursor,
  type BrowserRawEventRow,
} from "./browser-events";
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
  TRACEKIT_DEPLOYED_AT?: string;
  TRACEKIT_ENVIRONMENT?: string;
  CF_PAGES_BRANCH?: string;
  TRACEKIT_BROWSER_WRITE_KEY?: string;
  TRACEKIT_BROWSER_WRITE_KEY_HASH?: string;
  TRACEKIT_BROWSER_ALLOWED_ORIGINS?: string;
  TRACEKIT_BROWSER_RATE_LIMIT_PER_MINUTE?: string;
  TRACEKIT_BROWSER_IP_HASH_SALT?: string;
  LIVE_WORKSPACE_PROJECTION_BATCH_SIZE?: string;
  LIVE_WORKSPACE_PROJECTION_MAX_EVENTS?: string;
  LIVE_WORKSPACE_PROJECTION_MAX_WORKSPACES?: string;
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
const TRACEKIT_BUILD_LABEL = "source-build";
const TRACEKIT_BUILD_VERSION = "unversioned";

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

function adminAuthError(req: Request, env: Env) {
  const expected = String(env.TK_SECRET_KEY || "").trim();
  if (!expected) return json({ ok: false, error: "admin_auth_not_configured" }, 500);
  const headerSecret = String(req.headers.get("x-tk-secret") || "").trim();
  const authorization = String(req.headers.get("authorization") || "").trim();
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authorization);
  const supplied = headerSecret || String(bearerMatch?.[1] || "").trim();
  if (supplied && supplied === expected) return null;
  return json({ ok: false, error: "unauthorized" }, 401);
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

function getJourneyEventRepository(env: Env) {
  return createSupabaseJourneyEventRepository(getSupabase(env));
}

function getJourneyRepository(env: Env) {
  return createSupabaseJourneyRepository(getSupabase(env));
}

function getAttributionRepository(env: Env) {
  return createSupabaseAttributionRepository(getSupabase(env));
}

function getPayoutRepository(env: Env) {
  return createSupabasePayoutRepository(getSupabase(env));
}

function journeyText(value: unknown) {
  return String(value ?? "").trim();
}

type BrowserEventSourceConfig = {
  workspace_id: string;
  public_write_key_hash: string;
  allowed_origins: string[];
  cross_subdomain_cookie_domain?: string | null;
  rate_limit_per_minute?: number | null;
  is_active?: boolean | null;
  metadata?: Record<string, any> | null;
};

const browserEventRateLimitBuckets = new Map<string, { window_start_ms: number; count: number }>();

function browserEventWriteKeyFromRequest(req: Request) {
  const authorization = String(req.headers.get("authorization") || "").trim();
  const bearer = /^Bearer\s+(.+)$/i.exec(authorization)?.[1] || "";
  return String(req.headers.get("x-tracekit-write-key") || bearer || "").trim();
}

function browserEventWorkspaceFromRequest(req: Request, body?: any) {
  return journeyText(
    body?.workspace_id ||
    body?.workspaceId ||
    req.headers.get("x-tracekit-workspace-id") ||
    new URL(req.url).searchParams.get("workspace_id") ||
    "default",
  ) || "default";
}

function parseAllowedBrowserOrigins(value: unknown) {
  if (Array.isArray(value)) return value.map(journeyText).filter(Boolean);
  return journeyText(value).split(",").map(journeyText).filter(Boolean);
}

async function envBrowserEventSourceConfig(env: Env, workspaceId: string): Promise<BrowserEventSourceConfig | null> {
  const rawHash = journeyText(env.TRACEKIT_BROWSER_WRITE_KEY_HASH);
  const rawKey = journeyText(env.TRACEKIT_BROWSER_WRITE_KEY);
  const hash = rawHash || (rawKey ? await browserWriteKeyHash(workspaceId, rawKey) : "");
  if (!hash) return null;
  return {
    workspace_id: workspaceId,
    public_write_key_hash: hash,
    allowed_origins: parseAllowedBrowserOrigins(env.TRACEKIT_BROWSER_ALLOWED_ORIGINS || "*"),
    rate_limit_per_minute: Math.max(1, Number(env.TRACEKIT_BROWSER_RATE_LIMIT_PER_MINUTE || 120) || 120),
    is_active: true,
  };
}

async function readBrowserEventSourceConfig(env: Env, workspaceId: string): Promise<BrowserEventSourceConfig | null> {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from("browser_event_sources")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) {
    const fallback = await envBrowserEventSourceConfig(env, workspaceId);
    if (fallback) return fallback;
    throw new Error(`Browser event source config lookup failed: ${error.message}`);
  }
  if (data) {
    return {
      workspace_id: journeyText((data as any).workspace_id) || workspaceId,
      public_write_key_hash: journeyText((data as any).public_write_key_hash),
      allowed_origins: parseAllowedBrowserOrigins((data as any).allowed_origins),
      cross_subdomain_cookie_domain: journeyText((data as any).cross_subdomain_cookie_domain) || null,
      rate_limit_per_minute: Math.max(1, Number((data as any).rate_limit_per_minute || 120) || 120),
      is_active: Boolean((data as any).is_active),
      metadata: ((data as any).metadata || {}) as Record<string, any>,
    };
  }
  return envBrowserEventSourceConfig(env, workspaceId);
}

async function validateBrowserEventRequest(req: Request, env: Env, workspaceId: string, body?: any) {
  const origin = journeyText(req.headers.get("origin"));
  const config = await readBrowserEventSourceConfig(env, workspaceId);
  if (!config || !config.public_write_key_hash || config.is_active === false) {
    return { ok: false as const, status: 401, error: "browser_event_source_not_configured", message: "Browser event ingestion is not configured for this workspace.", cors_headers: browserCorsHeaders(origin, false) };
  }
  const allowedOrigin = browserOriginAllowed(origin, config.allowed_origins);
  if (!allowedOrigin) {
    return { ok: false as const, status: 403, error: "origin_not_allowed", message: "This origin is not allowed for browser event ingestion.", cors_headers: browserCorsHeaders(origin, false) };
  }
  const writeKey = browserEventWriteKeyFromRequest(req) || journeyText(body?.write_key || body?.writeKey);
  const suppliedHash = writeKey ? await browserWriteKeyHash(workspaceId, writeKey) : "";
  if (!suppliedHash || suppliedHash !== config.public_write_key_hash) {
    return { ok: false as const, status: 401, error: "invalid_write_key", message: "Invalid browser event write key.", cors_headers: browserCorsHeaders(origin, true) };
  }
  return { ok: true as const, config, cors_headers: browserCorsHeaders(origin, true) };
}

async function browserEventRequestContext(req: Request, env: Env, receivedAt: string, workspaceId: string) {
  const origin = journeyText(req.headers.get("origin")) || null;
  const referer = journeyText(req.headers.get("referer")) || null;
  const userAgent = journeyText(req.headers.get("user-agent")) || null;
  const ip = journeyText(req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]);
  const salt = journeyText(env.TRACEKIT_BROWSER_IP_HASH_SALT || workspaceId);
  return {
    received_at: receivedAt,
    origin,
    referer_url: safeUrlForDiagnostics(referer),
    user_agent_present: Boolean(userAgent),
    user_agent: userAgent || null,
    ip_hash: ip ? await browserWriteKeyHash("request_ip", `${salt}:${ip}`) : null,
    cf_ray: journeyText(req.headers.get("cf-ray")) || null,
    source: "worker",
  };
}

function checkBrowserEventRateLimit(args: { workspace_id: string; request_hash?: string | null; limit_per_minute: number }) {
  const limit = Math.max(1, Math.min(10000, Math.floor(Number(args.limit_per_minute || 120)) || 120));
  const now = Date.now();
  const windowStart = Math.floor(now / 60000) * 60000;
  const key = `${args.workspace_id}:${args.request_hash || "anonymous"}:${windowStart}`;
  const bucket = browserEventRateLimitBuckets.get(key) || { window_start_ms: windowStart, count: 0 };
  bucket.count += 1;
  browserEventRateLimitBuckets.set(key, bucket);
  if (browserEventRateLimitBuckets.size > 1000) {
    for (const [bucketKey, value] of browserEventRateLimitBuckets) {
      if (value.window_start_ms < windowStart - 60000) browserEventRateLimitBuckets.delete(bucketKey);
    }
  }
  return { ok: bucket.count <= limit, limit, count: bucket.count, reset_at: new Date(windowStart + 60000).toISOString() };
}

function browserSupabaseUniqueViolation(error: any) {
  const text = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
  return error?.code === "23505" || text.includes("duplicate key") || text.includes("browser_events_raw_workspace_event_uidx");
}

async function insertBrowserRawEvent(env: Env, raw: any) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase.from(BROWSER_EVENTS_RAW_TABLE).insert(raw).select("*").single();
  if (!error) return { row: data as BrowserRawEventRow, duplicate: false, conflict: false };
  if (!browserSupabaseUniqueViolation(error)) throw new Error(`Browser raw event insert failed: ${error.message}`);
  const { data: existing, error: lookupError } = await supabase
    .from(BROWSER_EVENTS_RAW_TABLE)
    .select("*")
    .eq("workspace_id", raw.workspace_id)
    .eq("event_id", raw.event_id)
    .maybeSingle();
  if (lookupError) throw new Error(`Browser raw event replay lookup failed: ${lookupError.message}`);
  if (!existing) throw new Error(`Browser raw event replay lookup failed after unique violation.`);
  const conflict = journeyText((existing as any).payload_hash) !== journeyText(raw.payload_hash);
  return { row: existing as BrowserRawEventRow, duplicate: !conflict, conflict };
}

function browserEventNormalizeBatchSize(value: unknown) {
  return Math.max(1, Math.min(BROWSER_EVENT_NORMALIZE_RUNTIME_MAX_BATCH_SIZE, Number(value || BROWSER_EVENT_DEFAULT_BATCH_SIZE)));
}

function createBrowserEventNormalizationProgress(args: { workspace_id: string; from: string; to: string; batch_size: number; cursor?: string | null }, now = new Date().toISOString()) {
  return createConnectorRuntimeProgress({
    workspace_id: args.workspace_id,
    connector_id: BROWSER_EVENTS_CONNECTOR_ID,
    job_type: BROWSER_EVENTS_JOB_TYPE,
    phase: BROWSER_EVENTS_PHASE,
    requested_from: args.from,
    requested_to: args.to,
    now,
    metadata: connectorRuntimeMetadata({
      connector_id: BROWSER_EVENTS_CONNECTOR_ID,
      metadata: {
        batch_size: browserEventNormalizeBatchSize(args.batch_size),
        events_normalized: 0,
        events_duplicate: 0,
        events_invalid: 0,
        events_review: 0,
        people_resolved: 0,
        anonymous_events_retained: 0,
        journey_events_inserted: 0,
        journey_events_already_present: 0,
        journeys_assigned: 0,
        attribution_recalculations: 0,
      },
    }),
  });
}

function browserEventNormalizeTaskPlanForProgress(job: ImportJobRow, progress: ConnectorRuntimeProgress & Record<string, any>): ConnectorRuntimeTaskPlan {
  const batchSize = browserEventNormalizeBatchSize(progress.metadata?.batch_size || progress.batch_size);
  const cursor = journeyText(progress.current_cursor) || null;
  return {
    job_id: job.id,
    workspace_id: progress.workspace_id || "default",
    connector_id: BROWSER_EVENTS_CONNECTOR_ID,
    task_type: BROWSER_EVENT_NORMALIZE_TASK_TYPE,
    phase: BROWSER_EVENTS_PHASE,
    cursor,
    payload: {
      cursor,
      batch_size: batchSize,
    },
    dedupe_key: `browser_event_normalize:${cursor || "start"}:${batchSize}`,
    max_attempts: 5,
  };
}

async function startBrowserEventNormalizationRuntimeJob(env: Env, args: { workspace_id: string; event_time: string; cursor?: string | null; batch_size?: number | null }) {
  if (!env.wowboost_imports) return { queued: false, reason: "queue_not_configured", job_id: null as string | null, task_id: null as string | null };
  const from = browserDateFromTimestamp(args.event_time);
  const to = from;
  const batchSize = browserEventNormalizeBatchSize(args.batch_size);
  let job = await findActiveConnectorRuntimeJob(env, {
    workspace_id: args.workspace_id,
    connector_id: BROWSER_EVENTS_CONNECTOR_ID,
    job_type: BROWSER_EVENTS_JOB_TYPE,
    from,
    to,
    matches: (_job, progress) => browserEventNormalizeBatchSize(progress.metadata?.batch_size || progress.batch_size) === batchSize,
  });
  const now = new Date().toISOString();
  if (!job) {
    const progress = createBrowserEventNormalizationProgress({
      workspace_id: args.workspace_id,
      from,
      to,
      batch_size: batchSize,
      cursor: args.cursor || null,
    }, now);
    progress.status = "queued";
    progress.current_cursor = args.cursor || null;
    job = await createImportJob(env, {
      platform: "browser",
      module: "connector_runtime",
      from,
      to,
      filter: BROWSER_EVENTS_JOB_TYPE,
      workspace_id: args.workspace_id,
      connector_id: BROWSER_EVENTS_CONNECTOR_ID,
      progress,
      status: "queued",
    });
    await updateConnectorRuntimeJobProgress(env, job, progress);
    job = await getImportJob(env, job.id) || job;
  }

  let progress = connectorRuntimeProgressFromJob(job);
  progress = {
    ...progress,
    status: "queued",
    phase: BROWSER_EVENTS_PHASE,
    started_at: progress.started_at || now,
    updated_at: now,
    completed_at: null,
    last_error: null,
    metadata: {
      ...(progress.metadata || {}),
      batch_size: batchSize,
    },
  };
  await updateConnectorRuntimeJobProgress(env, job, progress);
  job = await getImportJob(env, job.id) || job;
  progress = connectorRuntimeProgressFromJob(job);
  const reconciliation = await reconcileConnectorRuntimeJobQueue(env, job, {
    force_republish_queued: true,
    reason: "browser_event_accepted",
  }).catch(() => null);
  const task = await createAndEnqueueConnectorRuntimeTask(env, browserEventNormalizeTaskPlanForProgress(job, progress));
  return { queued: true, reason: null, job_id: job.id, task_id: task.task.id, duplicate_task_prevented: !task.created, queue_reconciliation: reconciliation };
}

function createJourneyBackfillProgress(args: JourneyBackfillRequest, now = new Date().toISOString()) {
  return {
    workspace_id: args.workspace_id,
    connector_id: JOURNEY_EVENTS_CONNECTOR_ID,
    job_type: JOURNEY_EVENTS_BACKFILL_JOB_TYPE,
    phase: JOURNEY_EVENTS_BACKFILL_PHASE,
    status: "running",
    requested_from: args.from,
    requested_to: args.to,
    platforms: args.platforms,
    batch_size: args.batch_size,
    records_discovered: 0,
    records_processed: 0,
    events_inserted: 0,
    events_already_present: 0,
    events_conflicted: 0,
    records_failed: 0,
    current_cursor: args.cursor || null,
    last_error: null,
    started_at: now,
    updated_at: now,
    completed_at: null,
    warnings: [] as string[],
  };
}

async function createJourneyBackfillJob(env: Env, args: JourneyBackfillRequest) {
  const supabase = getSupabase(env);
  const now = new Date().toISOString();
  const progress = createJourneyBackfillProgress(args, now);
  const payload = {
    platform: "journey_events",
    module: "platform_orders",
    status: "running",
    from_date: args.from,
    to_date: args.to,
    filter: JSON.stringify({ platforms: args.platforms }),
    workspace_id: args.workspace_id,
    connector_id: JOURNEY_EVENTS_CONNECTOR_ID,
    job_type: JOURNEY_EVENTS_BACKFILL_JOB_TYPE,
    phase: JOURNEY_EVENTS_BACKFILL_PHASE,
    requested_from: args.from,
    requested_to: args.to,
    records_discovered: 0,
    records_processed: 0,
    records_succeeded: 0,
    records_failed: 0,
    records_skipped: 0,
    current_cursor: args.cursor || null,
    current_page: null,
    last_error: null,
    metadata: {
      platforms: args.platforms,
      batch_size: args.batch_size,
      events_inserted: 0,
      events_already_present: 0,
      events_conflicted: 0,
    },
    progress,
    requested_at: now,
    started_at: now,
    updated_at: now,
    completed_at: null,
  };
  const { data, error } = await supabase.from("integration_import_jobs").insert(payload).select("*").single();
  if (error) throw new Error(`Failed to create journey backfill job: ${error.message}`);
  return data as ImportJobRow;
}

function journeyBackfillRequestFromJob(job: ImportJobRow, fallback: JourneyBackfillRequest): JourneyBackfillRequest {
  const progress = (job.progress || {}) as Record<string, any>;
  const metadata = ((job as any).metadata || {}) as Record<string, any>;
  return {
    workspace_id: journeyText((job as any).workspace_id || progress.workspace_id || fallback.workspace_id) || "default",
    platforms: Array.isArray(progress.platforms) && progress.platforms.length
      ? progress.platforms.map(journeyText).filter(Boolean)
      : Array.isArray(metadata.platforms) && metadata.platforms.length
        ? metadata.platforms.map(journeyText).filter(Boolean)
        : fallback.platforms,
    from: journeyText((job as any).requested_from || progress.requested_from || job.from_date || fallback.from),
    to: journeyText((job as any).requested_to || progress.requested_to || job.to_date || fallback.to),
    batch_size: Math.max(1, Math.min(100, Number(progress.batch_size || metadata.batch_size || fallback.batch_size || 100))),
    cursor: journeyText((job as any).current_cursor || progress.current_cursor || fallback.cursor) || null,
    job_id: job.id,
  };
}

async function queryJourneyBackfillPlatformOrders(env: Env, args: {
  request: JourneyBackfillRequest;
  cursor: string | null;
}) {
  const range = journeyBackfillDateRange(args.request.from, args.request.to);
  if (!range) throw new Error("Invalid journey backfill date range.");
  const supabase = getSupabase(env);
  let cursorState = parseJourneyBackfillCursor(args.cursor, args.request.platforms);

  while (cursorState.current_platform) {
    let query = supabase
      .from("platform_orders")
      .select(JOURNEY_EVENTS_PLATFORM_ORDER_SELECT)
      .eq("workspace_id", args.request.workspace_id)
      .eq("platform", cursorState.current_platform)
      .not("person_id", "is", null)
      .not("platform_order_id", "is", null)
      .gte("order_ts", range.from_ts)
      .lt("order_ts", range.to_exclusive_ts)
      .order("platform_order_id", { ascending: true })
      .limit(args.request.batch_size);

    if (cursorState.platform_order_id) query = query.gt("platform_order_id", cursorState.platform_order_id);
    const { data, error } = await query;
    if (error) throw new Error(`Journey backfill platform_orders scan failed: ${error.message}`);
    const rows = data || [];
    if (rows.length) return { rows, cursorState };

    const nextPlatform = nextJourneyBackfillPlatform(cursorState.current_platform, args.request.platforms);
    if (!nextPlatform) return { rows: [], cursorState };
    cursorState = { current_platform: nextPlatform, platform_order_id: null };
  }

  return { rows: [], cursorState };
}

function mergeJourneyBackfillProgress(
  progress: Record<string, any>,
  args: {
    request: JourneyBackfillRequest;
    batch: JourneyEventBatchResult;
    discovered: number;
    processed: number;
    failed: number;
    next_cursor: string | null;
    has_more: boolean;
    completed: boolean;
  },
) {
  const now = new Date().toISOString();
  return {
    ...progress,
    workspace_id: args.request.workspace_id,
    connector_id: JOURNEY_EVENTS_CONNECTOR_ID,
    job_type: JOURNEY_EVENTS_BACKFILL_JOB_TYPE,
    phase: JOURNEY_EVENTS_BACKFILL_PHASE,
    status: args.completed ? "completed" : "running",
    requested_from: args.request.from,
    requested_to: args.request.to,
    platforms: args.request.platforms,
    batch_size: args.request.batch_size,
    records_discovered: Number(progress.records_discovered || 0) + args.discovered,
    records_processed: Number(progress.records_processed || 0) + args.processed,
    events_inserted: Number(progress.events_inserted || 0) + args.batch.inserted,
    events_already_present: Number(progress.events_already_present || 0) + args.batch.already_present,
    events_conflicted: Number(progress.events_conflicted || 0) + args.batch.conflicted,
    records_failed: Number(progress.records_failed || 0) + args.failed + args.batch.malformed,
    current_cursor: args.next_cursor,
    has_more: args.has_more,
    last_error: args.batch.ok ? null : "One or more journey events were malformed or conflicted.",
    updated_at: now,
    completed_at: args.completed ? now : null,
  };
}

async function runJourneyPlatformOrderBackfill(env: Env, args: JourneyBackfillRequest) {
  const started = Date.now();
  let job: ImportJobRow | null = null;
  if (args.job_id) {
    job = await getImportJob(env, args.job_id);
    if (!job) return { status: 404, body: { ok: false, error: "not_found", message: "Journey backfill job not found." } };
  } else {
    job = await createJourneyBackfillJob(env, args);
  }

  const effective = journeyBackfillRequestFromJob(job, args);
  const progress = ((job.progress || {}) as Record<string, any>) || {};
  const cursor = args.cursor || effective.cursor || null;
  console.log("journey_backfill.started", {
    workspace_id: effective.workspace_id,
    job_id: job.id,
    source_platforms: effective.platforms,
    batch_size: effective.batch_size,
  });
  const { rows, cursorState } = await queryJourneyBackfillPlatformOrders(env, { request: effective, cursor });
  const inputs: JourneyEventInput[] = [];
  let skipped = 0;
  let malformed = 0;
  for (const row of rows as any[]) {
    try {
      const input = mapPlatformOrderToJourneyEvent(row);
      if (input) inputs.push(input);
      else skipped += 1;
    } catch {
      malformed += 1;
    }
  }

  const repo = getJourneyEventRepository(env);
  const batch = await createJourneyEventsBatch(repo, inputs, { max_batch_size: effective.batch_size });
  await publishJourneyPurchaseDomainEvents(env, batch.events, {
    job_id: job.id,
    source: "platform_order_journey_backfill",
  }).catch((error: any) => {
    console.error("[TraceKit] platform order purchase domain event publish failed", {
      workspace_id: effective.workspace_id,
      job_id: job.id,
      message: error?.message || String(error),
    });
  });
  batch.malformed += malformed;
  const lastRow = rows[rows.length - 1] as any;
  const platformCompleted = rows.length < effective.batch_size;
  const nextPlatform = platformCompleted ? nextJourneyBackfillPlatform(cursorState.current_platform, effective.platforms) : cursorState.current_platform;
  const nextCursorState = rows.length
    ? platformCompleted && nextPlatform
      ? { current_platform: nextPlatform, platform_order_id: null }
      : { current_platform: cursorState.current_platform, platform_order_id: journeyText(lastRow?.platform_order_id) || null }
    : null;
  const hasMore = Boolean(nextCursorState && (rows.length >= effective.batch_size || nextCursorState.current_platform));
  const nextCursor = hasMore ? serializeJourneyBackfillCursor(nextCursorState) : null;
  const completed = !hasMore;
  const nextProgress = mergeJourneyBackfillProgress(progress, {
    request: effective,
    batch,
    discovered: rows.length,
    processed: inputs.length + skipped,
    failed: malformed,
    next_cursor: nextCursor,
    has_more: hasMore,
    completed,
  });

  await updateImportJob(env, job.id, {
    status: completed ? "completed" : "running",
    phase: JOURNEY_EVENTS_BACKFILL_PHASE,
    current_cursor: nextCursor,
    records_discovered: nextProgress.records_discovered,
    records_processed: nextProgress.records_processed,
    records_succeeded: nextProgress.events_inserted + nextProgress.events_already_present,
    records_failed: nextProgress.records_failed,
    records_skipped: Number(progress.records_skipped || 0) + skipped,
    last_error: nextProgress.last_error,
    metadata: {
      platforms: effective.platforms,
      batch_size: effective.batch_size,
      events_inserted: nextProgress.events_inserted,
      events_already_present: nextProgress.events_already_present,
      events_conflicted: nextProgress.events_conflicted,
      malformed_records: nextProgress.records_failed,
      skipped_records: Number(progress.records_skipped || 0) + skipped,
    },
    progress: nextProgress,
    completed_at: completed ? nextProgress.completed_at : null,
  });

  console.log("journey_backfill.batch_completed", {
    workspace_id: effective.workspace_id,
    job_id: job.id,
    source_platforms: effective.platforms,
    inserted_count: batch.inserted,
    duplicate_count: batch.already_present,
    conflict_count: batch.conflicted,
    duration_ms: Date.now() - started,
  });
  if (completed) {
    console.log("journey_backfill.completed", {
      workspace_id: effective.workspace_id,
      job_id: job.id,
      source_platforms: effective.platforms,
      records_processed: nextProgress.records_processed,
      events_inserted: nextProgress.events_inserted,
      duplicate_count: nextProgress.events_already_present,
      conflict_count: nextProgress.events_conflicted,
      duration_ms: Date.now() - started,
    });
  }

  return {
    status: 200,
    body: {
      ok: batch.ok,
      job_id: job.id,
      status: completed ? "completed" : "running",
      workspace_id: effective.workspace_id,
      from: effective.from,
      to: effective.to,
      platforms: effective.platforms,
      records_discovered: rows.length,
      records_processed: inputs.length + skipped,
      events_inserted: batch.inserted,
      events_already_present: batch.already_present,
      events_conflicted: batch.conflicted,
      records_failed: batch.malformed,
      skipped,
      has_more: hasMore,
      next_cursor: nextCursor,
      progress: nextProgress,
      conflicts: batch.conflicts.slice(0, 10),
      errors: batch.errors.slice(0, 10),
    },
  };
}

function createJourneyAssignmentProgress(args: JourneyAssignmentBackfillRequest, now = new Date().toISOString()) {
  return {
    workspace_id: args.workspace_id,
    connector_id: JOURNEY_ENGINE_CONNECTOR_ID,
    job_type: JOURNEY_ENGINE_JOB_TYPE,
    phase: JOURNEY_ENGINE_PHASE,
    status: "running",
    requested_from: args.from,
    requested_to: args.to,
    batch_size: args.batch_size,
    timeout_seconds: args.timeout_seconds,
    events_scanned: 0,
    journeys_created: 0,
    events_linked: 0,
    events_skipped: 0,
    records_failed: 0,
    current_cursor: args.cursor || null,
    last_error: null,
    started_at: now,
    updated_at: now,
    completed_at: null,
    warnings: [] as string[],
  };
}

async function createJourneyAssignmentJob(env: Env, args: JourneyAssignmentBackfillRequest) {
  const supabase = getSupabase(env);
  const now = new Date().toISOString();
  const progress = createJourneyAssignmentProgress(args, now);
  const payload = {
    platform: "journeys",
    module: "journey_events",
    status: "running",
    from_date: args.from,
    to_date: args.to,
    filter: JSON.stringify({ timeout_seconds: args.timeout_seconds }),
    workspace_id: args.workspace_id,
    connector_id: JOURNEY_ENGINE_CONNECTOR_ID,
    job_type: JOURNEY_ENGINE_JOB_TYPE,
    phase: JOURNEY_ENGINE_PHASE,
    requested_from: args.from,
    requested_to: args.to,
    records_discovered: 0,
    records_processed: 0,
    records_succeeded: 0,
    records_failed: 0,
    records_skipped: 0,
    current_cursor: args.cursor || null,
    current_page: null,
    last_error: null,
    metadata: {
      batch_size: args.batch_size,
      timeout_seconds: args.timeout_seconds,
      journeys_created: 0,
      events_linked: 0,
      events_skipped: 0,
    },
    progress,
    requested_at: now,
    started_at: now,
    updated_at: now,
    completed_at: null,
  };
  const { data, error } = await supabase.from("integration_import_jobs").insert(payload).select("*").single();
  if (error) throw new Error(`Failed to create journey assignment job: ${error.message}`);
  return data as ImportJobRow;
}

function journeyAssignmentRequestFromJob(job: ImportJobRow, fallback: JourneyAssignmentBackfillRequest): JourneyAssignmentBackfillRequest {
  const progress = (job.progress || {}) as Record<string, any>;
  const metadata = ((job as any).metadata || {}) as Record<string, any>;
  return {
    workspace_id: journeyText((job as any).workspace_id || progress.workspace_id || fallback.workspace_id) || "default",
    from: journeyText((job as any).requested_from || progress.requested_from || job.from_date || fallback.from),
    to: journeyText((job as any).requested_to || progress.requested_to || job.to_date || fallback.to),
    batch_size: Math.max(1, Math.min(JOURNEY_ASSIGNMENT_MAX_BATCH_SIZE, Number(progress.batch_size || metadata.batch_size || fallback.batch_size || JOURNEY_ASSIGNMENT_MAX_BATCH_SIZE))),
    cursor: journeyText((job as any).current_cursor || progress.current_cursor || fallback.cursor) || null,
    job_id: job.id,
    timeout_seconds: Math.max(60, Math.min(365 * 24 * 60 * 60, Number(progress.timeout_seconds || metadata.timeout_seconds || fallback.timeout_seconds))),
  };
}

function mergeJourneyAssignmentProgress(
  progress: Record<string, any>,
  args: {
    request: JourneyAssignmentBackfillRequest;
    batch: JourneyAssignmentBackfillResult;
    next_cursor: string | null;
    has_more: boolean;
    completed: boolean;
  },
) {
  const now = new Date().toISOString();
  return {
    ...progress,
    workspace_id: args.request.workspace_id,
    connector_id: JOURNEY_ENGINE_CONNECTOR_ID,
    job_type: JOURNEY_ENGINE_JOB_TYPE,
    phase: JOURNEY_ENGINE_PHASE,
    status: args.completed ? (args.batch.ok ? "completed" : "completed_with_errors") : "running",
    requested_from: args.request.from,
    requested_to: args.request.to,
    batch_size: args.request.batch_size,
    timeout_seconds: args.request.timeout_seconds,
    events_scanned: Number(progress.events_scanned || 0) + args.batch.events_scanned,
    journeys_created: Number(progress.journeys_created || 0) + args.batch.journeys_created,
    events_linked: Number(progress.events_linked || 0) + args.batch.events_linked,
    events_skipped: Number(progress.events_skipped || 0) + args.batch.events_skipped,
    records_failed: Number(progress.records_failed || 0) + args.batch.records_failed,
    current_cursor: args.next_cursor,
    has_more: args.has_more,
    last_error: args.batch.ok ? null : "One or more journey events failed assignment.",
    updated_at: now,
    completed_at: args.completed ? now : null,
  };
}

async function runJourneyAssignmentBackfill(env: Env, args: JourneyAssignmentBackfillRequest) {
  const started = Date.now();
  let job: ImportJobRow | null = null;
  if (args.job_id) {
    job = await getImportJob(env, args.job_id);
    if (!job) return { status: 404, body: { ok: false, error: "not_found", message: "Journey assignment job not found." } };
  } else {
    job = await createJourneyAssignmentJob(env, args);
  }

  const effective = journeyAssignmentRequestFromJob(job, args);
  const progress = ((job.progress || {}) as Record<string, any>) || {};
  const range = journeyBackfillDateRange(effective.from, effective.to);
  if (!range) return { status: 400, body: { ok: false, error: "bad_request", message: "Invalid journey assignment date range." } };
  const cursor = args.cursor || effective.cursor || null;
  const decodedCursor = decodeJourneyAssignmentBackfillCursor(cursor);
  const repo = getJourneyRepository(env);

  console.log("journey.backfill.started", {
    workspace_id: effective.workspace_id,
    job_id: job.id,
    batch_size: effective.batch_size,
    timeout_seconds: effective.timeout_seconds,
  });

  const rows = await repo.queryUnassignedJourneyEvents({
    workspace_id: effective.workspace_id,
    from_ts: range.from_ts,
    to_exclusive_ts: range.to_exclusive_ts,
    cursor: decodedCursor,
    limit: effective.batch_size + 1,
  });
  const batchRows = rows.slice(0, effective.batch_size);
  const assignment = await assignJourneyEvents(repo, batchRows, {
    timeout_seconds: effective.timeout_seconds,
  });
  const lastRow = batchRows[batchRows.length - 1] as any;
  const hasMore = rows.length > effective.batch_size;
  const nextCursor = hasMore && lastRow
    ? serializeJourneyAssignmentBackfillCursor({
      person_id: journeyText(lastRow.person_id),
      event_time: new Date(Date.parse(String(lastRow.event_time))).toISOString(),
      id: journeyText(lastRow.id),
    })
    : null;
  const completed = !hasMore;
  const nextProgress = mergeJourneyAssignmentProgress(progress, {
    request: effective,
    batch: { ...assignment, has_more: hasMore, next_cursor: nextCursor },
    next_cursor: nextCursor,
    has_more: hasMore,
    completed,
  });
  const status = completed ? (assignment.ok ? "completed" : "completed_with_errors") : "running";

  await updateImportJob(env, job.id, {
    status,
    phase: JOURNEY_ENGINE_PHASE,
    current_cursor: nextCursor,
    records_discovered: nextProgress.events_scanned,
    records_processed: nextProgress.events_scanned,
    records_succeeded: nextProgress.events_linked,
    records_failed: nextProgress.records_failed,
    records_skipped: nextProgress.events_skipped,
    last_error: nextProgress.last_error,
    metadata: {
      batch_size: effective.batch_size,
      timeout_seconds: effective.timeout_seconds,
      journeys_created: nextProgress.journeys_created,
      events_linked: nextProgress.events_linked,
      events_skipped: nextProgress.events_skipped,
      records_failed: nextProgress.records_failed,
    },
    progress: nextProgress,
    completed_at: completed ? nextProgress.completed_at : null,
  });

  console.log("journey.assignment.completed", {
    workspace_id: effective.workspace_id,
    job_id: job.id,
    events_processed: assignment.events_scanned,
    journeys_created: assignment.journeys_created,
    events_linked: assignment.events_linked,
    duration_ms: Date.now() - started,
  });
  if (completed) {
    console.log("journey.backfill.completed", {
      workspace_id: effective.workspace_id,
      job_id: job.id,
      events_processed: nextProgress.events_scanned,
      journeys_created: nextProgress.journeys_created,
      duration_ms: Date.now() - started,
    });
  }

  return {
    status: 200,
    body: {
      ok: assignment.ok,
      job_id: job.id,
      status,
      workspace_id: effective.workspace_id,
      from: effective.from,
      to: effective.to,
      timeout_seconds: effective.timeout_seconds,
      events_scanned: assignment.events_scanned,
      journeys_created: assignment.journeys_created,
      events_linked: assignment.events_linked,
      events_skipped: assignment.events_skipped,
      records_failed: assignment.records_failed,
      has_more: hasMore,
      next_cursor: nextCursor,
      progress: nextProgress,
      errors: assignment.errors.slice(0, 10),
    },
  };
}

async function executeJourneyAssignmentRuntimeTask(env: Env, job: ImportJobRow, task: ConnectorImportTaskRow) {
  const progress = connectorRuntimeProgressFromJob(job);
  const request = journeyAssignmentRequestFromJob(job, {
    workspace_id: progress.workspace_id || "default",
    from: progress.requested_from || job.from_date,
    to: progress.requested_to || job.to_date,
    batch_size: Math.max(1, Math.min(JOURNEY_ASSIGNMENT_MAX_BATCH_SIZE, Number(progress.metadata?.batch_size || progress.batch_size || JOURNEY_ASSIGNMENT_MAX_BATCH_SIZE))),
    cursor: journeyText(task.payload?.cursor || task.cursor || progress.current_cursor) || null,
    job_id: job.id,
    timeout_seconds: Number(progress.metadata?.timeout_seconds || progress.timeout_seconds || JOURNEY_DEFAULT_TIMEOUT_SECONDS),
  });
  const cursor = journeyText(task.payload?.cursor || task.cursor || request.cursor) || null;
  const result = await runJourneyAssignmentBackfill(env, {
    ...request,
    cursor,
    job_id: job.id,
  });
  if (result.status >= 400 || result.body?.ok === false) {
    throw new Error(result.body?.message || result.body?.error || "Journey assignment runtime batch failed.");
  }

  const refreshedJob = await getImportJob(env, job.id);
  const refreshedProgress = refreshedJob ? connectorRuntimeProgressFromJob(refreshedJob) : connectorRuntimeProgressFromJob(job);
  let nextTaskId: string | null = null;
  let duplicateTaskPrevented = false;
  if (result.body?.has_more && refreshedJob && !isTerminalConnectorRuntimeJobStatus(refreshedProgress.status)) {
    const nextTask = await createAndEnqueueConnectorRuntimeTask(env, journeyAssignmentRuntimeTaskPlanForProgress(refreshedJob, refreshedProgress));
    nextTaskId = nextTask.task.id;
    duplicateTaskPrevented = !nextTask.created;
  }

  return {
    ok: true,
    job_id: job.id,
    task_id: task.id,
    status: result.body?.status || refreshedProgress.status,
    phase: JOURNEY_ENGINE_PHASE,
    events_scanned: Number(result.body?.events_scanned || 0),
    journeys_created: Number(result.body?.journeys_created || 0),
    events_linked: Number(result.body?.events_linked || 0),
    events_skipped: Number(result.body?.events_skipped || 0),
    records_failed: Number(result.body?.records_failed || 0),
    has_more: Boolean(result.body?.has_more),
    next_cursor: result.body?.next_cursor || null,
    next_task_id: nextTaskId,
    duplicate_task_prevented: duplicateTaskPrevented,
  };
}

function createAttributionBackfillProgress(args: AttributionBackfillRequest, now = new Date().toISOString()) {
  return {
    workspace_id: args.workspace_id,
    connector_id: ATTRIBUTION_BACKFILL_CONNECTOR_ID,
    job_type: ATTRIBUTION_BACKFILL_JOB_TYPE,
    phase: ATTRIBUTION_BACKFILL_PHASE,
    status: "running",
    requested_from: args.from,
    requested_to: args.to,
    models: args.models,
    platforms: args.platforms,
    batch_size: args.batch_size,
    journey_batch_size: args.batch_size,
    force_recalculate: args.force_recalculate,
    records_discovered: 0,
    records_processed: 0,
    records_succeeded: 0,
    journeys_discovered: 0,
    journeys_processed: 0,
    conversions_discovered: 0,
    conversions_attributed_first_touch: 0,
    conversions_attributed_last_touch: 0,
    conversions_unattributed: 0,
    credits_inserted: 0,
    credits_replaced: 0,
    credits_already_current: 0,
    records_failed: 0,
    transient_retries: 0,
    current_cursor: args.cursor || null,
    has_more: false,
    last_error: null,
    errors: [] as Array<{ journey_id: string | null; message: string }>,
    warnings: [] as string[],
    started_at: now,
    updated_at: now,
    completed_at: null,
  };
}

async function createAttributionBackfillJob(env: Env, args: AttributionBackfillRequest) {
  const supabase = getSupabase(env);
  const now = new Date().toISOString();
  const progress = createAttributionBackfillProgress(args, now);
  const payload = {
    platform: "attribution",
    module: "journeys",
    status: "running",
    from_date: args.from,
    to_date: args.to,
    filter: JSON.stringify({ models: args.models, platforms: args.platforms, force_recalculate: args.force_recalculate }),
    workspace_id: args.workspace_id,
    connector_id: ATTRIBUTION_BACKFILL_CONNECTOR_ID,
    job_type: ATTRIBUTION_BACKFILL_JOB_TYPE,
    phase: ATTRIBUTION_BACKFILL_PHASE,
    requested_from: args.from,
    requested_to: args.to,
    records_discovered: 0,
    records_processed: 0,
    records_succeeded: 0,
    records_failed: 0,
    records_skipped: 0,
    current_cursor: args.cursor || null,
    current_page: null,
    last_error: null,
    metadata: {
      models: args.models,
      platforms: args.platforms,
      batch_size: args.batch_size,
      journey_batch_size: args.batch_size,
      force_recalculate: args.force_recalculate,
      conversions_discovered: 0,
      conversions_attributed_first_touch: 0,
      conversions_attributed_last_touch: 0,
      conversions_unattributed: 0,
      credits_inserted: 0,
      credits_replaced: 0,
      credits_already_current: 0,
    },
    progress,
    requested_at: now,
    started_at: now,
    updated_at: now,
    completed_at: null,
  };
  const { data, error } = await supabase.from("integration_import_jobs").insert(payload).select("*").single();
  if (error) throw new Error(`Failed to create attribution backfill job: ${error.message}`);
  return data as ImportJobRow;
}

function attributionBackfillRequestFromJob(job: ImportJobRow, fallback: AttributionBackfillRequest): AttributionBackfillRequest {
  const progress = (job.progress || {}) as Record<string, any>;
  const metadata = ((job as any).metadata || {}) as Record<string, any>;
  const progressModels = Array.isArray(progress.models) ? progress.models : [];
  const metadataModels = Array.isArray(metadata.models) ? metadata.models : [];
  const progressPlatforms = Array.isArray(progress.platforms) ? progress.platforms : [];
  const metadataPlatforms = Array.isArray(metadata.platforms) ? metadata.platforms : [];
  return {
    workspace_id: journeyText((job as any).workspace_id || progress.workspace_id || fallback.workspace_id) || "default",
    models: progressModels.length
      ? progressModels
      : metadataModels.length
        ? metadataModels
        : fallback.models,
    platforms: progressPlatforms.length
      ? progressPlatforms.map(journeyText).filter(Boolean)
      : metadataPlatforms.length
        ? metadataPlatforms.map(journeyText).filter(Boolean)
        : fallback.platforms,
    from: journeyText((job as any).requested_from || progress.requested_from || job.from_date || fallback.from),
    to: journeyText((job as any).requested_to || progress.requested_to || job.to_date || fallback.to),
    batch_size: attributionJourneyBatchSize(progress.journey_batch_size || metadata.journey_batch_size || progress.batch_size || metadata.batch_size || fallback.batch_size),
    cursor: journeyText((job as any).current_cursor || progress.current_cursor || fallback.cursor) || null,
    job_id: job.id,
    force_recalculate: Boolean(progress.force_recalculate ?? metadata.force_recalculate ?? fallback.force_recalculate),
  } as AttributionBackfillRequest;
}

function mergeAttributionBackfillProgress(
  progress: Record<string, any>,
  args: {
    request: AttributionBackfillRequest;
    batch: AttributionBackfillBatchResult;
    next_cursor: string | null;
    has_more: boolean;
    completed: boolean;
  },
) {
  const now = new Date().toISOString();
  const previousErrors = Array.isArray(progress.errors) ? progress.errors : [];
  const metadata = ((progress.metadata || {}) as Record<string, any>) || {};
  const errors = [
    ...previousErrors,
    ...args.batch.errors,
  ].slice(-20);
  return {
    ...progress,
    workspace_id: args.request.workspace_id,
    connector_id: ATTRIBUTION_BACKFILL_CONNECTOR_ID,
    job_type: ATTRIBUTION_BACKFILL_JOB_TYPE,
    phase: ATTRIBUTION_BACKFILL_PHASE,
    status: args.completed ? (args.batch.ok ? "completed" : "completed_with_errors") : "running",
    requested_from: args.request.from,
    requested_to: args.request.to,
    models: args.request.models,
    platforms: args.request.platforms,
    batch_size: args.request.batch_size,
    journey_batch_size: args.request.batch_size,
    force_recalculate: args.request.force_recalculate,
    records_discovered: Number(progress.records_discovered || 0) + args.batch.journeys_discovered,
    records_processed: Number(progress.records_processed || 0) + args.batch.journeys_processed,
    records_succeeded: Number(progress.records_succeeded || 0) + args.batch.credits_inserted + args.batch.credits_already_current,
    records_skipped: Number(progress.records_skipped || 0),
    retries: Number(progress.retries || 0),
    transient_retries: Number(progress.transient_retries || metadata.transient_retries || progress.retries || 0),
    journeys_discovered: Number(progress.journeys_discovered || 0) + args.batch.journeys_discovered,
    journeys_processed: Number(progress.journeys_processed || 0) + args.batch.journeys_processed,
    conversions_discovered: Number(progress.conversions_discovered || 0) + args.batch.conversions_discovered,
    conversions_attributed_first_touch: Number(progress.conversions_attributed_first_touch || 0) + args.batch.conversions_attributed_first_touch,
    conversions_attributed_last_touch: Number(progress.conversions_attributed_last_touch || 0) + args.batch.conversions_attributed_last_touch,
    conversions_unattributed: Number(progress.conversions_unattributed || 0) + args.batch.conversions_unattributed,
    credits_inserted: Number(progress.credits_inserted || 0) + args.batch.credits_inserted,
    credits_replaced: Number(progress.credits_replaced || 0) + args.batch.credits_replaced,
    credits_already_current: Number(progress.credits_already_current || 0) + args.batch.credits_already_current,
    records_failed: Number(progress.records_failed || 0) + args.batch.records_failed,
    current_cursor: args.next_cursor,
    has_more: args.has_more,
    errors,
    last_error: args.batch.ok ? null : "One or more journeys failed attribution calculation.",
    updated_at: now,
    completed_at: args.completed ? now : null,
  };
}

async function runAttributionBackfill(env: Env, args: AttributionBackfillRequest) {
  const started = Date.now();
  let job: ImportJobRow | null = null;
  if (args.job_id) {
    job = await getImportJob(env, args.job_id);
    if (!job) return { status: 404, body: { ok: false, error: "not_found", message: "Attribution backfill job not found." } };
  } else {
    job = await createAttributionBackfillJob(env, args);
  }

  const effective = attributionBackfillRequestFromJob(job, args);
  const progress = ((job.progress || {}) as Record<string, any>) || {};
  const range = journeyBackfillDateRange(effective.from, effective.to);
  if (!range) return { status: 400, body: { ok: false, error: "bad_request", message: "Invalid attribution backfill date range." } };
  const cursor = args.cursor || effective.cursor || null;
  const decodedCursor = decodeJourneyListCursor(cursor);
  const repo = getAttributionRepository(env);

  console.log("attribution.backfill.started", {
    workspace_id: effective.workspace_id,
    job_id: job.id,
    models: effective.models,
    platforms: effective.platforms,
    batch_size: effective.batch_size,
    model_version: "v1",
  });

  const rows = await repo.queryBackfillJourneys({
    workspace_id: effective.workspace_id,
    from_ts: range.from_ts,
    to_exclusive_ts: range.to_exclusive_ts,
    cursor: decodedCursor,
    limit: effective.batch_size + 1,
  });
  const batchRows = rows.slice(0, effective.batch_size) as JourneyRow[];
  const publishAttributionDomainEvent = domainEventPublisher(env);
  const batch = await processAttributionBackfillJourneys(repo, batchRows, effective, {
    on_domain_event: async (event) => {
      await publishAttributionDomainEvent({
        ...event,
        source: {
          ...event.source,
          ingestionId: job.id,
        },
      });
    },
  });
  const lastRow = batchRows[batchRows.length - 1] as JourneyRow | undefined;
  const hasMore = rows.length > effective.batch_size;
  const nextCursor = hasMore && lastRow
    ? encodeJourneyListCursor({
      started_at: new Date(Date.parse(String(lastRow.started_at))).toISOString(),
      id: journeyText(lastRow.id),
    })
    : null;
  const completed = !hasMore;
  const nextProgress = mergeAttributionBackfillProgress(progress, {
    request: effective,
    batch,
    next_cursor: nextCursor,
    has_more: hasMore,
    completed,
  });
  const status = completed ? (batch.ok ? "completed" : "completed_with_errors") : "running";

  await updateImportJob(env, job.id, {
    status,
    phase: ATTRIBUTION_BACKFILL_PHASE,
    current_cursor: nextCursor,
    records_discovered: nextProgress.journeys_discovered,
    records_processed: nextProgress.journeys_processed,
    records_succeeded: nextProgress.credits_inserted + nextProgress.credits_already_current,
    records_failed: nextProgress.records_failed,
    records_skipped: 0,
    last_error: nextProgress.last_error,
    metadata: {
      models: effective.models,
      platforms: effective.platforms,
      batch_size: effective.batch_size,
      force_recalculate: effective.force_recalculate,
      conversions_discovered: nextProgress.conversions_discovered,
      conversions_attributed_first_touch: nextProgress.conversions_attributed_first_touch,
      conversions_attributed_last_touch: nextProgress.conversions_attributed_last_touch,
      conversions_unattributed: nextProgress.conversions_unattributed,
      credits_inserted: nextProgress.credits_inserted,
      credits_replaced: nextProgress.credits_replaced,
      credits_already_current: nextProgress.credits_already_current,
      transient_retries: nextProgress.transient_retries,
    },
    progress: nextProgress,
    completed_at: completed ? nextProgress.completed_at : null,
  });

  console.log("attribution.backfill.batch_completed", {
    workspace_id: effective.workspace_id,
    job_id: job.id,
    models: effective.models,
    journeys_processed: batch.journeys_processed,
    conversions_discovered: batch.conversions_discovered,
    credits_inserted: batch.credits_inserted,
    credits_replaced: batch.credits_replaced,
    duration_ms: Date.now() - started,
  });
  if (completed) {
    console.log("attribution.backfill.completed", {
      workspace_id: effective.workspace_id,
      job_id: job.id,
      models: effective.models,
      journeys_processed: nextProgress.journeys_processed,
      conversions_discovered: nextProgress.conversions_discovered,
      credits_inserted: nextProgress.credits_inserted,
      credits_replaced: nextProgress.credits_replaced,
      duration_ms: Date.now() - started,
    });
  }

  return {
    status: 200,
    body: {
      ok: batch.ok,
      job_id: job.id,
      status,
      workspace_id: effective.workspace_id,
      from: effective.from,
      to: effective.to,
      models: effective.models,
      platforms: effective.platforms,
      journeys_discovered: batch.journeys_discovered,
      journeys_processed: batch.journeys_processed,
      conversions_discovered: batch.conversions_discovered,
      conversions_attributed_first_touch: batch.conversions_attributed_first_touch,
      conversions_attributed_last_touch: batch.conversions_attributed_last_touch,
      conversions_unattributed: batch.conversions_unattributed,
      credits_inserted: batch.credits_inserted,
      credits_replaced: batch.credits_replaced,
      credits_already_current: batch.credits_already_current,
      records_failed: batch.records_failed,
      has_more: hasMore,
      next_cursor: nextCursor,
      progress: nextProgress,
      errors: batch.errors.slice(0, 10),
    },
  };
}

function attributionRuntimeArrayKey(values: unknown[]) {
  return values.map((value) => journeyText(value).toLowerCase()).filter(Boolean).sort().join(",");
}

function attributionJourneyBatchSize(value: unknown, fallback = ATTRIBUTION_BACKFILL_DEFAULT_JOURNEY_BATCH_SIZE) {
  return Math.max(1, Math.min(ATTRIBUTION_BACKFILL_MAX_JOURNEY_BATCH_SIZE, Number(value || fallback) || fallback));
}

function attributionRuntimeConfigMatches(progress: ConnectorRuntimeProgress & Record<string, any>, args: AttributionBackfillRequest & { batch_size: number }) {
  const metadata = (progress.metadata || {}) as Record<string, any>;
  const progressModels = Array.isArray(progress.models) ? progress.models : Array.isArray(metadata.models) ? metadata.models : [];
  const progressPlatforms = Array.isArray(progress.platforms) ? progress.platforms : Array.isArray(metadata.platforms) ? metadata.platforms : [];
  return (
    attributionRuntimeArrayKey(progressModels) === attributionRuntimeArrayKey(args.models)
    && attributionRuntimeArrayKey(progressPlatforms) === attributionRuntimeArrayKey(args.platforms)
    && attributionJourneyBatchSize(metadata.journey_batch_size || metadata.batch_size || progress.journey_batch_size || progress.batch_size) === Number(args.batch_size)
    && Boolean(metadata.force_recalculate ?? progress.force_recalculate) === Boolean(args.force_recalculate)
  );
}

async function executeAttributionBackfillRuntimeTask(env: Env, job: ImportJobRow, task: ConnectorImportTaskRow) {
  const progress = connectorRuntimeProgressFromJob(job);
  const metadata = (progress.metadata || {}) as Record<string, any>;
  const models = Array.isArray(metadata.models) ? metadata.models : Array.isArray((progress as any).models) ? (progress as any).models : [];
  const platforms = Array.isArray(metadata.platforms) ? metadata.platforms : Array.isArray((progress as any).platforms) ? (progress as any).platforms : [];
  const batchSize = attributionJourneyBatchSize(task.payload?.journey_batch_size || task.payload?.batch_size || metadata.journey_batch_size || metadata.batch_size || (progress as any).journey_batch_size || (progress as any).batch_size);
  const request = attributionBackfillRequestFromJob(job, {
    workspace_id: progress.workspace_id || "default",
    from: progress.requested_from || job.from_date,
    to: progress.requested_to || job.to_date,
    models: models.length ? models as any : ["first_touch", "last_touch"],
    platforms,
    batch_size: batchSize,
    cursor: journeyText(task.payload?.cursor || task.cursor || progress.current_cursor) || null,
    job_id: job.id,
    force_recalculate: Boolean(task.payload?.force_recalculate ?? metadata.force_recalculate ?? (progress as any).force_recalculate),
  });
  const cursor = journeyText(task.payload?.cursor || task.cursor || request.cursor) || null;
  const result = await runAttributionBackfill(env, {
    ...request,
    batch_size: batchSize,
    cursor,
    job_id: job.id,
  });
  if (result.status >= 400) {
    throw new Error(result.body?.message || result.body?.error || "Attribution runtime batch failed.");
  }

  const refreshedJob = await getImportJob(env, job.id);
  const refreshedProgress = refreshedJob ? connectorRuntimeProgressFromJob(refreshedJob) : connectorRuntimeProgressFromJob(job);
  let nextTaskId: string | null = null;
  let duplicateTaskPrevented = false;
  if (result.body?.has_more && refreshedJob && !isTerminalConnectorRuntimeJobStatus(refreshedProgress.status)) {
    const nextTask = await createAndEnqueueConnectorRuntimeTask(env, attributionBackfillRuntimeTaskPlanForProgress(refreshedJob, refreshedProgress));
    nextTaskId = nextTask.task.id;
    duplicateTaskPrevented = !nextTask.created;
  }

  return {
    ok: result.body?.ok !== false,
    job_id: job.id,
    task_id: task.id,
    status: result.body?.status || refreshedProgress.status,
    phase: ATTRIBUTION_BACKFILL_PHASE,
    journeys_discovered: Number(result.body?.journeys_discovered || 0),
    journeys_processed: Number(result.body?.journeys_processed || 0),
    conversions_discovered: Number(result.body?.conversions_discovered || 0),
    conversions_attributed_first_touch: Number(result.body?.conversions_attributed_first_touch || 0),
    conversions_attributed_last_touch: Number(result.body?.conversions_attributed_last_touch || 0),
    conversions_unattributed: Number(result.body?.conversions_unattributed || 0),
    credits_inserted: Number(result.body?.credits_inserted || 0),
    credits_replaced: Number(result.body?.credits_replaced || 0),
    credits_already_current: Number(result.body?.credits_already_current || 0),
    records_failed: Number(result.body?.records_failed || 0),
    has_more: Boolean(result.body?.has_more),
    next_cursor: result.body?.next_cursor || null,
    next_task_id: nextTaskId,
    duplicate_task_prevented: duplicateTaskPrevented,
  };
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
  const deployedAt = String(env.TRACEKIT_DEPLOYED_AT || "").trim();
  const environment = String(env.TRACEKIT_ENVIRONMENT || env.CF_PAGES_BRANCH || "").trim();
  return {
    service: TRACEKIT_SERVICE_NAME,
    build_label: String(env.TRACEKIT_BUILD_LABEL || TRACEKIT_BUILD_LABEL).trim() || TRACEKIT_BUILD_LABEL,
    build_version: String(env.TRACEKIT_BUILD_VERSION || TRACEKIT_BUILD_VERSION).trim() || TRACEKIT_BUILD_VERSION,
    git_commit: gitCommit || null,
    environment: environment || null,
    deployed_at: deployedAt || null,
    identity_service_v1: true,
  };
}

function domainEventPublisher(env: Env) {
  const supabase = getSupabase(env);
  return async (event: any) => {
    await publishDomainEvent(supabase, event);
  };
}

function domainEventOutboxPublisher(env: Env) {
  const supabase = getSupabase(env);
  return async (event: any) => {
    await publishDomainEventOutbox(supabase, event);
  };
}

async function publishJourneyPurchaseDomainEvents(env: Env, events: any[], args: { job_id?: string | null; source?: string; project_inline?: boolean } = {}) {
  const publisher = args.project_inline === false ? domainEventOutboxPublisher(env) : domainEventPublisher(env);
  let published = 0;
  for (const event of events || []) {
    const domainEvents = [
      ...buildPurchaseDomainEventsFromJourneyEvent(event),
      buildAttributionPendingDomainEventFromJourneyEvent(event),
      buildFinancialAdjustmentDomainEventFromJourneyEvent(event),
    ].filter(Boolean) as any[];
    for (const domainEvent of domainEvents) {
      await publisher({
        ...domainEvent,
        source: {
          ...domainEvent.source,
          ingestionId: args.job_id || domainEvent.source.ingestionId,
        },
        payload: {
          ...(domainEvent.payload || {}),
          producer: args.source || "journey_event_persistence",
        },
      });
      published += 1;
    }
  }
  if (published) {
    console.log("[TraceKit] journey purchase domain events published", {
      job_id: args.job_id || null,
      source: args.source || "journey_event_persistence",
      events_published: published,
    });
  }
  return published;
}

async function publishConnectorRuntimeIncidentEvent(env: Env, args: {
  workspace_id?: unknown;
  connector_id?: unknown;
  connector_type?: unknown;
  status?: "failed" | "recovered";
  error_category?: unknown;
  safe_summary?: unknown;
  affected_record_count?: unknown;
  job_id?: unknown;
  task_id?: unknown;
  occurred_at?: unknown;
}) {
  const event = buildConnectorIncidentDomainEvent(args);
  if (!event) return null;
  try {
    return await publishDomainEvent(getSupabase(env), event);
  } catch (error: any) {
    console.error("[TraceKit] connector incident domain event publish failed", {
      workspace_id: event.workspaceId,
      connector_id: args.connector_id || null,
      task_id: args.task_id || null,
      status: args.status || "failed",
      message: error?.message || String(error),
    });
    return null;
  }
}

async function publishReconciliationDomainEvent(env: Env, args: Parameters<typeof buildReconciliationDomainEvent>[0]) {
  const event = buildReconciliationDomainEvent(args);
  if (!event) return null;
  try {
    return await publishDomainEvent(getSupabase(env), event);
  } catch (error: any) {
    console.error("[TraceKit] reconciliation domain event publish failed", {
      workspace_id: event.workspaceId,
      type: event.type,
      subject_id: event.subject.id,
      message: error?.message || String(error),
    });
    return null;
  }
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

type WowBoostIdentityAttachCounters = {
  input_rows: number;
  unique_emails: number;
  unique_order_or_external_ids: number;
  lookup_batches: number;
  lookup_calls: number;
  database_api_lookup_calls: number;
  external_operations: number;
  fetch_calls: number;
  supabase_rest_calls: number;
  database_helper_calls: number;
  service_binding_calls: number;
  per_row_lookup_helper_calls: number;
  matched_identities: number;
  unmatched_identities: number;
  errors: number;
  elapsed_ms: number;
};

function createWowBoostIdentityAttachCounters(): WowBoostIdentityAttachCounters {
  return {
    input_rows: 0,
    unique_emails: 0,
    unique_order_or_external_ids: 0,
    lookup_batches: 0,
    lookup_calls: 0,
    database_api_lookup_calls: 0,
    external_operations: 0,
    fetch_calls: 0,
    supabase_rest_calls: 0,
    database_helper_calls: 0,
    service_binding_calls: 0,
    per_row_lookup_helper_calls: 0,
    matched_identities: 0,
    unmatched_identities: 0,
    errors: 0,
    elapsed_ms: 0,
  };
}

async function attachIdentityToWowBoostPlatformRows(
  env: Env,
  rows: any[],
  args: {
    workspace_id?: string | null;
    connector_job_id?: string | null;
    diagnostics?: WowBoostIdentityAttachCounters | null;
  } = {},
) {
  const started = Date.now();
  const diagnostics = args.diagnostics || createWowBoostIdentityAttachCounters();
  const uniqueEmails = new Set<string>();
  const uniqueOrderOrExternalIds = new Set<string>();

  for (const row of rows) {
    const email = String(row?.customer_email_normalized || row?.email || "").trim().toLowerCase();
    if (email) uniqueEmails.add(email);

    for (const value of [
      row?.platform_order_id,
      row?.order_id,
      row?.transaction_id,
      row?.commerce_reference,
      row?.everflow_transaction_id,
      row?.tkid,
    ]) {
      const normalized = String(value ?? "").trim();
      if (normalized) uniqueOrderOrExternalIds.add(normalized);
    }
  }

  Object.assign(diagnostics, {
    input_rows: rows.length,
    unique_emails: uniqueEmails.size,
    unique_order_or_external_ids: uniqueOrderOrExternalIds.size,
  });

  console.log("[WowBoost Identity] ATTACH START", {
    input_rows: diagnostics.input_rows,
    unique_emails: diagnostics.unique_emails,
    unique_order_or_external_ids: diagnostics.unique_order_or_external_ids,
  });

  if (!envFlagEnabled(env.IDENTITY_WOWBOOST_RESOLUTION_ENABLED, true)) {
    diagnostics.elapsed_ms = Date.now() - started;
    console.log("[WowBoost Identity] ATTACH COMPLETE", {
      input_rows: diagnostics.input_rows,
      skipped: rows.length,
      reason: "identity_resolution_disabled",
      elapsed_ms: diagnostics.elapsed_ms,
      counters: diagnostics,
    });
    return { rows, attempted: 0, linked: 0, review_required: 0, skipped: rows.length, warnings: ["identity_resolution_disabled"] };
  }

  const maxRows = wowBoostIdentityMaxRows(env);
  if (!maxRows) {
    diagnostics.elapsed_ms = Date.now() - started;
    console.log("[WowBoost Identity] ATTACH COMPLETE", {
      input_rows: diagnostics.input_rows,
      skipped: rows.length,
      reason: "identity_resolution_limit_zero",
      elapsed_ms: diagnostics.elapsed_ms,
      counters: diagnostics,
    });
    return { rows, attempted: 0, linked: 0, review_required: 0, skipped: rows.length, warnings: ["identity_resolution_limit_zero"] };
  }

  const service = getIdentityService(env);
  const warnings: string[] = [];
  let attempted = 0;
  let linked = 0;
  let reviewRequired = 0;
  let identityUnavailable = false;

  const rowsToProcess = rows.slice(0, maxRows);
  for (let rowIndex = 0; rowIndex < rowsToProcess.length; rowIndex += 1) {
    const row = rowsToProcess[rowIndex];
    if (!row || row.person_id || identityUnavailable) continue;
    const identifiers = wowBoostIdentityIdentifiers(row);
    if (!identifiers.length) continue;

    attempted += 1;
    diagnostics.lookup_batches += 1;
    diagnostics.lookup_calls += 1;
    diagnostics.database_api_lookup_calls += 1;
    diagnostics.external_operations += 1;
    diagnostics.database_helper_calls += 1;
    diagnostics.service_binding_calls += 1;
    diagnostics.per_row_lookup_helper_calls += 1;

    const lookupNumber = diagnostics.lookup_calls;
    const lookupStarted = Date.now();
    console.log("[WowBoost Identity] LOOKUP START", {
      lookup_number: lookupNumber,
      lookup_type: "resolveIdentityForSourceRecord",
      row_index: rowIndex + 1,
      batch_size: 1,
      platform_order_id_present: Boolean(row.platform_order_id),
      identifier_count: identifiers.length,
    });

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

      if (result.person_id) diagnostics.matched_identities += 1;
      else diagnostics.unmatched_identities += 1;

      console.log("[WowBoost Identity] LOOKUP COMPLETE", {
        lookup_number: lookupNumber,
        lookup_type: "resolveIdentityForSourceRecord",
        row_index: rowIndex + 1,
        batch_size: 1,
        matched: Boolean(result.person_id),
        review_required: Boolean(result.review_required),
        elapsed_ms: Date.now() - lookupStarted,
      });

      if (result.person_id && !result.review_required) {
        row.person_id = result.person_id;
        linked += 1;
      } else if (result.review_required) {
        reviewRequired += 1;
      }
    } catch (e: any) {
      diagnostics.errors += 1;
      diagnostics.unmatched_identities += 1;
      const message = String(e?.message || e || "identity_resolution_failed");
      console.error("[WowBoost Identity] LOOKUP FAILED", {
        lookup_number: lookupNumber,
        lookup_type: "resolveIdentityForSourceRecord",
        row_index: rowIndex + 1,
        batch_size: 1,
        elapsed_ms: Date.now() - lookupStarted,
        message,
        stack: e?.stack,
      });
      warnings.push("identity_resolution_failed");
      if (isCloudflareSubrequestLimitError(e)) {
        warnings.push("identity_resolution_stopped_subrequest_limit");
        break;
      }
      if (message.includes("does not exist") || message.includes("relation") || message.includes("schema cache")) {
        identityUnavailable = true;
        warnings.push("identity_tables_unavailable");
      }
    }
  }

  const skipped = Math.max(0, rows.length - attempted);
  diagnostics.elapsed_ms = Date.now() - started;
  console.log("[WowBoost Identity] ATTACH COMPLETE", {
    input_rows: diagnostics.input_rows,
    attempted,
    linked,
    review_required: reviewRequired,
    skipped,
    matched_identities: diagnostics.matched_identities,
    unmatched_identities: diagnostics.unmatched_identities,
    lookup_batches: diagnostics.lookup_batches,
    lookup_calls: diagnostics.lookup_calls,
    database_api_lookup_calls: diagnostics.database_api_lookup_calls,
    elapsed_ms: diagnostics.elapsed_ms,
    counters: diagnostics,
  });

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
const CONNECTOR_RUNTIME_QUEUE_NAME = "wowboost-imports";
const CONNECTOR_RUNTIME_ORPHAN_QUEUED_TASK_MS = 60000;
const CONNECTOR_RUNTIME_RECOVERY_SCAN_LIMIT = 25;
const IDENTITY_RESOLVE_TASK_STALE_MS = 120000;
const IDENTITY_RESOLVE_TASK_RECHECK_DELAY_SECONDS = 30;
const IDENTITY_RESOLVE_OPERATION_TIMEOUT_MS = 15000;
const ATTRIBUTION_BACKFILL_TASK_STALE_MS = 120000;
const ATTRIBUTION_BACKFILL_TASK_RECHECK_DELAY_SECONDS = 30;
const BROWSER_EVENT_NORMALIZE_TASK_STALE_MS = 120000;
const BROWSER_EVENT_NORMALIZE_TASK_RECHECK_DELAY_SECONDS = 30;
const BROWSER_EVENT_NORMALIZE_RUNTIME_MAX_BATCH_SIZE = BROWSER_EVENT_DEFAULT_BATCH_SIZE;
const JOURNEY_ASSIGNMENT_RUNTIME_TASK_TYPE = "journey_assignment_batch";
const ATTRIBUTION_BACKFILL_RUNTIME_TASK_TYPE = "attribution_backfill_batch";

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

async function updateConnectorRuntimeTaskIfCurrent(env: Env, task: ConnectorImportTaskRow, patch: Partial<ConnectorImportTaskRow> & Record<string, any>) {
  const supabase = getSupabase(env);
  let query = supabase
    .from("connector_import_tasks")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", task.id)
    .eq("status", task.status);
  query = task.locked_at ? query.eq("locked_at", task.locked_at) : query.is("locked_at", null);
  const { data, error } = await query.select("*").maybeSingle();
  if (error) throw new Error(`Failed to atomically update connector runtime task: ${error.message}`);
  return (data || null) as ConnectorImportTaskRow | null;
}

function isIdentityResolveRuntimeTask(task: ConnectorImportTaskRow | null | undefined) {
  return Boolean(
    task
    && task.connector_id === IDENTITY_BACKFILL_CONNECTOR_ID
    && task.task_type === IDENTITY_BACKFILL_TASK_TYPES.resolve
  );
}

function isAttributionBackfillRuntimeTask(task: ConnectorImportTaskRow | null | undefined) {
  return Boolean(
    task
    && task.connector_id === ATTRIBUTION_BACKFILL_CONNECTOR_ID
    && task.task_type === ATTRIBUTION_BACKFILL_RUNTIME_TASK_TYPE
  );
}

function isBrowserEventNormalizeRuntimeTask(task: ConnectorImportTaskRow | null | undefined) {
  return Boolean(
    task
    && task.connector_id === BROWSER_EVENTS_CONNECTOR_ID
    && task.task_type === BROWSER_EVENT_NORMALIZE_TASK_TYPE
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
  subrequest_tracker?: IdentityResolveSubrequestTracker | null;
  target_diagnostic_events?: IdentityResolveBufferedTargetDiagnosticEvent[];
  identity_resolution_metrics?: IdentityResolutionDebugMetrics | null;
  identity_resolve_cumulative_counts?: IdentityResolveResourceCounts | null;
};

type ConnectorRuntimeTaskExecutionOptions = {
  diagnostics?: ConnectorRuntimeTaskDiagnosticState | null;
  already_locked?: boolean;
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

type IdentityResolveSubrequestOperationStats = {
  count: number;
  completed: number;
  errors: number;
  timeouts: number;
  elapsed_ms: number;
  max_elapsed_ms: number;
  operation: string;
  repository_method: string | null;
};

type IdentityResolveResourceCounts = {
  D1: number;
  KV: number;
  Queue: number;
  DO: number;
  Total: number;
};

type IdentityResolveSubrequestTracker = {
  platform?: string | null;
  platform_order_id: string;
  processed: number;
  record_index: number;
  count: number;
  completed: number;
  errors: number;
  timeouts: number;
  started_at_ms: number;
  by_operation: Record<string, IdentityResolveSubrequestOperationStats>;
  pending: Record<string, Array<{ started_ms: number; count: number }>>;
  resource_counts: IdentityResolveResourceCounts;
};

type IdentityResolveBufferedTargetDiagnosticEvent = {
  event: string;
  details: Record<string, any>;
};

type IdentityResolveTargetDiagnosticContext = {
  enabled: boolean;
  platform?: string | null;
  platform_order_id: string;
  processed: number;
  record_index?: number;
  operation?: string | null;
  identifier_type?: string | null;
  identifier_value?: unknown;
  person_id?: string | null;
};

function identityResolveTargetDiagnosticDetails(
  task: ConnectorImportTaskRow,
  target: IdentityResolveTargetDiagnosticContext,
  operation: string,
  details: Record<string, any> = {},
) {
  const { identifier_value: _rawIdentifierValue, ...safeDetails } = details;
  const identifierValue = details.identifier_value_masked
    || details.identifier_value_hash
    || target.identifier_value
    || null;
  const personId = details.person_id ?? target.person_id ?? null;
  return {
    ...safeDetails,
    task_id: task.id,
    job_id: task.job_id,
    platform: details.platform ?? target.platform ?? null,
    platform_order_id: target.platform_order_id,
    record_index: target.record_index ?? target.processed,
    processed: target.processed,
    operation: details.operation || target.operation || operation,
    identifier_type: details.identifier_type ?? target.identifier_type ?? null,
    identifier_value: maskIdentityBackfillDiagnosticValue(identifierValue),
    person_id: personId,
    elapsed_ms: details.elapsed_ms ?? null,
    timestamp: new Date().toISOString(),
    identifier_value_masked: details.identifier_value_masked || null,
    identifier_value_hash: details.identifier_value_hash || null,
  };
}

async function heartbeatIdentityResolveTargetDiagnostic(
  _env: Env,
  task: ConnectorImportTaskRow,
  state: ConnectorRuntimeTaskDiagnosticState,
  target: IdentityResolveTargetDiagnosticContext | null | undefined,
  operation: string,
  phase: string,
  details: Record<string, any> = {},
) {
  if (!target?.enabled) return;
  if (!state.target_diagnostic_events) state.target_diagnostic_events = [];
  state.target_diagnostic_events.push({
    event: identityBackfillTargetDiagnosticEventName(operation, phase),
    details: identityResolveTargetDiagnosticDetails(task, target, operation, details),
  });
}

async function flushIdentityResolveRecordDiagnostics(
  env: Env,
  task: ConnectorImportTaskRow,
  state: ConnectorRuntimeTaskDiagnosticState,
  tracker: IdentityResolveSubrequestTracker | null | undefined,
) {
  const targetEvents = state.target_diagnostic_events || [];
  const batchEvents = [
    ...targetEvents.map((item) => ({
      event: item.event,
      details: item.details,
      at: typeof item.details?.timestamp === "string" ? item.details.timestamp : null,
    })),
    ...(tracker
      ? [{
        event: "identity_resolve.subrequest.summary",
        details: identityResolveSubrequestSummaryDetails(tracker),
      }]
      : []),
  ];
  if (!batchEvents.length) return false;
  const now = new Date().toISOString();
  const targetEventEntries = targetEvents.map((item) => ({
    at: typeof item.details?.timestamp === "string" ? item.details.timestamp : now,
    event: item.event,
    ...item.details,
  }));
  state.summary = appendConnectorRuntimeTaskDiagnosticBatch(
    state.summary,
    "identity_resolve.record.diagnostic_flush",
    batchEvents,
    now,
  );
  state.summary = {
    ...state.summary,
    target_diagnostic_batch_count: Number(state.summary.target_diagnostic_batch_count || 0) + (targetEvents.length ? 1 : 0),
    target_diagnostic_event_count: Number(state.summary.target_diagnostic_event_count || 0) + targetEvents.length,
    target_diagnostic_events: targetEventEntries,
    target_diagnostic_platform_order_id: targetEvents[0]?.details?.platform_order_id || state.summary.target_diagnostic_platform_order_id || null,
  };
  state.target_diagnostic_events = [];
  state.last_durable_heartbeat_ms = Date.now();
  await updateConnectorRuntimeTask(env, task.id, {
    locked_at: now,
    result_summary: state.summary,
  });
  return true;
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
  recordIdentityResolveSubrequestDiagnostic(state, {
    operation: "connector_runtime.task_heartbeat",
    repository_method: "heartbeatConnectorRuntimeTask",
    phase: "before_await",
    details: {
      triggering_event: event,
    },
  });
  state.summary = appendConnectorRuntimeTaskDiagnostic(state.summary, event, details, now);
  state.last_durable_heartbeat_ms = nowMs;
  await updateConnectorRuntimeTask(env, task.id, {
    locked_at: now,
    result_summary: state.summary,
  });
  recordIdentityResolveSubrequestDiagnostic(state, {
    operation: "connector_runtime.task_heartbeat",
    repository_method: "heartbeatConnectorRuntimeTask",
    phase: "after_await",
    details: {
      triggering_event: event,
    },
  });
  return true;
}

function identityResolveSubrequestRepositoryMethod(operation: string, metadata: Record<string, any> = {}) {
  const explicit = String(metadata.operation_name || "").trim();
  if (explicit) {
    if (explicit.startsWith("attachIdentifier.")) return "attachIdentifier";
    return explicit;
  }
  if (operation.includes("findIdentifiers")) return "findIdentifiers";
  if (operation.includes("getPersonIdentifiers")) return "getPersonIdentifiers";
  if (operation.includes("listPeopleByIds")) return "listPeopleByIds";
  if (operation.includes("createPerson")) return "createPerson";
  if (operation.includes("updatePerson")) return "updatePerson";
  if (operation.includes("insertResolutionEvent")) return "insertResolutionEvent";
  if (operation.includes("updateIdentifier")) return "updateIdentifier";
  if (operation === "identity_resolve.link_source_record") return "linkSourceRecord";
  if (/identity_resolve\.insert_.*_error/.test(operation)) return "insertConnectorRuntimeError";
  if (operation === "connector_runtime.task_heartbeat") return "heartbeatConnectorRuntimeTask";
  return operation;
}

function createIdentityResolveResourceCounts(): IdentityResolveResourceCounts {
  return { D1: 0, KV: 0, Queue: 0, DO: 0, Total: 0 };
}

function addIdentityResolveResourceCount(counts: IdentityResolveResourceCounts, resource: keyof Omit<IdentityResolveResourceCounts, "Total">) {
  counts[resource] += 1;
  counts.Total += 1;
}

function identityResolvePipelineResourceStage(operation: string) {
  if (operation === "identity_resolve.extract_evidence") return "extractIdentityEvidenceFromPlatformOrder";
  if (operation === "identity_resolve.link_source_record") return "linkPlatformOrderToPerson";
  if (
    operation.startsWith("identity_repository.") ||
    operation.startsWith("identity_resolve.lookup_") ||
    operation.startsWith("identity_resolve.create_person") ||
    operation.startsWith("identity_resolve.update_person_seen") ||
    operation.startsWith("identity_resolve.attach_identifier") ||
    operation.startsWith("identity_resolve.sync_primary") ||
    operation === "identity_resolve.insert_resolution_event"
  ) {
    return "resolveIdentityForSourceRecord";
  }
  return null;
}

function identityResolveLoggablePlatformOrderId(platformOrderId: string) {
  return platformOrderId.includes(":") ? platformOrderId.split(":").pop() || platformOrderId : platformOrderId;
}

function logIdentityResolveResourceOperation(args: {
  tracker: IdentityResolveSubrequestTracker;
  stage: string;
  operation: string;
  repository_method: string | null;
  resource: keyof Omit<IdentityResolveResourceCounts, "Total">;
}) {
  console.log("[TraceKit] identity resolve resource operation", {
    platform_order_id: args.tracker.platform_order_id,
    platform_order_id_value: identityResolveLoggablePlatformOrderId(args.tracker.platform_order_id),
    platform: args.tracker.platform || null,
    record_index: args.tracker.record_index,
    processed: args.tracker.processed,
    stage: args.stage,
    operation: args.operation,
    repository_method: args.repository_method,
    resource: args.resource,
    D1: args.tracker.resource_counts.D1,
    KV: args.tracker.resource_counts.KV,
    Queue: args.tracker.resource_counts.Queue,
    DO: args.tracker.resource_counts.DO,
    Total: args.tracker.resource_counts.Total,
  });
}

function logIdentityResolveRecordResourceSummary(tracker: IdentityResolveSubrequestTracker) {
  console.log(
    `[TraceKit] identity resolve record resource summary platform_order_id=${identityResolveLoggablePlatformOrderId(tracker.platform_order_id)} D1=${tracker.resource_counts.D1} KV=${tracker.resource_counts.KV} Queue=${tracker.resource_counts.Queue} DO=${tracker.resource_counts.DO} Total=${tracker.resource_counts.Total}`,
    {
      platform_order_id: tracker.platform_order_id,
      platform_order_id_value: identityResolveLoggablePlatformOrderId(tracker.platform_order_id),
      platform: tracker.platform || null,
      record_index: tracker.record_index,
      processed: tracker.processed,
      D1: tracker.resource_counts.D1,
      KV: tracker.resource_counts.KV,
      Queue: tracker.resource_counts.Queue,
      DO: tracker.resource_counts.DO,
      Total: tracker.resource_counts.Total,
    },
  );
}

function logIdentityResolveCumulativeResourceSummary(state: ConnectorRuntimeTaskDiagnosticState, event: string) {
  const counts = state.identity_resolve_cumulative_counts || createIdentityResolveResourceCounts();
  console.log(
    `[TraceKit] identity resolve cumulative resource summary before ${event}.before_await D1=${counts.D1} KV=${counts.KV} Queue=${counts.Queue} DO=${counts.DO} Total=${counts.Total}`,
    {
      event,
      D1: counts.D1,
      KV: counts.KV,
      Queue: counts.Queue,
      DO: counts.DO,
      Total: counts.Total,
    },
  );
}

function isIdentityResolveSupabaseSubrequestOperation(operation: string, phase: string, metadata: Record<string, any> = {}) {
  if (!["before_await", "after_await", "error"].includes(phase)) return false;
  if (operation === "connector_runtime.task_heartbeat") return true;
  if (operation.startsWith("identity_repository.")) {
    if (operation === "identity_repository.attachIdentifier.entry") return false;
    if (operation === "identity_repository.attachIdentifier.short_circuit_existing") return false;
    return true;
  }
  if (operation === "identity_resolve.link_source_record") return true;
  if (/identity_resolve\.insert_.*_error/.test(operation)) return true;
  return Boolean(metadata.sql_shape);
}

function identityResolveSubrequestTrackerKey(operation: string, repositoryMethod: string | null) {
  return `${repositoryMethod || "unknown"}:${operation}`;
}

function identityResolveSubrequestStats(
  tracker: IdentityResolveSubrequestTracker,
  operation: string,
  repositoryMethod: string | null,
) {
  const key = identityResolveSubrequestTrackerKey(operation, repositoryMethod);
  if (!tracker.by_operation[key]) {
    tracker.by_operation[key] = {
      count: 0,
      completed: 0,
      errors: 0,
      timeouts: 0,
      elapsed_ms: 0,
      max_elapsed_ms: 0,
      operation,
      repository_method: repositoryMethod,
    };
  }
  return { key, stats: tracker.by_operation[key] };
}

function recordIdentityResolveSubrequestDiagnostic(
  state: ConnectorRuntimeTaskDiagnosticState,
  args: {
    operation: string;
    repository_method?: string | null;
    phase: "before_await" | "after_await" | "error";
    elapsed_ms?: number | null;
    timed_out?: boolean;
    details?: Record<string, any>;
  },
) {
  const tracker = state.subrequest_tracker;
  if (!tracker) return;
  const details = args.details || {};
  if (!isIdentityResolveSupabaseSubrequestOperation(args.operation, args.phase, details)) return;
  const repositoryMethod = args.repository_method || identityResolveSubrequestRepositoryMethod(args.operation, details);
  const { key, stats } = identityResolveSubrequestStats(tracker, args.operation, repositoryMethod);
  const nowMs = Date.now();
  let count = tracker.count;
  let elapsedMs = Number(args.elapsed_ms || 0);
  if (args.phase === "before_await") {
    tracker.count += 1;
    stats.count += 1;
    count = tracker.count;
    if (!tracker.pending[key]) tracker.pending[key] = [];
    tracker.pending[key].push({ started_ms: nowMs, count });
    const pipelineStage = identityResolvePipelineResourceStage(args.operation);
    if (pipelineStage) {
      if (!state.identity_resolve_cumulative_counts) state.identity_resolve_cumulative_counts = createIdentityResolveResourceCounts();
      addIdentityResolveResourceCount(tracker.resource_counts, "D1");
      addIdentityResolveResourceCount(state.identity_resolve_cumulative_counts, "D1");
      logIdentityResolveResourceOperation({
        tracker,
        stage: pipelineStage,
        operation: args.operation,
        repository_method: repositoryMethod,
        resource: "D1",
      });
    }
  } else {
    const pending = tracker.pending[key]?.shift();
    count = pending?.count || tracker.count;
    if (!elapsedMs && pending?.started_ms) elapsedMs = Math.max(0, nowMs - pending.started_ms);
    if (args.phase === "after_await") {
      tracker.completed += 1;
      stats.completed += 1;
    } else {
      tracker.errors += 1;
      stats.errors += 1;
    }
    if (args.timed_out) {
      tracker.timeouts += 1;
      stats.timeouts += 1;
    }
    stats.elapsed_ms += elapsedMs;
    stats.max_elapsed_ms = Math.max(stats.max_elapsed_ms, elapsedMs);
  }
  recordConnectorRuntimeTaskDiagnosticSample(state, "identity_resolve.subrequest.count", {
    current_count: count,
    phase: args.phase,
    operation: args.operation,
    repository_method: repositoryMethod,
    platform: tracker.platform || null,
    platform_order_id: tracker.platform_order_id,
    record_index: tracker.record_index,
    processed: tracker.processed,
    elapsed_ms: args.phase === "before_await" ? null : elapsedMs,
    timed_out: Boolean(args.timed_out),
    triggering_event: details.triggering_event || null,
  });
}

function identityResolveSubrequestSummaryDetails(tracker: IdentityResolveSubrequestTracker) {
  const byOperation = Object.fromEntries(
    Object.entries(tracker.by_operation)
      .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
      .map(([key, stats]) => [key, {
        operation: stats.operation,
        repository_method: stats.repository_method,
        count: stats.count,
        completed: stats.completed,
        errors: stats.errors,
        timeouts: stats.timeouts,
        elapsed_ms: stats.elapsed_ms,
        max_elapsed_ms: stats.max_elapsed_ms,
      }]),
  );
  return {
    platform: tracker.platform || null,
    platform_order_id: tracker.platform_order_id,
    record_index: tracker.record_index,
    processed: tracker.processed,
    total_subrequests: tracker.count,
    completed_subrequests: tracker.completed,
    errored_subrequests: tracker.errors,
    timed_out_subrequests: tracker.timeouts,
    elapsed_ms: Date.now() - tracker.started_at_ms,
    by_operation: byOperation,
  };
}

function connectorRuntimeQueueDiagnosticDetails(args: {
  task?: ConnectorImportTaskRow | null;
  runtime_task_id?: string | null;
  task_id?: string | null;
  job_id?: string | null;
  details?: Record<string, any>;
}) {
  const details = args.details || {};
  return {
    ...details,
    runtime_task_id: String(args.runtime_task_id || args.task_id || args.task?.id || "").trim() || null,
    task_id: String(args.task_id || args.runtime_task_id || args.task?.id || "").trim() || null,
    job_id: String(args.job_id || args.task?.job_id || "").trim() || null,
    queue_name: CONNECTOR_RUNTIME_QUEUE_NAME,
    timestamp: new Date().toISOString(),
  };
}

function connectorRuntimeQueueErrorDetails(error: any) {
  return {
    error_name: error?.name || "Error",
    error_message: error?.message || String(error),
    error_stack: error?.stack || null,
  };
}

async function heartbeatConnectorRuntimeQueueEvent(
  env: Env,
  task: ConnectorImportTaskRow,
  state: ConnectorRuntimeTaskDiagnosticState,
  event: string,
  details: Record<string, any> = {},
) {
  await heartbeatConnectorRuntimeTask(
    env,
    task,
    state,
    event,
    connectorRuntimeQueueDiagnosticDetails({ task, details }),
    { force: true },
  );
}

function connectorRuntimeInlineRecordLimit(body: any) {
  const raw = body?.max_records ?? body?.maxRecords ?? body?.record_limit ?? body?.recordLimit ?? null;
  if (raw === null || raw === undefined || raw === "") return null;
  const parsed = Math.floor(Number(raw));
  if (!Number.isFinite(parsed) || parsed < 1) return "invalid";
  return Math.min(parsed, 100);
}

function connectorRuntimeInlinePlatformOrderId(body: any) {
  return String(body?.platform_order_id ?? body?.platformOrderId ?? "").trim() || null;
}

function connectorRuntimePayloadPlatformOrderIds(payload: any) {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const value of Array.isArray(payload?.platform_order_ids) ? payload.platform_order_ids : []) {
    const id = String(value || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

async function traceIdentityResolveAwait<T>(
  env: Env,
  task: ConnectorImportTaskRow,
  state: ConnectorRuntimeTaskDiagnosticState,
  event: string,
  operation: () => Promise<T>,
  options: { durable_before?: boolean; durable_after?: boolean; details?: Record<string, any>; target?: IdentityResolveTargetDiagnosticContext | null } = {},
) {
  logConnectorRuntimeTaskEvent(task, `${event}.before_await`, options.details || {});
  recordIdentityResolveSubrequestDiagnostic(state, {
    operation: event,
    repository_method: identityResolveSubrequestRepositoryMethod(event, options.details || {}),
    phase: "before_await",
    details: options.details || {},
  });
  recordConnectorRuntimeTaskDiagnosticSample(state, `${event}.before_await`, options.details || {});
  await heartbeatIdentityResolveTargetDiagnostic(env, task, state, options.target, event, "before_await", options.details || {});
  if (options.durable_before) await heartbeatConnectorRuntimeTask(env, task, state, `${event}.before_await`, options.details || {}, { force: true });
  const started = Date.now();
  try {
    const result = await withIdentityOperationTimeout(event, operation(), IDENTITY_RESOLVE_OPERATION_TIMEOUT_MS);
    const elapsedDetails = { ...(options.details || {}), elapsed_ms: Date.now() - started };
    logConnectorRuntimeTaskEvent(task, `${event}.after_await`, elapsedDetails);
    recordIdentityResolveSubrequestDiagnostic(state, {
      operation: event,
      repository_method: identityResolveSubrequestRepositoryMethod(event, elapsedDetails),
      phase: "after_await",
      elapsed_ms: elapsedDetails.elapsed_ms,
      details: elapsedDetails,
    });
    recordConnectorRuntimeTaskDiagnosticSample(state, `${event}.after_await`, elapsedDetails);
    await heartbeatIdentityResolveTargetDiagnostic(env, task, state, options.target, event, "after_await", elapsedDetails);
    if (options.durable_after) await heartbeatConnectorRuntimeTask(env, task, state, `${event}.after_await`, elapsedDetails, { force: true });
    return result;
  } catch (error: any) {
    const elapsedMs = Date.now() - started;
    logConnectorRuntimeTaskEvent(task, `${event}.await_error`, {
      ...(options.details || {}),
      elapsed_ms: elapsedMs,
      timed_out: error?.name === "IdentityOperationTimeoutError",
      message: error?.message || String(error),
    }, "error");
    recordIdentityResolveSubrequestDiagnostic(state, {
      operation: event,
      repository_method: identityResolveSubrequestRepositoryMethod(event, options.details || {}),
      phase: "error",
      elapsed_ms: elapsedMs,
      timed_out: error?.name === "IdentityOperationTimeoutError",
      details: options.details || {},
    });
    await heartbeatIdentityResolveTargetDiagnostic(env, task, state, options.target, event, error?.name === "IdentityOperationTimeoutError" ? "operation_timeout" : "error", {
      ...(options.details || {}),
      elapsed_ms: elapsedMs,
      operation_timeout: error?.name === "IdentityOperationTimeoutError",
      error_name: error?.name || "Error",
    }).catch(() => {});
    await heartbeatConnectorRuntimeTask(env, task, state, `${event}.await_error`, {
      ...(options.details || {}),
      elapsed_ms: elapsedMs,
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
  if (!state.identity_resolution_metrics) state.identity_resolution_metrics = createIdentityResolutionDebugMetrics();
  return {
    timeout_ms: IDENTITY_RESOLVE_OPERATION_TIMEOUT_MS,
    metrics: state.identity_resolution_metrics,
    emit: async (event) => {
      const details = {
        task_id: task.id,
        job_id: task.job_id,
        platform: base.platform || null,
        platform_order_id: base.platform_order_id,
        record_index: base.processed,
        processed: base.processed,
        operation: event.operation,
        elapsed_ms: event.elapsed_ms ?? null,
        timestamp: new Date().toISOString(),
        timed_out: Boolean(event.timed_out),
        error_name: event.error_name || null,
        ...(event.metadata || {}),
      };
      recordIdentityResolveSubrequestDiagnostic(state, {
        operation: event.operation,
        repository_method: identityResolveSubrequestRepositoryMethod(event.operation, event.metadata || {}),
        phase: event.phase,
        elapsed_ms: event.elapsed_ms,
        timed_out: event.timed_out,
        details,
      });
      recordConnectorRuntimeTaskDiagnosticSample(state, `${event.operation}.${event.phase}`, details);
      if (isIdentityBackfillTargetDiagnosticRecord(base.platform_order_id)) {
        await heartbeatIdentityResolveTargetDiagnostic(env, task, state, {
          enabled: true,
          platform: base.platform || null,
          platform_order_id: base.platform_order_id,
          processed: base.processed,
          record_index: base.processed,
          operation: event.operation,
          identifier_type: (event.metadata || {}).identifier_type || null,
          identifier_value: (event.metadata || {}).identifier_value_masked || (event.metadata || {}).identifier_value_hash || null,
          person_id: (event.metadata || {}).person_id || null,
        }, event.operation, event.timed_out ? "operation_timeout" : event.phase, details);
      }
    },
  };
}

function identityResolveRecordHeartbeatOptions(processed: number) {
  return { force: processed > 0 && processed % 5 === 0 };
}

async function sendConnectorRuntimeTaskQueueMessage(
  env: Env,
  task: ConnectorImportTaskRow,
  message: Record<string, any>,
  options?: Record<string, any>,
  state?: ConnectorRuntimeTaskDiagnosticState | null,
) {
  if (!env.wowboost_imports) throw new Error("wowboost_imports queue binding is missing. Check wrangler.toml.");
  const diagnostics = state || connectorRuntimeTaskDiagnosticState(task);
  console.log("[TraceKit] connector runtime queue", connectorRuntimeQueueDiagnosticDetails({
    task,
    details: {
      event: "connector_runtime.queue.publish.before",
      task_type: task.task_type,
      status: task.status,
      delay_seconds: Number((options as any)?.delaySeconds || 0) || null,
    },
  }));
  try {
    const result = await sendConnectorRuntimeQueueMessageWithRetry({
      send: async (body, sendOptions) => await env.wowboost_imports!.send(body, sendOptions as any),
      message,
      options,
      runtime_task_id: task.id,
      job_id: task.job_id,
      onEvent: async ({ event, details }) => {
        await heartbeatConnectorRuntimeQueueEvent(env, task, diagnostics, event, details);
      },
    });
    console.log("[TraceKit] connector runtime queue", connectorRuntimeQueueDiagnosticDetails({
      task,
      details: {
        event: "connector_runtime.queue.publish_succeeded",
        task_type: task.task_type,
        status: task.status,
        attempts: result.attempts,
        retried: result.retried,
      },
    }));
    return result;
  } catch (error: any) {
    console.error("[TraceKit] connector runtime queue", connectorRuntimeQueueDiagnosticDetails({
      task,
      details: {
        event: "connector_runtime.queue.publish_failed",
        task_type: task.task_type,
        status: task.status,
        ...connectorRuntimeQueueErrorDetails(error),
      },
    }));
    throw error;
  }
}

async function enqueueConnectorRuntimeTask(env: Env, task: ConnectorImportTaskRow) {
  await sendConnectorRuntimeTaskQueueMessage(env, task, connectorRuntimeTaskMessage({
    id: task.id,
    job_id: task.job_id,
    connector_id: task.connector_id,
    task_type: task.task_type,
    phase: task.phase,
  }));
}

async function enqueueConnectorRuntimeTaskWithDelay(env: Env, task: ConnectorImportTaskRow, delaySeconds: number) {
  await sendConnectorRuntimeTaskQueueMessage(env, task, connectorRuntimeTaskMessage({
    id: task.id,
    job_id: task.job_id,
    connector_id: task.connector_id,
    task_type: task.task_type,
    phase: task.phase,
  }), { delaySeconds: Math.max(1, Math.floor(delaySeconds)) });
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

async function recoverStaleAttributionBackfillTask(env: Env, task: ConnectorImportTaskRow, args: { reason?: string | null } = {}) {
  if (!isAttributionBackfillRuntimeTask(task)) return task;
  const lastError = `Recovered stale Attribution Backfill task after missing heartbeat for ${Math.round(ATTRIBUTION_BACKFILL_TASK_STALE_MS / 1000)} seconds.`;
  const decision = connectorRuntimeStaleRunningTaskRecoveryDecision(task, {
    stale_ms: ATTRIBUTION_BACKFILL_TASK_STALE_MS,
    recovered_event: "attribution_backfill.stale_recovered",
    exhausted_event: "attribution_backfill.stale_exhausted",
    reason: args.reason || "stale_running_task",
    last_error: lastError,
  });
  if (decision.action === "active") return task;

  const updated = await updateConnectorRuntimeTaskIfCurrent(env, task, decision.patch as Record<string, any>);
  if (!updated) return null;

  await insertConnectorRuntimeError(env, {
    job_id: task.job_id,
    task_id: task.id,
    connector_id: task.connector_id,
    record_identifier: task.dedupe_key,
    error_class: decision.action === "fail" ? "attribution_backfill_stale_exhausted" : "attribution_backfill_stale_recovered",
    attempt: Math.max(1, Number(decision.attempt_count || task.attempt_count || 1)),
    message: lastError,
    classification: decision.action === "fail" ? "permanent" : "transient",
  }).catch(() => {});

  const job = await getImportJob(env, task.job_id).catch(() => null);
  if (job) {
    const progress = connectorRuntimeProgressFromJob(job);
    const metadata = {
      stale_attribution_tasks_recovered: Number(progress.metadata?.stale_attribution_tasks_recovered || 0) + (decision.action === "reclaim" ? 1 : 0),
      stale_attribution_tasks_exhausted: Number(progress.metadata?.stale_attribution_tasks_exhausted || 0) + (decision.action === "fail" ? 1 : 0),
      stale_attribution_task_ids: [...(progress.metadata?.stale_attribution_task_ids || []), task.id].slice(-10),
      transient_retries: Number(progress.metadata?.transient_retries || progress.transient_retries || 0) + (decision.action === "reclaim" ? 1 : 0),
    };
    const nextProgress = mergeConnectorRuntimeCounters(progress, decision.action === "fail" ? { records_failed: 1 } : { retries: 1 }, {
      status: decision.action === "fail" ? "completed_with_errors" : "retrying",
      phase: task.phase,
      last_error: decision.action === "fail" ? lastError : null,
      next_run_at: decision.action === "fail" ? null : new Date().toISOString(),
      metadata,
    });
    await updateConnectorRuntimeJobProgress(env, job, nextProgress).catch(() => {});
  }

  return updated;
}

function connectorRuntimeTaskStaleMs(task: ConnectorImportTaskRow) {
  if (isIdentityResolveRuntimeTask(task)) return IDENTITY_RESOLVE_TASK_STALE_MS;
  if (isAttributionBackfillRuntimeTask(task)) return ATTRIBUTION_BACKFILL_TASK_STALE_MS;
  if (isBrowserEventNormalizeRuntimeTask(task)) return BROWSER_EVENT_NORMALIZE_TASK_STALE_MS;
  return 300000;
}

async function reconcileConnectorRuntimeJobQueue(env: Env, job: ImportJobRow, args: {
  force_republish_queued?: boolean;
  limit?: number;
  reason?: string | null;
} = {}) {
  if (!env.wowboost_imports) {
    return {
      ok: false,
      job_id: job.id,
      error: "queue_not_configured",
      message: "wowboost_imports queue binding is missing. Check wrangler.toml.",
    };
  }
  const progress = connectorRuntimeProgressFromJob(job);
  if (
    progress.status === "paused" ||
    progress.status === "cancelled" ||
    isTerminalConnectorRuntimeJobStatus(progress.status)
  ) {
    return {
      ok: true,
      job_id: job.id,
      skipped: true,
      reason: `job_${progress.status}`,
      stale_reclaimed: 0,
      queued_republished: 0,
      active_running: 0,
      failed: 0,
      races_lost: 0,
    };
  }

  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from("connector_import_tasks")
    .select("*")
    .eq("job_id", job.id)
    .in("status", ["queued", "retrying", "running"])
    .order("updated_at", { ascending: true })
    .limit(Math.max(1, Math.min(100, Number(args.limit || CONNECTOR_RUNTIME_RECOVERY_SCAN_LIMIT))));
  if (error) throw new Error(`Failed to read connector runtime tasks for queue reconciliation: ${error.message}`);

  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const result = {
    ok: true,
    job_id: job.id,
    skipped: false,
    scanned: 0,
    stale_reclaimed: 0,
    queued_republished: 0,
    active_running: 0,
    failed: 0,
    races_lost: 0,
    task_ids: [] as string[],
    errors: [] as Array<{ task_id: string; message: string }>,
  };

  for (const originalTask of (data || []) as ConnectorImportTaskRow[]) {
    result.scanned += 1;
    let task = originalTask;
    let requeueReason = "orphan_queued_task";
    let publishDiagnostics: ConnectorRuntimeTaskDiagnosticState | null = null;
    try {
      if (task.status === "running") {
        const staleMs = connectorRuntimeTaskStaleMs(task);
        if (!isConnectorRuntimeTaskStale(task, { now_ms: nowMs, stale_ms: staleMs })) {
          result.active_running += 1;
          continue;
        }
        const lastError = `Recovered stale Connector Runtime task after missing heartbeat for ${Math.round(staleMs / 1000)} seconds.`;
        const decision = connectorRuntimeStaleRunningTaskRequeueDecision(task, {
          stale_ms: staleMs,
          now_ms: nowMs,
          now,
          recovered_event: "connector_runtime.task.stale_reclaimed",
          exhausted_event: "connector_runtime.task.stale_exhausted",
          reason: args.reason || "queue_reconciliation",
          last_error: lastError,
        });
        if (decision.action === "active") {
          result.active_running += 1;
          continue;
        }
        const updated = await updateConnectorRuntimeTaskIfCurrent(env, task, decision.patch as Record<string, any>);
        if (!updated) {
          result.races_lost += 1;
          continue;
        }
        task = updated;
        await insertConnectorRuntimeError(env, {
          job_id: task.job_id,
          task_id: task.id,
          connector_id: task.connector_id,
          record_identifier: task.dedupe_key,
          error_class: decision.action === "fail" ? "connector_runtime_stale_task_exhausted" : "connector_runtime_stale_task_reclaimed",
          attempt: Math.max(1, Number(decision.attempt_count || task.attempt_count || 1)),
          message: lastError,
          classification: decision.action === "fail" ? "permanent" : "transient",
        }).catch(() => {});

        const latestJob = await getImportJob(env, task.job_id).catch(() => job);
        if (latestJob) {
          const latestProgress = connectorRuntimeProgressFromJob(latestJob);
          const nextProgress = mergeConnectorRuntimeCounters(latestProgress, decision.action === "fail" ? { records_failed: 1 } : { retries: 1 }, {
            status: decision.action === "fail" ? "completed_with_errors" : "retrying",
            phase: task.phase,
            last_error: decision.action === "fail" ? lastError : null,
            next_run_at: decision.action === "fail" ? null : now,
            metadata: {
              queue_reconciliation_reclaimed_tasks: Number(latestProgress.metadata?.queue_reconciliation_reclaimed_tasks || 0) + (decision.action === "requeue" ? 1 : 0),
              queue_reconciliation_failed_tasks: Number(latestProgress.metadata?.queue_reconciliation_failed_tasks || 0) + (decision.action === "fail" ? 1 : 0),
              queue_reconciliation_task_ids: [...(latestProgress.metadata?.queue_reconciliation_task_ids || []), task.id].slice(-20),
            },
          });
          await updateConnectorRuntimeJobProgress(env, latestJob, nextProgress).catch(() => {});
        }

        if (decision.action === "fail") {
          result.failed += 1;
          continue;
        }
        result.stale_reclaimed += 1;
        requeueReason = "stale_running_reclaimed";
      } else {
        const decision = connectorRuntimeQueuedTaskRepublishDecision(task, {
          now_ms: nowMs,
          orphan_ms: CONNECTOR_RUNTIME_ORPHAN_QUEUED_TASK_MS,
          force: Boolean(args.force_republish_queued),
        });
        if (decision.action !== "republish") continue;
        publishDiagnostics = connectorRuntimeTaskDiagnosticState(task);
        await heartbeatConnectorRuntimeQueueEvent(env, task, publishDiagnostics, "connector_runtime.queue.queued_task_republish.before", {
          reason: decision.reason,
          age_ms: decision.age_ms,
        });
        requeueReason = decision.reason;
      }

      await enqueueConnectorRuntimeTask(env, task);
      if (!publishDiagnostics) publishDiagnostics = connectorRuntimeTaskDiagnosticState(task);
      await heartbeatConnectorRuntimeQueueEvent(env, task, publishDiagnostics, "connector_runtime.queue.queued_task_republished", {
        reason: requeueReason,
      }).catch(() => {});
      result.queued_republished += 1;
      result.task_ids.push(task.id);
    } catch (taskError: any) {
      result.errors.push({ task_id: task.id, message: taskError?.message || String(taskError) });
      await insertConnectorRuntimeError(env, {
        job_id: task.job_id,
        task_id: task.id,
        connector_id: task.connector_id,
        record_identifier: task.dedupe_key,
        error_class: "connector_runtime_queue_reconciliation_failed",
        attempt: Math.max(1, Number(task.attempt_count || 1)),
        message: taskError?.message || String(taskError),
        response_excerpt: taskError?.stack || null,
        classification: classifyConnectorRuntimeFailure({ status: taskError?.status, message: taskError?.message, transient: taskError?.transient }),
      }).catch(() => {});
    }
  }

  return result;
}

async function reconcileActiveConnectorRuntimeQueues(env: Env, args: { limit_jobs?: number; tasks_per_job?: number } = {}) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from("integration_import_jobs")
    .select("*")
    .eq("module", "connector_runtime")
    .in("status", ["queued", "running", "retrying"])
    .order("updated_at", { ascending: true })
    .limit(Math.max(1, Math.min(25, Number(args.limit_jobs || 10))));
  if (error) throw new Error(`Failed to scan active Connector Runtime jobs for queue reconciliation: ${error.message}`);
  const results = [];
  for (const job of (data || []) as ImportJobRow[]) {
    results.push(await reconcileConnectorRuntimeJobQueue(env, job, {
      limit: args.tasks_per_job || CONNECTOR_RUNTIME_RECOVERY_SCAN_LIMIT,
      reason: "scheduled_queue_reconciliation",
    }));
  }
  return results;
}

async function findActiveAttributionBackfillTaskForJob(env: Env, jobId: string, progress: ConnectorRuntimeProgress & Record<string, any>) {
  const cursor = journeyText(progress.current_cursor) || null;
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from("connector_import_tasks")
    .select("*")
    .eq("job_id", jobId)
    .eq("connector_id", ATTRIBUTION_BACKFILL_CONNECTOR_ID)
    .eq("task_type", ATTRIBUTION_BACKFILL_RUNTIME_TASK_TYPE)
    .in("status", ["queued", "running", "retrying"])
    .order("updated_at", { ascending: false })
    .limit(25);
  if (error) throw new Error(`Failed to read active Attribution Backfill tasks: ${error.message}`);
  return ((data || []) as ConnectorImportTaskRow[]).find((task) => {
    const taskCursor = journeyText(task.payload?.cursor || task.cursor) || null;
    return taskCursor === cursor;
  }) || null;
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
  matches?: (job: ImportJobRow, progress: ConnectorRuntimeProgress & Record<string, any>) => boolean;
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
      progress.requested_to === args.to &&
      (!args.matches || args.matches(job, progress))
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

async function resolveIdentityBackfillRuntimeTask(env: Env, job: ImportJobRow, task: ConnectorImportTaskRow, options: ConnectorRuntimeTaskExecutionOptions = {}) {
  const progress = connectorRuntimeProgressFromJob(job);
  const dryRun = Boolean(progress.metadata?.dry_run);
  const allPlatformOrderIds = Array.from(new Set((Array.isArray(task.payload?.platform_order_ids) ? task.payload.platform_order_ids : [])
    .map((value: any) => String(value || "").trim())
    .filter(Boolean)));
  const inlineRecordLimit = Math.max(0, Math.floor(Number(task.payload?.inline_record_limit || 0)));
  const inlineKeepTaskQueuedOnLimit = Boolean(task.payload?.inline_keep_task_queued_on_limit);
  const platformOrderIds = inlineRecordLimit > 0
    ? allPlatformOrderIds.slice(0, inlineRecordLimit)
    : allPlatformOrderIds;
  const resolveTotal = inlineRecordLimit > 0 ? allPlatformOrderIds.length : platformOrderIds.length;
  const diagnostics = options.diagnostics || connectorRuntimeTaskDiagnosticState(task);
  const entryDetails = {
    dry_run: dryRun,
    platform_order_ids: platformOrderIds.length,
    total_platform_order_ids: allPlatformOrderIds.length,
    inline_record_limit: inlineRecordLimit || null,
    inline_keep_task_queued_on_limit: inlineKeepTaskQueuedOnLimit,
  };
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
		    diagnostics.identity_resolve_cumulative_counts = createIdentityResolveResourceCounts();
		    const markRecordCompleteAndMaybeCheckpoint = async (platformOrderId: string, options: { completed?: boolean } = {}) => {
	      if (options.completed !== false) completedRecordIds.push(platformOrderId);
      const inlineLimitReached = inlineRecordLimit > 0 && processed >= inlineRecordLimit && processed < allPlatformOrderIds.length;
      if (!inlineLimitReached && !shouldCheckpointIdentityBackfillResolveBatch({
        started_ms: taskStartedMs,
        budget_ms: IDENTITY_BACKFILL_RESOLVE_TASK_BUDGET_MS,
        processed,
        total: resolveTotal,
      })) {
        return false;
      }
      budgetCheckpointReached = true;
      budgetContinuationIds = identityBackfillResolveRemainingIds(allPlatformOrderIds, processed);
      await heartbeatConnectorRuntimeTask(env, task, diagnostics, "identity_resolve.budget_checkpoint", {
        processed,
        total: resolveTotal,
        remaining: budgetContinuationIds.length,
        completed_record_ids: completedRecordIds.length,
        elapsed_ms: Date.now() - taskStartedMs,
        inline_record_limit_reached: inlineLimitReached,
      }, { force: true });
      return true;
    };

	    for (const platformOrderId of platformOrderIds) {
      processed += 1;
      const isTargetRecord = isIdentityBackfillTargetDiagnosticRecord(platformOrderId);
      const targetRecordStartedMs = Date.now();
      const targetRecordDiagnostic: IdentityResolveTargetDiagnosticContext | null = isTargetRecord
        ? {
          enabled: true,
          platform_order_id: platformOrderId,
          processed,
          record_index: processed,
	            operation: "record_processing",
	          }
	        : null;
		      const recordSubrequestTracker: IdentityResolveSubrequestTracker = {
		          platform: null,
		          platform_order_id: platformOrderId,
		          processed,
		          record_index: processed,
	          count: 0,
	          completed: 0,
	          errors: 0,
	          timeouts: 0,
		          started_at_ms: Date.now(),
		          by_operation: {},
		          pending: {},
		          resource_counts: createIdentityResolveResourceCounts(),
		        };
	      diagnostics.subrequest_tracker = recordSubrequestTracker;
	      logConnectorRuntimeTaskEvent(task, "identity_resolve.record.start", { platform_order_id: platformOrderId, processed });
	      await heartbeatConnectorRuntimeTask(env, task, diagnostics, "identity_resolve.record.start", {
        platform_order_id: platformOrderId,
        processed,
      }, identityResolveRecordHeartbeatOptions(processed));
      await heartbeatIdentityResolveTargetDiagnostic(env, task, diagnostics, targetRecordDiagnostic, "identity_resolve.record", "start", {
        platform_order_id: platformOrderId,
        processed,
      });
      if (processed === 1 || processed % 10 === 0 || processed === platformOrderIds.length) {
        logConnectorRuntimeTaskEvent(task, "identity_resolve.record_progress_heartbeat.before_await", { processed, total: platformOrderIds.length });
        await heartbeatConnectorRuntimeTask(env, task, diagnostics, "identity_resolve.record_progress", {
          processed,
          total: platformOrderIds.length,
          platform_order_id: platformOrderId,
        }, identityResolveRecordHeartbeatOptions(processed));
        logConnectorRuntimeTaskEvent(task, "identity_resolve.record_progress_heartbeat.after_await", { processed, total: platformOrderIds.length });
      }

      try {
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
        }).catch(() => {}), { details: { platform_order_id: platformOrderId }, target: targetRecordDiagnostic });
	        await heartbeatConnectorRuntimeTask(env, task, diagnostics, "identity_resolve.record.error", {
	          platform_order_id: platformOrderId,
	          processed,
	          operation: "row_lookup",
	          permanent: true,
	        }, { force: true });
	        if (await markRecordCompleteAndMaybeCheckpoint(platformOrderId)) break;
	        continue;
	      }
	      const targetRowDiagnostic = targetRecordDiagnostic
	        ? { ...targetRecordDiagnostic, platform: row.platform }
	        : null;
	      if (recordSubrequestTracker) recordSubrequestTracker.platform = row.platform;
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
        details: { platform: row.platform, platform_order_id: platformOrderId },
        target: targetRowDiagnostic,
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
          }).catch(() => {}), { details: { platform: row.platform, platform_order_id: platformOrderId }, target: targetRowDiagnostic });
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
          }), { details: { platform: row.platform, platform_order_id: platformOrderId, identifiers: evidence.identifiers.length }, target: targetRowDiagnostic });
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
        }, recordDiagnostics), { details: { platform: row.platform, platform_order_id: platformOrderId, identifier_count: evidence.identifiers.length }, target: targetRowDiagnostic });

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
          .maybeSingle(), { details: { platform: row.platform, platform_order_id: platformOrderId, person_id: result.person_id }, target: targetRowDiagnostic ? { ...targetRowDiagnostic, person_id: result.person_id } : null });
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
		        if (isCloudflareSubrequestLimitError(e)) {
		          const checkpoint = identityBackfillResolveSubrequestLimitCheckpoint({
		            platform_order_ids: allPlatformOrderIds,
		            completed_record_ids: completedRecordIds,
		          });
		          processed = checkpoint.processed;
		          budgetCheckpointReached = true;
		          budgetContinuationIds = checkpoint.remaining_platform_order_ids;
		          transientRetries += 1;
		          recentWarnings.push("identity_resolution_stopped_subrequest_limit");
		          break;
		        }
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
          }).catch(() => {}), { details: { platform: row.platform, platform_order_id: platformOrderId }, target: targetRowDiagnostic });
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
        }).catch(() => {}), { details: { platform: row.platform, platform_order_id: platformOrderId, classification }, target: targetRowDiagnostic });
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
	      } catch (targetRecordError: any) {
	        await heartbeatIdentityResolveTargetDiagnostic(env, task, diagnostics, targetRecordDiagnostic, "identity_resolve.record", "error", {
	          platform_order_id: platformOrderId,
          processed,
          operation: targetRecordError?.operation || "record_processing",
          elapsed_ms: Date.now() - targetRecordStartedMs,
          timed_out: targetRecordError?.name === "IdentityOperationTimeoutError",
          error_name: targetRecordError?.name || "Error",
	        }).catch(() => {});
	        throw targetRecordError;
		      } finally {
		        logIdentityResolveRecordResourceSummary(recordSubrequestTracker);
		        if (isTargetRecord) {
		          await flushIdentityResolveRecordDiagnostics(env, task, diagnostics, recordSubrequestTracker).catch(() => {});
		        }
		        if (diagnostics.subrequest_tracker === recordSubrequestTracker) diagnostics.subrequest_tracker = null;
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
		    if (budgetCheckpointReached && budgetContinuationIds.length && !inlineKeepTaskQueuedOnLimit) {
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
		      logIdentityResolveCumulativeResourceSummary(diagnostics, "identity_resolve.enqueue_discovery");
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
		      inline_record_limit_reached: inlineRecordLimit > 0 && budgetCheckpointReached && budgetContinuationIds.length > 0,
		      keep_task_queued: inlineKeepTaskQueuedOnLimit && budgetCheckpointReached && budgetContinuationIds.length > 0,
		      inline_record_limit: inlineRecordLimit || null,
		      remaining_records: budgetContinuationIds.length,
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

async function executeConnectorRuntimeTask(env: Env, task: ConnectorImportTaskRow, options: ConnectorRuntimeTaskExecutionOptions = {}) {
  const job = await getImportJob(env, task.job_id);
  if (!job) return { skipped: true, reason: "job_not_found" };
  const progress = connectorRuntimeProgressFromJob(job);
  if (progress.status === "paused" || progress.status === "cancelled" || isTerminalConnectorRuntimeJobStatus(progress.status)) {
    return { skipped: true, reason: `job_${progress.status}` };
  }

  if (task.status === "completed") return { skipped: true, reason: "task_completed" };
  if (!options.already_locked) {
    const lockNow = new Date().toISOString();
    const attemptAlreadyIncremented = connectorRuntimeAttemptAlreadyIncremented(task);
    const nextAttemptCount = attemptAlreadyIncremented
      ? Math.max(1, Number(task.attempt_count || 1))
      : Number(task.attempt_count || 0) + 1;
    const runningPatch: Partial<ConnectorImportTaskRow> & Record<string, any> = {
      status: "running",
      locked_at: lockNow,
      attempt_count: nextAttemptCount,
      last_error: null,
    };
    if (isIdentityResolveRuntimeTask(task)) {
      runningPatch.result_summary = appendConnectorRuntimeTaskDiagnostic(task.result_summary, "identity_resolve.lock_acquired", {
        previous_status: task.status,
        attempt_count: nextAttemptCount,
        attempt_already_incremented: attemptAlreadyIncremented,
      }, lockNow);
    } else {
      runningPatch.result_summary = appendConnectorRuntimeTaskDiagnostic(task.result_summary, "connector_runtime.task.lock_acquired", {
        previous_status: task.status,
        attempt_count: nextAttemptCount,
        attempt_already_incremented: attemptAlreadyIncremented,
      }, lockNow);
    }
    await updateConnectorRuntimeTask(env, task.id, runningPatch);
    task = { ...task, ...runningPatch } as ConnectorImportTaskRow;
  }

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
    summary = await resolveIdentityBackfillRuntimeTask(env, job, task, options);
  } else if (task.task_type === IDENTITY_BACKFILL_TASK_TYPES.finalize) {
    summary = await validateAndFinalizeIdentityBackfillRuntimeTask(env, job, task);
  } else if (task.task_type === JOURNEY_ASSIGNMENT_RUNTIME_TASK_TYPE) {
    summary = await executeJourneyAssignmentRuntimeTask(env, job, task);
  } else if (task.task_type === ATTRIBUTION_BACKFILL_RUNTIME_TASK_TYPE) {
    summary = await executeAttributionBackfillRuntimeTask(env, job, task);
  } else if (task.task_type === BROWSER_EVENT_NORMALIZE_TASK_TYPE) {
    summary = await executeBrowserEventNormalizeRuntimeTask(env, job, task);
  } else {
    throw new Error(`Unsupported connector runtime task type: ${task.task_type}`);
  }

  if (summary?.keep_task_queued && Array.isArray(summary.continuation_platform_order_ids) && summary.continuation_platform_order_ids.length) {
    const remainingPlatformOrderIds = summary.continuation_platform_order_ids
      .map((value: any) => String(value || "").trim())
      .filter(Boolean);
    const nextPayload = {
      ...(task.payload || {}),
      platform_order_ids: remainingPlatformOrderIds,
      continuation_of_task_id: task.payload?.continuation_of_task_id || task.id,
    };
    delete (nextPayload as any).inline_record_limit;
    delete (nextPayload as any).inline_keep_task_queued_on_limit;
    await updateConnectorRuntimeTask(env, task.id, {
      status: "queued",
      completed_at: null,
      locked_at: null,
      available_at: new Date().toISOString(),
      payload: nextPayload,
      result_summary: summary,
      last_error: null,
    });
    return {
      skipped: false,
      partial: true,
      processed: Number(summary.processed || 0),
      remaining_records: remainingPlatformOrderIds.length,
      summary,
    };
  }

  const completedAt = new Date().toISOString();
  const resultSummary = isBrowserEventNormalizeRuntimeTask(task)
    ? appendConnectorRuntimeTaskDiagnostic(summary, "browser_event_normalize.lock_release.completed", {
      release_owner: "executeConnectorRuntimeTask",
      previous_status: task.status,
    }, completedAt)
    : summary;
  await updateConnectorRuntimeTask(env, task.id, {
    status: "completed",
    completed_at: completedAt,
    locked_at: null,
    result_summary: resultSummary,
    last_error: null,
  });
  return { skipped: false, summary: resultSummary };
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

function journeyAssignmentRuntimeTaskPlanForProgress(job: ImportJobRow, progress: ConnectorRuntimeProgress & Record<string, any>): ConnectorRuntimeTaskPlan {
  const workspaceId = progress.workspace_id || "default";
  const cursor = journeyText(progress.current_cursor) || null;
  const batchSize = Math.max(1, Math.min(JOURNEY_ASSIGNMENT_MAX_BATCH_SIZE, Number(progress.metadata?.batch_size || progress.batch_size || JOURNEY_ASSIGNMENT_MAX_BATCH_SIZE)));
  return {
    job_id: job.id,
    workspace_id: workspaceId,
    connector_id: JOURNEY_ENGINE_CONNECTOR_ID,
    task_type: JOURNEY_ASSIGNMENT_RUNTIME_TASK_TYPE,
    phase: JOURNEY_ENGINE_PHASE,
    cursor,
    payload: {
      cursor,
      batch_size: batchSize,
      timeout_seconds: Number(progress.metadata?.timeout_seconds || progress.timeout_seconds || JOURNEY_DEFAULT_TIMEOUT_SECONDS),
    },
    dedupe_key: `journey_assignment:${cursor || "start"}:${batchSize}`,
    max_attempts: 5,
  };
}

function attributionBackfillRuntimeTaskPlanForProgress(job: ImportJobRow, progress: ConnectorRuntimeProgress & Record<string, any>): ConnectorRuntimeTaskPlan {
  const workspaceId = progress.workspace_id || "default";
  const cursor = journeyText(progress.current_cursor) || null;
  const batchSize = attributionJourneyBatchSize(progress.metadata?.journey_batch_size || progress.metadata?.batch_size || progress.journey_batch_size || progress.batch_size);
  const models = Array.isArray(progress.metadata?.models) ? progress.metadata.models : Array.isArray(progress.models) ? progress.models : [];
  const platforms = Array.isArray(progress.metadata?.platforms) ? progress.metadata.platforms : Array.isArray(progress.platforms) ? progress.platforms : [];
  const forceRecalculate = Boolean(progress.metadata?.force_recalculate ?? progress.force_recalculate);
  return {
    job_id: job.id,
    workspace_id: workspaceId,
    connector_id: ATTRIBUTION_BACKFILL_CONNECTOR_ID,
    task_type: ATTRIBUTION_BACKFILL_RUNTIME_TASK_TYPE,
    phase: ATTRIBUTION_BACKFILL_PHASE,
    cursor,
    payload: {
      cursor,
      batch_size: batchSize,
      journey_batch_size: batchSize,
      models,
      platforms,
      force_recalculate: forceRecalculate,
    },
    dedupe_key: `attribution_backfill:${cursor || "start"}:${batchSize}:${attributionRuntimeArrayKey(models)}:${attributionRuntimeArrayKey(platforms)}:${forceRecalculate ? "1" : "0"}`,
    max_attempts: 5,
  };
}

function connectorRuntimeTaskPlanForProgress(job: ImportJobRow, progress: ConnectorRuntimeProgress & Record<string, any>): ConnectorRuntimeTaskPlan {
  if (progress.connector_id === IDENTITY_BACKFILL_CONNECTOR_ID) {
    return identityBackfillRuntimeTaskPlanForProgress(job, progress);
  }
  if (progress.connector_id === JOURNEY_ENGINE_CONNECTOR_ID) {
    return journeyAssignmentRuntimeTaskPlanForProgress(job, progress);
  }
  if (progress.connector_id === ATTRIBUTION_BACKFILL_CONNECTOR_ID) {
    return attributionBackfillRuntimeTaskPlanForProgress(job, progress);
  }
  if (progress.connector_id === BROWSER_EVENTS_CONNECTOR_ID) {
    return browserEventNormalizeTaskPlanForProgress(job, progress);
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
      matches: (_candidate, candidateProgress) => identityBackfillRuntimeConfigMatches(candidateProgress, {
        workspace_id: args.workspace_id,
        requested_from: args.from,
        requested_to: args.to,
        platforms: args.platforms,
        batch_size: args.batch_size,
        dry_run: Boolean(args.dry_run),
      }),
    });
    if (candidate) job = candidate;
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

async function startJourneyAssignmentRuntimeJob(env: Env, args: JourneyAssignmentBackfillRequest & { force_new_job?: boolean | null }) {
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

  const batchSize = Math.max(1, Math.min(JOURNEY_ASSIGNMENT_MAX_BATCH_SIZE, Number(args.batch_size || JOURNEY_ASSIGNMENT_MAX_BATCH_SIZE)));
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
    if (!isConnectorRuntimeV1Job(job as any, JOURNEY_ENGINE_CONNECTOR_ID)) {
      return {
        ok: false,
        status: 400,
        body: {
          ok: false,
          error: "legacy_job_not_runtime_v1",
          message: "The supplied job_id is not a Connector Runtime v1 Journey Backfill job. Omit job_id to create a runtime job.",
          job_id: job.id,
        },
      };
    }
  }

  if (!job && !forceNewJob) {
    const candidate = await findActiveConnectorRuntimeJob(env, {
      workspace_id: args.workspace_id,
      connector_id: JOURNEY_ENGINE_CONNECTOR_ID,
      job_type: JOURNEY_ENGINE_JOB_TYPE,
      from: args.from,
      to: args.to,
      matches: (_candidate, candidateProgress) => (
        Number(candidateProgress.metadata?.batch_size || candidateProgress.batch_size || 0) === batchSize
        && Number(candidateProgress.metadata?.timeout_seconds || candidateProgress.timeout_seconds || 0) === Number(args.timeout_seconds)
      ),
    });
    if (candidate) job = candidate;
  }

  const now = new Date().toISOString();
  if (!job) {
    const progress = createConnectorRuntimeProgress({
      workspace_id: args.workspace_id,
      connector_id: JOURNEY_ENGINE_CONNECTOR_ID,
      job_type: JOURNEY_ENGINE_JOB_TYPE,
      phase: JOURNEY_ENGINE_PHASE,
      requested_from: args.from,
      requested_to: args.to,
      now,
      metadata: connectorRuntimeMetadata({
        connector_id: JOURNEY_ENGINE_CONNECTOR_ID,
        metadata: {
          batch_size: batchSize,
          timeout_seconds: args.timeout_seconds,
        },
      }),
    });
    progress.status = "queued";
    progress.current_cursor = args.cursor || null;
    progress.current_page = null;
    job = await createImportJob(env, {
      platform: "journeys",
      module: "connector_runtime",
      from: args.from,
      to: args.to,
      filter: JOURNEY_ENGINE_JOB_TYPE,
      workspace_id: args.workspace_id,
      connector_id: JOURNEY_ENGINE_CONNECTOR_ID,
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
    phase: JOURNEY_ENGINE_PHASE,
    started_at: progress.started_at || now,
    updated_at: now,
    completed_at: null,
    last_error: null,
    metadata: {
      ...(progress.metadata || {}),
      batch_size: Math.max(1, Math.min(JOURNEY_ASSIGNMENT_MAX_BATCH_SIZE, Number(progress.metadata?.batch_size || batchSize))),
      timeout_seconds: Number(progress.metadata?.timeout_seconds || args.timeout_seconds),
    },
  };
  await updateConnectorRuntimeJobProgress(env, job, progress);
  job = await getImportJob(env, job.id) || job;
  progress = connectorRuntimeProgressFromJob(job);
  const task = await createAndEnqueueConnectorRuntimeTask(env, journeyAssignmentRuntimeTaskPlanForProgress(job, progress));

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
      message: "Journey backfill queued. The Connector Runtime will continue batches automatically.",
    },
  };
}

async function startAttributionBackfillRuntimeJob(env: Env, args: AttributionBackfillRequest & { force_new_job?: boolean | null }) {
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

  const batchSize = attributionJourneyBatchSize(args.batch_size);
  const normalizedArgs = { ...args, batch_size: batchSize };
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
    if (!isConnectorRuntimeV1Job(job as any, ATTRIBUTION_BACKFILL_CONNECTOR_ID)) {
      return {
        ok: false,
        status: 400,
        body: {
          ok: false,
          error: "legacy_job_not_runtime_v1",
          message: "The supplied job_id is not a Connector Runtime v1 Attribution Backfill job. Omit job_id to create a runtime job.",
          job_id: job.id,
        },
      };
    }
  }

  if (!job && !forceNewJob) {
    const candidate = await findActiveConnectorRuntimeJob(env, {
      workspace_id: normalizedArgs.workspace_id,
      connector_id: ATTRIBUTION_BACKFILL_CONNECTOR_ID,
      job_type: ATTRIBUTION_BACKFILL_JOB_TYPE,
      from: normalizedArgs.from,
      to: normalizedArgs.to,
      matches: (_candidate, candidateProgress) => attributionRuntimeConfigMatches(candidateProgress, normalizedArgs),
    });
    if (candidate) job = candidate;
  }

  const now = new Date().toISOString();
  if (!job) {
    const progress = createConnectorRuntimeProgress({
      workspace_id: normalizedArgs.workspace_id,
      connector_id: ATTRIBUTION_BACKFILL_CONNECTOR_ID,
      job_type: ATTRIBUTION_BACKFILL_JOB_TYPE,
      phase: ATTRIBUTION_BACKFILL_PHASE,
      requested_from: normalizedArgs.from,
      requested_to: normalizedArgs.to,
      now,
      metadata: connectorRuntimeMetadata({
        connector_id: ATTRIBUTION_BACKFILL_CONNECTOR_ID,
        metadata: {
          models: normalizedArgs.models,
          platforms: normalizedArgs.platforms,
          batch_size: batchSize,
          journey_batch_size: batchSize,
          force_recalculate: normalizedArgs.force_recalculate,
          transient_retries: 0,
        },
      }),
    });
    Object.assign(progress, {
      status: "queued",
      current_cursor: normalizedArgs.cursor || null,
      current_page: null,
      models: normalizedArgs.models,
      platforms: normalizedArgs.platforms,
      batch_size: batchSize,
      journey_batch_size: batchSize,
      force_recalculate: normalizedArgs.force_recalculate,
      journeys_discovered: 0,
      journeys_processed: 0,
      conversions_discovered: 0,
      conversions_attributed_first_touch: 0,
      conversions_attributed_last_touch: 0,
      conversions_unattributed: 0,
      credits_inserted: 0,
      credits_replaced: 0,
      credits_already_current: 0,
      transient_retries: 0,
      has_more: false,
    });
    job = await createImportJob(env, {
      platform: "attribution",
      module: "connector_runtime",
      from: normalizedArgs.from,
      to: normalizedArgs.to,
      filter: ATTRIBUTION_BACKFILL_JOB_TYPE,
      workspace_id: normalizedArgs.workspace_id,
      connector_id: ATTRIBUTION_BACKFILL_CONNECTOR_ID,
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
    phase: ATTRIBUTION_BACKFILL_PHASE,
    started_at: progress.started_at || now,
    updated_at: now,
    completed_at: null,
    last_error: null,
    current_cursor: progress.current_cursor || normalizedArgs.cursor || null,
    metadata: {
      ...(progress.metadata || {}),
      models: Array.isArray(progress.metadata?.models) ? progress.metadata.models : normalizedArgs.models,
      platforms: Array.isArray(progress.metadata?.platforms) ? progress.metadata.platforms : normalizedArgs.platforms,
      batch_size: attributionJourneyBatchSize(progress.metadata?.journey_batch_size || progress.metadata?.batch_size || batchSize),
      journey_batch_size: attributionJourneyBatchSize(progress.metadata?.journey_batch_size || progress.metadata?.batch_size || batchSize),
      force_recalculate: Boolean(progress.metadata?.force_recalculate ?? normalizedArgs.force_recalculate),
      transient_retries: Number(progress.metadata?.transient_retries || progress.transient_retries || 0),
    },
  };
  await updateConnectorRuntimeJobProgress(env, job, progress);
  job = await getImportJob(env, job.id) || job;
  progress = connectorRuntimeProgressFromJob(job);
  const queueReconciliation = await reconcileConnectorRuntimeJobQueue(env, job, {
    force_republish_queued: true,
    reason: "attribution_backfill_start",
  });
  const activeTask = await findActiveAttributionBackfillTaskForJob(env, job.id, progress);
  if (activeTask) {
    return {
      ok: true,
      status: 202,
      body: {
        ok: true,
        job_id: job.id,
        status: progress.status,
        phase: progress.phase,
        queued: true,
        task_id: activeTask.id,
        duplicate_task_prevented: true,
        queue_reconciliation: queueReconciliation,
        progress: await connectorRuntimeJobPayload(env, job),
        operations_status_url: `/v1/import-jobs/${job.id}`,
        message: "Attribution backfill queued. The Connector Runtime will continue batches automatically.",
      },
    };
  }
  const task = await createAndEnqueueConnectorRuntimeTask(env, attributionBackfillRuntimeTaskPlanForProgress(job, progress));

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
      message: "Attribution backfill queued. The Connector Runtime will continue batches automatically.",
    },
  };
}

async function queryBrowserRawEventsForNormalization(env: Env, args: { workspace_id: string; cursor: string | null; batch_size: number }) {
  const supabase = getSupabase(env);
  const cursor = parseBrowserEventCursor(args.cursor);
  let query = supabase
    .from(BROWSER_EVENTS_RAW_TABLE)
    .select("*")
    .eq("workspace_id", args.workspace_id)
    .eq("normalization_status", "pending")
    .order("received_at", { ascending: true })
    .order("event_id", { ascending: true })
    .limit(args.batch_size + 1);
  if (cursor) {
    query = query.or(`received_at.gt.${cursor.received_at},and(received_at.eq.${cursor.received_at},event_id.gt.${cursor.event_id})`);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Browser raw event normalization scan failed: ${error.message}`);
  return (data || []) as BrowserRawEventRow[];
}

function browserIdentityPayloadDiagnostic(payload: Record<string, any>) {
  const identity = payload.identity && typeof payload.identity === "object" ? payload.identity : {};
  const properties = payload.properties && typeof payload.properties === "object" ? payload.properties : {};
  const user = payload.user && typeof payload.user === "object" ? payload.user : {};
  return {
    has_identity_object: Boolean(payload.identity && typeof payload.identity === "object"),
    has_email: Boolean(journeyText(payload.email || identity.email || properties.email || user.email)),
    has_phone: Boolean(journeyText(payload.phone || identity.phone || properties.phone || user.phone)),
    has_first_name: Boolean(journeyText(payload.first_name || payload.firstName || identity.first_name || identity.firstName || properties.first_name || user.first_name)),
    has_last_name: Boolean(journeyText(payload.last_name || payload.lastName || identity.last_name || identity.lastName || properties.last_name || user.last_name)),
    identity_keys: Object.keys(identity).sort().slice(0, 20),
  };
}

async function resolveBrowserEventPerson(env: Env, job: ImportJobRow, raw: BrowserRawEventRow) {
  const eventType = journeyText(raw.normalized_event_type);
  if (eventType !== "identify" && eventType !== "lead" && eventType !== "purchase") {
    console.log("[TraceKit] browser identity resolution skipped", {
      job_id: job.id,
      workspace_id: raw.workspace_id,
      event_id: raw.event_id,
      event_type: raw.normalized_event_type,
      reason: "anonymous_event_type",
    });
    return { person_id: null as string | null, review_required: false, action: "anonymous" };
  }
  const payload = raw.raw_payload || {};
  const identifiers = browserIdentityIdentifiers(payload);
  console.log("[TraceKit] browser identity input", {
    job_id: job.id,
    workspace_id: raw.workspace_id,
    event_id: raw.event_id,
    event_type: raw.normalized_event_type,
    tkid_present: Boolean(raw.tkid),
    identifier_count: identifiers.length,
    identifier_types: identifiers.map((identifier) => identifier.identifier_type),
    identity_payload: browserIdentityPayloadDiagnostic(payload),
  });
  if (!identifiers.length) {
    console.log("[TraceKit] browser identity resolution skipped", {
      job_id: job.id,
      workspace_id: raw.workspace_id,
      event_id: raw.event_id,
      event_type: raw.normalized_event_type,
      reason: "no_identity_signal",
    });
    return { person_id: null as string | null, review_required: false, action: "no_identity_signal" };
  }
  try {
    console.log("[TraceKit] browser identity service invocation", {
      job_id: job.id,
      workspace_id: raw.workspace_id,
      event_id: raw.event_id,
      event_type: raw.normalized_event_type,
      connector_id: BROWSER_EVENTS_CONNECTOR_ID,
      identifier_count: identifiers.length,
      observed_at: raw.event_time || raw.received_at,
    });
    const result = await resolveIdentityForSourceRecord(getIdentityService(env), {
      workspace_id: raw.workspace_id || "default",
      connector_id: BROWSER_EVENTS_CONNECTOR_ID,
      connector_job_id: job.id,
      platform: "browser",
      record_type: "browser_event",
      record_id: raw.event_id,
      identifiers,
      attributes: browserEventPersonAttributes(payload),
      observed_at: raw.event_time || raw.received_at,
    });
    console.log("[TraceKit] browser identity service result", {
      job_id: job.id,
      workspace_id: raw.workspace_id,
      event_id: raw.event_id,
      event_type: raw.normalized_event_type,
      action: result.action,
      review_required: Boolean(result.review_required),
      person_id: result.person_id || null,
      matched_identifier_count: result.matched_identifiers?.length || 0,
      attached_identifier_count: result.attached_identifiers?.length || 0,
      conflict_count: result.conflicts?.length || 0,
    });
    const identityDomainEvent = buildIdentityOutcomeDomainEvent(result, {
      workspace_id: raw.workspace_id || "default",
      source_platform: "browser",
      source_record_type: "browser_event",
      source_record_id: raw.event_id,
      connector_job_id: job.id,
      occurred_at: raw.event_time || raw.received_at,
    });
    if (identityDomainEvent) {
      await domainEventPublisher(env)(identityDomainEvent).catch((error: any) => {
        console.error("[TraceKit] browser identity domain event publish failed", {
          job_id: job.id,
          workspace_id: raw.workspace_id,
          event_id: raw.event_id,
          event_type: raw.normalized_event_type,
          message: error?.message || String(error),
        });
      });
    }
    if (result.review_required) return { person_id: null, review_required: true, action: result.action };
    return { person_id: result.person_id || null, review_required: false, action: result.action };
  } catch (error: any) {
    console.log("[TraceKit] browser event identity resolution deferred", {
      workspace_id: raw.workspace_id,
      event_id: raw.event_id,
      event_type: raw.normalized_event_type,
      message: error?.message || String(error),
    });
    return { person_id: null, review_required: false, action: "identity_resolution_deferred" };
  }
}

async function findLinkedBrowserIdentityForPurchase(env: Env, raw: BrowserRawEventRow) {
  if (journeyText(raw.normalized_event_type) !== "purchase") return null;
  const workspaceId = raw.workspace_id || "default";
  const eventTime = raw.event_time || raw.received_at;
  const supabase = getSupabase(env);
  const lookup = async (matchMethod: "tkid" | "session_id", value: string) => {
    let query = supabase
      .from("journey_events")
      .select(JOURNEY_EVENT_ASSIGNMENT_SELECT)
      .eq("workspace_id", workspaceId)
      .eq("source_platform", "browser")
      .eq("source_connector", BROWSER_EVENTS_CONNECTOR_ID)
      .not("person_id", "is", null)
      .not("journey_id", "is", null)
      .lte("event_time", eventTime)
      .neq("source_record_id", raw.event_id)
      .order("event_time", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    query = matchMethod === "tkid"
      ? query.eq("metadata->>tkid", value)
      : query.eq("session_id", value);
    const { data, error } = await query;
    if (error) throw new Error(`Browser purchase ${matchMethod} journey lookup failed: ${error.message}`);
    const personId = journeyText((data as any)?.person_id);
    const journeyId = journeyText((data as any)?.journey_id);
    if (!personId || !journeyId) return null;
    return {
      person_id: personId,
      journey_id: journeyId,
      source_record_id: journeyText((data as any)?.source_record_id) || null,
      match_method: matchMethod,
    };
  };

  const tkid = journeyText(raw.tkid);
  if (tkid) {
    const match = await lookup("tkid", tkid);
    if (match) return match;
  }
  const sessionId = journeyText(raw.session_id);
  if (sessionId) return lookup("session_id", sessionId);
  return null;
}

async function updateBrowserRawEventNormalization(env: Env, row: BrowserRawEventRow, patch: Record<string, any>) {
  const supabase = getSupabase(env);
  console.log("[TraceKit] browser raw event update started", {
    workspace_id: row.workspace_id,
    event_id: row.event_id,
    status: patch.normalization_status || null,
    person_id: patch.person_id || null,
    journey_id: patch.journey_id || null,
    normalized_journey_event_id: patch.normalized_journey_event_id || null,
  });
  let query = supabase
    .from(BROWSER_EVENTS_RAW_TABLE)
    .update({
      ...patch,
      normalization_attempts: Number(row.normalization_attempts || 0) + 1,
      updated_at: new Date().toISOString(),
    });
  if (row.id) query = query.eq("id", row.id);
  else query = query.eq("workspace_id", row.workspace_id).eq("event_id", row.event_id);
  const { error } = await query;
  if (error) throw new Error(`Browser raw event status update failed: ${error.message}`);
  console.log("[TraceKit] browser raw event update completed", {
    workspace_id: row.workspace_id,
    event_id: row.event_id,
    status: patch.normalization_status || null,
    person_id: patch.person_id || null,
    journey_id: patch.journey_id || null,
  });
}

async function fetchJourneyIdsForBrowserEvents(env: Env, workspaceId: string, eventIds: string[]) {
  if (!eventIds.length) return new Map<string, string | null>();
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from("journey_events")
    .select("id,source_record_id,journey_id")
    .eq("workspace_id", workspaceId)
    .eq("source_platform", "browser")
    .eq("source_connector", BROWSER_EVENTS_CONNECTOR_ID)
    .in("source_record_id", eventIds);
  if (error) throw new Error(`Browser journey event lookup failed: ${error.message}`);
  return new Map((data || []).map((row: any) => [journeyText(row.source_record_id), journeyText(row.journey_id) || null]));
}

async function linkPriorAnonymousBrowserJourneyEventsByTkid(env: Env, args: {
  workspace_id: string;
  tkid: string | null;
  person_id: string | null;
  event_time: string;
  source_record_id: string;
}) {
  const tkid = journeyText(args.tkid);
  const personId = journeyText(args.person_id);
  if (!tkid || !personId) return [];
  console.log("[TraceKit] browser tkid journey_events update started", {
    workspace_id: args.workspace_id || "default",
    source_record_id: args.source_record_id,
    person_id: personId,
    tkid_present: Boolean(tkid),
    event_time: args.event_time,
  });
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from("journey_events")
    .update({ person_id: personId, updated_at: new Date().toISOString() })
    .eq("workspace_id", args.workspace_id || "default")
    .eq("source_platform", "browser")
    .eq("source_connector", BROWSER_EVENTS_CONNECTOR_ID)
    .eq("metadata->>tkid", tkid)
    .is("person_id", null)
    .is("journey_id", null)
    .lte("event_time", args.event_time)
    .neq("source_record_id", args.source_record_id)
    .select(JOURNEY_EVENT_ASSIGNMENT_SELECT);
  if (error) throw new Error(`Browser tkid anonymous journey event link failed: ${error.message}`);
  console.log("[TraceKit] browser tkid journey_events update completed", {
    workspace_id: args.workspace_id || "default",
    source_record_id: args.source_record_id,
    person_id: personId,
    linked_event_count: (data || []).length,
  });
  return (data || []) as any[];
}

async function linkCurrentAnonymousBrowserJourneyEventsByPerson(env: Env, args: {
  workspace_id: string;
  person_ids_by_event_id: Map<string, string | null>;
}) {
  const eventIdsByPersonId = new Map<string, string[]>();
  for (const [eventId, personId] of args.person_ids_by_event_id.entries()) {
    const normalizedEventId = journeyText(eventId);
    const normalizedPersonId = journeyText(personId);
    if (!normalizedEventId || !normalizedPersonId) continue;
    const list = eventIdsByPersonId.get(normalizedPersonId) || [];
    list.push(normalizedEventId);
    eventIdsByPersonId.set(normalizedPersonId, list);
  }
  if (!eventIdsByPersonId.size) return [];

  const supabase = getSupabase(env);
  const linked: any[] = [];
  for (const [personId, eventIds] of eventIdsByPersonId.entries()) {
    console.log("[TraceKit] browser current journey_events person update started", {
      workspace_id: args.workspace_id || "default",
      person_id: personId,
      event_count: eventIds.length,
    });
    const { data, error } = await supabase
      .from("journey_events")
      .update({ person_id: personId, updated_at: new Date().toISOString() })
      .eq("workspace_id", args.workspace_id || "default")
      .eq("source_platform", "browser")
      .eq("source_connector", BROWSER_EVENTS_CONNECTOR_ID)
      .in("source_record_id", eventIds)
      .is("person_id", null)
      .select(JOURNEY_EVENT_ASSIGNMENT_SELECT);
    if (error) throw new Error(`Browser current journey event identity link failed: ${error.message}`);
    linked.push(...(data || []));
    console.log("[TraceKit] browser current journey_events person update completed", {
      workspace_id: args.workspace_id || "default",
      person_id: personId,
      requested_event_count: eventIds.length,
      linked_event_count: (data || []).length,
    });
  }
  return linked;
}

async function updateBrowserRawEventsForRetroIdentity(env: Env, args: {
  workspace_id: string;
  person_id: string;
  journey_ids_by_event_id: Map<string, string | null>;
}) {
  const eventIds = Array.from(args.journey_ids_by_event_id.keys()).map(journeyText).filter(Boolean);
  if (!eventIds.length) return 0;
  const supabase = getSupabase(env);
  let updated = 0;
  const idsByJourney = new Map<string, string[]>();
  for (const eventId of eventIds) {
    const journeyId = args.journey_ids_by_event_id.get(eventId) || "";
    const list = idsByJourney.get(journeyId) || [];
    list.push(eventId);
    idsByJourney.set(journeyId, list);
  }
  for (const [journeyId, ids] of idsByJourney) {
    console.log("[TraceKit] browser retro raw events update started", {
      workspace_id: args.workspace_id || "default",
      person_id: args.person_id,
      journey_id: journeyId || null,
      event_count: ids.length,
    });
    const { data, error } = await supabase
      .from(BROWSER_EVENTS_RAW_TABLE)
      .update({
        person_id: args.person_id,
        journey_id: journeyId || null,
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", args.workspace_id || "default")
      .in("event_id", ids)
      .is("person_id", null)
      .select("event_id");
    if (error) throw new Error(`Browser raw tkid identity link failed: ${error.message}`);
    updated += (data || []).length;
    console.log("[TraceKit] browser retro raw events update completed", {
      workspace_id: args.workspace_id || "default",
      person_id: args.person_id,
      journey_id: journeyId || null,
      requested_event_count: ids.length,
      updated_event_count: (data || []).length,
    });
  }
  return updated;
}

async function executeBrowserEventNormalizeRuntimeTask(env: Env, job: ImportJobRow, task: ConnectorImportTaskRow) {
  const started = Date.now();
  const progress = connectorRuntimeProgressFromJob(job);
  const batchSize = browserEventNormalizeBatchSize(task.payload?.batch_size || progress.metadata?.batch_size);
  const cursor = journeyText(task.payload?.cursor || task.cursor || progress.current_cursor) || null;
  const diagnostics = connectorRuntimeTaskDiagnosticState(task);
  let currentStage = "claim";
  const lifecycle = async (event: string, details: Record<string, any> = {}, options: { durable?: boolean } = {}) => {
    console.log("[TraceKit] browser event normalization lifecycle", {
      event,
      job_id: job.id,
      task_id: task.id,
      workspace_id: progress.workspace_id || "default",
      batch_size: batchSize,
      cursor_present: Boolean(cursor),
      elapsed_ms: Date.now() - started,
      ...details,
    });
    if (options.durable === false) {
      recordConnectorRuntimeTaskDiagnosticSample(diagnostics, event, {
        workspace_id: progress.workspace_id || "default",
        batch_size: batchSize,
        cursor_present: Boolean(cursor),
        elapsed_ms: Date.now() - started,
        ...details,
      });
      return;
    }
    await heartbeatConnectorRuntimeTask(env, task, diagnostics, event, {
      workspace_id: progress.workspace_id || "default",
      batch_size: batchSize,
      cursor_present: Boolean(cursor),
      elapsed_ms: Date.now() - started,
      ...details,
    }, { force: true }).catch((error: any) => {
      console.error("[TraceKit] browser event normalization lifecycle heartbeat failed", {
        event,
        job_id: job.id,
        task_id: task.id,
        workspace_id: progress.workspace_id || "default",
        message: error?.message || String(error),
      });
    });
  };
  await lifecycle("browser_event_normalize.claim.confirmed", {
    task_status: task.status,
    attempt_count: Number(task.attempt_count || 0),
  });
  try {
  currentStage = "selection";
  await lifecycle("browser_event_normalize.selection.before", {});
  const rows = await queryBrowserRawEventsForNormalization(env, {
    workspace_id: progress.workspace_id || "default",
    cursor,
    batch_size: batchSize,
  });
  const batchRows = rows.slice(0, batchSize);
  await lifecycle("browser_event_normalize.selection.after", {
    rows_fetched: rows.length,
    batch_rows: batchRows.length,
    has_more: rows.length > batchSize,
  });
  currentStage = "normalization";
  const inputs = [];
  const rawByEventId = new Map<string, BrowserRawEventRow>();
  const personIdByEventId = new Map<string, string | null>();
  const invalidEventIds = new Set<string>();
  const retroLinkedEventsById = new Map<string, any>();
  const retroLinkedEventIdsByPersonId = new Map<string, Set<string>>();
  let peopleResolved = 0;
  let anonymousEventsRetained = 0;
  let invalid = 0;
  let review = 0;
  let retroLinkedEvents = 0;
  let retroLinkedRawEvents = 0;
  const warnings: string[] = [];

  console.log("[TraceKit] browser event normalization started", {
    job_id: job.id,
    task_id: task.id,
    workspace_id: progress.workspace_id,
    batch_size: batchSize,
    cursor_present: Boolean(cursor),
  });
  await lifecycle("browser_event_normalize.normalization.before", {
    batch_rows: batchRows.length,
  });

  for (const raw of batchRows) {
    rawByEventId.set(raw.event_id, raw);
    try {
      const identity = await resolveBrowserEventPerson(env, job, raw);
      if (identity.review_required) review += 1;
      let personId = identity.person_id;
      const eventType = journeyText(raw.normalized_event_type);
      if (!personId && eventType === "purchase" && (raw.tkid || raw.session_id)) {
        try {
          const linkedIdentity = await findLinkedBrowserIdentityForPurchase(env, raw);
          if (linkedIdentity?.person_id) {
            personId = linkedIdentity.person_id;
            console.log("[TraceKit] browser purchase reused linked journey identity", {
              job_id: job.id,
              task_id: task.id,
              workspace_id: progress.workspace_id,
              event_id: raw.event_id,
              match_method: linkedIdentity.match_method,
              source_record_id: linkedIdentity.source_record_id,
              person_id: linkedIdentity.person_id,
              journey_id: linkedIdentity.journey_id,
            });
          }
        } catch (error: any) {
          warnings.push(`browser_purchase_identity_lookup_deferred:${raw.event_id}`);
          console.log("[TraceKit] browser purchase linked journey identity lookup deferred", {
            job_id: job.id,
            task_id: task.id,
            workspace_id: progress.workspace_id,
            event_id: raw.event_id,
            message: error?.message || String(error),
          });
        }
      }
      if (personId) {
        peopleResolved += 1;
        if ((eventType === "identify" || eventType === "lead" || eventType === "purchase") && raw.tkid) {
          try {
            const linked = await linkPriorAnonymousBrowserJourneyEventsByTkid(env, {
              workspace_id: progress.workspace_id || "default",
              tkid: raw.tkid,
              person_id: personId,
              event_time: raw.event_time || raw.received_at,
              source_record_id: raw.event_id,
            });
            for (const event of linked) {
              if (!event?.id || retroLinkedEventsById.has(event.id)) continue;
              retroLinkedEventsById.set(event.id, event);
              const ids = retroLinkedEventIdsByPersonId.get(personId) || new Set<string>();
              if (event.source_record_id) ids.add(journeyText(event.source_record_id));
              retroLinkedEventIdsByPersonId.set(personId, ids);
            }
          } catch (error: any) {
            warnings.push(`browser_tkid_retro_link_deferred:${raw.event_id}`);
            console.log("[TraceKit] browser tkid retro link deferred", {
              workspace_id: progress.workspace_id,
              event_id: raw.event_id,
              message: error?.message || String(error),
            });
          }
        }
      } else {
        anonymousEventsRetained += 1;
      }
      personIdByEventId.set(raw.event_id, personId);
    } catch (error: any) {
      invalid += 1;
      invalidEventIds.add(raw.event_id);
      warnings.push(`invalid_event:${raw.event_id}`);
      await updateBrowserRawEventNormalization(env, raw, {
        normalization_status: "invalid",
        normalization_error: String(error?.message || error).slice(0, 1000),
        normalized_at: new Date().toISOString(),
      }).catch(() => {});
    }
  }

  const batchTkidIdentity = applyBrowserTkidIdentityToBatch(batchRows.filter((raw) => !invalidEventIds.has(raw.event_id)), personIdByEventId);
  for (const [eventId, personId] of batchTkidIdentity.person_id_by_event_id.entries()) {
    personIdByEventId.set(eventId, personId);
  }
  if (batchTkidIdentity.linked) {
    anonymousEventsRetained = Math.max(0, anonymousEventsRetained - batchTkidIdentity.linked);
    peopleResolved += batchTkidIdentity.linked;
  }

  for (const raw of batchRows) {
    if (!rawByEventId.has(raw.event_id) || invalidEventIds.has(raw.event_id)) continue;
    try {
      const input = buildBrowserJourneyEventInput(raw, { person_id: personIdByEventId.get(raw.event_id) || null });
      if (!input) {
        invalid += 1;
        continue;
      }
      inputs.push(input);
    } catch (error: any) {
      invalid += 1;
      warnings.push(`invalid_event:${raw.event_id}`);
      await updateBrowserRawEventNormalization(env, raw, {
        normalization_status: "invalid",
        normalization_error: String(error?.message || error).slice(0, 1000),
        normalized_at: new Date().toISOString(),
      }).catch(() => {});
    }
  }

  const emptyJourneyBatch: JourneyEventBatchResult = { ok: true, inserted: 0, already_present: 0, conflicted: 0, malformed: 0, events: [], conflicts: [], errors: [] };
  const journeyBatch: JourneyEventBatchResult = inputs.length
    ? await createJourneyEventsBatch(getJourneyEventRepository(env), inputs, { max_batch_size: batchSize })
    : emptyJourneyBatch;
  await lifecycle("browser_event_normalize.normalization.after", {
    input_count: inputs.length,
    inserted: journeyBatch.inserted,
    already_present: journeyBatch.already_present,
    conflicted: journeyBatch.conflicted,
    malformed: journeyBatch.malformed,
  });
  const eventsBySourceId = new Map((journeyBatch.events || []).map((event: any) => [journeyText(event.source_record_id), event]));
  let currentLinkedEvents = 0;
  currentStage = "current_identity_link";
  await lifecycle("browser_event_normalize.current_identity_link.before", {
    person_event_count: Array.from(personIdByEventId.values()).filter(Boolean).length,
  }, { durable: false });
  try {
    const linkedCurrentEvents = await linkCurrentAnonymousBrowserJourneyEventsByPerson(env, {
      workspace_id: progress.workspace_id || "default",
      person_ids_by_event_id: personIdByEventId,
    });
    currentLinkedEvents = linkedCurrentEvents.length;
    for (const event of linkedCurrentEvents) {
      if (event?.source_record_id) eventsBySourceId.set(journeyText(event.source_record_id), event);
    }
  } catch (error: any) {
    warnings.push("browser_current_identity_link_deferred");
    console.log("[TraceKit] browser current journey event identity link deferred", {
      job_id: job.id,
      task_id: task.id,
      workspace_id: progress.workspace_id,
      message: error?.message || String(error),
    });
  }
  await lifecycle("browser_event_normalize.current_identity_link.after", {
    linked_events: currentLinkedEvents,
  }, { durable: false });
  const eventsWithPersonById = new Map<string, any>();
  for (const event of Array.from(eventsBySourceId.values()).filter((item: any) => journeyText(item.person_id))) {
    if (event?.id) eventsWithPersonById.set(event.id, event);
  }
  for (const event of retroLinkedEventsById.values()) {
    if (event?.id) eventsWithPersonById.set(event.id, event);
  }
  const eventsWithPerson = Array.from(eventsWithPersonById.values());
  retroLinkedEvents = retroLinkedEventsById.size;
  let journeysAssigned = 0;
  let attributionRecalculations = 0;
  const touchedJourneyIds = new Set<string>();
  const journeyLookupSourceIds = Array.from(new Set([
    ...Array.from(eventsBySourceId.keys()),
    ...Array.from(retroLinkedEventsById.values()).map((event: any) => journeyText(event.source_record_id)).filter(Boolean),
  ]));
  if (eventsWithPerson.length) {
    currentStage = "journey_assignment";
    await lifecycle("browser_event_normalize.journey_assignment.before", {
      events_with_person: eventsWithPerson.length,
      current_batch_events: journeyBatch.events.length,
      current_linked_events: currentLinkedEvents,
      retro_linked_events: retroLinkedEventsById.size,
    }, { durable: false });
    console.log("[TraceKit] browser journey assignment started", {
      job_id: job.id,
      task_id: task.id,
      workspace_id: progress.workspace_id,
      events_with_person: eventsWithPerson.length,
      current_batch_events: journeyBatch.events.length,
      current_linked_events: currentLinkedEvents,
      retro_linked_events: retroLinkedEventsById.size,
    });
    const assignment = await assignJourneyEvents(getJourneyRepository(env), eventsWithPerson as any, {
      timeout_seconds: JOURNEY_DEFAULT_TIMEOUT_SECONDS,
    });
    journeysAssigned = assignment.events_linked;
    console.log("[TraceKit] browser journey assignment completed", {
      job_id: job.id,
      task_id: task.id,
      workspace_id: progress.workspace_id,
      events_scanned: assignment.events_scanned,
      events_linked: assignment.events_linked,
      journeys_created: assignment.journeys_created,
      events_skipped: assignment.events_skipped,
      records_failed: assignment.records_failed,
    });
    await lifecycle("browser_event_normalize.journey_assignment.after", {
      events_scanned: assignment.events_scanned,
      events_linked: assignment.events_linked,
      journeys_created: assignment.journeys_created,
      events_skipped: assignment.events_skipped,
      records_failed: assignment.records_failed,
    }, { durable: false });
    currentStage = "journey_id_lookup";
    await lifecycle("browser_event_normalize.journey_id_lookup.before", {
      source_event_count: journeyLookupSourceIds.length,
    }, { durable: false });
    const journeyIdsByEventId = await fetchJourneyIdsForBrowserEvents(env, progress.workspace_id || "default", journeyLookupSourceIds);
    console.log("[TraceKit] browser journey id lookup completed", {
      job_id: job.id,
      task_id: task.id,
      workspace_id: progress.workspace_id,
      source_event_count: journeyLookupSourceIds.length,
      journey_id_count: Array.from(journeyIdsByEventId.values()).filter(Boolean).length,
    });
    await lifecycle("browser_event_normalize.journey_id_lookup.after", {
      source_event_count: journeyLookupSourceIds.length,
      journey_id_count: Array.from(journeyIdsByEventId.values()).filter(Boolean).length,
    }, { durable: false });
    for (const [personId, eventIds] of retroLinkedEventIdsByPersonId.entries()) {
      const retroJourneyIds = new Map<string, string | null>();
      for (const eventId of eventIds) retroJourneyIds.set(eventId, journeyIdsByEventId.get(eventId) || null);
      retroLinkedRawEvents += await updateBrowserRawEventsForRetroIdentity(env, {
        workspace_id: progress.workspace_id || "default",
        person_id: personId,
        journey_ids_by_event_id: retroJourneyIds,
      });
    }
    for (const journeyId of journeyIdsByEventId.values()) {
      if (journeyId) touchedJourneyIds.add(journeyId);
    }
  }

  const journeyIdsByEventId = touchedJourneyIds.size
    ? await fetchJourneyIdsForBrowserEvents(env, progress.workspace_id || "default", journeyLookupSourceIds)
    : new Map<string, string | null>();

  currentStage = "raw_update";
  await lifecycle("browser_event_normalize.raw_update.before", {
    batch_rows: batchRows.length,
  }, { durable: false });
  for (const raw of batchRows) {
    if (!rawByEventId.has(raw.event_id)) continue;
    const event = eventsBySourceId.get(raw.event_id);
    const conflict = (journeyBatch.conflicts || []).some((item: any) => String(item.key || "").includes(raw.event_id));
    const status = event ? "normalized" : conflict ? "review" : "error";
    if (!event && !conflict) warnings.push(`journey_event_missing:${raw.event_id}`);
    await updateBrowserRawEventNormalization(env, raw, {
      normalization_status: status,
      normalization_error: status === "error" ? "Journey event was not created." : status === "review" ? "Journey event conflict requires review." : null,
      normalized_journey_event_id: event?.id || null,
      person_id: personIdByEventId.get(raw.event_id) || null,
      journey_id: journeyIdsByEventId.get(raw.event_id) || null,
      normalized_at: new Date().toISOString(),
    });
  }
  await lifecycle("browser_event_normalize.raw_update.after", {
    batch_rows: batchRows.length,
  }, { durable: false });

  currentStage = "purchase_domain_events";
  await lifecycle("browser_event_normalize.purchase_domain_events.before", {
    journey_event_count: journeyBatch.events.length,
  }, { durable: false });
  let purchaseDomainEventsPublished = 0;
  await withIdentityOperationTimeout(
    "browser_event_normalize.purchase_domain_events",
    publishJourneyPurchaseDomainEvents(env, journeyBatch.events, {
      job_id: job.id,
      source: "browser_event_normalization",
      project_inline: false,
    }),
    IDENTITY_RESOLVE_OPERATION_TIMEOUT_MS,
  ).then((published) => {
    purchaseDomainEventsPublished = Number(published || 0);
  }).catch((error: any) => {
    warnings.push("browser_purchase_domain_event_publish_deferred");
    console.error("[TraceKit] browser purchase domain event publish failed", {
      workspace_id: progress.workspace_id,
      job_id: job.id,
      task_id: task.id,
      message: error?.message || String(error),
    });
  });
  await lifecycle("browser_event_normalize.purchase_domain_events.after", {
    journey_event_count: journeyBatch.events.length,
    events_published: purchaseDomainEventsPublished,
  }, { durable: false });

  for (const journeyId of touchedJourneyIds) {
    try {
      currentStage = "attribution_recalculation";
      await lifecycle("browser_event_normalize.attribution_recalculation.before", {
        journey_id: journeyId,
      }, { durable: false });
      await lifecycle("browser_event_normalize.attribution_recalculation.get_journey.before", {
        journey_id: journeyId,
      }, { durable: false });
      const journey = await withIdentityOperationTimeout(
        "browser_event_normalize.attribution_recalculation.get_journey",
        getAttributionRepository(env).getJourneyById(progress.workspace_id || "default", journeyId),
        IDENTITY_RESOLVE_OPERATION_TIMEOUT_MS,
      );
      await lifecycle("browser_event_normalize.attribution_recalculation.get_journey.after", {
        journey_id: journeyId,
        found: Boolean(journey),
        conversion_count: Number(journey?.conversion_count || 0),
      }, { durable: false });
      if (journey && Number(journey.conversion_count || 0) > 0) {
        await lifecycle("browser_event_normalize.attribution_recalculation.recalculate.before", {
          journey_id: journeyId,
        }, { durable: false });
          await withIdentityOperationTimeout(
            "browser_event_normalize.attribution_recalculation.recalculate",
            recalculateJourneyAttribution(getAttributionRepository(env), {
              workspace_id: progress.workspace_id || "default",
              journey_id: journeyId,
              models: ["first_touch", "last_touch"],
              force_recalculate: true,
            }, {
              on_domain_event: domainEventOutboxPublisher(env),
            }),
            IDENTITY_RESOLVE_OPERATION_TIMEOUT_MS,
          );
        await lifecycle("browser_event_normalize.attribution_recalculation.recalculate.after", {
          journey_id: journeyId,
        }, { durable: false });
        attributionRecalculations += 1;
      }
      await lifecycle("browser_event_normalize.attribution_recalculation.after", {
        journey_id: journeyId,
        recalculated: Boolean(journey && Number(journey.conversion_count || 0) > 0),
      }, { durable: false });
    } catch (error: any) {
      warnings.push(`attribution_recalculation_deferred:${journeyId}`);
      await lifecycle("browser_event_normalize.attribution_recalculation.error", {
        journey_id: journeyId,
        message: error?.message || String(error),
        error_name: error?.name || null,
      }, { durable: false });
    }
  }

  const lastRow = batchRows[batchRows.length - 1] || null;
  let hasMore = rows.length > batchSize;
  let nextCursor = hasMore && lastRow ? serializeBrowserEventCursor({ received_at: lastRow.received_at, event_id: lastRow.event_id }) : null;
  let tailPending = 0;
  if (!hasMore && lastRow) {
    currentStage = "tail_recheck";
    const tailCursor = serializeBrowserEventCursor({ received_at: lastRow.received_at, event_id: lastRow.event_id });
    await lifecycle("browser_event_normalize.selection.tail_recheck.before", {
      tail_cursor_present: true,
    });
    const tailRows = await queryBrowserRawEventsForNormalization(env, {
      workspace_id: progress.workspace_id || "default",
      cursor: tailCursor,
      batch_size: 1,
    });
    tailPending = tailRows.length;
    if (tailRows.length > 0) {
      hasMore = true;
      nextCursor = tailCursor;
    }
    await lifecycle("browser_event_normalize.selection.tail_recheck.after", {
      tail_pending: tailPending,
      has_more: hasMore,
      next_cursor_present: Boolean(nextCursor),
    });
  }
  const completed = !hasMore;
  const now = new Date().toISOString();
  const metadata = {
    ...(progress.metadata || {}),
    batch_size: batchSize,
    events_normalized: Number(progress.metadata?.events_normalized || 0) + journeyBatch.inserted + journeyBatch.already_present,
    events_duplicate: Number(progress.metadata?.events_duplicate || 0) + journeyBatch.already_present,
    events_invalid: Number(progress.metadata?.events_invalid || 0) + invalid + journeyBatch.malformed,
    events_review: Number(progress.metadata?.events_review || 0) + review + journeyBatch.conflicted,
    people_resolved: Number(progress.metadata?.people_resolved || 0) + peopleResolved,
    anonymous_events_retained: Number(progress.metadata?.anonymous_events_retained || 0) + anonymousEventsRetained,
    retro_linked_events: Number(progress.metadata?.retro_linked_events || 0) + retroLinkedEvents,
    retro_linked_raw_events: Number(progress.metadata?.retro_linked_raw_events || 0) + retroLinkedRawEvents,
    current_identity_linked_events: Number(progress.metadata?.current_identity_linked_events || 0) + currentLinkedEvents,
    journey_events_inserted: Number(progress.metadata?.journey_events_inserted || 0) + journeyBatch.inserted,
    journey_events_already_present: Number(progress.metadata?.journey_events_already_present || 0) + journeyBatch.already_present,
    journeys_assigned: Number(progress.metadata?.journeys_assigned || 0) + journeysAssigned,
    attribution_recalculations: Number(progress.metadata?.attribution_recalculations || 0) + attributionRecalculations,
    warnings: Array.from(new Set([...(progress.metadata?.warnings || []), ...warnings])).slice(-20),
  };
  const nextProgress = {
    ...progress,
    status: completed ? "completed" : "running",
    phase: BROWSER_EVENTS_PHASE,
    records_discovered: Number(progress.records_discovered || 0) + rows.length,
    records_processed: Number(progress.records_processed || 0) + batchRows.length,
    records_succeeded: Number(progress.records_succeeded || 0) + journeyBatch.inserted + journeyBatch.already_present,
    records_failed: Number(progress.records_failed || 0) + invalid + journeyBatch.malformed + journeyBatch.conflicted,
    current_cursor: nextCursor,
    has_more: hasMore,
    last_error: journeyBatch.ok ? null : "One or more browser events could not be normalized.",
    updated_at: now,
    completed_at: completed ? now : null,
    metadata,
  };
  currentStage = "commit";
  await lifecycle("browser_event_normalize.commit.before", {
    processed: batchRows.length,
    has_more: hasMore,
    next_cursor_present: Boolean(nextCursor),
    tail_pending: tailPending,
  });
  await updateConnectorRuntimeJobProgress(env, job, nextProgress as any);

  let nextTaskId: string | null = null;
  let duplicateTaskPrevented = false;
  const latestJob = await getImportJob(env, job.id);
  if (hasMore && latestJob) {
    const nextTask = await createAndEnqueueConnectorRuntimeTask(env, browserEventNormalizeTaskPlanForProgress(latestJob, connectorRuntimeProgressFromJob(latestJob)));
    nextTaskId = nextTask.task.id;
    duplicateTaskPrevented = !nextTask.created;
  }
  await lifecycle("browser_event_normalize.commit.after", {
    processed: batchRows.length,
    has_more: hasMore,
    next_task_id: nextTaskId,
    duplicate_task_prevented: duplicateTaskPrevented,
    tail_pending: tailPending,
  });

  console.log("[TraceKit] browser event normalization completed", {
    job_id: job.id,
    task_id: task.id,
    workspace_id: progress.workspace_id,
    processed: batchRows.length,
    inserted: journeyBatch.inserted,
    already_present: journeyBatch.already_present,
    conflicted: journeyBatch.conflicted,
    retro_linked_events: retroLinkedEvents,
    retro_linked_raw_events: retroLinkedRawEvents,
    has_more: hasMore,
    duration_ms: Date.now() - started,
  });
  currentStage = "completion";
  await lifecycle("browser_event_normalize.completion", {
    processed: batchRows.length,
    events_normalized: journeyBatch.inserted + journeyBatch.already_present,
    events_invalid: invalid + journeyBatch.malformed,
    has_more: hasMore,
    warnings_count: metadata.warnings.length,
    tail_pending: tailPending,
  });
  await lifecycle("browser_event_normalize.lock_release.pending", {
    release_owner: "executeConnectorRuntimeTask",
  });

  return {
    ok: journeyBatch.ok,
    job_id: job.id,
    task_id: task.id,
    phase: BROWSER_EVENTS_PHASE,
    processed: batchRows.length,
    events_normalized: journeyBatch.inserted + journeyBatch.already_present,
    journey_events_inserted: journeyBatch.inserted,
    journey_events_already_present: journeyBatch.already_present,
    events_conflicted: journeyBatch.conflicted,
    events_invalid: invalid + journeyBatch.malformed,
    people_resolved: peopleResolved,
    anonymous_events_retained: anonymousEventsRetained,
    retro_linked_events: retroLinkedEvents,
    retro_linked_raw_events: retroLinkedRawEvents,
    journeys_assigned: journeysAssigned,
    attribution_recalculations: attributionRecalculations,
    has_more: hasMore,
    next_cursor: nextCursor,
    next_task_id: nextTaskId,
    duplicate_task_prevented: duplicateTaskPrevented,
    tail_pending: tailPending,
    warnings: metadata.warnings,
    heartbeat_event: diagnostics.summary.heartbeat_event || null,
    heartbeat_at: diagnostics.summary.heartbeat_at || null,
    heartbeat_count: diagnostics.summary.heartbeat_count || null,
    diagnostic_events: diagnostics.summary.diagnostic_events || [],
  };
  } catch (error: any) {
    await lifecycle("browser_event_normalize.failure", {
      stage: currentStage,
      message: error?.message || String(error),
      error_name: error?.name || null,
      stack_present: Boolean(error?.stack),
    });
    throw error;
  }
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
  const browserRoute = matchBrowserEventRoute(req.method, path);
  const browserPath = browserRoute?.path || path;

  if (req.method === "OPTIONS" && isBrowserEventIngestionPath(browserPath)) {
    const workspaceId = browserEventWorkspaceFromRequest(req);
    const origin = req.headers.get("origin");
    const config = await readBrowserEventSourceConfig(env, workspaceId).catch(() => null);
    const allowed = config ? browserOriginAllowed(origin, config.allowed_origins) : false;
    return new Response(null, { status: allowed ? 204 : 403, headers: browserCorsHeaders(origin, allowed) });
  }

  if (req.method === "OPTIONS") return corsPreflight();

  if (path === "/__ping" && req.method === "GET") {
    return json({
      ok: true,
      path,
      now: new Date().toISOString(),
      ...buildFingerprint(env),
    });
  }

  const homeRoute = matchHomeRoute(req.method, path);
  if (homeRoute?.kind === "method_not_allowed") {
    return json({
      ok: false,
      error: "method_not_allowed",
      message: `${homeRoute.path} requires ${homeRoute.allowed_methods.join(", ")}.`,
      allowed_methods: homeRoute.allowed_methods,
    }, 405, { Allow: homeRoute.allowed_methods.join(", ") });
  }

  if (homeRoute?.kind === "home_summary") {
    const auth = adminAuthError(req, env);
    if (auth) return auth;
    try {
      const params = normalizeHomeParams(Object.fromEntries(url.searchParams.entries()));
      return json(await buildHomeSummary(getSupabase(env), params));
    } catch (e: any) {
      return json({ ok: false, error: e?.code || "home_summary_failed", message: e?.message || String(e) }, e?.status || 500);
    }
  }

  const globalSearchRoute = matchGlobalSearchRoute(req.method, path);
  if (globalSearchRoute?.kind === "method_not_allowed") {
    return json({
      ok: false,
      error: "method_not_allowed",
      message: `${globalSearchRoute.path} requires ${globalSearchRoute.allowed_methods.join(", ")}.`,
      allowed_methods: globalSearchRoute.allowed_methods,
    }, 405, { Allow: globalSearchRoute.allowed_methods.join(", ") });
  }

  if (globalSearchRoute?.kind === "global_search") {
    const auth = adminAuthError(req, env);
    if (auth) return auth;
    try {
      const params = normalizeGlobalSearchParams(Object.fromEntries(url.searchParams.entries()));
      return json(await searchWorkspace(getSupabase(env), params));
    } catch (e: any) {
      return json({ ok: false, error: e?.code || "global_search_failed", message: e?.message || String(e) }, e?.status || 500);
    }
  }

  const entityPreviewRoute = matchEntityPreviewRoute(req.method, path);
  if (entityPreviewRoute?.kind === "method_not_allowed") {
    return json({
      ok: false,
      error: "method_not_allowed",
      message: `${entityPreviewRoute.path} requires ${entityPreviewRoute.allowed_methods.join(", ")}.`,
      allowed_methods: entityPreviewRoute.allowed_methods,
    }, 405, { Allow: entityPreviewRoute.allowed_methods.join(", ") });
  }

  if (entityPreviewRoute?.kind === "entity_preview") {
    const auth = adminAuthError(req, env);
    if (auth) return auth;
    try {
      return json(await getEntityPreview(getSupabase(env), {
        workspace_id: url.searchParams.get("workspace_id"),
        entity_type: entityPreviewRoute.entity_type,
        entity_id: entityPreviewRoute.entity_id,
      }));
    } catch (e: any) {
      return json({ ok: false, error: e?.code || "entity_preview_failed", message: e?.message || String(e) }, e?.status || 500);
    }
  }

  const healthRoute = matchHealthRoute(req.method, path);
  if (healthRoute?.kind === "method_not_allowed") {
    return json({
      ok: false,
      error: "method_not_allowed",
      message: `${healthRoute.path} requires ${healthRoute.allowed_methods.join(", ")}.`,
      allowed_methods: healthRoute.allowed_methods,
    }, 405, { Allow: healthRoute.allowed_methods.join(", ") });
  }

  if (healthRoute?.kind === "health_report") {
    const auth = adminAuthError(req, env);
    if (auth) return auth;
    try {
      const params = normalizeHealthParams(Object.fromEntries(url.searchParams.entries()));
      const result = await getWorkspaceHealthReport(getSupabase(env), params);
      const workItems = await syncHealthWorkItems(getSupabase(env), result);
      return json(enrichHealthReportWithWorkItems(result, workItems));
    } catch (e: any) {
      return json({ ok: false, error: e?.code || "health_report_failed", message: e?.message || String(e) }, e?.status || 500);
    }
  }

  const workItemRoute = matchWorkItemRoute(req.method, path);
  if (workItemRoute?.kind === "method_not_allowed") {
    return json({
      ok: false,
      error: "method_not_allowed",
      message: `${workItemRoute.path} requires ${workItemRoute.allowed_methods.join(", ")}.`,
      allowed_methods: workItemRoute.allowed_methods,
    }, 405, { Allow: workItemRoute.allowed_methods.join(", ") });
  }

  if (workItemRoute?.kind === "list_work_items") {
    const auth = adminAuthError(req, env);
    if (auth) return auth;
    try {
      const params = normalizeWorkItemParams(Object.fromEntries(url.searchParams.entries()));
      return json(await listWorkItems(getSupabase(env), params, { sync: false }));
    } catch (e: any) {
      return json({ ok: false, error: e?.code || "work_items_failed", message: e?.message || String(e) }, e?.status || 500);
    }
  }

  if (workItemRoute?.kind === "operations_summary") {
    const auth = adminAuthError(req, env);
    if (auth) return auth;
    try {
      const workspaceId = identityWorkspace(url.searchParams.get("workspace_id"));
      return json(await getOperationsSummary(getSupabase(env), { workspace_id: workspaceId }, { sync: false }));
    } catch (e: any) {
      return json({ ok: false, error: e?.code || "operations_summary_failed", message: e?.message || String(e) }, e?.status || 500);
    }
  }

  if (workItemRoute?.kind === "get_work_item") {
    const auth = adminAuthError(req, env);
    if (auth) return auth;
    try {
      const workspaceId = identityWorkspace(url.searchParams.get("workspace_id"));
      return json(await getWorkItemDetail(getSupabase(env), {
        workspace_id: workspaceId,
        work_item_id: workItemRoute.work_item_id,
      }));
    } catch (e: any) {
      return json({ ok: false, error: e?.code || "work_item_lookup_failed", message: e?.message || String(e) }, e?.status || 500);
    }
  }

  if (
    workItemRoute?.kind === "acknowledge"
    || workItemRoute?.kind === "start"
    || workItemRoute?.kind === "assign"
    || workItemRoute?.kind === "priority"
    || workItemRoute?.kind === "resolve"
    || workItemRoute?.kind === "dismiss"
    || workItemRoute?.kind === "reopen"
    || workItemRoute?.kind === "add_note"
  ) {
    const auth = adminAuthError(req, env);
    if (auth) return auth;
    try {
      const body = await readJsonBody(req);
      const workspaceId = identityWorkspace(body?.workspace_id || body?.workspaceId || url.searchParams.get("workspace_id"));
      const action = workItemRoute.kind === "add_note" ? "note" : workItemRoute.kind === "acknowledge" ? "acknowledge" : workItemRoute.kind;
      const supabase = getSupabase(env);
      return json(await mutateWorkItem(supabase, {
        workspace_id: workspaceId,
        work_item_id: workItemRoute.work_item_id,
        action: action as any,
        actor_id: body?.actor_id || body?.actorId || body?.user_id || body?.userId || null,
        assigned_to: body?.assigned_to ?? body?.assignedTo ?? null,
        priority: body?.priority ?? null,
        body: body?.body ?? body?.note ?? null,
        resolution_code: body?.resolution_code || body?.resolutionCode || null,
        resolution_note: body?.resolution_note || body?.resolutionNote || body?.body || null,
        on_domain_event: async (event) => {
          await publishDomainEvent(supabase, event);
        },
      }));
    } catch (e: any) {
      return json({ ok: false, error: e?.code || "work_item_update_failed", message: e?.message || String(e) }, e?.status || 500);
    }
  }

  const notificationRoute = matchNotificationRoute(req.method, path);
  if (notificationRoute?.kind === "method_not_allowed") {
    return json({
      ok: false,
      error: "method_not_allowed",
      message: `${notificationRoute.path} requires ${notificationRoute.allowed_methods.join(", ")}.`,
      allowed_methods: notificationRoute.allowed_methods,
    }, 405, { Allow: notificationRoute.allowed_methods.join(", ") });
  }

  if (notificationRoute?.kind === "list_notifications") {
    const auth = adminAuthError(req, env);
    if (auth) return auth;
    try {
      const params = normalizeNotificationParams(Object.fromEntries(url.searchParams.entries()));
      const result = await getWorkspaceNotificationReport(getSupabase(env), params);
      return json(result);
    } catch (e: any) {
      return json({ ok: false, error: e?.code || "notifications_failed", message: e?.message || String(e) }, e?.status || 500);
    }
  }

  if (notificationRoute?.kind === "get_notification") {
    const auth = adminAuthError(req, env);
    if (auth) return auth;
    try {
      const workspaceId = String(url.searchParams.get("workspace_id") || "default").trim() || "default";
      const notification = await getWorkspaceNotification(getSupabase(env), {
        workspace_id: workspaceId,
        notification_id: notificationRoute.notification_id,
      });
      if (!notification) return json({ ok: false, error: "notification_not_found" }, 404);
      return json({ ok: true, workspace_id: workspaceId, notification });
    } catch (e: any) {
      return json({ ok: false, error: e?.code || "notification_lookup_failed", message: e?.message || String(e) }, e?.status || 500);
    }
  }

  if (notificationRoute?.kind === "mark_read" || notificationRoute?.kind === "dismiss") {
    const auth = adminAuthError(req, env);
    if (auth) return auth;
    try {
      const body = await readJsonBody(req);
      const workspaceId = String(body?.workspace_id || body?.workspaceId || url.searchParams.get("workspace_id") || "default").trim() || "default";
      const notification = await upsertNotificationReadState(getSupabase(env), {
        workspace_id: workspaceId,
        notification_id: notificationRoute.notification_id,
        dismissed: notificationRoute.kind === "dismiss",
      });
      return json({ ok: true, workspace_id: workspaceId, notification });
    } catch (e: any) {
      return json({ ok: false, error: e?.code || "notification_state_update_failed", message: e?.message || String(e) }, e?.status || 500);
    }
  }

  const setupWizardRoute = matchSetupWizardRoute(req.method, path);
  if (setupWizardRoute?.kind === "method_not_allowed") {
    return json({
      ok: false,
      error: "method_not_allowed",
      message: `${setupWizardRoute.path} requires ${setupWizardRoute.allowed_methods.join(", ")}.`,
      allowed_methods: setupWizardRoute.allowed_methods,
    }, 405, { Allow: setupWizardRoute.allowed_methods.join(", ") });
  }

  if (setupWizardRoute?.kind === "get_setup") {
    const auth = adminAuthError(req, env);
    if (auth) return auth;
    try {
      const workspaceId = identityWorkspace(url.searchParams.get("workspace_id"));
      const onboarding = await getWorkspaceOnboardingState(getSupabase(env), workspaceId);
      return json({ ok: true, onboarding });
    } catch (e: any) {
      return json({ ok: false, error: "setup_wizard_lookup_failed", message: e?.message || String(e) }, 500);
    }
  }

  if (setupWizardRoute?.kind === "save_workspace") {
    const auth = adminAuthError(req, env);
    if (auth) return auth;
    try {
      const body = await readJsonBody(req);
      const onboarding = await upsertWorkspaceSetupState(getSupabase(env), body);
      return json({ ok: true, onboarding });
    } catch (e: any) {
      return json({ ok: false, error: "setup_wizard_workspace_save_failed", message: e?.message || String(e) }, 400);
    }
  }

  if (setupWizardRoute?.kind === "save_progress") {
    const auth = adminAuthError(req, env);
    if (auth) return auth;
    try {
      const body = await readJsonBody(req);
      const onboarding = await upsertSetupProgressState(getSupabase(env), body);
      return json({ ok: true, onboarding });
    } catch (e: any) {
      return json({ ok: false, error: "setup_wizard_progress_save_failed", message: e?.message || String(e) }, 400);
    }
  }

  if (browserRoute?.kind === "setup" && req.method === "GET") {
    const auth = adminAuthError(req, env);
    if (auth) return auth;
    const workspaceId = identityWorkspace(url.searchParams.get("workspace_id"));
    const endpoint = `${url.protocol}//${url.host}`;
    const config = await readBrowserEventSourceConfig(env, workspaceId).catch(() => null);
    const supabase = getSupabase(env);
    const [{ data: latestReceived }, { data: latestNormalized }, { count: pendingCount }, { count: errorCount }] = await Promise.all([
      supabase.from(BROWSER_EVENTS_RAW_TABLE).select("event_id,received_at,normalized_event_type,normalization_status,source").eq("workspace_id", workspaceId).order("received_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from(BROWSER_EVENTS_RAW_TABLE).select("event_id,normalized_at,normalized_event_type,normalization_status,source").eq("workspace_id", workspaceId).eq("normalization_status", "normalized").order("normalized_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from(BROWSER_EVENTS_RAW_TABLE).select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("normalization_status", "pending"),
      supabase.from(BROWSER_EVENTS_RAW_TABLE).select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).in("normalization_status", ["error", "review", "invalid"]),
    ]);
    return json({
      ok: true,
      workspace_id: workspaceId,
      write_key_configured: Boolean(config?.public_write_key_hash),
      allowed_origins: config?.allowed_origins || [],
      cross_subdomain_cookie_domain: config?.cross_subdomain_cookie_domain || null,
      install_snippet: browserSetupSnippet({ workspace_id: workspaceId, endpoint }),
      test_event_endpoint: "/v1/browser/events",
      legacy_event_endpoint: "/v1/event",
      last_event_received: latestReceived || null,
      last_event_normalized: latestNormalized || null,
      health: {
        pending_events: Number(pendingCount || 0),
        events_needing_review: Number(errorCount || 0),
      },
      captured_parameter_summary: [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content",
        "utm_term",
        "affiliate_id",
        "affid",
        "aff_id",
        "offer_id",
        "oid",
        "_ef_transaction_id",
        "transaction_id",
        "c1",
        "sub1-sub10",
        "gclid",
        "fbclid",
        "ttclid",
        "msclkid",
        "irclickid",
        "click_id",
      ],
    });
  }

  if (browserRoute?.kind === "setup" && req.method === "POST") {
    const auth = adminAuthError(req, env);
    if (auth) return auth;
    const body = await readJsonBody(req);
    const workspaceId = browserEventWorkspaceFromRequest(req, body);
    const writeKey = journeyText(body.write_key || body.writeKey) || `tk_pub_${crypto.randomUUID().replace(/-/g, "")}`;
    const allowedOrigins = parseAllowedBrowserOrigins(body.allowed_origins || body.allowedOrigins || []);
    if (!allowedOrigins.length) {
      return json({ ok: false, error: "bad_request", message: "allowed_origins is required." }, 400);
    }
    const supabase = getSupabase(env);
    const { error } = await supabase.from("browser_event_sources").upsert({
      workspace_id: workspaceId,
      public_write_key_hash: await browserWriteKeyHash(workspaceId, writeKey),
      allowed_origins: allowedOrigins,
      cross_subdomain_cookie_domain: journeyText(body.cross_subdomain_cookie_domain || body.crossSubdomainCookieDomain) || null,
      rate_limit_per_minute: Math.max(1, Number(body.rate_limit_per_minute || body.rateLimitPerMinute || 120) || 120),
      is_active: body.is_active ?? body.isActive ?? true,
      metadata: {
        created_by: "admin_setup_route",
        sdk_version: "browser-touchpoint-v1",
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id" });
    if (error) throw new Error(`Browser event source setup failed: ${error.message}`);
    return json({
      ok: true,
      workspace_id: workspaceId,
      write_key: writeKey,
      write_key_returned_once: true,
      allowed_origins: allowedOrigins,
      install_snippet: browserSetupSnippet({ workspace_id: workspaceId, endpoint: `${url.protocol}//${url.host}` }),
      test_event_endpoint: "/v1/browser/events",
      legacy_event_endpoint: "/v1/event",
    });
  }

  if (browserRoute?.kind === "method_not_allowed" && browserRoute.route === "browser_event_ingest") {
    const headers = browserCorsHeaders(req.headers.get("origin"), false);
    return json({
      ok: false,
      error: "method_not_allowed",
      message: `${browserPath} requires POST.`,
      allowed_methods: ["POST"],
    }, 405, { ...headers, Allow: "POST" });
  }

  if (browserRoute?.kind === "method_not_allowed" && browserRoute.route === "browser_event_setup") {
    return json({
      ok: false,
      error: "method_not_allowed",
      message: `${browserPath} requires GET, POST.`,
      allowed_methods: ["GET", "POST"],
    }, 405, { Allow: "GET, POST" });
  }

	  if (browserRoute?.kind === "ingest" && req.method === "POST") {
	    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > 65536) return json({ ok: false, error: "payload_too_large", message: "Browser event payload is too large." }, 413);
    const body = await readJsonBody(req);
    const workspaceId = browserEventWorkspaceFromRequest(req, body);
    const validation = await validateBrowserEventRequest(req, env, workspaceId, body);
    if (!validation.ok) return json({ ok: false, error: validation.error, message: validation.message }, validation.status, validation.cors_headers);
    const receivedAt = new Date().toISOString();
    const requestContext = await browserEventRequestContext(req, env, receivedAt, workspaceId);
    const rate = checkBrowserEventRateLimit({
      workspace_id: workspaceId,
      request_hash: journeyText(requestContext.ip_hash || requestContext.origin || "unknown"),
      limit_per_minute: validation.config.rate_limit_per_minute || 120,
    });
    if (!rate.ok) {
      return json({
        ok: false,
        error: "rate_limited",
        message: "Browser event rate limit exceeded.",
        reset_at: rate.reset_at,
      }, 429, validation.cors_headers);
    }
    const normalized = await normalizeBrowserEventForRawStorage(body, {
      received_at: receivedAt,
      event_id_fallback: crypto.randomUUID(),
      request_context: requestContext,
    });
    if (!normalized.ok) return json({ ok: false, error: normalized.error, message: normalized.message }, normalized.status, validation.cors_headers);
    const persisted = await insertBrowserRawEvent(env, normalized.value);
    if (persisted.conflict) {
      console.log("[TraceKit] browser event replay conflict", {
        workspace_id: workspaceId,
        event_id: normalized.value.event_id,
        page_url: safeUrlForDiagnostics(body?.page_url || body?.pageUrl || body?.url),
      });
      return json({ ok: false, error: "event_id_conflict", message: "event_id already exists with a different payload." }, 409, validation.cors_headers);
    }
    let queued: any = { queued: false, reason: "duplicate_event" };
    if (!persisted.duplicate) {
      queued = await startBrowserEventNormalizationRuntimeJob(env, {
        workspace_id: workspaceId,
        event_time: normalized.value.event_time || receivedAt,
      }).catch((error: any) => ({ queued: false, reason: error?.message || String(error) }));
    }
    console.log("[TraceKit] browser event accepted", {
      workspace_id: workspaceId,
      event_id: normalized.value.event_id,
      event_type: normalized.value.normalized_event_type,
      source: normalized.value.source,
      duplicate: persisted.duplicate,
      normalization_queued: Boolean(queued.queued),
      page_url: safeUrlForDiagnostics(body?.page_url || body?.pageUrl || body?.url),
    });
    return json({
      ok: true,
      event_id: normalized.value.event_id,
      status: persisted.duplicate ? "duplicate" : "accepted",
      normalization_queued: Boolean(queued.queued),
      normalization_job_id: queued.job_id || null,
      normalization_task_id: queued.task_id || null,
      warnings: normalized.warnings,
	    }, 202, validation.cors_headers);
	  }

  const domainEventRoute = matchDomainEventRoute(req.method, path);
  if (domainEventRoute?.kind === "method_not_allowed") {
    return json({
      ok: false,
      error: "method_not_allowed",
      message: `${domainEventRoute.path} requires ${domainEventRoute.allowed_methods.join(", ")}.`,
      allowed_methods: domainEventRoute.allowed_methods,
    }, 405, { Allow: domainEventRoute.allowed_methods.join(", ") });
  }

  if (domainEventRoute?.kind === "stream") {
    const auth = adminAuthError(req, env);
    if (auth) return auth;
    const workspaceId = identityWorkspace(url.searchParams.get("workspace_id"));
    return createWorkspaceEventStream(getSupabase(env), {
      workspace_id: workspaceId,
      last_event_id: req.headers.get("Last-Event-ID") || url.searchParams.get("cursor"),
      signal: req.signal,
    });
  }

  if (domainEventRoute?.kind === "replay_projections") {
    const auth = adminAuthError(req, env);
    if (auth) return auth;
    try {
      const body = await readJsonBody(req);
      if (body?.consumer_name || body?.consumerName || body?.from_position || body?.fromPosition || body?.cursor || body?.continue_on_error !== undefined || body?.continueOnError !== undefined) {
        return json({
          ok: false,
          error: "privileged_replay_controls_forbidden",
          message: "Use /v1/internal/events/projections/replay with an administrative reason for consumer overrides or cursor repair.",
        }, 403);
      }
      const workspaceId = identityWorkspace(body?.workspace_id || body?.workspaceId || url.searchParams.get("workspace_id"));
      const result = await projectDomainEventsBatch(getSupabase(env), {
        workspace_id: workspaceId,
        limit: body?.limit,
        continue_on_error: false,
        runner_id: `compat:${crypto.randomUUID()}`,
      });
      await auditDomainEventProjectionReplay(getSupabase(env), {
        workspace_id: workspaceId,
        consumer_name: result.consumer_name,
        action: "routine_run",
        actor: "legacy_replay_route",
        result: {
          events_seen: result.events_seen,
          events_projected: result.events_projected,
          events_failed: result.events_failed,
          locked: Boolean(result.locked),
        },
      }).catch(() => null);
      return json(result);
    } catch (e: any) {
      return json({ ok: false, error: e?.code || "domain_event_projection_replay_failed", message: e?.message || String(e) }, e?.status || 500);
    }
  }

  if (domainEventRoute?.kind === "internal_run_projections") {
    const auth = adminAuthError(req, env);
    if (auth) return auth;
    try {
      const body = await readJsonBody(req);
      const workspaceId = body?.workspace_id || body?.workspaceId || url.searchParams.get("workspace_id");
      const result = await runScheduledDomainEventProjectionReplay(getSupabase(env), {
        workspaces: workspaceId ? [identityWorkspace(workspaceId)] : undefined,
        batch_size: body?.batch_size || body?.batchSize || env.LIVE_WORKSPACE_PROJECTION_BATCH_SIZE,
        max_events: body?.max_events || body?.maxEvents || env.LIVE_WORKSPACE_PROJECTION_MAX_EVENTS,
        max_workspaces: body?.max_workspaces || body?.maxWorkspaces || env.LIVE_WORKSPACE_PROJECTION_MAX_WORKSPACES,
        runner_id: `internal:${crypto.randomUUID()}`,
      });
      return json(result);
    } catch (e: any) {
      return json({ ok: false, error: e?.code || "domain_event_projection_run_failed", message: e?.message || String(e) }, e?.status || 500);
    }
  }

  if (domainEventRoute?.kind === "internal_replay_projections") {
    const auth = adminAuthError(req, env);
    if (auth) return auth;
    try {
      const body = await readJsonBody(req);
      const reason = String(body?.reason || "").trim();
      if (!reason) return json({ ok: false, error: "replay_reason_required", message: "Manual projection repair requires a reason." }, 400);
      const workspaceId = identityWorkspace(body?.workspace_id || body?.workspaceId || url.searchParams.get("workspace_id"));
      const fromPosition = body?.from_position ?? body?.fromPosition ?? body?.cursor ?? null;
      const result = await projectDomainEventsBatch(getSupabase(env), {
        workspace_id: workspaceId,
        consumer_name: body?.consumer_name || body?.consumerName || null,
        from_position: fromPosition,
        limit: body?.limit,
        continue_on_error: Boolean(body?.continue_on_error ?? body?.continueOnError ?? false),
        allow_rewind: true,
        runner_id: `repair:${crypto.randomUUID()}`,
      });
      await auditDomainEventProjectionReplay(getSupabase(env), {
        workspace_id: workspaceId,
        consumer_name: result.consumer_name,
        action: "manual_replay",
        requested_from_position: fromPosition === null || fromPosition === undefined || String(fromPosition).trim() === "" ? null : Number(fromPosition),
        reason,
        actor: req.headers.get("authorization") ? "bearer_admin" : "tk_secret_admin",
        result: {
          events_seen: result.events_seen,
          events_projected: result.events_projected,
          events_failed: result.events_failed,
          locked: Boolean(result.locked),
        },
      }).catch(() => null);
      return json(result);
    } catch (e: any) {
      return json({ ok: false, error: e?.code || "domain_event_projection_manual_replay_failed", message: e?.message || String(e) }, e?.status || 500);
    }
  }

  if (domainEventRoute?.kind === "internal_projection_status") {
    const auth = adminAuthError(req, env);
    if (auth) return auth;
    try {
      return json(await getDomainEventProjectionStatus(getSupabase(env), {
        workspace_id: url.searchParams.get("workspace_id"),
        consumer_name: url.searchParams.get("consumer_name"),
        limit: Number(url.searchParams.get("limit") || 10),
      }));
    } catch (e: any) {
      return json({ ok: false, error: e?.code || "domain_event_projection_status_failed", message: e?.message || String(e) }, e?.status || 500);
    }
  }

	  const eventExplorerRoute = matchEventExplorerRoute(req.method, path);
	  if (eventExplorerRoute?.kind === "method_not_allowed") {
	    return json({
	      ok: false,
	      error: "method_not_allowed",
	      message: `${eventExplorerRoute.path} requires ${eventExplorerRoute.allowed_methods.join(", ")}.`,
	      allowed_methods: eventExplorerRoute.allowed_methods,
	    }, 405, { Allow: eventExplorerRoute.allowed_methods.join(", ") });
	  }

	  if (eventExplorerRoute?.kind === "event_list") {
	    const auth = adminAuthError(req, env);
	    if (auth) return auth;
	    try {
	      const params = normalizeEventExplorerListParams(Object.fromEntries(url.searchParams.entries()));
	      const result = await listEventExplorerEvents(getSupabase(env), params);
	      return json(result);
	    } catch (e: any) {
	      return json({ ok: false, error: e?.code || "event_explorer_failed", message: e?.message || String(e) }, e?.status || 500);
	    }
	  }

	  if (eventExplorerRoute?.kind === "event_detail") {
	    const auth = adminAuthError(req, env);
	    if (auth) return auth;
	    try {
	      const workspaceId = identityWorkspace(url.searchParams.get("workspace_id"));
	      const result = await getEventExplorerEventDetail(getSupabase(env), {
	        workspace_id: workspaceId,
	        event_key: eventExplorerRoute.event_key,
	      });
	      return json(result);
	    } catch (e: any) {
	      return json({ ok: false, error: e?.code || "event_explorer_detail_failed", message: e?.message || String(e) }, e?.status || 500);
	    }
	  }

  const customerExplorerRoute = matchCustomerExplorerRoute(req.method, path);
  if (customerExplorerRoute?.kind === "method_not_allowed") {
    return json({
      ok: false,
      error: "method_not_allowed",
      message: `${customerExplorerRoute.path} requires ${customerExplorerRoute.allowed_methods.join(", ")}.`,
      allowed_methods: customerExplorerRoute.allowed_methods,
    }, 405, { Allow: customerExplorerRoute.allowed_methods.join(", ") });
  }

  if (customerExplorerRoute?.kind === "customer_list") {
    const auth = adminAuthError(req, env);
    if (auth) return auth;
    try {
      const params = normalizeCustomerListParams(Object.fromEntries(url.searchParams.entries()));
      const result = await listCustomers(getSupabase(env), params);
      return json(result);
    } catch (e: any) {
      return json({ ok: false, error: e?.code || "customer_explorer_failed", message: e?.message || String(e) }, e?.status || 500);
    }
  }

  if (customerExplorerRoute?.kind === "customer_detail") {
    const auth = adminAuthError(req, env);
    if (auth) return auth;
    try {
      const workspaceId = identityWorkspace(url.searchParams.get("workspace_id"));
      const result = await getCustomerDetail(getSupabase(env), {
        workspace_id: workspaceId,
        person_id: customerExplorerRoute.person_id,
      });
      return json(result);
    } catch (e: any) {
      return json({ ok: false, error: e?.code || "customer_detail_failed", message: e?.message || String(e) }, e?.status || 500);
    }
  }

  if (customerExplorerRoute?.kind === "customer_journey_detail") {
    const auth = adminAuthError(req, env);
    if (auth) return auth;
    try {
      const params = normalizeCustomerJourneyDetailParams({
        workspace_id: url.searchParams.get("workspace_id"),
        person_id: customerExplorerRoute.person_id,
        journey_id: customerExplorerRoute.journey_id,
        limit: url.searchParams.get("limit"),
        cursor: url.searchParams.get("cursor"),
      });
      const result = await getCustomerJourneyDetail(getSupabase(env), params);
      return json(result);
    } catch (e: any) {
      return json({ ok: false, error: e?.code || "customer_journey_detail_failed", message: e?.message || String(e) }, e?.status || 500);
    }
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

  if (path === "/v1/journey-events/backfill-platform-orders" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const parsed = normalizeJourneyBackfillRequest(body);
      if (!parsed.ok) return json({ ok: false, error: parsed.error, message: parsed.message }, parsed.status);
      const result = await runJourneyPlatformOrderBackfill(env, parsed.value);
      return json(result.body, result.status);
    } catch (e: any) {
      console.error("journey_backfill.failed", {
        message: e?.message || String(e),
      });
      return json({ ok: false, error: "journey_backfill_failed", message: e?.message || String(e) }, e?.status || 500);
    }
  }

  if (path === "/v1/journey-events/backfill-platform-orders" && req.method !== "POST") {
    return json({
      ok: false,
      error: "method_not_allowed",
      message: "/v1/journey-events/backfill-platform-orders requires POST.",
      allowed_methods: ["POST"],
    }, 405, { Allow: "POST" });
  }

  if (path === "/v1/journeys/backfill" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const parsed = normalizeJourneyAssignmentBackfillRequest(body);
      if (!parsed.ok) return json({ ok: false, error: parsed.error, message: parsed.message }, parsed.status);
      const result = await startJourneyAssignmentRuntimeJob(env, {
        ...parsed.value,
        force_new_job: Boolean(body?.force_new_job ?? body?.forceNewJob),
      });
      return json(result.body, result.status);
    } catch (e: any) {
      console.error("journey.backfill.failed", {
        message: e?.message || String(e),
      });
      return json({ ok: false, error: "journey_backfill_failed", message: e?.message || String(e) }, e?.status || 500);
    }
  }

  if (path === "/v1/journeys/backfill" && req.method !== "POST") {
    return json({
      ok: false,
      error: "method_not_allowed",
      message: "/v1/journeys/backfill requires POST.",
      allowed_methods: ["POST"],
    }, 405, { Allow: "POST" });
  }

  if (path === "/v1/attribution/backfill" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const parsed = normalizeAttributionBackfillRequest(body);
      if (!parsed.ok) return json({ ok: false, error: parsed.error, message: parsed.message }, parsed.status);
      const result = await startAttributionBackfillRuntimeJob(env, {
        ...parsed.value,
        force_new_job: Boolean(body?.force_new_job ?? body?.forceNewJob),
      });
      return json(result.body, result.status);
    } catch (e: any) {
      console.error("attribution.backfill.failed", {
        message: e?.message || String(e),
      });
      return json({ ok: false, error: "attribution_backfill_failed", message: e?.message || String(e) }, e?.status || 500);
    }
  }

  if (path === "/v1/attribution/backfill" && req.method !== "POST") {
    return json({
      ok: false,
      error: "method_not_allowed",
      message: "/v1/attribution/backfill requires POST.",
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

  const attributionRoute = matchAttributionRoutes(req.method, path);
  if (attributionRoute?.kind === "journey_attribution") {
    const started = Date.now();
    try {
      const params = normalizeJourneyAttributionParams({
        workspace_id: url.searchParams.get("workspace_id"),
        journey_id: attributionRoute.journey_id,
        model: url.searchParams.get("model"),
        conversion_event_id: url.searchParams.get("conversion_event_id"),
      });
      console.log("attribution.api.requested", {
        workspace_id: params.workspace_id,
        journey_id: params.journey_id,
        models: params.models,
      });
      const result = await getJourneyAttribution(getAttributionRepository(env), params);
      console.log("attribution.api.returned", {
        workspace_id: params.workspace_id,
        journey_id: params.journey_id,
        returned_count: result.conversions.length,
        duration_ms: Date.now() - started,
      });
      return json(result);
    } catch (e: any) {
      return json({ ok: false, error: e?.code || "journey_attribution_failed", message: e?.message || String(e) }, e?.status || 400);
    }
  }

  if (attributionRoute?.kind === "journey_attribution_recalculate") {
    const started = Date.now();
    try {
      const body = await readJsonBody(req);
      const params = normalizeRecalculateJourneyAttributionParams({
        ...body,
        workspace_id: body?.workspace_id ?? body?.workspaceId,
        journey_id: attributionRoute.journey_id,
      });
      console.log("attribution.api.requested", {
        workspace_id: params.workspace_id,
        journey_id: params.journey_id,
        models: params.models,
        action: "recalculate",
      });
      const result = await recalculateJourneyAttribution(getAttributionRepository(env), params, {
        on_domain_event: domainEventPublisher(env),
      });
      console.log("attribution.api.returned", {
        workspace_id: params.workspace_id,
        journey_id: params.journey_id,
        action: "recalculate",
        duration_ms: Date.now() - started,
      });
      return json(result);
    } catch (e: any) {
      return json({ ok: false, error: e?.code || "journey_attribution_recalculate_failed", message: e?.message || String(e) }, e?.status || 400);
    }
  }

  if (attributionRoute?.kind === "person_attribution") {
    const started = Date.now();
    try {
      const params = normalizePersonAttributionParams({
        workspace_id: url.searchParams.get("workspace_id"),
        person_id: attributionRoute.person_id,
        model: url.searchParams.get("model"),
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
        limit: url.searchParams.get("limit"),
        cursor: url.searchParams.get("cursor"),
      });
      console.log("attribution.api.requested", {
        workspace_id: params.workspace_id,
        person_id: params.person_id,
        model: params.model,
        limit: params.limit,
      });
      const result = await getPersonAttribution(getAttributionRepository(env), params);
      console.log("attribution.api.returned", {
        workspace_id: params.workspace_id,
        person_id: params.person_id,
        returned_count: result.attribution.length,
        duration_ms: Date.now() - started,
      });
      return json(result);
    } catch (e: any) {
      return json({ ok: false, error: e?.code || "person_attribution_failed", message: e?.message || String(e) }, e?.status || 400);
    }
  }

  if (attributionRoute?.kind === "method_not_allowed") {
    return json({
      ok: false,
      error: "method_not_allowed",
      message: `${attributionRoute.path} requires ${attributionRoute.allowed_methods.join(", ")}.`,
      allowed_methods: attributionRoute.allowed_methods,
    }, 405, { Allow: attributionRoute.allowed_methods.join(", ") });
  }

  const payoutRoute = matchPayoutRoutes(req.method, path);
  if (payoutRoute?.kind === "get_policy") {
    try {
      const result = await getPayoutAttributionPolicy(getPayoutRepository(env), url.searchParams.get("workspace_id"));
      return json(result);
    } catch (e: any) {
      return json({ ok: false, error: e?.code || "payout_policy_failed", message: e?.message || String(e) }, e?.status || 400);
    }
  }

  if (payoutRoute?.kind === "set_policy") {
    try {
      const body = await readJsonBody(req);
      const parsed = normalizeWorkspaceAttributionPolicyRequest(body);
      if (!parsed.ok) return json({ ok: false, error: parsed.error, message: parsed.message }, parsed.status);
      const result = await setPayoutAttributionPolicy(getPayoutRepository(env), parsed.value);
      return json(result);
    } catch (e: any) {
      return json({ ok: false, error: e?.code || "payout_policy_save_failed", message: e?.message || String(e) }, e?.status || 400);
    }
  }

  if (payoutRoute?.kind === "generate_commissions") {
    try {
      const body = await readJsonBody(req);
      const parsed = normalizePayoutGenerationRequest(body);
      if (!parsed.ok) return json({ ok: false, error: parsed.error, message: parsed.message }, parsed.status);
      const result = await generateAffiliateCommissions(getPayoutRepository(env), parsed.value, {
        on_domain_event: domainEventPublisher(env),
      });
      return json(result);
    } catch (e: any) {
      return json({ ok: false, error: e?.code || "affiliate_commission_generation_failed", message: e?.message || String(e) }, e?.status || 400);
    }
  }

  if (payoutRoute?.kind === "list_commissions") {
    try {
      const parsed = normalizeAffiliateCommissionListParams(Object.fromEntries(url.searchParams.entries()));
      if (!parsed.ok) return json({ ok: false, error: parsed.error, message: parsed.message }, parsed.status);
      const result = await listAffiliateCommissions(getPayoutRepository(env), parsed.value);
      return json(result);
    } catch (e: any) {
      return json({ ok: false, error: e?.code || "affiliate_commission_lookup_failed", message: e?.message || String(e) }, e?.status || 400);
    }
  }

  if (payoutRoute?.kind === "method_not_allowed") {
    return json({
      ok: false,
      error: "method_not_allowed",
      message: `${payoutRoute.path} requires ${payoutRoute.allowed_methods.join(", ")}.`,
      allowed_methods: payoutRoute.allowed_methods,
    }, 405, { Allow: payoutRoute.allowed_methods.join(", ") });
  }

  const personTimelineRoute = matchJourneyTimelineRoute(req.method, path);
  if (personTimelineRoute?.kind === "person_timeline") {
    const started = Date.now();
    const personId = personTimelineRoute.person_id;
    try {
      const params = normalizePersonTimelineParams({
        workspace_id: url.searchParams.get("workspace_id"),
        person_id: personId,
        limit: url.searchParams.get("limit"),
        cursor: url.searchParams.get("cursor"),
        event_type: url.searchParams.get("event_type"),
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
      });
      console.log("person_timeline.requested", {
        workspace_id: params.workspace_id,
        person_id: params.person_id,
        event_type: params.event_type || null,
        limit: params.limit,
      });
      const result = await getPersonTimeline(getJourneyEventRepository(env), params);
      console.log("person_timeline.returned", {
        workspace_id: params.workspace_id,
        person_id: params.person_id,
        returned_count: result.events.length,
        duration_ms: Date.now() - started,
      });
      return json(result);
    } catch (e: any) {
      return json({ ok: false, error: e?.code || "person_timeline_failed", message: e?.message || String(e) }, e?.status || 400);
    }
  }

  if (personTimelineRoute?.kind === "method_not_allowed") {
    return json({
      ok: false,
      error: "method_not_allowed",
      message: `${personTimelineRoute.path} requires GET.`,
      allowed_methods: personTimelineRoute.allowed_methods,
    }, 405, { Allow: personTimelineRoute.allowed_methods.join(", ") });
  }

  const journeyRoute = matchJourneyRoutes(req.method, path);
  if (journeyRoute?.kind === "person_journeys") {
    try {
      const params = normalizePersonJourneysParams({
        workspace_id: url.searchParams.get("workspace_id"),
        person_id: journeyRoute.person_id,
        limit: url.searchParams.get("limit"),
        cursor: url.searchParams.get("cursor"),
      });
      const result = await getPersonJourneys(getJourneyRepository(env), params);
      return json(result);
    } catch (e: any) {
      return json({ ok: false, error: e?.code || "person_journeys_failed", message: e?.message || String(e) }, e?.status || 400);
    }
  }

  if (journeyRoute?.kind === "journey_detail") {
    try {
      const params = normalizeJourneyDetailParams({
        workspace_id: url.searchParams.get("workspace_id"),
        journey_id: journeyRoute.journey_id,
        limit: url.searchParams.get("limit"),
        cursor: url.searchParams.get("cursor"),
      });
      const result = await getJourneyDetail(getJourneyRepository(env), params);
      return json(result);
    } catch (e: any) {
      return json({ ok: false, error: e?.code || "journey_detail_failed", message: e?.message || String(e) }, e?.status || 400);
    }
  }

  if (journeyRoute?.kind === "method_not_allowed") {
    return json({
      ok: false,
      error: "method_not_allowed",
      message: `${journeyRoute.path} requires GET.`,
      allowed_methods: journeyRoute.allowed_methods,
    }, 405, { Allow: journeyRoute.allowed_methods.join(", ") });
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

  if (path === "/v1/admin/connector-runtime/requeue-task" && req.method === "POST") {
	    const authError = adminAuthError(req, env);
	    if (authError) return authError;
	    const body = await readJsonBody(req);
	    const taskId = String(body.task_id || body.taskId || "").trim();
	    const executeInline = Boolean(body.execute_inline ?? body.executeInline);
	    const inlineRecordLimit = connectorRuntimeInlineRecordLimit(body);
	    const inlinePlatformOrderId = connectorRuntimeInlinePlatformOrderId(body);
	    if (!taskId) return json({ ok: false, error: "bad_request", message: "task_id is required." }, 400);
	    if (inlineRecordLimit === "invalid") {
	      return json({ ok: false, error: "bad_request", message: "max_records/record_limit must be a positive integer." }, 400);
	    }
	    if (!executeInline && !env.wowboost_imports) {
	      return json({
	        ok: false,
	        error: "queue_not_configured",
	        message: "wowboost_imports queue binding is missing. Check wrangler.toml.",
      }, 500);
    }

    const task = await getConnectorRuntimeTask(env, taskId);
    if (!task) return json({ ok: false, error: "not_found", message: "Connector runtime task not found." }, 404);
    if (task.status !== "queued") {
      return json({
        ok: false,
        error: "task_not_queued",
        message: "Connector runtime task must be queued before it can be re-enqueued.",
        task_id: task.id,
        status: task.status,
      }, 409);
    }
    if (executeInline && (inlineRecordLimit !== null || inlinePlatformOrderId) && !isIdentityResolveRuntimeTask(task)) {
      return json({
        ok: false,
        error: "unsupported_inline_resolve_limit",
        message: "max_records/record_limit and platform_order_id are currently supported only for Identity Backfill resolve tasks.",
        task_id: task.id,
        task_type: task.task_type,
      }, 400);
    }
    let inlinePlatformOrderIds: string[] | null = null;
    let inlineStartIndex: number | null = null;
    if (executeInline && inlinePlatformOrderId) {
      const payloadIds = connectorRuntimePayloadPlatformOrderIds(task.payload);
      inlineStartIndex = payloadIds.indexOf(inlinePlatformOrderId);
      if (inlineStartIndex < 0) {
        return json({
          ok: false,
          error: "platform_order_id_not_in_task_payload",
          message: "platform_order_id was not found in this task payload.",
          task_id: task.id,
          platform_order_id: inlinePlatformOrderId,
          platform_order_ids: payloadIds.length,
        }, 404);
      }
      inlinePlatformOrderIds = payloadIds.slice(inlineStartIndex);
    }

    const job = await getImportJob(env, task.job_id);
    if (!job) return json({ ok: false, error: "job_not_found", message: "Import job not found for connector runtime task." }, 404);
    const progress = connectorRuntimeProgressFromJob(job);
    const now = new Date().toISOString();
    const decision = connectorRuntimeRequeueTaskDecision({ task, job, progress, now });
    if (!decision.ok) return json({ ok: false, error: decision.error, message: decision.message }, decision.status);

	    if (decision.job_patch) {
	      await updateConnectorRuntimeJobProgress(env, job, decision.job_patch);
	    }

	    if (executeInline) {
	      let inlineTask = inlineRecordLimit !== null || inlinePlatformOrderIds
	        ? {
	          ...task,
	          payload: {
	            ...(task.payload || {}),
	            ...(inlinePlatformOrderIds ? { platform_order_ids: inlinePlatformOrderIds } : {}),
	            inline_record_limit: inlineRecordLimit,
	            inline_keep_task_queued_on_limit: true,
	          },
	        } as ConnectorImportTaskRow
	        : task;
	      const inlineDiagnostics = connectorRuntimeTaskDiagnosticState(inlineTask);
	      await heartbeatConnectorRuntimeQueueEvent(env, inlineTask, inlineDiagnostics, "connector_runtime.inline.execute.before", {
	        runtime_task_id: inlineTask.id,
	        execute_inline: true,
	        max_records: inlineRecordLimit,
	        platform_order_id: inlinePlatformOrderId,
	        inline_start_index: inlineStartIndex,
	      });
	      const refreshedInlineTask = await getConnectorRuntimeTask(env, inlineTask.id);
	      if (refreshedInlineTask) {
	        inlineTask = inlineRecordLimit !== null || inlinePlatformOrderIds
	          ? {
	            ...refreshedInlineTask,
	            payload: {
	              ...(refreshedInlineTask.payload || {}),
	              ...(inlinePlatformOrderIds ? { platform_order_ids: inlinePlatformOrderIds } : {}),
	              inline_record_limit: inlineRecordLimit,
	              inline_keep_task_queued_on_limit: true,
	            },
	          } as ConnectorImportTaskRow
	          : refreshedInlineTask;
	      }
	      const inlineDebugResponseEnabled = Boolean(inlinePlatformOrderId && inlineRecordLimit === 1 && isIdentityResolveRuntimeTask(inlineTask));
	      try {
	        const result = await executeConnectorRuntimeTask(env, inlineTask, { diagnostics: inlineDiagnostics });
	        inlineTask = await getConnectorRuntimeTask(env, inlineTask.id) || inlineTask;
	        const afterDiagnostics = connectorRuntimeTaskDiagnosticState(inlineTask);
	        await heartbeatConnectorRuntimeQueueEvent(env, inlineTask, afterDiagnostics, "connector_runtime.inline.execute.after", {
	          runtime_task_id: inlineTask.id,
	          execute_inline: true,
	          max_records: inlineRecordLimit,
	          platform_order_id: inlinePlatformOrderId,
	          inline_start_index: inlineStartIndex,
	          processed: Number(result?.summary?.processed || 0),
	          remaining_records: Number(result?.summary?.remaining_records || 0),
	          skipped: Boolean(result?.skipped),
	          reason: result?.reason || null,
	        });
	        return json({
	          ok: true,
	          task_id: inlineTask.id,
	          job_id: inlineTask.job_id,
	          enqueued: false,
	          executed_inline: true,
	          max_records: inlineRecordLimit,
	          platform_order_id: inlinePlatformOrderId,
	          inline_start_index: inlineStartIndex,
	          processed: Number(result?.summary?.processed || 0),
	          remaining_records: Number(result?.summary?.remaining_records || 0),
	          diagnostics: inlineDebugResponseEnabled
	            ? compactConnectorRuntimeInlineDebugDiagnostics({
	              summary: inlineDiagnostics.summary,
	              target_diagnostic_events: inlineDiagnostics.target_diagnostic_events,
	              subrequest_tracker: inlineDiagnostics.subrequest_tracker as any,
	              identity_resolution_metrics: inlineDiagnostics.identity_resolution_metrics as any,
	              limit: 50,
	            })
	            : undefined,
	          result,
	        });
	      } catch (error: any) {
	        if (inlineDebugResponseEnabled) {
	          const subrequestLimit = isCloudflareSubrequestLimitError(error);
	          return json({
	            ok: false,
	            error: subrequestLimit ? "worker_subrequest_limit" : "inline_execution_failed",
	            task_id: inlineTask.id,
	            job_id: inlineTask.job_id,
	            enqueued: false,
	            executed_inline: true,
	            max_records: inlineRecordLimit,
	            platform_order_id: inlinePlatformOrderId,
	            inline_start_index: inlineStartIndex,
	            cloudflare_subrequest_limit: subrequestLimit,
	            diagnostics: compactConnectorRuntimeInlineDebugDiagnostics({
	              summary: inlineDiagnostics.summary,
	              target_diagnostic_events: inlineDiagnostics.target_diagnostic_events,
	              subrequest_tracker: inlineDiagnostics.subrequest_tracker as any,
	              identity_resolution_metrics: inlineDiagnostics.identity_resolution_metrics as any,
	              error,
	              limit: 50,
	            }),
	          }, subrequestLimit ? 507 : 500);
	        }
	        inlineTask = await getConnectorRuntimeTask(env, inlineTask.id).catch(() => inlineTask) || inlineTask;
	        const errorDiagnostics = connectorRuntimeTaskDiagnosticState(inlineTask);
	        await heartbeatConnectorRuntimeQueueEvent(env, inlineTask, errorDiagnostics, "connector_runtime.inline.execute.error", {
	          runtime_task_id: inlineTask.id,
	          execute_inline: true,
	          max_records: inlineRecordLimit,
	          platform_order_id: inlinePlatformOrderId,
	          inline_start_index: inlineStartIndex,
	          ...connectorRuntimeQueueErrorDetails(error),
	        }).catch(() => {});
	        throw error;
	      }
	    }

	    const queueDiagnostics = connectorRuntimeTaskDiagnosticState(task);
	    await heartbeatConnectorRuntimeQueueEvent(env, task, queueDiagnostics, "connector_runtime.queue.send.before", {
	      runtime_task_id: task.id,
	    });
	    try {
	      await sendConnectorRuntimeTaskQueueMessage(env, task, decision.message, undefined, queueDiagnostics);
	      await heartbeatConnectorRuntimeQueueEvent(env, task, queueDiagnostics, "connector_runtime.queue.send.after", {
	        runtime_task_id: task.id,
	      });
	    } catch (error: any) {
	      await heartbeatConnectorRuntimeQueueEvent(env, task, queueDiagnostics, "connector_runtime.queue.send.error", {
	        runtime_task_id: task.id,
	        ...connectorRuntimeQueueErrorDetails(error),
	      }).catch(() => {});
	      throw error;
	    }
	    return json({
	      ok: true,
	      task_id: task.id,
      job_id: task.job_id,
      enqueued: true,
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
    if (action === "reconcile-queue") {
      if (!isConnectorRuntimeV1Job(job, progress.connector_id)) {
        return json({ ok: false, error: "not_runtime_job", message: "Only Connector Runtime v1 jobs support queue reconciliation." }, 409);
      }
      const body = await readJsonBody(req).catch(() => ({}));
      const reconciliation = await reconcileConnectorRuntimeJobQueue(env, job, {
        force_republish_queued: Boolean(body.force_republish_queued ?? body.forceRepublishQueued ?? true),
        reason: "manual_job_reconcile_queue",
      });
      return json({
        ok: reconciliation.ok,
        job_id: job.id,
        queue_reconciliation: reconciliation,
        job: await connectorRuntimeJobPayload(env, await getImportJob(env, job.id)),
      }, reconciliation.ok ? 200 : 500);
    }

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
      const reconciliation = await reconcileConnectorRuntimeJobQueue(env, latest, {
        force_republish_queued: true,
        reason: "job_resume",
      });
      if (
        Number((reconciliation as any).queued_republished || 0) > 0 ||
        Number((reconciliation as any).stale_reclaimed || 0) > 0 ||
        Number((reconciliation as any).active_running || 0) > 0
      ) {
        return json({
          ok: true,
          job_id: job.id,
          status: "queued",
          task_ids: (reconciliation as any).task_ids || [],
          queued: Number((reconciliation as any).queued_republished || 0) > 0,
          queue_reconciliation: reconciliation,
          job: await connectorRuntimeJobPayload(env, await getImportJob(env, job.id)),
        });
      }
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
        for (const row of (updatedRows || []) as any[]) {
          await publishReconciliationDomainEvent(env, {
            workspace_id: workspaceId,
            type: "reconciliation.matched",
            case_id: `paypal_commerce_reference:${row.id}`,
            entity_type: "order",
            entity_id: row.matched_platform_order_id || row.matched_order_id || row.transaction_id,
            category: "commerce_reference",
            status: "matched",
            connector_id: "paypal",
            platform: "paypal",
            safe_summary: "PayPal transaction matched to a commerce order by exact commerce reference.",
            occurred_at: new Date().toISOString(),
          });
        }
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
      const started = Date.now();
      function logPhase(name: string) {
        console.log(`[WowBoost Import] ${name}: ${Date.now() - started}ms`);
      }
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
      logPhase("auth complete");

      const exp = await wowBoostExportPage({
        exportBase,
        bearer,
        page,
        pageSize,
        fromYmd: from,
        toYmd: to,
      });
      logPhase("export complete");

      const csvRes = await fetchWithTimeout(exp.link, { method: "GET", headers: { Accept: "text/csv,*/*" } }, 30000);
      const csvText = await readTextSafe(csvRes);
      logPhase("csv downloaded");

      if (!csvRes.ok) {
        throw new Error(`CSV download failed ${csvRes.status}: ${csvText.slice(0, 200)}`);
      }

      const parsed = parseCsv(csvText);
      logPhase("csv parsed");
      console.log({
        page,
        pageSize,
        rows: parsed.rows.length,
        headers: parsed.headers.length,
        csvBytes: csvText.length,
      });
      
      console.log("WOWBOOST CSV HEADERS", parsed.headers);
	  console.log("WOWBOOST FIRST ROW", parsed.rows[0]);

      const upserts = [];
      let current = 0;
      for (const r of parsed.rows) {
        current += 1;
        if (current % 25 === 0) {
          console.log(`[WowBoost Import] processed ${current}/${parsed.rows.length}`);
        }
          const orderId =
            pickField(r, ["Order ID", "OrderId", "OrderID", "order_id", "Id", "ID"]) ||
            pickField(r, ["Order Number", "OrderNumber", "orderNumber"]);

          if (!orderId) continue;

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

          const row = {
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
          if (row) {
            upserts.push(row);
          }
      }
      logPhase("mapping complete");

      const deduped = dedupePlatformOrders(upserts);
      logPhase("dedupe complete");

      const upsertStarted = Date.now();
      if (deduped.length) {
        const { error: upErr } = await supabase
          .from("platform_orders")
          .upsert(deduped as any[], { onConflict: "platform_order_id" });

        if (upErr) throw new Error(upErr.message);
      }
      console.log(`[WowBoost Import] upsert took ${Date.now() - upsertStarted}ms`);
      logPhase("upsert complete");

      const response = {
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
      };
      logPhase("response generated");
      return json(response);
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
  args: { from: string; to: string; page: number; pageSize?: number; connector_job_id?: string | null; filter?: string | null }
) {
  const started = Date.now();
  const pageSize = Math.max(1, Math.min(100, Number(args.pageSize ?? 100)));
  const jobId = args.connector_job_id || null;
  const filter = args.filter ?? null;
  let currentStage = "start";
  let sourceRows = 0;
  let validInRangeRows = 0;
  let dedupedRows = 0;
  let upsertedRows = 0;
  const externalOperationCounters = {
    supabase_rest_calls: 0,
    wowboost_auth_calls: 0,
    wowboost_export_calls: 0,
    csv_download_calls: 0,
    identity_attach_calls: 0,
    final_upsert_calls: 0,
  };
  const identityLookupCounters = createWowBoostIdentityAttachCounters();

  function logStageStart(stage: string, details: Record<string, any> = {}) {
    currentStage = stage;
    console.log("[WowBoost Import] STAGE START", {
      stage,
      elapsed_ms: Date.now() - started,
      page: args.page,
      pageSize,
      ...details,
    });
  }

  function logStageComplete(stage: string, details: Record<string, any> = {}) {
    console.log("[WowBoost Import] STAGE COMPLETE", {
      stage,
      elapsed_ms: Date.now() - started,
      page: args.page,
      pageSize,
      ...details,
    });
  }

  console.log("[WowBoost Import] PAGE START", {
    jobId,
    page: args.page,
    pageSize,
    from: args.from,
    to: args.to,
    filter,
  });

  try {
  const supabase = getSupabase(env);

  const fromMs = Date.parse(`${args.from}T00:00:00.000Z`);
  const toExclusive = new Date(`${args.to}T00:00:00.000Z`);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  const toMs = toExclusive.getTime();

  logStageStart("WowBoost authentication");
  externalOperationCounters.supabase_rest_calls += 1;
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

  externalOperationCounters.wowboost_auth_calls += 1;
  const bearer = await wowSuiteGetBearerToken({ authBase, username, password });
  logStageComplete("WowBoost authentication", {
    credentials_found: Boolean(creds),
    supabase_rest_calls: externalOperationCounters.supabase_rest_calls,
    wowboost_auth_calls: externalOperationCounters.wowboost_auth_calls,
  });

  logStageStart("export request");
  externalOperationCounters.wowboost_export_calls += 1;
  const exp = await wowBoostExportPage({
    exportBase,
    bearer,
    page: args.page,
    pageSize,
    fromYmd: args.from,
    toYmd: args.to,
  });
  logStageComplete("export request", {
    has_more: Boolean(exp.hasMore),
    link_present: Boolean(exp.link),
    wowboost_export_calls: externalOperationCounters.wowboost_export_calls,
  });

  logStageStart("CSV download");
  externalOperationCounters.csv_download_calls += 1;
  const csvRes = await fetchWithTimeout(
    exp.link,
    { method: "GET", headers: { Accept: "text/csv,*/*" } },
    30000
  );

  const csvText = await readTextSafe(csvRes);
  logStageComplete("CSV download", {
    ok: csvRes.ok,
    status: csvRes.status,
    csvBytes: csvText.length,
    csv_download_calls: externalOperationCounters.csv_download_calls,
  });

  if (!csvRes.ok) {
    throw new Error(`CSV download failed ${csvRes.status}: ${csvText.slice(0, 200)}`);
  }

  logStageStart("CSV parse", { csvBytes: csvText.length });
  const parsed = parseCsv(csvText);
  sourceRows = parsed.rows.length;
  logStageComplete("CSV parse", {
    rows: parsed.rows.length,
    headers: parsed.headers.length,
    csvBytes: csvText.length,
  });
  console.log("[WowBoost Import] CSV STATS", {
    page: args.page,
    pageSize,
    rows: parsed.rows.length,
    headers: parsed.headers.length,
    csvBytes: csvText.length,
  });

  logStageStart("row mapping", { sourceRows: parsed.rows.length });
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
  validInRangeRows = validRows.length;
  logStageComplete("row mapping", {
    sourceRows: parsed.rows.length,
    mappedRows: mapped.length,
    validRows: validRows.length,
  });

  logStageStart("deduplication", { validRows: validRows.length });
  const deduped = dedupePlatformOrders(validRows);
  dedupedRows = deduped.length;
  logStageComplete("deduplication", {
    validRows: validRows.length,
    dedupedRows,
    duplicateRows: Math.max(0, validRows.length - dedupedRows),
  });

  logStageStart("attachIdentityToWowBoostPlatformRows()", { inputRows: dedupedRows, deferred_to_runtime: Boolean(deduped.length) });
  const identity = deduped.length
    ? { attempted: 0, linked: 0, review_required: 0, skipped: deduped.length, warnings: ["identity_resolution_deferred_to_runtime"] as string[] }
    : { attempted: 0, linked: 0, review_required: 0, skipped: 0, warnings: [] as string[] };
  logStageComplete("attachIdentityToWowBoostPlatformRows()", {
    inputRows: dedupedRows,
    deferred_to_runtime: Boolean(deduped.length),
    attempted: identity.attempted,
    linked: identity.linked,
    review_required: identity.review_required,
    skipped: identity.skipped,
    warnings: identity.warnings,
    identity_lookup_counters: identityLookupCounters,
  });

  logStageStart("final upsert", { dedupedRows });
  if (deduped.length) {
    const upsertStarted = Date.now();
    externalOperationCounters.supabase_rest_calls += 1;
    externalOperationCounters.final_upsert_calls += 1;
    const { error: upErr } = await supabase
      .from("platform_orders")
      .upsert(deduped as any[], { onConflict: "platform_order_id" });

    if (upErr) throw new Error(upErr.message);
    console.log(`[WowBoost Import] upsert took ${Date.now() - upsertStarted}ms`);
  }
  upsertedRows = dedupedRows;
  logStageComplete("final upsert", {
    dedupedRows,
    upserted: upsertedRows,
    supabase_rest_calls: externalOperationCounters.supabase_rest_calls,
    final_upsert_calls: externalOperationCounters.final_upsert_calls,
  });

  const hasMore =
    sourceRows >= pageSize &&
    validInRangeRows > 0 &&
    Boolean(exp.hasMore);

  console.log("[WowBoost Import] PAGE COMPLETE", {
    page: args.page,
    pageSize,
    fetched: validInRangeRows,
    sourceRows,
    dedupedRows,
    upserted: upsertedRows,
    total_elapsed_ms: Date.now() - started,
    identity_lookup_counters: identityLookupCounters,
    external_operation_counters: externalOperationCounters,
  });

  return {
    fetched: validInRangeRows,
    sourceRows,
    upserted: upsertedRows,
    page: args.page,
    pageSize,
    hasMore,
    nextPage: hasMore ? args.page + 1 : null,
    identity,
  };
  } catch (e: any) {
    console.error("[WowBoost Import] PAGE FAILED", {
      current_stage: currentStage,
      page: args.page,
      pageSize,
      elapsed_ms: Date.now() - started,
      sourceRows,
      validInRangeRows,
      dedupedRows,
      upserted: upsertedRows,
      external_operation_counters: externalOperationCounters,
      identity_lookup_counters: identityLookupCounters,
      message: e?.message || String(e),
      stack: e?.stack,
    });
    throw e;
  }
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
		  console.log("[TraceKit] connector runtime queue", {
		    event: "connector_runtime.queue.consumer.entry",
		    queue_name: CONNECTOR_RUNTIME_QUEUE_NAME,
		    message_count: batch.messages.length,
		    timestamp: new Date().toISOString(),
		  });

		  for (const msg of batch.messages) {
		    const body = msg.body || {};
		    const runtimeTaskId = String(body.runtime_task_id ?? body.task_id ?? "").trim();

			console.log("[WowBoost Queue] MESSAGE BODY", body);

			console.log("[WowBoost Queue] ROUTING", {
			  runtimeTaskId: runtimeTaskId || null,
			  keys: Object.keys(body),
			  jobId: String(body.job_id ?? body.jobId ?? "").trim() || null,
			});

		    const pendingQueueDiagnostics = [
		      {
		        event: "connector_runtime.queue.consumer.entry",
		        details: {
		          runtime_task_id: runtimeTaskId || null,
		          task_id: runtimeTaskId || null,
		          job_id: String(body.job_id ?? body.jobId ?? "").trim() || null,
		          message_count: batch.messages.length,
		        },
		      },
		      {
		        event: "connector_runtime.queue.message.received",
		        details: {
		          runtime_task_id: runtimeTaskId || null,
		          task_id: runtimeTaskId || null,
		          job_id: String(body.job_id ?? body.jobId ?? "").trim() || null,
		          has_runtime_task_id: Boolean(runtimeTaskId),
		        },
		      },
		      {
		        event: "connector_runtime.queue.message.parsed",
		        details: {
		          runtime_task_id: runtimeTaskId || null,
		          task_id: runtimeTaskId || null,
		          job_id: String(body.job_id ?? body.jobId ?? "").trim() || null,
		          task_type: String(body.task_type ?? "").trim() || null,
		          phase: String(body.phase ?? "").trim() || null,
		        },
		      },
		    ];

		    if (runtimeTaskId) {
		      let task: ConnectorImportTaskRow | null = null;
		      let queueDiagnostics: ConnectorRuntimeTaskDiagnosticState | null = null;
		      let executeAlreadyLocked = false;
		      const forceQueueEvent = async (event: string, details: Record<string, any> = {}) => {
		        if (!task) {
		          console.log("[TraceKit] connector runtime queue", connectorRuntimeQueueDiagnosticDetails({
		            runtime_task_id: runtimeTaskId,
		            job_id: String(body.job_id ?? body.jobId ?? "").trim() || null,
		            details: { event, ...details },
		          }));
		          return;
		        }
		        if (!queueDiagnostics) queueDiagnostics = connectorRuntimeTaskDiagnosticState(task);
		        await heartbeatConnectorRuntimeQueueEvent(env, task, queueDiagnostics, event, {
		          runtime_task_id: runtimeTaskId,
		          ...details,
		        });
		      };
		      const ackRuntimeMessage = async (details: Record<string, any> = {}) => {
		        await forceQueueEvent("connector_runtime.queue.message.ack", details).catch(() => {});
		        msg.ack();
		      };
		      try {
			        task = await getConnectorRuntimeTask(env, runtimeTaskId);
			        if (task) {
			          queueDiagnostics = connectorRuntimeTaskDiagnosticState(task);
			          const preserveBrowserRunningLease = isBrowserEventNormalizeRuntimeTask(task) && task.status === "running";
			          if (preserveBrowserRunningLease) {
			            for (const pending of pendingQueueDiagnostics) {
			              console.log("[TraceKit] connector runtime queue", connectorRuntimeQueueDiagnosticDetails({
			                task,
			                runtime_task_id: runtimeTaskId,
			                details: {
			                  ...pending.details,
			                  event: pending.event,
			                  lease_preserved: true,
			                },
			              }));
			            }
			            console.log("[TraceKit] connector runtime queue", connectorRuntimeQueueDiagnosticDetails({
			              task,
			              runtime_task_id: runtimeTaskId,
			              details: {
			                event: "connector_runtime.queue.task.loaded",
			                loaded: true,
			                task_status: task.status,
			                available_at: task.available_at,
			                locked_at: task.locked_at,
			                completed_at: task.completed_at,
			                lease_preserved: true,
			              },
			            }));
			          } else {
			            for (const pending of pendingQueueDiagnostics) {
			              await heartbeatConnectorRuntimeQueueEvent(env, task, queueDiagnostics, pending.event, pending.details);
			            }
			            await heartbeatConnectorRuntimeQueueEvent(env, task, queueDiagnostics, "connector_runtime.queue.task.loaded", {
			              runtime_task_id: runtimeTaskId,
			              loaded: true,
			              task_status: task.status,
			              available_at: task.available_at,
			              locked_at: task.locked_at,
			              completed_at: task.completed_at,
			            });
			          }
			        } else {
		          console.log("[TraceKit] connector runtime queue", connectorRuntimeQueueDiagnosticDetails({
		            runtime_task_id: runtimeTaskId,
		            job_id: String(body.job_id ?? body.jobId ?? "").trim() || null,
		            details: { event: "connector_runtime.queue.task.loaded", loaded: false },
		          }));
		        }
		        if (!task || task.status === "completed" || task.status === "cancelled") {
		          if (task) {
		            await forceQueueEvent("connector_runtime.queue.duplicate_execution_prevented", {
		              reason: `task_${task.status}`,
		            }).catch(() => {});
		          }
		          await ackRuntimeMessage({ reason: !task ? "task_not_found" : `task_${task.status}` });
		          continue;
		        }

		        if (isIdentityResolveRuntimeTask(task) && task.status === "running") {
		          if (isConnectorRuntimeTaskStale(task, { stale_ms: IDENTITY_RESOLVE_TASK_STALE_MS })) {
		            task = await recoverStaleIdentityResolveTask(env, task, { enqueue: false, reason: "queue_redelivery_stale" });
		            queueDiagnostics = connectorRuntimeTaskDiagnosticState(task);
		            if (task.status === "failed") {
		              await ackRuntimeMessage({ reason: "stale_recovery_failed" });
		              continue;
		            }
		          } else {
		            await enqueueConnectorRuntimeTaskWithDelay(env, task, IDENTITY_RESOLVE_TASK_RECHECK_DELAY_SECONDS);
		            await forceQueueEvent("connector_runtime.queue.message.retry", {
		              reason: "identity_resolve_task_already_running",
		              delay_seconds: IDENTITY_RESOLVE_TASK_RECHECK_DELAY_SECONDS,
		            }).catch(() => {});
		            await ackRuntimeMessage({ reason: "identity_resolve_task_already_running" });
		            continue;
		          }
		        }

		        if (isAttributionBackfillRuntimeTask(task) && task.status === "running") {
		          if (isConnectorRuntimeTaskStale(task, { stale_ms: ATTRIBUTION_BACKFILL_TASK_STALE_MS })) {
		            const recovered = await recoverStaleAttributionBackfillTask(env, task, { reason: "queue_redelivery_stale" });
		            if (!recovered) {
		              await ackRuntimeMessage({ reason: "attribution_stale_recovery_race_lost" });
		              continue;
		            }
		            task = recovered;
		            queueDiagnostics = connectorRuntimeTaskDiagnosticState(task);
		            if (task.status === "failed") {
		              await ackRuntimeMessage({ reason: "attribution_stale_recovery_failed" });
		              continue;
		            }
		            executeAlreadyLocked = true;
		          } else {
		            await enqueueConnectorRuntimeTaskWithDelay(env, task, ATTRIBUTION_BACKFILL_TASK_RECHECK_DELAY_SECONDS);
		            await forceQueueEvent("connector_runtime.queue.message.retry", {
		              reason: "attribution_backfill_task_already_running",
		              delay_seconds: ATTRIBUTION_BACKFILL_TASK_RECHECK_DELAY_SECONDS,
		            }).catch(() => {});
		            await ackRuntimeMessage({ reason: "attribution_backfill_task_already_running" });
		            continue;
		          }
		        }

		        if (isBrowserEventNormalizeRuntimeTask(task) && task.status === "running") {
		          if (isConnectorRuntimeTaskStale(task, { stale_ms: BROWSER_EVENT_NORMALIZE_TASK_STALE_MS })) {
		            const lastError = `Recovered stale Browser Event normalization task after missing heartbeat for ${Math.round(BROWSER_EVENT_NORMALIZE_TASK_STALE_MS / 1000)} seconds.`;
		            const decision = connectorRuntimeStaleRunningTaskRecoveryDecision(task, {
		              stale_ms: BROWSER_EVENT_NORMALIZE_TASK_STALE_MS,
		              recovered_event: "browser_event_normalize.stale_recovered",
		              exhausted_event: "browser_event_normalize.stale_exhausted",
		              reason: "queue_redelivery_stale",
		              last_error: lastError,
		            });
		            if (decision.action === "active") {
		              await ackRuntimeMessage({ reason: "browser_event_normalize_stale_race_lost" });
		              continue;
		            }
		            const recovered = await updateConnectorRuntimeTaskIfCurrent(env, task, decision.patch as Record<string, any>);
		            if (!recovered) {
		              await ackRuntimeMessage({ reason: "browser_event_normalize_stale_recovery_race_lost" });
		              continue;
		            }
		            task = recovered;
		            queueDiagnostics = connectorRuntimeTaskDiagnosticState(task);
		            if (task.status === "failed") {
		              await ackRuntimeMessage({ reason: "browser_event_normalize_stale_recovery_failed" });
		              continue;
		            }
		            executeAlreadyLocked = true;
		          } else {
		            await enqueueConnectorRuntimeTaskWithDelay(env, task, BROWSER_EVENT_NORMALIZE_TASK_RECHECK_DELAY_SECONDS);
		            console.log("[TraceKit] connector runtime queue", connectorRuntimeQueueDiagnosticDetails({
		              task,
		              runtime_task_id: runtimeTaskId,
		              details: {
		                event: "connector_runtime.queue.message.retry",
		                reason: "browser_event_normalize_task_already_running",
		                delay_seconds: BROWSER_EVENT_NORMALIZE_TASK_RECHECK_DELAY_SECONDS,
		                lease_preserved: true,
		              },
		            }));
		            msg.ack();
		            continue;
		          }
		        }

		        const availableAt = task.available_at ? Date.parse(task.available_at) : 0;
		        if (availableAt && availableAt > Date.now()) {
		          const delaySeconds = Math.max(1, Math.ceil((availableAt - Date.now()) / 1000));
		          if (env.wowboost_imports) {
		            await sendConnectorRuntimeTaskQueueMessage(env, task, connectorRuntimeTaskMessage({
	              id: task.id,
	              job_id: task.job_id,
	              connector_id: task.connector_id,
	              task_type: task.task_type,
		              phase: task.phase,
		            }), { delaySeconds }, queueDiagnostics);
		          }
		          await forceQueueEvent("connector_runtime.queue.message.retry", {
		            reason: "task_not_available_yet",
		            delay_seconds: delaySeconds,
		            available_at: task.available_at,
		          }).catch(() => {});
		          await ackRuntimeMessage({ reason: "task_not_available_yet", delay_seconds: delaySeconds });
		          continue;
		        }

		        await forceQueueEvent("connector_runtime.queue.execute.before", {
		          runtime_task_id: runtimeTaskId,
		          task_status: task.status,
		        });
		        const taskBeforeExecute = task;
		        const executeResult = await executeConnectorRuntimeTask(env, task, { already_locked: executeAlreadyLocked });
		        task = await getConnectorRuntimeTask(env, task.id).catch(() => task) || task;
		        queueDiagnostics = connectorRuntimeTaskDiagnosticState(task);
		        await forceQueueEvent("connector_runtime.queue.execute.after", {
		          runtime_task_id: runtimeTaskId,
		          skipped: Boolean(executeResult?.skipped),
		          reason: executeResult?.reason || null,
		        });
		        if (!executeResult?.skipped && (Number(taskBeforeExecute.attempt_count || 0) > 1 || taskBeforeExecute.last_error || taskBeforeExecute.status === "retrying")) {
		          await publishConnectorRuntimeIncidentEvent(env, {
		            workspace_id: task.workspace_id,
		            connector_id: task.connector_id,
		            connector_type: task.connector_id,
		            status: "recovered",
		            safe_summary: "Connector Runtime task completed after a prior retry or error.",
		            affected_record_count: 1,
		            job_id: task.job_id,
		            task_id: task.id,
		            occurred_at: new Date().toISOString(),
		          });
		        }
		        await ackRuntimeMessage({ reason: "runtime_task_processed" });
		        continue;
		      } catch (e: any) {
		        const diagnostic = connectorRuntimeErrorSummary(e);
		        task = await getConnectorRuntimeTask(env, runtimeTaskId).catch(() => task);
		        if (task) {
		          queueDiagnostics = connectorRuntimeTaskDiagnosticState(task);
		          await forceQueueEvent("connector_runtime.queue.consumer.error", {
		            runtime_task_id: runtimeTaskId,
		            ...connectorRuntimeQueueErrorDetails(e),
		          }).catch(() => {});
		        }
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
	                } else if (task.connector_id === ATTRIBUTION_BACKFILL_CONNECTOR_ID) {
	                  retryMetadata = {
	                    transient_retries: Number(progress.metadata?.transient_retries || progress.transient_retries || 0) + 1,
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
		              await sendConnectorRuntimeTaskQueueMessage(env, task, connectorRuntimeTaskMessage({
		                id: task.id,
		                job_id: task.job_id,
		                connector_id: task.connector_id,
		                task_type: task.task_type,
		                phase: task.phase,
		              }), { delaySeconds: Math.max(1, Math.ceil(delayMs / 1000)) }, queueDiagnostics);
		            }
		            await forceQueueEvent("connector_runtime.queue.message.retry", {
		              reason: "task_execution_transient_failure",
		              delay_seconds: Math.max(1, Math.ceil(delayMs / 1000)),
		              classification,
		              next_run_at: nextRunAt,
		            }).catch(() => {});
		          } else {
		            await updateConnectorRuntimeTask(env, task.id, {
		              status: "failed",
	              completed_at: new Date().toISOString(),
	              locked_at: null,
	              last_error: diagnostic.last_error,
	            }).catch(() => {});
		            await publishConnectorRuntimeIncidentEvent(env, {
		              workspace_id: task.workspace_id,
		              connector_id: task.connector_id,
		              connector_type: task.connector_id,
		              status: "failed",
		              error_category: classification,
		              safe_summary: diagnostic.last_error,
		              affected_record_count: 1,
		              job_id: task.job_id,
		              task_id: task.id,
		              occurred_at: new Date().toISOString(),
		            });
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
		        await ackRuntimeMessage({ reason: "runtime_task_error_handled", classification });
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

      console.log("[WowBoost Queue] PAGE START", {
        jobId,
        page,
        pageSize,
        attempt,
      });
      const result = await runWowBoostImportPage(env, {
        from: job.from_date,
        to: job.to_date,
        page,
        pageSize,
        connector_job_id: jobId,
        filter: job.filter,
      });
      console.log("[WowBoost Queue] PAGE IMPORT COMPLETE", {
        jobId,
        page,
        fetched: result.fetched,
        upserted: result.upserted,
        hasMore: result.hasMore,
        nextPage: result.nextPage,
        identity: result.identity,
      });

      const fetchedThisPage = Number(result.fetched ?? 0);
      const upsertedThisPage = Number(result.upserted ?? 0);

      const nextFetched = Number(job.fetched ?? 0) + fetchedThisPage;
      const nextUpserted = Number(job.upserted ?? 0) + upsertedThisPage;

      const hasMore = Boolean(result.hasMore);

      console.log("[WowBoost Queue] UPDATING JOB", {
        jobId,
        page,
        hasMore,
        nextFetched,
        nextUpserted,
      });
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
      console.log("[WowBoost Queue] JOB UPDATED", {
        jobId,
        page,
      });

      if (!hasMore && nextUpserted > 0) {
        const identityWorkspaceId = "default";
        const identityPlatforms = ["wowboost"];
        console.log("[WowBoost Queue] IDENTITY BACKFILL ENQUEUE", {
          jobId,
          workspaceId: identityWorkspaceId,
          platforms: identityPlatforms,
          from: job.from_date,
          to: job.to_date,
          importedRows: nextUpserted,
        });
        ctx.waitUntil((async () => {
          try {
            const identityBackfill = await startIdentityBackfillRuntimeJob(env, {
              workspace_id: identityWorkspaceId,
              from: job.from_date,
              to: job.to_date,
              platforms: identityPlatforms,
              batch_size: IDENTITY_BACKFILL_DEFAULT_BATCH_SIZE,
              dry_run: false,
            });
            if (identityBackfill.status >= 400 || identityBackfill.body?.ok === false) {
              console.error("[WowBoost Queue] IDENTITY BACKFILL ENQUEUE FAILED", {
                jobId,
                status: identityBackfill.status,
                error: identityBackfill.body?.error || null,
                message: identityBackfill.body?.message || null,
              });
              return;
            }
            console.log("[WowBoost Queue] IDENTITY BACKFILL ENQUEUED", {
              jobId,
              identityJobId: identityBackfill.body?.job_id || null,
              taskId: identityBackfill.body?.task_id || null,
              status: identityBackfill.body?.status || null,
              phase: identityBackfill.body?.phase || null,
              queued: Boolean(identityBackfill.body?.queued),
              duplicateTaskPrevented: Boolean(identityBackfill.body?.duplicate_task_prevented),
            });
          } catch (e: any) {
            console.error("[WowBoost Queue] IDENTITY BACKFILL ENQUEUE ERROR", {
              jobId,
              message: e?.message || String(e),
              stack: e?.stack,
            });
          }
        })());
      }

      if (hasMore) {
        console.log("[WowBoost Queue] QUEUE NEXT PAGE", {
          jobId,
          currentPage: page,
          nextPage: page + 1,
        });
        await env.wowboost_imports.send({
          job_id: jobId,
          page: page + 1,
          pageSize,
          attempt: 1,
        });
        console.log("[WowBoost Queue] NEXT PAGE QUEUED", {
          jobId,
          nextPage: page + 1,
        });
      }

      console.log("[WowBoost Queue] MESSAGE ACK", {
        jobId,
        page,
      });
      msg.ack();
    } catch (e: any) {
      const message = e?.message || String(e) || "unknown";

      console.error("[WowBoost Queue] PAGE FAILED", {
        jobId,
        page,
        pageSize,
        attempt,
        message,
        stack: e?.stack,
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
    ctx.waitUntil(runScheduledDomainEventProjectionReplay(getSupabase(env), {
      batch_size: Number(env.LIVE_WORKSPACE_PROJECTION_BATCH_SIZE || 0) || undefined,
      max_events: Number(env.LIVE_WORKSPACE_PROJECTION_MAX_EVENTS || 0) || undefined,
      max_workspaces: Number(env.LIVE_WORKSPACE_PROJECTION_MAX_WORKSPACES || 0) || undefined,
      runner_id: `scheduled-worker:${new Date().toISOString()}`,
    }).then((result) => {
      console.log("[TraceKit] scheduled domain event projection replay completed", {
        ok: result.ok,
        workspaces_seen: result.workspaces_seen,
        consumers_seen: result.consumers_seen,
        events_seen: result.events_seen,
        events_projected: result.events_projected,
        events_failed: result.events_failed,
        has_more: result.has_more,
        duration_ms: result.duration_ms,
      });
    }).catch((error) => {
      console.error("[TraceKit] scheduled domain event projection replay failed", {
        message: error?.message || String(error),
        stack: error?.stack || null,
      });
    }));
    ctx.waitUntil(reconcileActiveConnectorRuntimeQueues(env).catch((error) => {
      console.error("[TraceKit] scheduled connector runtime queue reconciliation failed", {
        message: error?.message || String(error),
        stack: error?.stack || null,
      });
    }));
  },
};
