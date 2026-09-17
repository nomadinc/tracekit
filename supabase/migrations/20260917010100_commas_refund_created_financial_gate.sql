-- The epoch is the operator gate. Its NULL activated_at keeps this path persistence-only.
create or replace function public.post_commas_refund_created_seller_cost_v1(
  p_organization_id uuid, p_connection_id uuid, p_provider_account_id uuid, p_provider_event_id text
) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
declare o public.commerce_refund_created_observations%rowtype; v_epoch timestamptz; v_ledger public.conversions%rowtype;
begin
  select * into o from public.commerce_refund_created_observations
  where organization_id=p_organization_id and connection_id=p_connection_id
    and provider_account_id=p_provider_account_id and provider_event_id=p_provider_event_id
  for update;
  if not found then raise exception 'refund observation unavailable'; end if;
  if o.status<>'success' or o.canonical_order_id is null or o.order_match_state<>'exact_ord' then return false; end if;
  if o.currency<>'USD' or o.provider_created_at is null or o.financial_policy_version<>'commas-refund-created-seller-cost-v1' then raise exception 'refund financial contract conflict'; end if;
  if not exists(select 1 from public.commerce_evidence_records e where e.organization_id=o.organization_id and e.connection_id=o.connection_id and e.provider_account_id=o.provider_account_id and e.id=o.evidence_id and e.payload_hash=o.payload_hash and e.source_object_type='commas_refund_created_webhook' and e.pii_classification='restricted' and e.deleted_at is null) then raise exception 'refund Evidence conflict'; end if;
  select activated_at into v_epoch from public.commerce_refund_forward_epochs
  where organization_id=o.organization_id and connection_id=o.connection_id and provider_account_id=o.provider_account_id
    and policy_version='commas-refund-created-seller-cost-v1';
  if v_epoch is null or o.provider_created_at<v_epoch then return false; end if;
  insert into public.conversions(id,status,amount,currency,ledger_type,platform,workspace_id,occurred_at,event_source,ingestion_method,connector_id,account_id,organization_id,connection_id,provider_account_id,evidence_id,canonical_order_id,idempotency_key,reconciliation_state,data_quality_state,transaction_id,order_id,meta)
  values(gen_random_uuid(),'observed',-abs(o.seller_refund_cost),'USD','refund','commas',o.organization_id::text,o.provider_created_at,'commas','webhook','commas',o.account_id,o.organization_id,o.connection_id,o.provider_account_id,o.evidence_id,o.canonical_order_id,'refund_created:commas-refund-created-seller-cost-v1:'||o.provider_refund_hashid,'observed','verified',o.original_payment_id,o.original_payment_id,jsonb_build_object('policy_version','commas-refund-created-seller-cost-v1','provider_event_id',o.provider_event_id,'refund_id',o.provider_refund_hashid))
  on conflict(organization_id,connection_id,provider_account_id,idempotency_key)
  where organization_id is not null and connection_id is not null and provider_account_id is not null and idempotency_key is not null do nothing;
  select * into v_ledger from public.conversions
  where organization_id=o.organization_id and connection_id=o.connection_id and provider_account_id=o.provider_account_id
    and idempotency_key='refund_created:commas-refund-created-seller-cost-v1:'||o.provider_refund_hashid;
  if v_ledger.id is null or v_ledger.amount<>-abs(o.seller_refund_cost) or v_ledger.currency<>'USD'
     or v_ledger.canonical_order_id<>o.canonical_order_id or v_ledger.evidence_id<>o.evidence_id
     or v_ledger.ledger_type<>'refund' then raise exception 'refund financial replay conflict'; end if;
  update public.commerce_refund_created_observations set financial_state='posted',updated_at=now() where id=o.id and financial_state<>'posted';
  return true;
end $$;
revoke all on function public.post_commas_refund_created_seller_cost_v1(uuid,uuid,uuid,text) from public,anon,authenticated,authenticator;
grant execute on function public.post_commas_refund_created_seller_cost_v1(uuid,uuid,uuid,text) to service_role;
