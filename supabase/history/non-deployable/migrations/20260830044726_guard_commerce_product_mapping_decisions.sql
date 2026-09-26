-- Retire the original decision signature: it accepted a new mapping version
-- but did not compare the caller's observed version before updating the row.
revoke all on function public.decide_commerce_product_mapping(
  uuid, uuid, uuid, uuid, text, text, uuid, uuid, uuid, text, uuid, text
) from public, anon, authenticated, service_role;

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
  p_expected_mapping_version text,
  p_mapping_version text,
  p_decided_by_user_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_previous_state text;
  v_current_mapping_version text;
  v_updated integer;
begin
  if p_resulting_state not in ('approved', 'rejected')
    or nullif(btrim(p_expected_mapping_version), '') is null
    or nullif(btrim(p_mapping_version), '') is null
    or p_mapping_version = p_expected_mapping_version
    or nullif(btrim(p_reason), '') is null
  then
    raise exception 'invalid product mapping decision' using errcode = '22023';
  end if;

  if p_resulting_state = 'approved' and
    (p_business_context_id is null or p_canonical_offer_id is null or p_offer_step_id is null)
  then
    raise exception 'approved product mapping target incomplete' using errcode = '22023';
  end if;

  if p_resulting_state = 'rejected' and
    (p_business_context_id is not null or p_canonical_offer_id is not null or
     p_offer_step_id is not null or p_offer_variant_id is not null)
  then
    raise exception 'rejected product mapping cannot retain a target' using errcode = '22023';
  end if;

  select mapping_status, mapping_version
    into v_previous_state, v_current_mapping_version
  from public.commerce_provider_products
  where id = p_provider_product_id
    and organization_id = p_organization_id
    and connection_id = p_connection_id
    and provider_account_id = p_provider_account_id
  for update;

  if not found then return false; end if;
  if v_current_mapping_version is distinct from p_expected_mapping_version then
    raise exception 'stale product mapping version' using errcode = '40001';
  end if;

  insert into public.commerce_product_mapping_decisions
    (organization_id, connection_id, provider_account_id, provider_product_id,
     previous_state, resulting_state, business_context_id, canonical_offer_id,
     offer_step_id, offer_variant_id, mapping_version, decided_by_user_id, reason)
  values
    (p_organization_id, p_connection_id, p_provider_account_id, p_provider_product_id,
     v_previous_state, p_resulting_state, p_business_context_id, p_canonical_offer_id,
     p_offer_step_id, p_offer_variant_id, p_mapping_version, p_decided_by_user_id, btrim(p_reason));

  update public.commerce_provider_products
  set mapping_status = p_resulting_state,
      business_context_id = case when p_resulting_state = 'approved' then p_business_context_id else null end,
      canonical_offer_id = case when p_resulting_state = 'approved' then p_canonical_offer_id else null end,
      offer_step_id = case when p_resulting_state = 'approved' then p_offer_step_id else null end,
      offer_variant_id = case when p_resulting_state = 'approved' then p_offer_variant_id else null end,
      mapping_version = p_mapping_version,
      reviewed_by_user_id = p_decided_by_user_id,
      reviewed_at = now(),
      updated_at = now()
  where id = p_provider_product_id
    and organization_id = p_organization_id
    and connection_id = p_connection_id
    and provider_account_id = p_provider_account_id
    and mapping_version is not distinct from p_expected_mapping_version;

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'stale product mapping version' using errcode = '40001';
  end if;
  return true;
end;
$$;

revoke all on function public.decide_commerce_product_mapping(
  uuid, uuid, uuid, uuid, text, text, uuid, uuid, uuid, text, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.decide_commerce_product_mapping(
  uuid, uuid, uuid, uuid, text, text, uuid, uuid, uuid, text, text, uuid, text
) to service_role;

comment on function public.decide_commerce_product_mapping(
  uuid, uuid, uuid, uuid, text, text, uuid, uuid, uuid, text, text, uuid, text
) is 'Append-only, tenant-scoped Product mapping decision with an expected-version concurrency guard.';
