-- Chargeback ingestion v1.
--
-- This migration keeps platform_orders as mutable order snapshots and appends
-- processor chargeback/dispute activity to the canonical conversions ledger.
-- It is intentionally additive and idempotent because production conversions
-- already exists before these repository migrations.

alter table if exists public.conversions
  add column if not exists processor_account_id text,
  add column if not exists source_event_id text,
  add column if not exists dispute_id text,
  add column if not exists source_amount numeric,
  add column if not exists source_direction text,
  add column if not exists diagnostic_flags text[] not null default '{}'::text[];

create unique index if not exists conversions_chargeback_event_uidx
  on public.conversions (workspace_id, platform, processor_account_id, ledger_type, source_event_id)
  where ledger_type in (
    'chargeback',
    'chargeback_fee',
    'chargeback_reversal',
    'chargeback_fee_reversal'
  )
    and processor_account_id is not null
    and source_event_id is not null;

create index if not exists conversions_chargeback_account_time_idx
  on public.conversions (workspace_id, platform, processor_account_id, ledger_type, occurred_at)
  where ledger_type in (
    'chargeback',
    'chargeback_fee',
    'chargeback_reversal',
    'chargeback_fee_reversal'
  );

create index if not exists conversions_chargeback_dispute_idx
  on public.conversions (workspace_id, platform, processor_account_id, dispute_id)
  where dispute_id is not null
    and ledger_type in (
      'chargeback',
      'chargeback_fee',
      'chargeback_reversal',
      'chargeback_fee_reversal'
    );

create or replace function public.insert_chargeback_ledger_events(p_events jsonb)
returns table (
  observed_count bigint,
  inserted_count bigint,
  duplicate_count bigint,
  invalid_count bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  observed_input_count bigint := 0;
  valid_input_count bigint := 0;
  written_count bigint := 0;
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'p_events must be a JSON array';
  end if;

  select count(*)
    into observed_input_count
  from jsonb_array_elements(p_events) as event_row;

  select count(*)
    into valid_input_count
  from jsonb_array_elements(p_events) as event_row
  where nullif(btrim(event_row->>'transaction_id'), '') is not null
    and nullif(btrim(event_row->>'processor_account_id'), '') is not null
    and nullif(btrim(event_row->>'source_event_id'), '') is not null
    and event_row->>'ledger_type' in (
      'chargeback',
      'chargeback_fee',
      'chargeback_reversal',
      'chargeback_fee_reversal'
    );

  with normalized as (
    select
      coalesce(nullif(btrim(event_row->>'workspace_id'), ''), 'default') as workspace_id,
      nullif(btrim(event_row->>'ledger_type'), '') as ledger_type,
      coalesce(nullif(btrim(event_row->>'event_source'), ''), nullif(btrim(event_row->>'platform'), ''), 'processor') as event_source,
      coalesce(nullif(btrim(event_row->>'ingestion_method'), ''), 'api_import') as ingestion_method,
      coalesce(nullif(btrim(event_row->>'connector_id'), ''), nullif(btrim(event_row->>'platform'), ''), 'chargeback_ingestion') as connector_id,
      nullif(btrim(event_row->>'order_id'), '') as order_id,
      nullif(btrim(event_row->>'transaction_id'), '') as transaction_id,
      nullif(btrim(event_row->>'parent_transaction_id'), '') as parent_transaction_id,
      (event_row->>'amount')::numeric as amount,
      coalesce(nullif(upper(btrim(event_row->>'currency')), ''), 'USD') as currency,
      coalesce(nullif(btrim(event_row->>'platform'), ''), 'processor') as platform,
      coalesce(nullif(btrim(event_row->>'source_system'), ''), nullif(btrim(event_row->>'platform'), ''), 'processor') as source_system,
      nullif(btrim(event_row->>'status'), '') as status,
      nullif(btrim(event_row->>'reason'), '') as reason,
      coalesce(event_row->'raw', '{}'::jsonb) as raw,
      coalesce(event_row->'meta', '{}'::jsonb) as meta,
      (event_row->>'occurred_at')::timestamptz as occurred_at,
      nullif(btrim(event_row->>'processor_account_id'), '') as processor_account_id,
      nullif(btrim(event_row->>'source_event_id'), '') as source_event_id,
      nullif(btrim(event_row->>'dispute_id'), '') as dispute_id,
      nullif(btrim(event_row->>'source_amount'), '')::numeric as source_amount,
      nullif(btrim(event_row->>'source_direction'), '') as source_direction,
      coalesce(
        array(
          select jsonb_array_elements_text(coalesce(event_row->'diagnostic_flags', '[]'::jsonb))
        ),
        '{}'::text[]
      ) as diagnostic_flags
    from jsonb_array_elements(p_events) as event_row
    where nullif(btrim(event_row->>'transaction_id'), '') is not null
      and nullif(btrim(event_row->>'processor_account_id'), '') is not null
      and nullif(btrim(event_row->>'source_event_id'), '') is not null
      and event_row->>'ledger_type' in (
        'chargeback',
        'chargeback_fee',
        'chargeback_reversal',
        'chargeback_fee_reversal'
      )
  )
  insert into public.conversions (
    workspace_id,
    ledger_type,
    event_source,
    ingestion_method,
    connector_id,
    order_id,
    transaction_id,
    parent_transaction_id,
    amount,
    currency,
    platform,
    source_system,
    status,
    reason,
    raw,
    meta,
    occurred_at,
    processor_account_id,
    source_event_id,
    dispute_id,
    source_amount,
    source_direction,
    diagnostic_flags
  )
  select
    normalized.workspace_id,
    normalized.ledger_type,
    normalized.event_source,
    normalized.ingestion_method,
    normalized.connector_id,
    normalized.order_id,
    normalized.transaction_id,
    normalized.parent_transaction_id,
    case
      when normalized.ledger_type in ('chargeback', 'chargeback_fee') then -abs(normalized.amount)
      else abs(normalized.amount)
    end,
    normalized.currency,
    normalized.platform,
    normalized.source_system,
    normalized.status,
    normalized.reason,
    normalized.raw,
    normalized.meta,
    normalized.occurred_at,
    normalized.processor_account_id,
    normalized.source_event_id,
    normalized.dispute_id,
    abs(coalesce(normalized.source_amount, normalized.amount)),
    case
      when normalized.source_direction in ('debit', 'credit', 'unknown') then normalized.source_direction
      when normalized.ledger_type in ('chargeback', 'chargeback_fee') then 'debit'
      else 'credit'
    end,
    normalized.diagnostic_flags
  from normalized
  on conflict do nothing;

  get diagnostics written_count = row_count;

  observed_count := observed_input_count;
  inserted_count := written_count;
  duplicate_count := greatest(0, valid_input_count - written_count);
  invalid_count := greatest(0, observed_input_count - valid_input_count);
  return next;
end;
$$;

revoke all on function public.insert_chargeback_ledger_events(jsonb) from public;
grant execute on function public.insert_chargeback_ledger_events(jsonb) to service_role;

comment on function public.insert_chargeback_ledger_events(jsonb) is
  'Atomically appends idempotent processor chargeback/dispute events to the canonical conversions ledger.';
