begin;

create table public.marketing_reporting_evidence (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  provider text not null,
  report_date date not null,
  entity_type text not null,
  provider_entity_id text not null,
  observation_hash text not null,
  raw_payload jsonb not null,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (organization_id,account_id) references public.tracekit_organizations(id,owning_account_id),
  foreign key (organization_id,connection_id) references public.marketing_provider_connections(organization_id,id),
  foreign key (organization_id,connection_id,provider_account_id) references public.marketing_provider_accounts(organization_id,connection_id,id),
  check (provider ~ '^[a-z][a-z0-9_]*$'),
  check (entity_type in ('campaign_daily')),
  check (nullif(btrim(provider_entity_id),'') is not null),
  check (observation_hash ~ '^[a-f0-9]{64}$'),
  check (public.financial_reconciliation_metadata_is_safe(raw_payload)),
  unique (organization_id,connection_id,provider_account_id,entity_type,provider_entity_id,report_date,observation_hash)
);

create table public.marketing_campaign_daily_facts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  provider text not null,
  report_date date not null,
  provider_campaign_id text not null,
  campaign_name text,
  campaign_status text,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  cost_micros bigint not null default 0,
  conversions numeric not null default 0,
  conversion_value numeric not null default 0,
  currency text,
  source_evidence_id uuid not null,
  source_observation_hash text not null,
  first_observed_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id,account_id) references public.tracekit_organizations(id,owning_account_id),
  foreign key (organization_id,connection_id) references public.marketing_provider_connections(organization_id,id),
  foreign key (organization_id,connection_id,provider_account_id) references public.marketing_provider_accounts(organization_id,connection_id,id),
  foreign key (source_evidence_id) references public.marketing_reporting_evidence(id) on delete restrict,
  check (provider ~ '^[a-z][a-z0-9_]*$'),
  check (nullif(btrim(provider_campaign_id),'') is not null),
  check (impressions >= 0 and clicks >= 0 and cost_micros >= 0),
  check (currency is null or currency ~ '^[A-Z]{3}$'),
  check (source_observation_hash ~ '^[a-f0-9]{64}$'),
  unique (organization_id,connection_id,provider_account_id,provider_campaign_id,report_date)
);

create index marketing_reporting_evidence_lookup_idx on public.marketing_reporting_evidence(organization_id,provider_account_id,report_date desc,provider_entity_id);
create index marketing_campaign_daily_facts_lookup_idx on public.marketing_campaign_daily_facts(organization_id,provider_account_id,report_date desc,provider_campaign_id);

alter table public.marketing_reporting_evidence enable row level security;
alter table public.marketing_campaign_daily_facts enable row level security;
revoke all on table public.marketing_reporting_evidence from public,anon,authenticated;
revoke all on table public.marketing_campaign_daily_facts from public,anon,authenticated;

comment on table public.marketing_reporting_evidence is 'Immutable paid-media provider reporting observations. Provider revisions create new evidence versions rather than overwriting source evidence.';
comment on table public.marketing_campaign_daily_facts is 'Current normalized campaign/day paid-media facts linked to immutable provider evidence.';

commit;
