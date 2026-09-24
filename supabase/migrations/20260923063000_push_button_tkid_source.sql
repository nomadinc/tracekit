begin;
do $$
declare v_source uuid;
begin
 insert into public.tkid_sources(account_id,organization_id,business_context_id,public_source_id,environment,status,allowed_origins,schema_version,capture_mode,rate_limit_per_minute,retention_policy_id,sdk_version)
 select bc.account_id,bc.organization_id,bc.id,'tksrc_pushbutton_prod_v1','production','shadow',array['https://pushingsystems.com'],1,'essential',120,'tkid-v1-review-required','1.0.0'
 from public.tracekit_business_contexts bc where bc.name='Push Button System' and bc.status='active'
 on conflict(public_source_id) do update set allowed_origins=excluded.allowed_origins,status='shadow',capture_mode='essential',updated_at=now()
 returning id into v_source;
 if v_source is null then raise exception 'Push Button System business context unavailable'; end if;
 insert into public.tkid_source_origins(account_id,organization_id,business_context_id,source_id,canonical_origin,role,lifecycle_status,verification_method,verification_state)
 select s.account_id,s.organization_id,s.business_context_id,s.id,'https://pushingsystems.com','frontend','pending','dns_txt','unissued'
 from public.tkid_sources s where s.id=v_source
 on conflict(source_id,canonical_origin) do nothing;
end $$;
commit;