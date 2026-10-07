BEGIN;
\set ON_ERROR_STOP on
insert into tracekit_users(id,workos_user_id,primary_email,display_name) values('00000000-0000-0000-0000-000000000001','operator','operator@example.test','Operator'),('00000000-0000-0000-0000-000000000002','customer','customer@example.test','Customer'),('00000000-0000-0000-0000-000000000003','other','other@example.test','Other');
insert into tracekit_accounts(id,account_type,name) values('00000000-0000-0000-0000-000000000010','client','Client');
insert into tracekit_organizations(id,owning_account_id,name) values('00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000010','Tenant');
insert into tracekit_business_contexts(id,account_id,organization_id,name,status) values('context','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000020','Test context','active');
insert into tracekit_memberships(id,user_id,organization_id,role_id) select '00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000020',id from tracekit_roles where role_key='organization-owner';
insert into tracekit_business_context_access(membership_id,organization_id,business_context_id) values('00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000020','context');

do $$
declare result jsonb; invitation uuid; n integer;
begin
  for n in 1..6 loop
    invitation := ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
    result := public.tracekit_customer_invitation('issue','00000000-0000-0000-0000-000000000001','operator','test',invitation,'00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000020','CUSTOMER@example.test',array['context']);
    assert (result->>'ok')::boolean, result::text;
  end loop;
  result := public.tracekit_customer_invitation('issue','00000000-0000-0000-0000-000000000003','other','test',gen_random_uuid(),null,'00000000-0000-0000-0000-000000000020','customer@example.test',array['context']);
  assert not (result->>'ok')::boolean, 'missing authority';
  result := public.tracekit_customer_invitation('issue','00000000-0000-0000-0000-000000000001','operator','test',gen_random_uuid(),'00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000020','customer@example.test',array['foreign']);
  assert not (result->>'ok')::boolean, 'foreign context';
  result := public.tracekit_customer_invitation('accept','00000000-0000-0000-0000-000000000003','other','test','10000000-0000-0000-0000-000000000001',p_email_verified=>true);
  assert result->>'reason'='identity_mismatch';
  result := public.tracekit_customer_invitation('accept','00000000-0000-0000-0000-000000000002','customer','test','10000000-0000-0000-0000-000000000001',p_email_verified=>false);
  assert result->>'reason'='identity_mismatch';
  update public.tracekit_invitations set expires_at=now()-interval '1 second' where id='10000000-0000-0000-0000-000000000002';
  result := public.tracekit_customer_invitation('accept','00000000-0000-0000-0000-000000000002','customer','test','10000000-0000-0000-0000-000000000002',p_email_verified=>true);
  assert result->>'reason'='expired';
  result := public.tracekit_customer_invitation('revoke','00000000-0000-0000-0000-000000000001','operator','test','10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000030');
  assert (result->>'ok')::boolean;
  result := public.tracekit_customer_invitation('accept','00000000-0000-0000-0000-000000000002','customer','test','10000000-0000-0000-0000-000000000003',p_email_verified=>true);
  assert not (result->>'ok')::boolean, 'revoked';
  result := public.tracekit_customer_invitation('accept','00000000-0000-0000-0000-000000000002','wrong-identity','test','10000000-0000-0000-0000-000000000001',p_email_verified=>true);
  assert not (result->>'ok')::boolean, 'provider identity';
  result := public.tracekit_customer_invitation('accept','00000000-0000-0000-0000-000000000002','customer','test','10000000-0000-0000-0000-000000000001',p_email_verified=>true);
  assert (result->>'ok')::boolean, result::text;
  assert (select count(*)=1 from public.tracekit_memberships where user_id='00000000-0000-0000-0000-000000000002');
  assert (select r.role_key='client-read-only' and m.account_id is null from public.tracekit_memberships m join public.tracekit_roles r on r.id=m.role_id where m.user_id='00000000-0000-0000-0000-000000000002');
  assert (select count(*)=1 from public.tracekit_business_context_access a join public.tracekit_memberships m on m.id=a.membership_id where m.user_id='00000000-0000-0000-0000-000000000002');
  result := public.tracekit_customer_invitation('accept','00000000-0000-0000-0000-000000000002','customer','test','10000000-0000-0000-0000-000000000001',p_email_verified=>true);
  assert not (result->>'ok')::boolean, 'replay';
  result := public.tracekit_customer_invitation('accept','00000000-0000-0000-0000-000000000002','customer','test','10000000-0000-0000-0000-000000000004',p_email_verified=>true);
  assert result->>'reason'='existing_membership';
  assert (select count(*)>0 from public.tracekit_audit_events a where a.action='invitation.accept' and a.result='denied');
  assert not has_function_privilege('anon','public.tracekit_customer_invitation(text,uuid,text,text,uuid,uuid,uuid,text,text[],boolean)','EXECUTE');
  assert not has_function_privilege('authenticated','public.tracekit_customer_invitation(text,uuid,text,text,uuid,uuid,uuid,text,text[],boolean)','EXECUTE');
  raise notice 'Invitation issuance, identity, expiry, revocation, replay, membership, context and audit assertions passed';
end $$;

create function pg_temp.reject_acceptance_audit() returns trigger language plpgsql as $$ begin
  if new.action='invitation.accept' and new.result='success' then raise exception 'synthetic audit outage'; end if;
  return new;
end $$;
create trigger ws020_audit_failure before insert on tracekit_audit_events for each row execute function pg_temp.reject_acceptance_audit();
do $$
declare result jsonb;
begin
  result := tracekit_customer_invitation('issue','00000000-0000-0000-0000-000000000001','operator','rollback-test','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000020','other@example.test',array['context']);
  assert (result->>'ok')::boolean;
  begin
    perform tracekit_customer_invitation('accept','00000000-0000-0000-0000-000000000003','other','rollback-test','20000000-0000-0000-0000-000000000001',p_email_verified=>true);
    raise exception 'test unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'synthetic audit outage' then raise; end if;
  end;
  assert not exists(select 1 from tracekit_memberships where user_id='00000000-0000-0000-0000-000000000003');
  assert (select status='pending' from tracekit_invitations where id='20000000-0000-0000-0000-000000000001');
  raise notice 'Audit failure rolls back membership, access and invitation consumption';
end $$;
ROLLBACK;
