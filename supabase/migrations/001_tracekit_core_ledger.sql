-- TraceKit Core Ledger / Identity / Attribution Schema

create extension if not exists pgcrypto;

-- 1. Customer identity spine
create table if not exists customers_identity (
  id uuid primary key default gen_random_uuid(),
  email text,
  email_normalized text,
  email_hash text,
  phone text,
  phone_normalized text,
  phone_hash text,
  tkid text,
  first_seen_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  raw_json jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_customers_identity_email_norm on customers_identity(email_normalized);
create index if not exists idx_customers_identity_email_hash on customers_identity(email_hash);
create index if not exists idx_customers_identity_tkid on customers_identity(tkid);

-- 2. Everflow attribution conversions
create table if not exists everflow_conversions (
  id uuid primary key default gen_random_uuid(),
  conversion_id text,
  transaction_id text,
  offer_id text,
  event_id text,
  adv_event_id text,
  affiliate_id text,
  source_id text,
  sub1 text,
  sub2 text,
  sub3 text,
  sub4 text,
  sub5 text,
  email text,
  email_normalized text,
  email_hash text,
  amount numeric default 0,
  payout numeric default 0,
  revenue numeric default 0,
  currency text default 'USD',
  conversion_ts timestamptz,
  raw_json jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(conversion_id)
);

create index if not exists idx_ef_email_norm on everflow_conversions(email_normalized);
create index if not exists idx_ef_transaction_id on everflow_conversions(transaction_id);
create index if not exists idx_ef_affiliate_subs on everflow_conversions(affiliate_id, sub1, sub2, sub3, sub4, sub5);

-- 3. Processor / gateway ledger: NMI, PayPal, Stripe, etc.
create table if not exists payment_transactions (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  account_id text,
  transaction_id text not null,
  parent_transaction_id text,
  order_id text,
  event_type text not null,
  status text,
  email text,
  email_normalized text,
  email_hash text,
  amount numeric default 0,
  fee_amount numeric default 0,
  processor_fee numeric default 0,
  gateway_fee numeric default 0,
  chargeback_fee numeric default 0,
  net_amount numeric default 0,
  currency text default 'USD',
  payment_method text,
  card_brand text,
  processor text,
  descriptor text,
  transaction_ts timestamptz,
  settlement_ts timestamptz,
  raw_json jsonb default '{}'::jsonb,
  matched_platform_order_id text,
  matched_everflow_conversion_id uuid,
  match_confidence numeric,
  match_status text default 'unmatched',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(platform, account_id, transaction_id, event_type)
);

create index if not exists idx_payment_email_norm on payment_transactions(email_normalized);
create index if not exists idx_payment_transaction_id on payment_transactions(transaction_id);
create index if not exists idx_payment_order_id on payment_transactions(order_id);
create index if not exists idx_payment_event_type on payment_transactions(event_type);
create index if not exists idx_payment_ts on payment_transactions(transaction_ts);

-- 4. Campaign/ad spend
create table if not exists campaign_costs (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  account_id text,
  campaign_id text,
  campaign_name text,
  affiliate_id text,
  source_id text,
  sub1 text,
  sub2 text,
  sub3 text,
  sub4 text,
  sub5 text,
  spend_date date not null,
  spend numeric default 0,
  clicks integer default 0,
  impressions integer default 0,
  currency text default 'USD',
  raw_json jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_campaign_costs_date on campaign_costs(spend_date);
create index if not exists idx_campaign_costs_aff_subs on campaign_costs(affiliate_id, sub1, sub2, sub3, sub4, sub5);

-- 5. Match ledger
create table if not exists attribution_matches (
  id uuid primary key default gen_random_uuid(),
  match_type text not null,
  platform_order_id text,
  payment_transaction_id uuid,
  everflow_conversion_id uuid,
  email_normalized text,
  email_hash text,
  transaction_id text,
  order_id text,
  affiliate_id text,
  source_id text,
  sub1 text,
  sub2 text,
  sub3 text,
  sub4 text,
  sub5 text,
  confidence numeric default 0,
  reason text,
  raw_json jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_matches_email_norm on attribution_matches(email_normalized);
create index if not exists idx_matches_platform_order on attribution_matches(platform_order_id);
create index if not exists idx_matches_payment on attribution_matches(payment_transaction_id);
create index if not exists idx_matches_everflow on attribution_matches(everflow_conversion_id);

-- 6. Enhance existing platform_orders table
alter table platform_orders add column if not exists customer_email text;
alter table platform_orders add column if not exists customer_email_normalized text;
alter table platform_orders add column if not exists customer_email_hash text;
alter table platform_orders add column if not exists transaction_id text;
alter table platform_orders add column if not exists affiliate_id text;
alter table platform_orders add column if not exists source_id text;
alter table platform_orders add column if not exists sub1 text;
alter table platform_orders add column if not exists sub2 text;
alter table platform_orders add column if not exists sub3 text;
alter table platform_orders add column if not exists sub4 text;
alter table platform_orders add column if not exists sub5 text;
alter table platform_orders add column if not exists raw_json jsonb default '{}'::jsonb;

create index if not exists idx_platform_orders_email_norm on platform_orders(customer_email_normalized);
create index if not exists idx_platform_orders_email_hash on platform_orders(customer_email_hash);
create index if not exists idx_platform_orders_transaction_id on platform_orders(transaction_id);
create index if not exists idx_platform_orders_affiliate_subs on platform_orders(affiliate_id, sub1, sub2, sub3, sub4, sub5);
