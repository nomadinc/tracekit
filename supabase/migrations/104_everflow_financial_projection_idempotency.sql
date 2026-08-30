-- Everflow financial projection uses PostgREST upsert with
-- on_conflict=organization_id,connection_id,provider_account_id,idempotency_key.
-- PostgreSQL requires a matching unique index/constraint for that conflict target.
-- NULL values remain distinct under PostgreSQL unique-index semantics, preserving
-- legacy conversion rows that do not carry the full connector scope.

create unique index if not exists conversions_connector_idempotency_uidx
  on public.conversions (
    organization_id,
    connection_id,
    provider_account_id,
    idempotency_key
  );
