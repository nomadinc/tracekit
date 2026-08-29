begin;

create table if not exists public.commerce_managed_evidence_payloads (
  evidence_id uuid primary key references public.commerce_evidence_records(id) on delete restrict,
  organization_id uuid not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint commerce_managed_evidence_payloads_evidence_org_fk
    foreign key (organization_id, evidence_id)
    references public.commerce_evidence_records(organization_id, id)
    on delete restrict
);

comment on table public.commerce_managed_evidence_payloads is
  'Database-backed immutable payload storage for commerce evidence records using storage_backend=managed_evidence_store.';

alter table public.everflow_conversion_events
  add column if not exists evidence_id uuid null references public.commerce_evidence_records(id) on delete set null;

alter table public.everflow_conversion_state_history
  add column if not exists evidence_id uuid null references public.commerce_evidence_records(id) on delete set null;

create index if not exists everflow_conversion_events_evidence_idx
  on public.everflow_conversion_events(evidence_id)
  where evidence_id is not null;

create index if not exists everflow_conversion_state_history_evidence_idx
  on public.everflow_conversion_state_history(evidence_id)
  where evidence_id is not null;

commit;
