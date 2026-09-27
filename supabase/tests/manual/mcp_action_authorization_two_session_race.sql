-- Manual/CI two-session race harness for M10 authorization consumption.
-- Requires two independent PostgreSQL sessions. Never run the two contender blocks in one session.
-- Uses controlled IDs and leaves no record after cleanup.

-- SETUP (session A or admin)
insert into public.mcp_action_authorizations(
 authorization_id,organization_id,envelope_identity,idempotency_key,audit_correlation_id,expires_at
) values(
 'a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001',
 'm10-race-envelope-1','m10-race-idem-1','m10-race-audit-1',now()+interval '1 hour'
);

-- SESSION A: begin this first, then keep transaction open after the consume call.
begin;
select 'A' contender,* from public.consume_mcp_action_authorization(
 'a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001',
 'm10-race-envelope-1','m10-race-idem-1','m10-race-audit-1',
 'a3000000-0000-0000-0000-000000000001',clock_timestamp()
);
select pg_sleep(5);
commit;

-- SESSION B: start while session A is sleeping. This call must wait on A's row lock.
begin;
select 'B' contender,* from public.consume_mcp_action_authorization(
 'a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001',
 'm10-race-envelope-1','m10-race-idem-1','m10-race-audit-1',
 'a3000000-0000-0000-0000-000000000002',clock_timestamp()
);
commit;

-- ACCEPTANCE (admin): exactly one persisted winner. B must report replay_same_result
-- with A's consumption_id/time rather than its proposed consumption_id.
select * from public.mcp_action_authorization_consumption_invariant('a1000000-0000-0000-0000-000000000001');
select authorization_id,state,consumption_id,consumed_at
from public.mcp_action_authorizations
where authorization_id='a1000000-0000-0000-0000-000000000001';

-- CLEANUP
delete from public.mcp_action_authorizations where authorization_id='a1000000-0000-0000-0000-000000000001';
