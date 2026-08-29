-- TraceKit Everflow affiliate reference data v1.
-- Source-owned reference data only; no canonical affiliate entity is invented here.

create table public.everflow_affiliates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  network_affiliate_id text not null,
  network_id text,
  name text not null,
  account_status text,
  default_currency_id text,
  network_employee_id text,
  network_traffic_source_id text,
  account_executive_id text,
  referrer_id text,
  enable_media_cost_tracking_links boolean,
  source_time_created timestamptz,
  source_time_saved timestamptz,
  payload_hash text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint everflow_affiliates_provider_account_fk
    foreign key (organization_id, connection_id, provider_account_id)
    references public.commerce_provider_accounts (organization_id, connection_id, id)
    on delete cascade,
  constraint everflow_affiliates_source_id_check check (length(btrim(network_affiliate_id)) between 1 and 128),
  constraint everflow_affiliates_name_check check (length(btrim(name)) between 1 and 500),
  constraint everflow_affiliates_status_check check (account_status is null or account_status in ('active','inactive','pending','suspended')),
  constraint everflow_affiliates_hash_check check (payload_hash ~ '^[0-9a-f]{64}$'),
  unique (connection_id, provider_account_id, network_affiliate_id)
);

create index everflow_affiliates_org_connection_idx
  on public.everflow_affiliates (organization_id, connection_id, account_status);
create index everflow_affiliates_connection_name_idx
  on public.everflow_affiliates (connection_id, name);

alter table public.everflow_affiliates enable row level security;
revoke all on table public.everflow_affiliates from anon, authenticated;
grant select, insert, update on table public.everflow_affiliates to service_role;

comment on table public.everflow_affiliates is
  'Connection-scoped normalized Everflow affiliate reference records. network_affiliate_id is source identity and must never be treated as globally unique across Everflow networks.';
comment on column public.everflow_affiliates.payload_hash is
  'SHA-256 of the normalized non-secret affiliate record used for provenance/change detection.';
