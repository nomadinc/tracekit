-- Generic operator repair for the single durable partial state produced when
-- an admitted TKID event has a reservation and immutable evidence but no
-- tkid_events row. This is not an ingestion path and creates no prerequisite
-- state.

create or replace function public.tkid_canonical_json_v1(p_value jsonb)
returns text
language plpgsql
immutable
strict
security invoker
set search_path = public, pg_temp
as $$
declare
  v_kind text := jsonb_typeof(p_value);
  v_result text;
begin
  if v_kind = 'object' then
    select '{' || coalesce(string_agg(to_jsonb(entry.key)::text || ':' || public.tkid_canonical_json_v1(entry.value), ',' order by entry.key), '') || '}'
      into v_result
      from jsonb_each(p_value) entry;
    return v_result;
  elsif v_kind = 'array' then
    select '[' || coalesce(string_agg(public.tkid_canonical_json_v1(item.value), ',' order by item.ordinality), '') || ']'
      into v_result
      from jsonb_array_elements(p_value) with ordinality item(value, ordinality);
    return v_result;
  end if;
  return p_value::text;
end;
$$;

create or replace function public.recover_interrupted_tkid_event_v1(
  p_organization_id uuid,
  p_source_id uuid,
  p_event_id uuid,
  p_reason text,
  p_correlation_id text,
  p_confirmation text,
  p_actor_user_id uuid default null
)
returns table(
  event_id uuid,
  recovery_state text,
  changed boolean,
  evidence_id uuid,
  reservation_id uuid,
  journey_id uuid,
  audit_event_id uuid
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_source public.tkid_sources%rowtype;
  v_claim public.tkid_proof_event_claims%rowtype;
  v_evidence public.tkid_event_evidence%rowtype;
  v_journey public.tkid_journeys%rowtype;
  v_session public.tkid_browser_sessions%rowtype;
  v_origin public.tkid_source_origins%rowtype;
  v_checkout public.tkid_checkout_sessions%rowtype;
  v_existing public.tkid_events%rowtype;
  v_payload jsonb;
  v_computed_hash text;
  v_audit_id uuid;
  v_existing_audit_id uuid;
  v_claim_count integer;
  v_evidence_count integer;
  v_payload_event_id uuid;
  v_payload_journey_id uuid;
  v_payload_session_id uuid;
  v_payload_checkout_id uuid;
  v_occurred_at timestamptz;
  v_received_at timestamptz;
begin
  if p_organization_id is null or p_source_id is null or p_event_id is null
     or nullif(btrim(p_reason), '') is null
     or length(btrim(p_reason)) > 240
     or nullif(btrim(p_correlation_id), '') is null
     or length(btrim(p_correlation_id)) > 160
     or p_confirmation <> 'recover-interrupted-tkid-event' then
    raise exception 'explicit interrupted-event recovery confirmation required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'tkid-event-recovery:' || p_organization_id::text || ':' || p_source_id::text || ':' || p_event_id::text,
    0
  ));

  select source.* into v_source
    from public.tkid_sources source
    where source.organization_id = p_organization_id and source.id = p_source_id
    for update;
  if not found then
    raise exception 'source unavailable' using errcode = 'P0002';
  end if;
  if v_source.ingestion_state <> 'stopped' then
    raise exception 'source ingestion must be stopped' using errcode = '55000';
  end if;

  select count(*) into v_claim_count
    from public.tkid_proof_event_claims claim
    where claim.organization_id = p_organization_id
      and claim.source_id = p_source_id
      and claim.event_id = p_event_id;
  if v_claim_count <> 1 then
    raise exception 'exactly one event reservation is required' using errcode = '55000';
  end if;
  select claim.* into strict v_claim
    from public.tkid_proof_event_claims claim
    where claim.organization_id = p_organization_id
      and claim.source_id = p_source_id
      and claim.event_id = p_event_id
    for update;
  if v_source.proof_starts_at is null or v_source.proof_ends_at is null
     or v_source.proof_ends_at <= v_source.proof_starts_at
     or v_claim.claimed_at < v_source.proof_starts_at
     or v_claim.claimed_at >= v_source.proof_ends_at then
    raise exception 'event reservation was not admitted inside the authorized proof window' using errcode = '55000';
  end if;

  select count(*) into v_evidence_count
    from public.tkid_event_evidence evidence
    where evidence.organization_id = p_organization_id
      and evidence.event_id = p_event_id;
  if v_evidence_count <> 1 then
    raise exception 'exactly one event evidence row is required' using errcode = '55000';
  end if;
  select evidence.* into strict v_evidence
    from public.tkid_event_evidence evidence
    where evidence.organization_id = p_organization_id
      and evidence.event_id = p_event_id
    for update;
  if v_evidence.source_id <> p_source_id or v_evidence.erased_at is not null
     or v_evidence.origin_id is null or v_evidence.observed_origin is null
     or v_evidence.schema_version <> 1 or jsonb_typeof(v_evidence.bounded_payload) <> 'object' then
    raise exception 'event evidence scope is inconsistent' using errcode = '55000';
  end if;

  v_payload := v_evidence.bounded_payload;
  begin
    v_payload_event_id := (v_payload ->> 'event_id')::uuid;
    v_payload_journey_id := (v_payload ->> 'journey_id')::uuid;
    v_payload_session_id := (v_payload ->> 'browser_session_id')::uuid;
    v_payload_checkout_id := nullif(v_payload ->> 'checkout_session_id', '')::uuid;
    v_occurred_at := (v_payload ->> 'occurred_at')::timestamptz;
    v_received_at := (v_payload ->> 'received_at')::timestamptz;
  exception when others then
    raise exception 'event evidence payload is incomplete' using errcode = '55000';
  end;
  if v_payload_event_id is distinct from p_event_id
     or v_payload_journey_id is null or v_payload_session_id is null
     or nullif(v_payload ->> 'event_name', '') is null
     or (v_payload ->> 'schema_version')::integer <> 1
     or (v_payload ->> 'privacy_mode') not in ('essential', 'analytics_allowed')
     or (v_payload ->> 'normalizer_version') <> 'tkid-normalizer-v1'
     or v_received_at is distinct from v_evidence.received_at then
    raise exception 'event evidence payload does not match its durable identity' using errcode = '55000';
  end if;

  v_computed_hash := encode(extensions.digest(
    public.tkid_canonical_json_v1(v_payload - 'received_at' - 'normalizer_version'),
    'sha256'
  ), 'hex');
  if v_computed_hash is distinct from v_evidence.evidence_hash then
    raise exception 'event evidence hash mismatch' using errcode = '55000';
  end if;

  if v_claim.journey_id <> v_payload_journey_id then
    raise exception 'event reservation journey scope mismatch' using errcode = '55000';
  end if;
  select journey.* into v_journey
    from public.tkid_journeys journey
    where journey.organization_id = p_organization_id
      and journey.id = v_payload_journey_id
      and journey.source_id = p_source_id
    for update;
  if not found or v_journey.state = 'erased' or v_journey.completeness = 'erased' then
    raise exception 'event journey scope mismatch' using errcode = '55000';
  end if;
  select session.* into v_session
    from public.tkid_browser_sessions session
    where session.organization_id = p_organization_id
      and session.id = v_payload_session_id
      and session.journey_id = v_payload_journey_id
      and session.source_id = p_source_id
    for update;
  if not found then
    raise exception 'event browser-session scope mismatch' using errcode = '55000';
  end if;
  select origin.* into v_origin
    from public.tkid_source_origins origin
    where origin.organization_id = p_organization_id
      and origin.id = v_claim.origin_id
      and origin.id = v_evidence.origin_id
      and origin.source_id = p_source_id
    for update;
  if not found or v_origin.canonical_origin is distinct from v_evidence.observed_origin then
    raise exception 'event origin scope mismatch' using errcode = '55000';
  end if;
  if v_payload_checkout_id is not null then
    select checkout.* into v_checkout
      from public.tkid_checkout_sessions checkout
      where checkout.organization_id = p_organization_id
        and checkout.id = v_payload_checkout_id
        and checkout.journey_id = v_payload_journey_id
        and checkout.browser_session_id = v_payload_session_id
        and checkout.source_id = p_source_id;
    if not found then
      raise exception 'event checkout-session scope mismatch' using errcode = '55000';
    end if;
  end if;

  select existing.* into v_existing
    from public.tkid_events existing
    where existing.id = p_event_id
    for update;
  if found then
    if v_existing.organization_id is distinct from p_organization_id
       or v_existing.source_id is distinct from p_source_id
       or v_existing.origin_id is distinct from v_evidence.origin_id
       or v_existing.journey_id is distinct from v_payload_journey_id
       or v_existing.browser_session_id is distinct from v_payload_session_id
       or v_existing.checkout_session_id is distinct from v_payload_checkout_id
       or v_existing.evidence_id is distinct from v_evidence.id
       or v_existing.event_name is distinct from (v_payload ->> 'event_name')
       or v_existing.schema_version is distinct from (v_payload ->> 'schema_version')::integer
       or v_existing.normalizer_version is distinct from (v_payload ->> 'normalizer_version')
       or v_existing.occurred_at is distinct from v_occurred_at
       or v_existing.received_at is distinct from v_received_at
       or v_existing.funnel_step_id is distinct from (v_payload ->> 'funnel_step_id')
       or v_existing.offer_id is distinct from (v_payload ->> 'offer_id')
       or v_existing.offer_version_id is distinct from (v_payload ->> 'offer_version_id')
       or v_existing.cta_id is distinct from (v_payload ->> 'cta_id')
       or v_existing.cta_version is distinct from (v_payload ->> 'cta_version')
       or v_existing.price_amount is distinct from nullif(v_payload #>> '{price,amount}', '')::numeric
       or v_existing.currency is distinct from (v_payload #>> '{price,currency}')
       or v_existing.billing_cadence is distinct from (v_payload #>> '{price,billing_cadence}')
       or v_existing.recurring is distinct from nullif(v_payload #>> '{price,recurring}', '')::boolean
       or v_existing.trial_state is distinct from (v_payload #>> '{price,trial_state}')
       or v_existing.terms_version is distinct from (v_payload ->> 'terms_version')
       or v_existing.disclosure_version is distinct from (v_payload ->> 'disclosure_version')
       or v_existing.affirmative_action is distinct from nullif(v_payload ->> 'affirmative_action', '')::boolean
       or v_existing.displayed_descriptor is distinct from (v_payload ->> 'displayed_descriptor')
       or v_existing.descriptor_version is distinct from (v_payload ->> 'descriptor_version')
       or v_existing.milestone is distinct from (v_payload ->> 'milestone')
       or v_existing.duration_bucket is distinct from (v_payload ->> 'duration_bucket')
       or v_existing.action_type is distinct from (v_payload ->> 'action_type')
       or v_existing.error_code is distinct from (v_payload #>> '{error,code}')
       or v_existing.error_category is distinct from (v_payload #>> '{error,category}')
       or v_existing.app_version is distinct from (v_payload ->> 'app_version')
       or v_existing.page_id is distinct from (v_payload ->> 'page_id')
       or v_existing.evidence_state is distinct from 'observed'
       or v_existing.privacy_mode is distinct from (v_payload ->> 'privacy_mode')
       or v_existing.observed_origin is distinct from v_evidence.observed_origin then
      raise exception 'existing event conflicts with durable recovery state' using errcode = '55000';
    end if;
    select audit.id into v_existing_audit_id
      from public.tracekit_audit_events audit
      where audit.organization_id = p_organization_id
        and audit.action = 'tkid.event_persistence_recovered'
        and audit.target_type = 'tkid_event'
        and audit.target_id = p_event_id::text
        and audit.result = 'success'
      order by audit.occurred_at, audit.id
      limit 1;
    return query select p_event_id, 'already_recovered'::text, false, v_evidence.id, v_claim.id, v_payload_journey_id, v_existing_audit_id;
    return;
  end if;

  insert into public.tkid_events(
    id, organization_id, journey_id, browser_session_id, checkout_session_id,
    source_id, evidence_id, event_name, schema_version, normalizer_version,
    occurred_at, received_at, funnel_step_id, offer_id, offer_version_id,
    cta_id, cta_version, price_amount, currency, billing_cadence, recurring,
    trial_state, terms_version, disclosure_version, affirmative_action,
    displayed_descriptor, descriptor_version, milestone, duration_bucket,
    action_type, error_code, error_category, app_version, page_id,
    evidence_state, privacy_mode, origin_id, observed_origin
  ) values (
    p_event_id, p_organization_id, v_payload_journey_id, v_payload_session_id, v_payload_checkout_id,
    p_source_id, v_evidence.id, v_payload ->> 'event_name', (v_payload ->> 'schema_version')::integer, v_payload ->> 'normalizer_version',
    v_occurred_at, v_received_at, v_payload ->> 'funnel_step_id', v_payload ->> 'offer_id', v_payload ->> 'offer_version_id',
    v_payload ->> 'cta_id', v_payload ->> 'cta_version', nullif(v_payload #>> '{price,amount}', '')::numeric,
    v_payload #>> '{price,currency}', v_payload #>> '{price,billing_cadence}', nullif(v_payload #>> '{price,recurring}', '')::boolean,
    v_payload #>> '{price,trial_state}', v_payload ->> 'terms_version', v_payload ->> 'disclosure_version',
    nullif(v_payload ->> 'affirmative_action', '')::boolean, v_payload ->> 'displayed_descriptor', v_payload ->> 'descriptor_version',
    v_payload ->> 'milestone', v_payload ->> 'duration_bucket', v_payload ->> 'action_type',
    v_payload #>> '{error,code}', v_payload #>> '{error,category}', v_payload ->> 'app_version', v_payload ->> 'page_id',
    'observed', v_payload ->> 'privacy_mode', v_evidence.origin_id, v_evidence.observed_origin
  );

  insert into public.tracekit_audit_events(
    actor_user_id, account_id, organization_id, action, target_type, target_id,
    result, permission_evaluated, correlation_id, metadata
  ) values (
    p_actor_user_id, v_source.account_id, p_organization_id,
    'tkid.event_persistence_recovered', 'tkid_event', p_event_id::text,
    'success', 'admin.manage_feature_access', btrim(p_correlation_id),
    jsonb_build_object(
      'source_id', p_source_id,
      'event_id', p_event_id,
      'journey_id', v_payload_journey_id,
      'evidence_id', v_evidence.id,
      'reservation_id', v_claim.id,
      'reason', btrim(p_reason),
      'recovery_version', 'tkid-event-recovery-v1',
      'prior_state', 'evidence_only',
      'resulting_state', 'complete'
    )
  ) returning id into v_audit_id;

  return query select p_event_id, 'recovered'::text, true, v_evidence.id, v_claim.id, v_payload_journey_id, v_audit_id;
end;
$$;

revoke all on function public.tkid_canonical_json_v1(jsonb) from public, anon, authenticated, authenticator;
revoke all on function public.recover_interrupted_tkid_event_v1(uuid,uuid,uuid,text,text,text,uuid) from public, anon, authenticated, authenticator;
grant execute on function public.tkid_canonical_json_v1(jsonb) to service_role;
grant execute on function public.recover_interrupted_tkid_event_v1(uuid,uuid,uuid,text,text,text,uuid) to service_role;

comment on function public.tkid_canonical_json_v1(jsonb) is
  'Internal service-role helper reproducing the TKID v1 sorted-key JSON hash input; not a public ingestion surface.';
comment on function public.recover_interrupted_tkid_event_v1(uuid,uuid,uuid,text,text,text,uuid) is
  'Service-role-only audited completion of a pre-existing TKID event reservation plus immutable evidence. Requires stopped ingestion, creates no reservation/evidence/Journey/session, and may complete after proof expiry when the reservation was claimed inside its authorized window.';
