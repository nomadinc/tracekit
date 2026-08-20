import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canBootstrapEmptyInstallation, FIRST_ADMIN_ROLE, normalizeBootstrapName } from "../lib/identity/first-admin-bootstrap";

const route = readFileSync(new URL("../app/api/identity/bootstrap/route.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../supabase/migrations/063_first_admin_bootstrap.sql", import.meta.url), "utf8");
const shell = readFileSync(new URL("../components/identity/authenticated-app-shell.tsx", import.meta.url), "utf8");

test("only a completely empty installation can bootstrap", () => {
  assert.equal(canBootstrapEmptyInstallation({ organizations: 0, accounts: 0, memberships: 0 }), true);
  assert.equal(canBootstrapEmptyInstallation({ organizations: 1, accounts: 0, memberships: 0 }), false);
  assert.equal(canBootstrapEmptyInstallation({ organizations: 0, accounts: 1, memberships: 0 }), false);
  assert.equal(canBootstrapEmptyInstallation({ organizations: 0, accounts: 0, memberships: 1 }), false);
});

test("bootstrap names are bounded and normalized", () => {
  assert.equal(normalizeBootstrapName("  TraceKit  "), "TraceKit");
  assert.equal(normalizeBootstrapName(""), null);
  assert.equal(normalizeBootstrapName("x".repeat(121)), null);
  assert.equal(normalizeBootstrapName(42), null);
});

test("bootstrap derives identity and role server-side", () => {
  assert.match(route, /resolveApplicationSession/);
  assert.match(route, /resolution\.kind !== "bootstrap"/);
  assert.match(route, /resolveAuthenticatedPersistentIdentity/);
  assert.match(route, /identity\.user\.id/);
  assert.match(route, /identity\.externalWorkosUserId/);
  assert.doesNotMatch(route, /body\?\.(userId|roleId|accountId|organizationId)/);
  assert.equal(FIRST_ADMIN_ROLE, "organization-owner");
  assert.match(migration, /role_key = v_role_key/);
  assert.match(migration, /p_user_id/);
});

test("bootstrap is transactional, conflict-safe, and service-role-only", () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /tracekit_organizations\)/);
  assert.match(migration, /tracekit_accounts\)/);
  assert.match(migration, /tracekit_memberships\)/);
  assert.match(migration, /installation\.bootstrap\.completed/);
  assert.match(migration, /revoke all on function/);
  assert.match(migration, /grant execute on function .* to service_role/);
});

test("bootstrap creates exactly one account, organization, membership, and audit event", () => {
  assert.equal((migration.match(/insert into public\.tracekit_accounts/g) || []).length, 1);
  assert.equal((migration.match(/insert into public\.tracekit_organizations/g) || []).length, 1);
  assert.equal((migration.match(/insert into public\.tracekit_memberships/g) || []).length, 1);
  assert.equal((migration.match(/insert into public\.tracekit_audit_events/g) || []).length, 1);
  assert.match(migration, /returning id into v_account_id/);
  assert.match(migration, /returning id into v_organization_id/);
  assert.match(migration, /returning id into v_membership_id/);
});

test("second bootstrap and every partially initialized state are rejected", () => {
  assert.match(migration, /exists \(select 1 from public\.tracekit_organizations\)/);
  assert.match(migration, /exists \(select 1 from public\.tracekit_accounts\)/);
  assert.match(migration, /exists \(select 1 from public\.tracekit_memberships\)/);
  assert.match(migration, /TraceKit installation is already initialized/);
});

test("the authenticated user receives the existing owner role", () => {
  assert.match(migration, /where role_key = v_role_key and account_type = 'client'/);
  assert.match(migration, /values \(p_user_id, v_organization_id, v_role_id, 'active'\)/);
  assert.match(migration, /'organization-owner'/);
});

test("empty installations render setup while existing no-membership remains distinct", () => {
  assert.match(shell, /resolution\.kind === "bootstrap"/);
  assert.match(shell, /resolution\.kind === "no-membership"/);
});
