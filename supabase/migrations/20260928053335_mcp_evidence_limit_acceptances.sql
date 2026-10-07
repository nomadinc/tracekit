create table if not exists public.mcp_evidence_limit_acceptances (
  acceptance_id uuid primary key,
  organization_id uuid not null,
  actor_user_id text not null,
  customer_id text not null,
  journey_id text,
  evidence_limit text not null,
  evidence_limit_fingerprint text not null,
  accepted_at timestamptz not null,
  audit_correlation_id text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, customer_id, journey_id, evidence_limit_fingerprint)
);
alter table public.mcp_evidence_limit_acceptances enable row level security;
revoke all on table public.mcp_evidence_limit_acceptances from public, anon, authenticated, service_role;
grant select, insert on table public.mcp_evidence_limit_acceptances to service_role;
create index if not exists mcp_evidence_limit_acceptances_scope_idx on public.mcp_evidence_limit_acceptances(organization_id,customer_id,journey_id);
