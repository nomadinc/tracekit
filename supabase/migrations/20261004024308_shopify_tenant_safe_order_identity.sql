-- Shopify normalized Orders are owned by their provider/source scope. The
-- original platform_order_id remains a globally unique compatibility locator,
-- but it is not the source identity used for tenant-owned replay.
--
-- The existing platform_orders_provider_source_uidx is partial. PostgREST's
-- on_conflict column inference cannot name its predicate, so provide an
-- equivalent non-partial unique index. PostgreSQL's default NULLS DISTINCT
-- behavior preserves all unscoped legacy rows while enforcing uniqueness for
-- fully populated provider/source identities.
create unique index if not exists platform_orders_provider_source_conflict_uidx
  on public.platform_orders (connection_id, provider_account_id, provider_order_id);

comment on index public.platform_orders_provider_source_conflict_uidx is
  'Inferable PostgREST conflict target for a tenant-owned provider Order source; nullable legacy rows remain distinct.';
