begin;select plan(5);
select ok(has_table_privilege('service_role','public.mcp_evidence_limit_acceptances','SELECT'),'service role retains SELECT');
select ok(has_table_privilege('service_role','public.mcp_evidence_limit_acceptances','INSERT'),'service role retains INSERT');
select ok(not has_table_privilege('service_role','public.mcp_evidence_limit_acceptances','UPDATE'),'acceptance ledger cannot be updated');
select ok(not has_table_privilege('service_role','public.mcp_evidence_limit_acceptances','DELETE'),'acceptance ledger cannot be deleted');
select ok(not has_table_privilege('service_role','public.mcp_evidence_limit_acceptances','TRUNCATE'),'acceptance ledger cannot be truncated');
select * from finish();rollback;
