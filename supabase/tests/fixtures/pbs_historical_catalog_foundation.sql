-- TEST-ONLY FIXTURE. Never install this file as a Production migration.
-- Load after a normal clean reset, then replay the tenant-scoped PBS migration
-- cohort to exercise the historical compatibility path.

begin;

insert into public.tracekit_accounts
  (id, account_type, name, status, white_label_configuration)
values
  ('39d895f9-71ac-44d3-ac33-6e9043f6267e', 'client', 'TraceKit', 'active', '{}'::jsonb);

insert into public.tracekit_organizations
  (id, owning_account_id, agency_id, workos_organization_id, name, status)
values
  ('5f1de64a-1b37-40bb-81c8-32197eda0b41',
   '39d895f9-71ac-44d3-ac33-6e9043f6267e', null, null, 'TraceKit', 'active');

insert into public.tracekit_business_contexts
  (id, account_id, organization_id, name, status, fulfillment_type, metadata)
values
  ('push-button-system-5f1de64a',
   '39d895f9-71ac-44d3-ac33-6e9043f6267e',
   '5f1de64a-1b37-40bb-81c8-32197eda0b41',
   'Push Button System', 'active', 'digital',
   '{"catalog_key":"push-button-system","identity_basis":"operator_authorized"}'::jsonb);

insert into public.canonical_offers
  (id, account_id, organization_id, business_context_id, name, status, metadata)
values
  ('b842611c-9918-40ac-9241-d542a8c6f8b4',
   '39d895f9-71ac-44d3-ac33-6e9043f6267e',
   '5f1de64a-1b37-40bb-81c8-32197eda0b41',
   'push-button-system-5f1de64a', 'Push Button System', 'active',
   '{"catalog_key":"push-button-system","identity_basis":"operator_authorized"}'::jsonb);

insert into public.offer_steps
  (id, organization_id, canonical_offer_id, role, sequence, label, metadata)
values
  ('8110e951-8ca6-406a-8817-55575fe647ba', '5f1de64a-1b37-40bb-81c8-32197eda0b41', 'b842611c-9918-40ac-9241-d542a8c6f8b4', 'front_end', 0, 'Front End', '{"catalog_key":"front-end","default_price":67,"currency":"USD","identity_basis":"operator_authorized"}'::jsonb),
  ('8d1b5be3-c60c-45ec-baa6-a2e1b6b610d5', '5f1de64a-1b37-40bb-81c8-32197eda0b41', 'b842611c-9918-40ac-9241-d542a8c6f8b4', 'upsell', 1, 'OTO 1 — Gold', '{"catalog_key":"oto-1-gold","default_price":297,"currency":"USD","identity_basis":"operator_authorized"}'::jsonb),
  ('e215a9be-453c-461f-ab06-7e75742be9f1', '5f1de64a-1b37-40bb-81c8-32197eda0b41', 'b842611c-9918-40ac-9241-d542a8c6f8b4', 'downsell', 1, 'OTO 1 — Downsell 1', '{"catalog_key":"oto-1-downsell-1","parent_step_key":"oto-1-gold","default_price":197,"currency":"USD","identity_basis":"operator_authorized"}'::jsonb),
  ('2df33aef-aee2-459e-ac65-6e3cbd3dbd13', '5f1de64a-1b37-40bb-81c8-32197eda0b41', 'b842611c-9918-40ac-9241-d542a8c6f8b4', 'downsell', 2, 'OTO 1 — Downsell 2', '{"catalog_key":"oto-1-downsell-2","parent_step_key":"oto-1-gold","default_price":97,"currency":"USD","identity_basis":"operator_authorized"}'::jsonb),
  ('a4992adc-57e8-4bb1-9360-f421d2d9322c', '5f1de64a-1b37-40bb-81c8-32197eda0b41', 'b842611c-9918-40ac-9241-d542a8c6f8b4', 'upsell', 2, 'OTO 2 — Platinum', '{"catalog_key":"oto-2-platinum","default_price":299,"currency":"USD","identity_basis":"operator_authorized"}'::jsonb),
  ('bf339297-6717-4286-b83c-b9af54b8d0f3', '5f1de64a-1b37-40bb-81c8-32197eda0b41', 'b842611c-9918-40ac-9241-d542a8c6f8b4', 'downsell', 3, 'OTO 2 — Downsell 1', '{"catalog_key":"oto-2-downsell-1","parent_step_key":"oto-2-platinum","default_price":199,"currency":"USD","identity_basis":"operator_authorized"}'::jsonb),
  ('155997e9-244b-4547-94e0-4fde658f8c0f', '5f1de64a-1b37-40bb-81c8-32197eda0b41', 'b842611c-9918-40ac-9241-d542a8c6f8b4', 'downsell', 4, 'OTO 2 — Downsell 2', '{"catalog_key":"oto-2-downsell-2","parent_step_key":"oto-2-platinum","default_price":99,"currency":"USD","identity_basis":"operator_authorized"}'::jsonb);

insert into public.commerce_provider_connections
  (id, account_id, organization_id, provider, display_name, status)
values
  ('ea1c2313-6120-4692-84c5-ec3562e7dcf6',
   '39d895f9-71ac-44d3-ac33-6e9043f6267e',
   '5f1de64a-1b37-40bb-81c8-32197eda0b41',
   'commas', 'PBS test fixture', 'connected');

insert into public.commerce_provider_accounts
  (id, connection_id, organization_id, provider_account_external_id, status)
values
  ('0369c701-717f-4c34-b230-8341bcdb7e65',
   'ea1c2313-6120-4692-84c5-ec3562e7dcf6',
   '5f1de64a-1b37-40bb-81c8-32197eda0b41',
   'pbs-test-fixture', 'active');

-- Non-commerce test product required by the historical completion migration's
-- suppression validation. It carries no user identity or approved mapping.
insert into public.commerce_provider_products
  (id, organization_id, connection_id, provider_account_id,
   provider_product_id, title, first_seen_at, last_seen_at, mapping_status, mapping_version)
values
  ('70000000-0000-4000-8000-000000000001',
   '5f1de64a-1b37-40bb-81c8-32197eda0b41',
   'ea1c2313-6120-4692-84c5-ec3562e7dcf6',
   '0369c701-717f-4c34-b230-8341bcdb7e65',
   '7pQKA', 'PBS fixture affiliate tracking test', now(), now(), 'review_required', null),
  ('70000000-0000-4000-8000-000000000002',
   '5f1de64a-1b37-40bb-81c8-32197eda0b41',
   'ea1c2313-6120-4692-84c5-ec3562e7dcf6',
   '0369c701-717f-4c34-b230-8341bcdb7e65',
   'vREZg', 'PBS fixture Millionaire Interview Series', now(), now(), 'review_required', null),
  ('70000000-0000-4000-8000-000000000003',
   '5f1de64a-1b37-40bb-81c8-32197eda0b41',
   'ea1c2313-6120-4692-84c5-ec3562e7dcf6',
   '0369c701-717f-4c34-b230-8341bcdb7e65',
   '5M6yv', 'PBS fixture OTO 2 Platinum', now(), now(), 'review_required',
   'unmapped-v1');

commit;
