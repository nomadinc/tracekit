begin; select plan(29);

select has_table('public','tkid_proof_journey_claims','journey reservations exist');
select has_table('public','tkid_proof_event_claims','event reservations exist');
select has_table('public','tkid_proof_rejection_evidence','bounded rejection evidence exists');
select has_column('public','tkid_sources','ingestion_state','source-scoped ingestion state exists');
select has_function('public','claim_tkid_proof_capacity_v1',array['uuid','uuid','uuid','text','uuid','uuid','uuid','uuid','timestamp with time zone'],'atomic claim RPC exists');
select has_function('public','get_tkid_bounded_proof_status_v1',array['uuid','uuid','uuid'],'operator status RPC exists');
select has_function('public','set_tkid_source_ingestion_state_v1',array['uuid','uuid','text','text','uuid','text','text'],'audited stop/start RPC exists');

insert into public.tracekit_accounts(id,account_type,name) values('a6100000-0000-4000-8000-000000000001','client','Proof Account');
insert into public.tracekit_organizations(id,owning_account_id,name) values('a6100000-0000-4000-8000-000000000002','a6100000-0000-4000-8000-000000000001','Proof Org');
insert into public.tracekit_business_contexts(id,account_id,organization_id,name) values('proof-context','a6100000-0000-4000-8000-000000000001','a6100000-0000-4000-8000-000000000002','Proof Context');
insert into public.tracekit_users(id,workos_user_id,primary_email,display_name,status) values('a6100000-0000-4000-8000-000000000009','user_proof_stage1','proof@example.test','Proof Operator','active');
insert into public.tkid_sources(id,account_id,organization_id,business_context_id,public_source_id,environment,status,allowed_origins,abuse_adapter,proof_max_journeys,proof_max_events,proof_starts_at,proof_ends_at,ingestion_state)
values('a6100000-0000-4000-8000-000000000003','a6100000-0000-4000-8000-000000000001','a6100000-0000-4000-8000-000000000002','proof-context','tksrc_proof12345678901','production','shadow',array['https://proof.example'],'supabase_fixed_window_v1',50,1000,'2026-09-26T00:00:00Z','2026-09-28T00:00:00Z','enabled');
insert into public.tkid_source_origins(id,account_id,organization_id,business_context_id,source_id,canonical_origin,role,lifecycle_status,verification_state,verified_at)
values('a6100000-0000-4000-8000-000000000004','a6100000-0000-4000-8000-000000000001','a6100000-0000-4000-8000-000000000002','proof-context','a6100000-0000-4000-8000-000000000003','https://proof.example','frontend','active','verified','2026-09-25T00:00:00Z');

select is((select decision from public.claim_tkid_proof_capacity_v1('a6100000-0000-4000-8000-000000000002','a6100000-0000-4000-8000-000000000003','a6100000-0000-4000-8000-000000000004','bootstrap','a6100000-0000-4000-8000-000000000010','a6100000-0000-4000-8000-000000000011','a6100000-0000-4000-8000-000000000012',null,'2026-09-26T01:00:00Z')),'accepted','first journey accepted');
select is((select reused from public.claim_tkid_proof_capacity_v1('a6100000-0000-4000-8000-000000000002','a6100000-0000-4000-8000-000000000003','a6100000-0000-4000-8000-000000000004','bootstrap','a6100000-0000-4000-8000-000000000099','a6100000-0000-4000-8000-000000000098','a6100000-0000-4000-8000-000000000012',null,'2026-09-26T01:00:01Z')),true,'bootstrap retry reuses reservation');
select is((select count(*)::integer from public.tkid_proof_journey_claims),1,'journey retry consumes no capacity');

do $$ declare i integer; begin for i in 2..50 loop perform * from public.claim_tkid_proof_capacity_v1('a6100000-0000-4000-8000-000000000002','a6100000-0000-4000-8000-000000000003','a6100000-0000-4000-8000-000000000004','bootstrap',gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null,'2026-09-26T01:00:00Z'); end loop; end $$;
select is((select count(*)::integer from public.tkid_proof_journey_claims),50,'journey 50 accepted');
select is((select decision from public.claim_tkid_proof_capacity_v1('a6100000-0000-4000-8000-000000000002','a6100000-0000-4000-8000-000000000003','a6100000-0000-4000-8000-000000000004','bootstrap',gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null,'2026-09-26T01:00:00Z')),'journey_budget_exhausted','journey 51 rejected');

select is((select decision from public.claim_tkid_proof_capacity_v1('a6100000-0000-4000-8000-000000000002','a6100000-0000-4000-8000-000000000003','a6100000-0000-4000-8000-000000000004','event','a6100000-0000-4000-8000-000000000010',null,null,'a6100000-0000-4000-8000-000000000020','2026-09-26T01:00:00Z')),'accepted','first event accepted');
select is((select reused from public.claim_tkid_proof_capacity_v1('a6100000-0000-4000-8000-000000000002','a6100000-0000-4000-8000-000000000003','a6100000-0000-4000-8000-000000000004','event','a6100000-0000-4000-8000-000000000010',null,null,'a6100000-0000-4000-8000-000000000020','2026-09-26T01:00:01Z')),true,'duplicate event reuses reservation');
select is((select count(*)::integer from public.tkid_proof_event_claims),1,'duplicate event consumes no capacity');
do $$ declare i integer; v uuid; begin for i in 2..1000 loop v=(substr(md5(i::text),1,8)||'-'||substr(md5(i::text),9,4)||'-4'||substr(md5(i::text),14,3)||'-8'||substr(md5(i::text),18,3)||'-'||substr(md5(i::text),21,12))::uuid; perform * from public.claim_tkid_proof_capacity_v1('a6100000-0000-4000-8000-000000000002','a6100000-0000-4000-8000-000000000003','a6100000-0000-4000-8000-000000000004','event','a6100000-0000-4000-8000-000000000010',null,null,v,'2026-09-26T01:00:00Z'); end loop; end $$;
select is((select count(*)::integer from public.tkid_proof_event_claims),1000,'event 1000 accepted');
select is((select decision from public.claim_tkid_proof_capacity_v1('a6100000-0000-4000-8000-000000000002','a6100000-0000-4000-8000-000000000003','a6100000-0000-4000-8000-000000000004','event','a6100000-0000-4000-8000-000000000010',null,null,gen_random_uuid(),'2026-09-26T01:00:00Z')),'event_budget_exhausted','event 1001 rejected');

truncate public.tkid_proof_event_claims,public.tkid_proof_journey_claims,public.tkid_proof_rejection_evidence;
select is((select decision from public.claim_tkid_proof_capacity_v1('a6100000-0000-4000-8000-000000000002','a6100000-0000-4000-8000-000000000003','a6100000-0000-4000-8000-000000000004','bootstrap',gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null,'2026-09-25T23:59:59Z')),'proof_not_started','before start rejected');
select is((select decision from public.claim_tkid_proof_capacity_v1('a6100000-0000-4000-8000-000000000002','a6100000-0000-4000-8000-000000000003','a6100000-0000-4000-8000-000000000004','bootstrap',gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null,'2026-09-28T00:00:00Z')),'proof_expired','at end rejected');
update public.tkid_sources set ingestion_state='stopped' where id='a6100000-0000-4000-8000-000000000003';
select is((select decision from public.claim_tkid_proof_capacity_v1('a6100000-0000-4000-8000-000000000002','a6100000-0000-4000-8000-000000000003','a6100000-0000-4000-8000-000000000004','bootstrap',gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null,'2026-09-26T01:00:00Z')),'ingestion_stopped','stopped source rejected');
update public.tkid_sources set ingestion_state='enabled',abuse_adapter=null where id='a6100000-0000-4000-8000-000000000003';
select is((select decision from public.claim_tkid_proof_capacity_v1('a6100000-0000-4000-8000-000000000002','a6100000-0000-4000-8000-000000000003','a6100000-0000-4000-8000-000000000004','bootstrap',gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null,'2026-09-26T01:00:00Z')),'unsupported_abuse_adapter','missing adapter rejected');
update public.tkid_sources set abuse_adapter='other_v1' where id='a6100000-0000-4000-8000-000000000003';
select is((select decision from public.claim_tkid_proof_capacity_v1('a6100000-0000-4000-8000-000000000002','a6100000-0000-4000-8000-000000000003','a6100000-0000-4000-8000-000000000004','bootstrap',gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null,'2026-09-26T01:00:00Z')),'unsupported_abuse_adapter','unsupported adapter rejected');
select ok((select sum(rejected_count)>=4 from public.tkid_proof_rejection_evidence),'safe rejection evidence accumulated');
select is((select count(*)::integer from information_schema.role_routine_grants where routine_schema='public' and routine_name in('claim_tkid_proof_capacity_v1','get_tkid_bounded_proof_status_v1','set_tkid_source_ingestion_state_v1') and grantee in('PUBLIC','anon','authenticated','authenticator')),0,'proof RPCs are not browser executable');
select ok((select relrowsecurity from pg_class where oid='public.tkid_proof_rejection_evidence'::regclass),'rejection evidence RLS enabled');
select ok(position('pg_advisory_xact_lock' in (select pg_get_functiondef('public.claim_tkid_proof_capacity_v1(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,timestamptz)'::regprocedure)))>0,'claim serialization is database-backed');
select is((select reserved_events from public.get_tkid_bounded_proof_status_v1('a6100000-0000-4000-8000-000000000002','a6100000-0000-4000-8000-000000000003','a6100000-0000-4000-8000-000000000004')),0::bigint,'status reports exact reserved events');
select lives_ok($sql$select * from public.set_tkid_source_ingestion_state_v1('a6100000-0000-4000-8000-000000000002','a6100000-0000-4000-8000-000000000003','stopped','operator stop','a6100000-0000-4000-8000-000000000009','proof-stop-1','set-tkid-source-ingestion-state')$sql$,'audited source stop works');
select is((select count(*)::integer from public.tracekit_audit_events where correlation_id='proof-stop-1' and action='tkid.source_ingestion_stopped'),1,'source stop audit persisted');

select * from finish(); rollback;
