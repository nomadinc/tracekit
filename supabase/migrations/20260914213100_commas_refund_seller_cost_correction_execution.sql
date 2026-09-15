-- Execution contract for a reviewed frozen Commas refund correction manifest.
-- No function executes automatically. Both RPCs are service-role only.
alter table public.commerce_refund_correction_manifest_rows add column account_id uuid;
alter table public.commerce_refund_correction_manifest_rows add column transaction_id text;
alter table public.commerce_refund_correction_manifest_rows
  add foreign key (organization_id,account_id) references public.tracekit_organizations(id,owning_account_id);

create or replace function public.freeze_commas_refund_seller_cost_correction_v1(
 p_organization_id uuid,p_connection_id uuid,p_provider_account_id uuid,p_source_fingerprint text,
 p_expected_refund_count integer,p_expected_legacy_loss numeric,p_expected_provider_cost numeric,p_expected_correction numeric
) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_manifest uuid:=gen_random_uuid(); v_count integer; v_legacy numeric; v_cost numeric; v_correction numeric;
begin
 if nullif(trim(p_source_fingerprint),'') is null then raise exception 'source fingerprint required'; end if;
 select refund_count,legacy_seller_loss,provider_refund_cost,correction_total into v_count,v_legacy,v_cost,v_correction
 from public.preview_commas_refund_seller_cost_correction_v1(p_organization_id,p_connection_id,p_provider_account_id);
 if v_count<>p_expected_refund_count or round(v_legacy,2)<>round(p_expected_legacy_loss,2) or round(v_cost,2)<>round(p_expected_provider_cost,2) or round(v_correction,2)<>round(p_expected_correction,2) then raise exception 'refund correction baseline changed'; end if;
 if exists(select 1 from public.commerce_refund_events where organization_id=p_organization_id and connection_id=p_connection_id and provider_account_id=p_provider_account_id and round(coalesce(amount_gross,0)+coalesce(provider_observed_fee,0),2)<>round(coalesce(provider_refund_cost,0),2)) then raise exception 'provider refund components do not conserve'; end if;
 insert into public.commerce_refund_correction_manifests(id,organization_id,connection_id,provider_account_id,policy_version,source_refund_count,source_legacy_loss,source_provider_refund_cost,correction_total,source_fingerprint)
 values(v_manifest,p_organization_id,p_connection_id,p_provider_account_id,'commas-refund-seller-cost-correction-v1',v_count,v_legacy,v_cost,v_correction,p_source_fingerprint);
 insert into public.commerce_refund_correction_manifest_rows(manifest_id,organization_id,connection_id,provider_account_id,account_id,provider_refund_id,canonical_order_id,evidence_id,source_mapping_id,legacy_refund_event_id,legacy_refund_fee_event_id,buyer_amount,creator_amount,processor_fee,provider_refund_cost,legacy_seller_loss,correction_amount,occurred_at,transaction_id)
 select v_manifest,r.organization_id,r.connection_id,r.provider_account_id,r.account_id,r.provider_refund_id,r.canonical_order_id,r.evidence_id,r.source_mapping_id,cr.id,cf.id,r.amount,r.amount_gross,coalesce(r.provider_observed_fee,0),r.provider_refund_cost,abs(cr.amount)+coalesce(abs(cf.amount),0),round(abs(cr.amount)+coalesce(abs(cf.amount),0)-r.provider_refund_cost,2),r.occurred_at,cr.transaction_id
 from public.commerce_refund_events r join public.conversions cr on cr.organization_id=r.organization_id and cr.connection_id=r.connection_id and cr.provider_account_id=r.provider_account_id and cr.idempotency_key='refund:'||r.provider_refund_id
 left join public.conversions cf on cf.organization_id=r.organization_id and cf.connection_id=r.connection_id and cf.provider_account_id=r.provider_account_id and cf.idempotency_key='refund_fee:'||r.provider_refund_id
 where r.organization_id=p_organization_id and r.connection_id=p_connection_id and r.provider_account_id=p_provider_account_id;
 return v_manifest;
end $$;

create or replace function public.apply_commas_refund_seller_cost_correction_v1(p_manifest_id uuid,p_expected_source_fingerprint text)
returns table(correction_rows integer,correction_total numeric) language plpgsql security invoker set search_path=public,pg_temp as $$
declare m record; v_rows integer; v_total numeric;
begin
 select * into m from public.commerce_refund_correction_manifests where id=p_manifest_id for update;
 if not found or m.source_fingerprint<>p_expected_source_fingerprint then raise exception 'refund correction manifest mismatch'; end if;
 if m.applied_at is not null then
   return query select count(*)::integer,coalesce(sum(amount),0)::numeric from public.conversions where organization_id=m.organization_id and connection_id=m.connection_id and provider_account_id=m.provider_account_id and idempotency_key like 'reversal:commas-refund-seller-cost-correction-v1:%'; return;
 end if;
 if exists(select 1 from public.commerce_refund_correction_manifest_rows r left join public.conversions cr on cr.id=r.legacy_refund_event_id left join public.conversions cf on cf.id=r.legacy_refund_fee_event_id where r.manifest_id=p_manifest_id and (cr.id is null or abs(cr.amount)+coalesce(abs(cf.amount),0)<>r.legacy_seller_loss)) then raise exception 'legacy ledger changed after freeze'; end if;
 insert into public.conversions(id,status,amount,currency,ledger_type,platform,workspace_id,occurred_at,event_source,ingestion_method,connector_id,account_id,organization_id,connection_id,provider_account_id,source_mapping_id,evidence_id,canonical_order_id,idempotency_key,reconciliation_state,data_quality_state,transaction_id,order_id,source_event_id,reason,meta)
 select gen_random_uuid(),'corrected',r.correction_amount,'USD','reversal','commas',r.organization_id::text,r.occurred_at,'commas_refund_seller_cost_correction','operator_reconciliation','commas',r.account_id,r.organization_id,r.connection_id,r.provider_account_id,r.source_mapping_id,r.evidence_id,r.canonical_order_id,'reversal:commas-refund-seller-cost-correction-v1:'||r.provider_refund_id,'reconciled','verified',r.transaction_id,r.transaction_id,'refund-cost-correction:'||r.provider_refund_id,'Provider-confirmed refund_cost correction',jsonb_build_object('policy_version','commas-refund-seller-cost-correction-v1','provider_refund_id',r.provider_refund_id,'legacy_seller_loss',r.legacy_seller_loss,'provider_refund_cost',r.provider_refund_cost)
 from public.commerce_refund_correction_manifest_rows r where r.manifest_id=p_manifest_id and r.correction_amount>0
 on conflict(organization_id,connection_id,provider_account_id,idempotency_key) where organization_id is not null and connection_id is not null and provider_account_id is not null and idempotency_key is not null do nothing;
 select count(*)::integer,coalesce(sum(amount),0)::numeric into v_rows,v_total from public.conversions where organization_id=m.organization_id and connection_id=m.connection_id and provider_account_id=m.provider_account_id and idempotency_key like 'reversal:commas-refund-seller-cost-correction-v1:%';
 if v_rows<>(select count(*) from public.commerce_refund_correction_manifest_rows where manifest_id=p_manifest_id and correction_amount>0) or round(v_total,2)<>round(m.correction_total,2) then raise exception 'refund correction conservation failed'; end if;
 update public.commerce_refund_correction_manifests set applied_at=now() where id=p_manifest_id;
 return query select v_rows,v_total;
end $$;

revoke all on function public.freeze_commas_refund_seller_cost_correction_v1(uuid,uuid,uuid,text,integer,numeric,numeric,numeric) from public,anon,authenticated,authenticator;
revoke all on function public.apply_commas_refund_seller_cost_correction_v1(uuid,text) from public,anon,authenticated,authenticator;
grant execute on function public.freeze_commas_refund_seller_cost_correction_v1(uuid,uuid,uuid,text,integer,numeric,numeric,numeric) to service_role;
grant execute on function public.apply_commas_refund_seller_cost_correction_v1(uuid,text) to service_role;
