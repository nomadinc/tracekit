begin;select plan(5);
select ok(has_table_privilege('service_role','public.mcp_action_execution_results','SELECT'),'service role retains SELECT');
select ok(has_table_privilege('service_role','public.mcp_action_execution_results','INSERT'),'service role retains INSERT');
select ok(not has_table_privilege('service_role','public.mcp_action_execution_results','UPDATE'),'service role cannot UPDATE immutable results');
select ok(not has_table_privilege('service_role','public.mcp_action_execution_results','DELETE'),'service role cannot DELETE immutable results');
select ok(not has_table_privilege('service_role','public.mcp_action_execution_results','TRUNCATE'),'service role cannot TRUNCATE immutable results');
select * from finish();rollback;
