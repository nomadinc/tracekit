-- CONSOLIDATED REVIEW ONLY. Staging joahiwgidfbzwzyslrbq; NEVER EXECUTED.
-- Requires actual catalog parity, native ACL/RLS probe, issuer/custody and WS-022 acceptance.
-- REVIEW DRAFT ONLY. Never run in production. Target: joahiwgidfbzwzyslrbq.
-- This file deliberately ROLLS BACK. It does not enable application reads.
-- Execution plan must first attest the actual project connection, catalog,
-- PUBLIC/inherited privileges and exact WS-023 manifest. No grants applied here.
BEGIN;
CREATE ROLE tk_stg_reporting_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
CREATE ROLE tk_stg_financial_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
CREATE ROLE tk_stg_reporting_policy_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
CREATE ROLE tk_stg_membership_verifier NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
CREATE ROLE tk_stg_reporting_registry_admin NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
CREATE SCHEMA staging_reporting_private AUTHORIZATION tk_stg_reporting_policy_owner;
REVOKE ALL ON SCHEMA staging_reporting_private FROM PUBLIC;
CREATE TABLE staging_reporting_private.current_memberships (
 subject text NOT NULL, application_user_id text NOT NULL, organization_id text NOT NULL, workspace_id text NOT NULL,
 version text NOT NULL, permissions text[] NOT NULL, active boolean NOT NULL,
 valid_until timestamptz NOT NULL,
 PRIMARY KEY(subject,organization_id,workspace_id),
 UNIQUE(application_user_id,organization_id,workspace_id),
 CHECK(workspace_id=organization_id),
 CHECK(length(subject) BETWEEN 1 AND 160), CHECK(length(version) BETWEEN 1 AND 160),
 CHECK(length(organization_id) BETWEEN 1 AND 160),CHECK(length(workspace_id) BETWEEN 1 AND 160)
);
ALTER TABLE staging_reporting_private.current_memberships OWNER TO tk_stg_reporting_policy_owner;
ALTER TABLE staging_reporting_private.current_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging_reporting_private.current_memberships FORCE ROW LEVEL SECURITY;
REVOKE ALL ON staging_reporting_private.current_memberships FROM PUBLIC,tk_stg_reporting_reader,tk_stg_financial_reader;
CREATE POLICY membership_owner_read ON staging_reporting_private.current_memberships FOR SELECT TO tk_stg_reporting_policy_owner USING(true);
CREATE POLICY membership_verifier ON staging_reporting_private.current_memberships FOR SELECT TO tk_stg_membership_verifier USING(true);
GRANT USAGE ON SCHEMA staging_reporting_private TO tk_stg_membership_verifier;
GRANT SELECT(subject,application_user_id,organization_id,workspace_id,version,permissions,active,valid_until) ON staging_reporting_private.current_memberships TO tk_stg_membership_verifier;
CREATE POLICY membership_admin ON staging_reporting_private.current_memberships FOR ALL TO tk_stg_reporting_registry_admin USING(true) WITH CHECK(true);
GRANT USAGE ON SCHEMA staging_reporting_private TO tk_stg_reporting_reader,tk_stg_financial_reader,tk_stg_reporting_registry_admin;
GRANT SELECT,INSERT,UPDATE,DELETE ON staging_reporting_private.current_memberships TO tk_stg_reporting_registry_admin;
CREATE FUNCTION staging_reporting_private.allowed_scope(org text,workspace text,permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS (
  SELECT 1 FROM staging_reporting_private.current_memberships m,
   LATERAL (SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb c) j
  WHERE m.application_user_id=j.c->>'sub' AND m.organization_id=org AND m.workspace_id=workspace
   AND j.c->>'organization_id'=org AND j.c->>'workspace_id'=workspace
   AND j.c->>'membership_version'=m.version AND m.active
   AND m.valid_until>clock_timestamp()
   AND (j.c->>'exp')::numeric>extract(epoch FROM clock_timestamp())
   AND permission=ANY(m.permissions) AND (j.c->'permissions') ? permission
   AND j.c->>'aud'='authenticated' AND j.c->>'purpose'='tracekit-staging-reporting'
   AND j.c->>'iss'='https://staging.trace-kit.io/reporting-authority'
   AND org=workspace
   AND (j.c->>'iat')::numeric<=extract(epoch FROM clock_timestamp())
   AND (j.c->>'exp')::numeric-(j.c->>'iat')::numeric BETWEEN 1 AND 60
   AND j.c->>'role' IN ('tk_stg_reporting_reader','tk_stg_financial_reader')
 );
$$;
ALTER FUNCTION staging_reporting_private.allowed_scope(text,text,text) OWNER TO tk_stg_reporting_policy_owner;
REVOKE ALL ON FUNCTION staging_reporting_private.allowed_scope(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION staging_reporting_private.allowed_scope(text,text,text) TO tk_stg_reporting_reader,tk_stg_financial_reader;
GRANT USAGE ON SCHEMA public TO tk_stg_reporting_reader;
GRANT SELECT("created_at","display_name","first_name","first_seen_at","id","last_name","last_seen_at","organization_id","primary_email","primary_phone","status","updated_at","workspace_id") ON public."people" TO tk_stg_reporting_reader;
ALTER TABLE public."people" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stg_r_people_allow" ON public."people" FOR SELECT TO tk_stg_reporting_reader USING (staging_reporting_private.allowed_scope(organization_id::text,workspace_id::text,'customers.view'));
CREATE POLICY "stg_r_people_guard" ON public."people" AS RESTRICTIVE FOR SELECT TO tk_stg_reporting_reader USING (staging_reporting_private.allowed_scope(organization_id::text,workspace_id::text,'customers.view'));
GRANT USAGE ON SCHEMA public TO tk_stg_financial_reader;
GRANT SELECT("created_at","display_name","first_name","first_seen_at","id","last_name","last_seen_at","organization_id","primary_email","primary_phone","status","updated_at","workspace_id") ON public."people" TO tk_stg_financial_reader;
ALTER TABLE public."people" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stg_f_people_allow" ON public."people" FOR SELECT TO tk_stg_financial_reader USING (staging_reporting_private.allowed_scope(organization_id::text,workspace_id::text,'customers.view') AND staging_reporting_private.allowed_scope(organization_id::text,workspace_id::text,'financials.view') AND staging_reporting_private.allowed_scope(organization_id::text,workspace_id::text,'orders.view_financials'));
CREATE POLICY "stg_f_people_guard" ON public."people" AS RESTRICTIVE FOR SELECT TO tk_stg_financial_reader USING (staging_reporting_private.allowed_scope(organization_id::text,workspace_id::text,'customers.view') AND staging_reporting_private.allowed_scope(organization_id::text,workspace_id::text,'financials.view') AND staging_reporting_private.allowed_scope(organization_id::text,workspace_id::text,'orders.view_financials'));
GRANT USAGE ON SCHEMA public TO tk_stg_reporting_reader;
GRANT SELECT("confidence","created_at","first_seen_at","id","identifier_type","is_primary","last_seen_at","normalized_value","person_id","raw_value","source_connector_id","source_platform","source_record_id","source_record_type","updated_at","verification_status","workspace_id") ON public."person_identifiers" TO tk_stg_reporting_reader;
ALTER TABLE public."person_identifiers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stg_r_person_identifiers_allow" ON public."person_identifiers" FOR SELECT TO tk_stg_reporting_reader USING (staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'customers.view'));
CREATE POLICY "stg_r_person_identifiers_guard" ON public."person_identifiers" AS RESTRICTIVE FOR SELECT TO tk_stg_reporting_reader USING (staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'customers.view'));
GRANT USAGE ON SCHEMA public TO tk_stg_financial_reader;
GRANT SELECT("confidence","created_at","first_seen_at","id","identifier_type","is_primary","last_seen_at","normalized_value","person_id","raw_value","source_connector_id","source_platform","source_record_id","source_record_type","updated_at","verification_status","workspace_id") ON public."person_identifiers" TO tk_stg_financial_reader;
ALTER TABLE public."person_identifiers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stg_f_person_identifiers_allow" ON public."person_identifiers" FOR SELECT TO tk_stg_financial_reader USING (staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'customers.view') AND staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'financials.view') AND staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'orders.view_financials'));
CREATE POLICY "stg_f_person_identifiers_guard" ON public."person_identifiers" AS RESTRICTIVE FOR SELECT TO tk_stg_financial_reader USING (staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'customers.view') AND staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'financials.view') AND staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'orders.view_financials'));
GRANT USAGE ON SCHEMA public TO tk_stg_reporting_reader;
GRANT SELECT("confidence","created_at","id","person_id","resolution_action","resolution_reason","source_platform","source_record_id","source_record_type","workspace_id") ON public."identity_resolution_events" TO tk_stg_reporting_reader;
ALTER TABLE public."identity_resolution_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stg_r_identity_resolution_events_allow" ON public."identity_resolution_events" FOR SELECT TO tk_stg_reporting_reader USING (staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'customers.view'));
CREATE POLICY "stg_r_identity_resolution_events_guard" ON public."identity_resolution_events" AS RESTRICTIVE FOR SELECT TO tk_stg_reporting_reader USING (staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'customers.view'));
GRANT USAGE ON SCHEMA public TO tk_stg_financial_reader;
GRANT SELECT("confidence","created_at","id","person_id","resolution_action","resolution_reason","source_platform","source_record_id","source_record_type","workspace_id") ON public."identity_resolution_events" TO tk_stg_financial_reader;
ALTER TABLE public."identity_resolution_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stg_f_identity_resolution_events_allow" ON public."identity_resolution_events" FOR SELECT TO tk_stg_financial_reader USING (staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'customers.view') AND staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'financials.view') AND staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'orders.view_financials'));
CREATE POLICY "stg_f_identity_resolution_events_guard" ON public."identity_resolution_events" AS RESTRICTIVE FOR SELECT TO tk_stg_financial_reader USING (staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'customers.view') AND staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'financials.view') AND staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'orders.view_financials'));
GRANT USAGE ON SCHEMA public TO tk_stg_reporting_reader;
GRANT SELECT("boundary_timeout_seconds","boundary_version","conversion_count","conversion_event_id","created_at","ended_at","entry_event_id","event_count","id","is_active","person_id","purchase_count","started_at","status","updated_at","workspace_id") ON public."journeys" TO tk_stg_reporting_reader;
ALTER TABLE public."journeys" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stg_r_journeys_allow" ON public."journeys" FOR SELECT TO tk_stg_reporting_reader USING (staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'customers.view'));
CREATE POLICY "stg_r_journeys_guard" ON public."journeys" AS RESTRICTIVE FOR SELECT TO tk_stg_reporting_reader USING (staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'customers.view'));
GRANT USAGE ON SCHEMA public TO tk_stg_financial_reader;
GRANT SELECT("boundary_timeout_seconds","boundary_version","conversion_count","conversion_event_id","created_at","ended_at","entry_event_id","event_count","id","is_active","person_id","purchase_count","started_at","status","total_revenue","updated_at","workspace_id") ON public."journeys" TO tk_stg_financial_reader;
ALTER TABLE public."journeys" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stg_f_journeys_allow" ON public."journeys" FOR SELECT TO tk_stg_financial_reader USING (staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'customers.view') AND staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'financials.view') AND staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'orders.view_financials'));
CREATE POLICY "stg_f_journeys_guard" ON public."journeys" AS RESTRICTIVE FOR SELECT TO tk_stg_financial_reader USING (staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'customers.view') AND staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'financials.view') AND staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'orders.view_financials'));
GRANT USAGE ON SCHEMA public TO tk_stg_reporting_reader;
GRANT SELECT("affiliate_id","campaign_id","created_at","currency","event_time","event_type","id","journey_id","medium","offer_id","person_id","platform_order_id","session_id","source","source_connector","source_platform","source_record_id","sub1","sub2","sub3","sub4","sub5","touchpoint_id","transaction_id","updated_at","workspace_id") ON public."journey_events" TO tk_stg_reporting_reader;
ALTER TABLE public."journey_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stg_r_journey_events_allow" ON public."journey_events" FOR SELECT TO tk_stg_reporting_reader USING (staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'customers.view'));
CREATE POLICY "stg_r_journey_events_guard" ON public."journey_events" AS RESTRICTIVE FOR SELECT TO tk_stg_reporting_reader USING (staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'customers.view'));
GRANT USAGE ON SCHEMA public TO tk_stg_financial_reader;
GRANT SELECT("affiliate_id","amount","campaign_id","created_at","currency","event_time","event_type","id","journey_id","medium","offer_id","person_id","platform_order_id","session_id","source","source_connector","source_platform","source_record_id","sub1","sub2","sub3","sub4","sub5","touchpoint_id","transaction_id","updated_at","workspace_id") ON public."journey_events" TO tk_stg_financial_reader;
ALTER TABLE public."journey_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stg_f_journey_events_allow" ON public."journey_events" FOR SELECT TO tk_stg_financial_reader USING (staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'customers.view') AND staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'financials.view') AND staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'orders.view_financials'));
CREATE POLICY "stg_f_journey_events_guard" ON public."journey_events" AS RESTRICTIVE FOR SELECT TO tk_stg_financial_reader USING (staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'customers.view') AND staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'financials.view') AND staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'orders.view_financials'));
GRANT USAGE ON SCHEMA public TO tk_stg_reporting_reader;
GRANT SELECT("affiliate_id","calculated_at","campaign_id","conversion_event_id","conversion_event_time","created_at","credit_fraction","credit_percent","currency","id","journey_id","medium","model","model_version","offer_id","person_id","reason","source","status","touchpoint_channel","touchpoint_eligibility_version","touchpoint_event_id","touchpoint_event_time","workspace_id") ON public."journey_attribution_credits" TO tk_stg_reporting_reader;
ALTER TABLE public."journey_attribution_credits" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stg_r_journey_attribution_credits_allow" ON public."journey_attribution_credits" FOR SELECT TO tk_stg_reporting_reader USING (staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'customers.view'));
CREATE POLICY "stg_r_journey_attribution_credits_guard" ON public."journey_attribution_credits" AS RESTRICTIVE FOR SELECT TO tk_stg_reporting_reader USING (staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'customers.view'));
GRANT USAGE ON SCHEMA public TO tk_stg_financial_reader;
GRANT SELECT("affiliate_id","calculated_at","campaign_id","conversion_event_id","conversion_event_time","created_at","credit_amount","credit_fraction","credit_percent","currency","id","journey_id","medium","model","model_version","offer_id","person_id","reason","source","status","touchpoint_channel","touchpoint_eligibility_version","touchpoint_event_id","touchpoint_event_time","workspace_id") ON public."journey_attribution_credits" TO tk_stg_financial_reader;
ALTER TABLE public."journey_attribution_credits" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stg_f_journey_attribution_credits_allow" ON public."journey_attribution_credits" FOR SELECT TO tk_stg_financial_reader USING (staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'customers.view') AND staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'financials.view') AND staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'orders.view_financials'));
CREATE POLICY "stg_f_journey_attribution_credits_guard" ON public."journey_attribution_credits" AS RESTRICTIVE FOR SELECT TO tk_stg_financial_reader USING (staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'customers.view') AND staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'financials.view') AND staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'orders.view_financials'));
GRANT USAGE ON SCHEMA public TO tk_stg_financial_reader;
GRANT SELECT("affiliate_id","attributed_amount","campaign_id","commission_amount","commission_event_id","commission_rate","conversion_event_id","conversion_event_time","created_at","credit_amount","credit_fraction","credit_percent","currency","generated_at","id","journey_attribution_credit_id","journey_id","model","model_version","offer_id","person_id","publisher_id","source","source_credit_created_at","status","touchpoint_event_id","touchpoint_event_time","touchpoint_medium","touchpoint_source","workspace_id") ON public."affiliate_commissions" TO tk_stg_financial_reader;
ALTER TABLE public."affiliate_commissions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stg_f_affiliate_commissions_allow" ON public."affiliate_commissions" FOR SELECT TO tk_stg_financial_reader USING (staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'customers.view') AND staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'financials.view') AND staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'orders.view_financials'));
CREATE POLICY "stg_f_affiliate_commissions_guard" ON public."affiliate_commissions" AS RESTRICTIVE FOR SELECT TO tk_stg_financial_reader USING (staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'customers.view') AND staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'financials.view') AND staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'orders.view_financials'));
-- Application roles receive no mutation policies or mutation privileges.
-- Fail closed if inherited/PUBLIC authority exceeds this proposal. A conflicting
-- deployment requires explicit per-object review, never a blanket exception.
-- Effective ACL review deferred until all reviewed grants below.
-- Exact effective SELECT closure includes inherited and PUBLIC column grants.
-- Exact column review deferred until all reviewed grants below.
-- Mandatory dedicated-staging PostgREST admission. A signing key must NOT
-- confer arbitrary service_role/owner or RPC execution authority. This hook is
-- project-wide and requires separate reviewed configuration/custody approval.
CREATE FUNCTION staging_reporting_private.reporting_pre_request()
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $gate$
DECLARE c jsonb:=nullif(current_setting('request.jwt.claims',true),'')::jsonb;
 p text:=current_setting('request.path',true);
BEGIN
 IF current_user NOT IN ('tk_stg_reporting_reader','tk_stg_financial_reader','tk_stg_membership_verifier')
 OR c->>'role' IS DISTINCT FROM current_user::text
 OR c->>'iss' IS DISTINCT FROM 'https://staging.trace-kit.io/reporting-authority'
 OR c->>'aud' IS DISTINCT FROM 'authenticated'
 OR current_setting('request.method',true) IS DISTINCT FROM 'GET'
 OR jsonb_typeof(c->'exp') IS DISTINCT FROM 'number'
 OR jsonb_typeof(c->'iat') IS DISTINCT FROM 'number'
 OR (c->>'iat')::numeric>extract(epoch FROM clock_timestamp())
 OR (c->>'exp')::numeric-(c->>'iat')::numeric NOT BETWEEN 1 AND 300
 OR (c->>'exp')::numeric<=extract(epoch FROM clock_timestamp())
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Reporting admission denied'; END IF;
 IF current_user='tk_stg_membership_verifier' THEN
  IF c->>'purpose' IS DISTINCT FROM 'tracekit-staging-membership-verifier'
    OR p IS DISTINCT FROM '/current_memberships'
    OR (nullif(current_setting('request.headers',true),'')::jsonb->>'accept-profile') IS DISTINCT FROM 'staging_reporting_private'
  THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Registry admission denied';END IF;
 ELSE
  IF c->>'purpose' IS DISTINCT FROM 'tracekit-staging-reporting'
   OR coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'accept-profile','public')<>'public'
   OR (p='/profit_daily_rollups' AND current_user<>'tk_stg_financial_reader')
   OR p IS NULL OR p NOT IN ('/profit_daily_rollups','/people','/person_identifiers','/identity_resolution_events','/journeys','/journey_events','/tracekit_customer_order_read_model','/journey_attribution_credits','/affiliate_commissions')
  THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Reporting route denied';END IF;
 END IF;
 PERFORM set_config('response.headers',json_build_array(
  json_build_object('X-TraceKit-DB-Login',session_user::text),
  json_build_object('X-TraceKit-DB-Role',current_user::text),
  json_build_object('X-TraceKit-DB-Session-Authorization',current_setting('session_authorization'))
 )::text,true);
END $gate$;
ALTER FUNCTION staging_reporting_private.reporting_pre_request() OWNER TO tk_stg_reporting_policy_owner;
REVOKE ALL ON FUNCTION staging_reporting_private.reporting_pre_request() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION staging_reporting_private.reporting_pre_request() TO tk_stg_reporting_reader,tk_stg_financial_reader,tk_stg_membership_verifier;
-- Proposed setting only; actual PostgREST physical login must first be attested.
-- Replacing an existing hook requires composing its accepted protections.
ALTER ROLE authenticator SET pgrst.db_pre_request='staging_reporting_private.reporting_pre_request';
-- Reviewed-scope extension below proposes exact INVOKER-view dependencies.
-- No owner-bypass conversion; native minimal privilege probe remains mandatory.
-- Profit addendum is included below; nothing is installed or activated here.
-- No authenticator membership, API schema exposure, signing key or credentials
-- are activated. Review the installed role graph/PUBLIC grants, view definition,
-- key/audience compatibility and identity registry issuer before execution.

ALTER TABLE public.profit_daily_rollups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profit_daily_rollups FORCE ROW LEVEL SECURITY;
GRANT SELECT("id","workspace_id","day","platform","event_source","connector_id","currency","gross_revenue","refunds","chargebacks","chargeback_fees","processor_fees","bank_fees","shipping_cost","tax","cogs","affiliate_payout","ad_spend","reversals","adjustments","net_revenue","total_costs","net_profit","profit_margin_pct","order_count","event_count") ON public.profit_daily_rollups TO tk_stg_financial_reader;
CREATE POLICY stg_profit_allow ON public.profit_daily_rollups FOR SELECT TO tk_stg_financial_reader USING (staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'financials.view') AND staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'orders.view_financials'));
CREATE POLICY stg_profit_guard ON public.profit_daily_rollups AS RESTRICTIVE FOR SELECT TO tk_stg_financial_reader USING (staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'financials.view') AND staging_reporting_private.allowed_scope(workspace_id::text,workspace_id::text,'orders.view_financials'));
-- No ordinary-reader grant, no writes, no RPC grants, no authenticator membership.
-- Existing baseline ACL preflight must be extended with this EXACT column list
-- before combining proposals. Never bypass its unrelated-table denial.

ALTER TABLE public.platform_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.person_source_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_source_identities FORCE ROW LEVEL SECURITY;
GRANT SELECT("affiliate_id","commerce_reference","connection_id","created_at","currency","customer_email","customer_email_normalized","everflow_offer_id","everflow_transaction_id","evidence_id","order_id","order_ts","organization_id","person_id","platform","platform_order_id","platform_store_id","provider_account_id","raw_json","source_id","status","status_norm","sub1","sub2","sub3","sub4","sub5","transaction_id","workspace_id") ON public.platform_orders TO tk_stg_reporting_reader;
GRANT SELECT("organization_id","person_id","connection_id","provider_account_id","source_type","source_id","status","evidence_id") ON public.person_source_identities TO tk_stg_reporting_reader;
GRANT SELECT("affiliate_id","commerce_reference","created_at","currency","customer_email","customer_email_normalized","everflow_offer_id","everflow_transaction_id","evidence_id","identity_resolution","order_id","order_ts","organization_id","person_id","platform","platform_order_id","platform_store_id","resolved_person_id","source_id","status","status_norm","sub1","sub2","sub3","sub4","sub5","transaction_id","workspace_id") ON public.tracekit_customer_order_read_model TO tk_stg_reporting_reader;
CREATE POLICY stg_r_platform_orders_allow ON public.platform_orders FOR SELECT TO tk_stg_reporting_reader USING (staging_reporting_private.allowed_scope(organization_id::text,workspace_id::text,'customers.view') AND staging_reporting_private.allowed_scope(organization_id::text,workspace_id::text,'orders.view'));
CREATE POLICY stg_r_platform_orders_guard ON public.platform_orders AS RESTRICTIVE FOR SELECT TO tk_stg_reporting_reader USING (staging_reporting_private.allowed_scope(organization_id::text,workspace_id::text,'customers.view') AND staging_reporting_private.allowed_scope(organization_id::text,workspace_id::text,'orders.view'));
CREATE POLICY stg_r_person_source_identities_allow ON public.person_source_identities FOR SELECT TO tk_stg_reporting_reader USING (staging_reporting_private.allowed_scope(organization_id::text,organization_id::text,'customers.view') AND staging_reporting_private.allowed_scope(organization_id::text,organization_id::text,'orders.view'));
CREATE POLICY stg_r_person_source_identities_guard ON public.person_source_identities AS RESTRICTIVE FOR SELECT TO tk_stg_reporting_reader USING (staging_reporting_private.allowed_scope(organization_id::text,organization_id::text,'customers.view') AND staging_reporting_private.allowed_scope(organization_id::text,organization_id::text,'orders.view'));
-- tk_stg_reporting_reader: no INSERT/UPDATE/DELETE/TRUNCATE, role membership or table-wide SELECT.
GRANT SELECT("affiliate_id","commerce_reference","connection_id","created_at","currency","customer_email","customer_email_normalized","everflow_offer_id","everflow_transaction_id","evidence_id","gross_amount","order_id","order_ts","organization_id","person_id","platform","platform_order_id","platform_store_id","product_subtotal","provider_account_id","raw_json","receipt_total","shipping_amount","source_id","status","status_norm","sub1","sub2","sub3","sub4","sub5","tax_amount","transaction_id","workspace_id") ON public.platform_orders TO tk_stg_financial_reader;
GRANT SELECT("organization_id","person_id","connection_id","provider_account_id","source_type","source_id","status","evidence_id") ON public.person_source_identities TO tk_stg_financial_reader;
GRANT SELECT("affiliate_id","commerce_reference","created_at","currency","customer_email","customer_email_normalized","everflow_offer_id","everflow_transaction_id","evidence_id","gross_amount","identity_resolution","order_id","order_ts","organization_id","person_id","platform","platform_order_id","platform_store_id","product_subtotal","receipt_total","resolved_person_id","shipping_amount","source_id","status","status_norm","sub1","sub2","sub3","sub4","sub5","tax_amount","transaction_id","workspace_id") ON public.tracekit_customer_order_read_model TO tk_stg_financial_reader;
CREATE POLICY stg_f_platform_orders_allow ON public.platform_orders FOR SELECT TO tk_stg_financial_reader USING (staging_reporting_private.allowed_scope(organization_id::text,workspace_id::text,'customers.view') AND staging_reporting_private.allowed_scope(organization_id::text,workspace_id::text,'orders.view') AND staging_reporting_private.allowed_scope(organization_id::text,workspace_id::text,'financials.view') AND staging_reporting_private.allowed_scope(organization_id::text,workspace_id::text,'orders.view_financials'));
CREATE POLICY stg_f_platform_orders_guard ON public.platform_orders AS RESTRICTIVE FOR SELECT TO tk_stg_financial_reader USING (staging_reporting_private.allowed_scope(organization_id::text,workspace_id::text,'customers.view') AND staging_reporting_private.allowed_scope(organization_id::text,workspace_id::text,'orders.view') AND staging_reporting_private.allowed_scope(organization_id::text,workspace_id::text,'financials.view') AND staging_reporting_private.allowed_scope(organization_id::text,workspace_id::text,'orders.view_financials'));
CREATE POLICY stg_f_person_source_identities_allow ON public.person_source_identities FOR SELECT TO tk_stg_financial_reader USING (staging_reporting_private.allowed_scope(organization_id::text,organization_id::text,'customers.view') AND staging_reporting_private.allowed_scope(organization_id::text,organization_id::text,'orders.view') AND staging_reporting_private.allowed_scope(organization_id::text,organization_id::text,'financials.view') AND staging_reporting_private.allowed_scope(organization_id::text,organization_id::text,'orders.view_financials'));
CREATE POLICY stg_f_person_source_identities_guard ON public.person_source_identities AS RESTRICTIVE FOR SELECT TO tk_stg_financial_reader USING (staging_reporting_private.allowed_scope(organization_id::text,organization_id::text,'customers.view') AND staging_reporting_private.allowed_scope(organization_id::text,organization_id::text,'orders.view') AND staging_reporting_private.allowed_scope(organization_id::text,organization_id::text,'financials.view') AND staging_reporting_private.allowed_scope(organization_id::text,organization_id::text,'orders.view_financials'));
-- tk_stg_financial_reader: no INSERT/UPDATE/DELETE/TRUNCATE, role membership or table-wide SELECT.
-- Existing pre-request hook MUST continue to reject /platform_orders and
-- /person_source_identities, all RPCs and writes. raw_json is an internal proof
-- dependency, never a permitted view projection or browser response. NOLOGIN roles
-- alone are not proof: attest role memberships, SQL access, PUBLIC and invoker/definer
-- call paths before execution. No owner view or SECURITY DEFINER bypass is introduced.

DO $final_acl$
DECLARE r text;t record;a record; allowed jsonb:='{"tk_stg_reporting_reader":{"people":["created_at","display_name","first_name","first_seen_at","id","last_name","last_seen_at","organization_id","primary_email","primary_phone","status","updated_at","workspace_id"],"person_identifiers":["confidence","created_at","first_seen_at","id","identifier_type","is_primary","last_seen_at","normalized_value","person_id","raw_value","source_connector_id","source_platform","source_record_id","source_record_type","updated_at","verification_status","workspace_id"],"identity_resolution_events":["confidence","created_at","id","person_id","resolution_action","resolution_reason","source_platform","source_record_id","source_record_type","workspace_id"],"journeys":["boundary_timeout_seconds","boundary_version","conversion_count","conversion_event_id","created_at","ended_at","entry_event_id","event_count","id","is_active","person_id","purchase_count","started_at","status","updated_at","workspace_id"],"journey_events":["affiliate_id","campaign_id","created_at","currency","event_time","event_type","id","journey_id","medium","offer_id","person_id","platform_order_id","session_id","source","source_connector","source_platform","source_record_id","sub1","sub2","sub3","sub4","sub5","touchpoint_id","transaction_id","updated_at","workspace_id"],"tracekit_customer_order_read_model":["affiliate_id","commerce_reference","created_at","currency","customer_email","customer_email_normalized","everflow_offer_id","everflow_transaction_id","evidence_id","identity_resolution","order_id","order_ts","organization_id","person_id","platform","platform_order_id","platform_store_id","resolved_person_id","source_id","status","status_norm","sub1","sub2","sub3","sub4","sub5","transaction_id","workspace_id"],"journey_attribution_credits":["affiliate_id","calculated_at","campaign_id","conversion_event_id","conversion_event_time","created_at","credit_fraction","credit_percent","currency","id","journey_id","medium","model","model_version","offer_id","person_id","reason","source","status","touchpoint_channel","touchpoint_eligibility_version","touchpoint_event_id","touchpoint_event_time","workspace_id"],"affiliate_commissions":[],"platform_orders":["affiliate_id","commerce_reference","connection_id","created_at","currency","customer_email","customer_email_normalized","everflow_offer_id","everflow_transaction_id","evidence_id","order_id","order_ts","organization_id","person_id","platform","platform_order_id","platform_store_id","provider_account_id","raw_json","source_id","status","status_norm","sub1","sub2","sub3","sub4","sub5","transaction_id","workspace_id"],"person_source_identities":["organization_id","person_id","connection_id","provider_account_id","source_type","source_id","status","evidence_id"],"profit_daily_rollups":[]},"tk_stg_financial_reader":{"people":["created_at","display_name","first_name","first_seen_at","id","last_name","last_seen_at","organization_id","primary_email","primary_phone","status","updated_at","workspace_id"],"person_identifiers":["confidence","created_at","first_seen_at","id","identifier_type","is_primary","last_seen_at","normalized_value","person_id","raw_value","source_connector_id","source_platform","source_record_id","source_record_type","updated_at","verification_status","workspace_id"],"identity_resolution_events":["confidence","created_at","id","person_id","resolution_action","resolution_reason","source_platform","source_record_id","source_record_type","workspace_id"],"journeys":["boundary_timeout_seconds","boundary_version","conversion_count","conversion_event_id","created_at","ended_at","entry_event_id","event_count","id","is_active","person_id","purchase_count","started_at","status","total_revenue","updated_at","workspace_id"],"journey_events":["affiliate_id","amount","campaign_id","created_at","currency","event_time","event_type","id","journey_id","medium","offer_id","person_id","platform_order_id","session_id","source","source_connector","source_platform","source_record_id","sub1","sub2","sub3","sub4","sub5","touchpoint_id","transaction_id","updated_at","workspace_id"],"tracekit_customer_order_read_model":["affiliate_id","commerce_reference","created_at","currency","customer_email","customer_email_normalized","everflow_offer_id","everflow_transaction_id","evidence_id","gross_amount","identity_resolution","order_id","order_ts","organization_id","person_id","platform","platform_order_id","platform_store_id","product_subtotal","receipt_total","resolved_person_id","shipping_amount","source_id","status","status_norm","sub1","sub2","sub3","sub4","sub5","tax_amount","transaction_id","workspace_id"],"journey_attribution_credits":["affiliate_id","calculated_at","campaign_id","conversion_event_id","conversion_event_time","created_at","credit_amount","credit_fraction","credit_percent","currency","id","journey_id","medium","model","model_version","offer_id","person_id","reason","source","status","touchpoint_channel","touchpoint_eligibility_version","touchpoint_event_id","touchpoint_event_time","workspace_id"],"affiliate_commissions":["affiliate_id","attributed_amount","campaign_id","commission_amount","commission_event_id","commission_rate","conversion_event_id","conversion_event_time","created_at","credit_amount","credit_fraction","credit_percent","currency","generated_at","id","journey_attribution_credit_id","journey_id","model","model_version","offer_id","person_id","publisher_id","source","source_credit_created_at","status","touchpoint_event_id","touchpoint_event_time","touchpoint_medium","touchpoint_source","workspace_id"],"platform_orders":["affiliate_id","commerce_reference","connection_id","created_at","currency","customer_email","customer_email_normalized","everflow_offer_id","everflow_transaction_id","evidence_id","gross_amount","order_id","order_ts","organization_id","person_id","platform","platform_order_id","platform_store_id","product_subtotal","provider_account_id","raw_json","receipt_total","shipping_amount","source_id","status","status_norm","sub1","sub2","sub3","sub4","sub5","tax_amount","transaction_id","workspace_id"],"person_source_identities":["organization_id","person_id","connection_id","provider_account_id","source_type","source_id","status","evidence_id"],"profit_daily_rollups":["id","workspace_id","day","platform","event_source","connector_id","currency","gross_revenue","refunds","chargebacks","chargeback_fees","processor_fees","bank_fees","shipping_cost","tax","cogs","affiliate_payout","ad_spend","reversals","adjustments","net_revenue","total_costs","net_profit","profit_margin_pct","order_count","event_count"]}}'::jsonb; expected boolean;
BEGIN
 FOREACH r IN ARRAY ARRAY['tk_stg_reporting_reader','tk_stg_financial_reader'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication OR rolinherit))
   OR EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles x ON x.oid=m.member WHERE x.rolname=r)
  THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Unexpected reporting role authority';END IF;
  IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.prosecdef AND has_schema_privilege(r,n.oid,'USAGE') AND has_function_privilege(r,p.oid,'EXECUTE')
    AND NOT(n.nspname='staging_reporting_private' AND p.proname='allowed_scope'))
  THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Unreviewed privileged routine';END IF;
  FOR t IN SELECT c.oid,c.relname,c.relowner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p','v','m') LOOP
   IF t.relowner=(SELECT oid FROM pg_roles WHERE rolname=r) OR has_table_privilege(r,t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES') OR has_any_column_privilege(r,t.oid,'INSERT,UPDATE,REFERENCES')
   THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Broad or mutation privilege denied';END IF;
   FOR a IN SELECT attname FROM pg_attribute WHERE attrelid=t.oid AND attnum>0 AND NOT attisdropped LOOP
    expected:=coalesce((allowed->r->t.relname)?a.attname::text,false);
    IF has_column_privilege(r,t.oid,a.attname,'SELECT') IS DISTINCT FROM expected
    THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Effective SELECT differs from exact column contract';END IF;
   END LOOP;
  END LOOP;
 END LOOP;
END $final_acl$;
ROLLBACK;
