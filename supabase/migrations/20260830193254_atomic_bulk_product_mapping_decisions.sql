-- Atomic bulk wrapper around the guarded 14-argument product-mapping decision RPC.
-- Any stale or invalid item aborts the entire batch; no partial decisions persist.

create or replace function public.decide_commerce_product_mapping_bulk(
  p_organization_id uuid,
  p_connection_id uuid,
  p_provider_account_id uuid,
  p_business_context_id text,
  p_canonical_offer_id uuid,
  p_offer_step_id uuid,
  p_offer_variant_id uuid,
  p_items jsonb,
  p_decided_by_user_id uuid,
  p_reason text,
  p_correlation_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_count integer := 0;
  v_provider_product_id uuid;
  v_expected_mapping_version text;
  v_mapping_version text;
begin
  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 50
     or nullif(btrim(p_reason), '') is null
     or char_length(p_reason) > 500
     or nullif(btrim(p_correlation_id), '') is null
  then
    raise exception 'invalid bulk product mapping request' using errcode = '22023';
  end if;

  -- Serialize batches for one provider account so two operators cannot race the
  -- same review queue while individual mapping-version guards remain authoritative.
  perform pg_advisory_xact_lock(hashtextextended(
    'commerce-product-mapping-bulk:' || p_organization_id::text || ':' || p_provider_account_id::text,
    0
  ));

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_provider_product_id := nullif(v_item->>'provider_product_id', '')::uuid;
    v_expected_mapping_version := nullif(v_item->>'expected_mapping_version', '');
    v_mapping_version := nullif(v_item->>'mapping_version', '');

    if v_provider_product_id is null
       or v_expected_mapping_version is null
       or v_mapping_version is null
    then
      raise exception 'invalid bulk product mapping item' using errcode = '22023';
    end if;

    perform public.decide_commerce_product_mapping(
      p_organization_id => p_organization_id,
      p_connection_id => p_connection_id,
      p_provider_account_id => p_provider_account_id,
      p_provider_product_id => v_provider_product_id,
      p_resulting_state => 'approved',
      p_business_context_id => p_business_context_id,
      p_canonical_offer_id => p_canonical_offer_id,
      p_offer_step_id => p_offer_step_id,
      p_offer_variant_id => p_offer_variant_id,
      p_expected_mapping_version => v_expected_mapping_version,
      p_mapping_version => v_mapping_version,
      p_decided_by_user_id => p_decided_by_user_id,
      p_reason => p_reason,
      p_correlation_id => p_correlation_id || ':' || v_provider_product_id::text
    );

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'decision_count', v_count,
    'correlation_id', p_correlation_id,
    'result', 'approved'
  );
end;
$$;

revoke all on function public.decide_commerce_product_mapping_bulk(uuid,uuid,uuid,text,uuid,uuid,uuid,jsonb,uuid,text,text)
  from public, anon, authenticated, authenticator;
grant execute on function public.decide_commerce_product_mapping_bulk(uuid,uuid,uuid,text,uuid,uuid,uuid,jsonb,uuid,text,text)
  to service_role;

comment on function public.decide_commerce_product_mapping_bulk(uuid,uuid,uuid,text,uuid,uuid,uuid,jsonb,uuid,text,text) is
  'Atomically appends up to 50 guarded approved product-mapping decisions to one canonical target; any stale item rolls back the full batch.';
