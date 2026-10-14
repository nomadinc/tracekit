-- Review only, outside migrations. Depends on PR #569 currency columns and
-- the isolated preparation identity audit. No runtime grants.
create function public.read_commas_customer_disputes_prepared(
 p_org uuid,p_person uuid,p_after uuid default null,p_limit integer default 50
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if p_org is null or p_person is null or p_limit is null or p_limit<1 or p_limit>100 then raise exception 'customer_dispute_scope_invalid'; end if;
 if not exists(select 1 from public.people where id=p_person and organization_id=p_org and workspace_id=p_org::text and status='active') then raise exception 'customer_not_found'; end if;
 with eligible as (
  select d.id,d.provider_dispute_id,d.matched_canonical_order_id,d.status,d.amount,d.fee,
   case when d.currency_source in ('provider_payload.currency','workbook.Currency') and d.currency ~ '^[A-Z]{3}$' then d.currency end principal_currency,
   case when d.fee_currency_source in ('provider_payload.fee_currency','workbook.Fee Currency') and d.fee_currency ~ '^[A-Z]{3}$' then d.fee_currency end fee_currency,
   o.tkid is not null and btrim(o.tkid)<>'' tracking_available
  from public.commerce_provider_disputes d
  join public.tracekit_customer_order_read_model o on o.organization_id=d.organization_id and o.connection_id=d.connection_id
   and o.provider_account_id=d.provider_account_id and o.canonical_order_id=d.matched_canonical_order_id
  where d.organization_id=p_org and o.workspace_id=p_org::text and o.resolved_person_id=p_person
   and d.reconciliation_state='matched' and (p_after is null or d.id>p_after)
   and exists(select 1 from ws001_dispute_preparation.identity_audit a where a.organization_id=d.organization_id
    and a.connection_id=d.connection_id and a.provider_account_id=d.provider_account_id and a.dispute_id=d.id
    and a.provider_dispute_id=d.provider_dispute_id and a.canonical_order_id=d.matched_canonical_order_id)
  order by d.id limit p_limit+1
 ), page as (select * from eligible order by id limit p_limit)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object(
  'id',id,'providerDisputeId',provider_dispute_id,'canonicalOrderId',matched_canonical_order_id,'status',status,
  'principalAmount',amount::text,'principalCurrency',principal_currency,'feeAmount',fee::text,'feeCurrency',fee_currency,
  'trackingIdentityAvailable',tracking_available) order by id) from page),'[]'::jsonb),
  'nextCursor',case when (select count(*) from eligible)>p_limit then (select max(id::text) from page) end)
 into result;
 return result;
end $$;
revoke all on function public.read_commas_customer_disputes_prepared(uuid,uuid,uuid,integer) from public,anon,authenticated,service_role;
