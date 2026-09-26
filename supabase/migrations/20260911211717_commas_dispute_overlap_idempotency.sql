-- Preserve immutable transport deliveries while making overlap logical effects idempotent.
alter table public.commerce_provider_dispute_lifecycle_events
  add column if not exists payload_hash text;

create unique index if not exists commerce_provider_dispute_lifecycle_logical_uidx
  on public.commerce_provider_dispute_lifecycle_events (dispute_id, event_type, payload_hash)
  where payload_hash is not null;
