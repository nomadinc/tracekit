begin;
select plan(51);

select ok(to_regprocedure('public.commerce_provider_credential_version_guard()') is not null,'credential version guard exists');
select ok(to_regprocedure('public.commerce_evidence_immutable_guard()') is not null,'evidence immutable guard exists');
select ok(to_regprocedure('public.tracekit_investigation_version_immutable_guard()') is not null,'Investigation version guard exists');
select ok(to_regprocedure('public.tracekit_investigation_branch_guard()') is not null,'Investigation branch guard exists');
select ok(to_regprocedure('public.tracekit_investigation_branch_immutable_guard()') is not null,'Investigation branch immutable guard exists');

select is((select pg_get_userbyid(proowner) from pg_proc where oid='public.commerce_provider_credential_version_guard()'::regprocedure),'postgres','credential guard owner preserved');
select is((select pg_get_userbyid(proowner) from pg_proc where oid='public.commerce_evidence_immutable_guard()'::regprocedure),'postgres','evidence guard owner preserved');
select is((select pg_get_userbyid(proowner) from pg_proc where oid='public.tracekit_investigation_version_immutable_guard()'::regprocedure),'postgres','Investigation guard owner preserved');
select is((select pg_get_userbyid(proowner) from pg_proc where oid='public.tracekit_investigation_branch_guard()'::regprocedure),'postgres','branch guard owner preserved');
select is((select pg_get_userbyid(proowner) from pg_proc where oid='public.tracekit_investigation_branch_immutable_guard()'::regprocedure),'postgres','branch immutable guard owner preserved');

select is((select prosecdef from pg_proc where oid='public.commerce_provider_credential_version_guard()'::regprocedure),false,'credential guard remains SECURITY INVOKER');
select is((select prosecdef from pg_proc where oid='public.commerce_evidence_immutable_guard()'::regprocedure),false,'evidence guard remains SECURITY INVOKER');
select is((select prosecdef from pg_proc where oid='public.tracekit_investigation_version_immutable_guard()'::regprocedure),false,'Investigation guard remains SECURITY INVOKER');
select is((select prosecdef from pg_proc where oid='public.tracekit_investigation_branch_guard()'::regprocedure),false,'branch guard remains SECURITY INVOKER');
select is((select prosecdef from pg_proc where oid='public.tracekit_investigation_branch_immutable_guard()'::regprocedure),false,'branch immutable guard remains SECURITY INVOKER');

select is((select proconfig from pg_proc where oid='public.commerce_provider_credential_version_guard()'::regprocedure),null::text[],'credential guard search_path unchanged');
select is((select proconfig from pg_proc where oid='public.commerce_evidence_immutable_guard()'::regprocedure),null::text[],'evidence guard search_path unchanged');
select is((select proconfig from pg_proc where oid='public.tracekit_investigation_version_immutable_guard()'::regprocedure),null::text[],'Investigation guard search_path unchanged');
select is((select proconfig from pg_proc where oid='public.tracekit_investigation_branch_guard()'::regprocedure),array['search_path=public, pg_temp']::text[],'branch guard search_path preserved');
select is((select proconfig from pg_proc where oid='public.tracekit_investigation_branch_immutable_guard()'::regprocedure),array['search_path=public, pg_temp']::text[],'branch immutable guard search_path preserved');

select ok(not has_function_privilege('public','public.commerce_provider_credential_version_guard()','execute'),'PUBLIC cannot execute credential guard');
select ok(not has_function_privilege('anon','public.commerce_provider_credential_version_guard()','execute'),'anon cannot execute credential guard');
select ok(not has_function_privilege('authenticated','public.commerce_provider_credential_version_guard()','execute'),'authenticated cannot execute credential guard');
select ok(not has_function_privilege('service_role','public.commerce_provider_credential_version_guard()','execute'),'service_role cannot directly execute credential guard');
select ok(not has_function_privilege('public','public.commerce_evidence_immutable_guard()','execute'),'PUBLIC cannot execute evidence guard');
select ok(not has_function_privilege('anon','public.commerce_evidence_immutable_guard()','execute'),'anon cannot execute evidence guard');
select ok(not has_function_privilege('authenticated','public.commerce_evidence_immutable_guard()','execute'),'authenticated cannot execute evidence guard');
select ok(not has_function_privilege('service_role','public.commerce_evidence_immutable_guard()','execute'),'service_role cannot directly execute evidence guard');
select ok(not has_function_privilege('public','public.tracekit_investigation_version_immutable_guard()','execute'),'PUBLIC cannot execute Investigation guard');
select ok(not has_function_privilege('anon','public.tracekit_investigation_version_immutable_guard()','execute'),'anon cannot execute Investigation guard');
select ok(not has_function_privilege('authenticated','public.tracekit_investigation_version_immutable_guard()','execute'),'authenticated cannot execute Investigation guard');
select ok(not has_function_privilege('service_role','public.tracekit_investigation_version_immutable_guard()','execute'),'service_role cannot directly execute Investigation guard');
select ok(not has_function_privilege('public','public.tracekit_investigation_branch_guard()','execute'),'PUBLIC cannot execute branch guard');
select ok(not has_function_privilege('anon','public.tracekit_investigation_branch_guard()','execute'),'anon cannot execute branch guard');
select ok(not has_function_privilege('authenticated','public.tracekit_investigation_branch_guard()','execute'),'authenticated cannot execute branch guard');
select ok(not has_function_privilege('service_role','public.tracekit_investigation_branch_guard()','execute'),'service_role cannot directly execute branch guard');
select ok(not has_function_privilege('public','public.tracekit_investigation_branch_immutable_guard()','execute'),'PUBLIC cannot execute branch immutable guard');
select ok(not has_function_privilege('anon','public.tracekit_investigation_branch_immutable_guard()','execute'),'anon cannot execute branch immutable guard');
select ok(not has_function_privilege('authenticated','public.tracekit_investigation_branch_immutable_guard()','execute'),'authenticated cannot execute branch immutable guard');
select ok(not has_function_privilege('service_role','public.tracekit_investigation_branch_immutable_guard()','execute'),'service_role cannot directly execute branch immutable guard');

select is((select count(*)::integer from pg_trigger where not tgisinternal and tgfoid='public.commerce_provider_credential_version_guard()'::regprocedure and tgrelid='public.commerce_provider_credentials'::regclass),1,'credential trigger still targets exact guard');
select is((select count(*)::integer from pg_trigger where not tgisinternal and tgfoid='public.commerce_evidence_immutable_guard()'::regprocedure and tgrelid='public.commerce_evidence_records'::regclass),1,'evidence trigger still targets exact guard');
select is((select count(*)::integer from pg_trigger where not tgisinternal and tgfoid='public.tracekit_investigation_version_immutable_guard()'::regprocedure and tgrelid='public.tracekit_investigation_versions'::regclass),1,'Investigation trigger still targets exact guard');
select is((select count(*)::integer from pg_trigger where not tgisinternal and tgfoid='public.tracekit_investigation_branch_guard()'::regprocedure and tgrelid='public.tracekit_investigations'::regclass),1,'branch trigger still targets exact guard');
select is((select count(*)::integer from pg_trigger where not tgisinternal and tgfoid='public.tracekit_investigation_branch_immutable_guard()'::regprocedure and tgrelid='public.tracekit_investigations'::regclass),1,'branch immutable trigger still targets exact guard');

select ok(has_function_privilege('postgres','public.commerce_provider_credential_version_guard()','execute'),'credential guard owner retains execution');
select ok(has_function_privilege('postgres','public.commerce_evidence_immutable_guard()','execute'),'evidence guard owner retains execution');
select ok(has_function_privilege('postgres','public.tracekit_investigation_version_immutable_guard()','execute'),'Investigation guard owner retains execution');
select ok(has_function_privilege('postgres','public.tracekit_investigation_branch_guard()','execute'),'branch guard owner retains execution');
select ok(has_function_privilege('postgres','public.tracekit_investigation_branch_immutable_guard()','execute'),'branch immutable guard owner retains execution');

select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prorettype='trigger'::regtype and p.proname in('commerce_provider_credential_version_guard','commerce_evidence_immutable_guard','tracekit_investigation_version_immutable_guard','tracekit_investigation_branch_guard','tracekit_investigation_branch_immutable_guard') and (has_function_privilege('public',p.oid,'execute') or has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('service_role',p.oid,'execute'))),0,'all five remediated trigger guards are owner-only');

select * from finish();
rollback;
