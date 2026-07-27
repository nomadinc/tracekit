-- Journey Events Ledger v1: normalized append-only customer journey events.

create extension if not exists pgcrypto;

create table if not exists public.journey_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null default 'default',
  person_id uuid references public.people(id) on delete set null,
  platform_order_id text,
  session_id text,
  touchpoint_id text,
  event_type text not null,
  event_time timestamptz not null,
  source_platform text not null,
  source_connector text not null,
  source_record_id text not null,
  amount numeric,
  currency text,
  affiliate_id text,
  offer_id text,
  campaign_id text,
  source text,
  medium text,
  sub1 text,
  sub2 text,
  sub3 text,
  sub4 text,
  sub5 text,
  transaction_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journey_events_event_type_check check (
    event_type in (
      'click',
      'session_start',
      'page_view',
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
  ),
  constraint journey_events_source_identity_check check (
    length(btrim(workspace_id)) > 0
    and length(btrim(source_platform)) > 0
    and length(btrim(source_connector)) > 0
    and length(btrim(source_record_id)) > 0
  ),
  constraint journey_events_currency_check check (
    currency is null or currency ~ '^[A-Z]{3}$'
  )
);

create unique index if not exists journey_events_source_event_uidx
  on public.journey_events (
    workspace_id,
    source_platform,
    source_connector,
    source_record_id,
    event_type
  );

create index if not exists journey_events_person_timeline_idx
  on public.journey_events (workspace_id, person_id, event_time, id)
  where person_id is not null;

create index if not exists journey_events_workspace_event_time_idx
  on public.journey_events (workspace_id, event_time, id);

create index if not exists journey_events_platform_order_idx
  on public.journey_events (workspace_id, platform_order_id)
  where platform_order_id is not null;

create index if not exists journey_events_transaction_idx
  on public.journey_events (workspace_id, transaction_id)
  where transaction_id is not null;

create index if not exists journey_events_attribution_dims_idx
  on public.journey_events (workspace_id, affiliate_id, offer_id, campaign_id, source, sub1, sub2, sub3, sub4, sub5)
  where affiliate_id is not null
    or offer_id is not null
    or campaign_id is not null
    or source is not null;
