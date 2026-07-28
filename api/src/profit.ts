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
};

export type FinancialIssueOrderRow = {
  platform_order_id?: string | null;
  order_id?: string | null;
  platform?: string | null;
  status?: string | null;
  status_norm?: string | null;
  gross_amount?: number | string | null;
  receipt_total?: number | string | null;
  currency?: string | null;
  order_ts?: string | null;
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

function sourceDimensions(order: FinancialIssueOrderRow | null | undefined) {
  const raw = order?.raw_json;
  const affiliateId = firstText(order?.affiliate_id, rawText(raw, ["affiliate_id", "affiliateId", "Affiliate ID"]));
  const sourceId = firstText(order?.source_id, rawText(raw, ["source_id", "sourceId", "Source ID", "traffic_source", "utm_source"]));
  const campaignId = firstText(
    rawText(raw, ["campaign_id", "campaignId", "Campaign ID", "utm_campaign"]),
    order?.sub1,
  );
  const brandId = rawText(raw, ["brand_id", "brandId", "Brand ID", "brand"]);
  const offerId = rawText(raw, ["offer_id", "offerId", "Offer ID", "offer"]);
  const productId = rawText(raw, ["product_id", "productId", "Product ID", "sku", "SKU"]);
  const attributionStatus = affiliateId || sourceId || campaignId ? "attributed" : "unattributed";

  if (affiliateId) {
    return {
      group_key: `affiliate:${affiliateId}`,
      group_type: "affiliate",
      source_name: `Affiliate ${affiliateId}`,
      affiliate_id: affiliateId,
      source_id: sourceId || null,
      campaign_id: campaignId || null,
      brand_id: brandId || null,
      offer_id: offerId || null,
      product_id: productId || null,
      attribution_status: attributionStatus,
    };
  }

  if (sourceId) {
    return {
      group_key: `source:${sourceId}`,
      group_type: "traffic_source",
      source_name: `Source ${sourceId}`,
      affiliate_id: null,
      source_id: sourceId,
      campaign_id: campaignId || null,
      brand_id: brandId || null,
      offer_id: offerId || null,
      product_id: productId || null,
      attribution_status: attributionStatus,
    };
  }

  if (campaignId) {
    return {
      group_key: `campaign:${campaignId}`,
      group_type: "campaign",
      source_name: `Campaign ${campaignId}`,
      affiliate_id: null,
      source_id: null,
      campaign_id: campaignId,
      brand_id: brandId || null,
      offer_id: offerId || null,
      product_id: productId || null,
      attribution_status: attributionStatus,
    };
  }

  return {
    group_key: "unknown",
    group_type: "unknown",
    source_name: "Unattributed / Unknown",
    affiliate_id: null,
    source_id: null,
    campaign_id: null,
    brand_id: brandId || null,
    offer_id: offerId || null,
    product_id: productId || null,
    attribution_status: attributionStatus,
  };
}

function matchesAnalysisFilters(dimensions: ReturnType<typeof sourceDimensions>, filters: FinancialIssueAnalysisFilters) {
  if (filters.affiliate_id && dimensions.affiliate_id !== filters.affiliate_id) return false;
  if (filters.source_id && dimensions.source_id !== filters.source_id) return false;
  if (filters.campaign_id && dimensions.campaign_id !== filters.campaign_id) return false;
  if (filters.brand_id && dimensions.brand_id !== filters.brand_id) return false;
  if (filters.offer_id && dimensions.offer_id !== filters.offer_id) return false;
  if (filters.product_id && dimensions.product_id !== filters.product_id) return false;
  if (filters.attribution_status && dimensions.attribution_status !== filters.attribution_status) return false;
  return true;
}

function safePage(value: number | null | undefined) {
  const n = Math.trunc(Number(value || 1));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function safeLimit(value: number | null | undefined) {
  const n = Math.trunc(Number(value || 25));
  if (!Number.isFinite(n) || n <= 0) return 25;
  return Math.min(100, Math.max(1, n));
}

function sortDirection(value: string | null | undefined) {
  return String(value || "desc").toLowerCase() === "asc" ? "asc" : "desc";
}

function bucketKey(occurredAt: unknown, from?: string | null, to?: string | null) {
  const day = dayFromOccurredAt(occurredAt);
  if (!day) return null;
  const fromDt = from ? new Date(`${from}T00:00:00.000Z`) : null;
  const toDt = to ? new Date(`${to}T00:00:00.000Z`) : null;
  if (fromDt && toDt && Number.isFinite(fromDt.getTime()) && Number.isFinite(toDt.getTime())) {
    const spanDays = Math.max(1, Math.ceil((toDt.getTime() - fromDt.getTime()) / 86_400_000) + 1);
    if (spanDays > 62) {
      const dt = new Date(`${day}T00:00:00.000Z`);
      const weekStart = new Date(dt);
      weekStart.setUTCDate(dt.getUTCDate() - dt.getUTCDay());
      return weekStart.toISOString().slice(0, 10);
    }
  }
  return day;
}

export function buildFinancialIssueAnalysis(
  ledgerRows: FinancialIssueLedgerRow[],
  platformOrders: FinancialIssueOrderRow[],
  options: FinancialIssueAnalysisOptions,
) {
  const kind = options.kind;
  const page = safePage(options.page);
  const limit = safeLimit(options.limit);
  const direction = sortDirection(options.direction);
  const ordersById = new Map<string, FinancialIssueOrderRow>();

  for (const order of platformOrders) {
    const orderId = canonicalOrderId(order);
    if (orderId && !ordersById.has(orderId)) ordersById.set(orderId, order);
  }

  const sourceRows = new Map<string, any>();
  const orderRevenue = new Map<string, number>();
  const issueAmountsByOrder = new Map<string, number>();
  const issueEventsByOrder = new Map<string, number>();
  const trend = new Map<string, { date: string; amount: number; count: number; affected_orders: Set<string> }>();
  const saleOrderIds = new Set<string>();
  const issueOrderIds = new Set<string>();
  const sourcedSaleOrderIds = new Set<string>();
  const missingDenominators = new Set<string>();
  let totalRevenue = 0;
  let issueAmount = 0;
  let issueEventCount = 0;

  function sourceForOrderId(orderId: string) {
    return sourceDimensions(ordersById.get(orderId));
  }

  function entryFor(dimensions: ReturnType<typeof sourceDimensions>) {
    const existing = sourceRows.get(dimensions.group_key);
    if (existing) return existing;
    const entry = {
      group_key: dimensions.group_key,
      group_type: dimensions.group_type,
      source_name: dimensions.source_name,
      affiliate_id: dimensions.affiliate_id,
      source_id: dimensions.source_id,
      campaign_id: dimensions.campaign_id,
      brand_id: dimensions.brand_id,
      offer_id: dimensions.offer_id,
      product_id: dimensions.product_id,
      attribution_status: dimensions.attribution_status,
      total_orders_set: new Set<string>(),
      affected_orders_set: new Set<string>(),
      total_revenue: 0,
      event_count: 0,
      amount: 0,
    };
    sourceRows.set(dimensions.group_key, entry);
    return entry;
  }

  for (const row of ledgerRows) {
    const orderId = canonicalOrderId(row);
    if (!orderId) continue;
    const dimensions = sourceForOrderId(orderId);
    if (!matchesAnalysisFilters(dimensions, options)) continue;
    const ledgerType = String(row.ledger_type || "");
    const amount = numberFrom(row.amount);

    if (ledgerType === "sale" && amount > 0) {
      saleOrderIds.add(orderId);
      orderRevenue.set(orderId, roundMoney((orderRevenue.get(orderId) || 0) + amount));
      totalRevenue += amount;
      if (dimensions.attribution_status === "attributed") sourcedSaleOrderIds.add(orderId);
      const entry = entryFor(dimensions);
      entry.total_orders_set.add(orderId);
      entry.total_revenue += amount;
    }

    if (ledgerType === kind) {
      const absoluteAmount = Math.abs(amount);
      issueAmount += absoluteAmount;
      issueEventCount += 1;
      issueOrderIds.add(orderId);
      issueAmountsByOrder.set(orderId, roundMoney((issueAmountsByOrder.get(orderId) || 0) + absoluteAmount));
      issueEventsByOrder.set(orderId, (issueEventsByOrder.get(orderId) || 0) + 1);

      const bucket = bucketKey(row.occurred_at, options.from, options.to);
      if (bucket) {
        const point = trend.get(bucket) || { date: bucket, amount: 0, count: 0, affected_orders: new Set<string>() };
        point.amount += absoluteAmount;
        point.count += 1;
        point.affected_orders.add(orderId);
        trend.set(bucket, point);
      }

      const entry = entryFor(dimensions);
      entry.affected_orders_set.add(orderId);
      entry.event_count += 1;
      entry.amount += absoluteAmount;
    }
  }

  const sources = Array.from(sourceRows.values()).map((entry) => {
    const totalOrders = entry.total_orders_set.size;
    const affectedOrders = entry.affected_orders_set.size;
    const totalRevenueForSource = roundMoney(entry.total_revenue);
    const amountForSource = roundMoney(entry.amount);
    const rateByOrders = totalOrders > 0 ? affectedOrders / totalOrders : null;
    const rateByRevenue = totalRevenueForSource > 0 ? amountForSource / totalRevenueForSource : null;

    if (affectedOrders > 0 && totalOrders <= 0) missingDenominators.add(`${entry.source_name}: total orders`);
    if (amountForSource > 0 && totalRevenueForSource <= 0) missingDenominators.add(`${entry.source_name}: total revenue`);

    return {
      group_key: entry.group_key,
      group_type: entry.group_type,
      source_name: entry.source_name,
      affiliate_id: entry.affiliate_id,
      source_id: entry.source_id,
      campaign_id: entry.campaign_id,
      brand_id: entry.brand_id,
      offer_id: entry.offer_id,
      product_id: entry.product_id,
      attribution_status: entry.attribution_status,
      total_orders: totalOrders,
      total_revenue: totalRevenueForSource,
      event_count: entry.event_count,
      affected_orders: affectedOrders,
      amount: amountForSource,
      rate_by_orders: roundRatio(rateByOrders),
      rate_by_revenue: roundRatio(rateByRevenue),
      average_affected_order_value: affectedOrders > 0 ? roundMoney(amountForSource / affectedOrders) : null,
    };
  });

  const sort = String(options.sort || "rate_by_revenue");
  const sortField = new Set(["count", "amount", "rate_by_orders", "rate_by_revenue", "total_revenue"]).has(sort)
    ? sort
    : "rate_by_revenue";
  const sortedSources = sources.sort((a, b) => {
    const aValue = sortField === "count" ? a.affected_orders : Number((a as any)[sortField] ?? -1);
    const bValue = sortField === "count" ? b.affected_orders : Number((b as any)[sortField] ?? -1);
    const diff = aValue - bValue || String(a.source_name).localeCompare(String(b.source_name));
    return direction === "asc" ? diff : -diff;
  });

  const totalSources = sortedSources.length;
  const offset = (page - 1) * limit;
  const pagedSources = sortedSources.slice(offset, offset + limit);

  const affectedOrders = Array.from(issueAmountsByOrder.entries())
    .map(([orderId, amount]) => {
      const order = ordersById.get(orderId);
      const dimensions = sourceForOrderId(orderId);
      return {
        order_id: orderId,
        group_key: dimensions.group_key,
        group_type: dimensions.group_type,
        platform_order_id: order?.platform_order_id || null,
        order_date: order?.order_ts || null,
        customer: firstText(order?.customer_email, order?.customer_email_normalized, order?.email) || null,
        affiliate_or_source: dimensions.source_name,
        affiliate_id: dimensions.affiliate_id,
        source_id: dimensions.source_id,
        gross_revenue: roundMoney(orderRevenue.get(orderId) || numberFrom(order?.gross_amount) || numberFrom(order?.receipt_total)),
        amount,
        event_count: issueEventsByOrder.get(orderId) || 0,
        currency: firstText(order?.currency, ledgerRows.find((row) => canonicalOrderId(row) === orderId)?.currency, "USD"),
        status: firstText(order?.status_norm, order?.status) || null,
        attribution_confidence: dimensions.attribution_status === "attributed" ? "deterministic_source_identifier" : "unavailable",
      };
    })
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 50);

  const trendRows = Array.from(trend.values())
    .map((point) => ({
      date: point.date,
      amount: roundMoney(point.amount),
      count: point.count,
      affected_orders: point.affected_orders.size,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const warnings: string[] = [];
  if (!options.scanned_all) warnings.push("Analysis is based on a bounded ledger scan; narrow the date range for complete source ranking.");
  if (!platformOrders.length && ledgerRows.some((row) => canonicalOrderId(row))) {
    warnings.push("Ledger data is available, but matching platform order source fields are unavailable.");
  }

  return {
    summary: {
      amount: roundMoney(issueAmount),
      event_count: issueEventCount,
      affected_orders: issueOrderIds.size,
      rate_by_orders: saleOrderIds.size > 0 ? roundRatio(issueOrderIds.size / saleOrderIds.size) : null,
      rate_by_revenue: totalRevenue > 0 ? roundRatio(issueAmount / totalRevenue) : null,
      average_amount: issueOrderIds.size > 0 ? roundMoney(issueAmount / issueOrderIds.size) : null,
      total_orders: saleOrderIds.size,
      total_revenue: roundMoney(totalRevenue),
    },
    trend: trendRows,
    sources: pagedSources,
    affected_orders: affectedOrders,
    pagination: {
      page,
      limit,
      total: totalSources,
      total_pages: Math.max(1, Math.ceil(totalSources / limit)),
    },
    data_quality: {
      attributed_order_coverage: saleOrderIds.size > 0 ? roundRatio(sourcedSaleOrderIds.size / saleOrderIds.size) : null,
      missing_denominators: Array.from(missingDenominators).slice(0, 20),
      warnings,
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
