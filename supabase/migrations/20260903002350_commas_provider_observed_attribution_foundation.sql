begin;

create table public.commerce_provider_attribution_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  provider_event_id text not null,
  provider_event_type text not null check (provider_event_type in ('product.purchased','subscription.created')),
  evidence_id uuid not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  observed_at timestamptz not null default now(),
  constraint commerce_provider_attribution_deliveries_scope_fk foreign key (organization_id,connection_id,provider_account_id)
    references public.commerce_provider_accounts(organization_id,connection_id,id),
  constraint commerce_provider_attribution_deliveries_evidence_fk foreign key (organization_id,evidence_id)
    references public.commerce_evidence_records(organization_id,id),
  unique (connection_id,provider_account_id,provider_event_id,payload_hash)
);

create table public.commerce_provider_attribution_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  provider text not null default 'commas' check (provider='commas'),
  provider_event_id text not null,
  provider_event_type text not null check (provider_event_type in ('product.purchased','subscription.created')),
  evidence_id uuid not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  payment_public_transaction_id text,
  subscription_provider_id text,
  platform_order_id text,
  canonical_order_id uuid,
  person_id uuid,
  match_state text not null check (match_state in ('exact','unmatched','ambiguous','malformed')),
  match_method text not null check (match_method in ('commas_public_transaction','none')),
  affiliate_id text,
  sub1 text,
  sub4 text,
  ef_transaction_id text,
  transaction_id text,
  tid text,
  c1 text,
  alias_state text not null check (alias_state in ('all_agree','single_alias','conflict','none')),
  everflow_comparison_state text not null default 'not_evaluated'
    check (everflow_comparison_state in ('exact_match','partial_match','conflict','no_everflow_record','no_commas_tid','not_evaluated')),
  normalizer_version text not null,
  reconciliation_version text not null,
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  payload_conflict boolean not null default false,
  restricted_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_provider_attribution_observations_scope_fk foreign key (organization_id,connection_id,provider_account_id)
    references public.commerce_provider_accounts(organization_id,connection_id,id),
  constraint commerce_provider_attribution_observations_evidence_fk foreign key (organization_id,evidence_id)
    references public.commerce_evidence_records(organization_id,id),
  constraint commerce_provider_attribution_observations_order_fk foreign key (organization_id,canonical_order_id)
    references public.platform_orders(organization_id,canonical_order_id),
  constraint commerce_provider_attribution_observations_person_fk foreign key (organization_id,person_id)
    references public.people(organization_id,id),
  constraint commerce_provider_attribution_observations_match_check check (
    (match_state='exact' and match_method='commas_public_transaction' and canonical_order_id is not null and platform_order_id is not null)
    or (match_state<>'exact' and match_method='none' and canonical_order_id is null and platform_order_id is null and person_id is null)
  ),
  constraint commerce_provider_attribution_observations_event_uidx unique (connection_id,provider_account_id,provider_event_id)
);

create index commerce_provider_attribution_observations_order_idx
  on public.commerce_provider_attribution_observations(organization_id,canonical_order_id)
  where canonical_order_id is not null;
create index commerce_provider_attribution_obs_public_tx_idx
  on public.commerce_provider_attribution_observations(connection_id,provider_account_id,payment_public_transaction_id)
  where payment_public_transaction_id is not null;
create index commerce_provider_attribution_observations_everflow_idx
  on public.commerce_provider_attribution_observations(organization_id,ef_transaction_id)
  where ef_transaction_id is not null;

create or replace function public.commerce_provider_attribution_delivery_immutable_guard()
returns trigger language plpgsql as $$ begin
  raise exception 'provider attribution webhook deliveries are immutable' using errcode='55000';
end $$;
create trigger commerce_provider_attribution_delivery_immutable_guard_trigger
before update or delete on public.commerce_provider_attribution_webhook_deliveries
for each row execute function public.commerce_provider_attribution_delivery_immutable_guard();

create or replace function public.record_commas_provider_attribution_observation_v1(
  p_organization_id uuid,p_connection_id uuid,p_provider_account_id uuid,p_evidence_id uuid,
  p_provider_event_id text,p_provider_event_type text,p_payload_hash text,p_provider_created_at timestamptz,
  p_payment_public_transaction_id text,p_payment_identity_state text,p_subscription_provider_id text,
  p_parameters jsonb,p_everflow_comparison jsonb
) returns table(observation_id uuid,delivery_created boolean,replayed boolean,payload_conflict boolean,match_state text,journey_event_created boolean)
language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_now timestamptz:=now(); v_delivery_created boolean:=false; v_existing public.commerce_provider_attribution_observations%rowtype;
  v_order_count integer:=0; v_order public.platform_orders%rowtype; v_match text:='unmatched'; v_journey_created boolean:=false;
begin
  if p_provider_event_type not in ('product.purchased','subscription.created') then raise exception 'unsupported attribution event'; end if;
  if p_payload_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid payload hash'; end if;
  if not exists(select 1 from public.commerce_evidence_records e where e.id=p_evidence_id and e.organization_id=p_organization_id and e.connection_id=p_connection_id and e.provider_account_id=p_provider_account_id and e.payload_hash=p_payload_hash and e.source_object_type='commas_attribution_webhook' and e.deleted_at is null) then
    raise exception 'verified attribution evidence unavailable';
  end if;
  insert into public.commerce_provider_attribution_webhook_deliveries(organization_id,connection_id,provider_account_id,provider_event_id,provider_event_type,evidence_id,payload_hash,observed_at)
  values(p_organization_id,p_connection_id,p_provider_account_id,p_provider_event_id,p_provider_event_type,p_evidence_id,p_payload_hash,v_now)
  on conflict do nothing;
  get diagnostics v_order_count=row_count; v_delivery_created:=v_order_count=1;
  select * into v_existing from public.commerce_provider_attribution_observations o where o.connection_id=p_connection_id and o.provider_account_id=p_provider_account_id and o.provider_event_id=p_provider_event_id for update;
  if found then
    update public.commerce_provider_attribution_observations o set last_observed_at=v_now,payload_conflict=o.payload_conflict or o.payload_hash<>p_payload_hash,updated_at=v_now where o.id=v_existing.id;
    return query select v_existing.id,v_delivery_created,true,(v_existing.payload_conflict or v_existing.payload_hash<>p_payload_hash),v_existing.match_state,false;
    return;
  end if;
  if p_provider_event_type='product.purchased' then
    if p_payment_identity_state<>'valid' or p_payment_public_transaction_id is null then v_match:='malformed';
    else
      select count(*) into v_order_count from public.commerce_source_mappings m where m.organization_id=p_organization_id and m.connection_id=p_connection_id and m.provider_account_id=p_provider_account_id and m.source_object_type='commas_public_transaction' and m.source_object_id=p_payment_public_transaction_id and m.canonical_object_type='order' and m.state='active';
      if v_order_count=1 then
        select po.* into strict v_order from public.commerce_source_mappings m join public.platform_orders po on po.organization_id=m.organization_id and po.canonical_order_id=m.canonical_object_id where m.organization_id=p_organization_id and m.connection_id=p_connection_id and m.provider_account_id=p_provider_account_id and m.source_object_type='commas_public_transaction' and m.source_object_id=p_payment_public_transaction_id and m.state='active';
        v_match:='exact';
      elsif v_order_count>1 then v_match:='ambiguous'; end if;
    end if;
  end if;
  insert into public.commerce_provider_attribution_observations(organization_id,connection_id,provider_account_id,provider_event_id,provider_event_type,evidence_id,payload_hash,payment_public_transaction_id,subscription_provider_id,platform_order_id,canonical_order_id,person_id,match_state,match_method,affiliate_id,sub1,sub4,ef_transaction_id,transaction_id,tid,c1,alias_state,everflow_comparison_state,normalizer_version,reconciliation_version,first_observed_at,last_observed_at,restricted_metadata)
  values(p_organization_id,p_connection_id,p_provider_account_id,p_provider_event_id,p_provider_event_type,p_evidence_id,p_payload_hash,p_payment_public_transaction_id,p_subscription_provider_id,case when v_match='exact' then v_order.platform_order_id end,case when v_match='exact' then v_order.canonical_order_id end,case when v_match='exact' then v_order.person_id end,v_match,case when v_match='exact' then 'commas_public_transaction' else 'none' end,nullif(p_parameters->>'affiliate_id',''),nullif(p_parameters->>'sub1',''),nullif(p_parameters->>'sub4',''),nullif(p_parameters->>'ef_transaction_id',''),nullif(p_parameters->>'transaction_id',''),nullif(p_parameters->>'tid',''),nullif(p_parameters->>'c1',''),p_parameters->>'alias_state',coalesce(nullif(p_everflow_comparison->>'state',''),'not_evaluated'),'commas-provider-attribution-v1','commas-ord-exact-v1',coalesce(p_provider_created_at,v_now),v_now,coalesce(p_parameters->'restricted_metadata','{}'::jsonb))
  returning id into observation_id;
  if v_match='exact' then
    insert into public.journey_events(workspace_id,person_id,platform_order_id,event_type,event_time,source_platform,source_connector,source_record_id,affiliate_id,sub1,sub4,transaction_id,metadata)
    values(p_organization_id::text,v_order.person_id,v_order.platform_order_id,'purchase',coalesce(p_provider_created_at,v_order.order_ts,v_now),'commas','commas_provider_observed_checkout',p_provider_event_id,nullif(p_parameters->>'affiliate_id',''),nullif(p_parameters->>'sub1',''),nullif(p_parameters->>'sub4',''),case when p_parameters->>'alias_state'<>'conflict' then coalesce(nullif(p_parameters->>'ef_transaction_id',''),nullif(p_parameters->>'transaction_id',''),nullif(p_parameters->>'tid',''),nullif(p_parameters->>'c1','')) end,jsonb_build_object('provenance','provider_observed_checkout','provider','commas','evidence_id',p_evidence_id,'observation_id',observation_id,'everflow_comparison',coalesce(p_everflow_comparison,'{}'::jsonb)))
    on conflict(workspace_id,source_platform,source_connector,source_record_id,event_type) do nothing;
    get diagnostics v_order_count=row_count; v_journey_created:=v_order_count=1;
  end if;
  return query select observation_id,v_delivery_created,false,false,v_match,v_journey_created;
end $$;

create or replace function public.upsert_commas_public_transaction_mappings_v1(
  p_organization_id uuid,p_connection_id uuid,p_provider_account_id uuid,p_evidence_id uuid,p_records jsonb,p_dry_run boolean default true
) returns table(transactions_inspected integer,valid_ord_identities integer,unique_ord_identities integer,exact_order_matches integer,unmatched_transactions integer,ambiguous_ord_identities integer,duplicate_ord_identities integer,malformed_ord_identities integer,mappings_written integer)
language plpgsql security invoker set search_path=public,pg_temp as $$
declare r jsonb; v_seen int:=0;v_valid int:=0;v_exact int:=0;v_unmatched int:=0;v_ambiguous int:=0;v_duplicate int:=0;v_malformed int:=0;v_written int:=0;v_count int;v_mapping public.commerce_source_mappings%rowtype;v_order_mapping public.commerce_source_mappings%rowtype;
begin
  if jsonb_typeof(p_records)<>'array' then raise exception 'records must be an array'; end if;
  if jsonb_array_length(p_records)>500 then raise exception 'record batch exceeds 500'; end if;
  if not exists(select 1 from public.commerce_evidence_records e where e.id=p_evidence_id and e.organization_id=p_organization_id and e.connection_id=p_connection_id and e.provider_account_id=p_provider_account_id and e.source_object_type in ('transaction_page','transaction') and e.deleted_at is null) then raise exception 'verified transaction evidence unavailable'; end if;
  for r in select value from jsonb_array_elements(p_records) loop
    v_seen:=v_seen+1;
    if coalesce(r->>'public_transaction_id','') !~ '^ORD-[A-Za-z0-9_-]{1,120}$' then v_malformed:=v_malformed+1; continue; end if;
    v_valid:=v_valid+1;
    select count(distinct x->>'transaction_id') into v_count from jsonb_array_elements(p_records) x where x->>'public_transaction_id'=r->>'public_transaction_id';
    if v_count>1 then v_duplicate:=v_duplicate+1; continue; end if;
    select * into v_order_mapping from public.commerce_source_mappings m where m.organization_id=p_organization_id and m.connection_id=p_connection_id and m.provider_account_id=p_provider_account_id and m.source_object_type='transaction' and m.source_object_id=r->>'transaction_id' and m.canonical_object_type='order' and m.state='active';
    if not found then v_unmatched:=v_unmatched+1; continue; end if;
    select count(*) into v_count from public.commerce_source_mappings m where m.connection_id=p_connection_id and m.provider_account_id=p_provider_account_id and m.source_object_type='commas_public_transaction' and m.source_object_id=r->>'public_transaction_id' and (m.canonical_object_id<>v_order_mapping.canonical_object_id or m.state<>'active');
    if v_count>0 then v_ambiguous:=v_ambiguous+1; continue; end if;
    v_exact:=v_exact+1;
    if not p_dry_run then
      insert into public.commerce_source_mappings(organization_id,connection_id,provider_account_id,source_object_type,source_object_id,canonical_object_type,canonical_object_id,first_seen_at,last_seen_at,source_created_at,payload_hash,mapping_version,state,metadata)
      values(p_organization_id,p_connection_id,p_provider_account_id,'commas_public_transaction',r->>'public_transaction_id','order',v_order_mapping.canonical_object_id,coalesce((r->>'transaction_at')::timestamptz,now()),coalesce((r->>'transaction_at')::timestamptz,now()),nullif(r->>'transaction_at','')::timestamptz,coalesce(nullif(r->>'payload_hash',''),v_order_mapping.payload_hash),'commas-public-transaction-v1','active',jsonb_build_object('numeric_transaction_id',r->>'transaction_id','evidence_id',p_evidence_id,'provenance','provider_observed_transaction_page'))
      on conflict(connection_id,provider_account_id,source_object_type,source_object_id) do nothing;
      get diagnostics v_count=row_count; v_written:=v_written+v_count;
    end if;
  end loop;
  return query select v_seen,v_valid,(select count(distinct x->>'public_transaction_id')::int from jsonb_array_elements(p_records) x where coalesce(x->>'public_transaction_id','') ~ '^ORD-[A-Za-z0-9_-]{1,120}$'),v_exact,v_unmatched,v_ambiguous,v_duplicate,v_malformed,v_written;
end $$;

alter table public.commerce_provider_attribution_webhook_deliveries enable row level security;
alter table public.commerce_provider_attribution_observations enable row level security;
revoke all on public.commerce_provider_attribution_webhook_deliveries,public.commerce_provider_attribution_observations from public,anon,authenticated,authenticator,service_role;
grant select,insert on public.commerce_provider_attribution_webhook_deliveries to service_role;
grant select,insert,update on public.commerce_provider_attribution_observations to service_role;
revoke all on function public.record_commas_provider_attribution_observation_v1(uuid,uuid,uuid,uuid,text,text,text,timestamptz,text,text,text,jsonb,jsonb) from public,anon,authenticated,authenticator;
revoke all on function public.upsert_commas_public_transaction_mappings_v1(uuid,uuid,uuid,uuid,jsonb,boolean) from public,anon,authenticated,authenticator;
grant execute on function public.record_commas_provider_attribution_observation_v1(uuid,uuid,uuid,uuid,text,text,text,timestamptz,text,text,text,jsonb,jsonb) to service_role;
grant execute on function public.upsert_commas_public_transaction_mappings_v1(uuid,uuid,uuid,uuid,jsonb,boolean) to service_role;

comment on table public.commerce_provider_attribution_observations is 'Restricted provider-observed checkout attribution source facts. Never final attribution credit.';
comment on column public.commerce_provider_attribution_observations.restricted_metadata is 'Bounded key inventory only; complete additional_params remains in immutable restricted Evidence.';

commit;
