-- Bind the correction manifest to the exact provider/refund/legacy-ledger cohort.
create or replace function public.commas_refund_seller_cost_source_fingerprint_v1(
 p_organization_id uuid,p_connection_id uuid,p_provider_account_id uuid
) returns text language sql security invoker set search_path=public,pg_temp as $$
with cohort as (
 select r.provider_refund_id,r.canonical_order_id,r.evidence_id,r.source_mapping_id,r.amount,r.amount_gross,r.provider_observed_fee,r.provider_refund_cost,
   cr.id refund_ledger_id,cr.amount refund_ledger_amount,cf.id fee_ledger_id,cf.amount fee_ledger_amount,
   round(abs(cr.amount)+coalesce(abs(cf.amount),0)-r.provider_refund_cost,2) correction_amount
 from public.commerce_refund_events r
 join public.conversions cr on cr.organization_id=r.organization_id and cr.connection_id=r.connection_id and cr.provider_account_id=r.provider_account_id and cr.idempotency_key='refund:'||r.provider_refund_id
 left join public.conversions cf on cf.organization_id=r.organization_id and cf.connection_id=r.connection_id and cf.provider_account_id=r.provider_account_id and cf.idempotency_key='refund_fee:'||r.provider_refund_id
 where r.organization_id=p_organization_id and r.connection_id=p_connection_id and r.provider_account_id=p_provider_account_id
), serialized as (
 select string_agg(provider_refund_id||'|'||canonical_order_id||'|'||evidence_id||'|'||source_mapping_id||'|'||amount||'|'||amount_gross||'|'||coalesce(provider_observed_fee,0)||'|'||provider_refund_cost||'|'||refund_ledger_id||'|'||refund_ledger_amount||'|'||coalesce(fee_ledger_id::text,'')||'|'||coalesce(fee_ledger_amount,0)||'|'||correction_amount,E'\n' order by provider_refund_id) body from cohort
)
select encode(sha256(convert_to(coalesce(body,''),'UTF8')),'hex') from serialized;
$$;

create or replace function public.freeze_commas_refund_seller_cost_correction_v1(
 p_organization_id uuid,p_connection_id uuid,p_provider_account_id uuid,p_source_fingerprint text,
 p_expected_refund_count integer,p_expected_legacy_loss numeric,p_expected_provider_cost numeric,p_expected_correction numeric
) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_manifest uuid:=gen_random_uuid(); v_count integer; v_legacy numeric; v_cost numeric; v_correction numeric; v_fingerprint text;
begin
 if nullif(trim(p_source_fingerprint),'') is null then raise exception 'source fingerprint required'; end if;
 select public.commas_refund_seller_cost_source_fingerprint_v1(p_organization_id,p_connection_id,p_provider_account_id) into v_fingerprint;
 if v_fingerprint<>p_source_fingerprint then raise exception 'refund correction source fingerprint changed'; end if;
 select refund_count,legacy_seller_loss,provider_refund_cost,correction_total into v_count,v_legacy,v_cost,v_correction from public.preview_commas_refund_seller_cost_correction_v1(p_organization_id,p_connection_id,p_provider_account_id);
 if v_count<>p_expected_refund_count or round(v_legacy,2)<>round(p_expected_legacy_loss,2) or round(v_cost,2)<>round(p_expected_provider_cost,2) or round(v_correction,2)<>round(p_expected_correction,2) then raise exception 'refund correction baseline changed'; end if;
 if exists(select 1 from public.commerce_refund_events where organization_id=p_organization_id and connection_id=p_connection_id and provider_account_id=p_provider_account_id and round(coalesce(amount_gross,0)+coalesce(provider_observed_fee,0),2)<>round(coalesce(provider_refund_cost,0),2)) then raise exception 'provider refund components do not conserve'; end if;
 insert into public.commerce_refund_correction_manifests(id,organization_id,connection_id,provider_account_id,policy_version,source_refund_count,source_legacy_loss,source_provider_refund_cost,correction_total,source_fingerprint) values(v_manifest,p_organization_id,p_connection_id,p_provider_account_id,'commas-refund-seller-cost-correction-v1',v_count,v_legacy,v_cost,v_correction,v_fingerprint);
 insert into public.commerce_refund_correction_manifest_rows(manifest_id,organization_id,connection_id,provider_account_id,account_id,provider_refund_id,canonical_order_id,evidence_id,source_mapping_id,legacy_refund_event_id,legacy_refund_fee_event_id,buyer_amount,creator_amount,processor_fee,provider_refund_cost,legacy_seller_loss,correction_amount,occurred_at,transaction_id)
 select v_manifest,r.organization_id,r.connection_id,r.provider_account_id,r.account_id,r.provider_refund_id,r.canonical_order_id,r.evidence_id,r.source_mapping_id,cr.id,cf.id,r.amount,r.amount_gross,coalesce(r.provider_observed_fee,0),r.provider_refund_cost,abs(cr.amount)+coalesce(abs(cf.amount),0),round(abs(cr.amount)+coalesce(abs(cf.amount),0)-r.provider_refund_cost,2),r.occurred_at,cr.transaction_id
 from public.commerce_refund_events r join public.conversions cr on cr.organization_id=r.organization_id and cr.connection_id=r.connection_id and cr.provider_account_id=r.provider_account_id and cr.idempotency_key='refund:'||r.provider_refund_id left join public.conversions cf on cf.organization_id=r.organization_id and cf.connection_id=r.connection_id and cf.provider_account_id=r.provider_account_id and cf.idempotency_key='refund_fee:'||r.provider_refund_id
 where r.organization_id=p_organization_id and r.connection_id=p_connection_id and r.provider_account_id=p_provider_account_id;
 return v_manifest;
end $$;

revoke all on function public.commas_refund_seller_cost_source_fingerprint_v1(uuid,uuid,uuid) from public,anon,authenticated,authenticator;
grant execute on function public.commas_refund_seller_cost_source_fingerprint_v1(uuid,uuid,uuid) to service_role;
