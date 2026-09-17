-- Provider-observed refund.created state. No financial posting occurs in this migration.
create table public.commerce_refund_created_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  account_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  provider_event_id text not null,
  provider_refund_hashid text not null,
  original_payment_id text,
  refund_transaction_hashid text,
  canonical_order_id uuid,
  order_match_state text not null check(order_match_state in ('exact_ord','legacy_unresolved','missing','malformed')),
  evidence_id uuid not null,
  payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'),
  status text not null check(status in ('success','pending','failed')),
  refund_type text check(refund_type is null or refund_type in ('full','partial')),
  buyer_amount numeric not null check(buyer_amount >= 0),
  seller_refund_cost numeric not null check(seller_refund_cost >= 0),
  creator_amount numeric not null check(creator_amount >= 0),
  processor_fee numeric,
  affiliate_clawback numeric,
  currency text not null default 'USD' check(currency='USD'),
  provider_created_at timestamptz,
  provider_updated_at timestamptz,
  financial_state text not null check(financial_state in ('eligible_not_yet_enabled','provider_settlement_unobservable','failed_no_economics','identity_unresolved','provider_contract_conflict','posted')),
  financial_policy_version text not null default 'commas-refund-created-seller-cost-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,connection_id,provider_account_id,provider_event_id),
  unique(organization_id,connection_id,provider_account_id,provider_refund_hashid),
  foreign key (organization_id,account_id) references public.tracekit_organizations(id,owning_account_id),
  foreign key (organization_id,connection_id,provider_account_id) references public.commerce_provider_accounts(organization_id,connection_id,id),
  foreign key (organization_id,evidence_id) references public.commerce_evidence_records(organization_id,id),
  foreign key (organization_id,canonical_order_id) references public.platform_orders(organization_id,canonical_order_id)
);
create index commerce_refund_created_observations_order_idx on public.commerce_refund_created_observations(organization_id,canonical_order_id,provider_created_at);
create index commerce_refund_created_observations_pending_idx on public.commerce_refund_created_observations(organization_id,connection_id,provider_account_id,status) where status='pending';
create or replace view public.commerce_refund_created_pending_diagnostics with (security_invoker=true) as
select organization_id,connection_id,provider_account_id,
       count(*)::bigint as pending_unobservable_count,
       min(provider_created_at) as oldest_pending_created_at,
       coalesce(sum(buyer_amount),0) as pending_buyer_amount_usd,
       coalesce(sum(seller_refund_cost),0) as provisional_provider_refund_cost_usd
from public.commerce_refund_created_observations
where status='pending' and financial_state='provider_settlement_unobservable'
group by organization_id,connection_id,provider_account_id;
revoke all on public.commerce_refund_created_pending_diagnostics from public,anon,authenticated,authenticator;
grant select on public.commerce_refund_created_pending_diagnostics to service_role;
alter table public.commerce_refund_created_observations enable row level security;
revoke all on public.commerce_refund_created_observations from public,anon,authenticated,authenticator;
grant select,insert,update on public.commerce_refund_created_observations to service_role;

create or replace function public.resolve_commas_refund_created_order_v1(
 p_organization_id uuid,p_connection_id uuid,p_provider_account_id uuid,p_original_payment_id text
) returns table(canonical_order_id uuid,match_state text)
language plpgsql security invoker stable set search_path=public,pg_temp as $$
declare v_count integer; v_order uuid;
begin
 if p_original_payment_id is null or btrim(p_original_payment_id)='' then return query select null::uuid,'missing'::text; return; end if;
 if p_original_payment_id !~ '^ORD-[A-Za-z0-9_-]{1,120}$' then return query select null::uuid,'legacy_unresolved'::text; return; end if;
 select count(*),min(canonical_object_id) into v_count,v_order
 from public.commerce_source_mappings
 where organization_id=p_organization_id and connection_id=p_connection_id and provider_account_id=p_provider_account_id
   and source_object_type='commas_public_transaction' and source_object_id=p_original_payment_id
   and canonical_object_type='order' and state='active';
 if v_count=1 then return query select v_order,'exact_ord'::text;
 elsif v_count=0 then return query select null::uuid,'malformed'::text;
 else raise exception 'ambiguous Commas public transaction mapping'; end if;
end $$;
revoke all on function public.resolve_commas_refund_created_order_v1(uuid,uuid,uuid,text) from public,anon,authenticated,authenticator;
grant execute on function public.resolve_commas_refund_created_order_v1(uuid,uuid,uuid,text) to service_role;

comment on table public.commerce_refund_created_observations is 'Restricted normalized state for Commas refund.created. Pending/failed rows never imply realized seller economics.';
