-- Allow browser purchase events for smoke testing without changing the
-- production commerce, ledger, or Profit Engine ingestion model.
--
-- Browser purchase events normalize directly to journey_events.purchase. They
-- do not create platform_orders or append-only conversion ledger rows.

do $$
begin
  if to_regclass('public.browser_events_raw') is null then
    return;
  end if;

  if exists (
    select 1
      from pg_constraint
     where conrelid = to_regclass('public.browser_events_raw')
       and conname = 'browser_events_raw_browser_event_type_check'
  ) then
    alter table public.browser_events_raw
      drop constraint browser_events_raw_browser_event_type_check;
  end if;

  alter table public.browser_events_raw
    add constraint browser_events_raw_browser_event_type_check check (
      normalized_event_type is null or normalized_event_type in (
        'page_view',
        'click',
        'identify',
        'lead',
        'checkout_started',
        'purchase',
        'custom'
      )
    ) not valid;

  if to_regclass('public.events_raw') is not null and exists (
    select 1
      from pg_constraint
     where conrelid = to_regclass('public.events_raw')
       and conname = 'events_raw_browser_event_type_check'
  ) then
    alter table public.events_raw
      drop constraint events_raw_browser_event_type_check;

    alter table public.events_raw
      add constraint events_raw_browser_event_type_check check (
        normalized_event_type is null or normalized_event_type in (
          'page_view',
          'click',
          'identify',
          'lead',
          'checkout_started',
          'purchase',
          'custom'
        )
      ) not valid;
  end if;
end $$;

do $$
begin
  if to_regclass('public.browser_events_raw') is not null then
    alter table public.browser_events_raw
      validate constraint browser_events_raw_browser_event_type_check;
  end if;

  if exists (
    select 1
      from pg_constraint
     where conrelid = to_regclass('public.events_raw')
       and conname = 'events_raw_browser_event_type_check'
  ) then
    alter table public.events_raw
      validate constraint events_raw_browser_event_type_check;
  end if;
end $$;
