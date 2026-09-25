-- Immutable execution cohorts for bounded Commas economic-allocation backfills.
-- The manifest freezes allocation inputs; provider transaction truth remains in
-- platform_orders and commerce_order_lines.

begin;

create table public.commerce_economic_allocation_manifests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  allocation_policy_version text not null,
  status text not null default 'building',
  created_at timestamptz not null default now(),
  frozen_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  cohort_count integer not null default 0,
  provider_gross_total numeric(20,2) not null default 0,
  expected_allocated_gross_total numeric(20,2) not null default 0,
  expected_front_end_total numeric(20,2) not null default 0,
  expected_revenue_booster_total numeric(20,2) not null default 0,
  expected_fast_track_total numeric(20,2) not null default 0,
  expected_67_count integer not null default 0,
  expected_92_count integer not null default 0,
  expected_106_count integer not null default 0,
  expected_131_count integer not null default 0,
  cohort_fingerprint text,
  metadata jsonb not null default '{}'::jsonb,
  constraint commerce_economic_allocation_manifests_status_check
    check (status in ('building','frozen','writing','completed','failed')),
  constraint commerce_economic_allocation_manifests_policy_check
    check (allocation_policy_version ~ '^[a-z0-9][a-z0-9._-]{0,127}$'),
  constraint commerce_economic_allocation_manifests_counts_check
    check (cohort_count >= 0 and expected_67_count >= 0 and expected_92_count >= 0
      and expected_106_count >= 0 and expected_131_count >= 0),
  constraint commerce_economic_allocation_manifests_amounts_check
    check (provider_gross_total >= 0 and expected_allocated_gross_total >= 0
      and expected_front_end_total >= 0 and expected_revenue_booster_total >= 0
      and expected_fast_track_total >= 0),
  constraint commerce_economic_allocation_manifests_fingerprint_check
    check (cohort_fingerprint is null or cohort_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint commerce_economic_allocation_manifests_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(metadata)),
  constraint commerce_economic_allocation_manifests_account_fk
    foreign key (organization_id, account_id)
    references public.tracekit_organizations (id, owning_account_id),
  constraint commerce_economic_allocation_manifests_provider_scope_fk
    foreign key (organization_id, connection_id, provider_account_id)
    references public.commerce_provider_accounts (organization_id, connection_id, id),
  unique (id, organization_id, connection_id, provider_account_id)
);

create table public.commerce_economic_allocation_manifest_items (
  id uuid primary key default gen_random_uuid(),
  manifest_id uuid not null,
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  item_sequence bigint not null,
  canonical_order_id uuid not null,
  platform_order_id text not null,
  source_provider text not null,
  source_provider_product_id uuid not null,
  provider_product_external_id text not null,
  mapping_status text not null,
  mapping_version text not null,
  business_context_id text not null,
  canonical_offer_id uuid not null,
  offer_step_id uuid not null,
  offer_variant_id uuid,
  gross_amount numeric(20,2) not null,
  source_currency text,
  currency_basis text not null,
  order_status text not null,
  order_status_norm text not null,
  allocation_policy_version text not null,
  expected_allocated_gross_amount numeric(20,2) not null,
  expected_line_count integer not null,
  allocation_input_fingerprint text not null,
  created_at timestamptz not null default now(),
  constraint commerce_economic_allocation_manifest_items_manifest_fk
    foreign key (manifest_id, organization_id, connection_id, provider_account_id)
    references public.commerce_economic_allocation_manifests
      (id, organization_id, connection_id, provider_account_id),
  constraint commerce_economic_allocation_manifest_items_order_fk
    foreign key (organization_id, canonical_order_id)
    references public.platform_orders (organization_id, canonical_order_id),
  constraint commerce_economic_allocation_manifest_items_product_fk
    foreign key (organization_id, source_provider_product_id)
    references public.commerce_provider_products (organization_id, id),
  constraint commerce_economic_allocation_manifest_items_amount_check
    check (gross_amount >= 0 and expected_allocated_gross_amount >= 0),
  constraint commerce_economic_allocation_manifest_items_sequence_check
    check (item_sequence > 0 and expected_line_count > 0),
  constraint commerce_econ_manifest_items_currency_basis_check
    check (currency_basis in ('provider_observed','operator_authorized_policy')),
  constraint commerce_economic_allocation_manifest_items_policy_check
    check (allocation_policy_version ~ '^[a-z0-9][a-z0-9._-]{0,127}$'),
  constraint commerce_economic_allocation_manifest_items_fingerprint_check
    check (allocation_input_fingerprint ~ '^[0-9a-f]{64}$'),
  unique (manifest_id, item_sequence),
  unique (manifest_id, canonical_order_id)
);

create index commerce_economic_allocation_manifests_scope_idx
  on public.commerce_economic_allocation_manifests
  (organization_id, connection_id, provider_account_id, allocation_policy_version, created_at desc);
create index commerce_economic_allocation_manifest_items_cursor_idx
  on public.commerce_economic_allocation_manifest_items (manifest_id, item_sequence);
create index commerce_economic_allocation_manifest_items_order_idx
  on public.commerce_economic_allocation_manifest_items
  (organization_id, canonical_order_id, manifest_id);

alter table public.commerce_economic_allocation_manifests enable row level security;
alter table public.commerce_economic_allocation_manifest_items enable row level security;
revoke all on public.commerce_economic_allocation_manifests from public, anon, authenticated, authenticator;
revoke all on public.commerce_economic_allocation_manifest_items from public, anon, authenticated, authenticator;
grant select, insert, update, delete on public.commerce_economic_allocation_manifests to service_role;
grant select, insert, update, delete on public.commerce_economic_allocation_manifest_items to service_role;

comment on table public.commerce_economic_allocation_manifests is
  'Server-only immutable cohort headers for economic-allocation backfills.';
comment on table public.commerce_economic_allocation_manifest_items is
  'Server-only frozen allocation inputs; never a provider payload or financial ledger.';

create or replace function public.commas_economic_allocation_input_fingerprint_v1(
  p_organization_id uuid,
  p_connection_id uuid,
  p_provider_account_id uuid,
  p_canonical_order_id uuid,
  p_platform_order_id text,
  p_source_provider text,
  p_source_provider_product_id uuid,
  p_provider_product_external_id text,
  p_mapping_status text,
  p_mapping_version text,
  p_business_context_id text,
  p_canonical_offer_id uuid,
  p_offer_step_id uuid,
  p_offer_variant_id uuid,
  p_gross_amount numeric,
  p_source_currency text,
  p_currency_basis text,
  p_order_status text,
  p_order_status_norm text,
  p_allocation_policy_version text
)
returns text language sql immutable security invoker set search_path = public, extensions, pg_temp as $$
  select encode(extensions.digest(jsonb_build_array(
    p_organization_id::text,p_connection_id::text,p_provider_account_id::text,
    p_canonical_order_id::text,p_platform_order_id,p_source_provider,p_source_provider_product_id::text,
    p_provider_product_external_id,p_mapping_status,p_mapping_version,p_business_context_id,
    p_canonical_offer_id::text,p_offer_step_id::text,p_offer_variant_id::text,
    round(p_gross_amount,2)::text,
    case when p_source_currency is null then '<NULL>' else upper(p_source_currency) end,
    p_currency_basis,p_order_status,p_order_status_norm,p_allocation_policy_version
  )::text,'sha256'),'hex')
$$;

create or replace function public.guard_commerce_economic_allocation_manifest_v1()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if tg_table_name = 'commerce_economic_allocation_manifest_items' then
    if exists (select 1 from public.commerce_economic_allocation_manifests m
      where m.id=case when tg_op='DELETE' then old.manifest_id else new.manifest_id end
        and m.status <> 'building') then
      raise exception using errcode='55000',message='frozen economic allocation manifest items are immutable';
    end if;
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;

  if tg_op='DELETE' and old.status <> 'building' then
    raise exception using errcode='55000',message='frozen economic allocation manifest is immutable';
  elsif tg_op='UPDATE' and old.status='building'
    and new.status not in ('building','frozen','failed') then
    raise exception using errcode='55000',message='invalid economic allocation manifest status transition';
  elsif tg_op='UPDATE' and old.status <> 'building' then
    if new.account_id is distinct from old.account_id
      or new.organization_id is distinct from old.organization_id
      or new.connection_id is distinct from old.connection_id
      or new.provider_account_id is distinct from old.provider_account_id
      or new.allocation_policy_version is distinct from old.allocation_policy_version
      or new.created_at is distinct from old.created_at
      or new.frozen_at is distinct from old.frozen_at
      or new.cohort_count is distinct from old.cohort_count
      or new.provider_gross_total is distinct from old.provider_gross_total
      or new.expected_allocated_gross_total is distinct from old.expected_allocated_gross_total
      or new.expected_front_end_total is distinct from old.expected_front_end_total
      or new.expected_revenue_booster_total is distinct from old.expected_revenue_booster_total
      or new.expected_fast_track_total is distinct from old.expected_fast_track_total
      or new.expected_67_count is distinct from old.expected_67_count
      or new.expected_92_count is distinct from old.expected_92_count
      or new.expected_106_count is distinct from old.expected_106_count
      or new.expected_131_count is distinct from old.expected_131_count
      or new.cohort_fingerprint is distinct from old.cohort_fingerprint then
      raise exception using errcode='55000',message='frozen economic allocation manifest baseline is immutable';
    end if;
    if not ((old.status='frozen' and new.status in ('frozen','writing','failed'))
      or (old.status='writing' and new.status in ('writing','completed','failed'))
      or (old.status in ('completed','failed') and new.status=old.status)) then
      raise exception using errcode='55000',message='invalid economic allocation manifest status transition';
    end if;
    if new.completed_at is distinct from old.completed_at and new.status <> 'completed' then
      raise exception using errcode='55000',message='completed_at requires completed status';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

create trigger guard_commerce_economic_allocation_manifest_header
before update or delete on public.commerce_economic_allocation_manifests
for each row execute function public.guard_commerce_economic_allocation_manifest_v1();
create trigger guard_commerce_economic_allocation_manifest_items
before insert or update or delete on public.commerce_economic_allocation_manifest_items
for each row execute function public.guard_commerce_economic_allocation_manifest_v1();

create or replace function public.create_commas_economic_allocation_manifest_v1(
  p_organization_id uuid,
  p_connection_id uuid,
  p_provider_account_id uuid,
  p_allocation_policy_version text default 'commas-pbs-order-bump-allocation-v1'
)
returns jsonb language plpgsql security invoker set search_path = public, extensions, pg_temp as $$
declare
  v_manifest_id uuid;
  v_account_id uuid;
  v_count integer;
  v_provider numeric;
  v_allocated numeric;
  v_front numeric;
  v_booster numeric;
  v_fast numeric;
  v_67 integer;
  v_92 integer;
  v_106 integer;
  v_131 integer;
  v_fingerprint text;
begin
  if p_allocation_policy_version <> 'commas-pbs-order-bump-allocation-v1' then
    raise exception using errcode='22023',message='unsupported economic allocation policy';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':','commas-economic-manifest',p_organization_id,p_connection_id,p_provider_account_id,p_allocation_policy_version),0));
  if exists (select 1 from public.commerce_economic_allocation_manifests
    where organization_id=p_organization_id and connection_id=p_connection_id
      and provider_account_id=p_provider_account_id and allocation_policy_version=p_allocation_policy_version
      and status in ('building','frozen','writing')) then
    raise exception using errcode='55000',message='an active economic allocation manifest already exists';
  end if;
  select c.account_id into v_account_id
  from public.commerce_provider_accounts pa
  join public.commerce_provider_connections c on c.organization_id=pa.organization_id and c.id=pa.connection_id
  where pa.organization_id=p_organization_id and pa.connection_id=p_connection_id and pa.id=p_provider_account_id;
  if not found then raise exception using errcode='P0002',message='provider account scope not found'; end if;

  insert into public.commerce_economic_allocation_manifests
    (account_id,organization_id,connection_id,provider_account_id,allocation_policy_version,status)
  values (v_account_id,p_organization_id,p_connection_id,p_provider_account_id,p_allocation_policy_version,'building')
  returning id into v_manifest_id;

  with candidate as (
    select o.canonical_order_id,o.platform_order_id,o.platform source_provider,
      o.provider_product_id source_provider_product_id,
      p.provider_product_id provider_product_external_id,p.mapping_status,p.mapping_version,
      p.business_context_id,p.canonical_offer_id,p.offer_step_id,p.offer_variant_id,
      o.gross_amount,o.currency source_currency,o.status order_status,o.status_norm order_status_norm,
      case when upper(coalesce(o.currency,''))='USD' then 'USD'
        when o.currency is null and o.organization_id='5f1de64a-1b37-40bb-81c8-32197eda0b41'::uuid
          and o.connection_id='ea1c2313-6120-4692-84c5-ec3562e7dcf6'::uuid
          and o.provider_account_id='0369c701-717f-4c34-b230-8341bcdb7e65'::uuid
          and p.provider_product_id in ('0E1ML','4KV26','6GO2R','Jz71g','KE1Ox','rVWgL','xz1kz')
        then 'USD' else o.currency end effective_currency,
      case when upper(coalesce(o.currency,''))='USD' then 'provider_observed'
        when o.currency is null and o.organization_id='5f1de64a-1b37-40bb-81c8-32197eda0b41'::uuid
          and o.connection_id='ea1c2313-6120-4692-84c5-ec3562e7dcf6'::uuid
          and o.provider_account_id='0369c701-717f-4c34-b230-8341bcdb7e65'::uuid
          and p.provider_product_id in ('0E1ML','4KV26','6GO2R','Jz71g','KE1Ox','rVWgL','xz1kz')
        then 'operator_authorized_policy' else 'unsupported' end currency_basis
    from public.platform_orders o
    join public.commerce_provider_products p on p.organization_id=o.organization_id
      and p.connection_id=o.connection_id and p.provider_account_id=o.provider_account_id
      and p.id=o.provider_product_id
    where o.organization_id=p_organization_id and o.connection_id=p_connection_id
      and o.provider_account_id=p_provider_account_id
  ), eligible as (
    select c.*,count(l.*)::integer expected_line_count,
      sum(l.allocated_gross_amount)::numeric(20,2) expected_allocated_gross_amount
    from candidate c
    cross join lateral public.compute_commas_pbs_order_economic_lines_v1(
      c.source_provider,p_organization_id,p_connection_id,p_provider_account_id,
      c.provider_product_external_id,c.mapping_status,c.business_context_id,c.canonical_offer_id,
      c.offer_step_id,c.order_status,c.order_status_norm,c.gross_amount,c.effective_currency) l
    group by c.canonical_order_id,c.platform_order_id,c.source_provider,c.source_provider_product_id,
      c.provider_product_external_id,c.mapping_status,c.mapping_version,c.business_context_id,
      c.canonical_offer_id,c.offer_step_id,c.offer_variant_id,c.gross_amount,c.source_currency,
      c.order_status,c.order_status_norm,c.effective_currency,c.currency_basis
    having count(l.*)>0
  ), sequenced as (
    select e.*,row_number() over(order by e.canonical_order_id)::bigint item_sequence
    from eligible e
  )
  insert into public.commerce_economic_allocation_manifest_items
    (manifest_id,organization_id,connection_id,provider_account_id,item_sequence,
     canonical_order_id,platform_order_id,source_provider,source_provider_product_id,provider_product_external_id,
     mapping_status,mapping_version,business_context_id,canonical_offer_id,offer_step_id,offer_variant_id,
     gross_amount,source_currency,currency_basis,order_status,order_status_norm,allocation_policy_version,
     expected_allocated_gross_amount,expected_line_count,allocation_input_fingerprint)
  select v_manifest_id,p_organization_id,p_connection_id,p_provider_account_id,e.item_sequence,
    e.canonical_order_id,e.platform_order_id,e.source_provider,e.source_provider_product_id,e.provider_product_external_id,
    e.mapping_status,e.mapping_version,e.business_context_id,e.canonical_offer_id,e.offer_step_id,e.offer_variant_id,
    e.gross_amount,e.source_currency,e.currency_basis,e.order_status,e.order_status_norm,p_allocation_policy_version,
    e.expected_allocated_gross_amount,e.expected_line_count,
    public.commas_economic_allocation_input_fingerprint_v1(
      p_organization_id,p_connection_id,p_provider_account_id,e.canonical_order_id,e.platform_order_id,e.source_provider,
      e.source_provider_product_id,e.provider_product_external_id,e.mapping_status,e.mapping_version,
      e.business_context_id,e.canonical_offer_id,e.offer_step_id,e.offer_variant_id,e.gross_amount,
      e.source_currency,e.currency_basis,e.order_status,e.order_status_norm,p_allocation_policy_version)
  from sequenced e;

  if exists (
    select 1 from public.commerce_economic_allocation_manifest_items
    where manifest_id=v_manifest_id
      and round(expected_allocated_gross_amount,2)<>round(gross_amount,2)
  ) then
    raise exception using errcode='22000',message='economic allocation manifest item conservation failed';
  end if;

  select count(*)::integer,coalesce(sum(gross_amount),0),coalesce(sum(expected_allocated_gross_amount),0),
    coalesce(count(*) filter(where gross_amount=67),0)::integer,
    coalesce(count(*) filter(where gross_amount=92),0)::integer,
    coalesce(count(*) filter(where gross_amount=106),0)::integer,
    coalesce(count(*) filter(where gross_amount=131),0)::integer,
    coalesce(sum(case when gross_amount in (67,92,106,131) then 67 else 0 end),0),
    coalesce(sum(case when gross_amount in (92,131) then 25 else 0 end),0),
    coalesce(sum(case when gross_amount in (106,131) then 39 else 0 end),0),
    encode(extensions.digest(coalesce(string_agg(
      concat_ws(':',item_sequence,allocation_input_fingerprint),'|' order by item_sequence),''),'sha256'),'hex')
  into v_count,v_provider,v_allocated,v_67,v_92,v_106,v_131,v_front,v_booster,v_fast,v_fingerprint
  from public.commerce_economic_allocation_manifest_items where manifest_id=v_manifest_id;

  if v_count=0 then raise exception using errcode='22000',message='economic allocation manifest cohort is empty'; end if;
  if round(v_provider,2)<>round(v_allocated,2)
    or round(v_allocated,2)<>round(v_front+v_booster+v_fast,2)
    or v_count<>(v_67+v_92+v_106+v_131) then
    raise exception using errcode='22000',message='economic allocation manifest conservation failed';
  end if;

  update public.commerce_economic_allocation_manifests set status='frozen',frozen_at=now(),updated_at=now(),
    cohort_count=v_count,provider_gross_total=v_provider,expected_allocated_gross_total=v_allocated,
    expected_front_end_total=v_front,expected_revenue_booster_total=v_booster,
    expected_fast_track_total=v_fast,expected_67_count=v_67,expected_92_count=v_92,
    expected_106_count=v_106,expected_131_count=v_131,cohort_fingerprint=v_fingerprint,
    metadata=jsonb_build_object('allocation_source','deterministic_checkout_decomposition','frozen_atomically',true)
  where id=v_manifest_id;

  return jsonb_build_object('manifest_id',v_manifest_id,'status','frozen','cohort_count',v_count,
    'provider_gross_total',v_provider,'expected_allocated_gross_total',v_allocated,
    'expected_front_end_total',v_front,'expected_revenue_booster_total',v_booster,
    'expected_fast_track_total',v_fast,'expected_67_count',v_67,'expected_92_count',v_92,
    'expected_106_count',v_106,'expected_131_count',v_131,'difference',v_provider-v_allocated,
    'cohort_fingerprint',v_fingerprint);
end $$;

create or replace function public.backfill_commas_order_economic_allocations_from_manifest_v1(
  p_manifest_id uuid,
  p_after_item_sequence bigint default 0,
  p_batch_size integer default 100,
  p_dry_run boolean default true
)
returns jsonb language plpgsql security invoker set search_path = public, extensions, pg_temp as $$
declare
  v_manifest public.commerce_economic_allocation_manifests%rowtype;
  r public.commerce_economic_allocation_manifest_items%rowtype;
  v_order public.platform_orders%rowtype;
  v_product public.commerce_provider_products%rowtype;
  x record;
  v_lines integer;
  v_allocated numeric;
  v_effective_currency text;
  v_currency_basis text;
  v_live_fingerprint text;
  v_seen integer:=0;
  v_written integer:=0;
  v_stale integer:=0;
  v_failed integer:=0;
  v_original numeric:=0;
  v_economic numeric:=0;
  v_front numeric:=0;
  v_booster numeric:=0;
  v_fast numeric:=0;
  v_67 integer:=0;
  v_92 integer:=0;
  v_106 integer:=0;
  v_131 integer:=0;
  v_last bigint;
  v_first_stale bigint;
  v_complete boolean:=false;
  v_actual_orders integer;
  v_actual_gross numeric;
  v_actual_front numeric;
  v_actual_booster numeric;
  v_actual_fast numeric;
  v_actual_67 integer;
  v_actual_92 integer;
  v_actual_106 integer;
  v_actual_131 integer;
  v_violations integer;
begin
  if p_batch_size<1 or p_batch_size>500 then
    raise exception using errcode='22023',message='batch size must be between 1 and 500';
  end if;
  select * into v_manifest from public.commerce_economic_allocation_manifests
  where id=p_manifest_id for update;
  if not found then raise exception using errcode='P0002',message='economic allocation manifest not found'; end if;
  if v_manifest.status not in ('frozen','writing','completed') then
    raise exception using errcode='55000',message='economic allocation manifest is not executable';
  end if;

  -- Validate and lock the complete batch before any economic line is written.
  for r in select * from public.commerce_economic_allocation_manifest_items
    where manifest_id=p_manifest_id and item_sequence>coalesce(p_after_item_sequence,0)
    order by item_sequence limit p_batch_size
  loop
    v_seen:=v_seen+1; v_last:=r.item_sequence;
    select * into v_order from public.platform_orders o
    where o.organization_id=r.organization_id and o.connection_id=r.connection_id
      and o.provider_account_id=r.provider_account_id and o.canonical_order_id=r.canonical_order_id
    for update;
    if not found then v_stale:=v_stale+1; v_first_stale:=coalesce(v_first_stale,r.item_sequence); continue; end if;
    select * into v_product from public.commerce_provider_products p
    where p.organization_id=r.organization_id and p.connection_id=r.connection_id
      and p.provider_account_id=r.provider_account_id and p.id=v_order.provider_product_id
    for update;
    if not found then v_stale:=v_stale+1; v_first_stale:=coalesce(v_first_stale,r.item_sequence); continue; end if;

    if upper(coalesce(v_order.currency,''))='USD' then
      v_effective_currency:='USD'; v_currency_basis:='provider_observed';
    elsif v_order.currency is null
      and r.organization_id='5f1de64a-1b37-40bb-81c8-32197eda0b41'::uuid
      and r.connection_id='ea1c2313-6120-4692-84c5-ec3562e7dcf6'::uuid
      and r.provider_account_id='0369c701-717f-4c34-b230-8341bcdb7e65'::uuid
      and v_product.provider_product_id in ('0E1ML','4KV26','6GO2R','Jz71g','KE1Ox','rVWgL','xz1kz') then
      v_effective_currency:='USD'; v_currency_basis:='operator_authorized_policy';
    else v_effective_currency:=v_order.currency; v_currency_basis:='unsupported'; end if;

    v_live_fingerprint:=public.commas_economic_allocation_input_fingerprint_v1(
      r.organization_id,r.connection_id,r.provider_account_id,v_order.canonical_order_id,
      v_order.platform_order_id,v_order.platform,v_product.id,v_product.provider_product_id,v_product.mapping_status,
      v_product.mapping_version,v_product.business_context_id,v_product.canonical_offer_id,
      v_product.offer_step_id,v_product.offer_variant_id,v_order.gross_amount,v_order.currency,
      v_currency_basis,v_order.status,v_order.status_norm,r.allocation_policy_version);
    select count(*)::integer,coalesce(sum(l.allocated_gross_amount),0)
      into v_lines,v_allocated
    from public.compute_commas_pbs_order_economic_lines_v1(
      v_order.platform,r.organization_id,r.connection_id,r.provider_account_id,v_product.provider_product_id,
      v_product.mapping_status,v_product.business_context_id,v_product.canonical_offer_id,
      v_product.offer_step_id,v_order.status,v_order.status_norm,v_order.gross_amount,v_effective_currency) l;
    if v_live_fingerprint<>r.allocation_input_fingerprint
      or v_lines<>r.expected_line_count
      or round(v_allocated,2)<>round(r.expected_allocated_gross_amount,2)
      or round(v_allocated,2)<>round(v_order.gross_amount,2) then
      v_stale:=v_stale+1; v_first_stale:=coalesce(v_first_stale,r.item_sequence); continue;
    end if;
    v_original:=v_original+v_order.gross_amount; v_economic:=v_economic+v_allocated;
    if v_order.gross_amount=67 then v_67:=v_67+1;
    elsif v_order.gross_amount=92 then v_92:=v_92+1;
    elsif v_order.gross_amount=106 then v_106:=v_106+1;
    elsif v_order.gross_amount=131 then v_131:=v_131+1; end if;
    v_front:=v_front+67;
    if v_order.gross_amount in (92,131) then v_booster:=v_booster+25; end if;
    if v_order.gross_amount in (106,131) then v_fast:=v_fast+39; end if;
  end loop;

  if v_stale>0 then
    if v_manifest.status<>'completed' then
      update public.commerce_economic_allocation_manifests set status='failed',updated_at=now(),
        metadata=metadata||jsonb_build_object('failure_code','manifest_item_stale','first_stale_sequence',v_first_stale)
      where id=p_manifest_id;
    end if;
    return jsonb_build_object('manifest_id',p_manifest_id,'status','manifest_stale','dry_run',p_dry_run,
      'orders_scanned',v_seen,'stale_items',v_stale,'first_stale_sequence',v_first_stale,
      'conservation_failures',v_failed,'next_cursor',v_last);
  end if;

  if not p_dry_run and v_seen>0 then
    if v_manifest.status='frozen' then
      update public.commerce_economic_allocation_manifests set status='writing',updated_at=now() where id=p_manifest_id;
    end if;
    for r in select * from public.commerce_economic_allocation_manifest_items
      where manifest_id=p_manifest_id and item_sequence>coalesce(p_after_item_sequence,0)
      order by item_sequence limit p_batch_size
    loop
      select * into x from public.reconcile_commas_order_economic_allocation_v1(
        r.organization_id,r.connection_id,r.provider_account_id,r.canonical_order_id,false);
      if x.status<>'allocated' or round(x.original_gross,2)<>round(r.gross_amount,2)
        or round(x.allocated_gross,2)<>round(r.expected_allocated_gross_amount,2) then
        raise exception using errcode='40001',message='manifest item changed during allocation write';
      end if;
      v_written:=v_written+1;
    end loop;
    update public.commerce_economic_allocation_manifests set updated_at=now(),
      metadata=metadata||jsonb_build_object('last_written_sequence',v_last) where id=p_manifest_id;
  end if;

  v_complete:=v_seen>0 and not exists (select 1 from public.commerce_economic_allocation_manifest_items
    where manifest_id=p_manifest_id and item_sequence>v_last);
  if not p_dry_run and v_complete then
    with per_order as (
      select i.canonical_order_id,i.gross_amount,count(e.*) line_count,
        coalesce(sum(e.allocated_gross_amount),0) allocated
      from public.commerce_economic_allocation_manifest_items i
      left join public.commerce_order_economic_lines e on e.organization_id=i.organization_id
        and e.connection_id=i.connection_id and e.provider_account_id=i.provider_account_id
        and e.canonical_order_id=i.canonical_order_id
        and e.allocation_policy_version=i.allocation_policy_version
      where i.manifest_id=p_manifest_id group by i.canonical_order_id,i.gross_amount
    )
    select count(*) filter(where round(allocated,2)=round(gross_amount,2))::integer,
      coalesce(sum(allocated),0),
      count(*) filter(where round(allocated,2)<>round(gross_amount,2))::integer
    into v_actual_orders,v_actual_gross,v_violations from per_order;
    select coalesce(sum(e.allocated_gross_amount) filter(where e.offer_step_id='8110e951-8ca6-406a-8817-55575fe647ba'),0),
      coalesce(sum(e.allocated_gross_amount) filter(where e.offer_step_id='a5d6d601-790d-4b7c-97f3-a9f833465ef5'),0),
      coalesce(sum(e.allocated_gross_amount) filter(where e.offer_step_id='2fa222b9-1325-4cd5-b712-03313f093057'),0)
    into v_actual_front,v_actual_booster,v_actual_fast
    from public.commerce_economic_allocation_manifest_items i
    join public.commerce_order_economic_lines e on e.organization_id=i.organization_id
      and e.connection_id=i.connection_id and e.provider_account_id=i.provider_account_id
      and e.canonical_order_id=i.canonical_order_id and e.allocation_policy_version=i.allocation_policy_version
    where i.manifest_id=p_manifest_id;
    select count(*) filter(where gross_amount=67)::integer,
      count(*) filter(where gross_amount=92)::integer,
      count(*) filter(where gross_amount=106)::integer,
      count(*) filter(where gross_amount=131)::integer
    into v_actual_67,v_actual_92,v_actual_106,v_actual_131
    from public.commerce_economic_allocation_manifest_items where manifest_id=p_manifest_id;
    if v_violations<>0 or v_actual_orders<>v_manifest.cohort_count
      or round(v_actual_gross,2)<>round(v_manifest.provider_gross_total,2)
      or round(v_actual_gross,2)<>round(v_manifest.expected_allocated_gross_total,2)
      or round(v_actual_front,2)<>round(v_manifest.expected_front_end_total,2)
      or round(v_actual_booster,2)<>round(v_manifest.expected_revenue_booster_total,2)
      or round(v_actual_fast,2)<>round(v_manifest.expected_fast_track_total,2)
      or v_actual_67<>v_manifest.expected_67_count
      or v_actual_92<>v_manifest.expected_92_count
      or v_actual_106<>v_manifest.expected_106_count
      or v_actual_131<>v_manifest.expected_131_count then
      update public.commerce_economic_allocation_manifests set status='failed',updated_at=now(),
        metadata=metadata||jsonb_build_object('failure_code','manifest_completion_mismatch') where id=p_manifest_id;
    else
      update public.commerce_economic_allocation_manifests set status='completed',completed_at=now(),updated_at=now(),
        metadata=metadata||jsonb_build_object('completed_conservation_violations',0) where id=p_manifest_id;
    end if;
  end if;

  return jsonb_build_object('manifest_id',p_manifest_id,
    'status',case when p_dry_run then 'dry_run_valid'
      else (select status from public.commerce_economic_allocation_manifests where id=p_manifest_id) end,
    'dry_run',p_dry_run,'orders_scanned',v_seen,'eligible_orders',v_seen,
    'written_orders',v_written,'stale_items',0,'conservation_failures',v_failed,
    'original_provider_gross',v_original,'allocated_gross',v_economic,
    'difference',v_original-v_economic,
    'amount_by_step',jsonb_build_object('front_end',v_front,'revenue_booster',v_booster,'fast_track',v_fast),
    'amount_populations',jsonb_build_object('67',v_67,'92',v_92,'106',v_106,'131',v_131),
    'next_cursor',v_last,'complete',v_complete);
end $$;

revoke all on function public.commas_economic_allocation_input_fingerprint_v1(uuid,uuid,uuid,uuid,text,text,uuid,text,text,text,text,uuid,uuid,uuid,numeric,text,text,text,text,text) from public, anon, authenticated, authenticator;
revoke all on function public.guard_commerce_economic_allocation_manifest_v1() from public, anon, authenticated, authenticator;
revoke all on function public.create_commas_economic_allocation_manifest_v1(uuid,uuid,uuid,text) from public, anon, authenticated, authenticator;
revoke all on function public.backfill_commas_order_economic_allocations_from_manifest_v1(uuid,bigint,integer,boolean) from public, anon, authenticated, authenticator;
grant execute on function public.commas_economic_allocation_input_fingerprint_v1(uuid,uuid,uuid,uuid,text,text,uuid,text,text,text,text,uuid,uuid,uuid,numeric,text,text,text,text,text) to service_role;
grant execute on function public.guard_commerce_economic_allocation_manifest_v1() to service_role;
grant execute on function public.create_commas_economic_allocation_manifest_v1(uuid,uuid,uuid,text) to service_role;
grant execute on function public.backfill_commas_order_economic_allocations_from_manifest_v1(uuid,bigint,integer,boolean) to service_role;

commit;
