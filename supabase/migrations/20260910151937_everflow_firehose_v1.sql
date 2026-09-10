-- Everflow Firehose v1: server-only receipt health, out-of-order update staging,
-- and atomic convergence with the existing poll-backed source tables.

alter table public.everflow_click_events
  add column if not exists transport text not null default 'poll',
  add column if not exists observed_transports text[] not null default array['poll']::text[],
  add column if not exists sub6 text,
  add column if not exists sub7 text,
  add column if not exists sub8 text,
  add column if not exists sub9 text,
  add column if not exists sub10 text,
  add column if not exists advertiser_id text,
  add column if not exists offer_url_id text,
  add column if not exists cost numeric,
  add column if not exists session_id text,
  add constraint everflow_click_events_transport_check check (transport in ('poll','firehose')) not valid;

alter table public.everflow_conversion_events
  add column if not exists transport text not null default 'poll',
  add column if not exists observed_transports text[] not null default array['poll']::text[],
  add column if not exists provider_updated_at timestamptz,
  add column if not exists provider_update_authoritative boolean not null default false,
  add column if not exists sub6 text,
  add column if not exists sub7 text,
  add column if not exists sub8 text,
  add column if not exists sub9 text,
  add column if not exists sub10 text,
  add column if not exists adv6 text,
  add column if not exists adv7 text,
  add column if not exists adv8 text,
  add column if not exists adv9 text,
  add column if not exists adv10 text,
  add column if not exists offer_url_id text,
  add column if not exists query_parameters jsonb not null default '{}'::jsonb,
  add constraint everflow_conversion_events_transport_check check (transport in ('poll','firehose')) not valid;

alter table public.everflow_click_events add constraint everflow_click_events_observed_transports_check
  check (observed_transports <@ array['poll','firehose']::text[] and cardinality(observed_transports)>0) not valid;
alter table public.everflow_conversion_events add constraint everflow_conversion_events_observed_transports_check
  check (observed_transports <@ array['poll','firehose']::text[] and cardinality(observed_transports)>0) not valid;

create or replace function public.everflow_conversion_events_preserve_firehose_version()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if old.provider_update_authoritative and new.transport='poll' then
    new.status:=old.status; new.payout:=old.payout; new.revenue:=old.revenue; new.sale_amount:=old.sale_amount;
    new.provider_updated_at:=old.provider_updated_at; new.transport:=old.transport;
    new.provider_update_authoritative:=true; new.payload_hash:=old.payload_hash; new.evidence_id:=old.evidence_id;
    new.observed_transports:=array(select distinct unnest(old.observed_transports || array['poll']::text[]));
  end if;
  return new;
end $$;

create trigger everflow_conversion_events_preserve_firehose_version_trigger
  before update on public.everflow_conversion_events for each row
  execute function public.everflow_conversion_events_preserve_firehose_version();

alter table public.everflow_conversion_events drop constraint if exists everflow_conversion_events_ingestion_method_check;
alter table public.everflow_conversion_events add constraint everflow_conversion_events_ingestion_method_check
  check (ingestion_method in ('historical_file','api','firehose')) not valid;
alter table public.everflow_conversion_events drop constraint if exists everflow_conversion_events_ingestion_shape_check;
alter table public.everflow_conversion_events add constraint everflow_conversion_events_ingestion_shape_check check (
  (ingestion_method='historical_file' and import_id is not null and source_row is not null and source_row>=2)
  or (ingestion_method='api' and import_id is null and source_row is null and provider_account_id is not null and sync_run_id is not null and payload_hash is not null)
  or (ingestion_method='firehose' and import_id is null and source_row is null and provider_account_id is not null and sync_run_id is null and payload_hash is not null)
) not valid;

create table public.everflow_firehose_pending_updates (
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  conversion_id text not null,
  network_id text not null,
  provider_updated_at timestamptz,
  ordering_authoritative boolean not null,
  payload jsonb not null,
  payload_hash text not null,
  received_at timestamptz not null,
  replay_count bigint not null default 0,
  primary key (connection_id, provider_account_id, conversion_id),
  foreign key (organization_id, connection_id, provider_account_id)
    references public.commerce_provider_accounts (organization_id, connection_id, id),
  check (octet_length(payload::text) <= 262144),
  check (payload_hash ~ '^[0-9a-f]{64}$')
);

create table public.everflow_firehose_health (
  scope_key text primary key,
  organization_id uuid,
  connection_id uuid,
  provider_account_id uuid,
  received bigint not null default 0,
  authenticated bigint not null default 0,
  rejected_auth bigint not null default 0,
  malformed_payload bigint not null default 0,
  unknown_network bigint not null default 0,
  queued bigint not null default 0,
  queue_failure bigint not null default 0,
  processed bigint not null default 0,
  replayed bigint not null default 0,
  persistence_failure bigint not null default 0,
  first_persisted bigint not null default 0,
  exact_replay bigint not null default 0,
  newer_update_applied bigint not null default 0,
  stale_update_ignored bigint not null default 0,
  pending_update_staged bigint not null default 0,
  pending_update_applied bigint not null default 0,
  last_received_at timestamptz,
  last_processed_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (organization_id, connection_id, provider_account_id)
    references public.commerce_provider_accounts (organization_id, connection_id, id)
);

alter table public.everflow_firehose_pending_updates enable row level security;
alter table public.everflow_firehose_health enable row level security;
revoke all on public.everflow_firehose_pending_updates, public.everflow_firehose_health from anon, authenticated;
grant select, insert, update, delete on public.everflow_firehose_pending_updates, public.everflow_firehose_health to service_role;

create or replace function public.record_everflow_firehose_metric_v1(
  p_metric text, p_organization_id uuid default null, p_connection_id uuid default null,
  p_provider_account_id uuid default null, p_observed_at timestamptz default now()
) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_key text := coalesce(p_connection_id::text || ':' || p_provider_account_id::text, 'global');
begin
  if p_metric not in ('received','authenticated','rejected_auth','malformed_payload','unknown_network','queued','queue_failure','processed','replayed','persistence_failure','first_persisted','exact_replay','newer_update_applied','stale_update_ignored','pending_update_staged','pending_update_applied') then
    raise exception 'unsupported firehose metric';
  end if;
  insert into public.everflow_firehose_health(scope_key,organization_id,connection_id,provider_account_id)
  values(v_key,p_organization_id,p_connection_id,p_provider_account_id) on conflict(scope_key) do nothing;
  execute format('update public.everflow_firehose_health set %I=%I+1, updated_at=$1%s where scope_key=$2',p_metric,p_metric,
    case when p_metric='received' then ', last_received_at=$1' when p_metric='processed' then ', last_processed_at=$1' else '' end)
    using p_observed_at,v_key;
end $$;

create or replace function public.everflow_firehose_timestamp(p_value jsonb, p_fallback timestamptz)
returns timestamptz language sql immutable set search_path=pg_catalog as $$
  select case
    when jsonb_typeof(p_value)='number' or (jsonb_typeof(p_value)='string' and trim(both '"' from p_value::text) ~ '^\d+(\.\d+)?$')
      then to_timestamp((trim(both '"' from p_value::text))::numeric)
    when jsonb_typeof(p_value)='string' then (trim(both '"' from p_value::text))::timestamptz
    else p_fallback end
$$;

create or replace function public.ingest_everflow_firehose_event_v1(
  p_organization_id uuid, p_account_id uuid, p_connection_id uuid, p_provider_account_id uuid,
  p_network_id text, p_event_type text, p_received_at timestamptz, p_payload jsonb
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_hash text := encode(extensions.digest(p_payload::text,'sha256'),'hex');
  v_conversion_id text := nullif(btrim(p_payload->>'conversion_id'),'');
  v_transaction_id text := nullif(btrim(p_payload->>'transaction_id'),'');
  v_conversion_at timestamptz;
  v_updated_at timestamptz;
  v_existing_updated_at timestamptz;
  v_existing_hash text;
  v_existing_status text;
  v_existing_revenue numeric;
  v_existing_payout numeric;
  v_existing_authoritative boolean := false;
  v_update_authoritative boolean := false;
  v_evidence_id uuid;
  v_transition text;
  v_previous_effective_revenue numeric := 0;
  v_previous_effective_payout numeric := 0;
  v_effective_revenue numeric := 0;
  v_effective_payout numeric := 0;
  v_pending record;
  v_replayed boolean := false;
begin
  if octet_length(p_payload::text)>262144 or p_event_type not in ('click','conversion','conversion_update') then raise exception 'invalid firehose envelope'; end if;
  if not exists(select 1 from public.commerce_provider_accounts pa join public.commerce_provider_connections pc on pc.organization_id=pa.organization_id and pc.id=pa.connection_id
    where pa.organization_id=p_organization_id and pa.connection_id=p_connection_id and pa.id=p_provider_account_id and pa.provider_account_external_id=p_network_id
      and pa.status='active' and pc.account_id=p_account_id and pc.provider='everflow' and pc.status='connected') then raise exception 'firehose scope mismatch'; end if;

  if p_event_type='click' then
    select payload_hash into v_existing_hash from public.everflow_click_events where organization_id=p_organization_id and connection_id=p_connection_id and provider_account_id=p_provider_account_id and transaction_id=v_transaction_id;
    insert into public.everflow_click_events(account_id,organization_id,connection_id,provider_account_id,transaction_id,click_at,
      source_id,sub1,sub2,sub3,sub4,sub5,sub6,sub7,sub8,sub9,sub10,affiliate_id,offer_id,advertiser_id,offer_url_id,
      referer,revenue,payout,cost,currency,is_test_mode,country,coupon_code,session_id,query_parameters,payload_hash,raw_payload,raw_payload_hash,ingestion_method,transport,last_seen_at,updated_at)
    values(p_account_id,p_organization_id,p_connection_id,p_provider_account_id,v_transaction_id,to_timestamp((p_payload->>'unix_timestamp')::numeric),
      nullif(p_payload->>'source_id',''),nullif(p_payload->>'sub1',''),nullif(p_payload->>'sub2',''),nullif(p_payload->>'sub3',''),nullif(p_payload->>'sub4',''),nullif(p_payload->>'sub5',''),
      nullif(p_payload->>'sub6',''),nullif(p_payload->>'sub7',''),nullif(p_payload->>'sub8',''),nullif(p_payload->>'sub9',''),nullif(p_payload->>'sub10',''),
      nullif(p_payload->>'network_affiliate_id',''),nullif(p_payload->>'network_offer_id',''),nullif(p_payload->>'network_advertiser_id',''),nullif(p_payload->>'network_offer_url_id',''),
      nullif(p_payload->>'referer',''),nullif(p_payload->>'revenue','')::numeric,nullif(p_payload->>'payout','')::numeric,nullif(p_payload->>'cost','')::numeric,upper(nullif(p_payload->>'currency_id','')),
      nullif(p_payload->>'is_test_mode','')::boolean,nullif(p_payload->>'country_code',''),nullif(p_payload->>'coupon_code',''),nullif(p_payload->>'session_id',''),coalesce(p_payload->'query_parameters','{}'),v_hash,p_payload,v_hash,'webhook','firehose',p_received_at,p_received_at)
    on conflict(organization_id,connection_id,provider_account_id,transaction_id) do update set
      last_seen_at=greatest(everflow_click_events.last_seen_at,excluded.last_seen_at), updated_at=greatest(everflow_click_events.updated_at,excluded.updated_at),
      transport=case when everflow_click_events.transport='poll' then 'poll' else excluded.transport end,
      observed_transports=array(select distinct unnest(everflow_click_events.observed_transports || array['firehose']::text[])),
      payload_hash=excluded.payload_hash, raw_payload=excluded.raw_payload, raw_payload_hash=excluded.raw_payload_hash;
    perform public.record_everflow_firehose_metric_v1(case when v_existing_hash is null then 'first_persisted' when v_existing_hash=v_hash then 'exact_replay' else 'newer_update_applied' end,p_organization_id,p_connection_id,p_provider_account_id,p_received_at);
  else
    v_conversion_at := public.everflow_firehose_timestamp(coalesce(p_payload->'conversion_timestamp',p_payload->'date'),p_received_at);
    v_updated_at := case when p_event_type='conversion_update' then public.everflow_firehose_timestamp(p_payload->'update_timestamp',p_received_at) else v_conversion_at end;
    v_update_authoritative := p_event_type='conversion_update' and p_payload ? 'update_timestamp' and p_payload->>'update_timestamp' ~ '^\d+(\.\d+)?$';
    select provider_updated_at,payload_hash,status,revenue,payout,provider_update_authoritative
      into v_existing_updated_at,v_existing_hash,v_existing_status,v_existing_revenue,v_existing_payout,v_existing_authoritative
      from public.everflow_conversion_events where organization_id=p_organization_id and connection_id=p_connection_id and provider_account_id=p_provider_account_id and source_identity=v_conversion_id for update;
    if p_event_type='conversion_update' and not found then
      insert into public.everflow_firehose_pending_updates(organization_id,connection_id,provider_account_id,conversion_id,network_id,provider_updated_at,ordering_authoritative,payload,payload_hash,received_at)
      values(p_organization_id,p_connection_id,p_provider_account_id,v_conversion_id,p_network_id,case when v_update_authoritative then v_updated_at end,v_update_authoritative,p_payload,v_hash,p_received_at)
      on conflict(connection_id,provider_account_id,conversion_id) do update set payload=excluded.payload,payload_hash=excluded.payload_hash,provider_updated_at=excluded.provider_updated_at,ordering_authoritative=excluded.ordering_authoritative,received_at=excluded.received_at,replay_count=everflow_firehose_pending_updates.replay_count+1
      where (excluded.ordering_authoritative and not everflow_firehose_pending_updates.ordering_authoritative)
         or (excluded.ordering_authoritative=everflow_firehose_pending_updates.ordering_authoritative and coalesce(excluded.provider_updated_at,excluded.received_at)>coalesce(everflow_firehose_pending_updates.provider_updated_at,everflow_firehose_pending_updates.received_at));
      perform public.record_everflow_firehose_metric_v1('pending_update_staged',p_organization_id,p_connection_id,p_provider_account_id,p_received_at);
      perform public.record_everflow_firehose_metric_v1('processed',p_organization_id,p_connection_id,p_provider_account_id,p_received_at);
      return jsonb_build_object('status','pending_original');
    end if;
    if v_existing_hash=v_hash then
      perform public.record_everflow_firehose_metric_v1('exact_replay',p_organization_id,p_connection_id,p_provider_account_id,p_received_at);
      return jsonb_build_object('status','exact_replay');
    end if;
    if p_event_type='conversion_update' and ((v_existing_authoritative and not v_update_authoritative) or (v_existing_authoritative and v_update_authoritative and v_updated_at<=v_existing_updated_at) or (not v_existing_authoritative and not v_update_authoritative and v_updated_at<=v_existing_updated_at)) then
      perform public.record_everflow_firehose_metric_v1('replayed',p_organization_id,p_connection_id,p_provider_account_id,p_received_at);
      perform public.record_everflow_firehose_metric_v1('stale_update_ignored',p_organization_id,p_connection_id,p_provider_account_id,p_received_at);
      return jsonb_build_object('status','stale_ignored');
    end if;
    insert into public.commerce_evidence_records(organization_id,connection_id,provider_account_id,sync_run_id,source_object_type,source_object_id,payload_hash,storage_backend,storage_reference,content_type,byte_size,source_created_at,source_updated_at,observed_at,normalizer_version,mapping_version,pii_classification,retention_policy,metadata)
    values(p_organization_id,p_connection_id,p_provider_account_id,null,'everflow_conversion',v_conversion_id,v_hash,'managed_evidence_store','managed://everflow/'||p_organization_id||'/'||p_connection_id||'/'||p_provider_account_id||'/'||v_conversion_id||'/'||v_hash,'application/json',octet_length(p_payload::text),v_conversion_at,case when v_update_authoritative then v_updated_at end,p_received_at,'everflow-firehose-v1','everflow-conversion-v1','sensitive','commerce-provider-raw-v1',jsonb_build_object('immutable',true,'provider','everflow','transport','firehose','ordering_authoritative',v_update_authoritative))
    on conflict(connection_id,provider_account_id,source_object_type,source_object_id,payload_hash) do nothing;
    select id into v_evidence_id from public.commerce_evidence_records where connection_id=p_connection_id and provider_account_id=p_provider_account_id and source_object_type='everflow_conversion' and source_object_id=v_conversion_id and payload_hash=v_hash;
    insert into public.commerce_managed_evidence_payloads(evidence_id,organization_id,payload) values(v_evidence_id,p_organization_id,p_payload) on conflict(evidence_id) do nothing;
    insert into public.everflow_conversion_events(account_id,organization_id,connection_id,provider_account_id,import_id,source_row,ingestion_method,transport,
      source_identity,conversion_id,transaction_id,conversion_at,click_at,affiliate_id,advertiser_id,offer_id,offer_url_id,source_id,
      sub1,sub2,sub3,sub4,sub5,sub6,sub7,sub8,sub9,sub10,adv1,adv2,adv3,adv4,adv5,adv6,adv7,adv8,adv9,adv10,
      event_name,status,payout,revenue,sale_amount,order_id,currency,query_parameters,payload_hash,evidence_id,last_seen_at,provider_updated_at,provider_update_authoritative)
    values(p_account_id,p_organization_id,p_connection_id,p_provider_account_id,null,null,'firehose','firehose',v_conversion_id,v_conversion_id,v_transaction_id,v_conversion_at,
      public.everflow_firehose_timestamp(p_payload->'click_date',null),nullif(p_payload->>'network_affiliate_id',''),nullif(p_payload->>'network_advertiser_id',''),nullif(p_payload->>'network_offer_id',''),nullif(p_payload->>'network_offer_url_id',''),nullif(p_payload->>'source_id',''),
      nullif(p_payload->>'sub1',''),nullif(p_payload->>'sub2',''),nullif(p_payload->>'sub3',''),nullif(p_payload->>'sub4',''),nullif(p_payload->>'sub5',''),nullif(p_payload->>'sub6',''),nullif(p_payload->>'sub7',''),nullif(p_payload->>'sub8',''),nullif(p_payload->>'sub9',''),nullif(p_payload->>'sub10',''),
      nullif(p_payload->>'adv1',''),nullif(p_payload->>'adv2',''),nullif(p_payload->>'adv3',''),nullif(p_payload->>'adv4',''),nullif(p_payload->>'adv5',''),nullif(p_payload->>'adv6',''),nullif(p_payload->>'adv7',''),nullif(p_payload->>'adv8',''),nullif(p_payload->>'adv9',''),nullif(p_payload->>'adv10',''),
      nullif(p_payload->>'event_name',''),nullif(p_payload->>'conversion_status',''),nullif(p_payload->>'payout','')::numeric,nullif(p_payload->>'revenue','')::numeric,nullif(p_payload->>'sale_amount','')::numeric,nullif(p_payload->>'order_id',''),upper(nullif(p_payload->>'currency_id','')),coalesce(p_payload->'query_parameters','{}'),v_hash,v_evidence_id,p_received_at,case when v_update_authoritative then v_updated_at else p_received_at end,v_update_authoritative)
    on conflict(connection_id,provider_account_id,source_identity) do update set
      last_seen_at=greatest(everflow_conversion_events.last_seen_at,excluded.last_seen_at),
      status=case when (excluded.provider_update_authoritative and not everflow_conversion_events.provider_update_authoritative) or (excluded.provider_update_authoritative=everflow_conversion_events.provider_update_authoritative and excluded.provider_updated_at>=coalesce(everflow_conversion_events.provider_updated_at,'-infinity')) then excluded.status else everflow_conversion_events.status end,
      payout=case when (excluded.provider_update_authoritative and not everflow_conversion_events.provider_update_authoritative) or (excluded.provider_update_authoritative=everflow_conversion_events.provider_update_authoritative and excluded.provider_updated_at>=coalesce(everflow_conversion_events.provider_updated_at,'-infinity')) then excluded.payout else everflow_conversion_events.payout end,
      revenue=case when (excluded.provider_update_authoritative and not everflow_conversion_events.provider_update_authoritative) or (excluded.provider_update_authoritative=everflow_conversion_events.provider_update_authoritative and excluded.provider_updated_at>=coalesce(everflow_conversion_events.provider_updated_at,'-infinity')) then excluded.revenue else everflow_conversion_events.revenue end,
      sale_amount=case when (excluded.provider_update_authoritative and not everflow_conversion_events.provider_update_authoritative) or (excluded.provider_update_authoritative=everflow_conversion_events.provider_update_authoritative and excluded.provider_updated_at>=coalesce(everflow_conversion_events.provider_updated_at,'-infinity')) then excluded.sale_amount else everflow_conversion_events.sale_amount end,
      payload_hash=case when (excluded.provider_update_authoritative and not everflow_conversion_events.provider_update_authoritative) or (excluded.provider_update_authoritative=everflow_conversion_events.provider_update_authoritative and excluded.provider_updated_at>=coalesce(everflow_conversion_events.provider_updated_at,'-infinity')) then excluded.payload_hash else everflow_conversion_events.payload_hash end,
      evidence_id=case when (excluded.provider_update_authoritative and not everflow_conversion_events.provider_update_authoritative) or (excluded.provider_update_authoritative=everflow_conversion_events.provider_update_authoritative and excluded.provider_updated_at>=coalesce(everflow_conversion_events.provider_updated_at,'-infinity')) then excluded.evidence_id else everflow_conversion_events.evidence_id end,
      transport=case when (excluded.provider_update_authoritative and not everflow_conversion_events.provider_update_authoritative) or (excluded.provider_update_authoritative=everflow_conversion_events.provider_update_authoritative and excluded.provider_updated_at>=coalesce(everflow_conversion_events.provider_updated_at,'-infinity')) then 'firehose' else everflow_conversion_events.transport end,
      observed_transports=array(select distinct unnest(everflow_conversion_events.observed_transports || array['firehose']::text[])),
      provider_updated_at=case when excluded.provider_update_authoritative and not everflow_conversion_events.provider_update_authoritative then excluded.provider_updated_at else greatest(everflow_conversion_events.provider_updated_at,excluded.provider_updated_at) end,
      provider_update_authoritative=everflow_conversion_events.provider_update_authoritative or excluded.provider_update_authoritative;
    v_previous_effective_revenue:=case when lower(coalesce(v_existing_status,''))='approved' then coalesce(v_existing_revenue,0) else 0 end;
    v_previous_effective_payout:=case when lower(coalesce(v_existing_status,''))='approved' then coalesce(v_existing_payout,0) else 0 end;
    v_effective_revenue:=case when lower(coalesce(p_payload->>'conversion_status',''))='approved' then coalesce(nullif(p_payload->>'revenue','')::numeric,0) else 0 end;
    v_effective_payout:=case when lower(coalesce(p_payload->>'conversion_status',''))='approved' then coalesce(nullif(p_payload->>'payout','')::numeric,0) else 0 end;
    v_transition:=case when v_existing_hash is null and lower(coalesce(p_payload->>'conversion_status',''))='approved' then 'approved' when v_existing_hash is null then 'observed'
      when lower(coalesce(v_existing_status,''))='approved' and lower(coalesce(p_payload->>'conversion_status',''))='rejected' then 'reversal'
      when lower(coalesce(v_existing_status,''))='rejected' and lower(coalesce(p_payload->>'conversion_status',''))='approved' then 'reinstated'
      else 'updated' end;
    insert into public.everflow_conversion_state_history(organization_id,connection_id,provider_account_id,sync_run_id,evidence_id,source_identity,conversion_id,transaction_id,conversion_at,is_event,event_name,previous_status,status,transition_type,payload_hash,previous_payload_hash,revenue,payout,effective_revenue,effective_payout,revenue_delta,payout_delta,first_seen_at,last_seen_at)
    values(p_organization_id,p_connection_id,p_provider_account_id,null,v_evidence_id,v_conversion_id,v_conversion_id,v_transaction_id,v_conversion_at,false,nullif(p_payload->>'event_name',''),v_existing_status,nullif(p_payload->>'conversion_status',''),v_transition,v_hash,v_existing_hash,nullif(p_payload->>'revenue','')::numeric,nullif(p_payload->>'payout','')::numeric,v_effective_revenue,v_effective_payout,v_effective_revenue-v_previous_effective_revenue,v_effective_payout-v_previous_effective_payout,p_received_at,p_received_at)
    on conflict(connection_id,provider_account_id,source_identity,payload_hash) do update set last_seen_at=greatest(everflow_conversion_state_history.last_seen_at,excluded.last_seen_at),observation_count=everflow_conversion_state_history.observation_count+1;
    perform public.record_everflow_firehose_metric_v1(case when v_existing_hash is null then 'first_persisted' else 'newer_update_applied' end,p_organization_id,p_connection_id,p_provider_account_id,p_received_at);
    if p_event_type='conversion' then
      select * into v_pending from public.everflow_firehose_pending_updates where connection_id=p_connection_id and provider_account_id=p_provider_account_id and conversion_id=v_conversion_id;
      if found and (v_pending.ordering_authoritative or not v_update_authoritative) then
        perform public.ingest_everflow_firehose_event_v1(p_organization_id,p_account_id,p_connection_id,p_provider_account_id,p_network_id,'conversion_update',v_pending.received_at,v_pending.payload);
        perform public.record_everflow_firehose_metric_v1('pending_update_applied',p_organization_id,p_connection_id,p_provider_account_id,p_received_at);
      end if;
      delete from public.everflow_firehose_pending_updates where connection_id=p_connection_id and provider_account_id=p_provider_account_id and conversion_id=v_conversion_id;
    end if;
  end if;
  perform public.record_everflow_firehose_metric_v1('processed',p_organization_id,p_connection_id,p_provider_account_id,p_received_at);
  return jsonb_build_object('status',case when v_replayed then 'replayed' else 'processed' end);
end $$;

revoke all on function public.record_everflow_firehose_metric_v1(text,uuid,uuid,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.ingest_everflow_firehose_event_v1(uuid,uuid,uuid,uuid,text,text,timestamptz,jsonb) from public,anon,authenticated;
revoke all on function public.everflow_firehose_timestamp(jsonb,timestamptz) from public,anon,authenticated;
revoke all on function public.everflow_conversion_events_preserve_firehose_version() from public,anon,authenticated;
grant execute on function public.record_everflow_firehose_metric_v1(text,uuid,uuid,uuid,timestamptz) to service_role;
grant execute on function public.ingest_everflow_firehose_event_v1(uuid,uuid,uuid,uuid,text,text,timestamptz,jsonb) to service_role;
grant execute on function public.everflow_firehose_timestamp(jsonb,timestamptz) to service_role;
grant execute on function public.everflow_conversion_events_preserve_firehose_version() to service_role;

alter table public.commerce_evidence_records alter column sync_run_id drop not null;
alter table public.everflow_conversion_state_history alter column sync_run_id drop not null;

create index if not exists commerce_provider_accounts_external_active_idx
  on public.commerce_provider_accounts(provider_account_external_id,connection_id,organization_id)
  where status='active';
