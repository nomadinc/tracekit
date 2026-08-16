begin;
select plan(12);

create temporary table acl_060_targets (
  table_name text primary key,
  expected_privileges text[] not null
) on commit drop;

insert into acl_060_targets(table_name, expected_privileges) values
  ('tracekit_business_contexts',array['DELETE','INSERT','SELECT','UPDATE']),
  ('commerce_provider_connections',array['DELETE','INSERT','SELECT','UPDATE']),
  ('commerce_provider_accounts',array['DELETE','INSERT','SELECT','UPDATE']),
  ('commerce_provider_credentials',array['DELETE','INSERT','SELECT','UPDATE']),
  ('commerce_sync_runs',array['DELETE','INSERT','SELECT','UPDATE']),
  ('commerce_sync_checkpoints',array['DELETE','INSERT','SELECT','UPDATE']),
  ('commerce_evidence_records',array['DELETE','INSERT','SELECT','UPDATE']),
  ('commerce_source_mappings',array['DELETE','INSERT','SELECT','UPDATE']),
  ('canonical_offers',array['DELETE','INSERT','SELECT','UPDATE']),
  ('offer_steps',array['DELETE','INSERT','SELECT','UPDATE']),
  ('offer_variants',array['DELETE','INSERT','SELECT','UPDATE']),
  ('commerce_provider_products',array['DELETE','INSERT','SELECT','UPDATE']),
  ('person_source_identities',array['DELETE','INSERT','SELECT','UPDATE']),
  ('commerce_repository_activation',array['DELETE','INSERT','SELECT','UPDATE']),
  ('commerce_product_mapping_decisions',array['INSERT','SELECT']),
  ('commerce_order_lines',array['DELETE','INSERT','SELECT','UPDATE']),
  ('commerce_historical_dispute_imports',array['DELETE','INSERT','SELECT','UPDATE']),
  ('commerce_historical_disputes',array['DELETE','INSERT','SELECT','UPDATE']),
  ('commerce_dispute_reconciliations',array['DELETE','INSERT','SELECT','UPDATE']),
  ('commerce_refund_events',array['DELETE','INSERT','SELECT','UPDATE']),
  ('everflow_historical_imports',array['DELETE','INSERT','SELECT','UPDATE']),
  ('everflow_import_evidence',array['DELETE','INSERT','SELECT','UPDATE']),
  ('everflow_conversion_events',array['DELETE','INSERT','SELECT','UPDATE']),
  ('everflow_order_reconciliations',array['DELETE','INSERT','SELECT','UPDATE']),
  ('tracekit_investigations',array['DELETE','INSERT','SELECT','UPDATE']),
  ('tracekit_investigation_cohorts',array['DELETE','INSERT','SELECT','UPDATE']),
  ('tracekit_investigation_findings',array['DELETE','INSERT','SELECT','UPDATE']),
  ('tracekit_investigation_journeys',array['DELETE','INSERT','SELECT','UPDATE']),
  ('everflow_acquisition_journeys',array['DELETE','INSERT','SELECT','UPDATE']),
  ('everflow_journey_order_links',array['DELETE','INSERT','SELECT','UPDATE']),
  ('tracekit_investigation_runs',array['DELETE','INSERT','SELECT','UPDATE']),
  ('tracekit_investigation_versions',array['DELETE','INSERT','SELECT','UPDATE']),
  ('commerce_continuous_sync_state',array['DELETE','INSERT','SELECT','UPDATE']),
  ('commerce_sync_schedules',array['DELETE','INSERT','SELECT','UPDATE']),
  ('tracekit_investigation_dependencies',array['DELETE','INSERT','SELECT','UPDATE']),
  ('tracekit_investigation_freshness',array['DELETE','INSERT','SELECT','UPDATE']),
  ('tracekit_investigation_candidates',array['DELETE','INSERT','SELECT','UPDATE']),
  ('tkid_sources',array['DELETE','INSERT','SELECT','UPDATE']),
  ('tkid_journeys',array['DELETE','INSERT','SELECT','UPDATE']),
  ('tkid_browser_sessions',array['DELETE','INSERT','SELECT','UPDATE']),
  ('tkid_checkout_sessions',array['DELETE','INSERT','SELECT','UPDATE']),
  ('tkid_event_evidence',array['DELETE','INSERT','SELECT','UPDATE']),
  ('tkid_events',array['DELETE','INSERT','SELECT','UPDATE']),
  ('tkid_commerce_links',array['DELETE','INSERT','SELECT','UPDATE']),
  ('tkid_handoffs',array['DELETE','INSERT','SELECT','UPDATE']),
  ('tracekit_production_controls',array['DELETE','INSERT','SELECT','UPDATE']),
  ('commerce_connection_pauses',array['DELETE','INSERT','SELECT','UPDATE']),
  ('tkid_handoff_keys',array['DELETE','INSERT','SELECT','UPDATE']),
  ('tracekit_operational_alerts',array['DELETE','INSERT','SELECT','UPDATE']),
  ('tkid_abuse_counters',array['DELETE','INSERT','SELECT','UPDATE']),
  ('tkid_erasure_runs',array['DELETE','INSERT','SELECT','UPDATE']),
  ('tkid_erasure_objects',array['DELETE','INSERT','SELECT','UPDATE']),
  ('tkid_source_origins',array['DELETE','INSERT','SELECT','UPDATE']),
  ('tkid_origin_verifications',array['DELETE','INSERT','SELECT','UPDATE']),
  ('tkid_relay_flows',array['DELETE','INSERT','SELECT','UPDATE']),
  ('tkid_relay_continuities',array['DELETE','INSERT','SELECT','UPDATE']),
  ('tkid_relay_events',array['DELETE','INSERT','SELECT','UPDATE']);

select is((select count(*)::integer from acl_060_targets),57,'all systemic ACL targets are inventoried');
select is((select count(*)::integer from acl_060_targets where expected_privileges=array['DELETE','INSERT','SELECT','UPDATE']),56,'56 tables retain CRUD');
select is((select count(*)::integer from acl_060_targets where expected_privileges=array['INSERT','SELECT']),1,'one table retains its narrower contract');
select is((select count(*)::integer from acl_060_targets t where to_regclass('public.'||t.table_name) is null),0,'every target exists');

select is((
  select count(*)::integer
  from acl_060_targets t
  join pg_class c on c.relnamespace='public'::regnamespace and c.relname=t.table_name
  where t.expected_privileges is distinct from (
    select array_agg(a.privilege_type order by a.privilege_type)
    from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    where a.grantee='service_role'::regrole
  )
),0,'every service-role ACL exactly matches its reviewed contract');

select is((select count(*)::integer from acl_060_targets t where has_table_privilege('service_role','public.'||t.table_name,'TRUNCATE')),0,'service_role cannot TRUNCATE targets');
select is((select count(*)::integer from acl_060_targets t where has_table_privilege('service_role','public.'||t.table_name,'REFERENCES')),0,'service_role cannot create REFERENCES on targets');
select is((select count(*)::integer from acl_060_targets t where has_table_privilege('service_role','public.'||t.table_name,'TRIGGER')),0,'service_role cannot create TRIGGERs on targets');
select is((select count(*)::integer from acl_060_targets t where has_table_privilege('service_role','public.'||t.table_name,'MAINTAIN')),0,'service_role cannot MAINTAIN targets');

select is((
  select count(*)::integer
  from acl_060_targets t
  join pg_class c on c.relnamespace='public'::regnamespace and c.relname=t.table_name
  cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
  where a.grantee in (0,'anon'::regrole,'authenticated'::regrole)
),0,'PUBLIC and browser roles have no target-table privileges');

select is((
  select count(*)::integer from acl_060_targets t
  join pg_class c on c.relnamespace='public'::regnamespace and c.relname=t.table_name
  where pg_get_userbyid(c.relowner)<>'postgres'
),0,'target ownership remains postgres');

select is((
  select count(*)::integer from acl_060_targets t
  join pg_class c on c.relnamespace='public'::regnamespace and c.relname=t.table_name
  where not c.relrowsecurity
),0,'target RLS remains enabled');

select * from finish();
rollback;
