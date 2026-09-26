begin;
alter table public.commerce_managed_evidence_payloads add column if not exists payload jsonb;
comment on column public.commerce_managed_evidence_payloads.payload is 'Managed inline source payload for bounded connector evidence when object storage is not required.';
commit;