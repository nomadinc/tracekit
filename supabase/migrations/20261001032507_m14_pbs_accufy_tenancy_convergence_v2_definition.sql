-- M14 PBS tenancy convergence v2.
-- Defines a confirmation-gated, fail-closed operator function. This migration
-- itself performs no PBS tenancy mutation.
--
-- Historical TraceKit provider observations, mapping decisions, canonical
-- catalog rows, and EcoWatt evidence are intentionally immutable provenance.

create or replace function public.converge_push_button_system_to_accufy_v2(
  p_actor_user_id uuid,
  p_correlation_id text,
  p_confirmation text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  old_org constant uuid := '5f1de64a-1b37-40bb-81c8-32197eda0b41';
  old_account constant uuid := '39d895f9-71ac-44d3-ac33-6e9043f6267e';
  old_context constant text := 'push-button-system-5f1de64a';
  old_offer constant uuid := 'b842611c-9918-40ac-9241-d542a8c6f8b4';
  old_connection constant uuid := 'ea1c2313-6120-4692-84c5-ec3562e7dcf6';
  old_provider_account constant uuid := '0369c701-717f-4c34-b230-8341bcdb7e65';

  new_org constant uuid := 'c98d44be-5f7f-41a2-a9d3-ae67a811a872';
  new_account constant uuid := '2174b3d1-d3d0-44dd-a189-5cf7b2579981';
  new_connection constant uuid := '8030cf89-88f3-433f-99ec-c2083c4e5698';
  new_provider_account constant uuid := 'dd3506d5-3417-4086-8623-9f8ec6b81694';
  new_context constant text := 'push-button-system-c98d44be';

  pbs_source constant uuid := 'ae61827d-1503-4304-b187-9989390ab8d3';
  pbs_origin constant uuid := '66fe24db-452e-4da1-baa7-973709ab8089';
  ecowatt_source constant uuid := 'b0d5abc3-0663-4586-bf8d-25f4b1b8362e';

  new_offer constant uuid := 'ad767ac7-d729-51e7-9d67-47679a6cc36f';
  actor_membership uuid;
  owner_role uuid;
  old_access uuid;
  old_step record;

  rec record;
  mapped_count integer := 0;
  step_count integer := 0;
begin
  if p_confirmation is distinct from 'converge-pbs-to-accufy-v2'
     or nullif(btrim(p_correlation_id),'') is null then
    raise exception 'invalid PBS convergence confirmation' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('m14:pbs-tenancy-convergence-v2',0));

  -- Exact destination and actor preflight.
  if not exists(select 1 from tracekit_organizations where id=new_org and owning_account_id=new_account and name='Accufy' and status='active')
     or not exists(select 1 from commerce_provider_connections where id=new_connection and organization_id=new_org and account_id=new_account and provider='commas' and status='connected')
     or not exists(select 1 from commerce_provider_accounts where id=new_provider_account and organization_id=new_org and connection_id=new_connection and status='active')
     or (select count(*) from commerce_provider_credentials where organization_id=new_org and connection_id=new_connection and revoked_at is null) <> 1
  then raise exception 'Accufy destination preflight failed' using errcode='23514'; end if;

  select m.id into actor_membership
  from tracekit_memberships m
  where m.user_id=p_actor_user_id and m.organization_id=old_org and m.status='active';
  if actor_membership is null then raise exception 'PBS convergence actor unavailable' using errcode='42501'; end if;
  select id into owner_role from tracekit_roles where role_key='organization-owner';
  if owner_role is null then raise exception 'organization-owner role unavailable' using errcode='23514'; end if;

  -- Exact historical canonical state.
  if not exists(select 1 from tracekit_business_contexts where id=old_context and organization_id=old_org and account_id=old_account and name='Push Button System' and status='active')
     or not exists(select 1 from canonical_offers where id=old_offer and organization_id=old_org and account_id=old_account and business_context_id=old_context and name='Push Button System' and status='active')
     or (select count(*) from offer_steps where organization_id=old_org and canonical_offer_id=old_offer) <> 25
     or (select count(*) from commerce_product_mapping_decisions where organization_id=old_org and business_context_id=old_context and resulting_state='approved') <> 60
  then raise exception 'historical PBS catalog preflight failed' using errcode='23514'; end if;

  -- Historical provider state and exact product parity.
  if not exists(select 1 from commerce_provider_connections where id=old_connection and organization_id=old_org and provider='commas' and status='disabled')
     or (select count(*) from commerce_provider_products where organization_id=old_org and connection_id=old_connection and provider_account_id=old_provider_account and business_context_id=old_context) <> 59
     or (select count(*) from commerce_provider_products op join commerce_provider_products np on np.provider_product_id=op.provider_product_id and np.organization_id=new_org and np.connection_id=new_connection and np.provider_account_id=new_provider_account where op.organization_id=old_org and op.connection_id=old_connection and op.provider_account_id=old_provider_account and op.business_context_id=old_context) <> 59
  then raise exception 'PBS provider-product parity preflight failed' using errcode='23514'; end if;

  -- PBS TKID is unused; EcoWatt is explicitly excluded.
  if (select count(*) from tkid_events where source_id=pbs_source) <> 0
     or (select count(*) from tkid_browser_sessions where source_id=pbs_source) <> 0
     or (select count(*) from tkid_journeys where source_id=pbs_source) <> 0
     or not exists(select 1 from tkid_sources where id=pbs_source and organization_id=old_org and business_context_id=old_context and public_source_id='tksrc_pushbutton_prod_v1')
     or not exists(select 1 from tkid_sources where id=ecowatt_source and organization_id=old_org and business_context_id=old_context and public_source_id='tksrc_ecowatt_pilot_v1')
  then raise exception 'PBS TKID isolation preflight failed' using errcode='23514'; end if;

  -- No destination catalog may pre-exist under a conflicting identity.
  if exists(select 1 from tracekit_business_contexts where id=new_context or (organization_id=new_org and name='Push Button System'))
     or exists(select 1 from canonical_offers where organization_id=new_org and name='Push Button System')
  then raise exception 'Accufy PBS catalog already exists' using errcode='23505'; end if;

  insert into tracekit_business_contexts(id,account_id,organization_id,name,status,fulfillment_type,metadata)
  values(new_context,new_account,new_org,'Push Button System','active','digital',
    jsonb_build_object('catalog_key','push-button-system','identity_basis','tenancy_convergence_v2','historical_context_id',old_context));

  insert into canonical_offers(id,account_id,organization_id,business_context_id,name,status,metadata)
  select new_offer,new_account,new_org,new_context,name,status,
    metadata || jsonb_build_object('identity_basis','tenancy_convergence_v2','historical_canonical_offer_id',old_offer)
  from canonical_offers where id=old_offer;

  create temporary table _pbs_step_map(old_id uuid primary key,new_id uuid not null,catalog_key text not null) on commit drop;
  for old_step in select * from offer_steps where organization_id=old_org and canonical_offer_id=old_offer order by sequence,id loop
    insert into offer_steps(id,organization_id,canonical_offer_id,role,sequence,label,metadata)
    values((('x'||substr(md5('m14-pbs-accufy-v2:'||(old_step.metadata->>'catalog_key')),1,8)||'-'||substr(md5('m14-pbs-accufy-v2:'||(old_step.metadata->>'catalog_key')),9,4)||'-5'||substr(md5('m14-pbs-accufy-v2:'||(old_step.metadata->>'catalog_key')),14,3)||'-a'||substr(md5('m14-pbs-accufy-v2:'||(old_step.metadata->>'catalog_key')),18,3)||'-'||substr(md5('m14-pbs-accufy-v2:'||(old_step.metadata->>'catalog_key')),21,12))::uuid),new_org,new_offer,old_step.role,old_step.sequence,old_step.label,
      old_step.metadata || jsonb_build_object('identity_basis','tenancy_convergence_v2','historical_offer_step_id',old_step.id));
    insert into _pbs_step_map values(old_step.id,(('x'||substr(md5('m14-pbs-accufy-v2:'||(old_step.metadata->>'catalog_key')),1,8)||'-'||substr(md5('m14-pbs-accufy-v2:'||(old_step.metadata->>'catalog_key')),9,4)||'-5'||substr(md5('m14-pbs-accufy-v2:'||(old_step.metadata->>'catalog_key')),14,3)||'-a'||substr(md5('m14-pbs-accufy-v2:'||(old_step.metadata->>'catalog_key')),18,3)||'-'||substr(md5('m14-pbs-accufy-v2:'||(old_step.metadata->>'catalog_key')),21,12))::uuid),old_step.metadata->>'catalog_key');
    step_count := step_count+1;
  end loop;

  -- Project the latest approved historical target for each exact provider product
  -- onto the matching Accufy provider product. Old decisions remain untouched.
  for rec in
    with latest as (
      select distinct on (p.provider_product_id)
        p.provider_product_id,d.offer_step_id
      from commerce_provider_products p
      join commerce_product_mapping_decisions d
        on d.organization_id=p.organization_id and d.connection_id=p.connection_id
       and d.provider_account_id=p.provider_account_id and d.provider_product_id=p.id
      where p.organization_id=old_org and p.connection_id=old_connection
        and p.provider_account_id=old_provider_account and p.business_context_id=old_context
        and d.resulting_state='approved'
      order by p.provider_product_id,d.created_at desc,d.id desc
    )
    select np.id provider_product_uuid,np.mapping_version expected_version,l.offer_step_id old_step_id,sm.new_id new_step_id
    from latest l
    join _pbs_step_map sm on sm.old_id=l.offer_step_id
    join commerce_provider_products np on np.provider_product_id=l.provider_product_id
      and np.organization_id=new_org and np.connection_id=new_connection and np.provider_account_id=new_provider_account
  loop
    insert into commerce_product_mapping_decisions(
      organization_id,connection_id,provider_account_id,provider_product_id,
      previous_state,resulting_state,business_context_id,canonical_offer_id,
      offer_step_id,offer_variant_id,mapping_version,decided_by_user_id,reason,correlation_id
    )
    select new_org,new_connection,new_provider_account,rec.provider_product_uuid,
      mapping_status,'approved',new_context,new_offer,rec.new_step_id,null,
      'pbs-tenancy-convergence-v2',p_actor_user_id,
      'M14 PBS tenancy convergence from exact historical approved provider-product identity',
      btrim(p_correlation_id)||':'||rec.provider_product_uuid::text
    from commerce_provider_products where id=rec.provider_product_uuid and organization_id=new_org;

    update commerce_provider_products set mapping_status='approved',business_context_id=new_context,
      canonical_offer_id=new_offer,offer_step_id=rec.new_step_id,offer_variant_id=null,
      mapping_version='pbs-tenancy-convergence-v2',mapping_confidence=100,
      reviewed_by_user_id=p_actor_user_id,reviewed_at=now(),updated_at=now()
    where id=rec.provider_product_uuid and organization_id=new_org;
    mapped_count := mapped_count+1;
  end loop;
  if mapped_count <> 59 then raise exception 'PBS mapping projection count mismatch' using errcode='23514'; end if;

  -- Give the existing operator explicit Accufy organization access.
  select id into actor_membership from tracekit_memberships
  where user_id=p_actor_user_id and organization_id=new_org
  order by created_at desc limit 1;
  if actor_membership is null then
    insert into tracekit_memberships(user_id,organization_id,role_id,status)
    values(p_actor_user_id,new_org,owner_role,'active') returning id into actor_membership;
  else
    update tracekit_memberships set role_id=owner_role,status='active',updated_at=now()
    where id=actor_membership;
  end if;
  insert into tracekit_business_context_access(membership_id,organization_id,business_context_id,status)
  values(actor_membership,new_org,new_context,'active')
  on conflict (membership_id,organization_id,business_context_id) do update set status='active';

  -- Remove only the old PBS workspace grant for this actor; historical catalog
  -- and EcoWatt evidence remain under TraceKit.
  delete from tracekit_business_context_access
  where membership_id in (select id from tracekit_memberships where user_id=p_actor_user_id and organization_id=old_org)
    and organization_id=old_org and business_context_id=old_context;

  -- PBS source has no evidence: preserve its source/origin IDs while rebinding.
  delete from tkid_source_origins where id=pbs_origin and source_id=pbs_source;
  update tkid_sources set account_id=new_account,organization_id=new_org,business_context_id=new_context
  where id=pbs_source and public_source_id='tksrc_pushbutton_prod_v1';
  insert into tkid_source_origins(id,account_id,organization_id,business_context_id,source_id,canonical_origin,role,lifecycle_status,verification_method,verification_state)
  values(pbs_origin,new_account,new_org,new_context,pbs_source,'https://pushingsystems.com','frontend','pending','dns_txt','unissued');

  -- EcoWatt must not move.
  if not exists(select 1 from tkid_sources where id=ecowatt_source and organization_id=old_org and business_context_id=old_context)
  then raise exception 'EcoWatt isolation postcondition failed' using errcode='23514'; end if;

  insert into tracekit_audit_events(actor_user_id,account_id,organization_id,action,target_type,target_id,result,permission_evaluated,correlation_id,metadata)
  values(p_actor_user_id,new_account,new_org,'tenancy.push_button_system_converged','business_context',new_context,'success','organization.manage',btrim(p_correlation_id),
    jsonb_build_object('historical_context_id',old_context,'historical_offer_id',old_offer,'new_offer_id',new_offer,'mapped_products',mapped_count,'offer_steps',step_count,'historical_decisions_preserved',60,'ecowatt_excluded',true));

  return jsonb_build_object('business_context_id',new_context,'canonical_offer_id',new_offer,'mapped_products',mapped_count,'offer_steps',step_count,'historical_decisions_preserved',60,'ecowatt_excluded',true);
end;
$$;

revoke all on function public.converge_push_button_system_to_accufy_v2(uuid,text,text) from public,anon,authenticated,authenticator;
grant execute on function public.converge_push_button_system_to_accufy_v2(uuid,text,text) to service_role;

comment on function public.converge_push_button_system_to_accufy_v2(uuid,text,text) is
'Confirmation-gated M14 PBS tenancy convergence. Preserves historical TraceKit evidence and excludes EcoWatt.';
;
