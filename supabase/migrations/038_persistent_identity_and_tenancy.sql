-- TraceKit persistent identity and tenancy foundation.
-- WorkOS authenticates; these records authorize TraceKit application access.

create extension if not exists pgcrypto;

create table if not exists public.tracekit_users (
  id uuid primary key default gen_random_uuid(),
  workos_user_id text not null unique,
  primary_email text not null,
  display_name text not null,
  avatar_url text,
  status text not null default 'active' check (status in ('active', 'suspended', 'disabled')),
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tracekit_accounts (
  id uuid primary key default gen_random_uuid(),
  account_type text not null check (account_type in ('platform', 'agency', 'client')),
  name text not null,
  status text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  white_label_configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tracekit_agencies (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references public.tracekit_accounts(id),
  name text not null,
  status text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tracekit_organizations (
  id uuid primary key default gen_random_uuid(),
  owning_account_id uuid not null references public.tracekit_accounts(id),
  agency_id uuid references public.tracekit_agencies(id),
  workos_organization_id text unique,
  name text not null,
  status text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tracekit_roles (
  id uuid primary key default gen_random_uuid(),
  role_key text not null unique,
  name text not null,
  account_type text not null check (account_type in ('platform', 'agency', 'client')),
  permissions text[] not null default '{}',
  system_role boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.tracekit_roles (role_key, name, account_type) values
  ('platform-owner', 'Platform Owner', 'platform'),
  ('platform-admin', 'Platform Admin', 'platform'),
  ('support', 'Support', 'platform'),
  ('billing', 'Billing', 'platform'),
  ('read-only-operations', 'Read-only Operations', 'platform'),
  ('agency-owner', 'Agency Owner', 'agency'),
  ('agency-admin', 'Agency Admin', 'agency'),
  ('team-member', 'Team Member', 'agency'),
  ('agency-read-only', 'Read-only User', 'agency'),
  ('organization-owner', 'Organization Owner', 'client'),
  ('organization-admin', 'Organization Admin', 'client'),
  ('analyst-operator', 'Analyst / Operator', 'client'),
  ('finance', 'Finance', 'client'),
  ('customer-support', 'Customer Support', 'client'),
  ('client-read-only', 'Read-only User', 'client')
on conflict (role_key) do nothing;

create table if not exists public.tracekit_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.tracekit_users(id),
  account_id uuid references public.tracekit_accounts(id),
  organization_id uuid references public.tracekit_organizations(id),
  role_id uuid not null references public.tracekit_roles(id),
  invitation_id uuid,
  status text not null default 'active' check (status in ('invited', 'active', 'suspended', 'removed')),
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(account_id, organization_id) = 1)
);

create table if not exists public.tracekit_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.tracekit_memberships(id),
  capability text not null,
  effect text not null check (effect in ('allow', 'deny')),
  organization_id uuid references public.tracekit_organizations(id),
  resource_type text,
  resource_id text,
  created_by_user_id uuid references public.tracekit_users(id),
  reason text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tracekit_agency_client_assignments (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.tracekit_agencies(id),
  organization_id uuid not null references public.tracekit_organizations(id),
  allowed_scope jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'suspended', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, organization_id)
);

create table if not exists public.tracekit_business_context_access (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.tracekit_memberships(id),
  organization_id uuid not null references public.tracekit_organizations(id),
  business_context_id text not null,
  status text not null default 'active' check (status in ('active', 'suspended', 'removed')),
  created_at timestamptz not null default now(),
  unique (membership_id, organization_id, business_context_id)
);

create table if not exists public.tracekit_invitations (
  id uuid primary key default gen_random_uuid(),
  inviter_user_id uuid not null references public.tracekit_users(id),
  intended_email text not null,
  target_account_id uuid references public.tracekit_accounts(id),
  target_organization_id uuid references public.tracekit_organizations(id),
  requested_role_id uuid not null references public.tracekit_roles(id),
  workos_invitation_id text unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz not null,
  accepted_by_user_id uuid references public.tracekit_users(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (target_account_id is not null or target_organization_id is not null)
);

do $migration$
declare
  v_invitation_fk_count integer;
  v_equivalent_fk_name text;
begin
  if exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.tracekit_memberships'::regclass
      and c.conname = 'tracekit_memberships_invitation_fk'
  ) then
    if not exists (
      select 1
      from pg_catalog.pg_constraint c
      where c.conrelid = 'public.tracekit_memberships'::regclass
        and c.conname = 'tracekit_memberships_invitation_fk'
        and c.contype = 'f'
        and c.conkey = array[(
          select a.attnum
          from pg_catalog.pg_attribute a
          where a.attrelid = 'public.tracekit_memberships'::regclass
            and a.attname = 'invitation_id'
            and not a.attisdropped
        )]::smallint[]
        and c.confrelid = 'public.tracekit_invitations'::regclass
        and c.confkey = array[(
          select a.attnum
          from pg_catalog.pg_attribute a
          where a.attrelid = 'public.tracekit_invitations'::regclass
            and a.attname = 'id'
            and not a.attisdropped
        )]::smallint[]
        and c.confupdtype = 'a'
        and c.confdeltype = 'a'
        and c.convalidated
        and not c.condeferrable
        and not c.condeferred
    ) then
      raise exception
        'tracekit_memberships_invitation_fk exists with an incompatible definition';
    end if;
  else
    select
      count(*),
      min(c.conname) filter (
        where c.confrelid = 'public.tracekit_invitations'::regclass
          and c.confkey = array[(
            select a.attnum
            from pg_catalog.pg_attribute a
            where a.attrelid = 'public.tracekit_invitations'::regclass
              and a.attname = 'id'
              and not a.attisdropped
          )]::smallint[]
          and c.confupdtype = 'a'
          and c.confdeltype = 'a'
          and c.convalidated
          and not c.condeferrable
          and not c.condeferred
      )
    into v_invitation_fk_count, v_equivalent_fk_name
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.tracekit_memberships'::regclass
      and c.contype = 'f'
      and c.conkey = array[(
        select a.attnum
        from pg_catalog.pg_attribute a
        where a.attrelid = 'public.tracekit_memberships'::regclass
          and a.attname = 'invitation_id'
          and not a.attisdropped
      )]::smallint[];

    if v_invitation_fk_count = 0 then
      alter table public.tracekit_memberships
        add constraint tracekit_memberships_invitation_fk
        foreign key (invitation_id)
        references public.tracekit_invitations(id);
    elsif v_invitation_fk_count = 1 and v_equivalent_fk_name is not null then
      execute format(
        'alter table public.tracekit_memberships rename constraint %I to tracekit_memberships_invitation_fk',
        v_equivalent_fk_name
      );
    else
      raise exception
        'tracekit_memberships.invitation_id has an incompatible or ambiguous foreign key definition';
    end if;
  end if;
end
$migration$;

create table if not exists public.tracekit_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.tracekit_users(id),
  authenticated_identity_id text,
  account_id uuid references public.tracekit_accounts(id),
  organization_id uuid references public.tracekit_organizations(id),
  action text not null,
  target_type text,
  target_id text,
  result text not null check (result in ('success', 'denied', 'failure')),
  permission_evaluated text,
  correlation_id text not null,
  ip_address inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists tracekit_memberships_user_status_idx on public.tracekit_memberships(user_id, status);
create index if not exists tracekit_memberships_org_status_idx on public.tracekit_memberships(organization_id, status);
create unique index if not exists tracekit_memberships_user_account_uidx on public.tracekit_memberships(user_id, account_id) where account_id is not null;
create unique index if not exists tracekit_memberships_user_org_uidx on public.tracekit_memberships(user_id, organization_id) where organization_id is not null;
create index if not exists tracekit_permission_overrides_membership_idx on public.tracekit_permission_overrides(membership_id, capability);
create index if not exists tracekit_audit_events_actor_time_idx on public.tracekit_audit_events(actor_user_id, occurred_at desc);
create index if not exists tracekit_audit_events_org_time_idx on public.tracekit_audit_events(organization_id, occurred_at desc);

alter table public.tracekit_users enable row level security;
alter table public.tracekit_accounts enable row level security;
alter table public.tracekit_agencies enable row level security;
alter table public.tracekit_organizations enable row level security;
alter table public.tracekit_roles enable row level security;
alter table public.tracekit_memberships enable row level security;
alter table public.tracekit_permission_overrides enable row level security;
alter table public.tracekit_agency_client_assignments enable row level security;
alter table public.tracekit_business_context_access enable row level security;
alter table public.tracekit_invitations enable row level security;
alter table public.tracekit_audit_events enable row level security;

revoke all on table public.tracekit_users, public.tracekit_accounts, public.tracekit_agencies,
  public.tracekit_organizations, public.tracekit_roles, public.tracekit_memberships,
  public.tracekit_permission_overrides, public.tracekit_agency_client_assignments,
  public.tracekit_business_context_access, public.tracekit_invitations,
  public.tracekit_audit_events from public, anon, authenticated, service_role;

grant select, insert, update, delete on table public.tracekit_users, public.tracekit_accounts,
  public.tracekit_agencies, public.tracekit_organizations, public.tracekit_roles,
  public.tracekit_memberships, public.tracekit_permission_overrides,
  public.tracekit_agency_client_assignments, public.tracekit_business_context_access,
  public.tracekit_invitations, public.tracekit_audit_events to service_role;
