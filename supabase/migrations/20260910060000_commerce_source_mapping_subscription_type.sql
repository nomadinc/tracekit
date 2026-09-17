-- Provider-neutral source mapping support for canonical subscriptions.
-- Additive compatibility only. This does not activate any connector runtime,
-- scheduler, webhook, or provider write path.

alter table public.commerce_source_mappings
  drop constraint if exists commerce_source_mappings_canonical_type_check;

alter table public.commerce_source_mappings
  add constraint commerce_source_mappings_canonical_type_check
  check (canonical_object_type = any (array[
    'person'::text,
    'order'::text,
    'provider_product'::text,
    'canonical_offer'::text,
    'refund'::text,
    'dispute'::text,
    'subscription'::text,
    'financial_event'::text
  ]));
