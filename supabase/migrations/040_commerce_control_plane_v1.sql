-- TraceKit Commerce Control Plane v1.
--
-- Adds only the durable coordination and compatibility contracts needed by
-- authorized server services. It performs no provider requests, stores no
-- credentials or provider rows, and activates no repository.

alter table public.commerce_sync_runs
  add column lease_owner text,
  add column lease_expires_at timestamptz,
  add column heartbeat_at timestamptz,
  add column attempt integer not null default 0,
  add column resume_from_run_id uuid references public.commerce_sync_runs(id),
  add constraint commerce_sync_runs_lease_shape_check check (
    (lease_owner is null and lease_expires_at is null)
    or (lease_owner is not null and lease_expires_at is not null)
  ) not valid,
  add constraint commerce_sync_runs_attempt_check check (attempt >= 0) not valid;

create index commerce_sync_runs_recoverable_lease_idx
  on public.commerce_sync_runs (status, lease_expires_at)
  where status = 'running';

create or replace function public.rotate_commerce_provider_credential(
  p_organization_id uuid,
  p_connection_id uuid,
  p_previous_id uuid,
  p_credential_type text,
  p_key_id text,
  p_encryption_version integer,
  p_secret_iv bytea,
  p_secret_ciphertext bytea
)
returns setof public.commerce_provider_credentials
language plpgsql
security invoker
set search_path = public
as $$
declare v_updated integer;
begin
  update public.commerce_provider_credentials
  set revoked_at = now(), rotated_at = now(), updated_at = now()
  where id = p_previous_id and organization_id = p_organization_id
    and connection_id = p_connection_id and revoked_at is null;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    return;
  end if;

  return query
  insert into public.commerce_provider_credentials
    (organization_id, connection_id, credential_type, storage_backend,
     encryption_key_id, encryption_version, secret_iv, secret_ciphertext)
  values
    (p_organization_id, p_connection_id, p_credential_type, 'database_encrypted',
     p_key_id, p_encryption_version, p_secret_iv, p_secret_ciphertext)
  returning *;
end;
$$;

create or replace function public.claim_commerce_sync_run(
  p_run_id uuid,
  p_organization_id uuid,
  p_connection_id uuid,
  p_lease_owner text,
  p_lease_seconds integer default 60
)
returns setof public.commerce_sync_runs
language plpgsql
security invoker
set search_path = public
as $$
begin
  if nullif(btrim(p_lease_owner), '') is null or p_lease_seconds < 5 or p_lease_seconds > 900 then
    raise exception 'invalid commerce sync lease request' using errcode = '22023';
  end if;

  return query
  update public.commerce_sync_runs r
  set status = 'running',
      started_at = coalesce(r.started_at, now()),
      lease_owner = p_lease_owner,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      heartbeat_at = now(),
      attempt = r.attempt + 1,
      updated_at = now()
  where r.id = p_run_id
    and r.organization_id = p_organization_id
    and r.connection_id = p_connection_id
    and (
      r.status in ('queued', 'paused', 'failed')
      or (r.status = 'running' and r.lease_expires_at < now())
    )
    and r.cancelled_at is null
  returning r.*;
end;
$$;

create or replace function public.heartbeat_commerce_sync_run(
  p_run_id uuid,
  p_organization_id uuid,
  p_connection_id uuid,
  p_lease_owner text,
  p_lease_seconds integer default 60
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare v_updated integer;
begin
  if p_lease_seconds < 5 or p_lease_seconds > 900 then
    raise exception 'invalid commerce sync lease duration' using errcode = '22023';
  end if;
  update public.commerce_sync_runs
  set heartbeat_at = now(), lease_expires_at = now() + make_interval(secs => p_lease_seconds), updated_at = now()
  where id = p_run_id and organization_id = p_organization_id and connection_id = p_connection_id
    and status = 'running' and lease_owner = p_lease_owner
    and lease_expires_at >= now() and cancelled_at is null;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.transition_commerce_sync_run(
  p_run_id uuid,
  p_organization_id uuid,
  p_connection_id uuid,
  p_lease_owner text,
  p_transition text,
  p_error_code text default null,
  p_error_summary text default null
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare v_updated integer;
begin
  if p_transition not in ('completed', 'completed_with_warnings', 'failed', 'cancelled') then
    raise exception 'invalid commerce sync transition' using errcode = '22023';
  end if;

  update public.commerce_sync_runs
  set status = p_transition,
      completed_at = case when p_transition in ('completed', 'completed_with_warnings') then now() else completed_at end,
      cancelled_at = case when p_transition = 'cancelled' then now() else cancelled_at end,
      last_error_code = case when p_transition = 'failed' then p_error_code else last_error_code end,
      last_error_summary = case when p_transition = 'failed' then left(p_error_summary, 500) else last_error_summary end,
      lease_owner = null, lease_expires_at = null, updated_at = now()
  where id = p_run_id and organization_id = p_organization_id and connection_id = p_connection_id
    and status = 'running' and lease_owner = p_lease_owner;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.cancel_commerce_sync_run(
  p_run_id uuid,
  p_organization_id uuid,
  p_connection_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare v_updated integer;
begin
  update public.commerce_sync_runs
  set status = 'cancelled', cancelled_at = now(), lease_owner = null,
      lease_expires_at = null, updated_at = now()
  where id = p_run_id and organization_id = p_organization_id and connection_id = p_connection_id
    and status in ('queued', 'running', 'paused', 'failed');
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create unique index commerce_provider_products_scope_id_uidx
  on public.commerce_provider_products (organization_id, connection_id, provider_account_id, id);

create table public.commerce_product_mapping_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  provider_product_id uuid not null,
  previous_state text not null,
  resulting_state text not null,
  business_context_id text,
  canonical_offer_id uuid,
  offer_step_id uuid,
  offer_variant_id uuid,
  mapping_version text not null,
  decided_by_user_id uuid not null references public.tracekit_users(id),
  reason text not null,
  created_at timestamptz not null default now(),
  constraint commerce_product_mapping_decisions_product_fk
    foreign key (organization_id, connection_id, provider_account_id, provider_product_id)
    references public.commerce_provider_products (organization_id, connection_id, provider_account_id, id),
  constraint commerce_product_mapping_decisions_offer_fk
    foreign key (organization_id, business_context_id, canonical_offer_id)
    references public.canonical_offers (organization_id, business_context_id, id),
  constraint commerce_product_mapping_decisions_step_fk
    foreign key (organization_id, canonical_offer_id, offer_step_id)
    references public.offer_steps (organization_id, canonical_offer_id, id),
  constraint commerce_product_mapping_decisions_variant_fk
    foreign key (organization_id, offer_step_id, offer_variant_id)
    references public.offer_variants (organization_id, offer_step_id, id),
  constraint commerce_product_mapping_decisions_state_check check (
    previous_state in ('observed', 'proposed', 'review_required', 'approved', 'rejected', 'retired')
    and resulting_state in ('proposed', 'review_required', 'approved', 'rejected', 'retired')
  ),
  constraint commerce_product_mapping_decisions_reason_check check (length(btrim(reason)) between 1 and 1000),
  constraint commerce_product_mapping_decisions_approved_check check (
    resulting_state <> 'approved'
    or (business_context_id is not null and canonical_offer_id is not null and offer_step_id is not null)
  )
);

create index commerce_product_mapping_decisions_product_time_idx
  on public.commerce_product_mapping_decisions (provider_product_id, created_at desc);

create or replace function public.commerce_product_mapping_decision_immutable_guard()
returns trigger language plpgsql as $$
begin
  raise exception 'commerce product mapping decisions are append-only' using errcode = '55000';
end;
$$;
create trigger commerce_product_mapping_decision_immutable_guard_trigger
before update or delete on public.commerce_product_mapping_decisions
for each row execute function public.commerce_product_mapping_decision_immutable_guard();

create or replace function public.decide_commerce_product_mapping(
  p_organization_id uuid,
  p_connection_id uuid,
  p_provider_account_id uuid,
  p_provider_product_id uuid,
  p_resulting_state text,
  p_business_context_id text,
  p_canonical_offer_id uuid,
  p_offer_step_id uuid,
  p_offer_variant_id uuid,
  p_mapping_version text,
  p_decided_by_user_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare v_previous_state text;
begin
  if p_resulting_state not in ('approved', 'rejected') then
    raise exception 'invalid product mapping decision' using errcode = '22023';
  end if;

  select mapping_status into v_previous_state
  from public.commerce_provider_products
  where id = p_provider_product_id and organization_id = p_organization_id
    and connection_id = p_connection_id and provider_account_id = p_provider_account_id
  for update;
  if not found then return false; end if;

  insert into public.commerce_product_mapping_decisions
    (organization_id, connection_id, provider_account_id, provider_product_id,
     previous_state, resulting_state, business_context_id, canonical_offer_id,
     offer_step_id, offer_variant_id, mapping_version, decided_by_user_id, reason)
  values
    (p_organization_id, p_connection_id, p_provider_account_id, p_provider_product_id,
     v_previous_state, p_resulting_state, p_business_context_id, p_canonical_offer_id,
     p_offer_step_id, p_offer_variant_id, p_mapping_version, p_decided_by_user_id, p_reason);

  update public.commerce_provider_products
  set mapping_status = p_resulting_state,
      business_context_id = case when p_resulting_state = 'approved' then p_business_context_id else null end,
      canonical_offer_id = case when p_resulting_state = 'approved' then p_canonical_offer_id else null end,
      offer_step_id = case when p_resulting_state = 'approved' then p_offer_step_id else null end,
      offer_variant_id = case when p_resulting_state = 'approved' then p_offer_variant_id else null end,
      mapping_version = p_mapping_version,
      reviewed_by_user_id = p_decided_by_user_id,
      reviewed_at = now(), updated_at = now()
  where id = p_provider_product_id and organization_id = p_organization_id;
  return true;
end;
$$;

alter table public.platform_orders
  add column provider_order_id text,
  add constraint platform_orders_provider_order_identity_check check (
    provider_order_id is null
    or (organization_id is not null and connection_id is not null and provider_account_id is not null)
  ) not valid;

create unique index platform_orders_provider_source_uidx
  on public.platform_orders (connection_id, provider_account_id, provider_order_id)
  where connection_id is not null and provider_account_id is not null and provider_order_id is not null;

alter table public.commerce_repository_activation
  add column readiness_evidence jsonb not null default '{}'::jsonb,
  add column readiness_verified_at timestamptz,
  add column readiness_verified_by_user_id uuid references public.tracekit_users(id) on delete set null,
  add constraint commerce_repository_activation_readiness_safe_check
    check (public.financial_reconciliation_metadata_is_safe(readiness_evidence)) not valid,
  add constraint commerce_repository_activation_live_readiness_check check (
    mode not in ('live_beta', 'live')
    or (readiness_verified_at is not null and readiness_verified_by_user_id is not null
      and jsonb_typeof(readiness_evidence) = 'object' and readiness_evidence <> '{}'::jsonb)
  ) not valid;

-- Bootstrap only the already-approved Bullseye compatibility ID when its
-- persistent Organization exists. This does not create Accounts/Organizations.
insert into public.tracekit_business_contexts
  (id, account_id, organization_id, name, status, fulfillment_type, metadata)
select 'offer-bullseye', o.owning_account_id, o.id, 'Bullseye', 'active', 'unknown',
       '{"source":"persistent_identity_compatibility"}'::jsonb
from public.tracekit_organizations o
where o.id = '70000000-0000-0000-0000-000000000002'::uuid
  and o.owning_account_id = '70000000-0000-0000-0000-000000000001'::uuid
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from public.tracekit_business_context_access a
    left join public.tracekit_business_contexts c
      on c.organization_id = a.organization_id and c.id = a.business_context_id
    where c.id is null
  ) then
    alter table public.tracekit_business_context_access
      validate constraint tracekit_business_context_access_context_fk;
  end if;
end $$;

alter table public.commerce_product_mapping_decisions enable row level security;
revoke all on table public.commerce_product_mapping_decisions from anon, authenticated;
grant select, insert on table public.commerce_product_mapping_decisions to service_role;

revoke all on function public.claim_commerce_sync_run(uuid, uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.heartbeat_commerce_sync_run(uuid, uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.transition_commerce_sync_run(uuid, uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.cancel_commerce_sync_run(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.rotate_commerce_provider_credential(uuid, uuid, uuid, text, text, integer, bytea, bytea) from public, anon, authenticated;
revoke all on function public.decide_commerce_product_mapping(uuid, uuid, uuid, uuid, text, text, uuid, uuid, uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_commerce_sync_run(uuid, uuid, uuid, text, integer) to service_role;
grant execute on function public.heartbeat_commerce_sync_run(uuid, uuid, uuid, text, integer) to service_role;
grant execute on function public.transition_commerce_sync_run(uuid, uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.cancel_commerce_sync_run(uuid, uuid, uuid) to service_role;
grant execute on function public.rotate_commerce_provider_credential(uuid, uuid, uuid, text, text, integer, bytea, bytea) to service_role;
grant execute on function public.decide_commerce_product_mapping(uuid, uuid, uuid, uuid, text, text, uuid, uuid, uuid, text, uuid, text) to service_role;

comment on column public.platform_orders.provider_order_id is
  'Provider Order/Transaction ID scoped by Connection and Provider Account. Legacy platform_order_id uniqueness remains unchanged.';
comment on table public.commerce_product_mapping_decisions is
  'Append-only provider Product mapping decision history; current Product fields are the latest projection.';
