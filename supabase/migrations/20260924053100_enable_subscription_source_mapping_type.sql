-- Add provider-neutral source mapping support for canonical subscriptions.
-- This migration changes only the canonical_object_type contract.

do $$
begin
  if exists (
    select 1
    from public.commerce_source_mappings
    where canonical_object_type is null
       or canonical_object_type <> all (array[
         'person'::text,
         'order'::text,
         'provider_product'::text,
         'canonical_offer'::text,
         'refund'::text,
         'dispute'::text,
         'subscription'::text,
         'financial_event'::text
       ])
  ) then
    raise exception 'commerce_source_mappings contains canonical_object_type values outside the forward contract';
  end if;
end
$$;

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

