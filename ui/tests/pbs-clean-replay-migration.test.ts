import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "../../supabase/migrations/";
const expansionFile = "20260830193240_expand_pbs_catalog_and_seed_mapping_intelligence.sql";
const expansion = readFileSync(new URL(migrationPath + expansionFile, import.meta.url), "utf8");
const completion = readFileSync(new URL(migrationPath + "20260830224050_complete_commas_canonical_catalog.sql", import.meta.url), "utf8");
const millionaire = readFileSync(new URL(migrationPath + "20260830224941_add_millionaire_interview_order_bump.sql", import.meta.url), "utf8");
const fixture = readFileSync(new URL("../../supabase/tests/fixtures/pbs_historical_catalog_foundation.sql", import.meta.url), "utf8");
const prerequisite = expansion.match(/-- Explicit boundary[\s\S]*?\$pbs_foundation_validation\$;/)?.[0] || "";
const expansionSteps = expansion.match(/-- Canonical steps:[\s\S]*?on conflict \(id\) do update/)?.[0] || "";

const foundationIds = [
  "8110e951-8ca6-406a-8817-55575fe647ba",
  "8d1b5be3-c60c-45ec-baa6-a2e1b6b610d5",
  "e215a9be-453c-461f-ab06-7e75742be9f1",
  "2df33aef-aee2-459e-ac65-6e3cbd3dbd13",
  "a4992adc-57e8-4bb1-9360-f421d2d9322c",
  "bf339297-6717-4286-b83c-b9af54b8d0f3",
  "155997e9-244b-4547-94e0-4fde658f8c0f",
];

const expandedIds = [
  "a5d6d601-790d-4b7c-97f3-a9f833465ef5",
  "2fa222b9-1325-4cd5-b712-03313f093057",
  "95afea56-9792-4fda-960d-7256251f3523",
  "5539e35e-3ac6-4a4b-9b6f-f2dd24243174",
  "f7cb7314-ac29-4375-b66d-638f48cb6d9d",
  "cc840aa1-137e-410f-a694-b4e73911125a",
  "a4bb6737-536b-4bcf-b8b4-c3521a98189a",
  "d61f4968-09ec-449c-98c8-f031799e88c8",
  "bf1a8bc2-c09b-443e-853a-7706aa359e2f",
  "f6ed95ce-b067-4276-91c2-2d7204cb2b4e",
  "995cc1b6-1d91-45a0-a571-d74cabbc8489",
  "960d9960-977a-45f3-927e-a2f4842ef287",
  "830a4236-1a26-435e-9b7f-d7016e142100",
];

const completionIds = [
  "67cb7e8d-e91d-42a8-a6db-69b60c18cc26",
  "d7d5a3c4-15b3-40e5-a16b-e43eced43d1e",
  "ce2fa379-eeb7-4c37-a17c-d2012679c3d7",
  "a04a0cab-af78-4664-9d37-3a2677a4750f",
];

test("PBS migration identities match the established Production ledger", () => {
  for (const file of [
    "20260830193227_product_mapping_intelligence_foundation.sql",
    expansionFile,
    "20260830193247_correct_pbs_mapping_seed_normalization.sql",
    "20260830220012_add_product_mapping_price_evidence_and_correct_growth_partner.sql",
    "20260830224050_complete_commas_canonical_catalog.sql",
    "20260830224941_add_millionaire_interview_order_bump.sql",
    "20260831010201_add_commas_economic_order_allocations.sql",
    "20260831014400_frozen_commas_economic_allocation_manifest.sql",
    "20260831032600_recommend_5m6yv_oto2_platinum.sql",
  ]) assert.equal(existsSync(new URL(migrationPath + file, import.meta.url)), true, file);
  assert.equal(existsSync(new URL(migrationPath + "20260830050245_create_push_button_system_catalog.sql", import.meta.url)), false);
});

test("test-only fixture supplies the exact seven-step approved foundation", () => {
  assert.match(fixture, /TEST-ONLY FIXTURE/);
  assert.match(fixture, /insert into public\.tracekit_accounts/);
  assert.match(fixture, /insert into public\.tracekit_organizations/);
  assert.match(fixture, /insert into public\.tracekit_business_contexts/);
  assert.match(fixture, /insert into public\.canonical_offers/);
  assert.doesNotMatch(fixture, /tracekit_memberships|auth\.users|tracekit_audit_events|installation\.bootstrap\.completed/);
  assert.match(fixture, /agency_id, workos_organization_id, name, status\)[\s\S]*null, null, 'TraceKit'/);
  for (const id of foundationIds) assert.match(fixture, new RegExp(id));
  assert.equal((fixture.match(/^  \('[0-9a-f-]{36}', '5f1de64a/gm) || []).length, 7);
});

test("generic replay skips absent PBS tenant and fails closed on partial/conflicting scope", () => {
  assert.ok(prerequisite.length > 0);
  assert.ok(expansion.indexOf("-- Explicit boundary") < expansion.indexOf("-- Canonical steps:"));
  assert.match(prerequisite, /if not v_account_exists and not v_organization_exists then return false/);
  assert.match(prerequisite, /PBS historical tenant prerequisite conflicts with fixed scope/);
  assert.match(prerequisite, /business context conflicts with approved foundation/);
  assert.match(prerequisite, /canonical offer conflicts with approved foundation/);
  assert.match(prerequisite, /foundational steps conflict with approved catalog/);
  assert.doesNotMatch(prerequisite, /insert into public\.tracekit_accounts|insert into public\.tracekit_organizations/);
});

test("runtime RPC preserves confirmation, membership, fixed scope, conflicts, and ACL", () => {
  assert.match(expansion, /create or replace function public\.create_push_button_system_catalog/);
  assert.match(expansion, /p_confirmation is distinct from 'create-push-button-system-catalog'/);
  assert.match(expansion, /m\.user_id = p_actor_user_id[\s\S]*m\.organization_id = v_organization_id[\s\S]*m\.status = 'active'/);
  assert.match(expansion, /v_organization_id constant uuid := '5f1de64a-1b37-40bb-81c8-32197eda0b41'/);
  assert.match(expansion, /conflicts with existing canonical state/);
  assert.match(expansion, /revoke all on function[\s\S]*from public, anon, authenticated/);
  assert.match(expansion, /grant execute on function[\s\S]*to service_role/);
});

test("final catalog composition remains exactly 7 + 13 + 4 + 1 = 25 steps", () => {
  for (const id of expandedIds) assert.match(expansionSteps, new RegExp(id));
  for (const id of completionIds) assert.match(completion, new RegExp(id));
  assert.equal(foundationIds.length, 7);
  assert.equal(expandedIds.length, 13);
  assert.equal(completionIds.length, 4);
  assert.equal((millionaire.match(/insert into public\.offer_steps/g) || []).length, 1);
  assert.match(millionaire, /efc6b70d-296c-4f28-8c50-3851dd0c467e/);
  assert.equal(new Set([...foundationIds, ...expandedIds, ...completionIds, "efc6b70d-296c-4f28-8c50-3851dd0c467e"]).size, 25);
});
