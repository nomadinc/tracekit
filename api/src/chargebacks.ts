export type ChargebackLedgerType =
  | "chargeback"
  | "chargeback_fee"
  | "chargeback_reversal"
  | "chargeback_fee_reversal";

export type ChargebackSourceDirection = "debit" | "credit" | "unknown";

export type NormalizedChargebackEvent = {
  workspace_id: string;
  platform: string;
  connector_id: string;
  processor_account_id: string;
  ledger_type: ChargebackLedgerType;
  transaction_id: string;
  parent_transaction_id: string | null;
  order_id: string | null;
  platform_order_id: string | null;
  commerce_reference: string | null;
  processor_transaction_id: string | null;
  dispute_id: string | null;
  source_event_id: string;
  source_amount: string;
  source_direction: ChargebackSourceDirection;
  amount: number;
  currency: string;
  occurred_at: string;
  status: string | null;
  reason: string | null;
  diagnostic_flags: string[];
  raw: Record<string, unknown>;
  meta: Record<string, unknown>;
};

export type PayPalDisputeListPage = {
  disputes: any[];
  page: number;
  page_size: number;
  total_items: number | null;
  total_pages: number | null;
  has_more: boolean;
  next_page: number | null;
  next_page_token: string | null;
  next_query: Record<string, string> | null;
  next_cursor: string | null;
};

export type GatewayActionClassification =
  | "card_chargeback_dispute"
  | "ach_return"
  | "refund"
  | "void"
  | "processor_fee"
  | "reversal_recovery"
  | "unknown";

export type GatewayClassicAction = {
  transaction_id: string | null;
  order_id: string | null;
  action_type: string | null;
  action_date: string | null;
  amount: string | null;
  requested_amount: string | null;
  response_text: string | null;
  condition: string | null;
  currency: string | null;
  raw: Record<string, unknown>;
};

export type GatewayClassicActionDiagnostic = {
  platform: string;
  processor_account_id: string;
  transaction_id: string | null;
  order_id: string | null;
  action_type: string | null;
  action_date: string | null;
  classification: GatewayActionClassification;
  inserted: false;
  reason: string;
};

export function chargebackText(value: unknown) {
  return String(value ?? "").trim();
}

function cleanLower(value: unknown) {
  return chargebackText(value).toLowerCase();
}

function normalizeIdPart(value: unknown) {
  return chargebackText(value)
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "unknown";
}

export function chargebackMoney(value: unknown): { value: number; currency: string } | null {
  if (!value) return null;
  if (typeof value === "object") {
    const rawValue = (value as any).value ?? (value as any).amount ?? (value as any).gross_amount;
    const parsed = Number(String(rawValue ?? "").replace(/[^0-9.-]/g, ""));
    if (!Number.isFinite(parsed)) return null;
    const currency = chargebackText((value as any).currency_code ?? (value as any).currency ?? (value as any).currencyCode).toUpperCase() || "USD";
    return { value: parsed, currency };
  }
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(parsed)) return null;
  return { value: parsed, currency: "USD" };
}

function canonicalQuery(value: Record<string, string>) {
  return Object.keys(value)
    .sort()
    .map((key) => `${key}=${value[key]}`)
    .join("&");
}

export function signedChargebackAmount(ledgerType: ChargebackLedgerType, amount: number) {
  if (ledgerType === "chargeback" || ledgerType === "chargeback_fee") return -Math.abs(amount);
  return Math.abs(amount);
}

export function sourceDirectionForLedgerType(ledgerType: ChargebackLedgerType): ChargebackSourceDirection {
  if (ledgerType === "chargeback" || ledgerType === "chargeback_fee") return "debit";
  return "credit";
}

export function stableChargebackEventId(args: {
  workspace_id: string;
  platform: string;
  processor_account_id: string;
  ledger_type: ChargebackLedgerType;
  source_event_id?: string | null;
  fallback_parts?: unknown[];
}) {
  const source = chargebackText(args.source_event_id);
  const identity = source
    ? `source:${normalizeIdPart(source)}`
    : `fallback:${(args.fallback_parts || []).map(normalizeIdPart).join(":")}`;
  return [
    normalizeIdPart(args.workspace_id),
    normalizeIdPart(args.platform),
    normalizeIdPart(args.processor_account_id),
    args.ledger_type,
    identity,
  ].join(":");
}

function isSellerFavorableDispute(dispute: any) {
  const text = [
    dispute?.status,
    dispute?.reason,
    dispute?.outcome,
    dispute?.dispute_outcome?.outcome_code,
    dispute?.dispute_life_cycle_stage,
  ].map(cleanLower).join(" ");
  return /seller/.test(text) && /(favor|favour|won|recovered|reinstated|resolved_seller)/.test(text);
}

function paypalDisputeSellerTransactionId(dispute: any) {
  return chargebackText(
    dispute?.seller_transaction_id
      ?? dispute?.disputed_transactions?.[0]?.seller_transaction_id,
  );
}

function paypalDisputeBuyerTransactionId(dispute: any) {
  return chargebackText(
    dispute?.buyer_transaction_id
      ?? dispute?.disputed_transactions?.[0]?.buyer_transaction_id,
  );
}

function asArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}

function paypalDisputeMoneyMovements(dispute: any): any[] {
  return [
    ...asArray(dispute?.money_movements),
    ...asArray(dispute?.money_movement),
    ...asArray(dispute?.fund_movements),
    ...asArray(dispute?.fund_movement),
    ...asArray(dispute?.seller_fund_movements),
    ...asArray(dispute?.dispute_outcome?.money_movements),
    ...asArray(dispute?.dispute_outcome?.fund_movements),
  ];
}

function paypalMovementParty(movement: any) {
  return cleanLower(movement?.affected_party ?? movement?.party);
}

function paypalMovementType(movement: any) {
  return cleanLower(movement?.type ?? movement?.movement_type);
}

function paypalMovementReason(movement: any) {
  return cleanLower(movement?.reason ?? movement?.movement_reason ?? movement?.fund_movement_reason);
}

function paypalMovementMoney(movement: any) {
  return chargebackMoney(movement?.amount ?? movement?.gross_amount ?? movement?.money);
}

function paypalMovementSourceId(movement: any) {
  return chargebackText(movement?.id ?? movement?.movement_id ?? movement?.transaction_id ?? movement?.initiated_time);
}

function paypalExplicitPrincipalRecovery(dispute: any): { money: { value: number; currency: string }; source_id: string | null } | null {
  const direct = chargebackMoney(
    dispute?.principal_reversal_amount
      ?? dispute?.principal_recovery_amount
      ?? dispute?.seller_recovered_amount
      ?? dispute?.seller_payout_amount
      ?? dispute?.dispute_outcome?.seller_payout_amount
      ?? dispute?.dispute_outcome?.payout_to_seller_amount,
  );
  if (direct && direct.value !== 0) return { money: direct, source_id: "explicit_principal_recovery_amount" };

  for (const movement of paypalDisputeMoneyMovements(dispute)) {
    const reason = paypalMovementReason(movement);
    const isSellerCredit = paypalMovementParty(movement) === "seller" && paypalMovementType(movement) === "credit";
    const isPrincipalRecovery = /dispute_settlement|payout_to_seller|seller_payout/.test(reason) && !/fee/.test(reason);
    if (!isSellerCredit || !isPrincipalRecovery) continue;
    const money = paypalMovementMoney(movement);
    if (money && money.value !== 0) return { money, source_id: paypalMovementSourceId(movement) || null };
  }

  return null;
}

function paypalExplicitFeeRecovery(dispute: any): { money: { value: number; currency: string }; source_id: string | null } | null {
  const direct = chargebackMoney(
    dispute?.chargeback_fee_reversal
      ?? dispute?.dispute_fee_reversal
      ?? dispute?.fee_reversal
      ?? dispute?.reversed_transaction_fee
      ?? dispute?.dispute_outcome?.chargeback_fee_reversal
      ?? dispute?.dispute_outcome?.dispute_fee_reversal
      ?? dispute?.dispute_outcome?.fee_reversal,
  );
  if (direct && direct.value !== 0) return { money: direct, source_id: "explicit_fee_recovery_amount" };

  for (const movement of paypalDisputeMoneyMovements(dispute)) {
    const reason = paypalMovementReason(movement);
    const isSellerCredit = paypalMovementParty(movement) === "seller" && paypalMovementType(movement) === "credit";
    const isFeeRecovery = /reversed_transaction_fee|dispute_settlement_fee|fee_reversal|reversed_fee/.test(reason);
    if (!isSellerCredit || !isFeeRecovery) continue;
    const money = paypalMovementMoney(movement);
    if (money && money.value !== 0) return { money, source_id: paypalMovementSourceId(movement) || null };
  }

  return null;
}

function disputeOccurredAt(dispute: any) {
  return chargebackText(dispute?.update_time ?? dispute?.create_time) || new Date(0).toISOString();
}

function paypalDisputeId(dispute: any) {
  return chargebackText(dispute?.dispute_id ?? dispute?.id);
}

function paypalDisputeTransactionId(dispute: any) {
  return chargebackText(
    paypalDisputeSellerTransactionId(dispute)
      || paypalDisputeBuyerTransactionId(dispute)
      || dispute?.disputed_transaction_id
      || dispute?.transaction_id,
  );
}

function paypalDisputeOrderReference(dispute: any) {
  return chargebackText(
    dispute?.custom_field
      ?? dispute?.custom
      ?? dispute?.disputed_transactions?.[0]?.custom
      ?? dispute?.disputed_transactions?.[0]?.custom_field,
  ) || chargebackText(
    dispute?.invoice_id
      ?? dispute?.disputed_transactions?.[0]?.invoice_id
      ?? dispute?.disputed_transactions?.[0]?.invoice_number,
  ) || null;
}

function paypalDisputeSourceId(dispute: any, ledgerType: ChargebackLedgerType, movementSourceId?: string | null) {
  const disputeId = paypalDisputeId(dispute);
  if (disputeId) {
    const movementPart = chargebackText(movementSourceId);
    return movementPart
      ? `paypal_dispute:${disputeId}:${ledgerType}:${movementPart}`
      : `paypal_dispute:${disputeId}:${ledgerType}`;
  }
  const tx = paypalDisputeTransactionId(dispute);
  if (tx) return `paypal_transaction:${tx}:${ledgerType}:${disputeOccurredAt(dispute)}`;
  return null;
}

export function normalizePaypalDisputeEvents(dispute: any, args: {
  workspace_id: string;
  platform?: string | null;
  connector_id: string;
  processor_account_id: string;
}): NormalizedChargebackEvent[] {
  const disputeId = paypalDisputeId(dispute);
  if (!disputeId) return [];
  const platform = chargebackText(args.platform) || "paypal";
  const processorAccountId = chargebackText(args.processor_account_id) || "unknown";
  const occurredAt = disputeOccurredAt(dispute);
  const orderId = paypalDisputeOrderReference(dispute);
  const processorTransactionId = paypalDisputeTransactionId(dispute) || null;
  const principal = chargebackMoney(dispute?.dispute_amount ?? dispute?.disputed_amount ?? dispute?.amount);
  const fee = chargebackMoney(dispute?.chargeback_fee ?? dispute?.dispute_fee);
  const sellerFavorable = isSellerFavorableDispute(dispute);
  const principalRecovery = paypalExplicitPrincipalRecovery(dispute);
  const feeRecovery = paypalExplicitFeeRecovery(dispute);
  const events: NormalizedChargebackEvent[] = [];

  if (!sellerFavorable && principal && principal.value !== 0) {
    const principalType: ChargebackLedgerType = "chargeback";
    const sourceEventId = paypalDisputeSourceId(dispute, principalType);
    const transactionId = stableChargebackEventId({
      workspace_id: args.workspace_id,
      platform,
      processor_account_id: processorAccountId,
      ledger_type: principalType,
      source_event_id: sourceEventId,
      fallback_parts: [disputeId, processorTransactionId, occurredAt, principal.value, principal.currency],
    });
    events.push({
      workspace_id: args.workspace_id,
      platform,
      connector_id: args.connector_id,
      processor_account_id: processorAccountId,
      ledger_type: principalType,
      transaction_id: transactionId,
      parent_transaction_id: processorTransactionId,
      order_id: orderId,
      platform_order_id: null,
      commerce_reference: orderId,
      processor_transaction_id: processorTransactionId,
      dispute_id: disputeId,
      source_event_id: sourceEventId || transactionId,
      source_amount: String(principal.value),
      source_direction: sourceDirectionForLedgerType(principalType),
      amount: signedChargebackAmount(principalType, principal.value),
      currency: principal.currency,
      occurred_at: occurredAt,
      status: chargebackText(dispute?.status) || principalType,
      reason: "PayPal dispute principal debit",
      diagnostic_flags: [],
      raw: dispute,
      meta: {
        source: "paypal_customer_disputes",
        dispute_id: disputeId,
        processor_account_id: processorAccountId,
        processor_transaction_id: processorTransactionId,
        seller_transaction_id: paypalDisputeSellerTransactionId(dispute) || null,
        buyer_transaction_id: paypalDisputeBuyerTransactionId(dispute) || null,
      },
    });
  }

  if (principalRecovery) {
    const principalType: ChargebackLedgerType = "chargeback_reversal";
    const sourceEventId = paypalDisputeSourceId(dispute, principalType, principalRecovery.source_id);
    const transactionId = stableChargebackEventId({
      workspace_id: args.workspace_id,
      platform,
      processor_account_id: processorAccountId,
      ledger_type: principalType,
      source_event_id: sourceEventId,
      fallback_parts: [disputeId, "principal_recovery", processorTransactionId, occurredAt, principalRecovery.money.value, principalRecovery.money.currency],
    });
    events.push({
      workspace_id: args.workspace_id,
      platform,
      connector_id: args.connector_id,
      processor_account_id: processorAccountId,
      ledger_type: principalType,
      transaction_id: transactionId,
      parent_transaction_id: processorTransactionId,
      order_id: orderId,
      platform_order_id: null,
      commerce_reference: orderId,
      processor_transaction_id: processorTransactionId,
      dispute_id: disputeId,
      source_event_id: sourceEventId || transactionId,
      source_amount: String(principalRecovery.money.value),
      source_direction: sourceDirectionForLedgerType(principalType),
      amount: signedChargebackAmount(principalType, principalRecovery.money.value),
      currency: principalRecovery.money.currency,
      occurred_at: occurredAt,
      status: chargebackText(dispute?.status) || principalType,
      reason: "PayPal dispute principal recovery",
      diagnostic_flags: [],
      raw: dispute,
      meta: {
        source: "paypal_customer_disputes",
        dispute_id: disputeId,
        processor_account_id: processorAccountId,
        processor_transaction_id: processorTransactionId,
        seller_transaction_id: paypalDisputeSellerTransactionId(dispute) || null,
        buyer_transaction_id: paypalDisputeBuyerTransactionId(dispute) || null,
        recovery_source_id: principalRecovery.source_id,
      },
    });
  }

  if (!sellerFavorable && fee && fee.value !== 0) {
    const feeType: ChargebackLedgerType = "chargeback_fee";
    const sourceEventId = paypalDisputeSourceId(dispute, feeType);
    const transactionId = stableChargebackEventId({
      workspace_id: args.workspace_id,
      platform,
      processor_account_id: processorAccountId,
      ledger_type: feeType,
      source_event_id: sourceEventId,
      fallback_parts: [disputeId, "fee", occurredAt, fee.value, fee.currency],
    });
    events.push({
      workspace_id: args.workspace_id,
      platform,
      connector_id: args.connector_id,
      processor_account_id: processorAccountId,
      ledger_type: feeType,
      transaction_id: transactionId,
      parent_transaction_id: disputeId,
      order_id: orderId,
      platform_order_id: null,
      commerce_reference: orderId,
      processor_transaction_id: processorTransactionId,
      dispute_id: disputeId,
      source_event_id: sourceEventId || transactionId,
      source_amount: String(fee.value),
      source_direction: sourceDirectionForLedgerType(feeType),
      amount: signedChargebackAmount(feeType, fee.value),
      currency: fee.currency,
      occurred_at: occurredAt,
      status: chargebackText(dispute?.status) || feeType,
      reason: "PayPal dispute fee debit",
      diagnostic_flags: [],
      raw: dispute,
      meta: {
        source: "paypal_customer_disputes",
        dispute_id: disputeId,
        processor_account_id: processorAccountId,
        processor_transaction_id: processorTransactionId,
        seller_transaction_id: paypalDisputeSellerTransactionId(dispute) || null,
        buyer_transaction_id: paypalDisputeBuyerTransactionId(dispute) || null,
      },
    });
  }

  if (feeRecovery) {
    const feeType: ChargebackLedgerType = "chargeback_fee_reversal";
    const sourceEventId = paypalDisputeSourceId(dispute, feeType, feeRecovery.source_id);
    const transactionId = stableChargebackEventId({
      workspace_id: args.workspace_id,
      platform,
      processor_account_id: processorAccountId,
      ledger_type: feeType,
      source_event_id: sourceEventId,
      fallback_parts: [disputeId, "fee_recovery", occurredAt, feeRecovery.money.value, feeRecovery.money.currency],
    });
    events.push({
      workspace_id: args.workspace_id,
      platform,
      connector_id: args.connector_id,
      processor_account_id: processorAccountId,
      ledger_type: feeType,
      transaction_id: transactionId,
      parent_transaction_id: disputeId,
      order_id: orderId,
      platform_order_id: null,
      commerce_reference: orderId,
      processor_transaction_id: processorTransactionId,
      dispute_id: disputeId,
      source_event_id: sourceEventId || transactionId,
      source_amount: String(feeRecovery.money.value),
      source_direction: sourceDirectionForLedgerType(feeType),
      amount: signedChargebackAmount(feeType, feeRecovery.money.value),
      currency: feeRecovery.money.currency,
      occurred_at: occurredAt,
      status: chargebackText(dispute?.status) || feeType,
      reason: "PayPal dispute fee recovery",
      diagnostic_flags: [],
      raw: dispute,
      meta: {
        source: "paypal_customer_disputes",
        dispute_id: disputeId,
        processor_account_id: processorAccountId,
        processor_transaction_id: processorTransactionId,
        seller_transaction_id: paypalDisputeSellerTransactionId(dispute) || null,
        buyer_transaction_id: paypalDisputeBuyerTransactionId(dispute) || null,
        recovery_source_id: feeRecovery.source_id,
      },
    });
  }

  return events;
}

const PAYPAL_DISPUTE_CONTINUATION_PARAMS = new Set([
  "page",
  "page_size",
  "next_page_token",
  "update_time_after",
  "update_time_before",
  "create_time_after",
  "create_time_before",
  "start_time",
  "dispute_state",
]);

export function sanitizePaypalDisputeNextQuery(nextHref: unknown, baseUrl: string): Record<string, string> | null {
  const href = chargebackText(nextHref);
  if (!href) return null;
  try {
    const base = new URL(baseUrl);
    const parsed = new URL(href);
    if (parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    if (parsed.hostname !== base.hostname) return null;
    if (parsed.pathname.replace(/\/+$/, "") !== "/v1/customer/disputes") return null;
    const query: Record<string, string> = {};
    for (const [key, value] of parsed.searchParams.entries()) {
      if (PAYPAL_DISPUTE_CONTINUATION_PARAMS.has(key) && chargebackText(value)) {
        query[key] = value;
      }
    }
    return Object.keys(query).length ? query : null;
  } catch {
    return null;
  }
}

export function paypalDisputeContinuationCursor(query: Record<string, string> | null) {
  if (!query) return null;
  return chargebackText(query.next_page_token)
    || chargebackText(query.page)
    || canonicalQuery(query)
    || null;
}

export function clampPaypalDisputeUpdateTimeBefore(toIso: string, now = new Date()) {
  const requestedMs = Date.parse(toIso);
  const nowMs = now.getTime();
  if (!Number.isFinite(requestedMs)) return toIso;
  return new Date(Math.min(requestedMs, nowMs)).toISOString();
}

export function paypalDisputeWindowBounds(fromIso: string, toIso: string, now = new Date()) {
  const clampedTo = clampPaypalDisputeUpdateTimeBefore(toIso, now);
  const fromMs = Date.parse(fromIso);
  const toMs = Date.parse(clampedTo);
  return {
    from_iso: Number.isFinite(fromMs) ? new Date(fromMs).toISOString() : fromIso,
    to_iso: Number.isFinite(toMs) ? new Date(toMs).toISOString() : clampedTo,
    empty: Number.isFinite(fromMs) && Number.isFinite(toMs) && fromMs >= toMs,
  };
}

export function dedupePaypalDisputeListItems(disputes: any[]) {
  const seen = new Set<string>();
  const unique: any[] = [];
  for (const dispute of disputes || []) {
    const disputeId = paypalDisputeId(dispute);
    const key = disputeId || `missing:${unique.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(dispute);
  }
  return unique;
}

export function parsePaypalDisputeListPage(response: any, args: { requested_page?: number; page_size?: number; base_url?: string } = {}): PayPalDisputeListPage {
  const disputes = Array.isArray(response?.items)
    ? response.items
    : Array.isArray(response?.disputes)
      ? response.disputes
      : Array.isArray(response?.data)
        ? response.data
        : [];
  const page = Number(response?.page ?? args.requested_page ?? 1) || 1;
  const pageSize = Number(response?.page_size ?? args.page_size ?? (disputes.length || 0)) || 0;
  const totalItems = Number.isFinite(Number(response?.total_items)) ? Number(response.total_items) : null;
  const totalPages = Number.isFinite(Number(response?.total_pages)) ? Number(response.total_pages) : null;
  const nextLink = Array.isArray(response?.links)
    ? response.links.find((link: any) => cleanLower(link?.rel) === "next")
    : null;
  const nextHref = chargebackText(nextLink?.href);
  const nextQuery = sanitizePaypalDisputeNextQuery(nextHref, args.base_url || "https://api-m.paypal.com");
  let nextPageToken: string | null = null;
  let linkedNextPage: number | null = null;
  if (nextQuery) {
    nextPageToken = chargebackText(nextQuery.next_page_token) || null;
    linkedNextPage = Number(nextQuery.page) || null;
  }
  const nextPage = linkedNextPage || (nextQuery ? page + 1 : null);
  const hasMore = Boolean(nextQuery);
  const nextCursor = paypalDisputeContinuationCursor(nextQuery) || (hasMore && nextPage ? String(nextPage) : null);

  return {
    disputes,
    page,
    page_size: pageSize,
    total_items: totalItems,
    total_pages: totalPages,
    has_more: hasMore,
    next_page: hasMore ? nextPage || page + 1 : null,
    next_page_token: nextPageToken,
    next_query: nextQuery,
    next_cursor: nextCursor,
  };
}

export function buildPaypalDisputeListUrl(args: {
  base_url: string;
  from_iso: string;
  to_iso: string;
  page?: number | null;
  page_size?: number | null;
  next_page_token?: string | null;
  next_query?: Record<string, string> | null;
}) {
  const url = new URL("/v1/customer/disputes", `${args.base_url.replace(/\/+$/, "")}/`);
  const nextQuery = args.next_query && typeof args.next_query === "object" ? args.next_query : null;
  if (nextQuery) {
    for (const [key, value] of Object.entries(nextQuery)) {
      if (PAYPAL_DISPUTE_CONTINUATION_PARAMS.has(key) && chargebackText(value)) {
        url.searchParams.set(key, key === "update_time_before" ? clampPaypalDisputeUpdateTimeBefore(value) : value);
      }
    }
    return url.toString();
  }
  const bounds = paypalDisputeWindowBounds(args.from_iso, args.to_iso);
  url.searchParams.set("page_size", String(Math.max(1, Math.min(50, Number(args.page_size || 50)))));
  url.searchParams.set("update_time_after", bounds.from_iso);
  url.searchParams.set("update_time_before", bounds.to_iso);
  if (args.next_page_token) {
    url.searchParams.set("next_page_token", args.next_page_token);
  } else {
    url.searchParams.set("page", String(Math.max(1, Number(args.page || 1))));
  }
  return url.toString();
}

export function buildPaypalDisputeDetailUrl(baseUrl: string, disputeId: unknown) {
  const id = chargebackText(disputeId);
  if (!id) return null;
  const url = new URL(`/v1/customer/disputes/${encodeURIComponent(id)}`, `${baseUrl.replace(/\/+$/, "")}/`);
  return url.toString();
}

export function mergePaypalDisputeListAndDetail(listDispute: any, detailDispute: any) {
  if (!detailDispute || typeof detailDispute !== "object" || Array.isArray(detailDispute)) {
    throw new Error("PayPal dispute detail payload is malformed.");
  }
  const listDisputeId = paypalDisputeId(listDispute);
  const detailDisputeId = paypalDisputeId(detailDispute);
  if (!detailDisputeId) {
    throw new Error("PayPal dispute detail payload is missing dispute_id.");
  }
  if (listDisputeId && detailDisputeId !== listDisputeId) {
    throw new Error("PayPal dispute detail payload dispute_id mismatch.");
  }
  return {
    ...(listDispute && typeof listDispute === "object" ? listDispute : {}),
    ...(detailDispute && typeof detailDispute === "object" ? detailDispute : {}),
    paypal_list_summary: listDispute && typeof listDispute === "object" ? listDispute : null,
  };
}

export function summarizePaypalDisputeNormalizationDiagnostics(dispute: any) {
  const disputeId = paypalDisputeId(dispute) || null;
  const diagnostics: Record<string, unknown>[] = [];
  if (isSellerFavorableDispute(dispute) && !paypalExplicitPrincipalRecovery(dispute)) {
    diagnostics.push({
      reason: "paypal_seller_favorable_without_explicit_principal_recovery",
      dispute_id: disputeId,
    });
  }
  if (isSellerFavorableDispute(dispute) && !paypalExplicitFeeRecovery(dispute)) {
    diagnostics.push({
      reason: "paypal_seller_favorable_without_explicit_fee_recovery",
      dispute_id: disputeId,
    });
  }
  if (!chargebackMoney(dispute?.chargeback_fee ?? dispute?.dispute_fee)) {
    diagnostics.push({
      reason: "paypal_dispute_fee_not_exposed",
      dispute_id: disputeId,
    });
  }
  return diagnostics;
}

export function classifyGatewayClassicAction(action: GatewayClassicAction): GatewayActionClassification {
  const text = [
    action.action_type,
    action.response_text,
    action.condition,
    (action.raw as any)?.processor_response_text,
    (action.raw as any)?.response_code,
  ].map(cleanLower).join(" ");

  if (/\bach\b/.test(text) && /\b(return|returned|r\d{2})\b/.test(text)) return "ach_return";
  if (/\b(refund|credit)\b/.test(text)) return "refund";
  if (/\bvoid\b/.test(text)) return "void";
  if (/\b(fee|surcharge)\b/.test(text) && /\b(chargeback|dispute)\b/.test(text)) return "processor_fee";
  if (/\b(reversal|recovered|recovery|won|representment)\b/.test(text) && /\b(chargeback|dispute|return)\b/.test(text)) return "reversal_recovery";
  if (/\b(chargeback|dispute)\b/.test(text) && !/\bach\b/.test(text)) return "card_chargeback_dispute";
  return "unknown";
}

export function summarizeGatewayClassicActionsForDiagnostics(args: {
  platform: string;
  processor_account_id: string;
  actions: GatewayClassicAction[];
}): GatewayClassicActionDiagnostic[] {
  return (args.actions || []).map((action) => {
    const classification = classifyGatewayClassicAction(action);
    return {
      platform: args.platform,
      processor_account_id: args.processor_account_id,
      transaction_id: action.transaction_id,
      order_id: action.order_id,
      action_type: action.action_type,
      action_date: action.action_date,
      classification,
      inserted: false,
      reason: classification === "card_chargeback_dispute"
        ? "mapping_requires_representative_payload_confirmation"
        : "not_a_card_chargeback_mapping",
    };
  });
}
