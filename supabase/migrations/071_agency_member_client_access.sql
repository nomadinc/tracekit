-- Member-level client access for Agency Accounts.
-- Agency owners/admins continue to inherit all active Agency Client assignments.
-- Team members/read-only users must be explicitly assigned to Client Organizations.

create table if not exists public.tracekit_agency_member_client_access (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.tracekit_memberships(id),
  organization_id uuid not null references public.tracekit_organizations(id),
  status text not null default 'active' check (status in ('active', 'suspended', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (membership_id, organization_id)
);

create index if not exists tracekit_agency_member_client_access_membership_status_idx
  on public.tracekit_agency_member_client_access(membership_id, status);

create index if not exists tracekit_agency_member_client_access_org_status_idx
  on public.tracekit_agency_member_client_access(organization_id, status);

alter table public.tracekit_agency_member_client_access enable row level security;

revoke all on table public.tracekit_agency_member_client_access from public;
revoke all on table public.tracekit_agency_member_client_access from anon;
revoke all on table public.tracekit_agency_member_client_access from authenticated;
grant select, insert, update, delete on table public.tracekit_agency_member_client_access to service_role;
