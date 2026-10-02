-- TraceKit Core receiving boundary for TraceKit Edge Intelligence Contract v1.
-- Transport is intentionally out of scope. Edge remains the semantic authority.

create table if not exists public.edge_intelligence_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tenant_ref text not null,
  observation_id text not null,
  revision integer not null check (revision >= 1),
  previous_revision integer,
  schema_version text not null,
  semantics_version text not null,
  derivation_rule_version text not null,
  session_ref text not null,
  event_ref text,
  observed_at timestamptz not null,
  updated_at_source timestamptz not null,
  completed_at_source timestamptz,
  status text not null,
  payload jsonb not null,
  payload_hash text not null,
  received_at timestamptz not null default now(),
  constraint edge_intelligence_observation_identity_uq unique(organization_id,tenant_ref,observation_id,revision),
  constraint edge_intelligence_previous_revision_check check(previous_revision is null or previous_revision >= 1)
);

create table if not exists public.edge_intelligence_current (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tenant_ref text not null,
  observation_id text not null,
  observation_row_id uuid not null references public.edge_intelligence_observations(id) on delete restrict,
  revision integer not null,
  updated_at timestamptz not null default now(),
  primary key(organization_id,tenant_ref,observation_id)
);

create table if not exists public.edge_intelligence_journey_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  observation_row_id uuid not null references public.edge_intelligence_observations(id) on delete cascade,
  journey_id uuid,
  linkage_basis text not null check(linkage_basis in ('session_ref','event_ref','unresolved')),
  linkage_evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(organization_id,observation_row_id,journey_id,linkage_basis)
);

create index if not exists edge_intelligence_session_idx on public.edge_intelligence_observations(organization_id,session_ref,observed_at);
create index if not exists edge_intelligence_event_idx on public.edge_intelligence_observations(organization_id,event_ref) where event_ref is not null;

alter table public.edge_intelligence_observations enable row level security;
alter table public.edge_intelligence_current enable row level security;
alter table public.edge_intelligence_journey_links enable row level security;

create or replace function public.ingest_edge_intelligence_v1(
  p_organization_id uuid,
  p_payload jsonb
) returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_tenant text:=p_payload->>'tenantRef'; v_observation text:=p_payload->>'observationId';
  v_revision int; v_previous int; v_existing public.edge_intelligence_observations%rowtype;
  v_current public.edge_intelligence_current%rowtype; v_row public.edge_intelligence_observations%rowtype;
  v_hash text; v_outcome text;
begin
  if p_payload->>'schemaVersion' is distinct from '1.0' then raise exception 'unsupported edge intelligence schema version' using errcode='22023'; end if;
  if v_tenant !~ '^tenant_[A-Za-z0-9_-]{8,128}$' or v_observation !~ '^obs_[A-Za-z0-9_-]{8,128}$' or coalesce(p_payload->>'sessionRef','') !~ '^session_[A-Za-z0-9_-]{8,128}$' then raise exception 'invalid edge intelligence identity' using errcode='22023'; end if;
  v_revision:=(p_payload->>'revision')::int; v_previous:=nullif(p_payload->>'previousRevision','')::int;
  if v_revision<1 or (v_revision>1 and v_previous is distinct from v_revision-1) then raise exception 'invalid edge intelligence revision chain' using errcode='22023'; end if;
  if nullif(p_payload->>'semanticsVersion','') is null or nullif(p_payload->>'derivationRuleVersion','') is null then raise exception 'invalid edge intelligence semantics' using errcode='22023'; end if;
  if not (p_payload ?& array['observedAt','updatedAt','status','completedStages','pendingStages','intelligence','evidence','conflicts','explanations','errors']) then raise exception 'incomplete edge intelligence payload' using errcode='22023'; end if;
  if p_payload::text ~* '"(destination|redirect|redirectUrl|moneyPage|safePage|route|routingDecision|policyDecision|allow|block|challenge|offer|landingPage|campaignDestination|decisionDestination|rawIp|encryptedIp|ciphertext|vaultRef|protectedIpRef|networkObservationKey|networkDigest|r2Key|storageKey|cacheKey|queuePayload|rawProviderResponse|rawFingerprint|jobId|internalId|providerObservationId|sessionAssociationKey|freshnessEpoch|datasetPath|email|phone|customerName|fullName|postalAddress|paymentData)"[[:space:]]*:' then raise exception 'forbidden edge intelligence field' using errcode='22023'; end if;
  v_hash:=encode(digest(convert_to(p_payload::text,'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||v_tenant||':'||v_observation,0));
  select * into v_existing from public.edge_intelligence_observations where organization_id=p_organization_id and tenant_ref=v_tenant and observation_id=v_observation and revision=v_revision;
  if found then
    if v_existing.payload_hash<>v_hash then raise exception 'conflicting edge intelligence revision' using errcode='23505'; end if;
    return jsonb_build_object('outcome','duplicate','observationRowId',v_existing.id,'revision',v_revision,'currentRevision',(select revision from public.edge_intelligence_current where organization_id=p_organization_id and tenant_ref=v_tenant and observation_id=v_observation));
  end if;
  insert into public.edge_intelligence_observations(organization_id,tenant_ref,observation_id,revision,previous_revision,schema_version,semantics_version,derivation_rule_version,session_ref,event_ref,observed_at,updated_at_source,completed_at_source,status,payload,payload_hash)
  values(p_organization_id,v_tenant,v_observation,v_revision,v_previous,'1.0',p_payload->>'semanticsVersion',p_payload->>'derivationRuleVersion',p_payload->>'sessionRef',p_payload->>'eventRef',(p_payload->>'observedAt')::timestamptz,(p_payload->>'updatedAt')::timestamptz,nullif(p_payload->>'completedAt','')::timestamptz,p_payload->>'status',p_payload,v_hash) returning * into v_row;
  select * into v_current from public.edge_intelligence_current where organization_id=p_organization_id and tenant_ref=v_tenant and observation_id=v_observation for update;
  if not found or v_revision>v_current.revision then
    insert into public.edge_intelligence_current(organization_id,tenant_ref,observation_id,observation_row_id,revision,updated_at) values(p_organization_id,v_tenant,v_observation,v_row.id,v_revision,now())
    on conflict(organization_id,tenant_ref,observation_id) do update set observation_row_id=excluded.observation_row_id,revision=excluded.revision,updated_at=excluded.updated_at where excluded.revision>public.edge_intelligence_current.revision;
    v_outcome:='accepted';
  else v_outcome:='stale'; end if;
  insert into public.edge_intelligence_journey_links(organization_id,observation_row_id,journey_id,linkage_basis,linkage_evidence)
  values(p_organization_id,v_row.id,null,'unresolved',jsonb_build_object('sessionRef',p_payload->>'sessionRef','eventRef',p_payload->>'eventRef')) on conflict do nothing;
  return jsonb_build_object('outcome',v_outcome,'observationRowId',v_row.id,'revision',v_revision,'currentRevision',(select revision from public.edge_intelligence_current where organization_id=p_organization_id and tenant_ref=v_tenant and observation_id=v_observation));
end $$;

revoke all on function public.ingest_edge_intelligence_v1(uuid,jsonb) from public,anon,authenticated,authenticator;
grant execute on function public.ingest_edge_intelligence_v1(uuid,jsonb) to service_role;
