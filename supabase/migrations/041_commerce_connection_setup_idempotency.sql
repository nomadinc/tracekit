-- Sprint 2.1C: durable idempotency for authorized connection onboarding.
-- Adds no provider records and changes no repository activation.

-- Converge the temporary production containment installed after Migration 040:
-- trigger functions are not ordinary callable routines, but their default
-- EXECUTE grant must still be removed from browser/public roles.
revoke all on function public.commerce_product_mapping_decision_immutable_guard()
  from public, anon, authenticated;

alter table public.commerce_provider_connections
  add column setup_request_id uuid;

create unique index commerce_provider_connections_org_setup_request_uidx
  on public.commerce_provider_connections (organization_id, setup_request_id)
  where setup_request_id is not null;

comment on column public.commerce_provider_connections.setup_request_id is
  'Server-validated idempotency key for connection setup; never a tenant authorization input.';
