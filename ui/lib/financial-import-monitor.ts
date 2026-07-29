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

export function financialImportMonitorQuery(params: Record<string, string | number | boolean | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "" || value === false) continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return `/api/financial-import-monitor${query ? `?${query}` : ""}`;
}
