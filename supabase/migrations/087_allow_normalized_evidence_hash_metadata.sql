begin;

alter table public.commerce_evidence_records
  drop constraint if exists commerce_evidence_records_metadata_safe_check;

alter table public.commerce_evidence_records
  add constraint commerce_evidence_records_metadata_safe_check
  check (
    public.financial_reconciliation_metadata_is_safe(metadata - 'normalizedPayloadHash')
    and (
      not (metadata ? 'normalizedPayloadHash')
      or coalesce(metadata ->> 'normalizedPayloadHash', '') ~ '^[0-9a-f]{64}$'
    )
  );

comment on constraint commerce_evidence_records_metadata_safe_check on public.commerce_evidence_records is
  'Rejects secret/PII-like metadata while permitting normalizedPayloadHash only when it is a 64-character lowercase SHA-256 hex digest.';

commit;
