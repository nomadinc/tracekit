export type FinancialReconciliationState = "automatic" | "manual" | "ignored" | "removed" | "unmatched" | "ambiguous";
export type FinancialReconciliationConfidence = "exact" | "high" | "medium" | "conflict" | "none";
export type FinancialReconciliationLedgerType = "refund" | "chargeback" | "chargeback_fee" | "chargeback_reversal" | "chargeback_fee_reversal";

export type FinancialReconciliationItem = {
  id: string;
  event_date: string | null;
  connector: string;
  platform: string | null;
  processor_account_id: string | null;
  event_type: FinancialReconciliationLedgerType;
  amount: number;
  currency: string | null;
  processor_reference: string | null;
  source_event_id: string | null;
  match_status: FinancialReconciliationState;
  reason_unmatched: string | null;
  confidence: FinancialReconciliationConfidence;
  suggested_order: {
    confidence: FinancialReconciliationConfidence;
    method: string | null;
    candidate_order_id: string | null;
    public_order_label: string | null;
    supporting_references: string[];
    conflicts: Array<{ platform_order_id: string | null; order_id: string | null; platform: string | null }>;
    candidate_already_associated: boolean;
  };
  manual_decision: {
    id: string;
    decision_type: string;
    resulting_state: string;
    reason: string | null;
    decided_at: string | null;
  } | null;
  attribution_present: boolean;
  missing_attribution_fields: string[];
  automatic_match_present: boolean;
  needs_review: boolean;
  diagnostic_flags: string[];
};

export type FinancialReconciliationResponse = {
  ok: boolean;
  error?: string;
  message?: string;
  workspace_id: string;
  range: { from: string; to: string };
  capabilities: {
    manual_reconciliation: boolean;
    reason: string | null;
    reason_code?: string | null;
  };
  partial: boolean;
  partial_reason: string | null;
  partial_sections: string[];
  summary: {
    financial_events_reviewed: number;
    matched_events: number;
    match_rate: number | null;
    match_rate_exact: boolean;
    unmatched_events: number;
    missing_attribution: number;
    double_debit_candidates: number;
    duplicate_source_diagnostics: number;
    broken_chains: number;
    needs_review: number;
    totals_by_type: Record<FinancialReconciliationLedgerType, { count: number; amount: number; currency: string | null; mixed_currency: boolean }>;
  };
  items: FinancialReconciliationItem[];
  diagnostics: {
    missing_attribution: FinancialReconciliationItem[];
    double_debit: Array<Record<string, unknown>>;
    duplicates: Array<Record<string, unknown>>;
    broken_chains: Array<Record<string, unknown>>;
  };
  history: Array<{
    id: string;
    timestamp: string | null;
    financial_event_id: string;
    old_state: string | null;
    new_state: string;
    matched_order: string | null;
    method: string;
    confidence: string;
    actor: string | null;
    reason: string | null;
  }>;
  filters: {
    platforms: string[];
    event_types: FinancialReconciliationLedgerType[];
    currencies: string[];
    states: FinancialReconciliationState[];
    confidence: FinancialReconciliationConfidence[];
  };
  pagination: {
    limit: number;
    returned: number;
    total_available: number;
    has_more: boolean;
  };
  config: {
    double_debit_window_days: number;
  };
  generated_at: string;
};

export type FinancialReconciliationDecisionResponse = {
  ok: boolean;
  error?: string;
  message?: string;
  capabilities?: {
    manual_reconciliation: boolean;
    reason: string | null;
  };
  decision?: Record<string, unknown> | null;
};

export function financialReconciliationQuery(params: Record<string, string | number | boolean | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "" || value === false) continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return `/v1/financial-reconciliation${query ? `?${query}` : ""}`;
}
