-- Canonical product economics for the bounded Push Button System checkout
-- cohort. Provider transaction truth remains in platform_orders and the
-- provider mirror remains in commerce_order_lines.

begin;

create table public.commerce_order_economic_lines (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  canonical_order_id uuid not null,
  platform_order_id text not null,
  source_provider_product_id uuid not null,
  business_context_id text not null,
  canonical_offer_id uuid not null,
  offer_step_id uuid not null,
  offer_variant_id uuid,
  allocation_policy_version text not null,
  allocation_line_key text not null,
  line_sequence integer not null,
  allocated_gross_amount numeric(20,2) not null,
  currency text not null,
  original_transaction_gross_amount numeric(20,2) not null,
  evidence_id uuid,
  provenance text not null,
  inference_basis text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_order_economic_lines_account_fk
    foreign key (organization_id, account_id)
    references public.tracekit_organizations (id, owning_account_id),
  constraint commerce_order_economic_lines_provider_scope_fk
    foreign key (organization_id, connection_id, provider_account_id)
    references public.commerce_provider_accounts (organization_id, connection_id, id),
  constraint commerce_order_economic_lines_order_scope_fk
    foreign key (organization_id, canonical_order_id)
    references public.platform_orders (organization_id, canonical_order_id),
  constraint commerce_order_economic_lines_product_scope_fk
    foreign key (organization_id, source_provider_product_id)
    references public.commerce_provider_products (organization_id, id),
  constraint commerce_order_economic_lines_offer_fk
    foreign key (organization_id, business_context_id, canonical_offer_id)
    references public.canonical_offers (organization_id, business_context_id, id),
  constraint commerce_order_economic_lines_step_fk
    foreign key (organization_id, canonical_offer_id, offer_step_id)
    references public.offer_steps (organization_id, canonical_offer_id, id),
  constraint commerce_order_economic_lines_variant_fk
    foreign key (organization_id, offer_step_id, offer_variant_id)
    references public.offer_variants (organization_id, offer_step_id, id),
  constraint commerce_order_economic_lines_evidence_fk
    foreign key (organization_id, evidence_id)
    references public.commerce_evidence_records (organization_id, id),
  constraint commerce_order_economic_lines_provenance_check
    check (provenance in ('provider_explicit','inferred')),
  constraint commerce_order_economic_lines_sequence_check check (line_sequence >= 0),
  constraint commerce_order_economic_lines_amount_check
    check (allocated_gross_amount >= 0 and original_transaction_gross_amount >= 0),
  constraint commerce_order_economic_lines_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint commerce_order_economic_lines_policy_check
    check (allocation_policy_version ~ '^[a-z0-9][a-z0-9._-]{0,127}$'),
  constraint commerce_order_economic_lines_key_check
    check (allocation_line_key ~ '^[a-z0-9][a-z0-9:._-]{0,255}$'),
  constraint commerce_order_economic_lines_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(metadata)),
  unique (connection_id, provider_account_id, canonical_order_id,
          allocation_policy_version, offer_step_id, line_sequence),
  unique (connection_id, provider_account_id, canonical_order_id,
          allocation_policy_version, allocation_line_key)
);

create index commerce_order_economic_lines_order_idx
  on public.commerce_order_economic_lines (organization_id, canonical_order_id);
create index commerce_order_economic_lines_product_revenue_idx
  on public.commerce_order_economic_lines
  (organization_id, business_context_id, canonical_offer_id, offer_step_id, currency);

alter table public.commerce_order_economic_lines enable row level security;
revoke all on public.commerce_order_economic_lines from public, anon, authenticated, authenticator;
grant select, insert, update, delete on public.commerce_order_economic_lines to service_role;

comment on table public.commerce_order_economic_lines is
  'Server-only canonical economic allocation projection. Never provider transaction or company revenue truth.';

create or replace function public.compute_commas_pbs_order_economic_lines_v1(
  p_provider text,
  p_organization_id uuid,
  p_connection_id uuid,
  p_provider_account_id uuid,
  p_provider_product_external_id text,
  p_mapping_status text,
  p_business_context_id text,
  p_canonical_offer_id uuid,
  p_offer_step_id uuid,
  p_order_status text,
  p_order_status_norm text,
  p_gross_amount numeric,
  p_currency text
)
returns table (
  offer_step_id uuid,
  line_sequence integer,
  allocated_gross_amount numeric,
  allocation_line_key text,
  inference_basis text
)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_front constant uuid := '8110e951-8ca6-406a-8817-55575fe647ba'::uuid;
  v_revenue_booster constant uuid := 'a5d6d601-790d-4b7c-97f3-a9f833465ef5'::uuid;
  v_fast_track constant uuid := '2fa222b9-1325-4cd5-b712-03313f093057'::uuid;
  v_total numeric := round(coalesce(p_gross_amount, -1), 2);
begin
  if p_provider <> 'commas'
    or p_organization_id <> '5f1de64a-1b37-40bb-81c8-32197eda0b41'::uuid
    or p_connection_id <> 'ea1c2313-6120-4692-84c5-ec3562e7dcf6'::uuid
    or p_provider_account_id <> '0369c701-717f-4c34-b230-8341bcdb7e65'::uuid
    or p_provider_product_external_id not in ('0E1ML','4KV26','6GO2R','Jz71g','KE1Ox','rVWgL','xz1kz')
    or p_mapping_status <> 'approved'
    or p_business_context_id <> 'push-button-system-5f1de64a'
    or p_canonical_offer_id <> 'b842611c-9918-40ac-9241-d542a8c6f8b4'::uuid
    or p_offer_step_id <> v_front
    or upper(coalesce(p_currency,'')) <> 'USD'
    or coalesce(p_order_status,'') <> 'observed'
    or coalesce(p_order_status_norm,'') <> 'observed'
    or v_total not in (67,92,106,131)
  then return; end if;

  return query select v_front,0,67::numeric,'step:front-end',format('matched_gross:%s',v_total);
  if v_total in (92,131) then
    return query select v_revenue_booster,1,25::numeric,'step:revenue-booster-roadmap',format('matched_gross:%s',v_total);
  end if;
  if v_total in (106,131) then
    return query select v_fast_track,case when v_total=131 then 2 else 1 end,39::numeric,'step:fast-track-support',format('matched_gross:%s',v_total);
  end if;
end $$;

revoke all on function public.compute_commas_pbs_order_economic_lines_v1(text,uuid,uuid,uuid,text,text,text,uuid,uuid,text,text,numeric,text) from public, anon, authenticated, authenticator;
grant execute on function public.compute_commas_pbs_order_economic_lines_v1(text,uuid,uuid,uuid,text,text,text,uuid,uuid,text,text,numeric,text) to service_role;

create or replace function public.reconcile_commas_order_economic_allocation_v1(
  p_organization_id uuid,
  p_connection_id uuid,
  p_provider_account_id uuid,
  p_canonical_order_id uuid,
  p_dry_run boolean default false
)
returns table(status text, lines integer, original_gross numeric, allocated_gross numeric)
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_order public.platform_orders%rowtype;
  v_product public.commerce_provider_products%rowtype;
  v_count integer;
  v_allocated numeric;
  v_lines jsonb;
  v_effective_currency text;
  v_currency_basis text;
  v_policy constant text := 'commas-pbs-order-bump-allocation-v1';
begin
  select * into v_order from public.platform_orders
  where organization_id=p_organization_id and connection_id=p_connection_id
    and provider_account_id=p_provider_account_id and canonical_order_id=p_canonical_order_id
  for update;
  if not found then return query select 'not_found',0,null::numeric,0::numeric; return; end if;

  select * into v_product from public.commerce_provider_products
  where organization_id=p_organization_id and connection_id=p_connection_id
    and provider_account_id=p_provider_account_id and id=v_order.provider_product_id;
  if not found then return query select 'not_applicable',0,v_order.gross_amount,0::numeric; return; end if;

  -- Commas does not currently expose currency in the retained transaction
  -- contract. USD is operator-authorized only for this exact production scope
  -- and current-cohort provider identity; it is never written back to the
  -- provider-authoritative platform order.
  if upper(coalesce(v_order.currency,''))='USD' then
    v_effective_currency:='USD'; v_currency_basis:='provider_observed';
  elsif v_order.currency is null
    and p_organization_id='5f1de64a-1b37-40bb-81c8-32197eda0b41'::uuid
    and p_connection_id='ea1c2313-6120-4692-84c5-ec3562e7dcf6'::uuid
    and p_provider_account_id='0369c701-717f-4c34-b230-8341bcdb7e65'::uuid
    and v_product.provider_product_id in ('0E1ML','4KV26','6GO2R','Jz71g','KE1Ox','rVWgL','xz1kz')
  then
    v_effective_currency:='USD'; v_currency_basis:='operator_authorized_policy';
  else
    v_effective_currency:=v_order.currency; v_currency_basis:='unsupported';
  end if;

  select coalesce(jsonb_agg(to_jsonb(l) order by l.line_sequence),'[]'::jsonb)
  into v_lines
  from public.compute_commas_pbs_order_economic_lines_v1(
    v_order.platform,p_organization_id,p_connection_id,p_provider_account_id,
    v_product.provider_product_id,v_product.mapping_status,v_product.business_context_id,
    v_product.canonical_offer_id,v_product.offer_step_id,v_order.status,v_order.status_norm,
    v_order.gross_amount,v_effective_currency) l;
  select count(*),coalesce(sum(allocated_gross_amount),0) into v_count,v_allocated
  from jsonb_to_recordset(v_lines) as l(offer_step_id uuid,line_sequence integer,
    allocated_gross_amount numeric,allocation_line_key text,inference_basis text);
  if v_count=0 then
    if not p_dry_run then
      delete from public.commerce_order_economic_lines e
      where e.organization_id=p_organization_id and e.connection_id=p_connection_id
        and e.provider_account_id=p_provider_account_id and e.canonical_order_id=p_canonical_order_id
        and e.allocation_policy_version=v_policy;
    end if;
    return query select case when p_dry_run then 'not_applicable' else 'cleared' end,0,v_order.gross_amount,0::numeric;
    return;
  end if;
  if round(v_allocated,2) <> round(v_order.gross_amount,2) then
    return query select 'conservation_failure',v_count,v_order.gross_amount,v_allocated; return;
  end if;
  if p_dry_run then return query select 'eligible',v_count,v_order.gross_amount,v_allocated; return; end if;

  delete from public.commerce_order_economic_lines e
  where e.organization_id=p_organization_id and e.connection_id=p_connection_id
    and e.provider_account_id=p_provider_account_id and e.canonical_order_id=p_canonical_order_id
    and e.allocation_policy_version=v_policy
    and not exists (select 1 from jsonb_to_recordset(v_lines) as l(
      offer_step_id uuid,line_sequence integer,allocated_gross_amount numeric,
      allocation_line_key text,inference_basis text)
      where l.offer_step_id=e.offer_step_id and l.line_sequence=e.line_sequence);

  insert into public.commerce_order_economic_lines
    (account_id,organization_id,connection_id,provider_account_id,canonical_order_id,platform_order_id,
     source_provider_product_id,business_context_id,canonical_offer_id,offer_step_id,offer_variant_id,
     allocation_policy_version,allocation_line_key,line_sequence,allocated_gross_amount,currency,
     original_transaction_gross_amount,evidence_id,provenance,inference_basis,metadata)
  select v_order.account_id,p_organization_id,p_connection_id,p_provider_account_id,v_order.canonical_order_id,
    v_order.platform_order_id,v_product.id,v_product.business_context_id,v_product.canonical_offer_id,
    l.offer_step_id,null,v_policy,l.allocation_line_key,l.line_sequence,l.allocated_gross_amount,'USD',
    v_order.gross_amount,v_order.evidence_id,'inferred',l.inference_basis,
    jsonb_build_object('allocation_source','deterministic_checkout_decomposition',
      'allocation_policy_version',v_policy,'provider_transaction_id',v_order.provider_order_id,
      'source_provider_product_id',v_product.provider_product_id,'matched_gross',v_order.gross_amount,
      'canonical_step_id',l.offer_step_id,'provider_explicit',false,
      'currency_basis',v_currency_basis,'source_currency',v_order.currency)
  from jsonb_to_recordset(v_lines) as l(offer_step_id uuid,line_sequence integer,
    allocated_gross_amount numeric,allocation_line_key text,inference_basis text)
  on conflict (connection_id,provider_account_id,canonical_order_id,allocation_policy_version,offer_step_id,line_sequence)
  do update set allocated_gross_amount=excluded.allocated_gross_amount,currency=excluded.currency,
    original_transaction_gross_amount=excluded.original_transaction_gross_amount,
    evidence_id=excluded.evidence_id,inference_basis=excluded.inference_basis,
    metadata=excluded.metadata,updated_at=now();

  return query select 'allocated',v_count,v_order.gross_amount,v_allocated;
end $$;

revoke all on function public.reconcile_commas_order_economic_allocation_v1(uuid,uuid,uuid,uuid,boolean) from public, anon, authenticated, authenticator;
grant execute on function public.reconcile_commas_order_economic_allocation_v1(uuid,uuid,uuid,uuid,boolean) to service_role;

create or replace function public.reconcile_commas_order_economic_allocation_batch_v1(
  p_organization_id uuid,
  p_connection_id uuid,
  p_provider_account_id uuid,
  p_canonical_order_ids jsonb
)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare r record; x record; v_seen integer:=0; v_allocated integer:=0;
  v_skipped integer:=0; v_failed integer:=0;
begin
  if jsonb_typeof(p_canonical_order_ids) <> 'array'
    or jsonb_array_length(p_canonical_order_ids) > 100 then
    raise exception 'canonical order ids must be an array of at most 100';
  end if;
  for r in select distinct value::uuid canonical_order_id
    from jsonb_array_elements_text(p_canonical_order_ids)
  loop
    v_seen:=v_seen+1;
    select * into x from public.reconcile_commas_order_economic_allocation_v1(
      p_organization_id,p_connection_id,p_provider_account_id,r.canonical_order_id,false);
    if x.status='allocated' then v_allocated:=v_allocated+1;
    elsif x.status='conservation_failure' then v_failed:=v_failed+1;
    else v_skipped:=v_skipped+1; end if;
  end loop;
  return jsonb_build_object('orders_seen',v_seen,'allocated_orders',v_allocated,
    'skipped_orders',v_skipped,'conservation_failures',v_failed);
end $$;

revoke all on function public.reconcile_commas_order_economic_allocation_batch_v1(uuid,uuid,uuid,jsonb) from public, anon, authenticated, authenticator;
grant execute on function public.reconcile_commas_order_economic_allocation_batch_v1(uuid,uuid,uuid,jsonb) to service_role;

create or replace function public.backfill_commas_order_economic_allocations_v1(
  p_organization_id uuid,
  p_connection_id uuid,
  p_provider_account_id uuid,
  p_after_canonical_order_id uuid default null,
  p_batch_size integer default 100,
  p_dry_run boolean default true
)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare r record; x record; v_seen integer:=0; v_eligible integer:=0; v_allocated integer:=0;
  v_skipped integer:=0; v_failed integer:=0; v_original numeric:=0; v_economic numeric:=0;
  v_front numeric:=0; v_booster numeric:=0; v_fast numeric:=0; v_last uuid;
begin
  if p_batch_size < 1 or p_batch_size > 500 then raise exception 'batch size must be between 1 and 500'; end if;
  for r in select canonical_order_id from public.platform_orders
    where organization_id=p_organization_id and connection_id=p_connection_id
      and provider_account_id=p_provider_account_id
      and (p_after_canonical_order_id is null or canonical_order_id > p_after_canonical_order_id)
    order by canonical_order_id limit p_batch_size
  loop
    v_seen:=v_seen+1; v_last:=r.canonical_order_id;
    select * into x from public.reconcile_commas_order_economic_allocation_v1(
      p_organization_id,p_connection_id,p_provider_account_id,r.canonical_order_id,p_dry_run);
    if x.status in ('eligible','allocated') then
      v_eligible:=v_eligible+1; if x.status='allocated' then v_allocated:=v_allocated+1; end if;
      v_original:=v_original+x.original_gross; v_economic:=v_economic+x.allocated_gross;
      if x.original_gross in (67,92,106,131) then v_front:=v_front+67; end if;
      if x.original_gross in (92,131) then v_booster:=v_booster+25; end if;
      if x.original_gross in (106,131) then v_fast:=v_fast+39; end if;
    elsif x.status='conservation_failure' then v_failed:=v_failed+1;
    else v_skipped:=v_skipped+1; end if;
  end loop;
  return jsonb_build_object('orders_scanned',v_seen,'eligible_orders',v_eligible,
    'allocated_orders',v_allocated,'skipped_orders',v_skipped,'conservation_failures',v_failed,
    'original_provider_gross',v_original,'allocated_gross',v_economic,'difference',v_original-v_economic,
    'amount_by_step',jsonb_build_object('front_end',v_front,'revenue_booster',v_booster,'fast_track',v_fast),
    'next_cursor',v_last,'dry_run',p_dry_run);
end $$;

revoke all on function public.backfill_commas_order_economic_allocations_v1(uuid,uuid,uuid,uuid,integer,boolean) from public, anon, authenticated, authenticator;
grant execute on function public.backfill_commas_order_economic_allocations_v1(uuid,uuid,uuid,uuid,integer,boolean) to service_role;

create or replace view public.commerce_canonical_product_revenue_v1
with (security_invoker = true) as
with valid_allocations as (
  select e.organization_id,e.connection_id,e.provider_account_id,e.canonical_order_id,
    e.allocation_policy_version
  from public.commerce_order_economic_lines e
  join public.platform_orders o on o.organization_id=e.organization_id
    and o.connection_id=e.connection_id and o.provider_account_id=e.provider_account_id
    and o.canonical_order_id=e.canonical_order_id
  group by e.organization_id,e.connection_id,e.provider_account_id,e.canonical_order_id,
    e.allocation_policy_version,o.gross_amount
  having round(sum(e.allocated_gross_amount),2)=round(o.gross_amount,2)
)
select e.organization_id,e.connection_id,e.provider_account_id,e.canonical_order_id,
  e.platform_order_id,e.business_context_id,e.canonical_offer_id,e.offer_step_id,e.offer_variant_id,
  e.allocated_gross_amount as product_gross_amount,e.currency,'economic_allocation'::text revenue_source,
  e.allocation_policy_version,e.provenance
from public.commerce_order_economic_lines e
join valid_allocations a on a.organization_id=e.organization_id and a.connection_id=e.connection_id
 and a.provider_account_id=e.provider_account_id and a.canonical_order_id=e.canonical_order_id
 and a.allocation_policy_version=e.allocation_policy_version
union all
select o.organization_id,o.connection_id,o.provider_account_id,o.canonical_order_id,o.platform_order_id,
  p.business_context_id,p.canonical_offer_id,p.offer_step_id,p.offer_variant_id,
  o.gross_amount,o.currency,'provider_product_fallback'::text,null::text,'provider_explicit'::text
from public.platform_orders o
join public.commerce_provider_products p on p.organization_id=o.organization_id
 and p.connection_id=o.connection_id and p.provider_account_id=o.provider_account_id
 and p.id=o.provider_product_id and p.mapping_status='approved'
where not exists (
  select 1 from valid_allocations a
  where a.organization_id=o.organization_id and a.connection_id=o.connection_id
    and a.provider_account_id=o.provider_account_id and a.canonical_order_id=o.canonical_order_id
    and a.allocation_policy_version='commas-pbs-order-bump-allocation-v1'
);

revoke all on public.commerce_canonical_product_revenue_v1 from public, anon, authenticated, authenticator;
grant select on public.commerce_canonical_product_revenue_v1 to service_role;
comment on view public.commerce_canonical_product_revenue_v1 is
  'Canonical product revenue only. Never combine with platform_orders to calculate company/order revenue.';

commit;
