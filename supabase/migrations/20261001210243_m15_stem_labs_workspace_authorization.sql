-- M15 Stem Labs workspace-only authorization provisioning.
-- Creates no canonical offer, product mapping, or provider mutation.
do $$
declare
  v_org constant uuid := '8f6bb14b-2126-49b8-bfdb-c60edbc3549b';
  v_account constant uuid := '4dcad1a0-48af-4c5c-8b32-15c1c89ccd1d';
  v_connection constant uuid := 'd69a93dd-98ed-46fd-b486-1a39fb8388dd';
  v_provider_account constant uuid := 'd06cd699-6a75-4a92-9942-6c94dc268d3b';
  v_context constant text := 'stem-labs-8f6bb14b';
  v_user uuid;
  v_membership uuid;
  v_owner_role uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('m15:stem-labs-workspace',0));

  if not exists(select 1 from tracekit_organizations where id=v_org and owning_account_id=v_account and name='Stem Labs' and status='active')
     or not exists(select 1 from commerce_provider_connections where id=v_connection and organization_id=v_org and account_id=v_account and provider='shopify' and status='connected')
     or not exists(select 1 from commerce_provider_accounts where id=v_provider_account and organization_id=v_org and connection_id=v_connection and provider_account_external_id='izkfvg-k0.myshopify.com' and status='active')
     or (select count(*) from commerce_provider_credentials where organization_id=v_org and connection_id=v_connection and revoked_at is null) <> 1
  then raise exception 'Stem Labs workspace preflight failed' using errcode='23514'; end if;

  if exists(select 1 from tracekit_business_contexts where organization_id=v_org)
     or exists(select 1 from canonical_offers where organization_id=v_org)
     or exists(select 1 from commerce_product_mapping_decisions where organization_id=v_org)
  then raise exception 'Stem Labs workspace/catalog state changed' using errcode='23514'; end if;

  select m.user_id into v_user
  from tracekit_memberships m join tracekit_roles r on r.id=m.role_id
  where m.status='active' and m.organization_id is null and r.role_key='platform-owner'
  order by m.created_at limit 1;
  if v_user is null then raise exception 'Platform operator unavailable' using errcode='42501'; end if;

  select id into v_owner_role from tracekit_roles where role_key='organization-owner';
  if v_owner_role is null then raise exception 'organization-owner role unavailable' using errcode='23514'; end if;

  insert into tracekit_business_contexts(id,account_id,organization_id,name,status,fulfillment_type,metadata)
  values(v_context,v_account,v_org,'Stem Labs','active','physical',jsonb_build_object('identity_basis','m15_workspace_authorization','catalog_created',false));

  insert into tracekit_memberships(user_id,organization_id,role_id,status)
  values(v_user,v_org,v_owner_role,'active')
  returning id into v_membership;

  insert into tracekit_business_context_access(membership_id,organization_id,business_context_id,status)
  values(v_membership,v_org,v_context,'active');

  if exists(select 1 from canonical_offers where organization_id=v_org)
     or exists(select 1 from commerce_product_mapping_decisions where organization_id=v_org)
  then raise exception 'M15 workspace provisioning mutated catalog state' using errcode='23514'; end if;
end $$;
