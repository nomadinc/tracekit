begin;
select plan(10);
select has_table('public','mcp_action_execution_markers','internal execution marker table exists');
select is((select relrowsecurity from pg_class where oid='public.mcp_action_execution_markers'::regclass),true,'marker RLS enabled');
select isnt(has_function_privilege('authenticated','public.execute_mcp_internal_marker(uuid,uuid,text,text,text,uuid,text,timestamp with time zone)','EXECUTE'),true,'authenticated cannot execute');
insert into public.mcp_action_authorizations(authorization_id,organization_id,envelope_identity,idempotency_key,audit_correlation_id,state,expires_at,consumed_at,consumption_id)
values('b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','exec-internal-1','idem-internal-1','audit-internal-1','consumed',now()+interval '1 hour',now(),'b3000000-0000-0000-0000-000000000001');
select is((select decision from public.execute_mcp_internal_marker('b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','exec-internal-1','idem-internal-1','audit-internal-1','b3000000-0000-0000-0000-000000000001','proof-marker',now())),'mutated','consumed authorization permits marker mutation');
select is((select marker_value from public.mcp_action_execution_markers where envelope_identity='exec-internal-1'),'proof-marker','postcondition persisted');
select is((select decision from public.execute_mcp_internal_marker('b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','exec-internal-1','idem-internal-1','audit-internal-1','b3000000-0000-0000-0000-000000000001','proof-marker',now())),'replay_same_result','exact execution retry is idempotent');
select is((select decision from public.execute_mcp_internal_marker('b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','exec-internal-1','idem-internal-1','audit-internal-1','b3000000-0000-0000-0000-000000000001','different',now())),'reject','changed mutation rejected');
select is(public.revert_mcp_internal_marker('b2000000-0000-0000-0000-000000000001','exec-internal-1','b3000000-0000-0000-0000-000000000001',now()),true,'authorized identity can revert marker');
select ok((select reverted_at is not null from public.mcp_action_execution_markers where envelope_identity='exec-internal-1'),'rollback postcondition persisted');
select is(public.revert_mcp_internal_marker('b2000000-0000-0000-0000-000000000001','exec-internal-1','b3000000-0000-0000-0000-000000000001',now()),false,'rollback is idempotent');
select * from finish(); rollback;
