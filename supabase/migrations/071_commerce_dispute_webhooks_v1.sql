-- Native Commas dispute webhook capture. Additive; no scheduler or repository activation.
create table public.commerce_dispute_webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  account_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  provider_event_id text not null,
  event_type text not null check (event_type in ('dispute.created','dispute.updated')),
  provider_dispute_id text not null,
  evidence_id uuid not null,
  payload_hash text not null,
  observed_at timestamptz not null default now(),
  provider_created_at timestamptz,
  provider_updated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint commerce_dispute_webhook_events_account_fk foreign key (organization_id, account_id) references public.tracekit_organizations(id, owning_account_id),
  constraint commerce_dispute_webhook_events_scope_fk foreign key (organization_id, connection_id, provider_account_id) references public.commerce_provider_accounts(organization_id, connection_id, id),
  constraint commerce_dispute_webhook_events_evidence_fk foreign key (organization_id, evidence_id) references public.commerce_evidence_records(organization_id, id),
  unique (organization_id, connection_id, provider_event_id)
);

create table public.commerce_provider_disputes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  account_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  provider_dispute_id text not null,
  latest_event_id uuid not null references public.commerce_dispute_webhook_events(id),
  latest_evidence_id uuid not null references public.commerce_evidence_records(id),
  provider_transaction_id text,
  payment_intent_id text,
  payment_id text,
  order_id text,
  external_order_id text,
  amount numeric,
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  fee numeric,
  status text,
  state text,
  reason text,
  reason_code text,
  response_deadline timestamptz,
  opened_at timestamptz,
  updated_at timestamptz,
  closed_at timestamptz,
  buyer_reference text,
  product_reference text,
  reconciliation_state text not null default 'unmatched' check (reconciliation_state in ('matched','review','unmatched')),
  matched_canonical_order_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_provider_disputes_account_fk foreign key (organization_id, account_id) references public.tracekit_organizations(id, owning_account_id),
  constraint commerce_provider_disputes_scope_fk foreign key (organization_id, connection_id, provider_account_id) references public.commerce_provider_accounts(organization_id, connection_id, id),
  constraint commerce_provider_disputes_order_fk foreign key (organization_id, matched_canonical_order_id) references public.platform_orders(organization_id, canonical_order_id),
  unique (connection_id, provider_account_id, provider_dispute_id)
);

create table public.commerce_provider_dispute_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  dispute_id uuid not null references public.commerce_provider_disputes(id),
  webhook_event_id uuid not null references public.commerce_dispute_webhook_events(id),
  event_type text not null check (event_type in ('dispute.created','dispute.updated')),
  status text,
  state text,
  reason text,
  reason_code text,
  observed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (webhook_event_id)
);

create index commerce_dispute_webhook_events_dispute_idx on public.commerce_dispute_webhook_events(organization_id, connection_id, provider_dispute_id, observed_at desc);
create index commerce_provider_disputes_transaction_idx on public.commerce_provider_disputes(organization_id, connection_id, provider_transaction_id);
create index commerce_provider_dispute_lifecycle_idx on public.commerce_provider_dispute_lifecycle_events(dispute_id, observed_at desc);

alter table public.commerce_dispute_webhook_events enable row level security;
alter table public.commerce_provider_disputes enable row level security;
alter table public.commerce_provider_dispute_lifecycle_events enable row level security;
revoke all on public.commerce_dispute_webhook_events, public.commerce_provider_disputes, public.commerce_provider_dispute_lifecycle_events from public, anon, authenticated;
grant select, insert on public.commerce_dispute_webhook_events, public.commerce_provider_dispute_lifecycle_events to service_role;
grant select, insert, update on public.commerce_provider_disputes to service_role;
