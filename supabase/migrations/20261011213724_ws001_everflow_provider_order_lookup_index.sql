-- WS-001: v5 resolves exact provider order IDs by organization and source ID.
-- The existing unique source identity index starts with connection/account,
-- so it cannot efficiently serve this intentionally cross-connection lookup.
-- Preserve its matching semantics, tenant scope, and uniqueness constraints.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '15s';
create index if not exists commerce_source_mappings_active_order_lookup_idx
  on public.commerce_source_mappings (organization_id, source_object_id)
  include (canonical_object_id)
  where canonical_object_type = 'order' and state = 'active';
commit;
