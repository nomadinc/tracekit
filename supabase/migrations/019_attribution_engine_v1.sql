-- Attribution Engine v1: rebuildable first-touch and last-touch credits.

create extension if not exists pgcrypto;

create table if not exists public.journey_attribution_credits (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null default 'default',
  journey_id uuid not null references public.journeys(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  conversion_event_id uuid not null references public.journey_events(id) on delete cascade,
  touchpoint_event_id uuid references public.journey_events(id) on delete set null,
  conversion_event_time timestamptz not null,
  touchpoint_event_time timestamptz,
  model text not null,
  model_version text not null,
  touchpoint_eligibility_version text not null,
  status text not null default 'attributed',
  reason text,
  credit_fraction numeric(18,6) not null default 0,
  credit_percent numeric(18,4) not null default 0,
  credit_amount numeric,
  currency text,
  touchpoint_channel text,
  source text,
  medium text,
  campaign_id text,
  affiliate_id text,
  offer_id text,
  calculated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journey_attribution_model_check check (model in ('first_touch', 'last_touch')),
  constraint journey_attribution_status_check check (status in ('attributed', 'unattributed')),
  constraint journey_attribution_credit_check check (
    credit_fraction >= 0
    and credit_percent >= 0
  ),
  constraint journey_attribution_currency_check check (
    currency is null or currency ~ '^[A-Z]{3}$'
  ),
  constraint journey_attribution_touchpoint_status_check check (
    (status = 'attributed' and touchpoint_event_id is not null)
    or (status = 'unattributed' and touchpoint_event_id is null)
  )
);

create unique index if not exists journey_attribution_credit_uidx
  on public.journey_attribution_credits (
    workspace_id,
    conversion_event_id,
    model,
    model_version,
    touchpoint_event_id
  )
  where touchpoint_event_id is not null;

create unique index if not exists journey_attribution_unattributed_uidx
  on public.journey_attribution_credits (
    workspace_id,
    conversion_event_id,
    model,
    model_version
  )
  where touchpoint_event_id is null;

create index if not exists journey_attribution_journey_idx
  on public.journey_attribution_credits (workspace_id, journey_id, conversion_event_time, conversion_event_id, model);

create index if not exists journey_attribution_person_idx
  on public.journey_attribution_credits (workspace_id, person_id, conversion_event_time, conversion_event_id, model, id);

create index if not exists journey_attribution_touchpoint_idx
  on public.journey_attribution_credits (workspace_id, touchpoint_event_id)
  where touchpoint_event_id is not null;

create index if not exists journeys_attribution_backfill_idx
  on public.journeys (workspace_id, started_at, id);

create or replace function public.replace_journey_attribution_credits(
  p_workspace_id text,
  p_conversion_event_id uuid,
  p_model text,
  p_model_version text,
  p_credits jsonb
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_replaced_count integer := 0;
  v_inserted_count integer := 0;
begin
  delete from public.journey_attribution_credits
  where workspace_id = p_workspace_id
    and conversion_event_id = p_conversion_event_id
    and model = p_model
    and model_version = p_model_version;

  get diagnostics v_replaced_count = row_count;

  insert into public.journey_attribution_credits (
    workspace_id,
    journey_id,
    person_id,
    conversion_event_id,
    touchpoint_event_id,
    conversion_event_time,
    touchpoint_event_time,
    model,
    model_version,
    touchpoint_eligibility_version,
    status,
    reason,
    credit_fraction,
    credit_percent,
    credit_amount,
    currency,
    touchpoint_channel,
    source,
    medium,
    campaign_id,
    affiliate_id,
    offer_id,
    calculated_at,
    metadata
  )
  select
    p_workspace_id,
    x.journey_id,
    x.person_id,
    p_conversion_event_id,
    x.touchpoint_event_id,
    x.conversion_event_time,
    x.touchpoint_event_time,
    p_model,
    p_model_version,
    x.touchpoint_eligibility_version,
    x.status,
    x.reason,
    x.credit_fraction,
    x.credit_percent,
    x.credit_amount,
    x.currency,
    x.touchpoint_channel,
    x.source,
    x.medium,
    x.campaign_id,
    x.affiliate_id,
    x.offer_id,
    coalesce(x.calculated_at, now()),
    coalesce(x.metadata, '{}'::jsonb)
  from jsonb_to_recordset(p_credits) as x(
    journey_id uuid,
    person_id uuid,
    touchpoint_event_id uuid,
    conversion_event_time timestamptz,
    touchpoint_event_time timestamptz,
    touchpoint_eligibility_version text,
    status text,
    reason text,
    credit_fraction numeric,
    credit_percent numeric,
    credit_amount numeric,
    currency text,
    touchpoint_channel text,
    source text,
    medium text,
    campaign_id text,
    affiliate_id text,
    offer_id text,
    calculated_at timestamptz,
    metadata jsonb
  );

  get diagnostics v_inserted_count = row_count;

  return jsonb_build_object(
    'replaced', v_replaced_count,
    'inserted', v_inserted_count
  );
end;
$$;
