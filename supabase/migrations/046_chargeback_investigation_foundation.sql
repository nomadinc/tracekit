-- Provider-neutral Investigation foundation plus protected historical
-- Everflow evidence. No repository activation or customer-facing policy.

update storage.buckets set allowed_mime_types=array['application/json','application/octet-stream','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv']::text[]
where id='commerce-evidence';

create table public.everflow_historical_imports(
 id uuid primary key,account_id uuid not null,organization_id uuid not null,connection_id uuid not null,
 report_hash text not null,source_label text not null,period_start timestamptz,period_end timestamptz,
 row_count integer not null,rejected_count integer not null,schema_columns jsonb not null,
 normalizer_version text not null,imported_at timestamptz not null default now(),metadata jsonb not null default '{}',
 foreign key(organization_id,account_id) references public.tracekit_organizations(id,owning_account_id),
 foreign key(organization_id,connection_id) references public.commerce_provider_connections(organization_id,id),
 check(row_count>=0 and rejected_count>=0),check(public.financial_reconciliation_metadata_is_safe(metadata)),
 unique(organization_id,report_hash)
);
create unique index everflow_historical_imports_org_id_uidx on public.everflow_historical_imports(organization_id,id);

create table public.everflow_import_evidence(
 import_id uuid not null,organization_id uuid not null,evidence_id uuid not null,chunk_number integer not null,
 primary key(import_id,chunk_number),unique(evidence_id),
 foreign key(organization_id,import_id) references public.everflow_historical_imports(organization_id,id),
 foreign key(organization_id,evidence_id) references public.commerce_evidence_records(organization_id,id),check(chunk_number>=0)
);

create table public.everflow_conversion_events(
 id uuid primary key,account_id uuid not null,organization_id uuid not null,connection_id uuid not null,import_id uuid not null,
 source_row integer not null,source_identity text not null,conversion_id text not null,transaction_id text,email_normalized text,
 conversion_at timestamptz not null,click_at timestamptz,delta_hours numeric,affiliate_id text,affiliate_name text,
 sub1 text,sub2 text,sub3 text,sub4 text,sub5 text,offer_id text,offer_name text,event_name text,revenue numeric,sale_amount numeric,
 session_ip_hash text,conversion_ip_hash text,isp text,country text,region text,city text,device text,browser text,platform text,os_version text,user_agent text,
 campaign_id text,campaign_name text,creative_id text,creative text,source_id text,status text,attribution_method text,created_at timestamptz not null default now(),
 foreign key(organization_id,account_id) references public.tracekit_organizations(id,owning_account_id),
 foreign key(organization_id,connection_id) references public.commerce_provider_connections(organization_id,id),
 foreign key(organization_id,import_id) references public.everflow_historical_imports(organization_id,id),
 check(source_row>=2),unique(import_id,source_identity)
);
create unique index everflow_conversion_events_org_id_uidx on public.everflow_conversion_events(organization_id,id);
create index everflow_conversion_events_match_idx on public.everflow_conversion_events(organization_id,connection_id,email_normalized,conversion_at);
create index everflow_conversion_events_cohort_idx on public.everflow_conversion_events(organization_id,affiliate_name,sub1,conversion_at);

create table public.everflow_order_reconciliations(
 id uuid primary key,organization_id uuid not null,connection_id uuid not null,event_id uuid not null,algorithm_version text not null,
 confidence_band text not null,candidate_count integer not null,matched_canonical_order_id uuid,evidence_factors jsonb not null default '{}',reconciled_at timestamptz not null default now(),
 foreign key(organization_id,connection_id) references public.commerce_provider_connections(organization_id,id),
 foreign key(organization_id,event_id) references public.everflow_conversion_events(organization_id,id),
 foreign key(organization_id,matched_canonical_order_id) references public.platform_orders(organization_id,canonical_order_id),
 check(confidence_band in('high_confidence','medium_confidence','needs_review','unmatched')),check(candidate_count>=0),
 check(public.financial_reconciliation_metadata_is_safe(evidence_factors)),unique(event_id,algorithm_version)
);

create table public.tracekit_investigations(
 id uuid primary key,account_id uuid not null,organization_id uuid not null,connection_id uuid,
 title text not null,question text not null,status text not null default 'draft',trigger_type text not null,
 period_start timestamptz,period_end timestamptz,maturity_days integer,analysis_version text not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),metadata jsonb not null default '{}',
 foreign key(organization_id,account_id) references public.tracekit_organizations(id,owning_account_id),
 foreign key(organization_id,connection_id) references public.commerce_provider_connections(organization_id,id),
 check(status in('draft','analyzing','review_ready','closed')),check(maturity_days is null or maturity_days>=0),
 check(public.financial_reconciliation_metadata_is_safe(metadata))
);
create unique index tracekit_investigations_org_id_uidx on public.tracekit_investigations(organization_id,id);

create table public.tracekit_investigation_cohorts(
 id uuid primary key,organization_id uuid not null,investigation_id uuid not null,cohort_key text not null,label text not null,
 cohort_role text not null,definition jsonb not null,sample_size integer not null default 0,created_at timestamptz not null default now(),
 foreign key(organization_id,investigation_id) references public.tracekit_investigations(organization_id,id),
 check(cohort_role in('affected','control','context')),check(sample_size>=0),check(public.financial_reconciliation_metadata_is_safe(definition)),unique(investigation_id,cohort_key)
);
create unique index tracekit_investigation_cohorts_org_id_uidx on public.tracekit_investigation_cohorts(organization_id,id);

create table public.tracekit_investigation_findings(
 id uuid primary key,organization_id uuid not null,investigation_id uuid not null,cohort_id uuid,control_cohort_id uuid,
 finding_type text not null,title text not null,metric text,observed_value numeric,control_value numeric,delta numeric,
 sample_size integer,control_sample_size integer,quality text not null,evidence_references jsonb not null default '[]',
 narrative text not null,created_at timestamptz not null default now(),
 foreign key(organization_id,investigation_id) references public.tracekit_investigations(organization_id,id),
 foreign key(organization_id,cohort_id) references public.tracekit_investigation_cohorts(organization_id,id),
 foreign key(organization_id,control_cohort_id) references public.tracekit_investigation_cohorts(organization_id,id),
 check(finding_type in('observation','correlation','negative_finding','hypothesis')),check(quality in('high','medium','limited','unknown')),
 check(sample_size is null or sample_size>=0),check(control_sample_size is null or control_sample_size>=0),check(public.financial_reconciliation_metadata_is_safe(evidence_references))
);

create table public.tracekit_investigation_journeys(
 id uuid primary key,organization_id uuid not null,investigation_id uuid not null,canonical_order_id uuid,
 cohort_key text not null,journey_version text not null,steps jsonb not null,evidence_gaps jsonb not null default '[]',quality text not null,created_at timestamptz not null default now(),
 foreign key(organization_id,investigation_id) references public.tracekit_investigations(organization_id,id),
 foreign key(organization_id,canonical_order_id) references public.platform_orders(organization_id,canonical_order_id),
 check(quality in('high','medium','limited')),check(public.financial_reconciliation_metadata_is_safe(steps)),check(public.financial_reconciliation_metadata_is_safe(evidence_gaps)),
 unique(investigation_id,canonical_order_id,journey_version)
);

create or replace function public.reconcile_everflow_orders_v1(p_organization_id uuid,p_connection_id uuid)
returns table(high_confidence bigint,medium_confidence bigint,needs_review bigint,unmatched bigint)
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 insert into public.everflow_order_reconciliations(id,organization_id,connection_id,event_id,algorithm_version,confidence_band,candidate_count,matched_canonical_order_id,evidence_factors)
 select gen_random_uuid(),e.organization_id,e.connection_id,e.id,'everflow-commerce-v1',
  case when c.cnt=1 and c.distance_seconds<=300 and c.amount_exact then 'high_confidence'
       when c.cnt=1 and c.amount_exact then 'medium_confidence'
       when c.cnt>0 then 'needs_review' else 'unmatched' end,
  c.cnt,case when c.cnt=1 and c.amount_exact then c.order_id end,
  jsonb_build_object('contact_signal_exact',c.cnt>0,'time_distance_seconds',c.distance_seconds,'amount_exact',c.amount_exact,'transaction_identifier_exact',c.transaction_exact)
 from public.everflow_conversion_events e
 cross join lateral(
  select count(*)::integer cnt,min(o.canonical_order_id::text)::uuid order_id,
   coalesce(min(abs(extract(epoch from(o.order_ts-e.conversion_at))))::integer,999999999) distance_seconds,
   coalesce(bool_and(e.sale_amount is not null and o.gross_amount=e.sale_amount),false) amount_exact,
   coalesce(bool_and(e.transaction_id is not null and o.provider_order_id=e.transaction_id),false) transaction_exact
  from public.person_source_identities i join public.platform_orders o on o.organization_id=i.organization_id and o.connection_id=i.connection_id and o.person_id=i.person_id
  where i.organization_id=e.organization_id and i.connection_id=e.connection_id and i.source_type='email' and i.normalized_value=e.email_normalized
   and o.order_ts::date=e.conversion_at::date
   and e.sale_amount is not null and o.gross_amount=e.sale_amount
 )c where e.organization_id=p_organization_id and e.connection_id=p_connection_id
 on conflict(event_id,algorithm_version) do update set confidence_band=excluded.confidence_band,candidate_count=excluded.candidate_count,matched_canonical_order_id=excluded.matched_canonical_order_id,evidence_factors=excluded.evidence_factors,reconciled_at=now();
 update public.everflow_order_reconciliations r set confidence_band='medium_confidence',candidate_count=1,matched_canonical_order_id=s.order_id,
  evidence_factors=jsonb_build_object('transaction_group_propagation',true,'source_event_count',s.seed_count),reconciled_at=now()
 from(
  select e.id,min(seed.matched_canonical_order_id::text)::uuid order_id,count(*) seed_count
  from public.everflow_conversion_events e join public.everflow_conversion_events sibling on sibling.organization_id=e.organization_id and sibling.import_id=e.import_id and sibling.transaction_id=e.transaction_id
  join public.everflow_order_reconciliations seed on seed.event_id=sibling.id and seed.algorithm_version='everflow-commerce-v1' and seed.matched_canonical_order_id is not null
  where e.organization_id=p_organization_id and e.connection_id=p_connection_id and e.transaction_id is not null
  group by e.id having count(distinct seed.matched_canonical_order_id)=1
 )s where r.event_id=s.id and r.algorithm_version='everflow-commerce-v1' and r.matched_canonical_order_id is null;
 return query select count(*)filter(where confidence_band='high_confidence'),count(*)filter(where confidence_band='medium_confidence'),count(*)filter(where confidence_band='needs_review'),count(*)filter(where confidence_band='unmatched') from public.everflow_order_reconciliations where organization_id=p_organization_id and connection_id=p_connection_id and algorithm_version='everflow-commerce-v1';
end $$;

do $$declare t text;begin foreach t in array array['everflow_historical_imports','everflow_import_evidence','everflow_conversion_events','everflow_order_reconciliations','tracekit_investigations','tracekit_investigation_cohorts','tracekit_investigation_findings','tracekit_investigation_journeys'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);execute format('grant select,insert,update,delete on public.%I to service_role',t);end loop;end$$;
revoke all on function public.reconcile_everflow_orders_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reconcile_everflow_orders_v1(uuid,uuid) to service_role;
