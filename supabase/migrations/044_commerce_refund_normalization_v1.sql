-- Evidence-backed Commas embedded Refund normalization.
-- The verified live shape contains id, payment_id, amount, amount_gross, fee,
-- refund_cost and created_at. No status, reason or currency is invented.

create table public.commerce_refund_events (
  id uuid primary key,
  account_id uuid not null,
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  canonical_order_id uuid not null,
  evidence_id uuid not null,
  source_mapping_id uuid not null,
  provider_refund_id text not null,
  provider_payment_id text,
  amount numeric,
  amount_gross numeric,
  provider_observed_fee numeric,
  provider_refund_cost numeric,
  occurred_at timestamptz not null,
  currency text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_refund_events_account_fk foreign key (organization_id,account_id) references public.tracekit_organizations(id,owning_account_id),
  constraint commerce_refund_events_provider_fk foreign key (organization_id,connection_id,provider_account_id) references public.commerce_provider_accounts(organization_id,connection_id,id),
  constraint commerce_refund_events_order_fk foreign key (organization_id,canonical_order_id) references public.platform_orders(organization_id,canonical_order_id),
  constraint commerce_refund_events_evidence_fk foreign key (organization_id,evidence_id) references public.commerce_evidence_records(organization_id,id),
  constraint commerce_refund_events_mapping_fk foreign key (organization_id,source_mapping_id) references public.commerce_source_mappings(organization_id,id),
  constraint commerce_refund_events_currency_check check(currency is null or currency ~ '^[A-Z]{3}$'),
  unique(connection_id,provider_account_id,provider_refund_id)
);
create unique index commerce_refund_events_org_id_uidx on public.commerce_refund_events(organization_id,id);
create index commerce_refund_events_order_idx on public.commerce_refund_events(organization_id,canonical_order_id,occurred_at);

create or replace function public.normalize_commerce_transaction_page_v2(
  p_organization_id uuid,p_account_id uuid,p_connection_id uuid,p_provider_account_id uuid,p_evidence_id uuid,p_records jsonb
) returns table(records_seen integer,orders_created integer,orders_updated integer,refunds_seen integer)
language plpgsql security invoker set search_path=public,pg_temp as $$
declare base record; r jsonb; f jsonb; v_refunds integer:=0;
begin
  select * into base from public.normalize_commerce_transaction_page_v1(p_organization_id,p_account_id,p_connection_id,p_provider_account_id,p_evidence_id,p_records);
  for r in select value from jsonb_array_elements(p_records) loop
    for f in select value from jsonb_array_elements(coalesce(r->'refunds','[]'::jsonb)) loop
      v_refunds:=v_refunds+1;
      if nullif(f->>'refund_id','') is null or nullif(f->>'occurred_at','') is null then raise exception 'required Refund identity missing'; end if;
      insert into public.commerce_source_mappings(id,organization_id,connection_id,provider_account_id,source_object_type,source_object_id,canonical_object_type,canonical_object_id,first_seen_at,last_seen_at,source_created_at,payload_hash,mapping_version,state,metadata)
      values((f->>'mapping_id')::uuid,p_organization_id,p_connection_id,p_provider_account_id,'refund',f->>'refund_id','refund',(f->>'refund_uuid')::uuid,(f->>'occurred_at')::timestamptz,(f->>'occurred_at')::timestamptz,(f->>'occurred_at')::timestamptz,f->>'payload_hash','commas-refund-v1','active','{}')
      on conflict(connection_id,provider_account_id,source_object_type,source_object_id) do update set last_seen_at=greatest(public.commerce_source_mappings.last_seen_at,excluded.last_seen_at),payload_hash=excluded.payload_hash,updated_at=now();
      insert into public.commerce_refund_events(id,account_id,organization_id,connection_id,provider_account_id,canonical_order_id,evidence_id,source_mapping_id,provider_refund_id,provider_payment_id,amount,amount_gross,provider_observed_fee,provider_refund_cost,occurred_at,currency)
      values((f->>'refund_uuid')::uuid,p_account_id,p_organization_id,p_connection_id,p_provider_account_id,(r->>'canonical_order_id')::uuid,p_evidence_id,(f->>'mapping_id')::uuid,f->>'refund_id',nullif(f->>'payment_id',''),nullif(f->>'amount','')::numeric,nullif(f->>'amount_gross','')::numeric,nullif(f->>'fee','')::numeric,nullif(f->>'refund_cost','')::numeric,(f->>'occurred_at')::timestamptz,nullif(r->>'currency',''))
      on conflict(connection_id,provider_account_id,provider_refund_id) do update set evidence_id=excluded.evidence_id,amount=excluded.amount,amount_gross=excluded.amount_gross,provider_observed_fee=excluded.provider_observed_fee,provider_refund_cost=excluded.provider_refund_cost,updated_at=now();
      insert into public.conversions(id,status,amount,currency,ledger_type,platform,workspace_id,occurred_at,event_source,ingestion_method,connector_id,account_id,organization_id,connection_id,provider_account_id,source_mapping_id,evidence_id,canonical_order_id,idempotency_key,reconciliation_state,data_quality_state,transaction_id,order_id)
      values((f->>'refund_event_id')::uuid,'observed',-abs((f->>'amount')::numeric),nullif(r->>'currency',''),'refund','commas',p_organization_id::text,(f->>'occurred_at')::timestamptz,'commas','shadow_sync','commas',p_account_id,p_organization_id,p_connection_id,p_provider_account_id,(f->>'mapping_id')::uuid,p_evidence_id,(r->>'canonical_order_id')::uuid,'refund:'||(f->>'refund_id'),'observed','review_required',r->>'transaction_id',r->>'transaction_id')
      on conflict(organization_id,connection_id,provider_account_id,idempotency_key) where organization_id is not null and connection_id is not null and provider_account_id is not null and idempotency_key is not null do nothing;
      if nullif(f->>'fee','') is not null and (f->>'fee')::numeric<>0 then
        insert into public.conversions(id,status,amount,currency,ledger_type,platform,workspace_id,occurred_at,event_source,ingestion_method,connector_id,account_id,organization_id,connection_id,provider_account_id,source_mapping_id,evidence_id,canonical_order_id,idempotency_key,reconciliation_state,data_quality_state,transaction_id,order_id,fee_type)
        values((f->>'refund_fee_event_id')::uuid,'observed',-abs((f->>'fee')::numeric),nullif(r->>'currency',''),'refund_fee','commas',p_organization_id::text,(f->>'occurred_at')::timestamptz,'commas','shadow_sync','commas',p_account_id,p_organization_id,p_connection_id,p_provider_account_id,(f->>'mapping_id')::uuid,p_evidence_id,(r->>'canonical_order_id')::uuid,'refund_fee:'||(f->>'refund_id'),'observed','review_required',r->>'transaction_id',r->>'transaction_id','provider_observed_refund_fee')
        on conflict(organization_id,connection_id,provider_account_id,idempotency_key) where organization_id is not null and connection_id is not null and provider_account_id is not null and idempotency_key is not null do nothing;
      end if;
    end loop;
  end loop;
  return query select base.records_seen,base.orders_created,base.orders_updated,v_refunds;
end; $$;

alter table public.commerce_refund_events enable row level security;
revoke all on public.commerce_refund_events from anon,authenticated;
grant select,insert,update,delete on public.commerce_refund_events to service_role;
revoke all on function public.normalize_commerce_transaction_page_v2(uuid,uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.normalize_commerce_transaction_page_v2(uuid,uuid,uuid,uuid,uuid,jsonb) to service_role;
comment on column public.commerce_refund_events.provider_observed_fee is 'Provider-observed Refund fee; not inferred processor cost.';
