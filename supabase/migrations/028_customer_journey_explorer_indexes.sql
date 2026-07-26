-- Customer Journey Explorer v1 read-path indexes.
--
-- The explorer composes existing people, identifiers, journeys, orders,
-- attribution credits, and commissions. These additive indexes support
-- bounded workspace-scoped investigation queries without duplicating or
-- mutating canonical journey, identity, attribution, or payout data.

do $$
begin
  if to_regclass('public.people') is not null then
    create index if not exists people_customer_explorer_updated_idx
      on public.people (workspace_id, updated_at desc, id desc);
  end if;

  if to_regclass('public.person_identifiers') is not null then
    create index if not exists person_identifiers_customer_explorer_value_idx
      on public.person_identifiers (workspace_id, normalized_value, verification_status, person_id)
      where verification_status in ('observed', 'verified');

    create index if not exists person_identifiers_customer_explorer_person_idx
      on public.person_identifiers (workspace_id, person_id, is_primary desc, updated_at desc);
  end if;

  if to_regclass('public.platform_orders') is not null then
    create index if not exists platform_orders_customer_explorer_person_order_idx
      on public.platform_orders (workspace_id, person_id, order_ts desc, platform_order_id)
      where person_id is not null;

    create index if not exists platform_orders_customer_explorer_order_id_idx
      on public.platform_orders (workspace_id, order_id)
      where order_id is not null;

    create index if not exists platform_orders_customer_explorer_platform_order_idx
      on public.platform_orders (workspace_id, platform_order_id)
      where platform_order_id is not null;

    create index if not exists platform_orders_customer_explorer_transaction_idx
      on public.platform_orders (workspace_id, transaction_id)
      where transaction_id is not null;

    create index if not exists platform_orders_customer_explorer_email_idx
      on public.platform_orders (workspace_id, customer_email_normalized)
      where customer_email_normalized is not null;

    create index if not exists platform_orders_customer_explorer_affiliate_idx
      on public.platform_orders (workspace_id, affiliate_id, order_ts desc)
      where affiliate_id is not null;
  end if;

  if to_regclass('public.journeys') is not null then
    create index if not exists journeys_customer_explorer_person_started_idx
      on public.journeys (workspace_id, person_id, started_at desc, id desc);

    create index if not exists journeys_customer_explorer_status_started_idx
      on public.journeys (workspace_id, status, started_at desc, id desc);
  end if;

  if to_regclass('public.journey_events') is not null then
    create index if not exists journey_events_customer_explorer_journey_timeline_idx
      on public.journey_events (workspace_id, journey_id, event_time, id)
      where journey_id is not null;
  end if;

  if to_regclass('public.journey_attribution_credits') is not null then
    create index if not exists journey_attribution_credits_customer_explorer_person_idx
      on public.journey_attribution_credits (workspace_id, person_id, conversion_event_time desc, id desc);

    create index if not exists journey_attribution_credits_customer_explorer_journey_idx
      on public.journey_attribution_credits (workspace_id, journey_id, conversion_event_time, model, id);
  end if;

  if to_regclass('public.affiliate_commissions') is not null then
    create index if not exists affiliate_commissions_customer_explorer_person_idx
      on public.affiliate_commissions (workspace_id, person_id, conversion_event_time desc, id desc);

    create index if not exists affiliate_commissions_customer_explorer_journey_idx
      on public.affiliate_commissions (workspace_id, journey_id, conversion_event_time, id);
  end if;
end $$;
