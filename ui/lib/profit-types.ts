export type KpiResponse = {
  gross_sales: number;
  gross_sales_delta_pct: number;
  net_profit: number;
  net_margin: number;
  refund_rate: number;
  refund_rate_delta_pp: number;
  chargebacks: number;
  chargebacks_delta_pp: number;
};

export type RevenueSpendPoint = {
  date?: string | null;
  revenue?: number | null;
  spend?: number | null;
  net_profit?: number | null;
  refunds?: number | null;
  chargebacks?: number | null;
};

export type RevenueSpendResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  series?: RevenueSpendPoint[];
};

export type ProfitSummaryResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  gross_revenue?: number | null;
  refunds?: number | null;
  chargebacks?: number | null;
  chargeback_fees?: number | null;
  processor_fees?: number | null;
  bank_fees?: number | null;
  shipping_cost?: number | null;
  shipping?: number | null;
  tax?: number | null;
  cogs?: number | null;
  affiliate_payout?: number | null;
  ad_spend?: number | null;
  reversals?: number | null;
  adjustments?: number | null;
  net_revenue?: number | null;
  total_costs?: number | null;
  net_profit?: number | null;
  profit_margin_pct?: number | null;
  order_count?: number | null;
  event_count?: number | null;
};

export type ProfitRollup = {
  workspace_id?: string | null;
  order_id?: string | null;
  platform?: string | null;
  event_source?: string | null;
  connector_id?: string | null;
  currency?: string | null;
  gross_revenue?: number | null;
  refunds?: number | null;
  chargebacks?: number | null;
  chargeback_fees?: number | null;
  processor_fees?: number | null;
  bank_fees?: number | null;
  shipping_cost?: number | null;
  tax?: number | null;
  cogs?: number | null;
  affiliate_payout?: number | null;
  ad_spend?: number | null;
  reversals?: number | null;
  adjustments?: number | null;
  net_revenue?: number | null;
  total_costs?: number | null;
  net_profit?: number | null;
  profit_margin_pct?: number | null;
  event_count?: number | null;
  first_event_at?: string | null;
  last_event_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type LedgerRow = {
  workspace_id?: string | null;
  order_id?: string | null;
  connector_id?: string | null;
  currency?: string | null;
  platform?: string | null;
  event_source?: string | null;
  ingestion_method?: string | null;
  ledger_type?: string | null;
  amount?: number | string | null;
  occurred_at?: string | null;
  transaction_id?: string | null;
  parent_transaction_id?: string | null;
  status?: string | null;
  reason?: string | null;
  raw?: unknown;
  meta?: Record<string, unknown> | null;
};

export type OrderProfitResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  order_id?: string | null;
  rollup?: ProfitRollup | null;
  rollups?: ProfitRollup[];
  category_breakdown?: Partial<ProfitSummaryResponse> | null;
  ledger_rows?: LedgerRow[];
};

export type FinancialIssueKind = "refund" | "chargeback";

export type FinancialIssueSummary = {
  amount: number;
  event_count: number;
  affected_orders: number;
  rate_by_orders: number | null;
  rate_by_revenue: number | null;
  average_amount: number | null;
  total_orders: number;
  total_revenue: number;
};

export type FinancialIssueTrendPoint = {
  date: string;
  amount: number;
  count: number;
  affected_orders: number;
};

export type FinancialIssueSourceRow = {
  group_key: string;
  group_type: "affiliate" | "traffic_source" | "campaign" | "unknown" | string;
  source_name: string;
  affiliate_id?: string | null;
  source_id?: string | null;
  campaign_id?: string | null;
  brand_id?: string | null;
  offer_id?: string | null;
  product_id?: string | null;
  attribution_status?: string | null;
  total_orders: number;
  total_revenue: number;
  event_count: number;
  affected_orders: number;
  amount: number;
  rate_by_orders: number | null;
  rate_by_revenue: number | null;
  average_affected_order_value: number | null;
};

export type FinancialIssueAffectedOrder = {
  order_id: string;
  group_key?: string | null;
  group_type?: string | null;
  platform_order_id?: string | null;
  order_date?: string | null;
  customer?: string | null;
  affiliate_or_source?: string | null;
  affiliate_id?: string | null;
  source_id?: string | null;
  gross_revenue?: number | null;
  amount: number;
  event_count: number;
  currency?: string | null;
  status?: string | null;
  attribution_confidence?: string | null;
};

export type FinancialIssueAnalysisResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  kind?: FinancialIssueKind;
  summary?: FinancialIssueSummary | null;
  trend?: FinancialIssueTrendPoint[];
  sources?: FinancialIssueSourceRow[];
  affected_orders?: FinancialIssueAffectedOrder[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
  data_quality?: {
    attributed_order_coverage: number | null;
    missing_denominators: string[];
    warnings: string[];
  };
};
