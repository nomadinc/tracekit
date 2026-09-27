begin;
select plan(31);

select has_function('public','recover_interrupted_tkid_event_v1',array['uuid','uuid','uuid','text','text','text','uuid'],'recovery RPC exists with no caller payload fields');
select function_returns('public','recover_interrupted_tkid_event_v1',array['uuid','uuid','uuid','text','text','text','uuid'],'setof record','recovery RPC returns bounded result evidence');
select is(
  encode(extensions.digest(public.tkid_canonical_json_v1(jsonb_build_object(
    'event_id','b7100000-0000-4000-8000-000000000020',
    'event_name','journey_started',
    'schema_version',1,
    'occurred_at','2026-09-26T01:01:00.000Z',
    'journey_id','b7100000-0000-4000-8000-000000000010',
    'browser_session_id','b7100000-0000-4000-8000-000000000011',
    'privacy_mode','essential'
  )),'sha256'),'hex'),
  '8f272a59094f5b450812660d184255701d98b99cecaa51a90a312e2e3d3a75ce',
  'database canonical hashing matches the Worker sorted-key JSON contract'
);

insert into public.tracekit_accounts(id,account_type,name) values
('b7100000-0000-4000-8000-000000000001','client','Recovery Account'),
('b7100000-0000-4000-8000-000000000101','client','Other Recovery Account');
insert into public.tracekit_organizations(id,owning_account_id,name) values
('b7100000-0000-4000-8000-000000000002','b7100000-0000-4000-8000-000000000001','Recovery Org'),
('b7100000-0000-4000-8000-000000000102','b7100000-0000-4000-8000-000000000101','Other Recovery Org');
insert into public.tracekit_business_contexts(id,account_id,organization_id,name) values
('recovery-context','b7100000-0000-4000-8000-000000000001','b7100000-0000-4000-8000-000000000002','Recovery Context'),
('other-recovery-context','b7100000-0000-4000-8000-000000000101','b7100000-0000-4000-8000-000000000102','Other Recovery Context');
insert into public.tkid_sources(id,account_id,organization_id,business_context_id,public_source_id,environment,status,allowed_origins,abuse_adapter,proof_max_journeys,proof_max_events,proof_starts_at,proof_ends_at,ingestion_state) values
('b7100000-0000-4000-8000-000000000003','b7100000-0000-4000-8000-000000000001','b7100000-0000-4000-8000-000000000002','recovery-context','tksrc_recovery123456789','production','shadow',array['https://recovery.example'],'supabase_fixed_window_v1',50,1000,'2026-09-26','2026-09-28','stopped'),
('b7100000-0000-4000-8000-000000000103','b7100000-0000-4000-8000-000000000101','b7100000-0000-4000-8000-000000000102','other-recovery-context','tksrc_otherrecovery1234','production','shadow',array['https://other-recovery.example'],'supabase_fixed_window_v1',50,1000,'2026-09-26','2026-09-28','stopped');
insert into public.tkid_source_origins(id,account_id,organization_id,business_context_id,source_id,canonical_origin,role,lifecycle_status,verification_state,verified_at) values
('b7100000-0000-4000-8000-000000000004','b7100000-0000-4000-8000-000000000001','b7100000-0000-4000-8000-000000000002','recovery-context','b7100000-0000-4000-8000-000000000003','https://recovery.example','frontend','active','verified','2026-09-25'),
('b7100000-0000-4000-8000-000000000005','b7100000-0000-4000-8000-000000000001','b7100000-0000-4000-8000-000000000002','recovery-context','b7100000-0000-4000-8000-000000000003','https://recovery-alt.example','frontend','active','verified','2026-09-25');
insert into public.tkid_journeys(id,account_id,organization_id,business_context_id,source_id,started_origin_id,started_origin,started_at,expires_at,state,completeness,privacy_mode,source_version,normalizer_version) values
('b7100000-0000-4000-8000-000000000010','b7100000-0000-4000-8000-000000000001','b7100000-0000-4000-8000-000000000002','recovery-context','b7100000-0000-4000-8000-000000000003','b7100000-0000-4000-8000-000000000004','https://recovery.example','2026-09-26 01:00','2026-09-26 03:00','active','partial','essential','tkid-sdk-v1','tkid-normalizer-v1');
insert into public.tkid_browser_sessions(id,organization_id,journey_id,source_id,started_at,last_seen_at,expires_at) values
('b7100000-0000-4000-8000-000000000011','b7100000-0000-4000-8000-000000000002','b7100000-0000-4000-8000-000000000010','b7100000-0000-4000-8000-000000000003','2026-09-26 01:00','2026-09-26 01:00','2026-09-26 01:30');
insert into public.tkid_proof_journey_claims(organization_id,source_id,origin_id,bootstrap_key,journey_id,browser_session_id,claimed_at) values
('b7100000-0000-4000-8000-000000000002','b7100000-0000-4000-8000-000000000003','b7100000-0000-4000-8000-000000000004','b7100000-0000-4000-8000-000000000012','b7100000-0000-4000-8000-000000000010','b7100000-0000-4000-8000-000000000011','2026-09-26 01:00');

create function pg_temp.make_recovery_fixture(
  p_event uuid,
  p_claim_journey uuid default 'b7100000-0000-4000-8000-000000000010',
  p_payload_journey uuid default 'b7100000-0000-4000-8000-000000000010',
  p_payload_session uuid default 'b7100000-0000-4000-8000-000000000011',
  p_claim_origin uuid default 'b7100000-0000-4000-8000-000000000004',
  p_evidence_origin uuid default 'b7100000-0000-4000-8000-000000000004',
  p_evidence_source uuid default 'b7100000-0000-4000-8000-000000000003',
  p_bad_hash boolean default false,
  p_claimed_at timestamptz default '2026-09-26 01:01'
) returns void language plpgsql as $$
declare p jsonb; h text;
begin
  p=jsonb_build_object('event_id',p_event,'event_name','journey_started','schema_version',1,'occurred_at','2026-09-26T01:01:00.000Z','journey_id',p_payload_journey,'browser_session_id',p_payload_session,'privacy_mode','essential','received_at','2026-09-26T01:01:01.000Z','normalizer_version','tkid-normalizer-v1');
  h=encode(extensions.digest(public.tkid_canonical_json_v1(p-'received_at'-'normalizer_version'),'sha256'),'hex');
  insert into public.tkid_proof_event_claims(organization_id,source_id,origin_id,journey_id,event_id,claimed_at)
  values('b7100000-0000-4000-8000-000000000002','b7100000-0000-4000-8000-000000000003',p_claim_origin,p_claim_journey,p_event,p_claimed_at);
  insert into public.tkid_event_evidence(organization_id,source_id,origin_id,observed_origin,event_id,evidence_hash,schema_version,bounded_payload,received_at)
  values('b7100000-0000-4000-8000-000000000002',p_evidence_source,p_evidence_origin,case when p_evidence_origin='b7100000-0000-4000-8000-000000000005' then 'https://recovery-alt.example' else 'https://recovery.example' end,p_event,case when p_bad_hash then repeat('0',64) else h end,1,p,'2026-09-26T01:01:01.000Z');
end $$;

select pg_temp.make_recovery_fixture('b7100000-0000-4000-8000-000000000020');
select is((select recovery_state from public.recover_interrupted_tkid_event_v1('b7100000-0000-4000-8000-000000000002','b7100000-0000-4000-8000-000000000003','b7100000-0000-4000-8000-000000000020','repair interrupted write','recovery-1','recover-interrupted-tkid-event')),'recovered','valid evidence-only state recovers');
select is((select id from public.tkid_events where id='b7100000-0000-4000-8000-000000000020'),'b7100000-0000-4000-8000-000000000020'::uuid,'exact event identity is inserted');
select is((select count(*)::integer from public.tkid_proof_event_claims where event_id='b7100000-0000-4000-8000-000000000020'),1,'existing reservation is reused');
select is((select count(*)::integer from public.tkid_event_evidence where event_id='b7100000-0000-4000-8000-000000000020'),1,'existing evidence is reused');
select is((select evidence_id from public.tkid_events where id='b7100000-0000-4000-8000-000000000020'),(select id from public.tkid_event_evidence where event_id='b7100000-0000-4000-8000-000000000020'),'event references existing evidence');
select is((select accepted_events from public.get_tkid_bounded_proof_status_v1('b7100000-0000-4000-8000-000000000002','b7100000-0000-4000-8000-000000000003','b7100000-0000-4000-8000-000000000004')),1::bigint,'authoritative accepted accounting includes recovery');
select is((select last_observation from public.get_tkid_bounded_proof_status_v1('b7100000-0000-4000-8000-000000000002','b7100000-0000-4000-8000-000000000003','b7100000-0000-4000-8000-000000000004')),'2026-09-26T01:01:01Z'::timestamptz,'last accepted observation is derived from recovered event');
select is((select recovery_state from public.recover_interrupted_tkid_event_v1('b7100000-0000-4000-8000-000000000002','b7100000-0000-4000-8000-000000000003','b7100000-0000-4000-8000-000000000020','replay','recovery-1','recover-interrupted-tkid-event')),'already_recovered','consistent replay is idempotent');
select is((select count(*)::integer from public.tracekit_audit_events where action='tkid.event_persistence_recovered' and target_id='b7100000-0000-4000-8000-000000000020'),1,'actual recovery emits exactly one audit');
select ok((select metadata ?& array['source_id','event_id','journey_id','evidence_id','reservation_id','reason','recovery_version','prior_state','resulting_state'] and not metadata ?| array['payload','evidence_hash','browser_session_id'] from public.tracekit_audit_events where action='tkid.event_persistence_recovered' and target_id='b7100000-0000-4000-8000-000000000020'),'audit metadata is bounded and complete');

select pg_temp.make_recovery_fixture('b7100000-0000-4000-8000-000000000021');
update public.tkid_sources set ingestion_state='enabled' where id='b7100000-0000-4000-8000-000000000003';
select throws_ok($$select * from public.recover_interrupted_tkid_event_v1('b7100000-0000-4000-8000-000000000002','b7100000-0000-4000-8000-000000000003','b7100000-0000-4000-8000-000000000021','x','enabled','recover-interrupted-tkid-event')$$,'55000','source ingestion must be stopped','enabled source is rejected');
update public.tkid_sources set ingestion_state='stopped' where id='b7100000-0000-4000-8000-000000000003';

select pg_temp.make_recovery_fixture('b7100000-0000-4000-8000-000000000022'); delete from public.tkid_proof_event_claims where event_id='b7100000-0000-4000-8000-000000000022';
select throws_ok($$select * from public.recover_interrupted_tkid_event_v1('b7100000-0000-4000-8000-000000000002','b7100000-0000-4000-8000-000000000003','b7100000-0000-4000-8000-000000000022','x','missing-claim','recover-interrupted-tkid-event')$$,'55000','exactly one event reservation is required','missing reservation is rejected');
select throws_ok($$insert into public.tkid_proof_event_claims(organization_id,source_id,origin_id,journey_id,event_id,claimed_at) values('b7100000-0000-4000-8000-000000000002','b7100000-0000-4000-8000-000000000003','b7100000-0000-4000-8000-000000000004','b7100000-0000-4000-8000-000000000010','b7100000-0000-4000-8000-000000000020','2026-09-26')$$,'23505',null,'reservation uniqueness prevents multiple exact claims');

select pg_temp.make_recovery_fixture('b7100000-0000-4000-8000-000000000023'); delete from public.tkid_event_evidence where event_id='b7100000-0000-4000-8000-000000000023';
select throws_ok($$select * from public.recover_interrupted_tkid_event_v1('b7100000-0000-4000-8000-000000000002','b7100000-0000-4000-8000-000000000003','b7100000-0000-4000-8000-000000000023','x','missing-evidence','recover-interrupted-tkid-event')$$,'55000','exactly one event evidence row is required','missing evidence is rejected');
select pg_temp.make_recovery_fixture('b7100000-0000-4000-8000-000000000024','b7100000-0000-4000-8000-000000000099');
select throws_ok($$select * from public.recover_interrupted_tkid_event_v1('b7100000-0000-4000-8000-000000000002','b7100000-0000-4000-8000-000000000003','b7100000-0000-4000-8000-000000000024','x','claim-conflict','recover-interrupted-tkid-event')$$,'55000','event reservation journey scope mismatch','conflicting reservation scope is rejected');
select throws_ok($$select * from public.recover_interrupted_tkid_event_v1('b7100000-0000-4000-8000-000000000102','b7100000-0000-4000-8000-000000000003','b7100000-0000-4000-8000-000000000020','x','wrong-org','recover-interrupted-tkid-event')$$,'P0002','source unavailable','wrong organization is rejected');
select throws_ok($$select * from public.recover_interrupted_tkid_event_v1('b7100000-0000-4000-8000-000000000102','b7100000-0000-4000-8000-000000000103','b7100000-0000-4000-8000-000000000020','x','wrong-source','recover-interrupted-tkid-event')$$,'55000','exactly one event reservation is required','wrong source is rejected');

select pg_temp.make_recovery_fixture('b7100000-0000-4000-8000-000000000025','b7100000-0000-4000-8000-000000000099','b7100000-0000-4000-8000-000000000099');
select throws_ok($$select * from public.recover_interrupted_tkid_event_v1('b7100000-0000-4000-8000-000000000002','b7100000-0000-4000-8000-000000000003','b7100000-0000-4000-8000-000000000025','x','journey-mismatch','recover-interrupted-tkid-event')$$,'55000','event journey scope mismatch','missing or mismatched Journey is rejected');
select pg_temp.make_recovery_fixture(
  p_event => 'b7100000-0000-4000-8000-000000000026',
  p_payload_session => 'b7100000-0000-4000-8000-000000000099'
);
select throws_ok($$select * from public.recover_interrupted_tkid_event_v1('b7100000-0000-4000-8000-000000000002','b7100000-0000-4000-8000-000000000003','b7100000-0000-4000-8000-000000000026','x','session-mismatch','recover-interrupted-tkid-event')$$,'55000','event browser-session scope mismatch','browser-session mismatch is rejected');
select pg_temp.make_recovery_fixture(
  p_event => 'b7100000-0000-4000-8000-000000000027',
  p_claim_origin => 'b7100000-0000-4000-8000-000000000004',
  p_evidence_origin => 'b7100000-0000-4000-8000-000000000005'
);
select throws_ok($$select * from public.recover_interrupted_tkid_event_v1('b7100000-0000-4000-8000-000000000002','b7100000-0000-4000-8000-000000000003','b7100000-0000-4000-8000-000000000027','x','origin-mismatch','recover-interrupted-tkid-event')$$,'55000','event origin scope mismatch','origin mismatch is rejected');
select pg_temp.make_recovery_fixture(
  p_event => 'b7100000-0000-4000-8000-000000000028',
  p_bad_hash => true
);
select throws_ok($$select * from public.recover_interrupted_tkid_event_v1('b7100000-0000-4000-8000-000000000002','b7100000-0000-4000-8000-000000000003','b7100000-0000-4000-8000-000000000028','x','hash-mismatch','recover-interrupted-tkid-event')$$,'55000','event evidence hash mismatch','evidence hash mismatch is rejected');

select pg_temp.make_recovery_fixture('b7100000-0000-4000-8000-000000000029');
insert into public.tkid_events(id,organization_id,journey_id,browser_session_id,source_id,evidence_id,event_name,schema_version,normalizer_version,occurred_at,received_at,evidence_state,privacy_mode,origin_id,observed_origin)
select 'b7100000-0000-4000-8000-000000000029','b7100000-0000-4000-8000-000000000002','b7100000-0000-4000-8000-000000000010','b7100000-0000-4000-8000-000000000011','b7100000-0000-4000-8000-000000000003',id,'page_viewed',1,'tkid-normalizer-v1','2026-09-26 01:01','2026-09-26 01:01:01','observed','essential','b7100000-0000-4000-8000-000000000004','https://recovery.example' from public.tkid_event_evidence where event_id='b7100000-0000-4000-8000-000000000029';
select throws_ok($$select * from public.recover_interrupted_tkid_event_v1('b7100000-0000-4000-8000-000000000002','b7100000-0000-4000-8000-000000000003','b7100000-0000-4000-8000-000000000029','x','event-conflict','recover-interrupted-tkid-event')$$,'55000','existing event conflicts with durable recovery state','conflicting existing event fails closed');

select pg_temp.make_recovery_fixture(
  p_event => 'b7100000-0000-4000-8000-000000000030',
  p_claimed_at => '2026-09-26 01:02'
);
update public.tkid_sources set proof_ends_at='2026-09-26 02:00' where id='b7100000-0000-4000-8000-000000000003';
select is((select recovery_state from public.recover_interrupted_tkid_event_v1('b7100000-0000-4000-8000-000000000002','b7100000-0000-4000-8000-000000000003','b7100000-0000-4000-8000-000000000030','expired completion','expired-recovery','recover-interrupted-tkid-event')),'recovered','already-admitted event recovers after proof expiry');
select is((select count(*)::integer from public.tkid_proof_event_claims where source_id='b7100000-0000-4000-8000-000000000003'),10,'recoveries create no proof reservations');
select is((select count(*)::integer from public.tkid_journeys where source_id='b7100000-0000-4000-8000-000000000003'),1,'recovery creates no Journey');
select is((select count(*)::integer from public.tkid_browser_sessions where source_id='b7100000-0000-4000-8000-000000000003'),1,'recovery creates no browser session');
select is((select count(*)::integer from information_schema.role_routine_grants where routine_schema='public' and routine_name='recover_interrupted_tkid_event_v1' and grantee in('PUBLIC','anon','authenticated','authenticator')),0,'recovery RPC is not browser executable');
select is((select count(*)::integer from information_schema.role_routine_grants where routine_schema='public' and routine_name='recover_interrupted_tkid_event_v1' and grantee='service_role' and privilege_type='EXECUTE'),1,'service role can execute recovery RPC');

select * from finish();
rollback;
