export const FINANCIAL_RECONCILIATION_PATH = "/v1/financial-reconciliation";
export const FINANCIAL_RECONCILIATION_MATCHES_PATH = "/v1/financial-reconciliation/matches";
export const FINANCIAL_RECONCILIATION_MAX_RANGE_DAYS = 366;
export const FINANCIAL_RECONCILIATION_LEDGER_LIMIT = 1000;
export const FINANCIAL_RECONCILIATION_HISTORY_LIMIT = 100;
export const FINANCIAL_RECONCILIATION_DOUBLE_DEBIT_DAYS = 7;

export const FINANCIAL_RECONCILIATION_LEDGER_TYPES = [
  "refund",
  "chargeback",
  "chargeback_fee",
  "chargeback_reversal",
  "chargeback_fee_reversal",
] as const;

export type FinancialReconciliationLedgerType = (typeof FINANCIAL_RECONCILIATION_LEDGER_TYPES)[number];
export type FinancialReconciliationState = "automatic" | "manual" | "ignored" | "removed" | "unmatched" | "ambiguous";
export type FinancialReconciliationConfidence = "exact" | "high" | "medium" | "conflict" | "none";
export type FinancialReconciliationUnavailableReason =
  | "migration_036_missing"
  | "reconciliation_rpc_unavailable";

export type FinancialReconciliationParams = {
  workspace_id: string;
  from: string;
  to: string;
  platform: string | null;
  processor_account: string | null;
  event_type: string | null;
  currency: string | null;
  reconciliation_state: string | null;
  confidence: string | null;
  diagnostic_category: string | null;
  needs_review: boolean;
  limit: number;
};

type LedgerRow = Record<string, any>;
type OrderCandidate = Record<string, any>;
type DecisionRow = Record<string, any>;

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
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  from.setUTCDate(from.getUTCDate() - 29);
  return { from: ymd(from), to };
}

export function normalizeFinancialReconciliationParams(input: Record<string, unknown>, now = new Date()): FinancialReconciliationParams {
  const fallback = defaultRange(now);
  const from = parseYmd(input.from) || fallback.from;
  const to = parseYmd(input.to) || fallback.to;
  const minMs = Math.min(Date.parse(`${from}T00:00:00.000Z`), Date.parse(`${to}T00:00:00.000Z`));
  const maxMs = Math.max(Date.parse(`${from}T00:00:00.000Z`), Date.parse(`${to}T00:00:00.000Z`));
  const safeFrom = new Date(minMs);
  const safeTo = new Date(maxMs);
  const days = Math.floor((safeTo.getTime() - safeFrom.getTime()) / 86400000) + 1;
  if (days > FINANCIAL_RECONCILIATION_MAX_RANGE_DAYS) {
    safeFrom.setTime(safeTo.getTime() - (FINANCIAL_RECONCILIATION_MAX_RANGE_DAYS - 1) * 86400000);
  }
  const limit = Math.max(1, Math.min(200, Number(input.limit || 100) || 100));
  return {
    workspace_id: text(input.workspace_id || input.workspaceId || "default") || "default",
    from: ymd(safeFrom),
    to: ymd(safeTo),
    platform: lower(input.platform || input.connector) || null,
    processor_account: lower(input.processor_account || input.processorAccount || input.account) || null,
    event_type: lower(input.event_type || input.eventType || input.ledger_type || input.ledgerType) || null,
    currency: text(input.currency).toUpperCase() || null,
    reconciliation_state: lower(input.reconciliation_state || input.reconciliationState || input.state) || null,
    confidence: lower(input.confidence) || null,
    diagnostic_category: lower(input.diagnostic_category || input.diagnosticCategory || input.category || input.tab) || null,
    needs_review: ["1", "true", "yes"].includes(lower(input.needs_review || input.needsReview)),
    limit,
  };
}

function safeJson(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function safeArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function dateMs(value: unknown) {
  const ms = Date.parse(text(value));
  return Number.isFinite(ms) ? ms : 0;
}

function idOf(row: any) {
  return text(row?.id || row?.financial_event_id || row?.transaction_id || row?.source_event_id);
}

function redact(value: unknown) {
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

export function redactFinancialReconciliationMessage(value: unknown) {
  return redact(value) || "Financial Reconciliation Center failed.";
}

function hasAttribution(row: LedgerRow, order?: OrderCandidate | null) {
  const meta = safeJson(row.meta);
  return Boolean(
    text(row.affiliate_id) ||
      text(meta.affiliate_id) ||
      text(meta.publisher_id) ||
      text(meta.source_id) ||
      text(meta.source) ||
      text(meta.campaign_id) ||
      text(meta.sub1) ||
      text(order?.affiliate_id) ||
      text(order?.source_id) ||
      text(order?.sub1)
  );
}

function ledgerReferences(row: LedgerRow) {
  const meta = safeJson(row.meta);
  return {
    seller_transaction_id: text(meta.seller_transaction_id || meta.sellerTransactionId || meta.seller_transaction || meta.sellerTransaction),
    buyer_transaction_id: text(meta.buyer_transaction_id || meta.buyerTransactionId),
    parent_transaction_id: text(row.parent_transaction_id || meta.parent_transaction_id || meta.original_transaction_id || meta.original_payment_id),
    payment_transaction_id: text(meta.payment_transaction_id || meta.paymentTransactionId || meta.capture_id || meta.captureId || meta.processor_payment_id),
    platform_order_id: text(row.platform_order_id || meta.platform_order_id || meta.matched_platform_order_id),
    order_id: text(row.order_id || meta.order_id || meta.matched_order_id),
    commerce_reference: text(row.commerce_reference || meta.commerce_reference || meta.custom || meta.custom_id || meta.order_reference || meta.reference_id),
    source_event_id: text(row.source_event_id || meta.source_event_id),
    dispute_id: text(row.dispute_id || meta.dispute_id),
  };
}

function orderLabel(order: OrderCandidate | null | undefined) {
  if (!order) return null;
  return text(order.platform_order_id || order.order_id || order.transaction_id || order.commerce_reference) || null;
}

function orderKey(order: OrderCandidate | null | undefined) {
  return text(order?.platform_order_id || order?.order_id || order?.transaction_id || order?.commerce_reference);
}

function groupOrdersByReference(orders: OrderCandidate[]) {
  const map = new Map<string, OrderCandidate[]>();
  const add = (kind: string, value: unknown, order: OrderCandidate) => {
    const key = `${kind}:${lower(value)}`;
    if (!lower(value)) return;
    map.set(key, [...(map.get(key) || []), order]);
  };
  for (const order of orders) {
    add("transaction_id", order.transaction_id, order);
    add("platform_order_id", order.platform_order_id, order);
    add("order_id", order.order_id, order);
    add("commerce_reference", order.commerce_reference, order);
  }
  return map;
}

function uniqueOrders(orders: OrderCandidate[]) {
  return Array.from(new Map(orders.map((order) => [orderKey(order), order])).values()).filter((order) => orderKey(order));
}

function suggestionForEvent(row: LedgerRow, orderMap: Map<string, OrderCandidate[]>, activeManualTarget?: OrderCandidate | null) {
  if (activeManualTarget) {
    return {
      confidence: "exact" as FinancialReconciliationConfidence,
      method: "operator_confirmed",
      candidate_order_id: orderLabel(activeManualTarget),
      public_order_label: orderLabel(activeManualTarget),
      supporting_references: ["manual_decision"],
      conflicts: [] as any[],
      candidate_already_associated: false,
    };
  }
  const refs = ledgerReferences(row);
  const priority = [
    ["seller_transaction_id", "transaction_id", refs.seller_transaction_id, "exact"],
    ["buyer_transaction_id", "transaction_id", refs.buyer_transaction_id, "high"],
    ["parent_transaction_id", "transaction_id", refs.parent_transaction_id, "high"],
    ["payment_transaction_id", "transaction_id", refs.payment_transaction_id, "high"],
    ["platform_order_id", "platform_order_id", refs.platform_order_id, "exact"],
    ["order_id", "order_id", refs.order_id, "exact"],
    ["commerce_reference", "commerce_reference", refs.commerce_reference, "medium"],
  ] as const;
  for (const [method, lookupKind, value, confidence] of priority) {
    if (!value) continue;
    const candidates = uniqueOrders(orderMap.get(`${lookupKind}:${lower(value)}`) || []);
    if (candidates.length === 1) {
      const candidate = candidates[0];
      return {
        confidence,
        method,
        candidate_order_id: orderLabel(candidate),
        public_order_label: orderLabel(candidate),
        supporting_references: [method],
        conflicts: [] as any[],
        candidate_already_associated: false,
      };
    }
    if (candidates.length > 1) {
      return {
        confidence: "conflict" as FinancialReconciliationConfidence,
        method,
        candidate_order_id: null,
        public_order_label: null,
        supporting_references: [method],
        conflicts: candidates.slice(0, 5).map((candidate) => ({
          platform_order_id: text(candidate.platform_order_id) || null,
          order_id: text(candidate.order_id) || null,
          platform: text(candidate.platform) || null,
        })),
        candidate_already_associated: false,
      };
    }
  }
  return {
    confidence: "none" as FinancialReconciliationConfidence,
    method: null,
    candidate_order_id: null,
    public_order_label: null,
    supporting_references: [] as string[],
    conflicts: [] as any[],
    candidate_already_associated: false,
  };
}

function activeDecisionFor(row: LedgerRow, decisions: DecisionRow[]) {
  const eventId = idOf(row);
  return decisions.find((decision) => text(decision.financial_event_id) === eventId && decision.is_active !== false) || null;
}

function stateFor(row: LedgerRow, suggestion: ReturnType<typeof suggestionForEvent>, decision: DecisionRow | null): FinancialReconciliationState {
  if (decision?.resulting_state === "ignored") return "ignored";
  if (decision?.resulting_state === "manual") return "manual";
  if (decision?.resulting_state === "removed") return "removed";
  if (text(row.order_id) || text(safeJson(row.meta).matched_platform_order_id) || text(safeJson(row.meta).matched_order_id)) return "automatic";
  if (suggestion.confidence === "conflict") return "ambiguous";
  return "unmatched";
}

function amount(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function emptyTotals() {
  return Object.fromEntries(FINANCIAL_RECONCILIATION_LEDGER_TYPES.map((type) => [type, { count: 0, amount: 0, currency: null as string | null, mixed_currency: false }]));
}

function addTotal(total: any, row: LedgerRow) {
  total.count += 1;
  total.amount += amount(row.amount);
  const currency = text(row.currency).toUpperCase() || null;
  if (currency) {
    if (!total.currency && !total.mixed_currency) total.currency = currency;
    else if (total.currency !== currency) {
      total.currency = null;
      total.mixed_currency = true;
    }
  }
}

function deterministicOrderIdentity(row: LedgerRow, decision?: DecisionRow | null) {
  const meta = safeJson(row.meta);
  return text(decision?.matched_platform_order_id || decision?.matched_order_id || row.order_id || meta.matched_platform_order_id || meta.matched_order_id || meta.platform_order_id || meta.order_id);
}

function chainKey(row: LedgerRow) {
  return [
    lower(row.platform),
    lower(row.processor_account_id),
    lower(row.dispute_id || safeJson(row.meta).dispute_id),
    lower(row.parent_transaction_id),
    lower(row.order_id || safeJson(row.meta).matched_order_id || safeJson(row.meta).matched_platform_order_id),
  ].filter(Boolean).join(":") || `${lower(row.platform)}:${lower(row.processor_account_id)}:${lower(row.source_event_id || row.transaction_id)}`;
}

function buildDoubleDebit(rows: LedgerRow[], decisions: DecisionRow[]) {
  const refunds = rows.filter((row) => lower(row.ledger_type) === "refund");
  const chargebacks = rows.filter((row) => lower(row.ledger_type) === "chargeback");
  const reversals = rows.filter((row) => lower(row.ledger_type) === "chargeback_reversal");
  const items: any[] = [];
  for (const refund of refunds) {
    const refundOrder = deterministicOrderIdentity(refund, activeDecisionFor(refund, decisions));
    if (!refundOrder) continue;
    for (const chargeback of chargebacks) {
      const cbOrder = deterministicOrderIdentity(chargeback, activeDecisionFor(chargeback, decisions));
      if (!cbOrder || cbOrder !== refundOrder) continue;
      if (text(refund.currency).toUpperCase() !== text(chargeback.currency).toUpperCase()) continue;
      const daysApart = Math.abs(dateMs(refund.occurred_at) - dateMs(chargeback.occurred_at)) / 86400000;
      if (daysApart > FINANCIAL_RECONCILIATION_DOUBLE_DEBIT_DAYS) continue;
      const relatedReversals = reversals.filter((reversal) => deterministicOrderIdentity(reversal, activeDecisionFor(reversal, decisions)) === refundOrder && text(reversal.currency).toUpperCase() === text(chargeback.currency).toUpperCase());
      const recovered = relatedReversals.reduce((sum, row) => sum + Math.abs(amount(row.amount)), 0);
      const debit = Math.abs(amount(chargeback.amount));
      const financialState = recovered <= 0 ? "unresolved" : recovered + 0.01 >= debit ? "fully_recovered" : "partially_recovered";
      items.push({
        order_id: refundOrder,
        refund_event_id: idOf(refund),
        chargeback_event_id: idOf(chargeback),
        refund_amount: amount(refund.amount),
        chargeback_amount: amount(chargeback.amount),
        currency: text(refund.currency).toUpperCase() || null,
        days_apart: Number(daysApart.toFixed(2)),
        status: financialState,
        reversal_context: relatedReversals.map((row) => ({ event_id: idOf(row), amount: amount(row.amount), occurred_at: text(row.occurred_at) || null })),
      });
    }
  }
  return items.slice(0, 100);
}

function buildDuplicates(rows: LedgerRow[]) {
  const groups = new Map<string, LedgerRow[]>();
  for (const row of rows) {
    const key = [
      lower(row.platform),
      lower(row.processor_account_id),
      lower(row.source_event_id || row.dispute_id || row.transaction_id),
      lower(row.ledger_type),
    ].join(":");
    if (!key.replace(/:/g, "")) continue;
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  const items: any[] = [];
  const storedDiagnostics = rows
    .filter((row) => safeArray(row.diagnostic_flags).some((flag) => lower(flag).includes("duplicate")))
    .slice(0, 100)
    .map((row) => ({
      key: text(row.source_event_id || row.dispute_id || row.transaction_id || idOf(row)) || idOf(row),
      category: "duplicate_rejected_before_ledger_insertion",
      event_ids: [idOf(row)],
      count: 1,
      requires_review: false,
      evidence: safeArray(row.diagnostic_flags).map(text).filter((flag) => lower(flag).includes("duplicate")).slice(0, 5),
    }));
  items.push(...storedDiagnostics);
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const signatures = new Set(group.map((row) => `${row.ledger_type}:${row.amount}:${row.currency}`));
    items.push({
      key,
      category: signatures.size === 1 ? "identical_duplicate_ledger_evidence" : "conflicting_duplicate_evidence",
      event_ids: group.map(idOf),
      count: group.length,
      requires_review: signatures.size > 1,
    });
  }
  return items.slice(0, 100);
}

function buildBrokenChains(rows: LedgerRow[]) {
  const groups = new Map<string, LedgerRow[]>();
  for (const row of rows) groups.set(chainKey(row), [...(groups.get(chainKey(row)) || []), row]);
  const items: any[] = [];
  for (const [key, group] of groups) {
    const chargebacks = group.filter((row) => lower(row.ledger_type) === "chargeback");
    const refunds = group.filter((row) => lower(row.ledger_type) === "refund");
    const fees = group.filter((row) => lower(row.ledger_type) === "chargeback_fee");
    const reversals = group.filter((row) => lower(row.ledger_type) === "chargeback_reversal");
    const feeReversals = group.filter((row) => lower(row.ledger_type) === "chargeback_fee_reversal");
    const currencies = new Set(group.map((row) => text(row.currency).toUpperCase()).filter(Boolean));
    const reasons: string[] = [];
    if (fees.length && !chargebacks.length) reasons.push("chargeback_fee_without_chargeback");
    if (reversals.length && !chargebacks.length) reasons.push("chargeback_reversal_without_original");
    if (feeReversals.length && !fees.length) reasons.push("chargeback_fee_reversal_without_original_fee");
    if (Math.abs(reversals.reduce((sum, row) => sum + amount(row.amount), 0)) > Math.abs(chargebacks.reduce((sum, row) => sum + amount(row.amount), 0)) && chargebacks.length) reasons.push("chargeback_reversal_exceeds_original");
    if (Math.abs(feeReversals.reduce((sum, row) => sum + amount(row.amount), 0)) > Math.abs(fees.reduce((sum, row) => sum + amount(row.amount), 0)) && fees.length) reasons.push("fee_reversal_exceeds_original_fee");
    if (currencies.size > 1) reasons.push("mixed_currency_chain");
    if (chargebacks.some((row) => !deterministicOrderIdentity(row))) reasons.push("chargeback_without_matching_sale");
    if (refunds.some((row) => !deterministicOrderIdentity(row))) reasons.push("refund_without_matching_sale");
    if (!reasons.length) continue;
    items.push({
      chain_key: key,
      reasons,
      events: group
        .slice()
        .sort((a, b) => dateMs(a.occurred_at) - dateMs(b.occurred_at))
        .map((row) => ({ event_id: idOf(row), ledger_type: row.ledger_type, amount: amount(row.amount), currency: text(row.currency).toUpperCase() || null, occurred_at: text(row.occurred_at) || null })),
    });
  }
  return items.slice(0, 100);
}

function activeManualTarget(decision: DecisionRow | null, orderMap: Map<string, OrderCandidate[]>) {
  if (decision?.resulting_state !== "manual") return null;
  const platformId = text(decision.matched_platform_order_id);
  const orderId = text(decision.matched_order_id);
  return uniqueOrders([
    ...(platformId ? orderMap.get(`platform_order_id:${lower(platformId)}`) || [] : []),
    ...(orderId ? orderMap.get(`order_id:${lower(orderId)}`) || [] : []),
  ])[0] || null;
}

export function buildFinancialReconciliationReport(args: {
  params: FinancialReconciliationParams;
  ledgerRows?: LedgerRow[];
  orderCandidates?: OrderCandidate[];
  decisions?: DecisionRow[];
  decisionsAvailable?: boolean;
  migrationUnavailableReason?: string | null;
  migrationUnavailableReasonCode?: FinancialReconciliationUnavailableReason | null;
  partialReason?: string | null;
  now?: Date;
}) {
  const ledgerRows = (args.ledgerRows || []).filter((row) => text(row.workspace_id || "default") === args.params.workspace_id);
  const decisions = args.decisionsAvailable === false ? [] : (args.decisions || []).filter((row) => text(row.workspace_id || "default") === args.params.workspace_id);
  const orders = (args.orderCandidates || []).filter((row) => text(row.workspace_id || "default") === args.params.workspace_id);
  const orderMap = groupOrdersByReference(orders);
  const totals = emptyTotals() as Record<FinancialReconciliationLedgerType, any>;
  const items = ledgerRows.map((row) => {
    const decision = activeDecisionFor(row, decisions);
    const manualTarget = activeManualTarget(decision, orderMap);
    const suggestion = suggestionForEvent(row, orderMap, manualTarget);
    const state = stateFor(row, suggestion, decision);
    const matchedOrder = manualTarget || (suggestion.candidate_order_id ? uniqueOrders([
      ...(orderMap.get(`platform_order_id:${lower(suggestion.candidate_order_id)}`) || []),
      ...(orderMap.get(`order_id:${lower(suggestion.candidate_order_id)}`) || []),
    ])[0] : null);
    const attributionPresent = hasAttribution(row, matchedOrder);
    return {
      id: idOf(row),
      event_date: text(row.occurred_at) || null,
      connector: text(row.connector_id || row.event_source || row.platform) || "unknown",
      platform: text(row.platform) || null,
      processor_account_id: text(row.processor_account_id) || null,
      event_type: lower(row.ledger_type),
      amount: amount(row.amount),
      currency: text(row.currency).toUpperCase() || null,
      processor_reference: text(row.transaction_id || row.parent_transaction_id || row.dispute_id) || null,
      source_event_id: text(row.source_event_id) || null,
      match_status: state,
      reason_unmatched: state === "unmatched" ? "No deterministic order reference matched a same-workspace order." : null,
      suggested_order: suggestion,
      confidence: suggestion.confidence,
      manual_decision: decision ? {
        id: text(decision.id),
        decision_type: text(decision.decision_type),
        resulting_state: text(decision.resulting_state),
        reason: redact(decision.reason),
        decided_at: text(decision.decided_at) || text(decision.created_at) || null,
      } : null,
      attribution_present: attributionPresent,
      missing_attribution_fields: attributionPresent ? [] : ["affiliate", "source"],
      automatic_match_present: Boolean(text(row.order_id) || text(safeJson(row.meta).matched_platform_order_id) || text(safeJson(row.meta).matched_order_id)),
      needs_review: ["unmatched", "ambiguous"].includes(state) || !attributionPresent || safeArray(row.diagnostic_flags).length > 0,
      diagnostic_flags: safeArray(row.diagnostic_flags).map(text).filter(Boolean),
    };
  });
  for (const row of ledgerRows) {
    const type = lower(row.ledger_type) as FinancialReconciliationLedgerType;
    if (type in totals) addTotal(totals[type], row);
  }
  const missingAttribution = items.filter((item) => ["automatic", "manual"].includes(item.match_status) && !item.attribution_present);
  const doubleDebit = buildDoubleDebit(ledgerRows, decisions);
  const duplicates = buildDuplicates(ledgerRows);
  const brokenChains = buildBrokenChains(ledgerRows);
  const filtered = items.filter((item) => {
    if (args.params.platform && ![item.platform, item.connector].map(lower).some((value) => value.includes(args.params.platform || ""))) return false;
    if (args.params.processor_account && !lower(item.processor_account_id).includes(args.params.processor_account)) return false;
    if (args.params.event_type && item.event_type !== args.params.event_type) return false;
    if (args.params.currency && item.currency !== args.params.currency) return false;
    if (args.params.reconciliation_state && item.match_status !== args.params.reconciliation_state) return false;
    if (args.params.confidence && item.confidence !== args.params.confidence) return false;
    if (args.params.needs_review && !item.needs_review) return false;
    return true;
  });
  const history = decisions
    .slice()
    .sort((a, b) => dateMs(b.decided_at || b.created_at) - dateMs(a.decided_at || a.created_at))
    .slice(0, FINANCIAL_RECONCILIATION_HISTORY_LIMIT)
    .map((decision) => ({
      id: text(decision.id),
      timestamp: text(decision.decided_at || decision.created_at) || null,
      financial_event_id: text(decision.financial_event_id),
      old_state: text(decision.prior_state) || null,
      new_state: text(decision.resulting_state),
      matched_order: text(decision.matched_platform_order_id || decision.matched_order_id) || null,
      method: text(decision.match_method),
      confidence: text(decision.confidence) || "none",
      actor: text(decision.actor_id) ? "[redacted-actor]" : null,
      reason: redact(decision.reason),
    }));
  const needsReviewIds = new Set([
    ...filtered.filter((item) => item.needs_review).map((item) => item.id),
    ...doubleDebit.flatMap((item) => [item.refund_event_id, item.chargeback_event_id]),
    ...duplicates.filter((item) => item.requires_review).flatMap((item) => item.event_ids),
    ...brokenChains.flatMap((item) => item.events.map((event: any) => event.event_id)),
  ]);
  const states = Array.from(new Set(items.map((item) => item.match_status))).sort();
  const confidence = Array.from(new Set(items.map((item) => item.confidence))).sort();
  const partialSections = args.partialReason
    ? ["summary", "items", "diagnostics", "history", "filters", "pagination"]
    : [];
  const matchRateExact = !args.partialReason;
  return {
    ok: true,
    workspace_id: args.params.workspace_id,
    range: { from: args.params.from, to: args.params.to },
    capabilities: {
      manual_reconciliation: args.decisionsAvailable !== false,
      reason: args.decisionsAvailable === false ? (args.migrationUnavailableReason || "Migration 036 has not been applied") : null,
      reason_code: args.decisionsAvailable === false ? (args.migrationUnavailableReasonCode || "migration_036_missing") : null,
    },
    partial: Boolean(args.partialReason),
    partial_reason: args.partialReason || null,
    partial_sections: partialSections,
    summary: {
      financial_events_reviewed: ledgerRows.length,
      matched_events: items.filter((item) => item.match_status === "automatic" || item.match_status === "manual").length,
      match_rate: matchRateExact && items.length ? Number((items.filter((item) => item.match_status === "automatic" || item.match_status === "manual").length / items.length).toFixed(4)) : null,
      match_rate_exact: matchRateExact,
      unmatched_events: items.filter((item) => item.match_status === "unmatched").length,
      missing_attribution: missingAttribution.length,
      double_debit_candidates: doubleDebit.length,
      duplicate_source_diagnostics: duplicates.length,
      broken_chains: brokenChains.length,
      needs_review: needsReviewIds.size,
      totals_by_type: totals,
    },
    items: filtered.slice(0, args.params.limit),
    diagnostics: {
      missing_attribution: missingAttribution.slice(0, 100),
      double_debit: doubleDebit,
      duplicates,
      broken_chains: brokenChains,
    },
    history,
    filters: {
      platforms: Array.from(new Set(items.map((item) => item.platform).filter(Boolean))).sort(),
      event_types: [...FINANCIAL_RECONCILIATION_LEDGER_TYPES],
      currencies: Array.from(new Set(items.map((item) => item.currency).filter(Boolean))).sort(),
      states,
      confidence,
    },
    pagination: {
      limit: args.params.limit,
      returned: Math.min(filtered.length, args.params.limit),
      total_available: filtered.length,
      has_more: filtered.length > args.params.limit,
    },
    config: {
      double_debit_window_days: FINANCIAL_RECONCILIATION_DOUBLE_DEBIT_DAYS,
    },
    generated_at: (args.now || new Date()).toISOString(),
  };
}

function errorText(error: any) {
  return lower([error?.message, error?.details, error?.hint].filter(Boolean).join(" "));
}

function isMissingFinancialReconciliationTable(error: any) {
  const message = errorText(error);
  return (
    (error?.code === "42P01" || error?.code === "PGRST205") &&
    message.includes("financial_event_matches")
  );
}

function isMissingFinancialReconciliationRpc(error: any) {
  const message = errorText(error);
  return (
    (error?.code === "42883" || error?.code === "PGRST202") &&
    message.includes("apply_financial_event_match_decision")
  );
}

function capabilityUnavailable(reasonCode: FinancialReconciliationUnavailableReason) {
  return {
    ok: false,
    error: "manual_reconciliation_unavailable",
    message: "Manual financial reconciliation is unavailable until the reconciliation migration is applied.",
    capabilities: {
      manual_reconciliation: false,
      reason: "Manual reconciliation is unavailable until migration 036 is applied.",
      reason_code: reasonCode,
    },
  };
}

async function readDecisions(supabase: any, workspaceId: string, eventIds: string[]) {
  if (!eventIds.length) {
    const { error } = await supabase
      .from("financial_event_matches")
      .select("id")
      .eq("workspace_id", workspaceId)
      .limit(1);
    if (error) {
      if (isMissingFinancialReconciliationTable(error)) return { available: false, rows: [], reason: "Manual reconciliation is unavailable until migration 036 is applied.", reason_code: "migration_036_missing" as const };
      throw new Error(`Financial reconciliation history read failed: ${redact(error.message)}`);
    }
    return { available: true, rows: [] as any[], reason: null as string | null, reason_code: null as FinancialReconciliationUnavailableReason | null };
  }
  const { data, error } = await supabase
    .from("financial_event_matches")
    .select("id,workspace_id,financial_event_id,matched_platform_order_id,matched_order_id,decision_type,resulting_state,match_method,confidence,is_active,actor_id,decided_at,reason,prior_state,metadata,created_at")
    .eq("workspace_id", workspaceId)
    .in("financial_event_id", eventIds)
    .order("decided_at", { ascending: false })
    .limit(500);
  if (error) {
    if (isMissingFinancialReconciliationTable(error)) return { available: false, rows: [], reason: "Manual reconciliation is unavailable until migration 036 is applied.", reason_code: "migration_036_missing" as const };
    throw new Error(`Financial reconciliation history read failed: ${redact(error.message)}`);
  }
  return { available: true, rows: data || [], reason: null, reason_code: null };
}

async function readOrderCandidates(supabase: any, workspaceId: string, rows: LedgerRow[]) {
  const refs = new Set<string>();
  const txns = new Set<string>();
  const platformOrderIds = new Set<string>();
  const orderIds = new Set<string>();
  const commerceRefs = new Set<string>();
  for (const row of rows) {
    const ref = ledgerReferences(row);
    for (const value of [ref.seller_transaction_id, ref.buyer_transaction_id, ref.parent_transaction_id, ref.payment_transaction_id]) if (value) txns.add(value);
    if (ref.platform_order_id) platformOrderIds.add(ref.platform_order_id);
    if (ref.order_id) orderIds.add(ref.order_id);
    if (ref.commerce_reference) commerceRefs.add(ref.commerce_reference);
    for (const value of [ref.seller_transaction_id, ref.buyer_transaction_id, ref.parent_transaction_id, ref.payment_transaction_id, ref.platform_order_id, ref.order_id, ref.commerce_reference]) if (value) refs.add(value);
  }
  const select = "workspace_id,platform,platform_order_id,order_id,transaction_id,commerce_reference,order_ts,gross_amount,receipt_total,currency,affiliate_id,source_id,sub1,sub2,sub3,sub4,sub5";
  const queries: any[] = [];
  if (txns.size) queries.push(supabase.from("platform_orders").select(select).eq("workspace_id", workspaceId).in("transaction_id", Array.from(txns).slice(0, 200)).limit(500));
  if (platformOrderIds.size) queries.push(supabase.from("platform_orders").select(select).eq("workspace_id", workspaceId).in("platform_order_id", Array.from(platformOrderIds).slice(0, 200)).limit(500));
  if (orderIds.size) queries.push(supabase.from("platform_orders").select(select).eq("workspace_id", workspaceId).in("order_id", Array.from(orderIds).slice(0, 200)).limit(500));
  if (commerceRefs.size) queries.push(supabase.from("platform_orders").select(select).eq("workspace_id", workspaceId).in("commerce_reference", Array.from(commerceRefs).slice(0, 200)).limit(500));
  if (!queries.length) return [];
  const results = await Promise.all(queries);
  const orders = [];
  for (const result of results) {
    if (result.error) throw new Error(`Financial reconciliation candidate lookup failed: ${redact(result.error.message)}`);
    orders.push(...(result.data || []));
  }
  return uniqueOrders(orders);
}

export async function getFinancialReconciliationReport(supabase: any, params: FinancialReconciliationParams) {
  const fromIso = `${params.from}T00:00:00.000Z`;
  const toIso = new Date(Date.parse(`${params.to}T00:00:00.000Z`) + 86400000).toISOString();
  let query = supabase
    .from("conversions")
    .select("id,workspace_id,ledger_type,event_source,ingestion_method,connector_id,order_id,transaction_id,parent_transaction_id,amount,currency,platform,source_system,status,reason,meta,occurred_at,processor_account_id,source_event_id,dispute_id,source_amount,source_direction,diagnostic_flags")
    .eq("workspace_id", params.workspace_id)
    .in("ledger_type", FINANCIAL_RECONCILIATION_LEDGER_TYPES as unknown as string[])
    .gte("occurred_at", fromIso)
    .lt("occurred_at", toIso)
    .order("occurred_at", { ascending: false })
    .limit(FINANCIAL_RECONCILIATION_LEDGER_LIMIT + 1);
  if (params.platform) query = query.eq("platform", params.platform);
  if (params.processor_account) query = query.eq("processor_account_id", params.processor_account);
  if (params.event_type) query = query.eq("ledger_type", params.event_type);
  if (params.currency) query = query.eq("currency", params.currency);
  const { data, error } = await query;
  if (error) throw new Error(`Financial reconciliation ledger read failed: ${redact(error.message)}`);
  const rawRows = data || [];
  const partialReason = rawRows.length > FINANCIAL_RECONCILIATION_LEDGER_LIMIT
    ? `Ledger result exceeded ${FINANCIAL_RECONCILIATION_LEDGER_LIMIT} rows; item and summary sections are partial.`
    : null;
  const ledgerRows = rawRows.slice(0, FINANCIAL_RECONCILIATION_LEDGER_LIMIT);
  const eventIds = ledgerRows.map(idOf).filter(Boolean);
  const [decisionsResult, orderCandidates] = await Promise.all([
    readDecisions(supabase, params.workspace_id, eventIds),
    readOrderCandidates(supabase, params.workspace_id, ledgerRows),
  ]);
  return buildFinancialReconciliationReport({
    params,
    ledgerRows,
    orderCandidates,
    decisions: decisionsResult.rows,
    decisionsAvailable: decisionsResult.available,
    migrationUnavailableReason: decisionsResult.reason,
    migrationUnavailableReasonCode: decisionsResult.reason_code,
    partialReason,
  });
}

function safeMetadata(value: unknown) {
  const input = safeJson(value);
  const allowed = new Set([
    "ui",
    "source",
    "suggestion_method",
    "confidence",
    "supporting_reference_count",
    "conflict_count",
  ]);
  const output: Record<string, any> = {};
  for (const [key, val] of Object.entries(input)) {
    if (!allowed.has(lower(key))) continue;
    if (typeof val === "string") output[key] = redact(val);
    else if (typeof val === "number" || typeof val === "boolean" || val === null) output[key] = val;
  }
  return output;
}

function assertNoControlCharacters(name: string, value: string) {
  if (/[\u0000-\u001F\u007F]/.test(value)) {
    throw Object.assign(new Error(`${name} contains unsupported control characters`), { status: 400 });
  }
}

export function normalizeFinancialReconciliationDecision(input: Record<string, unknown>) {
  const decisionType = lower(input.decision_type || input.action);
  const financialEventId = text(input.financial_event_id || input.financialEventId);
  const workspaceId = text(input.workspace_id || input.workspaceId || "default") || "default";
  const reason = text(input.reason);
  const idempotencyKey = text(input.idempotency_key || input.idempotencyKey);
  if (!financialEventId) throw Object.assign(new Error("financial_event_id is required"), { status: 400 });
  if (financialEventId.length > 200) throw Object.assign(new Error("financial_event_id is too long"), { status: 400 });
  if (!["confirm_match", "ignore", "remove_match"].includes(decisionType)) throw Object.assign(new Error("Unsupported reconciliation action"), { status: 400 });
  if (["ignore", "remove_match"].includes(decisionType) && !reason) throw Object.assign(new Error("reason is required"), { status: 400 });
  if (!idempotencyKey) throw Object.assign(new Error("idempotency_key is required"), { status: 400 });
  if (idempotencyKey.length > 200) throw Object.assign(new Error("idempotency_key is too long"), { status: 400 });
  if (reason.length > 1000) throw Object.assign(new Error("reason is too long"), { status: 400 });
  assertNoControlCharacters("financial_event_id", financialEventId);
  assertNoControlCharacters("idempotency_key", idempotencyKey);
  if (reason) assertNoControlCharacters("reason", reason);
  const matchedPlatformOrderId = text(input.matched_platform_order_id || input.matchedPlatformOrderId);
  const matchedOrderId = text(input.matched_order_id || input.matchedOrderId);
  if (matchedPlatformOrderId.length > 200) throw Object.assign(new Error("matched_platform_order_id is too long"), { status: 400 });
  if (matchedOrderId.length > 200) throw Object.assign(new Error("matched_order_id is too long"), { status: 400 });
  if (matchedPlatformOrderId) assertNoControlCharacters("matched_platform_order_id", matchedPlatformOrderId);
  if (matchedOrderId) assertNoControlCharacters("matched_order_id", matchedOrderId);
  if (decisionType === "confirm_match" && !matchedPlatformOrderId && !matchedOrderId) {
    throw Object.assign(new Error("matched_platform_order_id or matched_order_id is required"), { status: 400 });
  }
  const matchMethod = decisionType === "confirm_match" ? "operator_confirmed" : decisionType === "ignore" ? "operator_ignored" : "operator_removed";
  const confidence = decisionType === "confirm_match" ? "exact" : "none";
  return {
    workspace_id: workspaceId,
    financial_event_id: financialEventId,
    decision_type: decisionType,
    matched_platform_order_id: matchedPlatformOrderId || null,
    matched_order_id: matchedOrderId || null,
    reason: reason || null,
    match_method: matchMethod,
    confidence,
    idempotency_key: idempotencyKey,
    actor_id: "operations_admin",
    metadata: safeMetadata(input.metadata),
  };
}

export async function applyFinancialReconciliationDecision(supabase: any, body: Record<string, unknown>) {
  const decision = normalizeFinancialReconciliationDecision(body);
  const { data, error } = await supabase.rpc("apply_financial_event_match_decision", { p_decision: decision });
  if (error) {
    if (isMissingFinancialReconciliationTable(error)) {
      return capabilityUnavailable("migration_036_missing");
    }
    if (isMissingFinancialReconciliationRpc(error)) {
      return capabilityUnavailable("reconciliation_rpc_unavailable");
    }
    if (errorText(error).includes("idempotency_key_conflict")) {
      return {
        ok: false,
        error: "idempotency_key_conflict",
        message: "Idempotency key was already used for a different reconciliation decision.",
        capabilities: { manual_reconciliation: true, reason: null, reason_code: null },
      };
    }
    throw Object.assign(new Error(redact(error.message) || "Financial reconciliation decision failed"), { status: 400 });
  }
  return {
    ok: true,
    capabilities: { manual_reconciliation: true, reason: null },
    decision: Array.isArray(data) ? data[0] || null : data,
  };
}
