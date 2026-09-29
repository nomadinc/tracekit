-- WS-016 M5: bridge legacy processor/account identities into canonical tenancy.
create table if not exists public.commerce_provider_account_bindings (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider ~ '^[a-z][a-z0-9_]*$'),
  external_account_id text not null check (length(btrim(external_account_id)) between 1 and 255),
  account_id uuid not null,
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  state text not null default 'active' check (state in ('active','disabled','revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider,external_account_id),
  foreign key (organization_id,account_id) references public.tracekit_organizations(id,owning_account_id),
  foreign key (organization_id,connection_id) references public.commerce_provider_connections(organization_id,id),
  foreign key (provider_account_id) references public.commerce_provider_accounts(id)
);

create index if not exists commerce_provider_account_bindings_scope_idx
  on public.commerce_provider_account_bindings(organization_id,connection_id,provider_account_id)
  where state='active';

create or replace function public.resolve_commerce_provider_account_binding(p_provider text,p_external_account_id text)
returns table(account_id uuid,organization_id uuid,connection_id uuid,provider_account_id uuid)
language sql stable security definer set search_path to 'public','pg_temp'
as $$
  select b.account_id,b.organization_id,b.connection_id,b.provider_account_id
  from public.commerce_provider_account_bindings b
  join public.commerce_provider_connections c
    on c.id=b.connection_id and c.organization_id=b.organization_id and c.account_id=b.account_id
  join public.commerce_provider_accounts pa
    on pa.id=b.provider_account_id and pa.connection_id=b.connection_id and pa.organization_id=b.organization_id
  where b.provider=lower(btrim(p_provider))
    and b.external_account_id=btrim(p_external_account_id)
    and b.state='active' and c.status='connected' and pa.status='active'
  limit 1;
$$;