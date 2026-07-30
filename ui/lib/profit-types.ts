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
  gross_revenue?: number | null;
  net_revenue?: number | null;
  operating_costs?: number | null;
  sales_count?: number | null;
  affiliate_commission?: number | null;
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
  executive_performance?: ExecutivePerformanceResponse | null;
};

export type ExecutiveDelta = {
  amount?: number | null;
  pct?: number | null;
};

export type ExecutiveAffiliateCommission = {
  commission_count?: number | null;
  commission_amount?: number | null;
  attributed_amount?: number | null;
  available?: boolean | null;
};

export type ExecutivePerformanceSummary = {
  gross_revenue?: number | null;
  net_revenue?: number | null;
  net_profit?: number | null;
  operating_costs?: number | null;
  refunds?: number | null;
  chargebacks?: number | null;
  sales_count?: number | null;
  aov?: number | null;
  profit_margin_pct?: number | null;
  affiliate_commission?: ExecutiveAffiliateCommission | null;
  after_affiliate_commission?: number | null;
  cost_ratio?: number | null;
};

export type ExecutiveTrendPoint = {
  date?: string | null;
  gross_revenue?: number | null;
  net_revenue?: number | null;
  net_profit?: number | null;
  operating_costs?: number | null;
  refunds?: number | null;
  chargebacks?: number | null;
  sales_count?: number | null;
  affiliate_commission?: number | null;
  after_affiliate_commission?: number | null;
};

export type ExecutiveRankingRow = {
  affiliate_id?: string | null;
  publisher_id?: string | null;
  source?: string | null;
  attributed_revenue?: number | null;
  commission_amount?: number | null;
  net_after_commission?: number | null;
  commission_count?: number | null;
  commission_rate_effective?: number | null;
};

export type ExecutiveLeakageRow = {
  key?: string | null;
  label?: string | null;
  amount?: number | null;
  rate?: number | null;
  href?: string | null;
};

export type ExecutiveCostRow = {
  key?: string | null;
  label?: string | null;
  amount?: number | null;
  share?: number | null;
};

export type ExecutivePerformanceResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  period?: string | null;
  workspace_id?: string | null;
  timezone?: string | null;
  timezone_source?: string | null;
  currency?: string | null;
  currencies?: string[];
  range?: {
    from?: string | null;
    to?: string | null;
    from_iso?: string | null;
    to_iso?: string | null;
    previous_from_iso?: string | null;
    previous_to_iso?: string | null;
  };
  headline?: ExecutivePerformanceSummary & {
    deltas?: {
      sales_count?: ExecutiveDelta | null;
      gross_revenue?: ExecutiveDelta | null;
      net_revenue?: ExecutiveDelta | null;
      net_profit?: ExecutiveDelta | null;
      affiliate_commission?: ExecutiveDelta | null;
    };
  };
  profit?: ExecutivePerformanceSummary | null;
  previous_profit?: ExecutivePerformanceSummary | null;
  trend?: ExecutiveTrendPoint[];
  cost_breakdown?: ExecutiveCostRow[];
  leakage?: ExecutiveLeakageRow[];
  affiliates?: ExecutiveRankingRow[];
  sources?: ExecutiveRankingRow[];
  diagnostics?: {
    warnings?: string[];
    conversion_rows_scanned?: number | null;
    commission_rows_scanned?: number | null;
    conversion_scan_complete?: boolean | null;
    commission_scan_complete?: boolean | null;
    canonical_sales_definition?: string | null;
    commission_source?: string | null;
  };
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
  total_orders: number;
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
  affiliate_name?: string | null;
  source_id?: string | null;
  sub_id_key?: string | null;
  sub_id_value?: string | null;
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
  affiliates?: FinancialIssueSourceRow[];
  affected_orders?: FinancialIssueAffectedOrder[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
  data_quality?: {
    partial_scan?: boolean;
    attributed_order_coverage: number | null;
    missing_denominators: string[];
    warnings: string[];
    diagnostics?: {
      ledger_records_scanned?: number;
      ledger_issue_records?: number;
      platform_issue_records_scanned?: number;
      platform_issue_records_included?: number;
      platform_issue_records_excluded_by_reason?: Record<string, number>;
      included_records?: number;
      included_records_missing_affiliate?: number;
      duplicate_source_events?: number;
      excluded_records_by_reason?: Record<string, number>;
      unmatched_orders?: number;
      missing_amounts?: number;
      [key: string]: unknown;
    };
  };
};
