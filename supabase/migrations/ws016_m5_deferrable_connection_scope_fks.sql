-- WS-016 M5 tenancy canonicalization
-- Permit an existing canonical Connection and its complete tenant-scoped graph to
-- move between Organizations atomically without disabling referential integrity.
--
-- Constraints remain INITIALLY IMMEDIATE. Normal application writes therefore
-- retain the same immediate FK behavior unless a migration transaction explicitly
-- executes SET CONSTRAINTS ... DEFERRED.

ALTER TABLE public.commerce_connection_pauses
  ALTER CONSTRAINT commerce_connection_pauses_organization_id_connection_id_fkey DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.commerce_dispute_reconciliations
  ALTER CONSTRAINT commerce_dispute_reconciliations_connection_fk DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.commerce_provider_accounts
  ALTER CONSTRAINT commerce_provider_accounts_connection_fk DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.commerce_provider_credentials
  ALTER CONSTRAINT commerce_provider_credentials_connection_fk DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.commerce_repository_activation
  ALTER CONSTRAINT commerce_repository_activation_connection_fk DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.conversions
  ALTER CONSTRAINT conversions_connection_scope_fk DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.everflow_acquisition_journeys
  ALTER CONSTRAINT everflow_acquisition_journeys_organization_id_connection_i_fkey DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.everflow_conversion_events
  ALTER CONSTRAINT everflow_conversion_events_organization_id_connection_id_fkey DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.everflow_historical_imports
  ALTER CONSTRAINT everflow_historical_imports_organization_id_connection_id_fkey DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.everflow_journey_order_links
  ALTER CONSTRAINT everflow_journey_order_links_organization_id_connection_id_fkey DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.everflow_order_reconciliations
  ALTER CONSTRAINT everflow_order_reconciliation_organization_id_connection_i_fkey DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.platform_orders
  ALTER CONSTRAINT platform_orders_connection_scope_fk DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.tkid_commerce_links
  ALTER CONSTRAINT tkid_commerce_links_organization_id_provider_connection_id_fkey DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.tracekit_investigations
  ALTER CONSTRAINT tracekit_investigations_organization_id_connection_id_fkey DEFERRABLE INITIALLY IMMEDIATE;
