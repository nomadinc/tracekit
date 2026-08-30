import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const catalog = readFileSync(new URL("../../supabase/migrations/20260830050245_create_push_button_system_catalog.sql", import.meta.url), "utf8");
const mappingGuard = readFileSync(new URL("../../supabase/migrations/20260830044726_guard_commerce_product_mapping_decisions.sql", import.meta.url), "utf8");
const ingestion = readFileSync(new URL("../../supabase/migrations/043_commerce_shadow_ingestion_v1.sql", import.meta.url), "utf8");
const persistence = readFileSync(new URL("../../supabase/migrations/039_commerce_persistence_v1.sql", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/commerce/create-push-button-system-catalog/route.ts", import.meta.url), "utf8");

test("Push Button System bootstrap creates one context, one offer, seven stable steps, and no variants", () => {
  assert.match(catalog, /'push-button-system-5f1de64a'/);
  assert.equal((catalog.match(/insert into public\.canonical_offers/g) || []).length, 1);
  assert.equal((catalog.match(/insert into public\.offer_steps/g) || []).length, 1);
  assert.doesNotMatch(catalog, /insert into public\.offer_variants/);
  for (const key of ["front-end", "oto-1-gold", "oto-1-downsell-1", "oto-1-downsell-2", "oto-2-platinum", "oto-2-downsell-1", "oto-2-downsell-2"]) {
    assert.match(catalog, new RegExp(`catalog_key\\\":\\\"${key}`));
  }
});

test("authorized prices are metadata and never participate in canonical identity", () => {
  for (const price of [67, 297, 197, 97, 299, 199, 99]) assert.match(catalog, new RegExp(`default_price\\\":${price}`));
  assert.ok(catalog.includes('"identity_basis":"operator_authorized"'));
  assert.ok(catalog.includes('"parent_step_key":"oto-1-gold"'));
  assert.ok(catalog.includes('"parent_step_key":"oto-2-platinum"'));
  assert.doesNotMatch(catalog, /provider_product_id\s*=/);
});

test("catalog creation is fixed-scope, idempotent, audited, and service-role only", () => {
  assert.match(catalog, /p_confirmation is distinct from 'create-push-button-system-catalog'/);
  assert.match(catalog, /tracekit_memberships[\s\S]*m\.user_id = p_actor_user_id[\s\S]*m\.organization_id = v_organization_id[\s\S]*m\.status = 'active'/);
  assert.match(catalog, /pg_advisory_xact_lock/);
  assert.equal((catalog.match(/on conflict \(id\) do nothing/g) || []).length, 3);
  assert.match(catalog, /conflicts with existing canonical state/);
  assert.match(catalog, /tracekit_audit_events/);
  assert.match(catalog, /permission_evaluated[\s\S]*'offers\.manage'/);
  assert.match(catalog, /grant execute on function public\.create_push_button_system_catalog\(uuid, text, text\)[\s\S]*to service_role/);
  assert.doesNotMatch(catalog, /grant execute[\s\S]*to (anon|authenticated)/);
  assert.doesNotMatch(catalog, /(insert into|update|delete from) public\.(commerce_provider_products|commerce_product_mapping_decisions|platform_orders|commerce_refund_events|commerce_evidence_records)/);
});

test("four checkout identities can converge on Front End without merging or creating variants", () => {
  const authorizedProviderIds = ["o2GYY", "Jz71g", "4KV26", "xz1kz"];
  assert.equal(new Set(authorizedProviderIds).size, 4);
  assert.match(catalog, /'8110e951-8ca6-406a-8817-55575fe647ba'.*'front_end'.*'Front End'/s);
  assert.doesNotMatch(catalog, new RegExp(authorizedProviderIds.join("|")));
  assert.doesNotMatch(catalog, /offer_variants/);
  assert.match(persistence, /unique \(connection_id, provider_account_id, provider_product_id\)/);
});

test("mapping remains separately version-guarded and imports cannot overwrite approval", () => {
  assert.match(mappingGuard, /p_expected_mapping_version text/);
  assert.match(mappingGuard, /v_current_mapping_version is distinct from p_expected_mapping_version/);
  assert.match(mappingGuard, /p_mapping_version = p_expected_mapping_version/);
  assert.match(mappingGuard, /stale product mapping version'.*errcode = '40001'/s);
  const productUpsert = ingestion.match(/insert into public\.commerce_provider_products[\s\S]*?;\n/)?.[0] || "";
  assert.doesNotMatch(productUpsert, /mapping_status\s*=/);
  assert.doesNotMatch(productUpsert, /mapping_version\s*=/);
  assert.doesNotMatch(productUpsert, /canonical_offer_id\s*=/);
  assert.doesNotMatch(productUpsert, /offer_step_id\s*=/);
});

test("catalog creation route is WorkOS scoped, same-origin, fixed-purpose, and sanitized", () => {
  assert.match(route, /resolveApplicationSession/);
  assert.match(route, /requirePermission\(resolution\.session, "offers\.manage"\)/);
  assert.match(route, /sec-fetch-site/);
  assert.match(route, /Object\.keys\(body\)\.length !== 1/);
  assert.match(route, /rpc\/create_push_button_system_catalog/);
  assert.match(route, /p_actor_user_id: resolution\.session\.user\.id/);
  assert.match(route, /p_correlation_id: requestId/);
  assert.doesNotMatch(route, /provider_product_id|decide_commerce_product_mapping|commerce_provider_products/);
  assert.doesNotMatch(route, /error\.message|String\(error\)/);
});
