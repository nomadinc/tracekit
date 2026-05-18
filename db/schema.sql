-- Minimal schema for TraceKit
create extension if not exists pgcrypto;
create table if not exists identities (
  id bigserial primary key,
  email text,
  phone text,
  created_at timestamptz default now()
);
create table if not exists sessions (
  id bigserial primary key,
  identity_id bigint references identities(id),
  tkid uuid default gen_random_uuid(),
  utms jsonb default '{}'::jsonb,
  click_ids jsonb default '{}'::jsonb,
  referrer_client text,
  referrer_header text,
  user_agent text,
  ip inet,
  created_at timestamptz default now()
);
create table if not exists clicks (
  id bigserial primary key,
  session_id bigint references sessions(id),
  url text,
  outbound_url text,
  created_at timestamptz default now()
);
create table if not exists orders (
  id bigserial primary key,
  session_id bigint references sessions(id),
  identity_id bigint references identities(id),
  order_id text,
  currency text,
  amount_cents int,
  gclid text, gbraid text, wbraid text, fbclid text,
  ad_platform text,
  ad_ids jsonb,
  created_at timestamptz default now()
);
create table if not exists refunds (
  id bigserial primary key,
  order_id bigint references orders(id),
  amount_cents int,
  reason text,
  created_at timestamptz default now()
);
create table if not exists chargebacks (
  id bigserial primary key,
  order_id bigint references orders(id),
  amount_cents int,
  status text,
  created_at timestamptz default now()
);
create table if not exists network_conversions (
  id bigserial primary key,
  network text,
  transaction_id text,
  click_id text,
  affiliate_id text,
  campaign_id text,
  status text,
  amount_cents int,
  currency text,
  event_id text,
  raw jsonb,
  imported_at timestamptz default now()
);
create table if not exists scrub_results (
  id bigserial primary key,
  network text,
  transaction_id text,
  order_row bigint references orders(id),
  rule text,
  severity text,
  action text,
  resolved boolean default false,
  created_at timestamptz default now()
);