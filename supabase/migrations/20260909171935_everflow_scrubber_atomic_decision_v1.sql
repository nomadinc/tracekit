-- Atomic decision and mock-forward state transitions for scrubber M2.
-- Functions are SECURITY INVOKER and executable only by service_role. The
-- caller is the authenticated server gateway; no browser role can invoke them.

create or replace function public.decide_everflow_scrubber_conversion_v1(
  p_request_id uuid,
  p_source_id uuid,
  p_idempotency_key text,
  p_transaction_id text,
  p_network_offer_id text,
  p_network_affiliate_id text,
  p_order_id text,
  p_event_key text,
  p_event_id text,
  p_adv_event_id text,
  p_amount numeric,
  p_currency text,
  p_user_ip inet,
  p_coupon_code text,
  p_email_sha256 text,
  p_is_eligible boolean,
  p_random_unit numeric,
  p_request_payload jsonb,
  p_forwarding_payload jsonb,
  p_received_at timestamptz default now()
)
returns table(
  conversion_id uuid,
  decision text,
  decision_reason text,
  duplicate boolean,
  rule_source text,
  rule_id uuid,
  rule_period_id uuid,
  effective_pass_rate numeric,
  controller_probability numeric,
  forward_status text
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_source public.everflow_scrubber_sources%rowtype;
  v_settings public.everflow_scrubber_settings%rowtype;
  v_existing public.everflow_scrubber_conversions%rowtype;
  v_pair_rule public.everflow_scrubber_pair_rules%rowtype;
  v_offer_rule public.everflow_scrubber_offer_rules%rowtype;
  v_period public.everflow_scrubber_periods%rowtype;
  v_rule_source text;
  v_rule_id uuid;
  v_rate numeric;
  v_probability numeric;
  v_decision text;
  v_reason text;
  v_conversion_id uuid;
  v_forward_status text;
  v_received_at timestamptz := coalesce(p_received_at, now());
  v_revenue numeric := coalesce(p_amount, 0);
begin
  if p_random_unit < 0 or p_random_unit >= 1 then
    raise exception 'random unit must be in [0,1)' using errcode = '22023';
  end if;

  select * into v_source
  from public.everflow_scrubber_sources
  where id = p_source_id and active = true
  for update;
  if not found then
    raise exception 'scrubber source unavailable' using errcode = '42501';
  end if;

  select * into v_settings
  from public.everflow_scrubber_settings
  where organization_id = v_source.organization_id
    and connection_id = v_source.connection_id
  for share;
  if not found then
    raise exception 'scrubber settings unavailable' using errcode = '55000';
  end if;

  -- One lock serializes both duplicate arbitration and controller counters for
  -- this exact Offer x Affiliate bucket. Other buckets remain independent.
  perform pg_advisory_xact_lock(
    hashtextextended(
      v_source.organization_id::text || ':' || v_source.connection_id::text || ':' ||
      p_network_offer_id || ':' || p_network_affiliate_id,
      82736491
    )
  );

  select * into v_existing
  from public.everflow_scrubber_conversions
  where organization_id = v_source.organization_id
    and connection_id = v_source.connection_id
    and source_key = v_source.source_key
    and idempotency_key = p_idempotency_key;
  if found then
    insert into public.everflow_scrubber_ingress_attempts(
      organization_id, connection_id, source_id, conversion_id, request_id,
      received_at, result, reason_code, payload_sha256
    ) values (
      v_source.organization_id, v_source.connection_id, v_source.id, v_existing.id,
      p_request_id, v_received_at, 'duplicate', 'DUPLICATE_SUPPRESSED',
      encode(sha256(convert_to(p_request_payload::text, 'utf8')), 'hex')
    );
    return query select v_existing.id, v_existing.decision,
      'DUPLICATE_SUPPRESSED'::text, true, v_existing.rule_source,
      v_existing.rule_id, v_existing.rule_period_id,
      v_existing.effective_pass_rate, v_existing.controller_probability,
      v_existing.forward_status;
    return;
  end if;

  if not v_settings.scrubbing_enabled then
    v_decision := 'PASS';
    v_reason := 'PASS_GLOBAL_BYPASS';
    v_probability := null;
    v_rate := 1;
  elsif not p_is_eligible then
    v_decision := 'PASS';
    v_reason := 'PASS_NON_ELIGIBLE_EVENT';
    v_probability := null;
    v_rate := null;
  else
    select * into v_pair_rule
    from public.everflow_scrubber_pair_rules
    where organization_id = v_source.organization_id
      and connection_id = v_source.connection_id
      and network_offer_id = p_network_offer_id
      and network_affiliate_id = p_network_affiliate_id
      and effective_at <= v_received_at and ended_at is null
    order by effective_at desc limit 1;

    if found then
      v_rule_source := 'pair'; v_rule_id := v_pair_rule.id; v_rate := v_pair_rule.pass_rate;
    else
      select * into v_offer_rule
      from public.everflow_scrubber_offer_rules
      where organization_id = v_source.organization_id
        and connection_id = v_source.connection_id
        and network_offer_id = p_network_offer_id
        and effective_at <= v_received_at and ended_at is null
      order by effective_at desc limit 1;
      if found then
        v_rule_source := 'offer'; v_rule_id := v_offer_rule.id; v_rate := v_offer_rule.pass_rate;
      else
        v_rule_source := 'global'; v_rule_id := null; v_rate := v_settings.global_pass_rate;
      end if;
    end if;

    select * into v_period
    from public.everflow_scrubber_periods
    where organization_id = v_source.organization_id
      and connection_id = v_source.connection_id
      and network_offer_id = p_network_offer_id
      and network_affiliate_id = p_network_affiliate_id
      and ended_at is null
    for update;

    if found and (
      v_period.rule_source <> v_rule_source or
      v_period.rule_id is distinct from v_rule_id or
      v_period.target_pass_rate <> v_rate or
      (v_settings.daily_period_rollover and
       (v_period.started_at at time zone v_settings.reporting_timezone)::date <
       (v_received_at at time zone v_settings.reporting_timezone)::date)
    ) then
      update public.everflow_scrubber_periods
      set ended_at = v_received_at, updated_at = v_received_at
      where id = v_period.id;
      v_period := null;
    end if;

    if v_period.id is null then
      insert into public.everflow_scrubber_periods(
        organization_id, connection_id, network_offer_id, network_affiliate_id,
        rule_source, rule_id, target_pass_rate, started_at
      ) values (
        v_source.organization_id, v_source.connection_id, p_network_offer_id,
        p_network_affiliate_id, v_rule_source, v_rule_id, v_rate, v_received_at
      ) returning * into v_period;
    end if;

    if v_rate = 0 or v_rate = 1 then
      v_probability := v_rate;
    else
      v_probability := greatest(0, least(1,
        v_rate + 0.35 * (v_rate * v_period.eligible_count - v_period.passed_count)
      ));
    end if;
    if p_random_unit < v_probability then
      v_decision := 'PASS'; v_reason := 'PASS_RULE_TARGET';
    else
      v_decision := 'SCRUB'; v_reason := 'SCRUB_RULE_TARGET';
    end if;
  end if;

  v_forward_status := case when v_decision = 'PASS' then 'pending' else 'not_applicable' end;
  insert into public.everflow_scrubber_conversions(
    organization_id, connection_id, source_id, source_key, idempotency_key,
    transaction_id, network_offer_id, network_affiliate_id, order_id, event_key,
    event_id, adv_event_id, amount, currency, user_ip, coupon_code, email_sha256,
    received_at, decision, decision_reason, rule_source, rule_id, rule_period_id,
    effective_pass_rate, controller_probability, request_payload,
    forwarding_payload, forward_status
  ) values (
    v_source.organization_id, v_source.connection_id, v_source.id, v_source.source_key,
    p_idempotency_key, p_transaction_id, p_network_offer_id,
    p_network_affiliate_id, p_order_id, p_event_key, p_event_id, p_adv_event_id,
    p_amount, p_currency, p_user_ip, p_coupon_code, p_email_sha256, v_received_at,
    v_decision, v_reason, v_rule_source, v_rule_id, v_period.id, v_rate,
    v_probability, p_request_payload, p_forwarding_payload, v_forward_status
  ) returning id into v_conversion_id;

  if p_is_eligible and v_settings.scrubbing_enabled then
    update public.everflow_scrubber_periods
    set eligible_count = eligible_count + 1,
        passed_count = passed_count + case when v_decision = 'PASS' then 1 else 0 end,
        scrubbed_count = scrubbed_count + case when v_decision = 'SCRUB' then 1 else 0 end,
        eligible_revenue = eligible_revenue + v_revenue,
        passed_revenue = passed_revenue + case when v_decision = 'PASS' then v_revenue else 0 end,
        scrubbed_revenue = scrubbed_revenue + case when v_decision = 'SCRUB' then v_revenue else 0 end,
        updated_at = v_received_at
    where id = v_period.id;
  end if;

  update public.everflow_scrubber_sources set last_used_at = v_received_at where id = v_source.id;
  insert into public.everflow_scrubber_ingress_attempts(
    organization_id, connection_id, source_id, conversion_id, request_id,
    received_at, result, reason_code, payload_sha256
  ) values (
    v_source.organization_id, v_source.connection_id, v_source.id, v_conversion_id,
    p_request_id, v_received_at, 'accepted', 'ACCEPTED',
    encode(sha256(convert_to(p_request_payload::text, 'utf8')), 'hex')
  );

  return query select v_conversion_id, v_decision, v_reason, false,
    v_rule_source, v_rule_id, v_period.id, v_rate, v_probability, v_forward_status;
end;
$$;

revoke all on function public.decide_everflow_scrubber_conversion_v1(
  uuid, uuid, text, text, text, text, text, text, text, text, numeric, text,
  inet, text, text, boolean, numeric, jsonb, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.decide_everflow_scrubber_conversion_v1(
  uuid, uuid, text, text, text, text, text, text, text, text, numeric, text,
  inet, text, text, boolean, numeric, jsonb, jsonb, timestamptz
) to service_role;

create or replace function public.record_everflow_scrubber_mock_forward_v1(
  p_conversion_id uuid,
  p_outcome text,
  p_http_status integer default null,
  p_response_reference text default null,
  p_error_code text default null,
  p_retry_at timestamptz default null
)
returns table(conversion_id uuid, forward_status text, attempt_number integer, next_retry_at timestamptz)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_conversion public.everflow_scrubber_conversions%rowtype;
  v_attempt integer;
  v_status text;
begin
  if p_outcome not in ('succeeded','retryable_failure','permanent_failure') then
    raise exception 'unsupported mock forward outcome' using errcode = '22023';
  end if;
  select * into v_conversion from public.everflow_scrubber_conversions
  where id = p_conversion_id for update;
  if not found or v_conversion.decision <> 'PASS' then
    raise exception 'pass conversion unavailable' using errcode = '55000';
  end if;
  if v_conversion.forward_status = 'succeeded' then
    return query select v_conversion.id, v_conversion.forward_status,
      v_conversion.forward_attempt_count, v_conversion.next_retry_at;
    return;
  end if;
  v_attempt := v_conversion.forward_attempt_count + 1;
  v_status := case p_outcome when 'succeeded' then 'succeeded'
    when 'retryable_failure' then 'retry' else 'permanent_failure' end;
  insert into public.everflow_scrubber_forward_attempts(
    organization_id, connection_id, conversion_id, attempt_number, completed_at,
    outcome, http_status, response_reference, error_code, retry_at
  ) values (
    v_conversion.organization_id, v_conversion.connection_id, v_conversion.id,
    v_attempt, now(), p_outcome, p_http_status, p_response_reference,
    p_error_code, case when p_outcome = 'retryable_failure' then p_retry_at else null end
  );
  update public.everflow_scrubber_conversions
  set forward_status = v_status,
      forward_attempt_count = v_attempt,
      next_retry_at = case when p_outcome = 'retryable_failure' then p_retry_at else null end,
      forwarded_at = case when p_outcome = 'succeeded' then now() else forwarded_at end,
      everflow_http_status = p_http_status,
      everflow_response_reference = p_response_reference,
      last_forward_error_code = p_error_code,
      updated_at = now()
  where id = v_conversion.id;
  return query select v_conversion.id, v_status, v_attempt,
    case when p_outcome = 'retryable_failure' then p_retry_at else null end;
end;
$$;

revoke all on function public.record_everflow_scrubber_mock_forward_v1(uuid, text, integer, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_everflow_scrubber_mock_forward_v1(uuid, text, integer, text, text, timestamptz)
  to service_role;
