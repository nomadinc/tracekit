-- Set-based Everflow comparison keeps diagnostic work bounded as the purchase cohort grows.
create or replace function public.read_commas_attribution_conflicts_v1(
  p_organization_id uuid,p_connection_id uuid,p_provider_account_id uuid,
  p_limit integer default 50,p_offset integer default 0,
  p_from date default null,p_to date default null,p_comparison text default null,
  p_alias text default null,p_ord text default null,p_derivation text default null
) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare v_rows jsonb;
begin
  if p_limit<1 or p_limit>50 or p_offset<0 or p_offset>10000
    or not exists(select 1 from public.commerce_provider_accounts a
      join public.commerce_provider_connections c on c.id=a.connection_id and c.organization_id=a.organization_id
      where a.organization_id=p_organization_id and a.connection_id=p_connection_id
        and a.id=p_provider_account_id and a.status='active' and c.provider='commas' and c.status='connected')
  then raise exception 'Commas conflict report unavailable' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'eventReference',s.id,'orderReference',s.canonical_order_id,'eventAt',s.first_observed_at,
    'derivationMode',case when s.evidence_version='commas-provider-attribution-v2' then 'LIVE_V2' else 'RECONCILED_FROM_EVIDENCE' end,
    'ordMatchState',s.match_state,'aliasState',s.alias_state,'comparisonState',s.everflow_comparison_state,
    'classification',case when s.shapes=1 and s.sub4 is not null and s.ef_sub4 is not null and s.sub4<>s.ef_sub4
      then 'FIELD_LEVEL_CONFLICT' when s.alias_state='conflict' then 'ALIAS_CONFLICT'
      when s.shapes>1 then 'AMBIGUOUS_EVERFLOW_IDENTITY' else 'UNRESOLVED' end,
    'fieldDiagnostics',jsonb_build_object(
      'transactionIdentity',case when s.shapes=1 then 'agree' else 'unavailable' end,
      'affiliateId',case when s.shapes<>1 then 'unavailable' when s.affiliate_id is null and s.ef_affiliate_id is null then 'both_missing'
        when s.affiliate_id is null then 'commas_missing' when s.ef_affiliate_id is null then 'everflow_missing'
        when s.affiliate_id=s.ef_affiliate_id then 'agree' else 'disagree' end,
      'sub1',case when s.shapes<>1 then 'unavailable' when s.sub1 is null and s.ef_sub1 is null then 'both_missing'
        when s.sub1 is null then 'commas_missing' when s.ef_sub1 is null then 'everflow_missing'
        when s.sub1=s.ef_sub1 then 'agree' else 'disagree' end,
      'sub4',case when s.shapes<>1 then 'unavailable' when s.sub4 is null and s.ef_sub4 is null then 'both_missing'
        when s.sub4 is null then 'commas_missing' when s.ef_sub4 is null then 'everflow_missing'
        when s.sub4=s.ef_sub4 then 'agree' else 'disagree' end),
    'conflictingFields',to_jsonb(array_remove(array[
      case when s.shapes=1 and s.affiliate_id is not null and s.ef_affiliate_id is not null and s.affiliate_id<>s.ef_affiliate_id then 'affiliate_id' end,
      case when s.shapes=1 and s.sub1 is not null and s.ef_sub1 is not null and s.sub1<>s.ef_sub1 then 'sub1' end,
      case when s.shapes=1 and s.sub4 is not null and s.ef_sub4 is not null and s.sub4<>s.ef_sub4 then 'sub4' end
    ]::text[],null)),
    'conflictingAliases',to_jsonb(array_remove(array[
      case when s.ef_transaction_id is not null and s.ef_transaction_id<>s.observed_tid then '_ef_transaction_id' end,
      case when s.transaction_id is not null and s.transaction_id<>s.observed_tid then 'transaction_id' end,
      case when s.tid is not null and s.tid<>s.observed_tid then 'tid' end,
      case when s.c1 is not null and s.c1<>s.observed_tid then 'c1' end
    ]::text[],null)),
    'diagnosticStatus','unreviewed')),'[]'::jsonb) into v_rows
  from (
    with base as materialized (
      select o.id,o.canonical_order_id,o.first_observed_at,o.match_state,o.alias_state,o.everflow_comparison_state,
        o.affiliate_id,o.sub1,o.sub4,o.ef_transaction_id,o.transaction_id,o.tid,o.c1,
        coalesce(o.ef_transaction_id,o.transaction_id,o.tid,o.c1) observed_tid,
        e.normalizer_version evidence_version
      from public.commerce_provider_attribution_observations o
      join public.commerce_evidence_records e on e.id=o.evidence_id and e.organization_id=o.organization_id
        and e.connection_id=o.connection_id and e.provider_account_id=o.provider_account_id
      where o.organization_id=p_organization_id and o.connection_id=p_connection_id
        and o.provider_account_id=p_provider_account_id and o.provider='commas'
        and o.provider_event_type='product.purchased'
        and (p_from is null or (o.first_observed_at at time zone 'UTC')::date>=p_from)
        and (p_to is null or (o.first_observed_at at time zone 'UTC')::date<=p_to)
        and (p_comparison is null or o.everflow_comparison_state=p_comparison)
        and (p_alias is null or o.alias_state=p_alias)
        and (p_ord is null or o.match_state=p_ord)
        and (p_derivation is null or case when e.normalizer_version='commas-provider-attribution-v2'
          then 'LIVE_V2' else 'RECONCILED_FROM_EVIDENCE' end=p_derivation)
    ), ef_raw as materialized (
      select transaction_id,affiliate_id,sub1,sub4 from public.everflow_conversion_events
        where organization_id=p_organization_id and transaction_id in (select observed_tid from base where observed_tid is not null)
      union all
      select transaction_id,affiliate_id,sub1,sub4 from public.everflow_click_events
        where organization_id=p_organization_id and transaction_id in (select observed_tid from base where observed_tid is not null)
    ), ef_by_tid as (
      select transaction_id,count(distinct (transaction_id,affiliate_id,sub1,sub4)) shapes,
        max(affiliate_id) affiliate_id,max(sub1) sub1,max(sub4) sub4
      from ef_raw group by transaction_id
    ), candidates as (
      select b.*,ef.shapes,case when ef.shapes=1 then ef.affiliate_id end ef_affiliate_id,
        case when ef.shapes=1 then ef.sub1 end ef_sub1,
        case when ef.shapes=1 then ef.sub4 end ef_sub4
      from base b left join ef_by_tid ef on ef.transaction_id=b.observed_tid
    )
    select c.* from candidates c
    where c.everflow_comparison_state='conflict' or c.alias_state='conflict'
      or (c.shapes=1 and ((c.affiliate_id is not null and c.ef_affiliate_id is not null and c.affiliate_id<>c.ef_affiliate_id)
        or (c.sub1 is not null and c.ef_sub1 is not null and c.sub1<>c.ef_sub1)
        or (c.sub4 is not null and c.ef_sub4 is not null and c.sub4<>c.ef_sub4)))
    order by c.first_observed_at desc,c.id desc limit p_limit offset p_offset
  ) s;
  return v_rows;
end $$;

revoke all on function public.read_commas_attribution_conflicts_v1(uuid,uuid,uuid,integer,integer,date,date,text,text,text,text)
  from public,anon,authenticated,authenticator;
grant execute on function public.read_commas_attribution_conflicts_v1(uuid,uuid,uuid,integer,integer,date,date,text,text,text,text) to service_role;
