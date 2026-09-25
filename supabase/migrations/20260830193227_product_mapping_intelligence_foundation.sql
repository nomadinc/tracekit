-- Product mapping intelligence foundation.
-- Adds reusable, tenant-scoped mapping rules and price evidence without changing
-- any existing provider-product mapping decisions or historical commerce facts.

create table if not exists public.commerce_product_mapping_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tracekit_organizations(id) on delete cascade,
  connection_id uuid references public.commerce_provider_connections(id) on delete cascade,
  provider_account_id uuid references public.commerce_provider_accounts(id) on delete cascade,
  provider text not null,
  rule_kind text not null,
  match_value text not null,
  normalized_match_value text not null,
  business_context_id text not null references public.tracekit_business_contexts(id),
  canonical_offer_id uuid not null references public.canonical_offers(id),
  offer_step_id uuid not null references public.offer_steps(id),
  offer_variant_id uuid references public.offer_variants(id),
  confidence integer not null default 100,
  execution_mode text not null default 'suggest',
  status text not null default 'active',
  priority integer not null default 100,
  evidence jsonb not null default '{}'::jsonb,
  learned_from_decision_id uuid references public.commerce_product_mapping_decisions(id) on delete set null,
  created_by_user_id uuid references public.tracekit_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_product_mapping_rules_provider_check
    check (provider in ('commas','everflow','shopify','checkout_champ','29next','other')),
  constraint commerce_product_mapping_rules_kind_check
    check (rule_kind in ('provider_product_id','normalized_title','title_prefix')),
  constraint commerce_product_mapping_rules_confidence_check
    check (confidence between 0 and 100),
  constraint commerce_product_mapping_rules_execution_mode_check
    check (execution_mode in ('suggest','auto_map')),
  constraint commerce_product_mapping_rules_status_check
    check (status in ('active','inactive')),
  constraint commerce_product_mapping_rules_priority_check
    check (priority between 0 and 10000),
  constraint commerce_product_mapping_rules_match_value_check
    check (nullif(btrim(match_value),'') is not null and nullif(btrim(normalized_match_value),'') is not null),
  constraint commerce_product_mapping_rules_scope_check
    check (provider_account_id is null or connection_id is not null)
);

create unique index if not exists commerce_product_mapping_rules_unique_scope_idx
  on public.commerce_product_mapping_rules (
    organization_id,
    coalesce(connection_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(provider_account_id, '00000000-0000-0000-0000-000000000000'::uuid),
    provider,
    rule_kind,
    normalized_match_value,
    canonical_offer_id,
    offer_step_id,
    coalesce(offer_variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists commerce_product_mapping_rules_lookup_idx
  on public.commerce_product_mapping_rules
    (organization_id, provider, status, rule_kind, normalized_match_value, priority, confidence);

create index if not exists commerce_product_mapping_rules_connection_idx
  on public.commerce_product_mapping_rules
    (organization_id, connection_id, provider_account_id, status)
  where status = 'active';

create table if not exists public.commerce_product_mapping_rule_prices (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.commerce_product_mapping_rules(id) on delete cascade,
  amount numeric(18,2) not null,
  currency text not null default 'USD',
  evidence_weight integer not null default 10,
  price_role text not null default 'supporting',
  created_at timestamptz not null default now(),
  constraint commerce_product_mapping_rule_prices_amount_check check (amount >= 0),
  constraint commerce_product_mapping_rule_prices_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint commerce_product_mapping_rule_prices_weight_check check (evidence_weight between 0 and 100),
  constraint commerce_product_mapping_rule_prices_role_check check (price_role in ('supporting','expected','historical')),
  unique (rule_id, amount, currency)
);

create index if not exists commerce_product_mapping_rule_prices_lookup_idx
  on public.commerce_product_mapping_rule_prices (rule_id, currency, amount);

create table if not exists public.commerce_product_mapping_policies (
  organization_id uuid not null references public.tracekit_organizations(id) on delete cascade,
  provider text not null,
  auto_map_enabled boolean not null default false,
  auto_map_min_confidence integer not null default 100,
  bulk_review_min_confidence integer not null default 90,
  require_exact_id_for_auto_map boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, provider),
  constraint commerce_product_mapping_policies_provider_check
    check (provider in ('commas','everflow','shopify','checkout_champ','29next','other')),
  constraint commerce_product_mapping_policies_auto_confidence_check
    check (auto_map_min_confidence between 0 and 100),
  constraint commerce_product_mapping_policies_bulk_confidence_check
    check (bulk_review_min_confidence between 0 and 100),
  constraint commerce_product_mapping_policies_threshold_order_check
    check (bulk_review_min_confidence <= auto_map_min_confidence)
);

-- Keep the intelligence layer server-only. RLS is enabled so application JWT
-- roles cannot gain table access accidentally through future default grants.
alter table public.commerce_product_mapping_rules enable row level security;
alter table public.commerce_product_mapping_rule_prices enable row level security;
alter table public.commerce_product_mapping_policies enable row level security;

revoke all on table public.commerce_product_mapping_rules from public, anon, authenticated;
revoke all on table public.commerce_product_mapping_rule_prices from public, anon, authenticated;
revoke all on table public.commerce_product_mapping_policies from public, anon, authenticated;

grant select, insert, update, delete on table public.commerce_product_mapping_rules to service_role;
grant select, insert, update, delete on table public.commerce_product_mapping_rule_prices to service_role;
grant select, insert, update, delete on table public.commerce_product_mapping_policies to service_role;

comment on table public.commerce_product_mapping_rules is
  'Tenant-scoped reusable provider-product identity rules used to recommend canonical product mappings.';
comment on column public.commerce_product_mapping_rules.confidence is
  'Operator-authorized confidence from 0-100; price is supporting evidence and never product identity by itself.';
comment on column public.commerce_product_mapping_rules.execution_mode is
  'suggest requires review; auto_map may execute only when organization policy also permits it.';
comment on table public.commerce_product_mapping_rule_prices is
  'Accepted or historical price evidence for a mapping rule; prices do not independently identify a canonical product.';
comment on table public.commerce_product_mapping_policies is
  'Per-organization/provider safety thresholds for auto-map, bulk review, and manual review routing.';
