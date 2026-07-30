export const FINANCIAL_IMPORT_MONITOR_PATH = "/v1/financial-import-monitor";
// Matches the Connector Runtime stale-task recovery windows currently used for
// identity, attribution, and browser normalization runtime tasks.
export const FINANCIAL_IMPORT_MONITOR_STALE_TASK_MS = 120000;
export const FINANCIAL_IMPORT_MONITOR_LEDGER_LIMIT = 10000;
export const FINANCIAL_IMPORT_MONITOR_MAX_RANGE_DAYS = 366;
export const FINANCIAL_IMPORT_MONITOR_HEALTHY_RECENCY_MS = 86400000;

export const FINANCIAL_MONITOR_LEDGER_TYPES = [
  "refund",
  "chargeback",
  "chargeback_fee",
  "chargeback_reversal",
  "chargeback_fee_reversal",
] as const;

export type FinancialMonitorLedgerType = (typeof FINANCIAL_MONITOR_LEDGER_TYPES)[number];

export type FinancialImportMonitorStatus =
  | "Healthy"
  | "Running"
  | "Waiting"
  | "Attention"
  | "Failed"
  | "Disabled"
  | "Diagnostic only"
  | "Never run";

export type FinancialImportMonitorMode = "active" | "diagnostic_only" | "unsupported";

export type FinancialImportMonitorParams = {
  workspace_id: string;
  from: string;
  to: string;
  platform: string | null;
  processor_account: string | null;
  status: string | null;
  ingestion_mode: string | null;
  attention_only: boolean;
};

export type FinancialImportMonitorAccount = {
  account_key: string;
  connector: string;
  connector_label: string;
  account: string;
  platform: string;
  processor_account_id: string | null;
  credential_platform: string | null;
  enabled: boolean;
  ingestion_mode: FinancialImportMonitorMode;
  status: FinancialImportMonitorStatus;
  status_reason: string;
  last_successful_import: string | null;
  last_attempted_import: string | null;
  imported_events: number | null;
  inserted_events: number | null;
  duplicate_events: number | null;
  matched: number | null;
  unmatched: number;
  missing_affiliate_attribution: number;
  errors: number;
  current_cursor_window: string | null;
  financial_event_totals: Record<FinancialMonitorLedgerType, { event_count: number; amount: number; currency: string | null; mixed_currency: boolean }>;
  diagnostics: Array<{ type: string; severity: "info" | "warning" | "critical"; message: string; count?: number }>;
  recent_jobs: Array<{
    id: string;
    status: string;
    connector_id: string | null;
    job_type: string | null;
    phase: string | null;
    requested_from: string | null;
    requested_to: string | null;
    updated_at: string | null;
    completed_at: string | null;
    last_error: string | null;
  }>;
  current_task: {
    id: string;
    status: string;
    task_type: string;
    phase: string;
    cursor: string | null;
    page: number | null;
    attempt_count: number;
    max_attempts: number;
    locked_at: string | null;
    updated_at: string | null;
    last_error: string | null;
    stale: boolean;
  } | null;
};

export type FinancialImportMonitorReport = {
  ok: true;
  workspace_id: string;
  range: { from: string; to: string };
  summary: {
    connector_accounts: number;
    healthy: number;
    running: number;
    attention_required: number;
    failed: number;
    unmatched_financial_events: number;
    imports_last_24h: number;
  };
  accounts: FinancialImportMonitorAccount[];
  diagnostics: Array<{ type: string; severity: "info" | "warning" | "critical"; message: string; account_key?: string | null; count?: number }>;
  filters: {
    platforms: string[];
    statuses: FinancialImportMonitorStatus[];
    ingestion_modes: FinancialImportMonitorMode[];
  };
  generated_at: string;
};

type AccountSeed = {
  account_key: string;
  connector: string;
  connector_label: string;
  account: string;
  platform: string;
  processor_account_id: string | null;
  credential_platform: string | null;
  enabled: boolean;
  ingestion_mode: FinancialImportMonitorMode;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function lower(value: unknown) {
  return text(value).toLowerCase();
}

function ymd(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseYmd(value: unknown) {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const ms = Date.parse(`${raw}T00:00:00.000Z`);
  return Number.isFinite(ms) ? raw : null;
}

function defaultRange(now = new Date()) {
  const to = ymd(now);
  const fromDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  fromDate.setUTCDate(fromDate.getUTCDate() - 29);
  return { from: ymd(fromDate), to };
}

export function normalizeFinancialImportMonitorParams(input: Record<string, unknown>, now = new Date()): FinancialImportMonitorParams {
  const fallback = defaultRange(now);
  const from = parseYmd(input.from) || fallback.from;
  const to = parseYmd(input.to) || fallback.to;
  const fromMs = Date.parse(`${from}T00:00:00.000Z`);
  const toMs = Date.parse(`${to}T00:00:00.000Z`);
  const safeToDate = new Date(Date.UTC(
    new Date(Math.max(fromMs, toMs)).getUTCFullYear(),
    new Date(Math.max(fromMs, toMs)).getUTCMonth(),
    new Date(Math.max(fromMs, toMs)).getUTCDate(),
  ));
  const safeFromDate = new Date(Date.UTC(
    new Date(Math.min(fromMs, toMs)).getUTCFullYear(),
    new Date(Math.min(fromMs, toMs)).getUTCMonth(),
    new Date(Math.min(fromMs, toMs)).getUTCDate(),
  ));
  const rangeDays = Math.floor((safeToDate.getTime() - safeFromDate.getTime()) / 86400000) + 1;
  if (rangeDays > FINANCIAL_IMPORT_MONITOR_MAX_RANGE_DAYS) {
    safeFromDate.setTime(safeToDate.getTime() - (FINANCIAL_IMPORT_MONITOR_MAX_RANGE_DAYS - 1) * 86400000);
  }
  return {
    workspace_id: text(input.workspace_id || input.workspaceId || "default") || "default",
    from: ymd(safeFromDate),
    to: ymd(safeToDate),
    platform: lower(input.platform || input.connector) || null,
    processor_account: lower(input.processor_account || input.processorAccount || input.account) || null,
    status: lower(input.status) || null,
    ingestion_mode: lower(input.ingestion_mode || input.ingestionMode || input.mode) || null,
    attention_only: ["1", "true", "yes"].includes(lower(input.attention_only || input.attentionOnly)),
  };
}

function safeJson(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function rowWorkspaceId(row: any) {
  const metadata = safeJson(row?.metadata);
  const progress = safeJson(row?.progress);
  return text(row?.workspace_id ?? progress.workspace_id ?? metadata.workspace_id ?? metadata.workspaceId ?? metadata.workspace ?? "default") || "default";
}

function credentialWorkspaceId(row: any) {
  const metadata = safeJson(row?.metadata);
  return text(metadata.workspace_id ?? metadata.workspaceId ?? metadata.workspace ?? "default") || "default";
}

function connectorLabel(platform: string) {
  if (platform === "paypal" || platform.startsWith("paypal:")) return "PayPal";
  if (platform === "paydiverse" || platform.startsWith("paydiverse:")) return "PayDiverse";
  if (platform.startsWith("nmi:")) return "NMI";
  if (["wowboost", "wowpay", "wowsuite", "wowsuite:wowboost"].includes(platform)) return "WowBoost / WowPay";
  if (platform === "shopify" || platform.startsWith("shopify:")) return "Shopify Payments";
  if (platform === "checkoutchamp" || platform === "konnektive" || platform.startsWith("checkoutchamp:") || platform.startsWith("konnektive:")) return "CheckoutChamp / Konnektive";
  return platform ? platform.replace(/(^|[-_:])\w/g, (part) => part.toUpperCase()) : "Financial Connector";
}

function accountKeyForParts(platform: string, processorAccountId?: string | null, connectorId?: string | null) {
  const normalized = lower(platform) || "unknown";
  if (normalized === "paypal" || normalized.startsWith("paypal:")) return `paypal:${text(processorAccountId || connectorId || normalized) || normalized}`;
  if (normalized.startsWith("nmi:") || normalized === "paydiverse" || normalized.startsWith("paydiverse:")) return normalized;
  if (["wowboost", "wowpay", "wowsuite", "wowsuite:wowboost"].includes(normalized)) return normalized;
  return `${normalized}:${text(processorAccountId || connectorId || normalized) || normalized}`;
}

function isFinancialPlatform(platform: string) {
  return Boolean(platform) && (
    platform === "paypal" ||
    platform.startsWith("paypal:") ||
    platform === "paydiverse" ||
    platform.startsWith("paydiverse:") ||
    platform.startsWith("nmi:") ||
    platform === "wowboost" ||
    platform === "wowpay" ||
    platform === "wowsuite" ||
    platform === "wowsuite:wowboost" ||
    platform === "shopify" ||
    platform.startsWith("shopify:") ||
    platform === "checkoutchamp" ||
    platform === "konnektive" ||
    platform.startsWith("checkoutchamp:") ||
    platform.startsWith("konnektive:") ||
    platform === "stripe" ||
    platform.startsWith("stripe:") ||
    platform === "commas" ||
    platform.startsWith("commas:") ||
    platform === "fanbasis" ||
    platform.startsWith("fanbasis:")
  );
}

function accountFromCredential(row: any): AccountSeed | null {
  const platform = lower(row?.platform);
  if (!isFinancialPlatform(platform)) return null;
  const metadata = safeJson(row?.metadata);
  const processor = text(
    metadata.merchant_account_id ??
      metadata.processor_account_id ??
      metadata.account_id ??
      metadata.shop_domain ??
      metadata.store_domain ??
      platform,
  );
  const enabled = !(
    row?.is_active === false ||
    metadata.is_active === false ||
    metadata.enabled === false ||
    metadata.disabled === true
  );
  const diagnosticOnly = platform.startsWith("nmi:") || platform === "paydiverse" || platform.startsWith("paydiverse:");
  return {
    account_key: accountKeyForParts(platform, processor),
    connector: platform.split(":")[0] || platform,
    connector_label: connectorLabel(platform),
    account: processor || platform,
    platform,
    processor_account_id: processor || null,
    credential_platform: platform,
    enabled,
    ingestion_mode: diagnosticOnly ? "diagnostic_only" : "active",
  };
}

function progressFromJob(job: any) {
  return safeJson(job?.progress);
}

function jobMetadata(job: any) {
  return {
    ...safeJson(progressFromJob(job).metadata),
    ...safeJson(job?.metadata),
  };
}

function accountSeedsFromJob(job: any): AccountSeed[] {
  const progress = progressFromJob(job);
  const metadata = jobMetadata(job);
  const accounts: any[] = [];
  if (Array.isArray(metadata.accounts)) accounts.push(...metadata.accounts);
  const progressAccounts = safeJson((progress as any).accounts);
  accounts.push(...Object.values(progressAccounts));
  if (!accounts.length) {
    const platform = lower(job?.platform || job?.connector_id);
    if (isFinancialPlatform(platform)) {
      accounts.push({
        account_key: accountKeyForParts(platform, null, job?.connector_id),
        platform,
        connector_id: job?.connector_id,
        processor_account_id: job?.connector_id || platform,
      });
    }
  }
  return accounts.map((account) => {
    const platform = lower(account.platform || job?.platform || job?.connector_id);
    const processor = text(account.processor_account_id || account.account_id || account.connector_id || job?.connector_id || platform);
    const key = text(account.account_key) || accountKeyForParts(platform, processor, account.connector_id || job?.connector_id);
    const diagnosticOnly = lower(account.family) === "gateway_classic" || platform.startsWith("nmi:") || platform === "paydiverse" || platform.startsWith("paydiverse:");
    return {
      account_key: key,
      connector: platform.split(":")[0] || platform,
      connector_label: connectorLabel(platform),
      account: processor || key,
      platform,
      processor_account_id: processor || null,
      credential_platform: lower(account.credential_platform) || null,
      enabled: true,
      ingestion_mode: diagnosticOnly ? "diagnostic_only" : "active",
    } as AccountSeed;
  }).filter((account) => isFinancialPlatform(account.platform));
}

function accountSeedFromLedger(row: any): AccountSeed | null {
  const platform = lower(row?.platform || row?.event_source || row?.connector_id);
  if (!isFinancialPlatform(platform)) return null;
  const processor = text(row?.processor_account_id || row?.connector_id || platform);
  return {
    account_key: accountKeyForParts(platform, processor, row?.connector_id),
    connector: platform.split(":")[0] || platform,
    connector_label: connectorLabel(platform),
    account: processor || platform,
    platform,
    processor_account_id: processor || null,
    credential_platform: null,
    enabled: true,
    ingestion_mode: platform.startsWith("nmi:") || platform === "paydiverse" || platform.startsWith("paydiverse:") ? "diagnostic_only" : "active",
  };
}

function mergeSeed(current: AccountSeed | undefined, next: AccountSeed) {
  if (!current) return next;
  return {
    ...current,
    ...next,
    credential_platform: current.credential_platform || next.credential_platform,
    enabled: current.enabled && next.enabled,
    ingestion_mode: current.ingestion_mode === "active" || next.ingestion_mode === "active" ? "active" : current.ingestion_mode,
  } as AccountSeed;
}

function jobAccountKeys(job: any) {
  return new Set(accountSeedsFromJob(job).map((account) => account.account_key));
}

function jobMatchesAccount(job: any, account: AccountSeed) {
  return jobAccountKeys(job).has(account.account_key);
}

function taskBelongsToAccount(task: any, account: AccountSeed) {
  const payload = safeJson(task?.payload);
  const payloadAccount = safeJson(payload.account);
  const payloadKey = text(payloadAccount.account_key) ||
    accountKeyForParts(lower(payloadAccount.platform), text(payloadAccount.processor_account_id || payloadAccount.account_id || payloadAccount.connector_id));
  const candidates = [
    lower(payloadKey),
    lower(task?.connector_id),
  ].filter(Boolean);
  const cursor = lower(task?.cursor);
  return candidates.includes(account.account_key) || Boolean(cursor && (cursor === account.account_key || cursor.startsWith(`${account.account_key}:`)));
}

function ledgerBelongsToAccount(row: any, account: AccountSeed) {
  const seed = accountSeedFromLedger(row);
  if (!seed) return false;
  return seed.account_key === account.account_key;
}

function taskSnapshot(task: any, now: Date) {
  const status = lower(task?.status);
  const summary = safeJson(task?.result_summary);
  const heartbeatMs = Math.max(dateMs(summary.heartbeat_at), dateMs(task?.updated_at), dateMs(task?.locked_at));
  const stale = status === "running" && heartbeatMs > 0 && Math.max(0, now.getTime() - heartbeatMs) >= FINANCIAL_IMPORT_MONITOR_STALE_TASK_MS;
  return {
    id: text(task?.id),
    status: text(task?.status) || "unknown",
    task_type: text(task?.task_type),
    phase: text(task?.phase),
    cursor: text(task?.cursor) || null,
    page: task?.page === null || task?.page === undefined ? null : Number(task.page),
    attempt_count: Number(task?.attempt_count || 0),
    max_attempts: Number(task?.max_attempts || 0),
    locked_at: text(task?.locked_at) || null,
    updated_at: text(task?.updated_at) || null,
    last_error: redactError(task?.last_error),
    stale,
  };
}

function jobSnapshot(job: any) {
  const progress = progressFromJob(job);
  return {
    id: text(job?.id),
    status: text(job?.status || progress.status),
    connector_id: text(job?.connector_id || progress.connector_id) || null,
    job_type: text(job?.job_type || progress.job_type || job?.filter) || null,
    phase: text(job?.phase || progress.phase) || null,
    requested_from: text(job?.requested_from || progress.requested_from || job?.from_date) || null,
    requested_to: text(job?.requested_to || progress.requested_to || job?.to_date) || null,
    updated_at: text(job?.updated_at || progress.updated_at) || null,
    completed_at: text(job?.completed_at || progress.completed_at) || null,
    last_error: redactError(job?.last_error || progress.last_error),
  };
}

function dateMs(value: unknown) {
  const ms = Date.parse(text(value));
  return Number.isFinite(ms) ? ms : 0;
}

function latestByDate<T>(values: T[], selector: (value: T) => unknown): T | null {
  return [...values].sort((a, b) => dateMs(selector(b)) - dateMs(selector(a)))[0] || null;
}

function isSuccessStatus(status: unknown) {
  return ["completed", "completed_with_errors"].includes(lower(status));
}

function isFailedStatus(status: unknown) {
  return ["failed", "cancelled"].includes(lower(status));
}

function isActiveStatus(status: unknown) {
  return ["queued", "running", "retrying", "paused", "importing", "preparing", "reconciling", "finalizing"].includes(lower(status));
}

function accountProgressFromJob(job: any, account: AccountSeed) {
  const progress = progressFromJob(job);
  const accounts = safeJson((progress as any).accounts);
  return safeJson(accounts[account.account_key]);
}

function isFinancialImportJob(job: any, account: AccountSeed) {
  const progress = progressFromJob(job);
  const state = accountProgressFromJob(job, account);
  const descriptor = [
    job?.connector_id,
    job?.job_type,
    job?.phase,
    progress.connector_id,
    progress.job_type,
    progress.phase,
  ].map(lower).join(" ");
  if (/(chargeback|refund|financial|receipt|dispute|ledger|processor|payment|transaction|snapshot|payout|commission|commerce_order_snapshot|order_snapshot_import)/.test(descriptor)) return true;
  return [
    "events_inserted",
    "ledger_inserted",
    "refund_events_inserted",
    "chargeback_events_inserted",
    "financial_events_inserted",
  ].some((name) => state[name] !== undefined || progress[name] !== undefined || job?.[name] !== undefined);
}

function isFinancialImportTask(task: any) {
  const payload = safeJson(task?.payload);
  const descriptor = [
    task?.connector_id,
    task?.task_type,
    task?.phase,
    payload.task_type,
    payload.phase,
  ].map(lower).join(" ");
  return /(chargeback|refund|financial|receipt|dispute|ledger|processor|payment|transaction|snapshot|payout|commission)/.test(descriptor);
}

function accountMetric(jobs: any[], account: AccountSeed, names: string[]) {
  for (const job of jobs) {
    const state = accountProgressFromJob(job, account);
    for (const name of names) {
      if (state[name] !== undefined && state[name] !== null) return Number(state[name] || 0);
    }
  }
  const progress = progressFromJob(jobs[0]);
  for (const name of names) {
    const value = jobs[0]?.[name] ?? progress[name];
    if (value !== undefined && value !== null) return Number(value || 0);
  }
  return null;
}

function currentCursorWindow(jobs: any[], account: AccountSeed) {
  const latest = jobs[0];
  if (!latest) return null;
  const state = accountProgressFromJob(latest, account);
  const progress = progressFromJob(latest);
  const cursor = text(state.current_cursor || state.next_page_token || state.paypal_next_query?.page || progress.current_cursor || latest.current_cursor);
  const page = state.current_page ?? progress.current_page ?? latest.current_page;
  const requestedFrom = text(progress.requested_from || latest.requested_from || latest.from_date);
  const requestedTo = text(progress.requested_to || latest.requested_to || latest.to_date);
  const pieces = [];
  if (cursor) pieces.push(`cursor ${redactError(cursor) || "[redacted]"}`);
  if (page !== null && page !== undefined && text(page)) pieces.push(`page ${page}`);
  if (requestedFrom || requestedTo) pieces.push(`${requestedFrom || "?"} to ${requestedTo || "?"}`);
  return pieces.join(" · ") || null;
}

function hasAffiliateEvidence(row: any) {
  const meta = safeJson(row?.meta);
  return Boolean(
    text(meta.affiliate_id) ||
      text(meta.publisher_id) ||
      text(meta.source_id) ||
      text(meta.sub1) ||
      text(meta.campaign_id) ||
      text(meta.matched_affiliate_id)
  );
}

function diagnosticFlags(row: any) {
  if (Array.isArray(row?.diagnostic_flags)) return row.diagnostic_flags.map(text).filter(Boolean);
  return [];
}

function emptyFinancialTotals() {
  return Object.fromEntries(FINANCIAL_MONITOR_LEDGER_TYPES.map((type) => [type, { event_count: 0, amount: 0, currency: null, mixed_currency: false }])) as Record<FinancialMonitorLedgerType, { event_count: number; amount: number; currency: string | null; mixed_currency: boolean }>;
}

function redactError(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  return raw
    .replace(/https?:\/\/([^/\s:@]+):([^@\s]+)@/gi, "https://[redacted]@")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/Basic\s+[A-Za-z0-9._~+/=-]+/gi, "Basic [redacted]")
    .replace(/([?&](?:client_secret|access_token|refresh_token|password|api[_-]?key|security[_-]?key|token)=)([^&\s]+)/gi, "$1[redacted]")
    .replace(/(client_secret|access_token|refresh_token|password|api[_-]?key|security[_-]?key|token)=([^&\s]+)/gi, "$1=[redacted]")
    .replace(/("(?:client_secret|access_token|refresh_token|password|api[_-]?key|security[_-]?key|token)"\s*:\s*")([^"]+)(")/gi, "$1[redacted]$3")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[redacted-number]")
    .replace(/\+?\b\d[\d\s().-]{8,}\d\b/g, "[redacted-number]")
    .slice(0, 500);
}

export function redactFinancialImportMonitorMessage(value: unknown) {
  return redactError(value) || "Financial Import Monitor failed.";
}

function accountDiagnostics(args: {
  unmatched: number;
  missingAffiliate: number;
  invalid: number;
  duplicate: number;
  doubleDebit: number;
  staleTask: boolean;
  errors: number;
  mode: FinancialImportMonitorMode;
}) {
  const diagnostics: FinancialImportMonitorAccount["diagnostics"] = [];
  if (args.mode === "diagnostic_only") {
    diagnostics.push({ type: "diagnostic_only", severity: "info", message: "Connector is collecting diagnostics only; financial event insertion is disabled." });
  }
  if (args.unmatched) diagnostics.push({ type: "unmatched_financial_events", severity: "warning", message: "Financial events are missing a deterministic platform-order match.", count: args.unmatched });
  if (args.missingAffiliate) diagnostics.push({ type: "missing_affiliate_attribution", severity: "warning", message: "Financial events are missing affiliate/source evidence.", count: args.missingAffiliate });
  if (args.invalid) diagnostics.push({ type: "invalid_or_rejected_records", severity: "warning", message: "Invalid or rejected source records were observed.", count: args.invalid });
  if (args.duplicate) diagnostics.push({ type: "duplicate_source_event", severity: "info", message: "Duplicate source events were skipped by idempotency.", count: args.duplicate });
  if (args.doubleDebit) diagnostics.push({ type: "possible_refund_chargeback_double_debit", severity: "warning", message: "Refund and chargeback events may both debit the same order.", count: args.doubleDebit });
  if (args.staleTask) diagnostics.push({ type: "stale_running_task", severity: "critical", message: "A running Connector Runtime task has exceeded the runtime lease window." });
  if (args.errors) diagnostics.push({ type: "import_errors", severity: "critical", message: "Recent import errors are present.", count: args.errors });
  return diagnostics;
}

function statusForAccount(args: {
  seed: AccountSeed;
  jobs: any[];
  tasks: any[];
  ledgerRows: any[];
  errors: any[];
  now: Date;
  diagnostics: FinancialImportMonitorAccount["diagnostics"];
}): { status: FinancialImportMonitorStatus; reason: string } {
  if (!args.seed.enabled) return { status: "Disabled", reason: "Connector is disabled in saved configuration." };
  if (args.seed.ingestion_mode === "diagnostic_only") return { status: "Diagnostic only", reason: "Insertion is intentionally disabled pending representative payload validation." };
  const currentTask = args.tasks.find((task) => ["queued", "running", "retrying"].includes(lower(task.status)));
  if (currentTask && taskSnapshot(currentTask, args.now).stale) return { status: "Attention", reason: "A running task appears stale." };
  if (currentTask || args.jobs.some((job) => isActiveStatus(job.status || progressFromJob(job).status))) return { status: "Running", reason: "A nonterminal job or task is active." };
  const latestJob = latestByDate(args.jobs, (job) => job.updated_at || progressFromJob(job).updated_at);
  const latestSuccess = latestByDate(args.jobs.filter((job) => isSuccessStatus(job.status || progressFromJob(job).status)), (job) => job.completed_at || job.updated_at);
  const latestFailed = latestByDate(args.jobs.filter((job) => isFailedStatus(job.status || progressFromJob(job).status)), (job) => job.updated_at);
  if (latestFailed && (!latestSuccess || dateMs(latestFailed.updated_at) > dateMs(latestSuccess.completed_at || latestSuccess.updated_at))) {
    return { status: "Failed", reason: "The most recent bounded job failed and no later success supersedes it." };
  }
  if (args.diagnostics.some((diagnostic) => diagnostic.severity === "critical" || diagnostic.severity === "warning")) {
    return { status: "Attention", reason: "Diagnostics require operator review." };
  }
  if (!latestJob && !args.ledgerRows.length) return { status: "Never run", reason: "Configured account has no import history yet." };
  if (latestSuccess && args.now.getTime() - dateMs(latestSuccess.completed_at || latestSuccess.updated_at) <= FINANCIAL_IMPORT_MONITOR_HEALTHY_RECENCY_MS) {
    return { status: "Healthy", reason: "A recent import completed without blocking diagnostics." };
  }
  return { status: "Waiting", reason: "Configured and idle; no current import task is active." };
}

function includeByFilters(account: FinancialImportMonitorAccount, params: FinancialImportMonitorParams) {
  if (params.platform) {
    const haystack = [account.connector, account.platform, account.connector_label].map(lower);
    if (!haystack.some((value) => value.includes(params.platform || ""))) return false;
  }
  if (params.processor_account) {
    const haystack = [account.account_key, account.account, account.processor_account_id].map(lower);
    if (!haystack.some((value) => value.includes(params.processor_account || ""))) return false;
  }
  if (params.status && lower(account.status) !== params.status) return false;
  if (params.ingestion_mode && account.ingestion_mode !== params.ingestion_mode) return false;
  if (params.attention_only && !["Attention", "Failed"].includes(account.status)) return false;
  return true;
}

export function buildFinancialImportMonitorReport(args: {
  params: FinancialImportMonitorParams;
  credentials?: any[];
  settings?: any[];
  jobs?: any[];
  tasks?: any[];
  ledgerRows?: any[];
  errors?: any[];
  now?: Date;
}): FinancialImportMonitorReport {
  const now = args.now || new Date();
  const credentials = (args.credentials || []).filter((row) => credentialWorkspaceId(row) === args.params.workspace_id);
  const settingsLoaded = args.settings !== undefined;
  const settings = args.settings || [];
  const jobs = (args.jobs || []).filter((row) => rowWorkspaceId(row) === args.params.workspace_id);
  const tasks = (args.tasks || []).filter((row) => rowWorkspaceId(row) === args.params.workspace_id);
  const ledgerRows = (args.ledgerRows || []).filter((row) => rowWorkspaceId(row) === args.params.workspace_id);
  const scopedJobIds = new Set(jobs.map((job) => text(job.id)).filter(Boolean));
  const errors = (args.errors || []).filter((row) => scopedJobIds.has(text(row.job_id)));
  const seeds = new Map<string, AccountSeed>();
  for (const row of credentials) {
    const seed = accountFromCredential(row);
    if (seed) seeds.set(seed.account_key, mergeSeed(seeds.get(seed.account_key), seed));
  }
  for (const job of jobs) {
    for (const seed of accountSeedsFromJob(job)) {
      if (isFinancialImportJob(job, seed)) seeds.set(seed.account_key, mergeSeed(seeds.get(seed.account_key), seed));
    }
  }
  for (const row of ledgerRows) {
    const seed = accountSeedFromLedger(row);
    if (seed) seeds.set(seed.account_key, mergeSeed(seeds.get(seed.account_key), seed));
  }
  const settingsByPlatform = new Map(settings.map((row) => [lower(row?.platform), row]));
  for (const [key, seed] of Array.from(seeds.entries())) {
    const setting = settingsByPlatform.get(lower(seed.credential_platform)) || settingsByPlatform.get(lower(seed.platform)) || null;
    const requiresExplicitEnablement = seed.platform === "paypal" || seed.platform.startsWith("paypal:") || seed.platform.startsWith("nmi:") || seed.platform === "paydiverse" || seed.platform.startsWith("paydiverse:");
    if (requiresExplicitEnablement && settingsLoaded) {
      seeds.set(key, {
        ...seed,
        enabled: Boolean(setting?.auto_import_enabled),
      });
    } else if (setting) {
      seeds.set(key, {
        ...seed,
        enabled: seed.enabled && setting.auto_import_enabled !== false,
      });
    }
  }

  const rows: FinancialImportMonitorAccount[] = [];
  for (const seed of Array.from(seeds.values()).sort((a, b) => a.account_key.localeCompare(b.account_key))) {
    const accountJobs = jobs
      .filter((job) => jobMatchesAccount(job, seed))
      .filter((job) => isFinancialImportJob(job, seed))
      .sort((a, b) => dateMs(b.updated_at || progressFromJob(b).updated_at) - dateMs(a.updated_at || progressFromJob(a).updated_at));
    const accountTasks = tasks
      .filter((task) => taskBelongsToAccount(task, seed))
      .filter((task) => isFinancialImportTask(task))
      .sort((a, b) => dateMs(b.updated_at) - dateMs(a.updated_at));
    const accountLedger = ledgerRows.filter((row) => ledgerBelongsToAccount(row, seed));
    const accountErrors = errors.filter((error) => {
      const jobIds = new Set(accountJobs.map((job) => text(job.id)));
      const connectorId = lower(error.connector_id);
      return jobIds.has(text(error.job_id)) || connectorId === seed.account_key || connectorId === lower(seed.processor_account_id);
    });
    const latestSuccessForErrors = latestByDate(accountJobs.filter((job) => isSuccessStatus(job.status || progressFromJob(job).status)), (job) => job.completed_at || job.updated_at);
    const supersededBeforeMs = latestSuccessForErrors ? dateMs(latestSuccessForErrors.completed_at || latestSuccessForErrors.updated_at) : 0;
    const activeErrors = accountErrors.filter((error) => !supersededBeforeMs || dateMs(error.created_at) > supersededBeforeMs);
    const jobErrors = accountJobs.filter((job) => {
      if (!redactError(job.last_error || progressFromJob(job).last_error)) return false;
      return !supersededBeforeMs || dateMs(job.updated_at || progressFromJob(job).updated_at) > supersededBeforeMs;
    });
    const taskErrors = accountTasks.filter((task) => {
      if (!redactError(task.last_error)) return false;
      return !supersededBeforeMs || dateMs(task.updated_at) > supersededBeforeMs;
    });
    const totals = emptyFinancialTotals();
    let unmatched = 0;
    let missingAffiliate = 0;
    let invalid = 0;
    let doubleDebit = 0;
    let duplicateLedger = 0;
    const seenLedgerEvents = new Set<string>();
    for (const event of accountLedger) {
      const ledgerType = lower(event.ledger_type) as FinancialMonitorLedgerType;
      const sourceKey = text(event.source_event_id || event.dispute_id || event.transaction_id || `${event.occurred_at}:${event.amount}:${event.order_id}`);
      const dedupeKey = `${ledgerType}:${lower(event.platform)}:${lower(event.processor_account_id)}:${sourceKey}`;
      if (seenLedgerEvents.has(dedupeKey)) {
        duplicateLedger += 1;
        continue;
      }
      seenLedgerEvents.add(dedupeKey);
      if (ledgerType in totals) {
        totals[ledgerType].event_count += 1;
        totals[ledgerType].amount += Number(event.amount || 0);
        const eventCurrency = text(event.currency).toUpperCase() || null;
        if (eventCurrency) {
          if (!totals[ledgerType].currency && !totals[ledgerType].mixed_currency) {
            totals[ledgerType].currency = eventCurrency;
          } else if (totals[ledgerType].currency !== eventCurrency) {
            totals[ledgerType].currency = null;
            totals[ledgerType].mixed_currency = true;
          }
        }
      }
      const flags = diagnosticFlags(event);
      if (!text(event.order_id) || flags.includes("chargeback_without_matching_sale") || flags.includes("ambiguous_platform_order_match")) unmatched += 1;
      if (!hasAffiliateEvidence(event)) missingAffiliate += 1;
      if (flags.some((flag) => /invalid|rejected/.test(flag))) invalid += 1;
      if (flags.includes("possible_refund_chargeback_double_debit")) doubleDebit += 1;
    }
    const currentTaskRaw = accountTasks.find((task) => ["queued", "running", "retrying"].includes(lower(task.status))) || null;
    const currentTask = currentTaskRaw ? taskSnapshot(currentTaskRaw, now) : null;
    const diagnostics = accountDiagnostics({
      unmatched,
      missingAffiliate,
      invalid,
      duplicate: Number(accountMetric(accountJobs, seed, ["duplicates_skipped", "duplicate_events"]) || 0) + duplicateLedger,
      doubleDebit,
      staleTask: Boolean(currentTask?.stale),
      errors: activeErrors.length + jobErrors.length + taskErrors.length,
      mode: seed.ingestion_mode,
    });
    const latestSourceOrderMs = Math.max(
      0,
      ...accountJobs.map((job) => {
        const metadata = jobMetadata(job);
        return dateMs(metadata.latest_source_order_timestamp);
      }),
    );
    const hasCommerceSnapshotJob = accountJobs.some((job) => {
      const metadata = jobMetadata(job);
      const descriptor = [
        job?.job_type,
        job?.phase,
        metadata.import_mode,
      ].map(lower).join(" ");
      return /commerce_order_snapshot|order_snapshot_import/.test(descriptor);
    });
    if (
      ["wowboost", "wowsuite:wowboost"].includes(seed.platform) &&
      hasCommerceSnapshotJob &&
      (
        latestSourceOrderMs <= 0 ||
        now.getTime() - latestSourceOrderMs > FINANCIAL_IMPORT_MONITOR_HEALTHY_RECENCY_MS
      )
    ) {
      diagnostics.push({
        type: "stale_commerce_snapshot",
        severity: "warning",
        message: latestSourceOrderMs > 0
          ? "Latest imported WowBoost commerce order is older than the freshness window."
          : "WowBoost commerce import has not reported a source order timestamp yet.",
      });
    }
    const status = statusForAccount({
      seed,
      jobs: accountJobs,
      tasks: accountTasks,
      ledgerRows: accountLedger,
      errors: accountErrors,
      now,
      diagnostics,
    });
    const lastSuccessful = latestByDate(accountJobs.filter((job) => isSuccessStatus(job.status || progressFromJob(job).status)), (job) => job.completed_at || job.updated_at);
    const lastAttempted = latestByDate(accountJobs, (job) => job.updated_at || progressFromJob(job).updated_at);
    rows.push({
      account_key: seed.account_key,
      connector: seed.connector,
      connector_label: seed.connector_label,
      account: seed.account,
      platform: seed.platform,
      processor_account_id: seed.processor_account_id,
      credential_platform: seed.credential_platform,
      enabled: seed.enabled,
      ingestion_mode: seed.ingestion_mode,
      status: status.status,
      status_reason: status.reason,
      last_successful_import: lastSuccessful ? text(lastSuccessful.completed_at || lastSuccessful.updated_at) || null : null,
      last_attempted_import: lastAttempted ? text(lastAttempted.updated_at || progressFromJob(lastAttempted).updated_at) || null : null,
      imported_events: accountMetric(accountJobs, seed, ["records_processed", "records_fetched"]),
      inserted_events: accountMetric(accountJobs, seed, ["events_inserted", "records_succeeded", "ledger_inserted"]),
      duplicate_events: accountMetric(accountJobs, seed, ["duplicates_skipped", "records_skipped"]),
      matched: accountMetric(accountJobs, seed, ["matched"]),
      unmatched,
      missing_affiliate_attribution: missingAffiliate,
      errors: diagnostics.filter((diagnostic) => diagnostic.severity === "critical").reduce((sum, item) => sum + Number(item.count || 1), 0),
      current_cursor_window: currentCursorWindow(accountJobs, seed),
      financial_event_totals: totals,
      diagnostics,
      recent_jobs: accountJobs.slice(0, 20).map(jobSnapshot),
      current_task: currentTask,
    });
  }

  const filtered = rows.filter((account) => includeByFilters(account, args.params));
  const importsLast24h = jobs.filter((job) => {
    const jobSeeds = accountSeedsFromJob(job);
    return jobSeeds.some((seed) => isFinancialImportJob(job, seed)) &&
      dateMs(job.updated_at || progressFromJob(job).updated_at) >= now.getTime() - FINANCIAL_IMPORT_MONITOR_HEALTHY_RECENCY_MS;
  }).length;
  const diagnostics = filtered.flatMap((account) => account.diagnostics.map((diagnostic) => ({
    ...diagnostic,
    account_key: account.account_key,
  }))).slice(0, 100);
  const statuses = Array.from(new Set(filtered.map((account) => account.status))).sort() as FinancialImportMonitorStatus[];
  const modes = Array.from(new Set(filtered.map((account) => account.ingestion_mode))).sort() as FinancialImportMonitorMode[];
  const platforms = Array.from(new Set(filtered.map((account) => account.platform))).sort();

  return {
    ok: true,
    workspace_id: args.params.workspace_id,
    range: { from: args.params.from, to: args.params.to },
    summary: {
      connector_accounts: filtered.length,
      healthy: filtered.filter((account) => account.status === "Healthy").length,
      running: filtered.filter((account) => account.status === "Running").length,
      attention_required: filtered.filter((account) => account.status === "Attention" || account.status === "Failed").length,
      failed: filtered.filter((account) => account.status === "Failed").length,
      unmatched_financial_events: filtered.reduce((sum, account) => sum + account.unmatched, 0),
      imports_last_24h: importsLast24h,
    },
    accounts: filtered,
    diagnostics,
    filters: {
      platforms,
      statuses,
      ingestion_modes: modes,
    },
    generated_at: now.toISOString(),
  };
}

export async function getFinancialImportMonitorReport(supabase: any, params: FinancialImportMonitorParams): Promise<FinancialImportMonitorReport> {
  const rangeStart = `${params.from}T00:00:00.000Z`;
  const rangeEnd = new Date(Date.parse(`${params.to}T00:00:00.000Z`) + 86400000).toISOString();
  const credentialsQuery = supabase
    .from("integrations_credentials")
    .select("platform,base_url,metadata,updated_at")
    .order("platform", { ascending: true })
    .limit(500);
  const settingsQuery = supabase
    .from("integrations_settings")
    .select("platform,auto_import_enabled,auto_import_interval_minutes,auto_import_lookback_hours,last_run_at,last_success_at,last_error,updated_at")
    .order("platform", { ascending: true })
    .limit(500);
  const jobsQuery = supabase
    .from("integration_import_jobs")
    .select("id,workspace_id,platform,connector_id,job_type,phase,status,from_date,to_date,requested_from,requested_to,records_discovered,records_processed,records_succeeded,records_failed,records_skipped,current_cursor,current_page,last_error,metadata,progress,requested_at,started_at,updated_at,completed_at")
    .eq("workspace_id", params.workspace_id)
    .order("updated_at", { ascending: false })
    .limit(250);
  const ledgerQuery = supabase
    .from("conversions")
    .select("workspace_id,platform,event_source,connector_id,ledger_type,amount,currency,occurred_at,order_id,transaction_id,parent_transaction_id,processor_account_id,source_event_id,dispute_id,diagnostic_flags,meta")
    .eq("workspace_id", params.workspace_id)
    .in("ledger_type", FINANCIAL_MONITOR_LEDGER_TYPES as unknown as string[])
    .gte("occurred_at", rangeStart)
    .lt("occurred_at", rangeEnd)
    .order("occurred_at", { ascending: false })
    .limit(FINANCIAL_IMPORT_MONITOR_LEDGER_LIMIT);

  const [credentialsResult, settingsResult, jobsResult, ledgerResult] = await Promise.all([credentialsQuery, settingsQuery, jobsQuery, ledgerQuery]);
  if (credentialsResult.error) throw new Error(`Financial import credential read failed: ${credentialsResult.error.message}`);
  if (settingsResult.error) throw new Error(`Financial import settings read failed: ${settingsResult.error.message}`);
  if (jobsResult.error) throw new Error(`Financial import job read failed: ${jobsResult.error.message}`);
  if (ledgerResult.error) throw new Error(`Financial ledger read failed: ${ledgerResult.error.message}`);

  const jobs = jobsResult.data || [];
  const jobIds = jobs.map((job: any) => text(job.id)).filter(Boolean).slice(0, 250);
  let tasks: any[] = [];
  let errors: any[] = [];
  if (jobIds.length) {
    const [tasksResult, errorsResult] = await Promise.all([
      supabase
        .from("connector_import_tasks")
        .select("id,job_id,workspace_id,connector_id,task_type,phase,status,cursor,page,attempt_count,max_attempts,available_at,locked_at,completed_at,last_error,dedupe_key,payload,result_summary,created_at,updated_at")
        .eq("workspace_id", params.workspace_id)
        .in("job_id", jobIds)
        .order("updated_at", { ascending: false })
        .limit(500),
      supabase
        .from("integration_import_errors")
        .select("id,job_id,task_id,connector_id,record_identifier,error_class,http_status,attempt,message,classification,created_at,resolved_at")
        .in("job_id", jobIds)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    if (tasksResult.error) throw new Error(`Financial import task read failed: ${tasksResult.error.message}`);
    if (errorsResult.error) throw new Error(`Financial import error read failed: ${errorsResult.error.message}`);
    tasks = tasksResult.data || [];
    errors = errorsResult.data || [];
  }

  return buildFinancialImportMonitorReport({
    params,
    credentials: credentialsResult.data || [],
    settings: settingsResult.data || [],
    jobs,
    tasks,
    ledgerRows: ledgerResult.data || [],
    errors,
  });
}
