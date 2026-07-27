-- Support bounded WowBoost commerce-reference backfill scans.

do $$
begin
  if to_regclass('public.platform_orders') is not null then
      create index if not exists platform_orders_wowboost_reference_backfill_idx
        on public.platform_orders (platform, order_ts, platform_order_id)
        where platform_order_id is not null
        and (commerce_reference is null or commerce_reference = '')
        and platform in ('wowboost', 'wowsuite:wowboost', 'wowsuite');
  end if;
end
$$;
