-- Correct normalization details in the immediately preceding PBS intelligence
-- seed. Commas provider product IDs are opaque identifiers and are matched
-- exactly (including case); normalized titles follow the application title
-- normalizer, which removes punctuation.

update public.commerce_product_mapping_rules
set normalized_match_value = match_value,
    updated_at = now()
where organization_id = '5f1de64a-1b37-40bb-81c8-32197eda0b41'::uuid
  and connection_id = 'ea1c2313-6120-4692-84c5-ec3562e7dcf6'::uuid
  and provider_account_id = '0369c701-717f-4c34-b230-8341bcdb7e65'::uuid
  and provider = 'commas'
  and rule_kind = 'provider_product_id'
  and evidence->>'source' = 'pbs-production-catalog-audit';

update public.commerce_product_mapping_rules
set normalized_match_value = 'super affiliate nu2',
    updated_at = now()
where organization_id = '5f1de64a-1b37-40bb-81c8-32197eda0b41'::uuid
  and connection_id = 'ea1c2313-6120-4692-84c5-ec3562e7dcf6'::uuid
  and provider_account_id = '0369c701-717f-4c34-b230-8341bcdb7e65'::uuid
  and provider = 'commas'
  and rule_kind = 'normalized_title'
  and match_value = 'super affiliate - nu2'
  and offer_step_id = '830a4236-1a26-435e-9b7f-d7016e142100'::uuid;
