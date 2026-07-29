-- Refund and chargeback analysis read-path indexes.
--
-- The endpoint has two intentionally separate platform_orders access paths:
-- order_ts-bounded snapshots provide sale denominators, while status-bounded
-- legacy candidates preserve refunds whose financial event occurred after the
-- original order date. Both predicates must narrow rows before raw_json is read.

create index if not exists platform_orders_financial_issue_order_range_idx
  on public.platform_orders (workspace_id, order_ts, platform, platform_order_id);

create index if not exists platform_orders_financial_issue_status_idx
  on public.platform_orders (workspace_id, status_norm, platform_order_id, platform);

create index if not exists conversions_financial_issue_range_idx
  on public.conversions (workspace_id, occurred_at, ledger_type, order_id);

comment on index public.platform_orders_financial_issue_order_range_idx is
  'Supports workspace/date-first WowBoost order denominator scans for refund and chargeback analysis.';

comment on index public.platform_orders_financial_issue_status_idx is
  'Supports selective legacy WowBoost refund/chargeback candidate reads before raw payload evaluation.';

comment on index public.conversions_financial_issue_range_idx is
  'Supports canonical sale/refund/chargeback ledger reads by workspace and occurred_at.';
