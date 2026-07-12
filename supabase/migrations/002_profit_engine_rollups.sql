-- TraceKit Profit Engine v1 rollups

create extension if not exists pgcrypto;

create table if not exists profit_order_rollups (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null default 'default',
  order_id text not null,
  platform text not null default 'unknown',
  event_source text not null default 'unknown',
  connector_id text not null default 'unknown',
  currency text not null default 'USD',
  gross_revenue numeric not null default 0,
  refunds numeric not null default 0,
  chargebacks numeric not null default 0,
  chargeback_fees numeric not null default 0,
  processor_fees numeric not null default 0,
  bank_fees numeric not null default 0,
  shipping_cost numeric not null default 0,
  tax numeric not null default 0,
  cogs numeric not null default 0,
  affiliate_payout numeric not null default 0,
  ad_spend numeric not null default 0,
  reversals numeric not null default 0,
  adjustments numeric not null default 0,
  net_revenue numeric not null default 0,
  total_costs numeric not null default 0,
  net_profit numeric not null default 0,
  profit_margin_pct numeric,
  event_count integer not null default 0,
  first_event_at timestamptz,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, order_id, connector_id, currency)
);

create table if not exists profit_daily_rollups (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null default 'default',
  day date not null,
  platform text not null default 'unknown',
  event_source text not null default 'unknown',
  connector_id text not null default 'unknown',
  currency text not null default 'USD',
  gross_revenue numeric not null default 0,
  refunds numeric not null default 0,
  chargebacks numeric not null default 0,
  chargeback_fees numeric not null default 0,
  processor_fees numeric not null default 0,
  bank_fees numeric not null default 0,
  shipping_cost numeric not null default 0,
  tax numeric not null default 0,
  cogs numeric not null default 0,
  affiliate_payout numeric not null default 0,
  ad_spend numeric not null default 0,
  reversals numeric not null default 0,
  adjustments numeric not null default 0,
  net_revenue numeric not null default 0,
  total_costs numeric not null default 0,
  net_profit numeric not null default 0,
  profit_margin_pct numeric,
  order_count integer not null default 0,
  event_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, day, connector_id, currency)
);

create index if not exists idx_profit_order_rollups_workspace on profit_order_rollups(workspace_id);
create index if not exists idx_profit_order_rollups_order_id on profit_order_rollups(order_id);
create index if not exists idx_profit_order_rollups_connector on profit_order_rollups(connector_id);
create index if not exists idx_profit_order_rollups_event_source on profit_order_rollups(event_source);
create index if not exists idx_profit_order_rollups_platform on profit_order_rollups(platform);
create index if not exists idx_profit_order_rollups_last_event on profit_order_rollups(last_event_at);

create index if not exists idx_profit_daily_rollups_workspace on profit_daily_rollups(workspace_id);
create index if not exists idx_profit_daily_rollups_day on profit_daily_rollups(day);
create index if not exists idx_profit_daily_rollups_connector on profit_daily_rollups(connector_id);
create index if not exists idx_profit_daily_rollups_event_source on profit_daily_rollups(event_source);
create index if not exists idx_profit_daily_rollups_platform on profit_daily_rollups(platform);
