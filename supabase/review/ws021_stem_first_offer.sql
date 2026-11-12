-- REVIEWED INSTALL CANDIDATE ONLY; do not run without separate authorization.
BEGIN;
-- REVIEW ONLY. Not installed. Requires independent review and explicit installation approval.
CREATE OR REPLACE FUNCTION public.decide_commerce_product_mapping(p_organization_id uuid, p_connection_id uuid, p_provider_account_id uuid, p_provider_product_id uuid, p_resulting_state text, p_business_context_id text, p_canonical_offer_id uuid, p_offer_step_id uuid, p_offer_variant_id uuid, p_expected_mapping_version text, p_mapping_version text, p_decided_by_user_id uuid, p_reason text, p_correlation_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_previous_state text; v_current_mapping_version text; v_updated integer;
begin
  if p_resulting_state not in ('approved','rejected') or (p_expected_mapping_version is not null and nullif(btrim(p_expected_mapping_version),'') is null)
    or nullif(btrim(p_mapping_version),'') is null or p_mapping_version is not distinct from p_expected_mapping_version
    or nullif(btrim(p_reason),'') is null or nullif(btrim(p_correlation_id),'') is null then
    raise exception 'invalid product mapping decision' using errcode='22023';
  end if;
  if p_resulting_state='approved' and (p_business_context_id is null or p_canonical_offer_id is null or p_offer_step_id is null) then
    raise exception 'approved product mapping target incomplete' using errcode='22023';
  end if;
  if p_resulting_state='rejected' and (p_business_context_id is not null or p_canonical_offer_id is not null or p_offer_step_id is not null or p_offer_variant_id is not null) then
    raise exception 'rejected product mapping cannot retain a target' using errcode='22023';
  end if;
  select mapping_status,mapping_version into v_previous_state,v_current_mapping_version
  from public.commerce_provider_products where id=p_provider_product_id and organization_id=p_organization_id
    and connection_id=p_connection_id and provider_account_id=p_provider_account_id for update;
  if not found then return false; end if;
  if p_expected_mapping_version is null and (v_previous_state is distinct from 'observed' or v_current_mapping_version is not null) then raise exception 'initial mapping state conflict' using errcode='40001'; end if;
  if v_current_mapping_version is distinct from p_expected_mapping_version then raise exception 'stale product mapping version' using errcode='40001'; end if;
  insert into public.commerce_product_mapping_decisions
    (organization_id,connection_id,provider_account_id,provider_product_id,previous_state,resulting_state,business_context_id,canonical_offer_id,offer_step_id,offer_variant_id,mapping_version,decided_by_user_id,reason,correlation_id)
  values (p_organization_id,p_connection_id,p_provider_account_id,p_provider_product_id,v_previous_state,p_resulting_state,p_business_context_id,p_canonical_offer_id,p_offer_step_id,p_offer_variant_id,p_mapping_version,p_decided_by_user_id,btrim(p_reason),btrim(p_correlation_id));
  update public.commerce_provider_products set mapping_status=p_resulting_state,
    business_context_id=case when p_resulting_state='approved' then p_business_context_id else null end,
    canonical_offer_id=case when p_resulting_state='approved' then p_canonical_offer_id else null end,
    offer_step_id=case when p_resulting_state='approved' then p_offer_step_id else null end,
    offer_variant_id=case when p_resulting_state='approved' then p_offer_variant_id else null end,
    mapping_version=p_mapping_version,reviewed_by_user_id=p_decided_by_user_id,reviewed_at=now(),updated_at=now()
  where id=p_provider_product_id and organization_id=p_organization_id and connection_id=p_connection_id
    and provider_account_id=p_provider_account_id and mapping_version is not distinct from p_expected_mapping_version;
  get diagnostics v_updated=row_count;
  if v_updated<>1 then raise exception 'stale product mapping version' using errcode='40001'; end if;
  insert into public.tracekit_audit_events(actor_user_id,account_id,organization_id,action,target_type,target_id,result,permission_evaluated,correlation_id,metadata)
  select p_decided_by_user_id,c.account_id,p_organization_id,
    case when p_resulting_state='approved' then 'product_mapping.approved' else 'product_mapping.rejected' end,
    'commerce_provider_product',p_provider_product_id::text,'success','offers.manage',btrim(p_correlation_id),
    jsonb_build_object('previous_mapping_version',p_expected_mapping_version,'mapping_version',p_mapping_version,'resulting_state',p_resulting_state,'business_context_id',p_business_context_id,'canonical_offer_id',p_canonical_offer_id,'offer_step_id',p_offer_step_id,'offer_variant_id',p_offer_variant_id)
  from public.commerce_provider_connections c where c.id=p_connection_id and c.organization_id=p_organization_id;
  return true;
end $function$;


-- Bounded catalog action; service credential caller is the authorized application.
-- Invoker mode preserves the existing service runtime authority; no new privilege grants.
CREATE FUNCTION public.ws021_activate_stem_first_offer(p_actor_id uuid,p_correlation_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 p public.commerce_provider_products%ROWTYPE;
 c public.tracekit_business_contexts%ROWTYPE;
 o constant uuid := '8f6bb14b-2126-49b8-bfdb-c60edbc3549b';
 product constant uuid := '498c8cb0-56d1-42fe-80bb-cddfb4abcea0';
 offer constant uuid := '02100000-0000-4000-8000-000000000008';
 step constant uuid := '02100000-0000-4000-8000-000000002443';
 version constant text := 'ws021:stem-first-offer:approved-product-8:v1';
 decision uuid;
 accepted boolean;
BEGIN
 IF p_actor_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.tracekit_users WHERE id=p_actor_id AND status='active')
 OR p_correlation_id IS NULL OR p_correlation_id !~ '^[0-9a-f-]{36}$' THEN
  RAISE EXCEPTION 'Invalid operator context' USING ERRCODE='42501';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ws021:stem-first-offer:8',0));
 SELECT * INTO STRICT c FROM public.tracekit_business_contexts
 WHERE id='stem-labs-8f6bb14b' AND organization_id=o
 AND account_id='4dcad1a0-48af-4c5c-8b32-15c1c89ccd1d' AND status='active' FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM public.tracekit_organizations WHERE id=o AND owning_account_id=c.account_id AND status='active') THEN
  RAISE EXCEPTION 'Tenant ownership mismatch' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT p FROM public.commerce_provider_products WHERE id=product
 AND organization_id=o AND connection_id='4e644c93-7839-4a82-8470-1c6f25825f26'
 AND provider_account_id='e7c2b1e5-8465-4341-8f8c-89bc05cca367'
 AND provider_product_id='8' AND title='20 Treatments (5)' FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.commerce_provider_connections
 WHERE id=p.connection_id AND organization_id=o AND account_id=c.account_id) THEN
 RAISE EXCEPTION 'Connection ownership mismatch' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.platform_orders r
 CROSS JOIN LATERAL jsonb_array_elements(coalesce(r.raw_json,r.raw)->'lines') l
 WHERE r.canonical_order_id='15f0b290-aaad-4962-b1d6-42f69db3966c'
 AND r.organization_id=o AND r.connection_id=p.connection_id AND r.provider_account_id=p.provider_account_id
 AND r.platform='next29' AND r.provider_order_id='103104'
 AND l->>'id'='2443' AND l->>'product_id'='8' AND l->>'quantity'='1'
 AND l->>'product_title'='20 Treatments (5)' AND l->'is_upsell'='false'::jsonb) THEN
 RAISE EXCEPTION 'Approved source evidence mismatch' USING ERRCODE='23514'; END IF;
 IF p.mapping_status='approved' AND p.mapping_version=version
 AND p.canonical_offer_id=offer AND p.offer_step_id=step AND p.business_context_id=c.id
 AND p.offer_variant_id IS NULL THEN
  SELECT id INTO decision FROM public.commerce_product_mapping_decisions
  WHERE organization_id=o AND provider_product_id=product AND mapping_version=version
  AND canonical_offer_id=offer AND offer_step_id=step AND resulting_state='approved';
  IF decision IS NULL OR NOT EXISTS(SELECT 1 FROM public.canonical_offers WHERE id=offer AND organization_id=o
    AND account_id=c.account_id AND business_context_id=c.id AND name='Stem Labs — 20 Treatments (5)' AND status='active')
   OR NOT EXISTS(SELECT 1 FROM public.offer_steps WHERE id=step AND organization_id=o AND canonical_offer_id=offer
    AND role='front_end' AND sequence=0) THEN
   RAISE EXCEPTION 'Partial catalog state' USING ERRCODE='40001'; END IF;
  RETURN jsonb_build_object('ok',true,'offerId',offer,'mappingId',decision,'replayed',true);
 END IF;
 IF p.mapping_status IS DISTINCT FROM 'observed' OR p.mapping_version IS NOT NULL
 OR p.canonical_offer_id IS NOT NULL OR p.offer_step_id IS NOT NULL OR p.offer_variant_id IS NOT NULL
 OR EXISTS(SELECT 1 FROM public.canonical_offers WHERE id=offer OR
 (organization_id=o AND business_context_id=c.id AND lower(btrim(name))=lower('Stem Labs — 20 Treatments (5)')))
 OR EXISTS(SELECT 1 FROM public.offer_steps WHERE id=step) THEN
 RAISE EXCEPTION 'Catalog state conflict' USING ERRCODE='40001'; END IF;
 INSERT INTO public.canonical_offers(id,account_id,organization_id,business_context_id,name,status)
 VALUES(offer,c.account_id,o,c.id,'Stem Labs — 20 Treatments (5)','active');
 -- Retained line explicitly has is_upsell=false; no additional product/variant association.
 INSERT INTO public.offer_steps(id,organization_id,canonical_offer_id,role,sequence,label)
 VALUES(step,o,offer,'front_end',0,'20 Treatments (5)');
 SELECT public.decide_commerce_product_mapping(o,p.connection_id,p.provider_account_id,product,'approved',
 c.id,offer,step,NULL,NULL,version,p_actor_id,
 'Catalog owner approved Stem Labs — 20 Treatments (5); 29Next product 8; order 103104 line 2443',
 p_correlation_id) INTO accepted;
 IF accepted IS DISTINCT FROM true THEN RAISE EXCEPTION 'Mapping not committed' USING ERRCODE='40001'; END IF;
 SELECT id INTO STRICT decision FROM public.commerce_product_mapping_decisions
 WHERE organization_id=o AND provider_product_id=product AND mapping_version=version;
 RETURN jsonb_build_object('ok',true,'offerId',offer,'mappingId',decision,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.ws021_activate_stem_first_offer(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ws021_activate_stem_first_offer(uuid,text) TO service_role;
COMMIT;
