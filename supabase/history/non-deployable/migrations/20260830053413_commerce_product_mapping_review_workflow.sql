alter table public.commerce_product_mapping_decisions
  add column if not exists correlation_id text;

revoke all on function public.decide_commerce_product_mapping(
  uuid, uuid, uuid, uuid, text, text, uuid, uuid, uuid, text, text, uuid, text
) from public, anon, authenticated, service_role;

create or replace function public.decide_commerce_product_mapping(
  p_organization_id uuid,
  p_connection_id uuid,
  p_provider_account_id uuid,
  p_provider_product_id uuid,
  p_resulting_state text,
  p_business_context_id text,
  p_canonical_offer_id uuid,
  p_offer_step_id uuid,
  p_offer_variant_id uuid,
  p_expected_mapping_version text,
  p_mapping_version text,
  p_decided_by_user_id uuid,
  p_reason text,
  p_correlation_id text
)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_previous_state text; v_current_mapping_version text; v_updated integer;
begin
  if p_resulting_state not in ('approved','rejected')
    or nullif(btrim(p_expected_mapping_version),'') is null
    or nullif(btrim(p_mapping_version),'') is null
    or p_mapping_version=p_expected_mapping_version
    or nullif(btrim(p_reason),'') is null
    or nullif(btrim(p_correlation_id),'') is null then
    raise exception 'invalid product mapping decision' using errcode='22023';
  end if;
  if p_resulting_state='approved' and (p_business_context_id is null or p_canonical_offer_id is null or p_offer_step_id is null) then
    raise exception 'approved product mapping target incomplete' using errcode='22023';
  end if;
  if p_resulting_state='rejected' and (p_business_context_id is not null or p_canonical_offer_id is not null or p_offer_step_id is not null or p_offer_variant_id is not null) then
    raise exception 'rejected product mapping cannot retain a target' using errcode='22023';
  end if;
  select mapping_status,mapping_version into v_previous_state,v_current_mapping_version
  from public.commerce_provider_products
  where id=p_provider_product_id and organization_id=p_organization_id and connection_id=p_connection_id and provider_account_id=p_provider_account_id
  for update;
  if not found then return false; end if;
  if v_current_mapping_version is distinct from p_expected_mapping_version then raise exception 'stale product mapping version' using errcode='40001'; end if;

  insert into public.commerce_product_mapping_decisions
    (organization_id,connection_id,provider_account_id,provider_product_id,previous_state,resulting_state,business_context_id,canonical_offer_id,offer_step_id,offer_variant_id,mapping_version,decided_by_user_id,reason,correlation_id)
  values
    (p_organization_id,p_connection_id,p_provider_account_id,p_provider_product_id,v_previous_state,p_resulting_state,p_business_context_id,p_canonical_offer_id,p_offer_step_id,p_offer_variant_id,p_mapping_version,p_decided_by_user_id,btrim(p_reason),btrim(p_correlation_id));

  update public.commerce_provider_products set
    mapping_status=p_resulting_state,
    business_context_id=case when p_resulting_state='approved' then p_business_context_id else null end,
    canonical_offer_id=case when p_resulting_state='approved' then p_canonical_offer_id else null end,
    offer_step_id=case when p_resulting_state='approved' then p_offer_step_id else null end,
    offer_variant_id=case when p_resulting_state='approved' then p_offer_variant_id else null end,
    mapping_version=p_mapping_version,reviewed_by_user_id=p_decided_by_user_id,reviewed_at=now(),updated_at=now()
  where id=p_provider_product_id and organization_id=p_organization_id and connection_id=p_connection_id and provider_account_id=p_provider_account_id
    and mapping_version is not distinct from p_expected_mapping_version;
  get diagnostics v_updated=row_count;
  if v_updated<>1 then raise exception 'stale product mapping version' using errcode='40001'; end if;

  insert into public.tracekit_audit_events(actor_user_id,account_id,organization_id,action,target_type,target_id,result,permission_evaluated,correlation_id,metadata)
  select p_decided_by_user_id,c.account_id,p_organization_id,
    case when p_resulting_state='approved' then 'product_mapping.approved' else 'product_mapping.rejected' end,
    'commerce_provider_product',p_provider_product_id::text,'success','offers.manage',btrim(p_correlation_id),
    jsonb_build_object('previous_mapping_version',p_expected_mapping_version,'mapping_version',p_mapping_version,'resulting_state',p_resulting_state,'business_context_id',p_business_context_id,'canonical_offer_id',p_canonical_offer_id,'offer_step_id',p_offer_step_id,'offer_variant_id',p_offer_variant_id)
  from public.commerce_provider_connections c
  where c.id=p_connection_id and c.organization_id=p_organization_id;
  return true;
end $$;

revoke all on function public.decide_commerce_product_mapping(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid,text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.decide_commerce_product_mapping(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid,text,text,uuid,text,text) to service_role;

create or replace view public.commerce_product_mapping_review_v1 with (security_invoker=true) as
with refund_totals as (
  select o.organization_id,o.connection_id,o.provider_account_id,o.provider_product_id,
    count(r.id)::bigint refund_count,
    coalesce(sum(abs(coalesce(r.amount,r.amount_gross,0))),0)::numeric refund_amount
  from public.platform_orders o
  join public.commerce_refund_events r on r.organization_id=o.organization_id and r.canonical_order_id=o.canonical_order_id
  where o.platform='commas' and o.provider_product_id is not null
  group by o.organization_id,o.connection_id,o.provider_account_id,o.provider_product_id
)
select p.organization_id,p.connection_id,p.provider_account_id,p.id provider_product_row_id,p.provider_product_id,
  p.title,p.internal_name,p.description,p.mapping_status,p.mapping_version,p.business_context_id,p.canonical_offer_id,p.offer_step_id,p.offer_variant_id,
  h.integrity_status,h.order_count,h.gross_revenue,coalesce(r.refund_count,0)::bigint refund_count,coalesce(r.refund_amount,0)::numeric refund_amount,
  p.first_seen_at,p.last_seen_at,p.reviewed_at,
  exists(select 1 from public.tracekit_operational_alerts a where a.organization_id=p.organization_id and a.capability='commerce'
    and a.alert_code='commas:'||p.connection_id::text||':'||p.provider_account_id::text||':transactions:product_unmapped:'||p.provider_product_id
    and a.status in ('open','acknowledged')) alert_open,
  exists(select 1 from public.work_items w where w.workspace_id=p.organization_id::text and w.source='commerce'
    and w.source_key='commas:'||p.connection_id::text||':'||p.provider_account_id::text||':transactions:product_unmapped:'||p.provider_product_id
    and w.status in ('open','acknowledged','in_progress')) work_item_open
from public.commerce_provider_products p
join public.commerce_product_mapping_health_v1 h on h.organization_id=p.organization_id and h.connection_id=p.connection_id and h.provider_account_id=p.provider_account_id and h.provider_product_id=p.provider_product_id
left join refund_totals r on r.organization_id=p.organization_id and r.connection_id=p.connection_id and r.provider_account_id=p.provider_account_id and r.provider_product_id=p.id;

revoke all on public.commerce_product_mapping_review_v1 from public,anon,authenticated;
grant select on public.commerce_product_mapping_review_v1 to service_role;
