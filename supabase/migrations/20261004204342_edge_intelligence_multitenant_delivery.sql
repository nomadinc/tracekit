-- Multi-tenant Edge Intelligence delivery identity.
-- Service credentials authenticate TraceKit Edge; tenant bindings determine data ownership.

create table if not exists public.edge_intelligence_service_credentials (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  status text not null default 'active' check (status in ('active','revoked')),
  label text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create table if not exists public.edge_intelligence_tenant_bindings (
  tenant_ref text primary key,
  organization_id uuid not null references public.tracekit_organizations(id) on delete cascade,
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint edge_intelligence_tenant_binding_ref_check check (tenant_ref ~ '^tenant_[A-Za-z0-9_-]{8,128}$')
);

create index if not exists edge_intelligence_tenant_bindings_org_idx
  on public.edge_intelligence_tenant_bindings(organization_id,status);

alter table public.edge_intelligence_service_credentials enable row level security;
alter table public.edge_intelligence_tenant_bindings enable row level security;

revoke all on table public.edge_intelligence_service_credentials from public,anon,authenticated,authenticator;
revoke all on table public.edge_intelligence_tenant_bindings from public,anon,authenticated,authenticator;
grant select,insert,update,delete on table public.edge_intelligence_service_credentials to service_role;
grant select,insert,update,delete on table public.edge_intelligence_tenant_bindings to service_role;

comment on table public.edge_intelligence_service_credentials is
  'Authenticates the TraceKit Edge service. Does not confer organization ownership.';
comment on table public.edge_intelligence_tenant_bindings is
  'Deterministically maps Edge tenantRef to canonical TraceKit organization ownership.';
