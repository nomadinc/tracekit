begin;
do $$
declare
 a constant uuid := '39d895f9-71ac-44d3-ac33-6e9043f6267e'; o constant uuid := '5f1de64a-1b37-40bb-81c8-32197eda0b41';
 c constant text := 'push-button-system-5f1de64a'; s constant uuid := 'b0d5abc3-0663-4586-bf8d-25f4b1b8362e';
 p constant text := 'tksrc_ecowatt_pilot_v1'; r constant uuid := 'b784b15c-208d-4a6e-9424-3df9752b36e7';
 u constant text := 'https://buyecowatt.com'; ae boolean; oe boolean; n integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('tkid-historical-source:'||p,0));
 select exists(select 1 from public.tracekit_accounts where id=a),exists(select 1 from public.tracekit_organizations where id=o) into ae,oe;
 if not ae and not oe then
  if exists(select 1 from public.tracekit_business_contexts where id=c)
   or exists(select 1 from public.tkid_sources where id=s or public_source_id=p)
   or exists(select 1 from public.tkid_source_origins where id=r or canonical_origin=u)
  then raise exception 'EcoWatt TKID state exists without its fixed tenant' using errcode='23514'; end if;
  return;
 end if;
 if not ae or not exists(select 1 from public.tracekit_organizations where id=o and account_id=a)
  or not exists(select 1 from public.tracekit_business_contexts where id=c and account_id=a and organization_id=o and name='Push Button System' and status='active')
 then raise exception 'EcoWatt TKID fixed tenant/context is partial or conflicting' using errcode='23514'; end if;
 select count(*) into n from public.tkid_sources where id=s or public_source_id=p;
 if n=0 then
  insert into public.tkid_sources(id,account_id,organization_id,business_context_id,public_source_id,environment,status,allowed_origins,schema_version,capture_mode,rate_limit_per_minute,retention_policy_id,sdk_version)
  values(s,a,o,c,p,'production','shadow',array[u],1,'essential',120,'tkid-v1-review-required','1.0.0');
 elsif n<>1 or not exists(select 1 from public.tkid_sources where id=s and account_id=a and organization_id=o and business_context_id=c and public_source_id=p and environment='production' and status='shadow' and allowed_origins=array[u]::text[] and schema_version=1 and capture_mode='essential' and rate_limit_per_minute=120 and retention_policy_id='tkid-v1-review-required' and sdk_version='1.0.0') then
  raise exception 'EcoWatt TKID source conflicts with expected historical state' using errcode='23514';
 end if;
 select count(*) into n from public.tkid_source_origins where id=r or (source_id=s and canonical_origin=u);
 if n=0 then
  insert into public.tkid_source_origins(id,account_id,organization_id,business_context_id,source_id,canonical_origin,role,lifecycle_status,verification_method,verification_state)
  values(r,a,o,c,s,u,'frontend','pending','dns_txt','unissued');
 elsif n<>1 or not exists(select 1 from public.tkid_source_origins where id=r and account_id=a and organization_id=o and business_context_id=c and source_id=s and canonical_origin=u and role='frontend' and lifecycle_status='pending' and verification_method='dns_txt' and verification_state in ('unissued','issued','verified')) then
  raise exception 'EcoWatt TKID origin conflicts with expected historical state' using errcode='23514';
 end if;
end $$;
commit;
