-- TraceKit Edge Intelligence v1 delivery credentials.
-- Raw bearer tokens are never persisted; credentials are tenant/org scoped.

create table if not exists public.edge_intelligence_ingest_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tracekit_organizations(id) on delete cascade,
  tenant_ref text not null,
  token_hash text not null unique,
  status text not null default 'active' check (status in ('active','revoked')),
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  constraint edge_intelligence_ingest_tenant_ref_check check (tenant_ref ~ '^tenant_[A-Za-z0-9_-]{8,128}$')
);

create index if not exists edge_intelligence_ingest_credentials_org_idx
  on public.edge_intelligence_ingest_credentials(organization_id,status);

alter table public.edge_intelligence_ingest_credentials enable row level security;

revoke all on table public.edge_intelligence_ingest_credentials from public,anon,authenticated,authenticator;
grant select,insert,update,delete on table public.edge_intelligence_ingest_credentials to service_role;
