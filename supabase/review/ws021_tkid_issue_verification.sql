-- Review-only installation; no production execution authorized.
BEGIN;
CREATE FUNCTION public.tkid_issue_origin_verification(
 p_organization_id uuid,p_account_id uuid,p_business_context_id text,p_origin_id uuid,
 p_actor_id uuid,p_record_name text,p_token_digest text,p_token_hint text,p_correlation_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 o public.tkid_source_origins%ROWTYPE;
 expires timestamptz;
BEGIN
 IF p_business_context_id IS NULL OR p_actor_id IS NULL OR
 p_token_digest IS NULL OR p_token_digest !~ '^[a-f0-9]{64}$' OR
 p_token_hint IS NULL OR p_token_hint !~ '^[A-Za-z0-9_-]{8}$' OR
 p_correlation_id IS NULL OR p_correlation_id !~ '^[0-9a-f-]{36}$' THEN
 RAISE EXCEPTION 'Invalid verification request' USING ERRCODE='22023'; END IF;
 SELECT * INTO o FROM public.tkid_source_origins WHERE id=p_origin_id
 AND organization_id=p_organization_id AND account_id=p_account_id
 AND business_context_id=p_business_context_id FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.tkid_sources s
 WHERE s.id=o.source_id AND s.organization_id=p_organization_id
 AND s.account_id=p_account_id AND s.business_context_id=p_business_context_id) THEN
 RAISE EXCEPTION 'Resource unavailable' USING ERRCODE='TK404'; END IF;
 IF p_record_name IS DISTINCT FROM '_tracekit.' || split_part(substring(o.canonical_origin FROM 9),':',1) THEN
 RAISE EXCEPTION 'Invalid record name' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.tkid_origin_verifications
 WHERE origin_id=o.id AND state='issued' AND expires_at>clock_timestamp()) THEN
 RAISE EXCEPTION 'Challenge already issued' USING ERRCODE='TK409'; END IF;
 -- Refuse to disrupt active or previously verified lifecycle states.
 IF o.lifecycle_status IS DISTINCT FROM 'pending' OR o.verified_at IS NOT NULL THEN
 RAISE EXCEPTION 'Resource unavailable' USING ERRCODE='TK404'; END IF;
 UPDATE public.tkid_origin_verifications SET state='superseded',superseded_at=clock_timestamp()
 WHERE origin_id=o.id AND organization_id=p_organization_id AND state='issued';
 expires := clock_timestamp()+interval '24 hours';
 INSERT INTO public.tkid_origin_verifications(
 organization_id,source_id,origin_id,record_name,token_digest,token_hint,expires_at,executor_context)
 VALUES(p_organization_id,o.source_id,o.id,p_record_name,p_token_digest,p_token_hint,expires,'product_admin');
 UPDATE public.tkid_source_origins SET verification_state='issued',updated_at=clock_timestamp()
 WHERE id=o.id AND organization_id=p_organization_id;
 INSERT INTO public.tracekit_audit_events(actor_user_id,account_id,organization_id,action,target_type,target_id,
 result,permission_evaluated,correlation_id,metadata)
 VALUES(p_actor_id,p_account_id,p_organization_id,'tkid.origin_verification_issued','tkid_source_origin',o.id::text,
 'success','admin.manage_feature_access',p_correlation_id,
 jsonb_build_object('origin',o.canonical_origin,'role',o.role,'sourceId',o.source_id,'method','dns_txt','expiresAt',expires));
 RETURN jsonb_build_object('record_name',p_record_name,'expires_at',expires);
END $$;
REVOKE ALL ON FUNCTION public.tkid_issue_origin_verification(uuid,uuid,text,uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tkid_issue_origin_verification(uuid,uuid,text,uuid,uuid,text,text,text,text) TO service_role;
COMMIT;
