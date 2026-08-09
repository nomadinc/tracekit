-- TraceKit Commerce Shadow Ingestion v1.
-- Additive persistence and atomic normalization contracts for evidence-backed
-- provider pages and historical dispute evidence. No repository activation is
-- created and no provider data is seeded by this migration.

create unique index platform_orders_organization_canonical_order_uidx
  on public.platform_orders (organization_id, canonical_order_id);

create table public.commerce_order_lines (
  id uuid primary key,
  account_id uuid not null references public.tracekit_accounts(id),
  organization_id uuid not null references public.tracekit_organizations(id),
  connection_id uuid not null references public.commerce_provider_connections(id),
  provider_account_id uuid not null references public.commerce_provider_accounts(id),
  canonical_order_id uuid not null references public.platform_orders(canonical_order_id),
  provider_product_id uuid references public.commerce_provider_products(id),
  evidence_id uuid not null references public.commerce_evidence_records(id),
  source_line_key text not null,
  quantity numeric not null default 1,
  unit_amount numeric,
  gross_amount numeric,
  currency text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_order_lines_scope_fk foreign key (organization_id, connection_id, provider_account_id)
    references public.commerce_provider_accounts (organization_id, connection_id, id),
  constraint commerce_order_lines_order_scope_fk foreign key (organization_id, canonical_order_id)
    references public.platform_orders (organization_id, canonical_order_id),
  constraint commerce_order_lines_product_scope_fk foreign key (organization_id, provider_product_id)
    references public.commerce_provider_products (organization_id, id),
  constraint commerce_order_lines_evidence_scope_fk foreign key (organization_id, evidence_id)
    references public.commerce_evidence_records (organization_id, id),
  constraint commerce_order_lines_quantity_check check (quantity > 0),
  constraint commerce_order_lines_currency_check check (currency is null or currency ~ '^[A-Z]{3}$'),
  constraint commerce_order_lines_metadata_safe_check check (public.financial_reconciliation_metadata_is_safe(metadata)),
  unique (connection_id, provider_account_id, canonical_order_id, source_line_key)
);

create index commerce_order_lines_order_idx on public.commerce_order_lines (organization_id, canonical_order_id);
create unique index commerce_order_lines_org_id_uidx on public.commerce_order_lines (organization_id, id);

create table public.commerce_historical_dispute_imports (
  id uuid primary key,
  account_id uuid not null,
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  sync_run_id uuid not null,
  evidence_id uuid not null,
  import_identity text not null,
  workbook_hash text not null,
  source_filename text not null,
  accepted_rows integer not null,
  rejected_rows integer not null,
  imported_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint commerce_historical_dispute_imports_account_fk foreign key (organization_id, account_id)
    references public.tracekit_organizations (id, owning_account_id),
  constraint commerce_historical_dispute_imports_account_scope_fk foreign key (organization_id, connection_id, provider_account_id)
    references public.commerce_provider_accounts (organization_id, connection_id, id),
  constraint commerce_historical_dispute_imports_run_fk foreign key (organization_id, connection_id, provider_account_id, sync_run_id)
    references public.commerce_sync_runs (organization_id, connection_id, provider_account_id, id),
  constraint commerce_historical_dispute_imports_evidence_fk foreign key (organization_id, evidence_id)
    references public.commerce_evidence_records (organization_id, id),
  constraint commerce_historical_dispute_imports_count_check check (accepted_rows >= 0 and rejected_rows >= 0),
  constraint commerce_historical_dispute_imports_metadata_safe_check check (public.financial_reconciliation_metadata_is_safe(metadata)),
  unique (connection_id, provider_account_id, workbook_hash)
);

create unique index commerce_historical_dispute_imports_org_id_uidx
  on public.commerce_historical_dispute_imports (organization_id, id);

create table public.commerce_historical_disputes (
  id uuid primary key,
  account_id uuid not null,
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  import_id uuid not null,
  evidence_id uuid not null,
  source_row_identity text not null,
  source_row_number integer not null,
  state text,
  status text,
  transaction_date date,
  dispute_date date,
  closed_date date,
  customer_email_normalized text,
  product_evidence text,
  amount numeric,
  dispute_fee numeric,
  payment_method text,
  reason text,
  matching_state text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_historical_disputes_account_fk foreign key (organization_id, account_id)
    references public.tracekit_organizations (id, owning_account_id),
  constraint commerce_historical_disputes_provider_scope_fk foreign key (organization_id, connection_id, provider_account_id)
    references public.commerce_provider_accounts (organization_id, connection_id, id),
  constraint commerce_historical_disputes_import_fk foreign key (organization_id, import_id)
    references public.commerce_historical_dispute_imports (organization_id, id),
  constraint commerce_historical_disputes_evidence_fk foreign key (organization_id, evidence_id)
    references public.commerce_evidence_records (organization_id, id),
  constraint commerce_historical_disputes_row_check check (source_row_number >= 2),
  constraint commerce_historical_disputes_matching_check check (matching_state in ('pending','high_confidence','medium_confidence','needs_review','unmatched')),
  unique (import_id, source_row_identity)
);

create unique index commerce_historical_disputes_org_id_uidx on public.commerce_historical_disputes (organization_id, id);
create index commerce_historical_disputes_candidate_idx on public.commerce_historical_disputes
  (organization_id, connection_id, customer_email_normalized, transaction_date, amount);

create table public.commerce_dispute_reconciliations (
  id uuid primary key,
  organization_id uuid not null,
  connection_id uuid not null,
  dispute_id uuid not null,
  algorithm_version text not null,
  confidence_band text not null,
  numeric_score integer,
  candidate_count integer not null,
  matched_canonical_order_id uuid,
  evidence_factors jsonb not null default '{}'::jsonb,
  reconciled_at timestamptz not null default now(),
  constraint commerce_dispute_reconciliations_connection_fk foreign key (organization_id, connection_id)
    references public.commerce_provider_connections (organization_id, id),
  constraint commerce_dispute_reconciliations_dispute_fk foreign key (organization_id, dispute_id)
    references public.commerce_historical_disputes (organization_id, id),
  constraint commerce_dispute_reconciliations_order_fk foreign key (organization_id, matched_canonical_order_id)
    references public.platform_orders (organization_id, canonical_order_id),
  constraint commerce_dispute_reconciliations_confidence_check check (confidence_band in ('high_confidence','medium_confidence','needs_review','unmatched')),
  constraint commerce_dispute_reconciliations_score_check check (numeric_score is null or numeric_score between 0 and 100),
  constraint commerce_dispute_reconciliations_candidates_check check (candidate_count >= 0),
  constraint commerce_dispute_reconciliations_evidence_safe_check check (public.financial_reconciliation_metadata_is_safe(evidence_factors)),
  unique (dispute_id, algorithm_version)
);

create index commerce_dispute_reconciliations_order_idx
  on public.commerce_dispute_reconciliations (organization_id, matched_canonical_order_id);

create or replace function public.normalize_commerce_transaction_page_v1(
  p_organization_id uuid,
  p_account_id uuid,
  p_connection_id uuid,
  p_provider_account_id uuid,
  p_evidence_id uuid,
  p_records jsonb
)
returns table(records_seen integer, orders_created integer, orders_updated integer)
language plpgsql security invoker set search_path = public, pg_temp as $$
declare r jsonb; v_existing boolean; v_existing_person uuid; v_seen integer := 0; v_created integer := 0; v_updated integer := 0;
begin
  if jsonb_typeof(p_records) <> 'array' then raise exception 'records must be an array'; end if;
  if not exists (select 1 from public.commerce_evidence_records e where e.id=p_evidence_id and e.organization_id=p_organization_id and e.connection_id=p_connection_id and e.provider_account_id=p_provider_account_id and e.deleted_at is null) then
    raise exception 'verified evidence scope unavailable';
  end if;

  for r in select value from jsonb_array_elements(p_records) loop
    v_seen := v_seen + 1;
    if nullif(r->>'transaction_id','') is null or nullif(r->>'fan_id','') is null or nullif(r->>'product_id','') is null then
      raise exception 'required normalized transaction identity missing';
    end if;
    if exists (select 1 from public.platform_orders where platform_order_id=r->>'platform_order_id' and (connection_id<>p_connection_id or provider_account_id<>p_provider_account_id or provider_order_id<>r->>'transaction_id')) then
      raise exception 'platform order identity collision';
    end if;
    select person_id into v_existing_person from public.person_source_identities
      where connection_id=p_connection_id and provider_account_id=p_provider_account_id
        and source_type='provider_customer_id' and source_id=r->>'fan_id' limit 1;
    if v_existing_person is not null then
      r := jsonb_set(r,'{person_id}',to_jsonb(v_existing_person::text));
    end if;

    insert into public.people (id,workspace_id,status,display_name,primary_email,primary_phone,first_seen_at,last_seen_at,metadata,organization_id)
    values ((r->>'person_id')::uuid,p_organization_id::text,'active',nullif(r->>'customer_name',''),nullif(r->>'customer_email',''),nullif(r->>'customer_phone',''),(r->>'transaction_at')::timestamptz,(r->>'transaction_at')::timestamptz,'{}',p_organization_id)
    on conflict (id) do update set last_seen_at=greatest(public.people.last_seen_at,excluded.last_seen_at), primary_email=coalesce(excluded.primary_email,public.people.primary_email), primary_phone=coalesce(excluded.primary_phone,public.people.primary_phone), updated_at=now();

    insert into public.person_source_identities (id,organization_id,person_id,connection_id,provider_account_id,source_type,source_id,normalized_value,confidence,status,first_seen_at,last_seen_at,evidence_id,metadata)
    values ((r->>'customer_identity_id')::uuid,p_organization_id,(r->>'person_id')::uuid,p_connection_id,p_provider_account_id,'provider_customer_id',r->>'fan_id',null,1,'verified',(r->>'transaction_at')::timestamptz,(r->>'transaction_at')::timestamptz,p_evidence_id,'{}')
    on conflict (connection_id,provider_account_id,source_type,source_id) where source_type='provider_customer_id'
    do update set last_seen_at=greatest(public.person_source_identities.last_seen_at,excluded.last_seen_at),evidence_id=excluded.evidence_id,updated_at=now();

    if nullif(r->>'customer_email','') is not null then
      insert into public.person_source_identities (id,organization_id,person_id,connection_id,provider_account_id,source_type,source_id,normalized_value,confidence,status,first_seen_at,last_seen_at,evidence_id,metadata)
      values ((r->>'email_identity_id')::uuid,p_organization_id,(r->>'person_id')::uuid,p_connection_id,p_provider_account_id,'email',r->>'customer_email',r->>'customer_email',0.7,'observed',(r->>'transaction_at')::timestamptz,(r->>'transaction_at')::timestamptz,p_evidence_id,'{}')
      on conflict (id) do update set last_seen_at=greatest(public.person_source_identities.last_seen_at,excluded.last_seen_at),evidence_id=excluded.evidence_id,updated_at=now();
    end if;

    insert into public.commerce_provider_products (id,organization_id,connection_id,provider_account_id,provider_product_id,title,internal_name,description,currency,first_observed_price,latest_observed_price,payment_link_hash,evidence_id,first_seen_at,last_seen_at,mapping_status,mapping_version,metadata)
    values ((r->>'product_uuid')::uuid,p_organization_id,p_connection_id,p_provider_account_id,r->>'product_id',coalesce(nullif(r->>'product_title',''),'Unknown provider Product'),nullif(r->>'product_internal_name',''),nullif(r->>'product_description',''),nullif(r->>'currency',''),nullif(r->>'product_price','')::numeric,nullif(r->>'product_price','')::numeric,nullif(r->>'payment_link_hash',''),p_evidence_id,(r->>'transaction_at')::timestamptz,(r->>'transaction_at')::timestamptz,'review_required','unmapped-v1','{}')
    on conflict (connection_id,provider_account_id,provider_product_id) do update set title=excluded.title,internal_name=coalesce(excluded.internal_name,public.commerce_provider_products.internal_name),description=coalesce(excluded.description,public.commerce_provider_products.description),latest_observed_price=coalesce(excluded.latest_observed_price,public.commerce_provider_products.latest_observed_price),payment_link_hash=coalesce(excluded.payment_link_hash,public.commerce_provider_products.payment_link_hash),evidence_id=excluded.evidence_id,last_seen_at=greatest(public.commerce_provider_products.last_seen_at,excluded.last_seen_at),updated_at=now();

    insert into public.commerce_source_mappings (id,organization_id,connection_id,provider_account_id,source_object_type,source_object_id,canonical_object_type,canonical_object_id,first_seen_at,last_seen_at,source_created_at,payload_hash,mapping_version,state,metadata)
    values ((r->>'order_mapping_id')::uuid,p_organization_id,p_connection_id,p_provider_account_id,'transaction',r->>'transaction_id','order',(r->>'canonical_order_id')::uuid,(r->>'transaction_at')::timestamptz,(r->>'transaction_at')::timestamptz,(r->>'transaction_at')::timestamptz,r->>'payload_hash','commas-transaction-v1','active','{}')
    on conflict (connection_id,provider_account_id,source_object_type,source_object_id) do update set last_seen_at=greatest(public.commerce_source_mappings.last_seen_at,excluded.last_seen_at),payload_hash=excluded.payload_hash,updated_at=now();

    select exists(select 1 from public.platform_orders where connection_id=p_connection_id and provider_account_id=p_provider_account_id and provider_order_id=r->>'transaction_id') into v_existing;
    insert into public.platform_orders (platform,platform_order_id,order_ts,status,status_norm,currency,gross_amount,product_subtotal,gateway_fee,raw,raw_json,workspace_id,person_id,canonical_order_id,account_id,organization_id,connection_id,provider_account_id,source_mapping_id,evidence_id,provider_product_id,provider_fee,provider_net,payment_reference,payment_type,fund_release_on,fund_released,reconciliation_state,data_quality_state,provider_order_id,transaction_id,order_id)
    values ('commas',r->>'platform_order_id',(r->>'transaction_at')::timestamptz,'observed','observed',nullif(r->>'currency',''),nullif(r->>'gross_amount','')::numeric,nullif(r->>'gross_amount','')::numeric,null,null,null,p_organization_id::text,(r->>'person_id')::uuid,(r->>'canonical_order_id')::uuid,p_account_id,p_organization_id,p_connection_id,p_provider_account_id,(r->>'order_mapping_id')::uuid,p_evidence_id,(r->>'product_uuid')::uuid,nullif(r->>'provider_fee','')::numeric,nullif(r->>'provider_net','')::numeric,nullif(r->>'payment_reference',''),nullif(r->>'payment_type',''),nullif(r->>'fund_release_on','')::timestamptz,nullif(r->>'fund_released','')::boolean,'observed','review_required',r->>'transaction_id',r->>'transaction_id',r->>'transaction_id')
    on conflict (platform_order_id) do update set updated_at=now(),evidence_id=excluded.evidence_id,person_id=excluded.person_id,provider_product_id=excluded.provider_product_id,gross_amount=excluded.gross_amount,product_subtotal=excluded.product_subtotal,provider_fee=excluded.provider_fee,provider_net=excluded.provider_net,payment_reference=excluded.payment_reference,payment_type=excluded.payment_type,fund_release_on=excluded.fund_release_on,fund_released=excluded.fund_released;

    insert into public.commerce_order_lines (id,account_id,organization_id,connection_id,provider_account_id,canonical_order_id,provider_product_id,evidence_id,source_line_key,quantity,unit_amount,gross_amount,currency,metadata)
    values ((r->>'order_line_id')::uuid,p_account_id,p_organization_id,p_connection_id,p_provider_account_id,(r->>'canonical_order_id')::uuid,(r->>'product_uuid')::uuid,p_evidence_id,'product:0',1,nullif(r->>'gross_amount','')::numeric,nullif(r->>'gross_amount','')::numeric,nullif(r->>'currency',''),'{}')
    on conflict (connection_id,provider_account_id,canonical_order_id,source_line_key) do update set evidence_id=excluded.evidence_id,provider_product_id=excluded.provider_product_id,unit_amount=excluded.unit_amount,gross_amount=excluded.gross_amount,currency=excluded.currency,updated_at=now();

    insert into public.conversions (id,status,amount,currency,ledger_type,platform,workspace_id,occurred_at,event_source,ingestion_method,connector_id,account_id,organization_id,connection_id,provider_account_id,source_mapping_id,evidence_id,canonical_order_id,idempotency_key,reconciliation_state,data_quality_state,transaction_id,order_id)
    values ((r->>'sale_event_id')::uuid,'observed',nullif(r->>'gross_amount','')::numeric,nullif(r->>'currency',''),'sale','commas',p_organization_id::text,(r->>'transaction_at')::timestamptz,'commas','shadow_sync','commas',p_account_id,p_organization_id,p_connection_id,p_provider_account_id,(r->>'order_mapping_id')::uuid,p_evidence_id,(r->>'canonical_order_id')::uuid,'sale:'||(r->>'transaction_id'),'observed','review_required',r->>'transaction_id',r->>'transaction_id')
    on conflict (organization_id,connection_id,provider_account_id,idempotency_key) where organization_id is not null and connection_id is not null and provider_account_id is not null and idempotency_key is not null do nothing;
    if nullif(r->>'provider_fee','') is not null then
      insert into public.conversions (id,status,amount,currency,ledger_type,platform,workspace_id,occurred_at,event_source,ingestion_method,connector_id,account_id,organization_id,connection_id,provider_account_id,source_mapping_id,evidence_id,canonical_order_id,idempotency_key,reconciliation_state,data_quality_state,transaction_id,order_id,fee_type)
      values ((r->>'fee_event_id')::uuid,'observed',-abs((r->>'provider_fee')::numeric),nullif(r->>'currency',''),'provider_fee','commas',p_organization_id::text,(r->>'transaction_at')::timestamptz,'commas','shadow_sync','commas',p_account_id,p_organization_id,p_connection_id,p_provider_account_id,(r->>'order_mapping_id')::uuid,p_evidence_id,(r->>'canonical_order_id')::uuid,'provider_fee:'||(r->>'transaction_id'),'observed','review_required',r->>'transaction_id',r->>'transaction_id','provider_observed')
      on conflict (organization_id,connection_id,provider_account_id,idempotency_key) where organization_id is not null and connection_id is not null and provider_account_id is not null and idempotency_key is not null do nothing;
    end if;
    if v_existing then v_updated:=v_updated+1; else v_created:=v_created+1; end if;
  end loop;
  return query select v_seen,v_created,v_updated;
end; $$;

create or replace view public.commerce_chargeback_product_intelligence_v1 as
select d.organization_id,d.connection_id,coalesce(nullif(d.product_evidence,''),'Unknown') as product,
  count(*) as historical_disputes,coalesce(sum(d.amount),0) as disputed_amount,coalesce(sum(d.dispute_fee),0) as dispute_fees,
  count(*) filter(where r.confidence_band in ('high_confidence','medium_confidence')) as defensible_matches,
  count(*) filter(where r.confidence_band='high_confidence') as high_confidence,
  count(*) filter(where r.confidence_band='medium_confidence') as medium_confidence,
  count(*) filter(where r.confidence_band='needs_review') as needs_review,
  count(*) filter(where r.confidence_band='unmatched') as unmatched,
  avg(d.dispute_date-d.transaction_date) filter(where d.dispute_date is not null and d.transaction_date is not null) as average_days_to_dispute
from public.commerce_historical_disputes d
left join public.commerce_dispute_reconciliations r on r.dispute_id=d.id and r.algorithm_version='historical-v1'
group by d.organization_id,d.connection_id,coalesce(nullif(d.product_evidence,''),'Unknown');

do $$ declare t text; begin
  foreach t in array array['commerce_order_lines','commerce_historical_dispute_imports','commerce_historical_disputes','commerce_dispute_reconciliations'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from anon, authenticated',t);
    execute format('grant select,insert,update,delete on table public.%I to service_role',t);
  end loop;
end $$;
revoke all on public.commerce_chargeback_product_intelligence_v1 from anon,authenticated;
grant select on public.commerce_chargeback_product_intelligence_v1 to service_role;
revoke all on function public.normalize_commerce_transaction_page_v1(uuid,uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.normalize_commerce_transaction_page_v1(uuid,uuid,uuid,uuid,uuid,jsonb) to service_role;

comment on table public.commerce_order_lines is 'Evidence-backed canonical commerce Order Lines; provider pages never render directly.';
comment on table public.commerce_historical_disputes is 'Normalized historical dispute-export evidence; not native provider API truth.';
