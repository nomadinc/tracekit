-- Link normalized Shopify orders to the canonical person already established by
-- the Shopify customer sync. Handles either arrival order: customer before order
-- or order before customer, and backfills existing Shopify orders.

create or replace function public.link_shopify_platform_order_person()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id text;
  v_person_id uuid;
begin
  if new.platform is distinct from 'shopify' then
    return new;
  end if;

  v_customer_id := nullif(btrim(coalesce(new.raw_json -> 'customer' ->> 'id', '')), '');
  if v_customer_id is null then
    return new;
  end if;

  select psi.person_id
    into v_person_id
  from public.person_source_identities psi
  where psi.organization_id = new.organization_id
    and psi.connection_id = new.connection_id
    and psi.provider_account_id = new.provider_account_id
    and psi.source_type = 'provider_customer_id'
    and psi.source_id = v_customer_id
    and psi.status = 'verified'
  order by psi.last_seen_at desc nulls last, psi.created_at desc
  limit 1;

  if v_person_id is not null then
    new.person_id := v_person_id;
  end if;

  return new;
end;
$$;

revoke all on function public.link_shopify_platform_order_person() from public;

drop trigger if exists trg_link_shopify_platform_order_person on public.platform_orders;
create trigger trg_link_shopify_platform_order_person
before insert or update of raw_json, organization_id, connection_id, provider_account_id
on public.platform_orders
for each row
execute function public.link_shopify_platform_order_person();

create or replace function public.backfill_shopify_orders_for_customer_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source_type <> 'provider_customer_id'
     or new.status <> 'verified'
     or new.person_id is null then
    return new;
  end if;

  update public.platform_orders po
     set person_id = new.person_id,
         updated_at = greatest(po.updated_at, now())
   where po.platform = 'shopify'
     and po.organization_id = new.organization_id
     and po.connection_id = new.connection_id
     and po.provider_account_id = new.provider_account_id
     and po.raw_json -> 'customer' ->> 'id' = new.source_id
     and po.person_id is distinct from new.person_id;

  return new;
end;
$$;

revoke all on function public.backfill_shopify_orders_for_customer_identity() from public;

drop trigger if exists trg_backfill_shopify_orders_for_customer_identity on public.person_source_identities;
create trigger trg_backfill_shopify_orders_for_customer_identity
after insert or update of person_id, source_id, status
on public.person_source_identities
for each row
execute function public.backfill_shopify_orders_for_customer_identity();

-- Backfill Shopify orders whose verified customer identity already exists.
update public.platform_orders po
   set person_id = psi.person_id,
       updated_at = greatest(po.updated_at, now())
  from public.person_source_identities psi
 where po.platform = 'shopify'
   and po.person_id is distinct from psi.person_id
   and psi.organization_id = po.organization_id
   and psi.connection_id = po.connection_id
   and psi.provider_account_id = po.provider_account_id
   and psi.source_type = 'provider_customer_id'
   and psi.status = 'verified'
   and psi.person_id is not null
   and psi.source_id = po.raw_json -> 'customer' ->> 'id';
