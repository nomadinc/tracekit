import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../../supabase/migrations/20261001210000_m15_stem_labs_workspace_authorization.sql", import.meta.url), "utf8");

test("M15 workspace provisioning is bound to current Stem Labs Shopify tenancy", () => {
  assert.match(sql, /8f6bb14b-2126-49b8-bfdb-c60edbc3549b/);
  assert.match(sql, /d69a93dd-98ed-46fd-b486-1a39fb8388dd/);
  assert.match(sql, /d06cd699-6a75-4a92-9942-6c94dc268d3b/);
  assert.match(sql, /izkfvg-k0\.myshopify\.com/);
  assert.match(sql, /status='connected'/);
  assert.match(sql, /revoked_at is null/);
});

test("M15 creates authorization workspace only and no canonical catalog", () => {
  assert.match(sql, /insert into tracekit_business_contexts/);
  assert.match(sql, /insert into tracekit_memberships/);
  assert.match(sql, /insert into tracekit_business_context_access/);
  assert.doesNotMatch(sql, /insert into canonical_offers/);
  assert.doesNotMatch(sql, /insert into commerce_provider_products/);
  assert.doesNotMatch(sql, /update commerce_provider_products/);
  assert.doesNotMatch(sql, /insert into commerce_product_mapping_decisions/);
});

test("M15 fails closed if Stem Labs catalog or mapping state appears", () => {
  assert.match(sql, /exists\(select 1 from canonical_offers where organization_id=v_org\)/);
  assert.match(sql, /exists\(select 1 from commerce_product_mapping_decisions where organization_id=v_org\)/);
  assert.match(sql, /M15 workspace provisioning mutated catalog state/);
});
