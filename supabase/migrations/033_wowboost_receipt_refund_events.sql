-- WowBoost receipt-level refund idempotency.
--
-- platform_orders remains the mutable latest order snapshot. Refund receipts
-- are appended to the canonical conversions ledger and deduplicated by the
-- stable transaction_id produced by the connector.

create unique index if not exists conversions_wowsuite_refund_event_uidx
  on public.conversions (workspace_id, platform, ledger_type, transaction_id)
  where platform in ('wowboost', 'wowpay')
    and ledger_type = 'refund'
    and transaction_id like 'wowboost:refund:%';

create or replace function public.insert_wowsuite_refund_events(p_events jsonb)
returns table (
  inserted_count bigint,
  duplicate_count bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  input_count bigint := 0;
  written_count bigint := 0;
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'p_events must be a JSON array';
  end if;

  select count(*)
    into input_count
  from jsonb_array_elements(p_events) as event_row
  where nullif(btrim(event_row->>'transaction_id'), '') is not null;

  with normalized as (
    select
      coalesce(nullif(btrim(event_row->>'workspace_id'), ''), 'default') as workspace_id,
      coalesce(nullif(btrim(event_row->>'ledger_type'), ''), 'refund') as ledger_type,
      coalesce(nullif(btrim(event_row->>'event_source'), ''), 'wowboost') as event_source,
      coalesce(nullif(btrim(event_row->>'ingestion_method'), ''), 'api_import') as ingestion_method,
      coalesce(nullif(btrim(event_row->>'connector_id'), ''), 'wowboost') as connector_id,
      nullif(btrim(event_row->>'order_id'), '') as order_id,
      nullif(btrim(event_row->>'transaction_id'), '') as transaction_id,
      nullif(btrim(event_row->>'parent_transaction_id'), '') as parent_transaction_id,
      (event_row->>'amount')::numeric as amount,
      coalesce(nullif(upper(btrim(event_row->>'currency')), ''), 'USD') as currency,
      coalesce(nullif(btrim(event_row->>'platform'), ''), 'wowboost') as platform,
      coalesce(nullif(btrim(event_row->>'source_system'), ''), 'wowboost') as source_system,
      nullif(btrim(event_row->>'status'), '') as status,
      nullif(btrim(event_row->>'reason'), '') as reason,
      coalesce(event_row->'raw', '{}'::jsonb) as raw,
      coalesce(event_row->'meta', '{}'::jsonb) as meta,
      (event_row->>'occurred_at')::timestamptz as occurred_at
    from jsonb_array_elements(p_events) as event_row
    where nullif(btrim(event_row->>'transaction_id'), '') is not null
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
    occurred_at
  )
  select
    normalized.workspace_id,
    'refund',
    normalized.event_source,
    normalized.ingestion_method,
    normalized.connector_id,
    normalized.order_id,
    normalized.transaction_id,
    normalized.parent_transaction_id,
    -abs(normalized.amount),
    normalized.currency,
    normalized.platform,
    normalized.source_system,
    normalized.status,
    normalized.reason,
    normalized.raw,
    normalized.meta,
    normalized.occurred_at
  from normalized
  where normalized.platform in ('wowboost', 'wowpay')
    and normalized.ledger_type = 'refund'
  on conflict do nothing;

  get diagnostics written_count = row_count;

  inserted_count := written_count;
  duplicate_count := greatest(0, input_count - written_count);
  return next;
end;
$$;

revoke all on function public.insert_wowsuite_refund_events(jsonb) from public;
grant execute on function public.insert_wowsuite_refund_events(jsonb) to service_role;

comment on function public.insert_wowsuite_refund_events(jsonb) is
  'Atomically appends idempotent WowBoost/WowPay receipt refund events to the canonical conversions ledger.';
