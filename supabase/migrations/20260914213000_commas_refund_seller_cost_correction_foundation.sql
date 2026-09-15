-- Commas refund seller-cost correction v1.
-- Provider-confirmed semantics: refund_cost is the total seller economic loss;
-- legacy TraceKit posted amount + fee. Corrections are append-only positive adjustments.
create table public.commerce_refund_correction_manifests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  policy_version text not null check (policy_version = 'commas-refund-seller-cost-correction-v1'),
  source_refund_count integer not null,
  source_legacy_loss numeric not null,
  source_provider_refund_cost numeric not null,
  correction_total numeric not null,
  source_fingerprint text not null,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  unique(organization_id,connection_id,provider_account_id,policy_version,source_fingerprint),
  foreign key (organization_id,connection_id,provider_account_id)
    references public.commerce_provider_accounts(organization_id,connection_id,id)
);

create table public.commerce_refund_correction_manifest_rows (
  manifest_id uuid not null references public.commerce_refund_correction_manifests(id),
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  provider_refund_id text not null,
  canonical_order_id uuid not null,
  evidence_id uuid not null,
  source_mapping_id uuid not null,
  legacy_refund_event_id uuid not null,
  legacy_refund_fee_event_id uuid,
  buyer_amount numeric not null,
  creator_amount numeric not null,
  processor_fee numeric not null,
  provider_refund_cost numeric not null,
  legacy_seller_loss numeric not null,
  correction_amount numeric not null check (correction_amount >= 0),
  occurred_at timestamptz not null,
  primary key(manifest_id,provider_refund_id),
  foreign key (organization_id,evidence_id) references public.commerce_evidence_records(organization_id,id),
  foreign key (organization_id,source_mapping_id) references public.commerce_source_mappings(organization_id,id),
  foreign key (organization_id,canonical_order_id) references public.platform_orders(organization_id,canonical_order_id)
);

alter table public.commerce_refund_correction_manifests enable row level security;
alter table public.commerce_refund_correction_manifest_rows enable row level security;
revoke all on public.commerce_refund_correction_manifests from public,anon,authenticated,authenticator;
revoke all on public.commerce_refund_correction_manifest_rows from public,anon,authenticated,authenticator;
grant select,insert,update on public.commerce_refund_correction_manifests to service_role;
grant select,insert on public.commerce_refund_correction_manifest_rows to service_role;

create or replace function public.preview_commas_refund_seller_cost_correction_v1(
  p_organization_id uuid,p_connection_id uuid,p_provider_account_id uuid
) returns table(refund_count bigint,equivalent_count bigint,overstated_count bigint,understated_count bigint,
  legacy_seller_loss numeric,provider_refund_cost numeric,correction_total numeric)
language sql security invoker set search_path=public,pg_temp as $$
with cohort as (
 select r.provider_refund_id,r.provider_refund_cost,
   abs(cr.amount)+coalesce(abs(cf.amount),0) legacy_loss
 from public.commerce_refund_events r
 join public.conversions cr on cr.organization_id=r.organization_id and cr.connection_id=r.connection_id
   and cr.provider_account_id=r.provider_account_id and cr.idempotency_key='refund:'||r.provider_refund_id
 left join public.conversions cf on cf.organization_id=r.organization_id and cf.connection_id=r.connection_id
   and cf.provider_account_id=r.provider_account_id and cf.idempotency_key='refund_fee:'||r.provider_refund_id
 where r.organization_id=p_organization_id and r.connection_id=p_connection_id and r.provider_account_id=p_provider_account_id
)
select count(*),count(*) filter(where round(legacy_loss,2)=round(provider_refund_cost,2)),
 count(*) filter(where legacy_loss>provider_refund_cost+0.004),count(*) filter(where legacy_loss<provider_refund_cost-0.004),
 round(sum(legacy_loss),2),round(sum(provider_refund_cost),2),round(sum(legacy_loss-provider_refund_cost),2)
from cohort;
$$;

revoke all on function public.preview_commas_refund_seller_cost_correction_v1(uuid,uuid,uuid) from public,anon,authenticated,authenticator;
grant execute on function public.preview_commas_refund_seller_cost_correction_v1(uuid,uuid,uuid) to service_role;

comment on table public.commerce_refund_correction_manifests is 'Frozen, audited manifests for provider-confirmed Commas refund seller-cost corrections.';
comment on column public.commerce_refund_correction_manifest_rows.correction_amount is 'Positive amount required to reverse legacy overstatement so seller refund economics equal refund_cost exactly once.';
