create table public.everflow_metadata_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid,
  resource text not null,
  status text not null default 'running',
  request_id uuid not null,
  pages integer not null default 0,
  records_seen integer not null default 0,
  records_persisted integer not null default 0,
  error_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint everflow_metadata_sync_runs_connection_fk
    foreign key (organization_id, connection_id)
    references public.commerce_provider_connections (organization_id, id),
  constraint everflow_metadata_sync_runs_resource_check check (resource in ('affiliates','offers')),
  constraint everflow_metadata_sync_runs_status_check check (status in ('running','succeeded','failed')),
  constraint everflow_metadata_sync_runs_counts_check check (pages >= 0 and records_seen >= 0 and records_persisted >= 0),
  unique (request_id, resource)
);

create index everflow_metadata_sync_runs_scope_idx
  on public.everflow_metadata_sync_runs (organization_id, connection_id, resource, started_at desc);

alter table public.everflow_metadata_sync_runs enable row level security;
revoke all on table public.everflow_metadata_sync_runs from anon, authenticated;
grant select, insert, update on table public.everflow_metadata_sync_runs to service_role;

create or replace function public.update_everflow_scrubber_global_v1(
  p_organization_id uuid,
  p_connection_id uuid,
  p_global_pass_rate numeric default null,
  p_scrubbing_enabled boolean default null,
  p_updated_by uuid default null
)
returns public.everflow_scrubber_settings
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_before public.everflow_scrubber_settings%rowtype;
  v_after public.everflow_scrubber_settings%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  select * into strict v_before from public.everflow_scrubber_settings
  where organization_id=p_organization_id and connection_id=p_connection_id for update;
  if p_global_pass_rate is not null and (p_global_pass_rate < 0 or p_global_pass_rate > 1) then
    raise exception 'pass rate must be between zero and one' using errcode='22023';
  end if;
  update public.everflow_scrubber_settings
  set global_pass_rate=coalesce(p_global_pass_rate, global_pass_rate),
      scrubbing_enabled=coalesce(p_scrubbing_enabled, scrubbing_enabled),
      updated_by=coalesce(p_updated_by, updated_by), updated_at=v_now
  where organization_id=p_organization_id and connection_id=p_connection_id
  returning * into v_after;
  if v_after.global_pass_rate is distinct from v_before.global_pass_rate then
    update public.everflow_scrubber_periods set ended_at=v_now, updated_at=v_now
    where organization_id=p_organization_id and connection_id=p_connection_id
      and rule_source='global' and ended_at is null;
  end if;
  if v_after.scrubbing_enabled is distinct from v_before.scrubbing_enabled then
    update public.everflow_scrubber_periods set ended_at=v_now, updated_at=v_now
    where organization_id=p_organization_id and connection_id=p_connection_id and ended_at is null;
  end if;
  return v_after;
end;
$$;

create or replace function public.set_everflow_scrubber_offer_rule_v1(
  p_organization_id uuid,
  p_connection_id uuid,
  p_network_offer_id text,
  p_pass_rate numeric,
  p_created_by uuid default null,
  p_change_reason text default null
)
returns public.everflow_scrubber_offer_rules
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_existing public.everflow_scrubber_offer_rules%rowtype;
  v_created public.everflow_scrubber_offer_rules%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_pass_rate < 0 or p_pass_rate > 1 then raise exception 'pass rate must be between zero and one' using errcode='22023'; end if;
  perform 1 from public.everflow_scrubber_settings where organization_id=p_organization_id and connection_id=p_connection_id for update;
  if not found then raise exception 'scrubber settings unavailable' using errcode='55000'; end if;
  select * into v_existing from public.everflow_scrubber_offer_rules
    where organization_id=p_organization_id and connection_id=p_connection_id
      and network_offer_id=p_network_offer_id and ended_at is null for update;
  if found and v_existing.pass_rate = p_pass_rate then return v_existing; end if;
  if found then update public.everflow_scrubber_offer_rules set ended_at=v_now where id=v_existing.id; end if;
  insert into public.everflow_scrubber_offer_rules(
    organization_id, connection_id, network_offer_id, pass_rate, effective_at,
    created_by, change_reason
  ) values (
    p_organization_id, p_connection_id, p_network_offer_id, p_pass_rate, v_now,
    p_created_by, nullif(btrim(p_change_reason),'')
  ) returning * into v_created;
  update public.everflow_scrubber_periods set ended_at=v_now, updated_at=v_now
    where organization_id=p_organization_id and connection_id=p_connection_id
      and network_offer_id=p_network_offer_id and ended_at is null;
  return v_created;
end;
$$;

create or replace function public.set_everflow_scrubber_pair_rule_v1(
  p_organization_id uuid,
  p_connection_id uuid,
  p_network_offer_id text,
  p_network_affiliate_id text,
  p_pass_rate numeric,
  p_created_by uuid default null,
  p_change_reason text default null
)
returns public.everflow_scrubber_pair_rules
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_existing public.everflow_scrubber_pair_rules%rowtype;
  v_created public.everflow_scrubber_pair_rules%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_pass_rate < 0 or p_pass_rate > 1 then raise exception 'pass rate must be between zero and one' using errcode='22023'; end if;
  perform 1 from public.everflow_scrubber_settings where organization_id=p_organization_id and connection_id=p_connection_id for update;
  if not found then raise exception 'scrubber settings unavailable' using errcode='55000'; end if;
  select * into v_existing from public.everflow_scrubber_pair_rules
    where organization_id=p_organization_id and connection_id=p_connection_id
      and network_offer_id=p_network_offer_id and network_affiliate_id=p_network_affiliate_id
      and ended_at is null for update;
  if found and v_existing.pass_rate = p_pass_rate then return v_existing; end if;
  if found then update public.everflow_scrubber_pair_rules set ended_at=v_now where id=v_existing.id; end if;
  insert into public.everflow_scrubber_pair_rules(
    organization_id, connection_id, network_offer_id, network_affiliate_id,
    pass_rate, effective_at, created_by, change_reason
  ) values (
    p_organization_id, p_connection_id, p_network_offer_id, p_network_affiliate_id,
    p_pass_rate, v_now, p_created_by, nullif(btrim(p_change_reason),'')
  ) returning * into v_created;
  update public.everflow_scrubber_periods set ended_at=v_now, updated_at=v_now
    where organization_id=p_organization_id and connection_id=p_connection_id
      and network_offer_id=p_network_offer_id and network_affiliate_id=p_network_affiliate_id
      and ended_at is null;
  return v_created;
end;
$$;

revoke all on function public.update_everflow_scrubber_global_v1(uuid,uuid,numeric,boolean,uuid) from public, anon, authenticated;
revoke all on function public.set_everflow_scrubber_offer_rule_v1(uuid,uuid,text,numeric,uuid,text) from public, anon, authenticated;
revoke all on function public.set_everflow_scrubber_pair_rule_v1(uuid,uuid,text,text,numeric,uuid,text) from public, anon, authenticated;
grant execute on function public.update_everflow_scrubber_global_v1(uuid,uuid,numeric,boolean,uuid) to service_role;
grant execute on function public.set_everflow_scrubber_offer_rule_v1(uuid,uuid,text,numeric,uuid,text) to service_role;
grant execute on function public.set_everflow_scrubber_pair_rule_v1(uuid,uuid,text,text,numeric,uuid,text) to service_role;
