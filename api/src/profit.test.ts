import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateDailyProfitConversions,
  aggregateProfitConversions,
  buildFinancialIssueAnalysis,
  profitDailyKeyFromConversion,
  profitDailyKeyId,
  profitOrderKeyFromConversion,
  profitOrderKeyId,
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
