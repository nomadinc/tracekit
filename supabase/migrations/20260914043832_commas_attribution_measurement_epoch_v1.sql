-- Reporting metadata only. Neither table is attribution source truth.
create table public.commerce_attribution_measurement_epochs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  provider text not null check (provider='commas'),
  provider_subscription_id text not null,
  begins_at timestamptz not null,
  source_kind text not null check (source_kind='first_verified_post_cutover_delivery'),
  source_evidence_id uuid not null,
  recorded_by text not null,
  recorded_at timestamptz not null default now(),
  unique (organization_id,connection_id,provider_account_id,provider),
  foreign key (organization_id,connection_id,provider_account_id)
    references public.commerce_provider_accounts(organization_id,connection_id,id),
  foreign key (organization_id,source_evidence_id)
    references public.commerce_evidence_records(organization_id,id)
);

create table public.commerce_attribution_healthy_day_certifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  provider text not null check (provider='commas'),
  measurement_day date not null,
  endpoint_healthy boolean not null,
  provider_transaction_parity boolean not null,
  ingestion_current boolean not null,
  ord_projection_healthy boolean not null,
  journey_projection_healthy boolean not null,
  firewall_intact boolean not null,
  evidence_references jsonb not null check (jsonb_typeof(evidence_references)='object'),
  certified_by text not null,
  certified_at timestamptz not null default now(),
  unique (organization_id,connection_id,provider_account_id,provider,measurement_day),
  check (endpoint_healthy and provider_transaction_parity and ingestion_current
    and ord_projection_healthy and journey_projection_healthy and firewall_intact),
  foreign key (organization_id,connection_id,provider_account_id)
    references public.commerce_provider_accounts(organization_id,connection_id,id)
);

create or replace function public.commerce_attribution_reporting_immutable_guard()
returns trigger language plpgsql as $$ begin
  raise exception 'attribution reporting certification is append-only' using errcode='55000';
end $$;
create trigger commerce_attribution_measurement_epochs_immutable
  before update or delete on public.commerce_attribution_measurement_epochs
  for each row execute function public.commerce_attribution_reporting_immutable_guard();
create trigger commerce_attribution_healthy_day_certifications_immutable
  before update or delete on public.commerce_attribution_healthy_day_certifications
  for each row execute function public.commerce_attribution_reporting_immutable_guard();

alter table public.commerce_attribution_measurement_epochs enable row level security;
alter table public.commerce_attribution_healthy_day_certifications enable row level security;
revoke all on public.commerce_attribution_measurement_epochs,public.commerce_attribution_healthy_day_certifications
  from public,anon,authenticated,authenticator,service_role;
grant select,insert on public.commerce_attribution_measurement_epochs,public.commerce_attribution_healthy_day_certifications to service_role;
revoke all on function public.commerce_attribution_reporting_immutable_guard() from public,anon,authenticated;

-- This exact instant is derived from the first restricted v2 Evidence delivery,
-- after provider inspection established that 25365 was the sole TraceKit subscription.
-- It is a conservative measurement start, not the deletion timestamp or attribution truth.
insert into public.commerce_attribution_measurement_epochs
  (organization_id,connection_id,provider_account_id,provider,provider_subscription_id,begins_at,
   source_kind,source_evidence_id,recorded_by)
select o.organization_id,o.connection_id,o.provider_account_id,'commas','25365',d.observed_at,
  'first_verified_post_cutover_delivery',e.id,'migration:20260914034700'
from public.commerce_provider_attribution_observations o
join public.commerce_evidence_records e on e.id=o.evidence_id and e.organization_id=o.organization_id
join public.commerce_provider_attribution_webhook_deliveries d on d.evidence_id=e.id
  and d.organization_id=o.organization_id and d.connection_id=o.connection_id
  and d.provider_account_id=o.provider_account_id and d.provider_event_id=o.provider_event_id
where o.organization_id='5f1de64a-1b37-40bb-81c8-32197eda0b41'
  and o.connection_id='ea1c2313-6120-4692-84c5-ec3562e7dcf6'
  and o.provider_account_id='0369c701-717f-4c34-b230-8341bcdb7e65'
  and o.provider='commas' and o.provider_event_type='product.purchased'
  and e.source_object_type='commas_attribution_webhook'
  and e.pii_classification='restricted' and e.normalizer_version='commas-provider-attribution-v2'
order by d.observed_at,d.id limit 1
on conflict (organization_id,connection_id,provider_account_id,provider) do nothing;
