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
export type FinancialImportPipelineState =
  | "Healthy"
  | "Review needed"
  | "Critical"
  | "Imports running"
  | "No imports configured"
  | "Partial data";
export type FinancialImportIssueCategory =
  | "failed_imports"
  | "stale_tasks"
  | "never_run"
  | "credential_unavailable"
  | "diagnostic_only"
  | "invalid_records"
  | "stale_import_evidence"
  | "repeated_failures";
export type FinancialImportIssueSeverity = "Critical" | "Review" | "Info";

export type FinancialEventTotal = {
  event_count: number;
  amount: number;
  currency: string | null;
  mixed_currency: boolean;
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
  financial_event_totals: {
    refund: FinancialEventTotal;
    chargeback: FinancialEventTotal;
    chargeback_fee: FinancialEventTotal;
    chargeback_reversal: FinancialEventTotal;
    chargeback_fee_reversal: FinancialEventTotal;
  };
  diagnostics: Array<{
    type: string;
    severity: "info" | "warning" | "critical";
    message: string;
    count?: number;
  }>;
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

export type FinancialImportMonitorResponse = {
  ok: boolean;
  error?: string;
  message?: string;
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
  diagnostics: Array<{
    type: string;
    severity: "info" | "warning" | "critical";
    message: string;
    account_key?: string | null;
    count?: number;
  }>;
  filters: {
    platforms: string[];
    statuses: FinancialImportMonitorStatus[];
    ingestion_modes: FinancialImportMonitorMode[];
  };
  generated_at: string;
};

export type FinancialImportHealthSummary = {
  state: FinancialImportPipelineState;
  label: string;
  description: string;
  configured_accounts: number;
  running_imports: number;
  failed_imports: number;
  accounts_needing_attention: number;
  never_run_accounts: number;
  diagnostic_only_accounts: number;
  imports_last_24h: number;
  last_successful_import: string | null;
};

export type FinancialImportIssueCard = {
  category: FinancialImportIssueCategory;
  title: string;
  severity: FinancialImportIssueSeverity;
  count: number;
  summary: string;
  why_it_matters: string;
  next_step: string;
  account_keys: string[];
};

export type FinancialImportActivityMetric = {
  label: string;
  value: string;
};

export type FinancialImportActivityRow = {
  id: string;
  account_key: string;
  connector: string;
  account: string;
  status: string;
  timestamp: string | null;
  completed_at: string | null;
  heartbeat_at: string | null;
  detail: string;
  metrics: FinancialImportActivityMetric[];
};

function n(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateMs(value: unknown) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : 0;
}

function latestTimestamp(values: Array<string | null | undefined>) {
  return values
    .filter(Boolean)
    .sort((a, b) => dateMs(b) - dateMs(a))[0] || null;
}

function countLabel(value: unknown) {
  if (value === null || value === undefined) return "Not reported";
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return "Not reported";
  return Math.trunc(parsed).toLocaleString("en-US");
}

function accountHasDiagnostic(account: FinancialImportMonitorAccount, pattern: RegExp) {
  return account.diagnostics.some((diagnostic) => pattern.test(diagnostic.type) || pattern.test(diagnostic.message));
}

function accountHasImportError(account: FinancialImportMonitorAccount) {
  return account.diagnostics.some((diagnostic) => diagnostic.type === "import_errors" && diagnostic.severity === "critical");
}

function accountHasBlockingImportError(account: FinancialImportMonitorAccount) {
  return account.status !== "Running" && accountHasImportError(account);
}

function accountIsActiveImporter(account: FinancialImportMonitorAccount) {
  return account.enabled && account.ingestion_mode === "active";
}

function accountNeedsRecentSuccessReview(account: FinancialImportMonitorAccount) {
  return accountIsActiveImporter(account) && account.status === "Waiting";
}

function activeProblemAccounts(accounts: FinancialImportMonitorAccount[]) {
  return new Set(accounts
    .filter((account) =>
      account.status === "Failed" ||
      account.status === "Attention" ||
      account.status === "Never run" ||
      accountNeedsRecentSuccessReview(account) ||
      Boolean(account.current_task?.stale) ||
      accountHasBlockingImportError(account) ||
      accountHasDiagnostic(account, /credential|auth|unavailable/i)
    )
    .map((account) => account.account_key));
}

export function deriveFinancialImportHealth(data: FinancialImportMonitorResponse): FinancialImportHealthSummary {
  const accounts = data.accounts || [];
  const configured = accounts.length;
  const running = accounts.filter((account) => account.status === "Running").length;
  const failed = accounts.filter((account) => account.status === "Failed" || accountHasBlockingImportError(account)).length;
  const stale = accounts.filter((account) => account.current_task?.stale).length;
  const neverRun = accounts.filter((account) => account.status === "Never run" && accountIsActiveImporter(account)).length;
  const staleImportEvidence = accounts.filter(accountNeedsRecentSuccessReview).length;
  const diagnosticOnly = accounts.filter((account) => account.ingestion_mode === "diagnostic_only").length;
  const invalidOrUnmatched = accounts.filter((account) => account.unmatched > 0 || account.missing_affiliate_attribution > 0 || accountHasDiagnostic(account, /invalid_or_rejected_records/i)).length;
  const credentialUnavailable = accounts.filter((account) => accountHasDiagnostic(account, /credential|auth|unavailable/i)).length;
  const problemAccounts = activeProblemAccounts(accounts);
  const lastSuccessful = latestTimestamp(accounts.map((account) => account.last_successful_import));
  const partial = Boolean((data as any).partial);

  if (partial) {
    return {
      state: "Partial data",
      label: "Partial data",
      description: "Some import monitor data could not be loaded, so pipeline health may be incomplete.",
      configured_accounts: configured,
      running_imports: running,
      failed_imports: failed,
      accounts_needing_attention: problemAccounts.size,
      never_run_accounts: neverRun,
      diagnostic_only_accounts: diagnosticOnly,
      imports_last_24h: n(data.summary.imports_last_24h),
      last_successful_import: lastSuccessful,
    };
  }

  if (!configured) {
    return {
      state: "No imports configured",
      label: "No imports configured",
      description: "Add a supported connector to begin importing refunds, chargebacks, and related financial events.",
      configured_accounts: 0,
      running_imports: 0,
      failed_imports: 0,
      accounts_needing_attention: 0,
      never_run_accounts: 0,
      diagnostic_only_accounts: 0,
      imports_last_24h: n(data.summary.imports_last_24h),
      last_successful_import: null,
    };
  }

  if (failed || stale || credentialUnavailable) {
    return {
      state: "Critical",
      label: "Critical",
      description: "At least one import failed, lost its task heartbeat, or cannot authenticate.",
      configured_accounts: configured,
      running_imports: running,
      failed_imports: failed,
      accounts_needing_attention: problemAccounts.size,
      never_run_accounts: neverRun,
      diagnostic_only_accounts: diagnosticOnly,
      imports_last_24h: n(data.summary.imports_last_24h),
      last_successful_import: lastSuccessful,
    };
  }

  if (neverRun || invalidOrUnmatched || n(data.summary.attention_required) > 0) {
    return {
      state: "Review needed",
      label: "Review needed",
      description: "Imports are configured, but some accounts or imported records need operator review.",
      configured_accounts: configured,
      running_imports: running,
      failed_imports: failed,
      accounts_needing_attention: problemAccounts.size || n(data.summary.attention_required),
      never_run_accounts: neverRun,
      diagnostic_only_accounts: diagnosticOnly,
      imports_last_24h: n(data.summary.imports_last_24h),
      last_successful_import: lastSuccessful,
    };
  }

  if (staleImportEvidence) {
    return {
      state: "Review needed",
      label: "Review needed",
      description: "Configured import accounts are idle without recent successful financial import evidence.",
      configured_accounts: configured,
      running_imports: running,
      failed_imports: failed,
      accounts_needing_attention: problemAccounts.size,
      never_run_accounts: neverRun,
      diagnostic_only_accounts: diagnosticOnly,
      imports_last_24h: n(data.summary.imports_last_24h),
      last_successful_import: lastSuccessful,
    };
  }

  if (running) {
    return {
      state: "Imports running",
      label: "Imports running",
      description: "Financial imports are actively processing. Completed history and diagnostics remain visible below.",
      configured_accounts: configured,
      running_imports: running,
      failed_imports: failed,
      accounts_needing_attention: 0,
      never_run_accounts: neverRun,
      diagnostic_only_accounts: diagnosticOnly,
      imports_last_24h: n(data.summary.imports_last_24h),
      last_successful_import: lastSuccessful,
    };
  }

  return {
    state: "Healthy",
    label: "Healthy",
    description: "All enabled connectors are importing successfully, with no failed or stale tasks.",
    configured_accounts: configured,
    running_imports: running,
    failed_imports: failed,
    accounts_needing_attention: 0,
    never_run_accounts: neverRun,
    diagnostic_only_accounts: diagnosticOnly,
    imports_last_24h: n(data.summary.imports_last_24h),
    last_successful_import: lastSuccessful,
  };
}

function issueAccountKeys(accounts: FinancialImportMonitorAccount[], predicate: (account: FinancialImportMonitorAccount) => boolean) {
  return accounts.filter(predicate).map((account) => account.account_key);
}

export function buildFinancialImportIssueCards(data: FinancialImportMonitorResponse): FinancialImportIssueCard[] {
  const accounts = data.accounts || [];
  const failed = issueAccountKeys(accounts, (account) => account.status === "Failed" || accountHasBlockingImportError(account));
  const stale = issueAccountKeys(accounts, (account) => Boolean(account.current_task?.stale));
  const neverRun = issueAccountKeys(accounts, (account) => account.status === "Never run" && accountIsActiveImporter(account));
  const credentialUnavailable = issueAccountKeys(accounts, (account) => accountHasDiagnostic(account, /credential|auth|unavailable/i));
  const diagnosticOnly = issueAccountKeys(accounts, (account) => account.ingestion_mode === "diagnostic_only");
  const staleImportEvidence = issueAccountKeys(accounts, accountNeedsRecentSuccessReview);
  const invalidRecords = accounts.filter((account) =>
    account.unmatched > 0 ||
    account.missing_affiliate_attribution > 0 ||
    accountHasDiagnostic(account, /invalid_or_rejected_records/i)
  );
  const repeatedFailures = accounts.filter((account) =>
    Number(account.current_task?.attempt_count || 0) > 1 ||
    account.diagnostics.some((diagnostic) => diagnostic.type === "import_errors" && Number(diagnostic.count || 0) > 1)
  );
  const invalidCount = invalidRecords.reduce((sum, account) =>
    sum +
    n(account.unmatched) +
    n(account.missing_affiliate_attribution) +
    account.diagnostics.filter((diagnostic) => diagnostic.type === "invalid_or_rejected_records").reduce((inner, diagnostic) => inner + n(diagnostic.count || 1), 0),
  0);

  const cards: FinancialImportIssueCard[] = [
    {
      category: "failed_imports",
      title: "Failed imports",
      severity: "Critical",
      count: failed.length,
      summary: `${failed.length.toLocaleString()} account${failed.length === 1 ? " has" : "s have"} a failed latest import.`,
      why_it_matters: "Failed imports can leave refund, chargeback, fee, or reversal data incomplete.",
      next_step: "Review failed account",
      account_keys: failed,
    },
    {
      category: "stale_tasks",
      title: "Stale running tasks",
      severity: "Critical",
      count: stale.length,
      summary: `${stale.length.toLocaleString()} running task${stale.length === 1 ? " appears" : "s appear"} stale.`,
      why_it_matters: "A stale task may have lost its Worker invocation before persisting completion.",
      next_step: "Review task",
      account_keys: stale,
    },
    {
      category: "never_run",
      title: "Never-run active connectors",
      severity: "Review",
      count: neverRun.length,
      summary: `${neverRun.length.toLocaleString()} active connector account${neverRun.length === 1 ? " has" : "s have"} not completed an import.`,
      why_it_matters: "The account is configured, but no successful financial import history exists yet.",
      next_step: "Review account",
      account_keys: neverRun,
    },
    {
      category: "credential_unavailable",
      title: "Credential unavailable",
      severity: "Critical",
      count: credentialUnavailable.length,
      summary: `${credentialUnavailable.length.toLocaleString()} account${credentialUnavailable.length === 1 ? " has" : "s have"} credential or authentication diagnostics.`,
      why_it_matters: "The connector cannot import reliably until credentials are restored.",
      next_step: "Review credentials",
      account_keys: credentialUnavailable,
    },
    {
      category: "diagnostic_only",
      title: "Diagnostic-only connectors",
      severity: "Info",
      count: diagnosticOnly.length,
      summary: `${diagnosticOnly.length.toLocaleString()} account${diagnosticOnly.length === 1 ? " is" : "s are"} collecting diagnostics without inserting financial events.`,
      why_it_matters: "This is intentional for connectors whose payload mappings are still being validated.",
      next_step: "Review diagnostic account",
      account_keys: diagnosticOnly,
    },
    {
      category: "stale_import_evidence",
      title: "No recent successful import evidence",
      severity: "Review",
      count: staleImportEvidence.length,
      summary: `${staleImportEvidence.length.toLocaleString()} active connector account${staleImportEvidence.length === 1 ? " is" : "s are"} idle without recent successful import evidence.`,
      why_it_matters: "Healthy import status requires a recent successful financial import, not just saved credentials or old history.",
      next_step: "Review idle account",
      account_keys: staleImportEvidence,
    },
    {
      category: "invalid_records",
      title: "Unmatched or invalid records",
      severity: "Review",
      count: invalidCount,
      summary: `${invalidCount.toLocaleString()} imported record signal${invalidCount === 1 ? "" : "s"} need review.`,
      why_it_matters: "Unmatched, invalid, or unattributed financial records can reduce downstream trust.",
      next_step: "Review records",
      account_keys: invalidRecords.map((account) => account.account_key),
    },
    {
      category: "repeated_failures",
      title: "Repeated task failures",
      severity: "Review",
      count: repeatedFailures.length,
      summary: `${repeatedFailures.length.toLocaleString()} account${repeatedFailures.length === 1 ? " has" : "s have"} repeated task attempts or repeated import errors.`,
      why_it_matters: "Repeated retries usually point to a recoverable integration or queue reliability issue.",
      next_step: "Review retry history",
      account_keys: repeatedFailures.map((account) => account.account_key),
    },
  ];
  return cards.filter((card) => card.count > 0);
}

function activityMetrics(account: FinancialImportMonitorAccount): FinancialImportActivityMetric[] {
  const metrics: FinancialImportActivityMetric[] = [];
  if (account.imported_events !== null) metrics.push({ label: "fetched", value: countLabel(account.imported_events) });
  if (account.inserted_events !== null) metrics.push({ label: "inserted", value: countLabel(account.inserted_events) });
  if (account.duplicate_events !== null) metrics.push({ label: "duplicates skipped", value: countLabel(account.duplicate_events) });
  if (account.matched !== null) metrics.push({ label: "matched", value: countLabel(account.matched) });
  if (account.unmatched > 0) metrics.push({ label: "unmatched", value: countLabel(account.unmatched) });
  if (account.errors > 0) metrics.push({ label: "errors", value: countLabel(account.errors) });
  return metrics.length ? metrics : [{ label: "metrics", value: "Not reported" }];
}

export function recentFinancialImportActivity(data: FinancialImportMonitorResponse, limit = 8): FinancialImportActivityRow[] {
  const rows: FinancialImportActivityRow[] = [];
  for (const account of data.accounts || []) {
    if (account.current_task) {
      rows.push({
        id: `task:${account.current_task.id}`,
        account_key: account.account_key,
        connector: account.connector_label,
        account: account.account || "Unknown account",
        status: account.current_task.stale ? "Stale" : account.current_task.status || "Running",
        timestamp: account.current_task.updated_at || account.current_task.locked_at,
        completed_at: null,
        heartbeat_at: account.current_task.updated_at,
        detail: account.current_task.stale ? "Task exceeded its lease or heartbeat window." : `${account.current_task.task_type || "task"} · ${account.current_task.phase || "phase unavailable"}`,
        metrics: activityMetrics(account),
      });
    }
    for (const job of account.recent_jobs || []) {
      rows.push({
        id: `job:${job.id}:${account.account_key}`,
        account_key: account.account_key,
        connector: account.connector_label,
        account: account.account || "Unknown account",
        status: job.status || "Not reported",
        timestamp: job.updated_at || job.completed_at,
        completed_at: job.completed_at,
        heartbeat_at: job.updated_at,
        detail: job.last_error || `${job.job_type || "import job"} · ${job.phase || "phase unavailable"}`,
        metrics: activityMetrics(account),
      });
    }
  }
  return rows
    .sort((a, b) => dateMs(b.timestamp || b.completed_at || b.heartbeat_at) - dateMs(a.timestamp || a.completed_at || a.heartbeat_at))
    .slice(0, limit);
}

export function importMetricLabel(value: unknown) {
  return countLabel(value);
}

export function financialImportMonitorQuery(params: Record<string, string | number | boolean | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "" || value === false) continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return `/api/financial-import-monitor${query ? `?${query}` : ""}`;
}
