-- Refund Analysis query-plan verification.
--
-- Run these statements before migration 034, then rerun them after migration
-- 034. EXPLAIN ANALYZE executes only the read-only SELECT and reports actual
-- timing and buffer use; it does not modify application rows.

-- BEFORE: the timed-out platform order range read. Without a matching
-- workspace/order_ts index PostgreSQL must scan and sort a broad candidate set.
explain (analyze, buffers, costs, verbose)
select
  po.workspace_id,
  po.platform_order_id,
  po.order_id,
  po.platform,
  po.status,
  po.status_norm,
  po.gross_amount,
  po.receipt_total,
  po.currency,
  po.order_ts,
  po.affiliate_id,
  po.raw_json
from public.platform_orders as po
where po.workspace_id = 'default'
  and po.platform in ('wowboost', 'wowsuite:wowboost', 'wowsuite')
  and po.order_ts >= timestamptz '2026-07-01T00:00:00.000Z'
  and po.order_ts < timestamptz '2026-08-01T00:00:00.000Z'
order by po.order_ts asc
limit 1000;

-- BEFORE: the legacy compatibility scan. The status predicate should reduce
-- the candidate set before the application examines raw_json timestamps.
explain (analyze, buffers, costs, verbose)
select
  po.workspace_id,
  po.platform_order_id,
  po.order_id,
  po.platform,
  po.status,
  po.status_norm,
  po.gross_amount,
  po.receipt_total,
  po.currency,
  po.order_ts,
  po.affiliate_id,
  po.raw_json
from public.platform_orders as po
where po.workspace_id = 'default'
  and po.platform in ('wowboost', 'wowsuite:wowboost', 'wowsuite')
  and po.status_norm = 'REFUNDED'
order by po.platform_order_id asc
limit 1000;

-- AFTER migration 034, refresh planner statistics and rerun the two EXPLAIN
-- statements above. Expected access paths:
--
--   Index Scan using platform_orders_financial_issue_order_range_idx
--     Index Cond: workspace_id = 'default'
--                 and order_ts >= '2026-07-01'
--                 and order_ts < '2026-08-01'
--
--   Index Scan using platform_orders_financial_issue_status_idx
--     Index Cond: workspace_id = 'default'
--                 and status_norm = 'REFUNDED'
--
-- Canonical conversion ledger range:
explain (analyze, buffers, costs, verbose)
select
  c.workspace_id,
  c.order_id,
  c.connector_id,
  c.currency,
  c.platform,
  c.event_source,
  c.ledger_type,
  c.amount,
  c.occurred_at,
  c.transaction_id,
  c.status
from public.conversions as c
where c.workspace_id = 'default'
  and c.ledger_type in ('sale', 'refund')
  and c.occurred_at >= timestamptz '2026-07-01T00:00:00.000Z'
  and c.occurred_at < timestamptz '2026-08-01T00:00:00.000Z'
order by c.occurred_at asc
limit 1000;

-- Expected access path:
--
--   Index Scan using conversions_financial_issue_range_idx
--     Index Cond: workspace_id = 'default'
--                 and occurred_at >= '2026-07-01'
--                 and occurred_at < '2026-08-01'
