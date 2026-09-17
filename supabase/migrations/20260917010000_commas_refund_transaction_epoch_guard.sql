-- Preserve historical refund rows while suppressing all post-epoch transaction-page money writes.
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
      if public.commas_refund_transaction_page_economic_owner_v1(p_organization_id,p_connection_id,p_provider_account_id,(f->>'occurred_at')::timestamptz) then
      insert into public.conversions(id,status,amount,currency,ledger_type,platform,workspace_id,occurred_at,event_source,ingestion_method,connector_id,account_id,organization_id,connection_id,provider_account_id,source_mapping_id,evidence_id,canonical_order_id,idempotency_key,reconciliation_state,data_quality_state,transaction_id,order_id)
      values((f->>'refund_event_id')::uuid,'observed',-abs((f->>'amount')::numeric),nullif(r->>'currency',''),'refund','commas',p_organization_id::text,(f->>'occurred_at')::timestamptz,'commas','shadow_sync','commas',p_account_id,p_organization_id,p_connection_id,p_provider_account_id,(f->>'mapping_id')::uuid,p_evidence_id,(r->>'canonical_order_id')::uuid,'refund:'||(f->>'refund_id'),'observed','review_required',r->>'transaction_id',r->>'transaction_id')
      on conflict(organization_id,connection_id,provider_account_id,idempotency_key) where organization_id is not null and connection_id is not null and provider_account_id is not null and idempotency_key is not null do nothing;
      if nullif(f->>'fee','') is not null and (f->>'fee')::numeric<>0 then
        insert into public.conversions(id,status,amount,currency,ledger_type,platform,workspace_id,occurred_at,event_source,ingestion_method,connector_id,account_id,organization_id,connection_id,provider_account_id,source_mapping_id,evidence_id,canonical_order_id,idempotency_key,reconciliation_state,data_quality_state,transaction_id,order_id,fee_type)
        values((f->>'refund_fee_event_id')::uuid,'observed',-abs((f->>'fee')::numeric),nullif(r->>'currency',''),'refund_fee','commas',p_organization_id::text,(f->>'occurred_at')::timestamptz,'commas','shadow_sync','commas',p_account_id,p_organization_id,p_connection_id,p_provider_account_id,(f->>'mapping_id')::uuid,p_evidence_id,(r->>'canonical_order_id')::uuid,'refund_fee:'||(f->>'refund_id'),'observed','review_required',r->>'transaction_id',r->>'transaction_id','provider_observed_refund_fee')
        on conflict(organization_id,connection_id,provider_account_id,idempotency_key) where organization_id is not null and connection_id is not null and provider_account_id is not null and idempotency_key is not null do nothing;
      end if;
      end if;
    end loop;
  end loop;
  return query select base.records_seen,base.orders_created,base.orders_updated,v_refunds;
end; $$;
