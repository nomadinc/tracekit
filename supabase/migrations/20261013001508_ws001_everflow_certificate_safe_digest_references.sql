-- Keep the existing metadata safety constraint; reference protected content with a safe digest key.
-- Certifies source membership only. Historical execution, leases and counters remain untouched.
create or replace function public.certify_everflow_source_coverage(
  p_run_id uuid, p_organization_id uuid, p_connection_id uuid, p_provider_account_id uuid,
  p_actor_user_id uuid, p_account_id uuid, p_correlation_id text,
  p_expected_metadata jsonb, p_certificate jsonb, p_manifest jsonb, p_evidence_id uuid
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  v_run public.commerce_sync_runs%rowtype;
  v_count integer;
  v_unique integer;
  v_matched integer;
  v_identity_hash text;
  v_normalized_hash text;
  v_from timestamptz;
  v_to timestamptz;
begin
  if jsonb_typeof(p_manifest) is distinct from 'array' or jsonb_typeof(p_certificate) is distinct from 'object'
     or p_certificate->>'kind' is distinct from 'source_identity_coverage'
     or p_certificate->>'state' is distinct from 'certified'
     or p_certificate->>'organizationId' is distinct from p_organization_id::text
     or p_certificate->>'connectionId' is distinct from p_connection_id::text
     or p_certificate->>'providerAccountId' is distinct from p_provider_account_id::text
     or p_certificate->>'importId' is distinct from p_run_id::text
     or p_certificate->>'actorUserId' is distinct from p_actor_user_id::text
     or p_certificate->'customerFinancialAcceptance' is distinct from '"not_certified"'::jsonb then
    raise exception 'Source coverage certificate scope invalid' using errcode='22023';
  end if;
  select * into v_run from public.commerce_sync_runs
   where id=p_run_id and organization_id=p_organization_id and connection_id=p_connection_id
     and provider_account_id=p_provider_account_id and sync_type='everflow_conversions_historical'
   for update nowait;
  if not found then raise exception 'Historical request unavailable' using errcode='P0002'; end if;
  if v_run.metadata->'source_coverage_certification' is not null then
    if v_run.metadata->'source_coverage_certification'->>'identitySetSha256'=p_certificate->>'identitySetSha256'
       and v_run.metadata->'source_coverage_certification'->>'normalizedVersionSetSha256'=p_certificate->>'normalizedVersionSetSha256' then
      return v_run.metadata->'source_coverage_certification';
    end if;
    raise exception 'A different source coverage certificate already exists' using errcode='40001';
  end if;
  if v_run.status<>'failed' or v_run.lease_owner is not null
     or v_run.metadata is distinct from p_expected_metadata then
    raise exception 'Historical request changed or is executing' using errcode='40001';
  end if;
  if p_certificate->'query'->>'from' is distinct from v_run.metadata->>'from'
     or p_certificate->'query'->>'to' is distinct from v_run.metadata->>'to'
     or p_certificate->'query'->>'timezoneId' is distinct from '80'
     or p_certificate->'query'->>'currencyId' is distinct from 'USD'
     or p_certificate->'query'->'showConversions' is distinct from 'true'::jsonb
     or p_certificate->'query'->'showEvents' is distinct from 'true'::jsonb
     or p_certificate->'query'->'filters' is distinct from '[]'::jsonb
     or p_certificate->'query'->'searchTerms' is distinct from '[]'::jsonb then
    raise exception 'Original reporting scope not preserved' using errcode='22023';
  end if;
  if not exists(select 1 from public.commerce_provider_connections c
    join public.commerce_provider_accounts a on a.connection_id=c.id and a.organization_id=c.organization_id
    where c.id=p_connection_id and c.organization_id=p_organization_id and c.account_id=p_account_id
      and c.provider='everflow' and c.status='connected' and a.id=p_provider_account_id
      and a.status='active' and a.provider_account_external_id not like 'provisional:%'
      and a.provider_account_external_id=p_certificate->'query'->>'networkId') then
    raise exception 'Active provider scope changed' using errcode='40001';
  end if;
  v_count:=jsonb_array_length(p_manifest);
  if v_count<1 or v_count>25000 or v_count is distinct from (p_certificate->>'sourceTotal')::integer
     or jsonb_array_length(p_certificate->'captures') is distinct from 2
     or p_certificate->'captures'->0->>'identitySetSha256' is distinct from p_certificate->'captures'->1->>'identitySetSha256'
     or p_certificate->'captures'->0->>'normalizedVersionSetSha256' is distinct from p_certificate->'captures'->1->>'normalizedVersionSetSha256'
     or p_certificate->'captures'->0->>'rawVersionSetSha256' is distinct from p_certificate->'captures'->1->>'rawVersionSetSha256' then
    raise exception 'Independent source capture proof invalid' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_manifest) x
    where jsonb_typeof(x)<>'array' or jsonb_array_length(x)<>2
      or coalesce(x->>0,'')!~'^[a-zA-Z0-9_-]{1,160}$' or coalesce(x->>1,'')!~'^[a-f0-9]{64}$') then
    raise exception 'Source manifest identity invalid' using errcode='22023';
  end if;
  select count(distinct x->>0),
    encode(sha256(convert_to(replace(jsonb_agg(x->0 order by (x->>0) collate "C")::text,' ',''),'UTF8')),'hex'),
    encode(sha256(convert_to(replace(jsonb_agg(x order by (x->>0) collate "C")::text,' ',''),'UTF8')),'hex')
    into v_unique,v_identity_hash,v_normalized_hash from jsonb_array_elements(p_manifest) x;
  if v_unique<>v_count or v_identity_hash is distinct from p_certificate->>'identitySetSha256'
     or v_normalized_hash is distinct from p_certificate->>'normalizedVersionSetSha256' then
    raise exception 'Source manifest commitment invalid' using errcode='22023';
  end if;
  v_from:=(v_run.metadata->>'from')::timestamp at time zone 'America/New_York';
  v_to:=(v_run.metadata->>'to')::timestamp at time zone 'America/New_York';
  select count(*) into v_matched from jsonb_array_elements(p_manifest) x
    join public.everflow_conversion_events e on e.source_identity=x->>0 and e.payload_hash=x->>1
    join public.commerce_evidence_records er on er.id=e.evidence_id
   where e.organization_id=p_organization_id and e.connection_id=p_connection_id and e.provider_account_id=p_provider_account_id
     and e.conversion_id=e.source_identity and e.conversion_at between v_from and v_to
     and e.network_id=p_certificate->'query'->>'networkId' and e.currency='USD'
     and er.organization_id=e.organization_id and er.connection_id=e.connection_id and er.provider_account_id=e.provider_account_id
     and er.source_object_type='everflow_conversion' and er.source_object_id=e.source_identity
     and er.metadata->>'normalizedPayloadHash'=e.payload_hash and er.deleted_at is null;
  if v_matched<>v_count then raise exception 'Source evidence coverage changed or incomplete' using errcode='40001'; end if;
  if not exists(select 1 from public.commerce_evidence_records er where er.id=p_evidence_id
    and er.organization_id=p_organization_id and er.connection_id=p_connection_id and er.provider_account_id=p_provider_account_id
    and er.sync_run_id=p_run_id and er.source_object_type='everflow_source_coverage_certification'
    and er.source_object_id=p_run_id::text and er.deleted_at is null
    and er.payload_hash=p_certificate->'artifact'->>'contentSha256') then
    raise exception 'Immutable certification evidence missing' using errcode='22023';
  end if;
  update public.commerce_sync_runs set metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{source_coverage_certification}',p_certificate,true)
   where id=p_run_id;
  insert into public.tracekit_audit_events(actor_user_id,account_id,organization_id,action,target_type,target_id,result,correlation_id,metadata)
   values(p_actor_user_id,p_account_id,p_organization_id,'everflow.source_coverage_certified','commerce_sync_run',p_run_id::text,'success',p_correlation_id,
     jsonb_build_object('evidenceId',p_evidence_id,'identitySetSha256',v_identity_hash,'normalizedVersionSetSha256',v_normalized_hash,
       'sourceIdentities',v_count,'historicalExecutionStatus',v_run.status,'historicalCountersPreserved',true,'customerFinancialAcceptance','not_certified'));
  return p_certificate;
end;
$$;
revoke all on function public.certify_everflow_source_coverage(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.certify_everflow_source_coverage(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,jsonb,uuid) to service_role;
