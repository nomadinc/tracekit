import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../../supabase/migrations/20260924055441_provision_tkid_origin_registry_access_v1.sql", import.meta.url), "utf8").toLowerCase();

test("TKID provisioning is operator-authorized, tenant-scoped, and audited", () => {
  assert.match(migration, /p_confirmation is distinct from 'provision-tkid-origin-registry-access'/);
  assert.match(migration, /requester_membership\.organization_id=p_organization_id/);
  assert.match(migration, /m\.id=p_membership_id and m\.organization_id=p_organization_id/);
  assert.match(migration, /r\.role_key='organization-owner'/);
  assert.match(migration, /c\.id=p_business_context_id and c\.organization_id=p_organization_id/);
  assert.match(migration, /tracekit_business_context_access/);
  assert.match(migration, /'admin\.manage_feature_access','allow'/);
  assert.match(migration, /'tkid_origin_registry',null/);
  assert.match(migration, /authorization\.tkid_origin_registry\.provisioned/);
  assert.match(migration, /null,v_account_id,p_organization_id/);
  assert.match(migration, /'execution_context','service_role_operator_provisioning'/);
  assert.match(migration, /'requester_identity_authenticated',false/);
  assert.doesNotMatch(migration, /authenticated_identity_id/);
  assert.match(migration, /grant execute[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /grant execute[\s\S]*to (anon|authenticated)/);
});

test("TKID provisioning returns exact idempotent rollback evidence", () => {
  for (const field of [
    "access_id",
    "access_created",
    "access_changed",
    "access_prior_status",
    "access_resulting_status",
    "override_id",
    "override_created",
    "override_reused",
    "audit_event_id",
    "correlation_id",
  ]) assert.match(migration, new RegExp(`'${field}'`));
  assert.match(migration, /select id,status into v_access_id,v_access_prior_status[\s\S]*for update/);
  assert.match(migration, /if v_access_id is null then[\s\S]*v_access_created := true;[\s\S]*v_access_changed := true/);
  assert.match(migration, /elsif v_access_prior_status <> 'active' then[\s\S]*v_access_changed := true/);
  assert.match(migration, /if v_override_id is null then[\s\S]*v_override_created := true/);
  assert.match(migration, /'override_reused',not v_override_created/);
});

test("migration defines a reusable mechanism and does not silently mutate the EcoWatt tenant", () => {
  assert.doesNotMatch(migration, /169bfcac-221e-4d68-96e9-0b8b8f28bcff/);
  assert.doesNotMatch(migration, /5f1de64a-1b37-40bb-81c8-32197eda0b41/);
  assert.doesNotMatch(migration, /b784b15c-208d-4a6e-9424-3df9752b36e7|b0d5abc3-0663-4586-bf8d-25f4b1b8362e/);
});
