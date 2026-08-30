import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../../supabase/migrations/20260830222807_complete_commas_canonical_catalog.sql", import.meta.url), "utf8");
const millionaireMigration = readFileSync(new URL("../../supabase/migrations/20260830224531_add_millionaire_interview_order_bump.sql", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/commerce/product-mappings/route.ts", import.meta.url), "utf8");

const GOLD = "8d1b5be3-c60c-45ec-baa6-a2e1b6b610d5";
const SILVER = "67cb7e8d-e91d-42a8-a6db-69b60c18cc26";
const BRONZE = "d7d5a3c4-15b3-40e5-a16b-e43eced43d1e";
const BRONZE_DISCOUNTED = "ce2fa379-eeb7-4c37-a17c-d2012679c3d7";
const GROWTH = "995cc1b6-1d91-45a0-a571-d74cabbc8489";
const GROWTH_DOWNSELL_1 = "a04a0cab-af78-4664-9d37-3a2677a4750f";
const GROWTH_DOWNSELL_2 = "960d9960-977a-45f3-927e-a2f4842ef287";

test("original Gold identity is preserved and its missing branch is modeled once", () => {
  assert.match(migration, new RegExp(`id = '${GOLD}'::uuid[\\s\\S]*catalog_key' = 'oto-1-gold'`));
  assert.doesNotMatch(migration, new RegExp(`update public\\.offer_steps[\\s\\S]{0,500}where id = '${GOLD}'`));
  assert.match(migration, new RegExp(`'${SILVER}'.*'Silver'.*"catalog_key":"original-gold-silver".*"parent_step_key":"oto-1-gold".*"default_price":195`, "s"));
  assert.match(migration, new RegExp(`'${BRONZE}'.*'Bronze'.*"catalog_key":"original-gold-bronze".*"parent_step_key":"original-gold-silver".*"default_price":95`, "s"));
  assert.match(migration, new RegExp(`'${BRONZE_DISCOUNTED}'.*'Bronze Discounted'.*"parent_step_key":"original-gold-bronze".*"accepted_prices":\\[70,79\\]`, "s"));
});

test("exact Gold-branch identities target the authorized canonical steps", () => {
  for (const [providerId, stepId] of [["N7v9D", SILVER], ["OJwyY", BRONZE], ["QAy00", BRONZE_DISCOUNTED], ["lXDqJ", BRONZE_DISCOUNTED]]) {
    assert.match(migration, new RegExp(`\\('${providerId}', '${stepId}'::uuid`));
  }
  assert.equal((migration.match(/'ce2fa379-eeb7-4c37-a17c-d2012679c3d7'::uuid/g) || []).length >= 3, true);
});

test("Growth Partner hierarchy preserves the approved $75 target UUID", () => {
  assert.match(migration, new RegExp(`'${GROWTH_DOWNSELL_1}'.*'Growth Partner — Downsell 1'.*"accepted_prices":\\[177,199\\]`, "s"));
  assert.match(migration, new RegExp(`where id = '${GROWTH_DOWNSELL_2}'::uuid`));
  assert.match(migration, /label = 'Growth Partner — Downsell 2'/);
  assert.match(migration, /"catalog_key":"growth-partner-downsell-2","parent_step_key":"growth-partner-downsell-1"/);
  assert.match(migration, new RegExp(`mapping_status = 'approved'[\\s\\S]*offer_step_id is distinct from '${GROWTH_DOWNSELL_2}'::uuid`));
  assert.match(migration, new RegExp(`\\('ZvpxR', '${GROWTH_DOWNSELL_1}'::uuid, 199`));
  assert.match(migration, new RegExp(`\\('JEoZJ', '${GROWTH_DOWNSELL_1}'::uuid, 177`));
  assert.match(migration, new RegExp(`where id = '${GROWTH}'::uuid[\\s\\S]*"accepted_prices":\\[249\\]`));
});

test("historical PBS and Mystery Box tests reuse existing canonical identities", () => {
  assert.match(migration, /\('N7Jr6', '8110e951-8ca6-406a-8817-55575fe647ba'::uuid, 47::numeric, 'historical'/);
  assert.match(migration, /Retired PBS Front End \$47 split test/);
  assert.match(migration, /\('9GOV4', 'bf1a8bc2-c09b-443e-853a-7706aa359e2f'::uuid, 148::numeric, 'historical'/);
  assert.doesNotMatch(migration, /'PBS \$47'[\s\S]*insert into public\.offer_steps/);
  assert.doesNotMatch(migration, /'Mystery Box \$148'[\s\S]*insert into public\.offer_steps/);
});

test("affiliate tracking test is retained but suppressed as non-commerce", () => {
  assert.match(migration, /provider_product_id = '7pQKA'/);
  assert.match(migration, /mapping_status = 'retired'/);
  assert.match(migration, /'classification', 'test_non_commerce'/);
  assert.match(migration, /'review_suppressed', true/);
  assert.match(migration, /'exclusion_reason', 'affiliate_tracking_test'/);
  assert.match(migration, /canonical_offer_id is null and offer_step_id is null and offer_variant_id is null/);
  assert.match(route, /mapping_status=neq\.retired/);
  assert.match(route, /current\.mapping_status==="retired"[\s\S]*product_not_actionable/);
  assert.doesNotMatch(migration, /delete from public\.(commerce_provider_products|platform_orders|commerce_source_mappings)/);
});

test("migration stays suggestion-only and preserves immutable commerce facts", () => {
  assert.match(migration, /'commas', 'provider_product_id'.*100, 'suggest', 'active'/s);
  assert.match(migration, /set auto_map_enabled = false/);
  assert.doesNotMatch(migration, /(insert into|update|delete from) public\.(platform_orders|commerce_product_mapping_decisions)/);
  assert.doesNotMatch(migration, /rule_kind.*(normalized_title|title_prefix)/);
  assert.doesNotMatch(migration, /execution_mode\s*=\s*'auto_map'/);
});

test("Millionaire Interview Series adds one exact, suggest-only order bump without changing existing bumps", () => {
  const stepId = "efc6b70d-296c-4f28-8c50-3851dd0c467e";
  assert.match(millionaireMigration, new RegExp(`'${stepId}'.*'order_bump'.*'Order Bump — Millionaire Interview Series'`, "s"));
  assert.match(millionaireMigration, /"catalog_key":"order-bump-millionaire-interview-series"/);
  assert.match(millionaireMigration, /"parent_step_key":"front-end"/);
  assert.match(millionaireMigration, /"accepted_prices":\[94\]/);
  assert.match(millionaireMigration, new RegExp(`'provider_product_id', 'vREZg', 'vREZg'[\\s\\S]*'${stepId}'[\\s\\S]*100, 'suggest', 'active'`));
  assert.match(millionaireMigration, /select id, 94, 'USD', 10, 'supporting'/);
  for (const existingOrderBump of [
    "a5d6d601-790d-4b7c-97f3-a9f833465ef5",
    "2fa222b9-1325-4cd5-b712-03313f093057",
    "95afea56-9792-4fda-960d-7256251f3523",
  ]) assert.doesNotMatch(millionaireMigration, new RegExp(existingOrderBump));
  assert.doesNotMatch(millionaireMigration, /rule_kind.*(normalized_title|title_prefix)/);
  assert.doesNotMatch(millionaireMigration, /(insert into|update|delete from) public\.(platform_orders|commerce_product_mapping_decisions)/);
  assert.match(millionaireMigration, /set auto_map_enabled = false/);
  assert.doesNotMatch(millionaireMigration, /execution_mode\s*=\s*'auto_map'/);
});
