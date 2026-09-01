begin;

create table if not exists public.everflow_click_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  transaction_id text not null,
  click_at timestamptz not null,
  is_unique boolean,
  source_id text,
  sub1 text,
  sub2 text,
  sub3 text,
  sub4 text,
  sub5 text,
  affiliate_id text,
  affiliate_name text,
  offer_id text,
  offer_name text,
  tracking_url text,
  destination_url text,
  referer text,
  revenue numeric,
  payout numeric,
  currency text,
  has_conversion boolean,
  is_view_through boolean,
  is_test_mode boolean,
  is_sdk_click boolean,
  is_async boolean,
  user_ip_hash text,
  country text,
  region text,
  city text,
  isp text,
  organization_name text,
  is_mobile boolean,
  is_proxy boolean,
  platform text,
  os_version text,
  browser text,
  browser_version text,
  device_type text,
  device_brand text,
  device_model text,
  is_robot boolean,
  is_filter boolean,
  creative_id text,
  coupon_code text,
  query_parameters jsonb not null default '{}'::jsonb,
  payload_hash text not null,
  raw_payload jsonb not null,
  raw_payload_hash text not null,
  ingestion_method text not null default 'api',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint everflow_click_events_transaction_id_nonempty check (length(btrim(transaction_id)) > 0),
  constraint everflow_click_events_ingestion_method_check check (ingestion_method in ('api','backfill','webhook')),
  constraint everflow_click_events_scope_unique unique (organization_id, connection_id, provider_account_id, transaction_id)
);

create index if not exists everflow_click_events_connection_click_at_idx
  on public.everflow_click_events(connection_id, click_at desc);
create index if not exists everflow_click_events_transaction_id_idx
  on public.everflow_click_events(transaction_id);
create index if not exists everflow_click_events_offer_idx
  on public.everflow_click_events(connection_id, offer_id, click_at desc);
create index if not exists everflow_click_events_affiliate_idx
  on public.everflow_click_events(connection_id, affiliate_id, click_at desc);

alter table public.everflow_click_events enable row level security;

revoke all on table public.everflow_click_events from anon, authenticated;
grant select, insert, update, delete on table public.everflow_click_events to service_role;

commit;
