-- Payout Engine v1
--
-- The Payout Engine is intentionally downstream of the Attribution Engine.
-- journey_attribution_credits remains the immutable attribution result set;
-- payout policy selects which attribution model is operationally active, and
-- affiliate_commissions records payable ledger rows generated from that model.

create extension if not exists pgcrypto;

create table if not exists public.workspace_attribution_policy (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  active_model text not null default 'first_touch',
  model_version text not null default 'v1',
  default_commission_rate numeric(18,6) not null default 0,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workspace_attribution_policy
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists workspace_id text,
  add column if not exists active_model text default 'first_touch',
  add column if not exists model_version text default 'v1',
  add column if not exists default_commission_rate numeric(18,6) default 0,
  add column if not exists status text default 'active',
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

do $$
begin
  alter table public.workspace_attribution_policy
    drop constraint if exists workspace_attribution_policy_model_check;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.workspace_attribution_policy'::regclass
      and conname = 'workspace_attribution_policy_model_check'
  ) then
    alter table public.workspace_attribution_policy
      add constraint workspace_attribution_policy_model_check
      check (active_model in ('first_touch', 'last_touch', 'linear', 'position_based')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.workspace_attribution_policy'::regclass
      and conname = 'workspace_attribution_policy_rate_check'
  ) then
    alter table public.workspace_attribution_policy
      add constraint workspace_attribution_policy_rate_check
      check (default_commission_rate >= 0 and default_commission_rate <= 1) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.workspace_attribution_policy'::regclass
      and conname = 'workspace_attribution_policy_status_check'
  ) then
    alter table public.workspace_attribution_policy
      add constraint workspace_attribution_policy_status_check
      check (status in ('active', 'inactive')) not valid;
  end if;
end $$;

create unique index if not exists workspace_attribution_policy_workspace_uidx
  on public.workspace_attribution_policy (workspace_id);

create index if not exists workspace_attribution_policy_status_idx
  on public.workspace_attribution_policy (workspace_id, status);

create table if not exists public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  commission_event_id text not null,
  policy_id uuid references public.workspace_attribution_policy(id) on delete set null,
  journey_attribution_credit_id uuid not null,
  journey_id uuid not null,
  person_id uuid not null,
  conversion_event_id uuid not null,
  touchpoint_event_id uuid,
  conversion_event_time timestamptz not null,
  touchpoint_event_time timestamptz,
  affiliate_id text not null,
  publisher_id text,
  offer_id text,
  campaign_id text,
  touchpoint_source text,
  touchpoint_medium text,
  model text not null,
  model_version text not null,
  credit_fraction numeric(18,6) not null default 0,
  credit_percent numeric(18,4) not null default 0,
  credit_amount numeric,
  attributed_amount numeric,
  currency text,
  commission_rate numeric(18,6) not null default 0,
  commission_amount numeric not null default 0,
  status text not null default 'draft',
  source text not null default 'payout_engine_v1',
  source_credit_created_at timestamptz,
  generated_at timestamptz not null default now(),
  policy_snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.affiliate_commissions
  add column if not exists publisher_id text,
  add column if not exists credit_amount numeric,
  add column if not exists generated_at timestamptz default now(),
  add column if not exists policy_snapshot jsonb default '{}'::jsonb;

do $$
begin
  alter table public.affiliate_commissions
    drop constraint if exists affiliate_commissions_model_check;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.affiliate_commissions'::regclass
      and conname = 'affiliate_commissions_model_check'
  ) then
    alter table public.affiliate_commissions
      add constraint affiliate_commissions_model_check
      check (model in ('first_touch', 'last_touch', 'linear', 'position_based')) not valid;
  end if;

  alter table public.affiliate_commissions
    drop constraint if exists affiliate_commissions_status_check;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.affiliate_commissions'::regclass
      and conname = 'affiliate_commissions_status_check'
  ) then
    alter table public.affiliate_commissions
      add constraint affiliate_commissions_status_check
      check (status in ('draft', 'pending', 'approved', 'exported', 'paid', 'held', 'voided')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.affiliate_commissions'::regclass
      and conname = 'affiliate_commissions_rate_check'
  ) then
    alter table public.affiliate_commissions
      add constraint affiliate_commissions_rate_check
      check (commission_rate >= 0 and commission_rate <= 1) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.affiliate_commissions'::regclass
      and conname = 'affiliate_commissions_currency_check'
  ) then
    alter table public.affiliate_commissions
      add constraint affiliate_commissions_currency_check
      check (currency is null or currency ~ '^[A-Z]{3}$') not valid;
  end if;
end $$;

create unique index if not exists affiliate_commissions_event_uidx
  on public.affiliate_commissions (workspace_id, commission_event_id);

create unique index if not exists affiliate_commissions_conversion_uidx
  on public.affiliate_commissions (workspace_id, conversion_event_id);

create index if not exists affiliate_commissions_workspace_status_idx
  on public.affiliate_commissions (workspace_id, status, created_at, id);

create index if not exists affiliate_commissions_affiliate_idx
  on public.affiliate_commissions (workspace_id, affiliate_id, status, conversion_event_time, id);

create index if not exists affiliate_commissions_conversion_idx
  on public.affiliate_commissions (workspace_id, conversion_event_id, model, model_version);

create index if not exists journey_attribution_credits_payout_idx
  on public.journey_attribution_credits (workspace_id, model, model_version, conversion_event_time, id)
  where status = 'attributed' and affiliate_id is not null;

comment on table public.workspace_attribution_policy is
  'Operational payout policy selecting which immutable attribution model powers downstream payable commissions.';

comment on table public.affiliate_commissions is
  'Payout Engine ledger of payable affiliate commissions generated downstream from immutable journey_attribution_credits.';

comment on column public.affiliate_commissions.journey_attribution_credit_id is
  'Immutable Attribution Engine result consumed by the Payout Engine; stored without a restrictive foreign key so payout rows never change Attribution Engine behavior.';
