-- TraceKit Setup Wizard state.
--
-- This table is intentionally small and workspace-scoped. It persists
-- onboarding progress and setup metadata without introducing a second
-- business workspace model or changing browser, identity, journey,
-- attribution, or payout engine behavior.

create table if not exists public.workspace_onboarding (
  workspace_id text primary key,
  workspace_name text,
  primary_website_url text,
  default_timezone text not null default 'UTC',
  default_currency text not null default 'USD',
  current_step text not null default 'workspace',
  completed_steps text[] not null default '{}'::text[],
  dismissed_warnings text[] not null default '{}'::text[],
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workspace_onboarding
  add column if not exists workspace_name text,
  add column if not exists primary_website_url text,
  add column if not exists default_timezone text not null default 'UTC',
  add column if not exists default_currency text not null default 'USD',
  add column if not exists current_step text not null default 'workspace',
  add column if not exists completed_steps text[] not null default '{}'::text[],
  add column if not exists dismissed_warnings text[] not null default '{}'::text[],
  add column if not exists completed_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.workspace_onboarding'::regclass
      and conname = 'workspace_onboarding_workspace_id_check'
  ) then
    alter table public.workspace_onboarding
      add constraint workspace_onboarding_workspace_id_check
      check (length(btrim(workspace_id)) > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.workspace_onboarding'::regclass
      and conname = 'workspace_onboarding_currency_check'
  ) then
    alter table public.workspace_onboarding
      add constraint workspace_onboarding_currency_check
      check (default_currency ~ '^[A-Z]{3}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.workspace_onboarding'::regclass
      and conname = 'workspace_onboarding_current_step_check'
  ) then
    alter table public.workspace_onboarding
      add constraint workspace_onboarding_current_step_check
      check (current_step in (
        'workspace',
        'browser_tracking',
        'test_installation',
        'attribution',
        'payout_validation',
        'completion'
      ));
  end if;
end $$;

create index if not exists workspace_onboarding_updated_idx
  on public.workspace_onboarding (updated_at desc);

comment on table public.workspace_onboarding is
  'Workspace-scoped TraceKit setup wizard progress and setup metadata.';
