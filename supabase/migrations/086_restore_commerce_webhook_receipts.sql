-- Restore commerce_webhook_receipts when migration history says the original
-- webhook receipts migration ran but the table is absent after Production restore.
-- Schema mirrors the verified staging table used by the 29Next webhook runtime.

create table if not exists public.commerce_webhook_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  provider text not null
    constraint commerce_webhook_receipts_provider_check
    check (provider ~ '^[a-z][a-z0-9_]*$'),
  provider_event_id text not null,
  event_type text not null
    constraint commerce_webhook_receipts_event_type_check
    check (event_type ~ '^[a-z][a-z0-9_.]*$'),
  api_version text,
  status text not null default 'reserved'
    constraint commerce_webhook_receipts_status_check
    check (status = any (array['reserved'::text, 'completed'::text, 'failed'::text])),
  evidence_id uuid,
  first_received_at timestamptz not null default now(),
  last_received_at timestamptz not null default now(),
  completed_at timestamptz,
  failed_at timestamptz,
  delivery_count integer not null default 1
    constraint commerce_webhook_receipts_delivery_count_check
    check (delivery_count >= 1),
  last_error_summary text,
  metadata jsonb not null default '{}'::jsonb
    constraint commerce_webhook_receipts_metadata_safe_check
    check (financial_reconciliation_metadata_is_safe(metadata)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_webhook_receipts_provider_account_fk
    foreign key (organization_id, connection_id, provider_account_id)
    references public.commerce_provider_accounts (organization_id, connection_id, id),
  constraint commerce_webhook_receipts_connection_id_provider_account_id_key
    unique (connection_id, provider_account_id, provider, provider_event_id)
);

create unique index if not exists commerce_webhook_receipts_scope_id_uidx
  on public.commerce_webhook_receipts (organization_id, connection_id, provider_account_id, id);

create index if not exists commerce_webhook_receipts_status_idx
  on public.commerce_webhook_receipts (organization_id, provider, status, last_received_at desc);

revoke all on table public.commerce_webhook_receipts from public, anon, authenticated;
grant all on table public.commerce_webhook_receipts to service_role;
