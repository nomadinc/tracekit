begin;
create table if not exists public.commerce_transaction_relationship_evidence (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 connection_id uuid not null,
 provider_account_id uuid not null,
 canonical_order_id uuid,
 evidence_id uuid not null,
 provider text not null,
 provider_order_id text not null,
 provider_transaction_id text not null,
 parent_provider_transaction_id text,
 transaction_type text,
 transaction_status text,
 observed_at timestamptz not null default now(),
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(connection_id,provider_account_id,provider_transaction_id),
 foreign key(organization_id,evidence_id) references public.commerce_evidence_records(organization_id,id)
);
alter table public.commerce_transaction_relationship_evidence enable row level security;
revoke all on public.commerce_transaction_relationship_evidence from anon,authenticated;
grant select,insert,update,delete on public.commerce_transaction_relationship_evidence to service_role;
comment on table public.commerce_transaction_relationship_evidence is 'Provider-authored transaction relationship evidence. Parent ids are preserved exactly and never inferred.';
commit;