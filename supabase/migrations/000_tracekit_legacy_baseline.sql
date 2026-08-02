-- TraceKit legacy database baseline (Migration Zero).
--
-- Formal repository migration tracking begins with migration 001, but several
-- hosted objects existed before that history. Migration Zero recreates only
-- those evidence-backed prerequisites so a clean local database can replay the
-- tracked chain in order. Migrations 001 and later remain the owners of every
-- column, constraint, index, policy, and security change they introduce.
--
-- After approval and commit, treat this file as effectively immutable. Repair
-- future differences with new additive migrations. Do not absorb a current
-- hosted schema into this baseline without first subtracting tracked ownership.
--
-- The platform_orders definition below is derived from the authoritative
-- schema-only exports in docs/schema-exports. Its RLS-disabled state matches
-- the hosted legacy table. Broad hosted anon/authenticated grants are omitted
-- intentionally to preserve TraceKit's server-only security direction.

create sequence if not exists public.platform_orders_id_seq
  as bigint;

alter sequence public.platform_orders_id_seq owner to postgres;

create table if not exists public.platform_orders (
  id bigint not null default nextval('public.platform_orders_id_seq'::regclass),
  platform text not null,
  platform_order_id text not null,
  platform_store_id text,
  tkid text,
  everflow_transaction_id text,
  everflow_offer_id text,
  email text,
  phone text,
  order_ts timestamptz not null,
  status text not null,
  currency text not null,
  gross_amount numeric,
  product_subtotal numeric,
  shipping_amount numeric,
  tax_amount numeric,
  product_cost numeric,
  shipping_cost numeric,
  gateway_fee numeric,
  chargeback_fee numeric,
  tracking_number text,
  shipping_carrier text,
  raw jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  event_id text,
  order_id text,
  status_norm text,
  identity_key text,
  customer_key text,
  identity_confidence integer default 0,
  order_group_key text,
  receipt_total numeric,
  applied_product_cost numeric default 0,
  applied_shipping_cost numeric default 0,
  applied_total_cost numeric default 0,
  gross_profit numeric default 0,
  gross_margin_pct numeric default 0,
  cost_rule_id bigint,
  cost_applied_at timestamptz,
  applied_mid_fee numeric default 0,
  net_profit numeric default 0,
  net_margin_pct numeric default 0,
  mid_fee_rule_id bigint,
  constraint platform_orders_pkey primary key (id),
  constraint platform_orders_platform_order_id_key unique (platform_order_id)
);

alter sequence public.platform_orders_id_seq
  owned by public.platform_orders.id;

create index if not exists platform_orders_event_id_idx
  on public.platform_orders using btree (event_id);

create unique index if not exists platform_orders_platform_order_id_uidx
  on public.platform_orders using btree (platform_order_id);

create index if not exists platform_orders_status_norm_idx
  on public.platform_orders using btree (status_norm);

create index if not exists platform_orders_tid_idx
  on public.platform_orders using btree (everflow_transaction_id);

create unique index if not exists platform_orders_uq
  on public.platform_orders using btree (platform, platform_order_id);

alter table public.platform_orders disable row level security;

-- Preserve server-only hosted access while intentionally dropping the legacy
-- broad anon/authenticated table grants.
grant delete, insert, references, select, trigger, truncate, update
  on table public.platform_orders to service_role;

-- integration_import_jobs also predates tracked migration history. This
-- definition is derived from the authoritative schema-only exports under
-- docs/schema-exports/integration_import_jobs after subtracting progress
-- (migration 006) and Connector Runtime fields/indexes (migration 011).
--
-- retries is baseline-owned: the hosted column remains nullable, whereas
-- migration 011's compatibility ADD COLUMN would create it NOT NULL. Its
-- presence in that idempotent ALTER is therefore not evidence that 011 first
-- created the hosted column.
create table if not exists public.integration_import_jobs (
  id uuid not null default gen_random_uuid(),
  platform text not null,
  module text,
  status text not null default 'queued'::text,
  from_date date not null,
  to_date date not null,
  filter text,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  fetched integer not null default 0,
  upserted integer not null default 0,
  pages integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  retries integer default 0,
  last_success_page integer,
  last_success_at timestamptz,
  last_error_at timestamptz,
  constraint integration_import_jobs_pkey primary key (id)
);

create index if not exists integration_import_jobs_platform_idx
  on public.integration_import_jobs using btree (platform, created_at desc);

alter table public.integration_import_jobs disable row level security;

-- As with platform_orders, preserve server access without reproducing the
-- hosted legacy browser-role grants.
grant delete, insert, references, select, trigger, truncate, update
  on table public.integration_import_jobs to service_role;

-- conversions is the distinct legacy canonical financial-event ledger. It is
-- not migration 001's everflow_conversions source table. The definition below
-- subtracts chargeback columns and indexes owned by migration 035 and indexes
-- owned by migrations 033, 034, and 036 from the authoritative hosted export.
create table if not exists public.conversions (
  id uuid not null default gen_random_uuid(),
  tkid text,
  email text,
  phone text,
  click_ids jsonb,
  network text,
  source_system text,
  transaction_id text,
  order_id text,
  external_id text,
  status text not null default 'sale'::text,
  amount numeric default 0,
  currency text default 'USD'::text,
  offer_id text,
  campaign_id text,
  affiliate_id text,
  sub1 text,
  sub2 text,
  sub3 text,
  sub4 text,
  sub5 text,
  meta jsonb,
  ts timestamptz default now(),
  created_at timestamptz default now(),
  site_key text,
  ledger_type text,
  parent_transaction_id text,
  platform text,
  workspace_id text default 'default'::text,
  reason text,
  raw jsonb default '{}'::jsonb,
  occurred_at timestamptz default now(),
  received_at timestamptz default now(),
  cost_category text,
  fee_type text,
  event_source text not null default 'unknown'::text,
  ingestion_method text not null default 'unknown'::text,
  connector_id text not null default 'unknown'::text,
  constraint conversions_pkey primary key (id),
  constraint conversions_ledger_type_check check (
    ledger_type = any (array[
      'sale'::text,
      'refund'::text,
      'chargeback'::text,
      'chargeback_fee'::text,
      'processor_fee'::text,
      'bank_fee'::text,
      'shipping_cost'::text,
      'tax'::text,
      'cogs'::text,
      'affiliate_payout'::text,
      'ad_spend'::text,
      'reversal'::text,
      'adjustment'::text
    ])
  )
);

create index if not exists idx_conv_ledger_type
  on public.conversions using btree (ledger_type);
create index if not exists idx_conv_occurred_at
  on public.conversions using btree (occurred_at);
create index if not exists idx_conv_order
  on public.conversions using btree (order_id);
create index if not exists idx_conv_order_id
  on public.conversions using btree (order_id);
create index if not exists idx_conv_parent_transaction_id
  on public.conversions using btree (parent_transaction_id);
create index if not exists idx_conv_platform
  on public.conversions using btree (platform);
create index if not exists idx_conv_tkid
  on public.conversions using btree (tkid);
create index if not exists idx_conv_transaction
  on public.conversions using btree (transaction_id);
create index if not exists idx_conv_transaction_id
  on public.conversions using btree (transaction_id);
create index if not exists idx_conv_workspace_id
  on public.conversions using btree (workspace_id);
create index if not exists idx_conversions_connector_id
  on public.conversions using btree (connector_id);
create index if not exists idx_conversions_email
  on public.conversions using btree (email);
create index if not exists idx_conversions_event_source
  on public.conversions using btree (event_source);
create index if not exists idx_conversions_ingestion_method
  on public.conversions using btree (ingestion_method);
create index if not exists idx_conversions_order_id
  on public.conversions using btree (order_id);
create index if not exists idx_conversions_tkid
  on public.conversions using btree (tkid);
create index if not exists idx_conversions_transaction_id
  on public.conversions using btree (transaction_id);

alter table public.conversions disable row level security;

-- Preserve server access without reproducing hosted legacy browser grants.
grant delete, insert, references, select, trigger, truncate, update
  on table public.conversions to service_role;

-- integrations_settings predates the scheduler columns added by migration 037.
-- The baseline retains only the exported primary key and updated_at timestamp;
-- migration 037 remains the owner of all six auto-import state columns.
create table if not exists public.integrations_settings (
  platform text not null,
  updated_at timestamptz not null default now(),
  constraint integrations_settings_pkey primary key (platform)
);

alter table public.integrations_settings disable row level security;

-- Preserve server access without reproducing hosted legacy browser grants.
grant delete, insert, references, select, trigger, truncate, update
  on table public.integrations_settings to service_role;
