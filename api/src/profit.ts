export type ProfitLedgerType =
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

export type ProfitConversionRow = {
  workspace_id?: string | null;
  order_id?: string | null;
  connector_id?: string | null;
  currency?: string | null;
  platform?: string | null;
  event_source?: string | null;
  ledger_type?: string | null;
  amount?: number | string | null;
  occurred_at?: string | null;
};

export type ProfitOrderKey = {
  workspaceId: string;
  orderId: string;
  connectorId: string;
  currency: string;
};

export type ProfitDailyKey = {
  workspaceId: string;
  day: string;
  connectorId: string;
  currency: string;
};

export type ProfitTotals = {
  gross_revenue: number;
  refunds: number;
  chargebacks: number;
  chargeback_fees: number;
  processor_fees: number;
  bank_fees: number;
  shipping_cost: number;
  tax: number;
  cogs: number;
  affiliate_payout: number;
  ad_spend: number;
  reversals: number;
  adjustments: number;
  net_revenue: number;
  total_costs: number;
  net_profit: number;
  profit_margin_pct: number | null;
};

export type ProfitAggregation = ProfitTotals & {
  platform: string;
  event_source: string;
  event_count: number;
  first_event_at: string | null;
  last_event_at: string | null;
};

export type ProfitDailyAggregation = ProfitAggregation & {
  order_count: number;
};

export type FinancialIssueKind = "refund" | "chargeback";

export type FinancialIssueLedgerRow = ProfitConversionRow & {
  transaction_id?: string | null;
  status?: string | null;
  raw?: Record<string, unknown> | null;
};

export type FinancialIssueOrderRow = {
  workspace_id?: string | null;
  platform_order_id?: string | null;
  order_id?: string | null;
  platform?: string | null;
  status?: string | null;
  status_norm?: string | null;
  transaction_id?: string | null;
  gross_amount?: number | string | null;
  receipt_total?: number | string | null;
  currency?: string | null;
  order_ts?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  customer_email?: string | null;
  customer_email_normalized?: string | null;
  email?: string | null;
  affiliate_id?: string | null;
  source_id?: string | null;
  sub1?: string | null;
  sub2?: string | null;
  sub3?: string | null;
  sub4?: string | null;
  sub5?: string | null;
  raw_json?: Record<string, unknown> | null;
};

export type FinancialIssueAnalysisFilters = {
  affiliate_id?: string | null;
  source_id?: string | null;
  campaign_id?: string | null;
  brand_id?: string | null;
  offer_id?: string | null;
  product_id?: string | null;
  attribution_status?: string | null;
};

export type FinancialIssueAnalysisOptions = FinancialIssueAnalysisFilters & {
  kind: FinancialIssueKind;
  from?: string | null;
  to?: string | null;
  sort?: string | null;
  direction?: string | null;
  page?: number | null;
  limit?: number | null;
  scanned_all?: boolean;
};

export type FinancialIssueDiagnostics = {
  ledger_records_scanned: number;
  ledger_issue_records: number;
  platform_issue_records_scanned: number;
  platform_issue_records_included: number;
  platform_issue_records_excluded_by_reason: Record<string, number>;
  included_records: number;
  excluded_records_by_reason: Record<string, number>;
  unmatched_orders: number;
  missing_amounts: number;
};

const COST_BUCKETS = [
  "chargeback_fees",
  "processor_fees",
  "bank_fees",
  "shipping_cost",
  "tax",
  "cogs",
  "affiliate_payout",
  "ad_spend",
] as const;

function numberFrom(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function cleanText(value: unknown, fallback: string) {
  const s = String(value ?? "").trim();
  return s || fallback;
}

export function normalizeProfitWorkspace(value: unknown) {
  return cleanText(value, "default");
}

export function normalizeProfitConnector(value: unknown) {
  return cleanText(value, "unknown");
}

export function normalizeProfitCurrency(value: unknown) {
  return cleanText(value, "USD").toUpperCase();
}

export function dayFromOccurredAt(value: unknown): string | null {
  const dt = new Date(String(value ?? ""));
  if (!Number.isFinite(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

export function profitOrderKeyFromConversion(row: ProfitConversionRow): ProfitOrderKey | null {
  const orderId = cleanText(row.order_id, "");
  if (!orderId) return null;

  return {
    workspaceId: normalizeProfitWorkspace(row.workspace_id),
    orderId,
    connectorId: normalizeProfitConnector(row.connector_id),
    currency: normalizeProfitCurrency(row.currency),
  };
}

export function profitDailyKeyFromConversion(row: ProfitConversionRow): ProfitDailyKey | null {
  const orderKey = profitOrderKeyFromConversion(row);
  const day = dayFromOccurredAt(row.occurred_at);
  if (!orderKey || !day) return null;

  return {
    workspaceId: orderKey.workspaceId,
    day,
    connectorId: orderKey.connectorId,
    currency: orderKey.currency,
  };
}

export function profitOrderKeyId(key: ProfitOrderKey) {
  return `${key.workspaceId}\u001f${key.orderId}\u001f${key.connectorId}\u001f${key.currency}`;
}

export function profitDailyKeyId(key: ProfitDailyKey) {
  return `${key.workspaceId}\u001f${key.day}\u001f${key.connectorId}\u001f${key.currency}`;
}

export function conversionMatchesOrderKey(row: ProfitConversionRow, key: ProfitOrderKey) {
  const rowKey = profitOrderKeyFromConversion(row);
  return Boolean(rowKey && profitOrderKeyId(rowKey) === profitOrderKeyId(key));
}

export function conversionMatchesDailyKey(row: ProfitConversionRow, key: ProfitDailyKey) {
  const rowKey = profitDailyKeyFromConversion(row);
  return Boolean(rowKey && profitDailyKeyId(rowKey) === profitDailyKeyId(key));
}

function singleOrMixed(values: Set<string>) {
  if (values.size === 0) return "unknown";
  if (values.size === 1) return Array.from(values)[0];
  return "mixed";
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundRatio(value: number | null) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function rawText(raw: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!raw || typeof raw !== "object") return "";
  for (const key of keys) {
    const direct = firstText(raw[key]);
    if (direct) return direct;
  }
  const normalized = new Map<string, unknown>();
  for (const [key, value] of Object.entries(raw)) {
    normalized.set(key.toLowerCase().replace(/[^a-z0-9]/g, ""), value);
  }
  for (const key of keys) {
    const value = normalized.get(key.toLowerCase().replace(/[^a-z0-9]/g, ""));
    const text = firstText(value);
    if (text) return text;
  }
  return "";
}

function canonicalOrderId(row: { order_id?: string | null }) {
  return firstText(row.order_id);
}

function incrementReason(reasons: Record<string, number>, reason: string) {
  reasons[reason] = (reasons[reason] || 0) + 1;
}

function safeLimit(value: number | null | undefined) {
  const n = Math.trunc(Number(value || 25));
  if (!Number.isFinite(n) || n <= 0) return 25;
  return Math.min(100, Math.max(1, n));
}

function parseFinancialIssueDate(value: unknown) {
  const text = firstText(value);
  if (!text) return "";

  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (us) {
    return new Date(Date.UTC(
      Number(us[3]),
      Number(us[1]) - 1,
      Number(us[2]),
      Number(us[4] || 0),
      Number(us[5] || 0),
      Number(us[6] || 0),
    )).toISOString();
  }

  const direct = new Date(text);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();

  const normalized = new Date(text.replace(" ", "T") + (text.includes("Z") ? "" : "Z"));
  if (!Number.isNaN(normalized.getTime())) return normalized.toISOString();

  return "";
}

function rawMoney(raw: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const text = rawText(raw, [key]).replace(/[$,]/g, "");
    if (!text) continue;
    const amount = Number(text);
    if (Number.isFinite(amount)) return amount;
  }
  return null;
}

function platformIssueStatusText(row: FinancialIssueOrderRow) {
  const raw = row.raw_json;
  return [
    row.status_norm,
    row.status,
    rawText(raw, ["Order Status Name", "Order Status", "order_status", "status"]),
    rawText(raw, ["Receipt Status Name", "Receipt Status", "Payment Status", "payment_status"]),
    rawText(raw, ["Transaction Type", "Event Type", "type"]),
  ].map((value) => String(value || "").trim()).filter(Boolean).join(" | ");
}

export function financialIssueOccurredAtFromPlatformOrder(row: FinancialIssueOrderRow, kind: FinancialIssueKind) {
  const raw = row.raw_json;
  if (kind === "refund") {
    return parseFinancialIssueDate(rawText(raw, [
      "Refund Date",
      "Refund Created Date",
      "Refund Create Date",
      "Refund Completed Date",
      "Updated Date",
      "Order Update Date",
    ]) || row.updated_at || row.order_ts || row.created_at);
  }

  return parseFinancialIssueDate(rawText(raw, [
    "Chargeback Date",
    "Dispute Date",
    "Updated Date",
    "Order Update Date",
  ]) || row.updated_at || row.order_ts || row.created_at);
}

function platformIssueAmount(row: FinancialIssueOrderRow, kind: FinancialIssueKind) {
  const raw = row.raw_json;
  const sourceAmount = kind === "refund"
    ? rawMoney(raw, [
        "Refund Amount",
        "Refunded Amount",
        "Return Amount",
        "Order Price USD",
        "Order Price",
        "Amount USD",
        "Amount",
      ])
    : rawMoney(raw, [
        "Chargeback Amount",
        "Dispute Amount",
        "Order Price USD",
        "Order Price",
        "Amount USD",
        "Amount",
      ]);

  const amount = sourceAmount ?? (numberFrom(row.gross_amount) || numberFrom(row.receipt_total));
  return Math.abs(amount);
}

function platformOrderMatchesFinancialIssue(row: FinancialIssueOrderRow, kind: FinancialIssueKind) {
  const statusText = platformIssueStatusText(row).toLowerCase();
  if (kind === "chargeback") return /chargeback|dispute|chargedback/.test(statusText);
  if (/chargeback|dispute|chargedback/.test(statusText)) return false;
  return /refund|refunded|partial refund|partially refunded|return|void|reversal/.test(statusText);
}

export function financialIssueLedgerRowFromPlatformOrder(
  row: FinancialIssueOrderRow,
  kind: FinancialIssueKind,
): FinancialIssueLedgerRow | null {
  if (!platformOrderMatchesFinancialIssue(row, kind)) return null;

  const orderId = canonicalOrderId(row);
  const platformOrderId = firstText(row.platform_order_id);
  const occurredAt = financialIssueOccurredAtFromPlatformOrder(row, kind);
  const amount = platformIssueAmount(row, kind);
  if (!orderId || !occurredAt || amount <= 0) return null;

  const eventKey = [
    firstText(row.platform, "platform_order"),
    platformOrderId || orderId,
    kind,
    occurredAt,
    amount.toFixed(2),
  ].join(":");

  return {
    workspace_id: normalizeProfitWorkspace(row.workspace_id),
    order_id: orderId,
    connector_id: firstText(row.platform, "platform_order"),
    currency: firstText(row.currency, "USD").toUpperCase(),
    platform: firstText(row.platform, "platform_order"),
    event_source: firstText(row.platform, "platform_order"),
    ledger_type: kind,
    amount: -Math.abs(amount),
    occurred_at: occurredAt,
    transaction_id: eventKey,
    status: firstText(row.status_norm, row.status, kind),
    raw: {
      source: "platform_orders",
      platform_order_id: platformOrderId || null,
      raw_status: platformIssueStatusText(row),
    },
  };
}

export function financialIssuePlatformFallbackDecision(
  row: FinancialIssueOrderRow,
  kind: FinancialIssueKind,
  normalizedIssueOrderIds: ReadonlySet<string>,
) {
  const issueRow = financialIssueLedgerRowFromPlatformOrder(row, kind);
  if (!issueRow) {
    return {
      include: false,
      reason: "not_financial_issue" as const,
      row: null,
    };
  }

  if (normalizedIssueOrderIds.has(String(issueRow.order_id || "").trim())) {
    return {
      include: false,
      reason: "existing_ledger_issue" as const,
      row: issueRow,
    };
  }

  return {
    include: true,
    reason: "legacy_fallback" as const,
    row: issueRow,
  };
}

export function saleLedgerRowFromPlatformOrder(row: FinancialIssueOrderRow): FinancialIssueLedgerRow | null {
  const orderId = canonicalOrderId(row);
  const amount = numberFrom(row.gross_amount);
  const statusText = platformIssueStatusText(row).toLowerCase();
  if (!orderId || amount <= 0) return null;
  if (/refund|chargeback|dispute|void|reversal|cancel|declin|reject|abandon|abort|failed|error/.test(statusText)) return null;

  return {
    workspace_id: normalizeProfitWorkspace(row.workspace_id),
    order_id: orderId,
    connector_id: firstText(row.platform, "platform_order"),
    currency: firstText(row.currency, "USD").toUpperCase(),
    platform: firstText(row.platform, "platform_order"),
    event_source: firstText(row.platform, "platform_order"),
    ledger_type: "sale",
    amount,
    occurred_at: parseFinancialIssueDate(row.order_ts || row.created_at) || null,
    transaction_id: `${firstText(row.platform, "platform_order")}:${firstText(row.platform_order_id, orderId)}:sale`,
    status: firstText(row.status_norm, row.status, "sale"),
  };
}

export function buildFinancialIssueAnalysis(
  ledgerRows: FinancialIssueLedgerRow[],
  platformOrders: FinancialIssueOrderRow[],
  options: FinancialIssueAnalysisOptions,
) {
  const kind = options.kind;
  const limit = Math.min(5, safeLimit(options.limit ?? 5));
  const affiliateFilter = firstText(options.affiliate_id);
  const ordersById = new Map<string, FinancialIssueOrderRow>();

  for (const order of platformOrders) {
    const orderId = canonicalOrderId(order);
    if (orderId && !ordersById.has(orderId)) ordersById.set(orderId, order);
  }

  const affiliateRows = new Map<string, {
    affiliate_id: string;
    affiliate_name: string;
    total_orders: Set<string>;
    affected_orders: Set<string>;
    event_count: number;
    amount: number;
  }>();
  const saleOrderIds = new Set<string>();
  const issueOrderIds = new Set<string>();
  const warnings: string[] = [];
  const diagnostics: FinancialIssueDiagnostics = {
    ledger_records_scanned: ledgerRows.length,
    ledger_issue_records: ledgerRows.filter((row) => String(row.ledger_type || "") === kind).length,
    platform_issue_records_scanned: 0,
    platform_issue_records_included: 0,
    platform_issue_records_excluded_by_reason: {},
    included_records: 0,
    excluded_records_by_reason: {},
    unmatched_orders: 0,
    missing_amounts: 0,
  };
  let issueAmount = 0;
  let issueEventCount = 0;

  function affiliateForOrder(orderId: string) {
    const order = ordersById.get(orderId);
    return firstText(order?.affiliate_id, rawText(order?.raw_json, ["affiliate_id", "affiliateId", "Affiliate ID"]));
  }

  function entryFor(affiliateId: string) {
    const existing = affiliateRows.get(affiliateId);
    if (existing) return existing;
    const entry = {
      affiliate_id: affiliateId,
      affiliate_name: `Affiliate ${affiliateId}`,
      total_orders: new Set<string>(),
      affected_orders: new Set<string>(),
      event_count: 0,
      amount: 0,
    };
    affiliateRows.set(affiliateId, entry);
    return entry;
  }

  for (const row of ledgerRows) {
    const orderId = canonicalOrderId(row);
    const ledgerType = String(row.ledger_type || "");
    const amount = numberFrom(row.amount);

    if (!orderId) {
      if (ledgerType === kind) incrementReason(diagnostics.excluded_records_by_reason, "missing_order_id");
      continue;
    }

    const affiliateId = affiliateForOrder(orderId);
    if (!affiliateId) {
      if (ledgerType === kind) {
        diagnostics.unmatched_orders += 1;
        incrementReason(diagnostics.excluded_records_by_reason, ordersById.has(orderId) ? "missing_affiliate" : "unmatched_order");
      }
      continue;
    }
    if (affiliateFilter && affiliateId !== affiliateFilter) {
      if (ledgerType === kind) incrementReason(diagnostics.excluded_records_by_reason, "affiliate_filter");
      continue;
    }

    const entry = entryFor(affiliateId);

    if (ledgerType === "sale" && amount > 0) {
      saleOrderIds.add(orderId);
      entry.total_orders.add(orderId);
    }

    if (ledgerType === kind) {
      if (amount === 0) {
        diagnostics.missing_amounts += 1;
        incrementReason(diagnostics.excluded_records_by_reason, "missing_amount");
        continue;
      }
      const absoluteAmount = Math.abs(amount);
      issueAmount += absoluteAmount;
      issueEventCount += 1;
      diagnostics.included_records += 1;
      issueOrderIds.add(orderId);
      entry.affected_orders.add(orderId);
      entry.event_count += 1;
      entry.amount += absoluteAmount;
    }
  }

  const affiliates = Array.from(affiliateRows.values()).map((entry) => {
    const totalOrders = entry.total_orders.size;
    const affectedOrders = entry.affected_orders.size;
    const amountForSource = roundMoney(entry.amount);
    const rateByOrders = totalOrders > 0 ? affectedOrders / totalOrders : null;

    if (affectedOrders > 0 && totalOrders <= 0) warnings.push(`${entry.affiliate_name} has affected orders but no sale-order denominator.`);

    return {
      group_key: `affiliate:${entry.affiliate_id}`,
      group_type: "affiliate",
      source_name: entry.affiliate_name,
      affiliate_id: entry.affiliate_id,
      affiliate_name: entry.affiliate_name,
      total_orders: totalOrders,
      event_count: entry.event_count,
      affected_orders: affectedOrders,
      amount: amountForSource,
      rate_by_orders: roundRatio(rateByOrders),
      total_revenue: 0,
      rate_by_revenue: null,
      average_affected_order_value: null,
    };
  });

  const sortedAffiliates = affiliates
    .sort((a, b) =>
      b.affected_orders - a.affected_orders ||
      Number(b.rate_by_orders ?? -1) - Number(a.rate_by_orders ?? -1) ||
      b.event_count - a.event_count ||
      Math.abs(b.amount) - Math.abs(a.amount) ||
      String(a.affiliate_id).localeCompare(String(b.affiliate_id))
    )
    .slice(0, limit);

  if (!options.scanned_all) warnings.push("Analysis is based on a bounded ledger scan; narrow the date range for complete source ranking.");
  if (!platformOrders.length && ledgerRows.some((row) => canonicalOrderId(row))) {
    warnings.push("Ledger data is available, but matching platform order affiliate fields are unavailable.");
  }

  const uniqueWarnings = Array.from(new Set(warnings));

  return {
    summary: {
      amount: roundMoney(issueAmount),
      event_count: issueEventCount,
      affected_orders: issueOrderIds.size,
      rate_by_orders: saleOrderIds.size > 0 ? roundRatio(issueOrderIds.size / saleOrderIds.size) : null,
      total_orders: saleOrderIds.size,
    },
    affiliates: sortedAffiliates,
    sources: sortedAffiliates,
    trend: [],
    affected_orders: [],
    pagination: { page: 1, limit, total: sortedAffiliates.length, total_pages: 1 },
    data_quality: {
      partial_scan: !options.scanned_all,
      attributed_order_coverage: null,
      missing_denominators: [],
      warnings: uniqueWarnings,
      diagnostics,
    },
  };
}

function emptyTotals(): ProfitTotals {
  return {
    gross_revenue: 0,
    refunds: 0,
    chargebacks: 0,
    chargeback_fees: 0,
    processor_fees: 0,
    bank_fees: 0,
    shipping_cost: 0,
    tax: 0,
    cogs: 0,
    affiliate_payout: 0,
    ad_spend: 0,
    reversals: 0,
    adjustments: 0,
    net_revenue: 0,
    total_costs: 0,
    net_profit: 0,
    profit_margin_pct: null,
  };
}

export function aggregateProfitConversions(rows: ProfitConversionRow[]): ProfitAggregation {
  const totals = emptyTotals();
  const platforms = new Set<string>();
  const eventSources = new Set<string>();
  let firstEventAt: string | null = null;
  let lastEventAt: string | null = null;

  for (const row of rows) {
    const amount = numberFrom(row.amount);
    const ledgerType = String(row.ledger_type || "") as ProfitLedgerType;
    const platform = cleanText(row.platform, "");
    const eventSource = cleanText(row.event_source, "");

    if (platform) platforms.add(platform);
    if (eventSource) eventSources.add(eventSource);

    switch (ledgerType) {
      case "sale":
        totals.gross_revenue += amount;
        break;
      case "refund":
        totals.refunds += amount;
        break;
      case "chargeback":
        totals.chargebacks += amount;
        break;
      case "chargeback_fee":
        totals.chargeback_fees += amount;
        break;
      case "processor_fee":
        totals.processor_fees += amount;
        break;
      case "bank_fee":
        totals.bank_fees += amount;
        break;
      case "shipping_cost":
        totals.shipping_cost += amount;
        break;
      case "tax":
        totals.tax += amount;
        break;
      case "cogs":
        totals.cogs += amount;
        break;
      case "affiliate_payout":
        totals.affiliate_payout += amount;
        break;
      case "ad_spend":
        totals.ad_spend += amount;
        break;
      case "reversal":
        totals.reversals += amount;
        break;
      case "adjustment":
        totals.adjustments += amount;
        break;
    }

    totals.net_profit += amount;

    const eventAt = String(row.occurred_at || "").trim();
    if (eventAt) {
      if (!firstEventAt || eventAt < firstEventAt) firstEventAt = eventAt;
      if (!lastEventAt || eventAt > lastEventAt) lastEventAt = eventAt;
    }
  }

  totals.net_revenue = totals.gross_revenue + totals.refunds + totals.chargebacks + totals.reversals;
  totals.total_costs = COST_BUCKETS.reduce((sum, field) => sum + totals[field], 0);
  totals.profit_margin_pct =
    totals.gross_revenue !== 0 ? (totals.net_profit / totals.gross_revenue) * 100 : null;

  for (const key of Object.keys(totals) as (keyof ProfitTotals)[]) {
    if (typeof totals[key] === "number") {
      (totals as any)[key] = roundMoney(totals[key] as number);
    }
  }

  if (totals.profit_margin_pct != null) {
    totals.profit_margin_pct = Math.round((totals.profit_margin_pct + Number.EPSILON) * 10000) / 10000;
  }

  return {
    ...totals,
    platform: singleOrMixed(platforms),
    event_source: singleOrMixed(eventSources),
    event_count: rows.length,
    first_event_at: firstEventAt,
    last_event_at: lastEventAt,
  };
}

export function aggregateDailyProfitConversions(rows: ProfitConversionRow[]): ProfitDailyAggregation {
  const aggregate = aggregateProfitConversions(rows);
  const orderIds = new Set<string>();

  for (const row of rows) {
    const orderId = cleanText(row.order_id, "");
    if (orderId) orderIds.add(orderId);
  }

  return {
    ...aggregate,
    order_count: orderIds.size,
  };
}

export function toProfitOrderRollupRow(key: ProfitOrderKey, aggregate: ProfitAggregation) {
  return {
    workspace_id: key.workspaceId,
    order_id: key.orderId,
    platform: aggregate.platform,
    event_source: aggregate.event_source,
    connector_id: key.connectorId,
    currency: key.currency,
    gross_revenue: aggregate.gross_revenue,
    refunds: aggregate.refunds,
    chargebacks: aggregate.chargebacks,
    chargeback_fees: aggregate.chargeback_fees,
    processor_fees: aggregate.processor_fees,
    bank_fees: aggregate.bank_fees,
    shipping_cost: aggregate.shipping_cost,
    tax: aggregate.tax,
    cogs: aggregate.cogs,
    affiliate_payout: aggregate.affiliate_payout,
    ad_spend: aggregate.ad_spend,
    reversals: aggregate.reversals,
    adjustments: aggregate.adjustments,
    net_revenue: aggregate.net_revenue,
    total_costs: aggregate.total_costs,
    net_profit: aggregate.net_profit,
    profit_margin_pct: aggregate.profit_margin_pct,
    event_count: aggregate.event_count,
    first_event_at: aggregate.first_event_at,
    last_event_at: aggregate.last_event_at,
    updated_at: new Date().toISOString(),
  };
}

export function toProfitDailyRollupRow(key: ProfitDailyKey, aggregate: ProfitDailyAggregation) {
  return {
    workspace_id: key.workspaceId,
    day: key.day,
    platform: aggregate.platform,
    event_source: aggregate.event_source,
    connector_id: key.connectorId,
    currency: key.currency,
    gross_revenue: aggregate.gross_revenue,
    refunds: aggregate.refunds,
    chargebacks: aggregate.chargebacks,
    chargeback_fees: aggregate.chargeback_fees,
    processor_fees: aggregate.processor_fees,
    bank_fees: aggregate.bank_fees,
    shipping_cost: aggregate.shipping_cost,
    tax: aggregate.tax,
    cogs: aggregate.cogs,
    affiliate_payout: aggregate.affiliate_payout,
    ad_spend: aggregate.ad_spend,
    reversals: aggregate.reversals,
    adjustments: aggregate.adjustments,
    net_revenue: aggregate.net_revenue,
    total_costs: aggregate.total_costs,
    net_profit: aggregate.net_profit,
    profit_margin_pct: aggregate.profit_margin_pct,
    order_count: aggregate.order_count,
    event_count: aggregate.event_count,
    updated_at: new Date().toISOString(),
  };
}

export function sumProfitTotals(rows: Array<Partial<ProfitTotals> & { order_count?: number; event_count?: number }>) {
  const totals = emptyTotals();
  let orderCount = 0;
  let eventCount = 0;

  for (const row of rows) {
    for (const field of Object.keys(totals) as (keyof ProfitTotals)[]) {
      if (field === "profit_margin_pct") continue;
      totals[field] = roundMoney((totals[field] as number) + numberFrom(row[field]));
    }
    orderCount += Math.max(0, Math.trunc(numberFrom(row.order_count)));
    eventCount += Math.max(0, Math.trunc(numberFrom(row.event_count)));
  }

  totals.net_revenue = roundMoney(totals.gross_revenue + totals.refunds + totals.chargebacks + totals.reversals);
  totals.total_costs = roundMoney(COST_BUCKETS.reduce((sum, field) => sum + totals[field], 0));
  totals.net_profit = roundMoney(totals.net_profit);
  totals.profit_margin_pct =
    totals.gross_revenue !== 0 ? Math.round(((totals.net_profit / totals.gross_revenue) * 100 + Number.EPSILON) * 10000) / 10000 : null;

  return {
    ...totals,
    order_count: orderCount,
    event_count: eventCount,
  };
}
