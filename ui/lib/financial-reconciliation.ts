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

export type FinancialHealthState = "healthy" | "review_needed" | "critical" | "partial" | "no_events";
export type FinancialIssueCategory = "missing_attribution" | "double_debit" | "broken_chain" | "duplicate_evidence" | "unmatched";
export type FinancialIssueSeverity = "Critical" | "Review" | "Informational";

export type FinancialHealthSummary = {
  state: FinancialHealthState;
  label: string;
  description: string;
  matched_label: string;
  issue_label: string;
  reviewed: number;
  matched: number;
  attention_items: number;
  match_health: number | null;
  match_health_exact: boolean;
};

export type FinancialIssueCard = {
  category: FinancialIssueCategory;
  title: string;
  severity: FinancialIssueSeverity;
  count: number;
  summary: string;
  why_it_matters: string;
  next_step: string;
};

export type FinancialWorkQueueItem = {
  id: string;
  category: FinancialIssueCategory;
  severity: FinancialIssueSeverity;
  title: string;
  event_id: string | null;
  order_reference: string;
  reason: string;
  amount: number | null;
  currency: string | null;
  event_date: string | null;
  next_step: string;
};

export type FinancialImpactRow = {
  type: FinancialReconciliationLedgerType;
  label: string;
  amount: number;
  count: number;
  currency: string | null;
  mixed_currency: boolean;
};

export type FinancialNetImpact = {
  amount: number | null;
  currency: string | null;
  mixed_currency: boolean;
  label: string;
};

export type FinancialRecentActivity = {
  id: string;
  title: string;
  event_id: string;
  event_type: FinancialReconciliationLedgerType;
  amount: number;
  currency: string | null;
  event_date: string | null;
  status: string;
  detail: string;
};

const IMPACT_LABELS: Record<FinancialReconciliationLedgerType, string> = {
  refund: "Refunds",
  chargeback: "Chargebacks",
  chargeback_fee: "Chargeback fees",
  chargeback_reversal: "Chargeback reversals",
  chargeback_fee_reversal: "Fee reversals",
};

function n(value: unknown) {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
}

function eventReference(item: FinancialReconciliationItem | undefined | null) {
  if (!item) return "Not reported";
  return item.suggested_order.public_order_label || item.suggested_order.candidate_order_id || item.processor_reference || item.source_event_id || item.id.slice(-8);
}

function eventById(data: FinancialReconciliationResponse) {
  return new Map(data.items.map((item) => [item.id, item]));
}

function duplicateDiagnosticsRequiringReview(data: FinancialReconciliationResponse) {
  return data.diagnostics.duplicates.filter((item) => (item as any).requires_review !== false);
}

function duplicateDiagnosticCount(data: FinancialReconciliationResponse) {
  return Math.max(n(data.summary.duplicate_source_diagnostics), data.diagnostics.duplicates.length);
}

export function deriveFinancialHealth(data: FinancialReconciliationResponse): FinancialHealthSummary {
  const reviewed = n(data.summary.financial_events_reviewed);
  const matched = n(data.summary.matched_events);
  const attention = n(data.summary.needs_review);
  const duplicateReviewCount = duplicateDiagnosticsRequiringReview(data).length;
  const critical = n(data.summary.broken_chains) + duplicateReviewCount;
  const matchHealth = data.summary.match_rate_exact && reviewed ? Math.round(n(data.summary.match_rate) * 100) : null;

  if (data.partial) {
    return {
      state: "partial",
      label: "Partial view",
      description: data.partial_reason || "This report is capped, so exact financial health cannot be shown yet.",
      matched_label: "Match health hidden",
      issue_label: `${attention.toLocaleString()} attention item${attention === 1 ? "" : "s"}`,
      reviewed,
      matched,
      attention_items: attention,
      match_health: null,
      match_health_exact: false,
    };
  }

  if (critical > 0) {
    return {
      state: "critical",
      label: "Critical review",
      description: "Broken chains or conflicting source evidence may affect financial trust until reviewed.",
      matched_label: matchHealth === null ? "Match health unavailable" : `Match health: ${matchHealth}%`,
      issue_label: `${critical.toLocaleString()} critical signal${critical === 1 ? "" : "s"}`,
      reviewed,
      matched,
      attention_items: attention,
      match_health: matchHealth,
      match_health_exact: true,
    };
  }

  if (attention > 0 || n(data.summary.unmatched_events) > 0 || n(data.summary.double_debit_candidates) > 0 || n(data.summary.missing_attribution) > 0) {
    return {
      state: "review_needed",
      label: "Review needed",
      description: "Financial events are present, but some need attribution, matching, or operator review.",
      matched_label: matchHealth === null ? "Match health unavailable" : `Match health: ${matchHealth}%`,
      issue_label: `${attention.toLocaleString()} item${attention === 1 ? "" : "s"} need review`,
      reviewed,
      matched,
      attention_items: attention,
      match_health: matchHealth,
      match_health_exact: true,
    };
  }

  if (!reviewed) {
    return {
      state: "no_events",
      label: "No financial events",
      description: "No refund, chargeback, fee, or reversal events were found for this period.",
      matched_label: "No events reviewed",
      issue_label: "No active issues",
      reviewed,
      matched,
      attention_items: attention,
      match_health: null,
      match_health_exact: true,
    };
  }

  return {
    state: "healthy",
    label: "Healthy",
    description: "All financial events in this period are reconciled, and no critical integrity issues were detected.",
    matched_label: `${matched.toLocaleString()} of ${reviewed.toLocaleString()} events matched`,
    issue_label: "No active issues",
    reviewed,
    matched,
    attention_items: attention,
    match_health: matchHealth,
    match_health_exact: true,
  };
}

export function buildFinancialIssueCards(data: FinancialReconciliationResponse): FinancialIssueCard[] {
  const duplicateTotal = duplicateDiagnosticCount(data);
  const duplicateReviewCount = duplicateDiagnosticsRequiringReview(data).length;
  const duplicateInfoCount = Math.max(0, duplicateTotal - duplicateReviewCount);
  const duplicateSummary = duplicateReviewCount
    ? `${duplicateReviewCount.toLocaleString()} conflicting duplicate signal${duplicateReviewCount === 1 ? "" : "s"} require review${duplicateInfoCount ? `; ${duplicateInfoCount.toLocaleString()} informational duplicate signal${duplicateInfoCount === 1 ? "" : "s"} were also preserved.` : "."}`
    : duplicateTotal
      ? `${duplicateTotal.toLocaleString()} duplicate signal${duplicateTotal === 1 ? "" : "s"} were preserved as informational idempotency evidence.`
      : "No duplicate source signals were detected.";

  return [
    {
      category: "missing_attribution",
      title: "Missing attribution",
      severity: "Review",
      count: n(data.summary.missing_attribution),
      summary: `${n(data.summary.missing_attribution).toLocaleString()} matched financial event${n(data.summary.missing_attribution) === 1 ? " is" : "s are"} missing affiliate or source attribution.`,
      why_it_matters: "These events may be excluded from affiliate-level profitability reporting.",
      next_step: "Review attribution evidence",
    },
    {
      category: "double_debit",
      title: "Double-debit candidates",
      severity: "Review",
      count: n(data.summary.double_debit_candidates),
      summary: `${n(data.summary.double_debit_candidates).toLocaleString()} order${n(data.summary.double_debit_candidates) === 1 ? " appears" : "s appear"} to have both a refund and chargeback within ${data.config.double_debit_window_days} days.`,
      why_it_matters: "Both debits may be legitimate, but the combination should be reviewed before trusting profitability.",
      next_step: "Review affected orders",
    },
    {
      category: "broken_chain",
      title: "Broken financial chains",
      severity: "Critical",
      count: n(data.summary.broken_chains),
      summary: `${n(data.summary.broken_chains).toLocaleString()} fee, reversal, currency, or unmatched chain issue${n(data.summary.broken_chains) === 1 ? "" : "s"} need review.`,
      why_it_matters: "A missing principal event or mismatched reversal may indicate incomplete processor data.",
      next_step: "Review chain evidence",
    },
    {
      category: "duplicate_evidence",
      title: "Duplicate or conflicting evidence",
      severity: duplicateReviewCount ? "Critical" : "Informational",
      count: duplicateTotal,
      summary: duplicateSummary,
      why_it_matters: "Repeated source IDs can be harmless idempotency evidence or possible conflicting duplicate events.",
      next_step: "Review duplicate evidence",
    },
    {
      category: "unmatched",
      title: "Ambiguous or unmatched events",
      severity: "Review",
      count: n(data.summary.unmatched_events) + data.items.filter((item) => item.match_status === "ambiguous").length,
      summary: `${(n(data.summary.unmatched_events) + data.items.filter((item) => item.match_status === "ambiguous").length).toLocaleString()} event${n(data.summary.unmatched_events) === 1 ? "" : "s"} lack a trusted deterministic order match.`,
      why_it_matters: "Unmatched financial events cannot be confidently tied back to sale orders.",
      next_step: "Review deterministic references",
    },
  ];
}

export function buildFinancialWorkQueue(data: FinancialReconciliationResponse, category: FinancialIssueCategory | "all" = "all"): FinancialWorkQueueItem[] {
  const byId = eventById(data);
  const queue = new Map<string, FinancialWorkQueueItem>();
  const add = (entry: FinancialWorkQueueItem) => {
    if (category !== "all" && entry.category !== category) return;
    queue.set(`${entry.category}:${entry.event_id || entry.id}`, entry);
  };
  const addEvent = (item: FinancialReconciliationItem, categoryName: FinancialIssueCategory, severity: FinancialIssueSeverity, reason: string, nextStep: string) => {
    add({
      id: `${categoryName}:${item.id}`,
      category: categoryName,
      severity,
      title: categoryName === "missing_attribution" ? "Missing attribution" : categoryName === "unmatched" ? "Match review" : "Financial review",
      event_id: item.id,
      order_reference: eventReference(item),
      reason,
      amount: item.amount,
      currency: item.currency,
      event_date: item.event_date,
      next_step: nextStep,
    });
  };

  for (const item of data.items) {
    if (item.match_status === "ambiguous" || item.match_status === "unmatched") {
      addEvent(item, "unmatched", "Review", item.reason_unmatched || "No trusted deterministic order match is active.", "Review deterministic references");
    }
    if (["automatic", "manual"].includes(item.match_status) && !item.attribution_present) {
      addEvent(item, "missing_attribution", "Review", "Matched event is missing affiliate or source attribution.", "Review attribution evidence");
    }
    const duplicateFlags = item.diagnostic_flags.filter((flag) => flag.toLowerCase().includes("duplicate"));
    if (duplicateFlags.length) {
      addEvent(item, "duplicate_evidence", "Informational", `Duplicate evidence preserved: ${duplicateFlags.join(", ")}`, "Review source evidence");
    }
  }

  for (let index = 0; index < data.diagnostics.broken_chains.length; index += 1) {
    const chain = data.diagnostics.broken_chains[index];
    const events = Array.isArray((chain as any).events) ? (chain as any).events : [];
    const firstEvent = events.map((event: any) => byId.get(String(event.event_id || ""))).find(Boolean);
    add({
      id: `broken_chain:${String((chain as any).chain_key || firstEvent?.id || index)}`,
      category: "broken_chain",
      severity: "Critical",
      title: "Broken financial chain",
      event_id: firstEvent?.id || null,
      order_reference: String((chain as any).chain_key || eventReference(firstEvent)),
      reason: Array.isArray((chain as any).reasons) ? (chain as any).reasons.join(", ") : "Related financial events need chain review.",
      amount: firstEvent?.amount ?? null,
      currency: firstEvent?.currency ?? null,
      event_date: firstEvent?.event_date ?? null,
      next_step: "Review chain evidence",
    });
  }

  for (let index = 0; index < data.diagnostics.double_debit.length; index += 1) {
    const item = data.diagnostics.double_debit[index];
    const event = byId.get(String((item as any).chargeback_event_id || "")) || byId.get(String((item as any).refund_event_id || ""));
    add({
      id: `double_debit:${String((item as any).order_id || event?.id || index)}`,
      category: "double_debit",
      severity: "Review",
      title: "Double-debit candidate",
      event_id: event?.id || null,
      order_reference: String((item as any).order_id || eventReference(event)),
      reason: `Refund and chargeback are ${String((item as any).days_apart ?? "within range")} days apart.`,
      amount: event?.amount ?? null,
      currency: event?.currency ?? (String((item as any).currency || "") || null),
      event_date: event?.event_date ?? null,
      next_step: "Confirm both debits are legitimate",
    });
  }

  for (let index = 0; index < data.diagnostics.duplicates.length; index += 1) {
    const item = data.diagnostics.duplicates[index];
    if ((item as any).requires_review === false) continue;
    const event = (Array.isArray((item as any).event_ids) ? (item as any).event_ids : []).map((id: any) => byId.get(String(id))).find(Boolean);
    add({
      id: `duplicate_evidence:${String((item as any).key || event?.id || index)}`,
      category: "duplicate_evidence",
      severity: "Critical",
      title: "Duplicate or conflicting source evidence",
      event_id: event?.id || null,
      order_reference: String((item as any).key || eventReference(event)),
      reason: String((item as any).category || "Duplicate source evidence requires review."),
      amount: event?.amount ?? null,
      currency: event?.currency ?? null,
      event_date: event?.event_date ?? null,
      next_step: "Compare source evidence",
    });
  }

  const priority: Record<FinancialIssueSeverity, number> = { Critical: 0, Review: 1, Informational: 2 };
  return Array.from(queue.values())
    .sort((a, b) => priority[a.severity] - priority[b.severity] || Date.parse(b.event_date || "") - Date.parse(a.event_date || ""))
    .slice(0, 25);
}

export function financialImpactRows(data: FinancialReconciliationResponse): FinancialImpactRow[] {
  return (Object.entries(data.summary.totals_by_type) as Array<[FinancialReconciliationLedgerType, any]>).map(([type, total]) => ({
    type,
    label: IMPACT_LABELS[type],
    amount: n(total.amount),
    count: n(total.count),
    currency: total.currency || null,
    mixed_currency: Boolean(total.mixed_currency),
  }));
}

export function netFinancialImpact(data: FinancialReconciliationResponse): FinancialNetImpact {
  const rows = financialImpactRows(data).filter((row) => row.count > 0);
  if (!rows.length) return { amount: 0, currency: null, mixed_currency: false, label: "No financial impact" };
  if (rows.some((row) => row.mixed_currency)) return { amount: null, currency: null, mixed_currency: true, label: "Multiple currencies" };
  const currencies = Array.from(new Set(rows.map((row) => row.currency).filter(Boolean)));
  if (currencies.length > 1) return { amount: null, currency: null, mixed_currency: true, label: "Multiple currencies" };
  return {
    amount: rows.reduce((sum, row) => sum + row.amount, 0),
    currency: currencies[0] || rows[0]?.currency || null,
    mixed_currency: false,
    label: "Net financial impact",
  };
}

export function recentFinancialActivity(data: FinancialReconciliationResponse, limit = 6): FinancialRecentActivity[] {
  return data.items
    .slice()
    .sort((a, b) => Date.parse(b.event_date || "") - Date.parse(a.event_date || ""))
    .slice(0, limit)
    .map((item) => ({
      id: `activity:${item.id}`,
      title: eventReference(item),
      event_id: item.id,
      event_type: item.event_type,
      amount: item.amount,
      currency: item.currency,
      event_date: item.event_date,
      status: item.match_status,
      detail: item.match_status === "manual"
        ? "Manually reconciled by an operator decision."
        : item.match_status === "ignored"
          ? "Ignored by an operator decision and kept in history."
          : item.match_status === "removed"
            ? "Manual match removed; automatic evidence remains visible when present."
            : item.automatic_match_present
              ? "Automatically reconciled from ingestion evidence."
              : item.needs_review
                ? "Needs review before this event can be trusted operationally."
                : "No active diagnostic issue.",
    }));
}

export function financialReconciliationQuery(params: Record<string, string | number | boolean | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "" || value === false) continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return `/api/financial-reconciliation${query ? `?${query}` : ""}`;
}
