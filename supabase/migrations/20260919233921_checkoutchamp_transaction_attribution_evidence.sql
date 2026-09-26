begin;
create table if not exists public.commerce_attribution_evidence (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 connection_id uuid not null,
 provider_account_id uuid not null,
 evidence_id uuid not null,
 provider text not null,
 source_object_type text not null,
 source_object_id text not null,
 affiliate_id text,
 explicit_everflow_transaction_id text,
 custom1 text,
 custom2 text,
 custom3 text,
 utm_source text,
 utm_campaign text,
 funnel_reference_id text,
 classification_status text not null default 'raw',
 metadata jsonb not null default '{}'::jsonb,
 observed_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(connection_id,provider_account_id,source_object_type,source_object_id),
 foreign key(organization_id,evidence_id) references public.commerce_evidence_records(organization_id,id),
 check(classification_status in ('raw','confirmed_everflow','not_everflow','ambiguous'))
);
alter table public.commerce_attribution_evidence enable row level security;
revoke all on public.commerce_attribution_evidence from anon,authenticated;
grant select,insert,update,delete on public.commerce_attribution_evidence to service_role;
comment on table public.commerce_attribution_evidence is 'Provider-authored acquisition evidence preserved independently from commerce identity. Custom fields remain raw unless deterministically classified.';

alter table public.commerce_transaction_relationship_evidence
  add column if not exists actual_order_id text,
  add column if not exists client_order_id text,
  add column if not exists billing_cycle_number integer,
  add column if not exists funnel_reference_id text;

commit;