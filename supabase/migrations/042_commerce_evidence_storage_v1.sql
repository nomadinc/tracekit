-- TraceKit Commerce Evidence Storage v1.
--
-- Creates the private, server-only object-storage boundary required before any
-- real provider payload is normalized. It stores no provider records and adds
-- no browser policy or repository activation.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'commerce-evidence',
  'commerce-evidence',
  false,
  10485760,
  array[
    'application/json',
    'application/octet-stream',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Deliberately create no storage.objects policy. Storage RLS therefore denies
-- anon/authenticated listing, reads, writes, updates, and deletes. Only the
-- trusted service boundary may operate on this bucket.

comment on table public.commerce_evidence_records is
  'Immutable metadata and protected object references for provider evidence. Raw payloads remain in the private commerce-evidence bucket.';
