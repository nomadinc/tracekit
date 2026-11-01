-- UNEXECUTED, UNAPPROVED STAGING-ONLY REVIEW PROPOSAL. NOT A MIGRATION.
-- Target joahiwgidfbzwzyslrbq only. Requires reviewed base role/issuer design.
-- STOP until actual rollup schema/owner/PUBLIC/inherited ACLs, existing policies,
-- grants and pre-request hook are independently verified. No production usage.
BEGIN;
ALTER TABLE public.profit_daily_rollups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profit_daily_rollups FORCE ROW LEVEL SECURITY;
GRANT SELECT("id","workspace_id","day","platform","event_source","connector_id","currency","gross_revenue","refunds","chargebacks","chargeback_fees","processor_fees","bank_fees","shipping_cost","tax","cogs","affiliate_payout","ad_spend","reversals","adjustments","net_revenue","total_costs","net_profit","profit_margin_pct","order_count","event_count") ON public.profit_daily_rollups TO tk_stg_financial_reader;
CREATE POLICY stg_profit_allow ON public.profit_daily_rollups FOR SELECT TO tk_stg_financial_reader USING (staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'financials.view') AND staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'orders.view_financials'));
CREATE POLICY stg_profit_guard ON public.profit_daily_rollups AS RESTRICTIVE FOR SELECT TO tk_stg_financial_reader USING (staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'financials.view') AND staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'orders.view_financials'));
-- No ordinary-reader grant, no writes, no RPC grants, no authenticator membership.
-- Existing baseline ACL preflight must be extended with this EXACT column list
-- before combining proposals. Never bypass its unrelated-table denial.
ROLLBACK;
