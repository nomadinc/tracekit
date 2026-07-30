import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateDailyProfitConversions,
  aggregateProfitConversions,
  buildFinancialIssueAnalysis,
  executiveBucketKey,
  executiveCommerceOrderType,
  executiveCommerceSourceBrand,
  executiveCommerceUnitsSold,
  executiveDashboardRangeBounds,
  isActiveAffiliateCommission,
  isExecutiveCommerceOrder,
  isExecutiveCommerceSale,
  financialIssuePlatformFallbackDecision,
  financialIssueLedgerRowFromPlatformOrder,
  profitDailyKeyFromConversion,
  profitDailyKeyId,
  profitOrderKeyFromConversion,
  profitOrderKeyId,
  saleLedgerRowFromPlatformOrder,
  summarizeAffiliateCommissions,
  summarizeExecutiveCommerceOrders,
  summarizeExecutiveSales,
  type AffiliateCommissionPerformanceRow,
  type ExecutiveCommerceOrderRow,
  type FinancialIssueOrderRow,
  toProfitDailyRollupRow,
  toProfitOrderRollupRow,
  type ProfitConversionRow,
} from "./profit.ts";

const base = {
  workspace_id: "default",
  order_id: "ord_1",
  connector_id: "shop_1",
  currency: "USD",
  platform: "shopify",
  event_source: "shopify",
  occurred_at: "2026-07-01T12:00:00.000Z",
};

function row(ledgerType: string, amount: number, extra: Partial<ProfitConversionRow> = {}): ProfitConversionRow {
  return {
    ...base,
    ledger_type: ledgerType,
    amount,
    ...extra,
  };
}

test("aggregates sale-only profit", () => {
  const result = aggregateProfitConversions([row("sale", 100)]);

  assert.equal(result.gross_revenue, 100);
  assert.equal(result.net_revenue, 100);
  assert.equal(result.total_costs, 0);
  assert.equal(result.net_profit, 100);
  assert.equal(result.profit_margin_pct, 100);
});

test("aggregates sale plus partial refund", () => {
  const result = aggregateProfitConversions([
    row("sale", 100),
    row("refund", -25, { occurred_at: "2026-07-02T12:00:00.000Z" }),
  ]);

  assert.equal(result.gross_revenue, 100);
  assert.equal(result.refunds, -25);
  assert.equal(result.net_revenue, 75);
  assert.equal(result.net_profit, 75);
  assert.equal(result.profit_margin_pct, 75);
});

test("aggregates sale with chargeback and chargeback fee", () => {
  const result = aggregateProfitConversions([
    row("sale", 100),
    row("chargeback", -100),
    row("chargeback_fee", -15),
  ]);

  assert.equal(result.chargebacks, -100);
  assert.equal(result.chargeback_fees, -15);
  assert.equal(result.net_revenue, 0);
  assert.equal(result.total_costs, -15);
  assert.equal(result.net_profit, -15);
});

test("keeps same-order refunds, chargebacks, and recoveries financially independent", () => {
  const result = aggregateProfitConversions([
    row("sale", 100),
    row("refund", -25),
    row("chargeback", -100),
    row("chargeback_fee", -15),
    row("chargeback_reversal", 100),
    row("chargeback_fee_reversal", 15),
  ]);

  assert.equal(result.refunds, -25);
  assert.equal(result.chargebacks, -100);
  assert.equal(result.chargeback_fees, -15);
  assert.equal(result.reversals, 100);
  assert.equal(result.adjustments, 15);
  assert.equal(result.net_revenue, 75);
  assert.equal(result.net_profit, 75);
});

test("aggregates multiple processor fees", () => {
  const result = aggregateProfitConversions([
    row("sale", 100),
    row("processor_fee", -2.9),
    row("processor_fee", -0.3),
  ]);

  assert.equal(result.processor_fees, -3.2);
  assert.equal(result.total_costs, -3.2);
  assert.equal(result.net_profit, 96.8);
});

test("keeps positive and negative adjustments signed as stored", () => {
  const result = aggregateProfitConversions([
    row("sale", 100),
    row("adjustment", 10),
    row("adjustment", -4),
  ]);

  assert.equal(result.adjustments, 6);
  assert.equal(result.net_revenue, 100);
  assert.equal(result.net_profit, 106);
});

test("returns null margin when gross revenue is zero", () => {
  const result = aggregateProfitConversions([row("processor_fee", -2.5)]);

  assert.equal(result.gross_revenue, 0);
  assert.equal(result.net_profit, -2.5);
  assert.equal(result.profit_margin_pct, null);
});

test("builds stable keys and deterministic upsert rows", () => {
  const rows = [row("sale", 100), row("refund", -10)];
  const key = profitOrderKeyFromConversion(rows[0]);

  assert.ok(key);
  assert.equal(profitOrderKeyId(key), "default\u001ford_1\u001fshop_1\u001fUSD");

  const first = toProfitOrderRollupRow(key, aggregateProfitConversions(rows));
  const second = toProfitOrderRollupRow(key, aggregateProfitConversions(rows));

  assert.equal(first.workspace_id, second.workspace_id);
  assert.equal(first.order_id, second.order_id);
  assert.equal(first.connector_id, second.connector_id);
  assert.equal(first.currency, second.currency);
  assert.equal(first.net_profit, second.net_profit);
});

test("aggregates daily profit across multiple orders", () => {
  const rows = [
    row("sale", 100, { order_id: "ord_1" }),
    row("processor_fee", -3, { order_id: "ord_1" }),
    row("sale", 50, { order_id: "ord_2" }),
    row("refund", -10, { order_id: "ord_2" }),
  ];
  const dailyKey = profitDailyKeyFromConversion(rows[0]);

  assert.ok(dailyKey);
  assert.equal(profitDailyKeyId(dailyKey), "default\u001f2026-07-01\u001fshop_1\u001fUSD");

  const aggregate = aggregateDailyProfitConversions(rows);
  const upsert = toProfitDailyRollupRow(dailyKey, aggregate);

  assert.equal(upsert.order_count, 2);
  assert.equal(upsert.gross_revenue, 150);
  assert.equal(upsert.refunds, -10);
  assert.equal(upsert.processor_fees, -3);
  assert.equal(upsert.net_profit, 137);
});

test("executive sales count positive active sale events only and dedupes by order or transaction", () => {
  const result = summarizeExecutiveSales([
    row("sale", 100, { order_id: "ord_a", transaction_id: "txn_a" }),
    row("sale", 100, { order_id: "ord_a", transaction_id: "txn_duplicate" }),
    row("sale", 50, { order_id: "", transaction_id: "txn_b" }),
    row("sale", 25, { order_id: "", transaction_id: "txn_b" }),
    row("sale", 20, { order_id: "ord_cancelled", status: "cancelled" }),
    row("sale", -10, { order_id: "negative_sale" }),
    row("refund", -10, { order_id: "ord_a" }),
  ]);

  assert.equal(result.sales_count, 2);
  assert.equal(result.gross_revenue, 150);
});

test("executive dashboard day bounds respect the requested timezone", () => {
  const bounds = executiveDashboardRangeBounds("2026-07-29", "2026-07-29", "America/Los_Angeles");

  assert.ok(bounds);
  assert.equal(bounds.timeZone, "America/Los_Angeles");
  assert.equal(bounds.from_iso, "2026-07-29T07:00:00.000Z");
  assert.equal(bounds.to_iso, "2026-07-30T07:00:00.000Z");
  assert.equal(executiveBucketKey("2026-07-30T06:59:59.000Z", "America/Los_Angeles", "day"), "2026-07-29");
  assert.equal(executiveBucketKey("2026-07-30T07:00:00.000Z", "America/Los_Angeles", "day"), "2026-07-30");
});

test("executive commission summary uses affiliate_commissions and excludes voided rows", () => {
  const rows: AffiliateCommissionPerformanceRow[] = [
    { commission_amount: 7.5, attributed_amount: 100, status: "draft" },
    { commission_amount: 2.5, attributed_amount: 50, status: "paid" },
    { commission_amount: 99, attributed_amount: 900, status: "voided" },
  ];

  assert.equal(isActiveAffiliateCommission(rows[0]), true);
  assert.equal(isActiveAffiliateCommission(rows[2]), false);

  const result = summarizeAffiliateCommissions(rows);
  assert.equal(result.available, true);
  assert.equal(result.commission_count, 2);
  assert.equal(result.commission_amount, 10);
  assert.equal(result.attributed_amount, 150);
});

function commerceRow(extra: Partial<ExecutiveCommerceOrderRow> = {}): ExecutiveCommerceOrderRow {
  return {
    workspace_id: "default",
    platform: "wowboost",
    platform_order_id: "wowboost:1",
    order_id: "1",
    gross_amount: 99,
    currency: "USD",
    order_ts: "2026-07-29T12:00:00.000Z",
    status: "completed",
    raw_json: {
      Brand: "Life Heater",
      "Order Type": "Regular Order",
      "Order Quantity (Units Sold)": "2",
    },
    ...extra,
  };
}

test("executive commerce definition counts regular order sales separately from upsell orders", () => {
  const regular = commerceRow({ platform_order_id: "wowboost:regular" });
  const upsell = commerceRow({
    platform_order_id: "wowboost:upsell",
    raw_json: { Brand: "Life Heater", "Order Type": "Upsell Order", "Order Quantity (Units Sold)": "1" },
  });

  assert.equal(executiveCommerceOrderType(regular), "Regular Order");
  assert.equal(isExecutiveCommerceOrder(regular), true);
  assert.equal(isExecutiveCommerceSale(regular), true);
  assert.equal(isExecutiveCommerceOrder(upsell), true);
  assert.equal(isExecutiveCommerceSale(upsell), false);

  const result = summarizeExecutiveCommerceOrders([regular, upsell]);
  assert.equal(result.sales_count, 1);
  assert.equal(result.order_count, 2);
  assert.equal(result.units_sold, 3);
  assert.deepEqual(result.sales_revenue_by_currency, [{ currency: "USD", amount: 99 }]);
  assert.deepEqual(result.order_revenue_by_currency, [{ currency: "USD", amount: 198 }]);
  assert.deepEqual(result.average_order_value_by_currency, [{ currency: "USD", amount: 99 }]);
});

test("executive commerce excludes refunded chargeback cancelled void failed declined abandoned and test rows", () => {
  for (const status of ["refunded", "chargeback", "cancelled", "voided", "failed", "declined", "abandoned", "test order"]) {
    assert.equal(isExecutiveCommerceOrder(commerceRow({ status })), false, status);
  }

  assert.equal(isExecutiveCommerceOrder(commerceRow({ gross_amount: 0 })), false);
  assert.equal(
    isExecutiveCommerceOrder(commerceRow({ raw_json: { Brand: "Life Heater", "Order Type": "Lead" } })),
    false,
  );
});

test("executive commerce uses exact raw Brand and keeps unknown brand explicit", () => {
  assert.equal(executiveCommerceSourceBrand(commerceRow()), "Life Heater");
  assert.equal(executiveCommerceSourceBrand(commerceRow({ raw_json: { "Order Type": "Regular Order" } })), "Unknown brand");

  const result = summarizeExecutiveCommerceOrders([
    commerceRow({ platform_order_id: "wowboost:lifeheater" }),
    commerceRow({ platform_order_id: "wowboost:unknown", raw_json: { "Order Type": "Regular Order" } }),
  ], { brand: "Life Heater" });

  assert.equal(result.order_count, 1);
  assert.equal(result.sales_count, 1);
});

test("executive commerce preserves currencies and dedupes platform order snapshots", () => {
  const result = summarizeExecutiveCommerceOrders([
    commerceRow({ platform_order_id: "wowboost:1", gross_amount: 50, currency: "USD" }),
    commerceRow({ platform_order_id: "wowboost:1", gross_amount: 75, currency: "USD" }),
    commerceRow({ platform_order_id: "wowboost:2", gross_amount: 100, currency: "CAD" }),
  ]);

  assert.equal(result.order_count, 2);
  assert.deepEqual(result.order_revenue_by_currency, [
    { currency: "CAD", amount: 100 },
    { currency: "USD", amount: 75 },
  ]);
  assert.deepEqual(result.currencies, ["CAD", "USD"]);
});

test("builds top-five refund affiliates using distinct affected-order counts", () => {
  const result = buildFinancialIssueAnalysis(
    [
      row("sale", 100, { order_id: "ord_a" }),
      row("refund", -25, { order_id: "ord_a", occurred_at: "2026-07-03T12:00:00.000Z" }),
      row("refund", -5, { order_id: "ord_a", occurred_at: "2026-07-04T12:00:00.000Z" }),
      row("sale", 200, { order_id: "ord_b" }),
      row("refund", -50, { order_id: "ord_b", occurred_at: "2026-07-03T12:00:00.000Z" }),
      row("sale", 300, { order_id: "ord_c" }),
      row("chargeback", -300, { order_id: "ord_c", occurred_at: "2026-07-05T12:00:00.000Z" }),
    ],
    [
      { order_id: "ord_a", platform_order_id: "shopify:ord_a", affiliate_id: "aff-1", order_ts: "2026-07-01T12:00:00.000Z", customer_email: "a@example.com" },
      { order_id: "ord_b", platform_order_id: "shopify:ord_b", affiliate_id: "aff-2", order_ts: "2026-07-01T12:00:00.000Z" },
      { order_id: "ord_c", platform_order_id: "shopify:ord_c", affiliate_id: "aff-1", order_ts: "2026-07-01T12:00:00.000Z" },
    ],
    { kind: "refund", from: "2026-07-01", to: "2026-07-07" },
  );

  assert.equal(result.summary.amount, 80);
  assert.equal(result.summary.event_count, 3);
  assert.equal(result.summary.affected_orders, 2);
  assert.equal(result.summary.rate_by_orders, 0.6667);

  const aff1 = result.affiliates.find((source: any) => source.affiliate_id === "aff-1");
  assert.ok(aff1);
  assert.equal(aff1.total_orders, 2);
  assert.equal(aff1.event_count, 2);
  assert.equal(aff1.affected_orders, 1);
  assert.equal(aff1.amount, 30);
  assert.equal(aff1.rate_by_orders, 0.5);
  assert.equal(result.affiliates.length, 2);
});

test("keeps refund and chargeback analysis separate", () => {
  const result = buildFinancialIssueAnalysis(
    [
      row("sale", 100, { order_id: "ord_a" }),
      row("refund", -20, { order_id: "ord_a" }),
      row("chargeback", -100, { order_id: "ord_a" }),
    ],
    [{ order_id: "ord_a", platform_order_id: "shopify:ord_a", affiliate_id: "aff-1" }],
    { kind: "chargeback" },
  );

  assert.equal(result.summary.amount, 100);
  assert.equal(result.summary.event_count, 1);
  assert.equal(result.affiliates[0].affiliate_id, "aff-1");
  assert.equal(result.affiliates[0].amount, 100);
});

test("builds chargeback analysis from matched ledger events with affiliate and source rankings", () => {
  const result = buildFinancialIssueAnalysis(
    [
      row("sale", 100, { order_id: "ord_a" }),
      row("sale", 150, { order_id: "ord_b" }),
      row("sale", 200, { order_id: "ord_c" }),
      row("chargeback", -100, { order_id: "ord_a", occurred_at: "2026-07-05T12:00:00.000Z", transaction_id: "cb-a" } as any),
      row("chargeback", -20, { order_id: "ord_c", occurred_at: "2026-07-06T12:00:00.000Z", transaction_id: "cb-c" } as any),
    ],
    [
      { order_id: "ord_a", platform_order_id: "shopify:ord_a", affiliate_id: "aff-1", source_id: "src-1" },
      { order_id: "ord_b", platform_order_id: "shopify:ord_b", affiliate_id: "aff-1", source_id: "src-1" },
      { order_id: "ord_c", platform_order_id: "shopify:ord_c", sub1: "landing-1" },
    ],
    { kind: "chargeback" },
  );

  assert.equal(result.summary.amount, 120);
  assert.equal(result.summary.event_count, 2);
  assert.equal(result.summary.affected_orders, 2);
  assert.equal(result.summary.total_orders, 3);
  assert.equal(result.summary.rate_by_orders, 0.6667);
  assert.equal(result.affiliates.length, 1);
  assert.equal(result.affiliates[0].affiliate_id, "aff-1");
  assert.equal(result.affiliates[0].event_count, 1);
  assert.equal(result.affiliates[0].affected_orders, 1);
  assert.equal(result.affiliates[0].total_orders, 2);
  assert.equal(result.affiliates[0].rate_by_orders, 0.5);
  assert.deepEqual(new Set(result.sources.map((source: any) => source.group_key)), new Set(["source_id:src-1", "sub1:landing-1"]));
  assert.equal(result.sources.find((source: any) => source.group_key === "source_id:src-1")?.rate_by_orders, 0.5);
  assert.equal(result.sources.find((source: any) => source.group_key === "sub1:landing-1")?.rate_by_orders, 1);
  assert.equal(result.data_quality.diagnostics.included_records_missing_affiliate, 1);
});

test("chargeback analysis excludes missing platform orders and zero amounts", () => {
  const result = buildFinancialIssueAnalysis(
    [
      row("chargeback", -50, { order_id: "missing-platform-order", transaction_id: "cb-missing" } as any),
      row("chargeback", 0, { order_id: "zero-amount", transaction_id: "cb-zero" } as any),
    ],
    [{ order_id: "zero-amount", affiliate_id: "aff-1" }],
    { kind: "chargeback" },
  );

  assert.equal(result.summary.amount, 0);
  assert.equal(result.summary.event_count, 0);
  assert.equal(result.affiliates.length, 0);
  assert.equal(result.data_quality.diagnostics.unmatched_orders, 1);
  assert.equal(result.data_quality.diagnostics.missing_amounts, 1);
  assert.equal(result.data_quality.diagnostics.excluded_records_by_reason.unmatched_order, 1);
  assert.equal(result.data_quality.diagnostics.excluded_records_by_reason.missing_amount, 1);
});

test("chargeback analysis preserves distinct same-order events and deduplicates repeated source events", () => {
  const result = buildFinancialIssueAnalysis(
    [
      row("sale", 300, { order_id: "ord_multi" }),
      row("chargeback", -100, { order_id: "ord_multi", transaction_id: "cb-1", occurred_at: "2026-07-05T12:00:00.000Z" } as any),
      row("chargeback", -25, { order_id: "ord_multi", transaction_id: "cb-2", occurred_at: "2026-07-06T12:00:00.000Z" } as any),
      row("chargeback", -25, { order_id: "ord_multi", transaction_id: "cb-2", occurred_at: "2026-07-06T12:00:00.000Z" } as any),
    ],
    [{ order_id: "ord_multi", affiliate_id: "aff-1", source_id: "src-1" }],
    { kind: "chargeback" },
  );

  assert.equal(result.summary.amount, 125);
  assert.equal(result.summary.event_count, 2);
  assert.equal(result.summary.affected_orders, 1);
  assert.equal(result.affiliates[0].event_count, 2);
  assert.equal(result.sources[0].event_count, 2);
  assert.equal(result.data_quality.diagnostics.duplicate_source_events, 1);
  assert.equal(result.data_quality.diagnostics.excluded_records_by_reason.duplicate_source_event, 1);
});

test("chargeback affiliate filter scopes totals and denominator", () => {
  const result = buildFinancialIssueAnalysis(
    [
      row("sale", 100, { order_id: "ord_a" }),
      row("chargeback", -25, { order_id: "ord_a", transaction_id: "cb-a" } as any),
      row("sale", 200, { order_id: "ord_b" }),
      row("chargeback", -50, { order_id: "ord_b", transaction_id: "cb-b" } as any),
    ],
    [
      { order_id: "ord_a", affiliate_id: "aff-1" },
      { order_id: "ord_b", affiliate_id: "aff-2" },
    ],
    { kind: "chargeback", affiliate_id: "aff-2" },
  );

  assert.equal(result.summary.amount, 50);
  assert.equal(result.summary.event_count, 1);
  assert.equal(result.summary.affected_orders, 1);
  assert.equal(result.summary.total_orders, 1);
  assert.equal(result.affiliates.length, 1);
  assert.equal(result.affiliates[0].affiliate_id, "aff-2");
  assert.equal(result.data_quality.diagnostics.excluded_records_by_reason.affiliate_filter, 1);
});

test("chargeback affiliate without sale denominator reports a warning instead of a misleading rate", () => {
  const result = buildFinancialIssueAnalysis(
    [row("chargeback", -75, { order_id: "ord_no_sale", transaction_id: "cb-no-sale" } as any)],
    [{ order_id: "ord_no_sale", affiliate_id: "aff-1" }],
    { kind: "chargeback" },
  );

  assert.equal(result.summary.rate_by_orders, null);
  assert.equal(result.affiliates[0].rate_by_orders, null);
  assert.match(result.data_quality.warnings.join(" "), /no sale-order denominator/);
});

test("reports missing denominators instead of zero rates", () => {
  const result = buildFinancialIssueAnalysis(
    [row("refund", -15, { order_id: "ord_a" })],
    [{ order_id: "ord_a", platform_order_id: "shopify:ord_a", affiliate_id: "aff-1" }],
    { kind: "refund" },
  );

  assert.equal(result.summary.rate_by_orders, null);
  assert.equal(result.affiliates[0].rate_by_orders, null);
  assert.match(result.data_quality.warnings.join(" "), /no sale-order denominator/);
});

test("affiliate filter scopes summary and rows", () => {
  const result = buildFinancialIssueAnalysis(
    [
      row("sale", 100, { order_id: "ord_a" }),
      row("refund", -25, { order_id: "ord_a" }),
      row("sale", 200, { order_id: "ord_b" }),
      row("refund", -50, { order_id: "ord_b" }),
    ],
    [
      { order_id: "ord_a", affiliate_id: "aff-1" },
      { order_id: "ord_b", affiliate_id: "aff-2" },
    ],
    { kind: "refund", affiliate_id: "aff-2" },
  );

  assert.equal(result.summary.amount, 50);
  assert.equal(result.summary.affected_orders, 1);
  assert.equal(result.summary.total_orders, 1);
  assert.equal(result.affiliates.length, 1);
  assert.equal(result.affiliates[0].affiliate_id, "aff-2");
});

test("top-five affiliate ordering uses affected orders then rate", () => {
  const ledgerRows: ProfitConversionRow[] = [];
  const orders: any[] = [];
  for (let i = 1; i <= 6; i += 1) {
    const affiliate = `aff-${i}`;
    for (let j = 1; j <= i; j += 1) {
      const orderId = `${affiliate}-order-${j}`;
      ledgerRows.push(row("sale", 100, { order_id: orderId }));
      ledgerRows.push(row("refund", -10, { order_id: orderId }));
      orders.push({ order_id: orderId, affiliate_id: affiliate });
    }
  }

  const result = buildFinancialIssueAnalysis(ledgerRows, orders, { kind: "refund" });

  assert.equal(result.affiliates.length, 5);
  assert.deepEqual(result.affiliates.map((entry: any) => entry.affiliate_id), ["aff-6", "aff-5", "aff-4", "aff-3", "aff-2"]);
});

test("maps explicit WowBoost refund platform rows into analysis ledger rows", () => {
  const platformRow: FinancialIssueOrderRow = {
    workspace_id: "default",
    platform: "wowboost",
    platform_order_id: "wowboost:105330",
    order_id: "105330",
    status: "REFUNDED",
    status_norm: "REFUNDED",
    gross_amount: -90.94,
    currency: "USD",
    order_ts: "2026-06-29T12:00:00.000Z",
    affiliate_id: "affiliate-smoke-001",
    raw_json: {
      "Order Status Name": "Partially Refunded",
      "Receipt Status Name": "Paid",
      "Updated Date": "07/07/2026 12:46:01",
      "Order Price USD": "90.94",
    },
  };

  const refund = financialIssueLedgerRowFromPlatformOrder(platformRow, "refund");
  assert.ok(refund);
  assert.equal(refund.order_id, "105330");
  assert.equal(refund.ledger_type, "refund");
  assert.equal(refund.amount, -90.94);
  assert.equal(refund.occurred_at, "2026-07-07T12:46:01.000Z");
  assert.equal(refund.platform, "wowboost");
  assert.match(String(refund.transaction_id), /^wowboost:wowboost:105330:refund:2026-07-07T12:46:01\.000Z:90\.94$/);
});

test("does not classify cancelled or declined WowBoost rows as refunds", () => {
  const cancelled: FinancialIssueOrderRow = {
    platform: "wowboost",
    platform_order_id: "wowboost:cancelled",
    order_id: "cancelled",
    status: "CANCELLED",
    status_norm: "CANCELLED",
    gross_amount: -49,
    currency: "USD",
    order_ts: "2026-07-07T12:46:01.000Z",
    raw_json: {
      "Order Status Name": "Cancelled",
      "Receipt Status Name": "Declined",
      "Updated Date": "07/07/2026 12:46:01",
      "Order Price USD": "49.00",
    },
  };

  assert.equal(financialIssueLedgerRowFromPlatformOrder(cancelled, "refund"), null);
  assert.equal(saleLedgerRowFromPlatformOrder(cancelled), null);
});

test("uses receipt refunded evidence from WowBoost raw payloads", () => {
  const shippedRefunded: FinancialIssueOrderRow = {
    platform: "wowboost",
    platform_order_id: "wowboost:receipt-refund",
    order_id: "receipt-refund",
    status: "COMPLETED",
    status_norm: "COMPLETED",
    gross_amount: 96.94,
    currency: "USD",
    order_ts: "2026-07-02T11:00:00.000Z",
    raw_json: {
      "Order Status Name": "Shipped",
      "Receipt Status Name": "Refunded",
      "Updated Date": "07/18/2026 09:30:00",
      "Order Price USD": "$96.94",
    },
  };

  const refund = financialIssueLedgerRowFromPlatformOrder(shippedRefunded, "refund");
  assert.ok(refund);
  assert.equal(refund.amount, -96.94);
  assert.equal(refund.occurred_at, "2026-07-18T09:30:00.000Z");
});

test("normalized receipt events suppress the legacy platform order refund fallback", () => {
  const platformOrder: FinancialIssueOrderRow = {
    workspace_id: "default",
    platform: "wowboost",
    platform_order_id: "wowboost:receipt-authoritative",
    order_id: "receipt-authoritative",
    status: "COMPLETED",
    status_norm: "COMPLETED",
    gross_amount: 100,
    currency: "USD",
    order_ts: "2026-07-01T09:00:00.000Z",
    raw_json: {
      "Receipt Status Name": "Refunded",
      "Refund Amount": "25.00",
      "Refund Date": "07/02/2026 09:00:00",
    },
  };

  const normalizedOrderIds = new Set(["receipt-authoritative"]);
  const decision = financialIssuePlatformFallbackDecision(
    platformOrder,
    "refund",
    normalizedOrderIds,
  );

  assert.equal(decision.include, false);
  assert.equal(decision.reason, "existing_ledger_issue");
  assert.equal(decision.row?.amount, -25);
});

test("legacy refund snapshots remain eligible only when no normalized receipt event exists", () => {
  const platformOrder: FinancialIssueOrderRow = {
    workspace_id: "default",
    platform: "wowboost",
    platform_order_id: "wowboost:legacy-refund",
    order_id: "legacy-refund",
    status: "REFUNDED",
    status_norm: "REFUNDED",
    gross_amount: -35,
    currency: "USD",
    order_ts: "2026-07-01T09:00:00.000Z",
    raw_json: {
      "Receipt Status Name": "Refunded",
      "Refund Amount": "35.00",
      "Refund Date": "07/02/2026 09:00:00",
    },
  };

  const decision = financialIssuePlatformFallbackDecision(platformOrder, "refund", new Set());
  assert.equal(decision.include, true);
  assert.equal(decision.reason, "legacy_fallback");
  assert.equal(decision.row?.amount, -35);
});

test("builds refund analysis from WowBoost platform fallback rows", () => {
  const platformOrders: FinancialIssueOrderRow[] = [
    {
      workspace_id: "default",
      platform: "wowboost",
      platform_order_id: "wowboost:refund-a",
      order_id: "refund-a",
      status: "REFUNDED",
      status_norm: "REFUNDED",
      gross_amount: -90.94,
      currency: "USD",
      order_ts: "2026-06-29T12:00:00.000Z",
      affiliate_id: "aff-1",
      raw_json: {
        "Order Status Name": "Partially Refunded",
        "Receipt Status Name": "Paid",
        "Updated Date": "07/07/2026 12:46:01",
        "Order Price USD": "90.94",
      },
    },
    {
      workspace_id: "default",
      platform: "wowboost",
      platform_order_id: "wowboost:refund-b",
      order_id: "refund-b",
      status: "REFUNDED",
      status_norm: "REFUNDED",
      gross_amount: -125,
      currency: "USD",
      order_ts: "2026-07-04T12:00:00.000Z",
      affiliate_id: "aff-2",
      raw_json: {
        "Order Status Name": "Refunded",
        "Receipt Status Name": "Paid",
        "Updated Date": "07/08/2026 08:15:00",
        "Order Price USD": "125.00",
      },
    },
  ];
  const refundRows = platformOrders
    .map((order) => financialIssueLedgerRowFromPlatformOrder(order, "refund"))
    .filter(Boolean) as ProfitConversionRow[];
  const saleRows = platformOrders.map((order) => ({
    ...row("sale", 100, { order_id: order.order_id || "" }),
    platform: order.platform,
  }));

  const result = buildFinancialIssueAnalysis([...saleRows, ...refundRows], platformOrders, { kind: "refund" });

  assert.equal(result.summary.amount, 215.94);
  assert.equal(result.summary.event_count, 2);
  assert.equal(result.summary.affected_orders, 2);
  assert.equal(result.affiliates.length, 2);
  assert.equal(result.data_quality.diagnostics.included_records, 2);
});

test("refund analysis excludes unmatched ledger rows and reports diagnostics", () => {
  const result = buildFinancialIssueAnalysis(
    [
      row("refund", -50, { order_id: "missing-platform-order" }),
      row("refund", 0, { order_id: "missing-amount" }),
    ],
    [{ order_id: "missing-amount", affiliate_id: "aff-1" }],
    { kind: "refund" },
  );

  assert.equal(result.summary.amount, 0);
  assert.equal(result.data_quality.diagnostics.unmatched_orders, 1);
  assert.equal(result.data_quality.diagnostics.missing_amounts, 1);
  assert.equal(result.data_quality.diagnostics.excluded_records_by_reason.unmatched_order, 1);
  assert.equal(result.data_quality.diagnostics.excluded_records_by_reason.missing_amount, 1);
});

test("refund analysis includes matched receipt events without affiliate in source-of-truth totals", () => {
  const result = buildFinancialIssueAnalysis(
    [
      row("sale", 100, { order_id: "attributed-order" }),
      row("refund", -25, { order_id: "attributed-order" }),
      row("sale", 120, { order_id: "unattributed-order" }),
      row("refund", -40, { order_id: "unattributed-order" }),
    ],
    [
      { order_id: "attributed-order", platform_order_id: "wowboost:attributed-order", affiliate_id: "aff-1" },
      { order_id: "unattributed-order", platform_order_id: "wowboost:unattributed-order" },
    ],
    { kind: "refund" },
  );

  assert.equal(result.summary.amount, 65);
  assert.equal(result.summary.event_count, 2);
  assert.equal(result.summary.affected_orders, 2);
  assert.equal(result.summary.total_orders, 2);
  assert.equal(result.affiliates.length, 1);
  assert.equal(result.affiliates[0].affiliate_id, "aff-1");
  assert.equal(result.affiliates[0].amount, 25);
  assert.equal(result.data_quality.diagnostics.included_records, 2);
  assert.equal(result.data_quality.diagnostics.included_records_missing_affiliate, 1);
  assert.equal(result.data_quality.diagnostics.excluded_records_by_reason.missing_affiliate, 1);
  assert.match(result.data_quality.warnings.join(" "), /included in totals but omitted from affiliate\/source ranking/);
});
