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
