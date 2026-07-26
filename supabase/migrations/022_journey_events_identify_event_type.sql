-- Allow Browser Touchpoint Ingestion identify events to remain identify in
-- the canonical journey_events ledger. Identify remains attribution-ineligible
-- in application logic; this migration only updates the event type constraint.

do $$
begin
  if exists (
    select 1
      from pg_constraint
     where conrelid = 'public.journey_events'::regclass
       and conname = 'journey_events_event_type_check'
  ) then
    alter table public.journey_events
      drop constraint journey_events_event_type_check;
  end if;

  alter table public.journey_events
    add constraint journey_events_event_type_check check (
      event_type in (
        'click',
        'session_start',
        'page_view',
        'identify',
        'landing_page',
        'quiz_started',
        'form_started',
        'lead_created',
        'checkout_started',
        'purchase',
        'upsell',
        'subscription_started',
        'subscription_renewed',
        'refund',
        'chargeback',
        'cancellation',
        'email_open',
        'email_click',
        'call',
        'sms',
        'appointment',
        'custom'
      )
    ) not valid;
end $$;

alter table public.journey_events validate constraint journey_events_event_type_check;
