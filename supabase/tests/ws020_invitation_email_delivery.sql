BEGIN;
\set ON_ERROR_STOP on
insert into tracekit_users(id,workos_user_id,primary_email,display_name) values('00000000-0000-0000-0000-000000000001','operator','operator@example.test','Operator'),('00000000-0000-0000-0000-000000000002','customer','customer@example.test','Customer'),('00000000-0000-0000-0000-000000000003','other','other@example.test','Other');
insert into tracekit_accounts(id,account_type,name) values('00000000-0000-0000-0000-000000000010','client','Client');
insert into tracekit_organizations(id,owning_account_id,name) values('00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000010','Tenant');
insert into tracekit_business_contexts(id,account_id,organization_id,name,status) values('context','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000020','Test context','active');
insert into tracekit_memberships(id,user_id,organization_id,role_id) select '00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000020',id from tracekit_roles where role_key='organization-owner';
insert into tracekit_business_context_access(membership_id,organization_id,business_context_id) values('00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000020','context');

DO $$
declare a jsonb; b jsonb; x uuid; y jsonb;
begin
 a:=tracekit_invitation_delivery('issue','00000000-0000-0000-0000-000000000001','operator','delivery-test','00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000020',null,'customer@example.test',array['context']);
 assert (a->>'claimed')::boolean; x:=(a->>'id')::uuid;
 b:=tracekit_invitation_delivery('issue','00000000-0000-0000-0000-000000000001','operator','delivery-test','00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000020',null,'CUSTOMER@example.test',array['context']);
 assert a->>'id'=b->>'id'; assert not (b->>'claimed')::boolean;
 assert (select count(*)=1 from tracekit_invitations where intended_email='customer@example.test');
 assert not exists(select 1 from tracekit_memberships where invitation_id=x);
 b:=tracekit_invitation_delivery('finish','00000000-0000-0000-0000-000000000001','operator','delivery-test','00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000020',x,p_attempt_id=>(a->>'attemptId')::uuid,p_state=>'unknown');
 b:=tracekit_invitation_delivery('claim','00000000-0000-0000-0000-000000000001','operator','delivery-test','00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000020',x);
 assert b->>'state'='unknown'; assert not (b->>'claimed')::boolean;
 b:=tracekit_invitation_delivery('finish','00000000-0000-0000-0000-000000000001','operator','delivery-test','00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000020',x,p_attempt_id=>(a->>'attemptId')::uuid,p_state=>'sent',p_provider_id=>'invitation_test',p_provider_state=>'pending');
 b:=tracekit_invitation_delivery('finish','00000000-0000-0000-0000-000000000001','operator','delivery-test','00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000020',x,p_attempt_id=>(a->>'attemptId')::uuid,p_state=>'sent',p_provider_id=>'invitation_test',p_provider_state=>'pending');
 assert b->>'state'='sent';
 begin perform tracekit_invitation_delivery('status','00000000-0000-0000-0000-000000000003','other','delivery-test','00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000020',x); raise exception 'Missing actor denial'; exception when insufficient_privilege then null; end;
 update tracekit_invitations set status='revoked' where id=x;
 -- A delivery result may settle after revocation; it never reactivates or grants access.
 b:=tracekit_invitation_delivery('finish','00000000-0000-0000-0000-000000000001','operator','delivery-test','00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000020',x,p_attempt_id=>(a->>'attemptId')::uuid,p_state=>'sent',p_provider_id=>'invitation_test',p_provider_state=>'pending');
 assert (select status='revoked' from tracekit_invitations where id=x);
 begin perform tracekit_invitation_delivery('claim','00000000-0000-0000-0000-000000000001','operator','delivery-test','00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000020',x); raise exception 'Missing revocation denial'; exception when insufficient_privilege then null; end;
 a:=tracekit_invitation_delivery('issue','00000000-0000-0000-0000-000000000001','operator','delivery-test','00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000020',null,'other@example.test',array['context']);
 x:=(a->>'id')::uuid;
 b:=tracekit_invitation_delivery('finish','00000000-0000-0000-0000-000000000001','operator','delivery-test','00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000020',x,p_attempt_id=>(a->>'attemptId')::uuid,p_state=>'failed');
 b:=tracekit_invitation_delivery('claim','00000000-0000-0000-0000-000000000001','operator','delivery-test','00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000020',x); assert not (b->>'claimed')::boolean;
 update tracekit_invitation_deliveries set updated_at=now()-interval '31 seconds' where invitation_id=x;
 b:=tracekit_invitation_delivery('claim','00000000-0000-0000-0000-000000000001','operator','delivery-test','00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000020',x); assert (b->>'claimed')::boolean; assert a->>'attemptId'<>b->>'attemptId';
 assert not exists(select 1 from tracekit_memberships where invitation_id=x);
 update tracekit_invitation_deliveries set updated_at=now()-interval '6 minutes' where invitation_id=x;
 b:=tracekit_invitation_delivery('claim','00000000-0000-0000-0000-000000000001','operator','delivery-test','00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000020',x); assert not (b->>'claimed')::boolean; assert b->>'state'='unknown';
 a:=tracekit_invitation_delivery('issue','00000000-0000-0000-0000-000000000001','operator','delivery-test','00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000020',null,'customer@example.test',array['context']);
 b:=tracekit_customer_invitation('accept','00000000-0000-0000-0000-000000000002','customer','delivery-test',(a->>'id')::uuid,p_email_verified=>true);
 assert (b->>'ok')::boolean;
 b:=tracekit_invitation_delivery('issue','00000000-0000-0000-0000-000000000001','operator','delivery-test','00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000020',null,'customer@example.test',array['context']);
 assert not (b->>'ok')::boolean; assert b->>'reason'='existing_membership';
 assert (select count(*)=1 from tracekit_memberships where user_id='00000000-0000-0000-0000-000000000002');
 assert not has_function_privilege('authenticated','public.tracekit_invitation_delivery(text,uuid,text,text,uuid,uuid,uuid,text,text[],uuid,text,text,text)','EXECUTE');
 raise notice 'Delivery deduplication, send lease, safe rejection retry, ambiguous/stale no-replay, actor/revocation denial and no premature membership passed';
end $$;
ROLLBACK;
