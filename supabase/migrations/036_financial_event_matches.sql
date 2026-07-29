-- Financial Reconciliation Center v1.
--
-- Adds append-only operator reconciliation decisions for immutable financial
-- ledger rows in public.conversions. The original financial event row remains
-- append-only; this table records one active decision at a time while preserving
-- all prior decisions for audit.

create extension if not exists pgcrypto;

create or replace function public.financial_reconciliation_metadata_is_safe(p_metadata jsonb)
returns boolean
language sql
immutable
as $$
  with recursive metadata_walk(value, key_name) as (
    select coalesce(p_metadata, '{}'::jsonb), null::text
    union all
    select child.value, child.key
    from metadata_walk current
    cross join lateral jsonb_each(current.value) child
    where jsonb_typeof(current.value) = 'object'
    union all
    select child.value, null::text
    from metadata_walk current
    cross join lateral jsonb_array_elements(current.value) child
    where jsonb_typeof(current.value) = 'array'
  )
  select not exists (
    select 1
    from metadata_walk
    where lower(coalesce(key_name, '')) = any(array[
      'raw',
      'payload',
      'raw_payload',
      'processor_payload',
      'processor_response',
      'request_payload',
      'response_payload',
      'access_token',
      'refresh_token',
      'api_key',
      'security_key',
      'password',
      'client_secret',
      'authorization',
      'auth_header',
      'cookie',
      'set_cookie',
      'email',
      'phone',
      'card',
      'card_number',
      'bank_account',
      'routing_number'
    ])
      or lower(coalesce(key_name, '')) like any(array[
        '%token%',
        '%secret%',
        '%password%',
        '%authorization%',
        '%credential%',
        '%cookie%',
        '%payload%',
        '%email%',
        '%phone%',
        '%card%',
        '%bank%'
      ])
      or (
        jsonb_typeof(value) = 'string'
        and (
          value #>> '{}' ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
          or value #>> '{}' ~* '\m(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+'
          or value #>> '{}' ~* 'https?://[^/\s:@]+:[^@\s]+@'
          or value #>> '{}' ~* '([?&](client_secret|access_token|refresh_token|password|api[_-]?key|security[_-]?key|token)=)'
        )
      )
  );
$$;

do $$
declare
  financial_event_id_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
    into financial_event_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'conversions'
    and a.attname = 'id'
    and not a.attisdropped;

  if financial_event_id_type is null then
    raise exception 'public.conversions.id is required before applying financial_event_matches';
  end if;

  execute format($ddl$
    create table if not exists public.financial_event_matches (
      id uuid primary key default gen_random_uuid(),
      workspace_id text not null,
      financial_event_id %s not null references public.conversions(id) on delete cascade,
      matched_platform_order_id text,
      matched_order_id text,
      decision_type text not null,
      resulting_state text not null,
      match_method text not null,
      confidence text not null,
      is_active boolean not null default true,
      idempotency_key text not null,
      request_fingerprint text not null,
      actor_id text,
      decided_at timestamptz not null default now(),
      reason text,
      prior_state text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      constraint financial_event_matches_decision_type_check check (
        decision_type in ('confirm_match', 'ignore', 'remove_match')
      ),
      constraint financial_event_matches_resulting_state_check check (
        resulting_state in ('manual', 'ignored', 'removed')
      ),
      constraint financial_event_matches_confidence_check check (
        confidence in ('exact', 'high', 'medium', 'conflict', 'none')
      ),
      constraint financial_event_matches_reason_check check (
        decision_type = 'confirm_match' or nullif(btrim(coalesce(reason, '')), '') is not null
      ),
      constraint financial_event_matches_reason_length_check check (
        reason is null or length(reason) <= 1000
      ),
      constraint financial_event_matches_idempotency_key_length_check check (
        length(idempotency_key) <= 200
      ),
      constraint financial_event_matches_confirm_target_check check (
        decision_type <> 'confirm_match'
        or nullif(btrim(coalesce(matched_platform_order_id, '')), '') is not null
        or nullif(btrim(coalesce(matched_order_id, '')), '') is not null
      ),
      constraint financial_event_matches_metadata_safe_check check (
        public.financial_reconciliation_metadata_is_safe(metadata)
      )
    )
  $ddl$, financial_event_id_type);
end $$;

alter table public.financial_event_matches
  add column if not exists request_fingerprint text;

update public.financial_event_matches fem
set request_fingerprint = encode(
  digest(
    concat_ws(
      '|',
      fem.workspace_id,
      fem.financial_event_id::text,
      fem.decision_type,
      coalesce(fem.matched_platform_order_id, ''),
      coalesce(fem.matched_order_id, ''),
      coalesce(fem.reason, ''),
      fem.match_method,
      fem.confidence
    ),
    'sha256'
  ),
  'hex'
)
where fem.request_fingerprint is null;

alter table public.financial_event_matches
  alter column request_fingerprint set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'financial_event_matches_reason_length_check'
      and conrelid = 'public.financial_event_matches'::regclass
  ) then
    alter table public.financial_event_matches
      add constraint financial_event_matches_reason_length_check
      check (reason is null or length(reason) <= 1000);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'financial_event_matches_idempotency_key_length_check'
      and conrelid = 'public.financial_event_matches'::regclass
  ) then
    alter table public.financial_event_matches
      add constraint financial_event_matches_idempotency_key_length_check
      check (length(idempotency_key) <= 200);
  end if;
end $$;

create unique index if not exists financial_event_matches_active_uidx
  on public.financial_event_matches (workspace_id, financial_event_id)
  where is_active;

create unique index if not exists financial_event_matches_idempotency_uidx
  on public.financial_event_matches (workspace_id, idempotency_key);

create index if not exists financial_event_matches_event_history_idx
  on public.financial_event_matches (workspace_id, financial_event_id, decided_at desc);

create index if not exists financial_event_matches_history_idx
  on public.financial_event_matches (workspace_id, decided_at desc);

create index if not exists financial_event_matches_platform_order_idx
  on public.financial_event_matches (workspace_id, matched_platform_order_id)
  where matched_platform_order_id is not null;

create index if not exists financial_event_matches_order_id_idx
  on public.financial_event_matches (workspace_id, matched_order_id)
  where matched_order_id is not null;

alter table public.financial_event_matches enable row level security;

revoke all on table public.financial_event_matches from public;
revoke all on table public.financial_event_matches from anon;
revoke all on table public.financial_event_matches from authenticated;
grant select on table public.financial_event_matches to service_role;

create or replace function public.financial_event_matches_immutable_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'financial_event_matches rows are immutable';
  end if;

  -- Append-only history permits only the active flag to move from true to false.
  -- Every decision/content field must remain byte-for-byte unchanged.
  if old.is_active = true
    and new.is_active = false
    and new.id is not distinct from old.id
    and new.workspace_id is not distinct from old.workspace_id
    and new.financial_event_id is not distinct from old.financial_event_id
    and new.matched_platform_order_id is not distinct from old.matched_platform_order_id
    and new.matched_order_id is not distinct from old.matched_order_id
    and new.decision_type is not distinct from old.decision_type
    and new.resulting_state is not distinct from old.resulting_state
    and new.match_method is not distinct from old.match_method
    and new.confidence is not distinct from old.confidence
    and new.idempotency_key is not distinct from old.idempotency_key
    and new.request_fingerprint is not distinct from old.request_fingerprint
    and new.actor_id is not distinct from old.actor_id
    and new.decided_at is not distinct from old.decided_at
    and new.reason is not distinct from old.reason
    and new.prior_state is not distinct from old.prior_state
    and new.metadata is not distinct from old.metadata
    and new.created_at is not distinct from old.created_at
  then
    return new;
  end if;

  raise exception 'financial_event_matches rows are immutable except is_active deactivation';
end;
$$;

drop trigger if exists financial_event_matches_immutable_guard_trigger
  on public.financial_event_matches;

create trigger financial_event_matches_immutable_guard_trigger
  before update or delete on public.financial_event_matches
  for each row execute function public.financial_event_matches_immutable_guard();

revoke all on function public.financial_event_matches_immutable_guard() from public;
revoke all on function public.financial_event_matches_immutable_guard() from anon;
revoke all on function public.financial_event_matches_immutable_guard() from authenticated;

create index if not exists conversions_financial_reconciliation_lookup_idx
  on public.conversions (
    workspace_id,
    occurred_at,
    ledger_type,
    platform,
    processor_account_id,
    order_id
  )
  where ledger_type in (
    'refund',
    'chargeback',
    'chargeback_fee',
    'chargeback_reversal',
    'chargeback_fee_reversal'
  );

create index if not exists conversions_financial_reconciliation_source_idx
  on public.conversions (workspace_id, platform, processor_account_id, source_event_id, ledger_type)
  where source_event_id is not null
    and ledger_type in (
      'refund',
      'chargeback',
      'chargeback_fee',
      'chargeback_reversal',
      'chargeback_fee_reversal'
    );

create or replace function public.apply_financial_event_match_decision(p_decision jsonb)
returns table (
  id uuid,
  workspace_id text,
  financial_event_id text,
  decision_type text,
  resulting_state text,
  matched_platform_order_id text,
  matched_order_id text,
  match_method text,
  confidence text,
  is_active boolean,
  idempotency_key text,
  prior_state text,
  reason text,
  decided_at timestamptz,
  created boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id text := coalesce(nullif(btrim(p_decision->>'workspace_id'), ''), 'default');
  v_financial_event_id public.conversions.id%type;
  v_financial_event_id_text text := nullif(btrim(p_decision->>'financial_event_id'), '');
  v_decision_type text := nullif(btrim(p_decision->>'decision_type'), '');
  v_idempotency_key text := nullif(btrim(p_decision->>'idempotency_key'), '');
  v_reason text := nullif(btrim(p_decision->>'reason'), '');
  v_actor_id text := nullif(btrim(p_decision->>'actor_id'), '');
  v_match_method text;
  v_confidence text;
  v_platform_order_id text := nullif(btrim(p_decision->>'matched_platform_order_id'), '');
  v_order_id text := nullif(btrim(p_decision->>'matched_order_id'), '');
  v_metadata jsonb := coalesce(p_decision->'metadata', '{}'::jsonb);
  v_event record;
  v_target_count integer := 0;
  v_target record;
  v_existing public.financial_event_matches%rowtype;
  v_prior public.financial_event_matches%rowtype;
  v_resulting_state text;
  v_inserted public.financial_event_matches%rowtype;
  v_request_fingerprint text;
begin
  if p_decision is null or jsonb_typeof(p_decision) <> 'object' then
    raise exception 'p_decision must be a JSON object';
  end if;

  if v_financial_event_id_text is null then
    raise exception 'financial_event_id is required';
  end if;
  if v_idempotency_key is null then
    raise exception 'idempotency_key is required';
  end if;
  if length(v_idempotency_key) > 200 then
    raise exception 'idempotency_key is too long';
  end if;
  if v_reason is not null and length(v_reason) > 1000 then
    raise exception 'reason is too long';
  end if;
  if v_reason is not null and v_reason ~ '[[:cntrl:]]' then
    raise exception 'reason contains unsupported control characters';
  end if;
  if v_decision_type not in ('confirm_match', 'ignore', 'remove_match') then
    raise exception 'Unsupported financial reconciliation decision_type: %', coalesce(v_decision_type, 'null');
  end if;
  if v_decision_type in ('ignore', 'remove_match') and v_reason is null then
    raise exception 'reason is required for %', v_decision_type;
  end if;
  if not public.financial_reconciliation_metadata_is_safe(v_metadata) then
    raise exception 'metadata contains unsafe keys';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('financial_event_match:' || v_workspace_id || ':' || v_idempotency_key, 0));

  v_financial_event_id := v_financial_event_id_text;

  select *
    into v_event
  from public.conversions c
  where c.workspace_id = v_workspace_id
    and c.id = v_financial_event_id
    and c.ledger_type in (
      'refund',
      'chargeback',
      'chargeback_fee',
      'chargeback_reversal',
      'chargeback_fee_reversal'
    )
  for update;

  if not found then
    raise exception 'financial event not found for workspace';
  end if;

  if v_decision_type = 'confirm_match' then
    if v_platform_order_id is null and v_order_id is null then
      raise exception 'matched_platform_order_id or matched_order_id is required for confirm_match';
    end if;

    select count(*) into v_target_count
    from public.platform_orders po
    where po.workspace_id = v_workspace_id
      and (v_platform_order_id is null or po.platform_order_id = v_platform_order_id)
      and (v_order_id is null or po.order_id = v_order_id);

    if v_target_count <> 1 then
      raise exception 'matched order target must resolve to exactly one same-workspace order';
    end if;

    select po.platform_order_id, po.order_id
      into v_target
    from public.platform_orders po
    where po.workspace_id = v_workspace_id
      and (v_platform_order_id is null or po.platform_order_id = v_platform_order_id)
      and (v_order_id is null or po.order_id = v_order_id)
    limit 1;

    v_platform_order_id := v_target.platform_order_id;
    v_order_id := v_target.order_id;
    v_resulting_state := 'manual';
    v_match_method := 'operator_confirmed';
    v_confidence := 'exact';
  elsif v_decision_type = 'ignore' then
    v_platform_order_id := null;
    v_order_id := null;
    v_resulting_state := 'ignored';
    v_match_method := 'operator_ignored';
    v_confidence := 'none';
  else
    v_platform_order_id := null;
    v_order_id := null;
    v_resulting_state := 'removed';
    v_match_method := 'operator_removed';
    v_confidence := 'none';
  end if;

  v_request_fingerprint := encode(
    digest(
      concat_ws(
        '|',
        v_workspace_id,
        v_financial_event_id::text,
        v_decision_type,
        coalesce(v_platform_order_id, ''),
        coalesce(v_order_id, ''),
        coalesce(v_reason, ''),
        v_match_method,
        v_confidence
      ),
      'sha256'
    ),
    'hex'
  );

  select *
    into v_existing
  from public.financial_event_matches fem
  where fem.workspace_id = v_workspace_id
    and fem.idempotency_key = v_idempotency_key
  limit 1;

  if found then
    if v_existing.request_fingerprint is distinct from v_request_fingerprint then
      raise exception 'idempotency_key_conflict';
    end if;

    return query
    select
      v_existing.id,
      v_existing.workspace_id,
      v_existing.financial_event_id::text,
      v_existing.decision_type,
      v_existing.resulting_state,
      v_existing.matched_platform_order_id,
      v_existing.matched_order_id,
      v_existing.match_method,
      v_existing.confidence,
      v_existing.is_active,
      v_existing.idempotency_key,
      v_existing.prior_state,
      v_existing.reason,
      v_existing.decided_at,
      false;
    return;
  end if;

  select *
    into v_prior
  from public.financial_event_matches fem
  where fem.workspace_id = v_workspace_id
    and fem.financial_event_id = v_financial_event_id
    and fem.is_active
  for update;

  update public.financial_event_matches fem
    set is_active = false
  where fem.workspace_id = v_workspace_id
    and fem.financial_event_id = v_financial_event_id
    and fem.is_active;

  insert into public.financial_event_matches (
    workspace_id,
    financial_event_id,
    matched_platform_order_id,
    matched_order_id,
    decision_type,
    resulting_state,
    match_method,
    confidence,
    is_active,
    idempotency_key,
    request_fingerprint,
    actor_id,
    reason,
    prior_state,
    metadata
  ) values (
    v_workspace_id,
    v_financial_event_id,
    v_platform_order_id,
    v_order_id,
    v_decision_type,
    v_resulting_state,
    v_match_method,
    v_confidence,
    true,
    v_idempotency_key,
    v_request_fingerprint,
    v_actor_id,
    v_reason,
    case
      when v_prior.id is null then null
      else v_prior.resulting_state
    end,
    v_metadata
  )
  returning * into v_inserted;

  return query
  select
    v_inserted.id,
    v_inserted.workspace_id,
    v_inserted.financial_event_id::text,
    v_inserted.decision_type,
    v_inserted.resulting_state,
    v_inserted.matched_platform_order_id,
    v_inserted.matched_order_id,
    v_inserted.match_method,
    v_inserted.confidence,
    v_inserted.is_active,
    v_inserted.idempotency_key,
    v_inserted.prior_state,
    v_inserted.reason,
    v_inserted.decided_at,
    true;
end;
$$;

revoke all on function public.apply_financial_event_match_decision(jsonb) from public;
revoke all on function public.apply_financial_event_match_decision(jsonb) from anon;
revoke all on function public.apply_financial_event_match_decision(jsonb) from authenticated;
grant execute on function public.apply_financial_event_match_decision(jsonb) to service_role;

comment on table public.financial_event_matches is
  'Append-only operator reconciliation decisions for immutable financial ledger events.';

comment on column public.financial_event_matches.financial_event_id is
  'References the immutable financial event row in public.conversions using the production conversions.id type.';

comment on column public.financial_event_matches.matched_platform_order_id is
  'Processor/platform order identifier used as the primary order target and safe operator display label.';

comment on column public.financial_event_matches.matched_order_id is
  'External commerce order identifier when available; retained for display and deterministic lookup support.';

comment on column public.financial_event_matches.is_active is
  'The only mutable field on reconciliation history rows; previous active decisions are deactivated when a newer immutable decision is appended.';

comment on column public.financial_event_matches.request_fingerprint is
  'SHA-256 fingerprint of the canonical decision payload used to reject reuse of an idempotency key for materially different requests.';

comment on column public.financial_event_matches.metadata is
  'Safe support references and conflict summaries only. Raw processor payloads, credentials, PII, cards, and bank data are prohibited.';
