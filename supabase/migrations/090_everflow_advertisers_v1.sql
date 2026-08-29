-- TraceKit Everflow advertiser reference data v1.
-- Source-owned reference data only; no canonical advertiser entity is invented here.

create table public.everflow_advertisers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  network_advertiser_id text not null,
  network_id text,
  name text not null,
  account_status text,
  account_manager_id text,
  account_manager_name text,
  sales_manager_id text,
  sales_manager_name text,
  labels jsonb not null default '[]'::jsonb,
  source_time_created timestamptz,
  source_time_saved timestamptz,
  payload_hash text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint everflow_advertisers_provider_account_fk
    foreign key (organization_id, connection_id, provider_account_id)
    references public.commerce_provider_accounts (organization_id, connection_id, id)
    on delete cascade,
  constraint everflow_advertisers_source_id_check check (length(btrim(network_advertiser_id)) between 1 and 128),
  constraint everflow_advertisers_name_check check (length(btrim(name)) between 1 and 500),
  constraint everflow_advertisers_hash_check check (payload_hash ~ '^[0-9a-f]{64}$'),
  unique (connection_id, provider_account_id, network_advertiser_id)
);

create index everflow_advertisers_org_connection_idx
  on public.everflow_advertisers (organization_id, connection_id, account_status);
create index everflow_advertisers_connection_name_idx
  on public.everflow_advertisers (connection_id, name);

alter table public.everflow_advertisers enable row level security;
revoke all on table public.everflow_advertisers from anon, authenticated;
grant select, insert, update on table public.everflow_advertisers to service_role;

comment on table public.everflow_advertisers is
  'Connection-scoped normalized Everflow advertiser reference records. network_advertiser_id is source identity and must never be treated as globally unique across Everflow networks.';
comment on column public.everflow_advertisers.payload_hash is
  'SHA-256 of the normalized non-secret advertiser record used for provenance/change detection.';
