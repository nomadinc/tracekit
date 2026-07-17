-- Support PayPal-to-commerce exact reconciliation lookups.

do $$
begin
  if to_regclass('public.platform_orders') is not null then
    create index if not exists platform_orders_platform_order_id_lookup_idx
      on public.platform_orders (platform, order_id)
      where order_id is not null;

    create index if not exists platform_orders_platform_transaction_id_lookup_idx
      on public.platform_orders (platform, transaction_id)
      where transaction_id is not null;
  end if;
end
$$;
