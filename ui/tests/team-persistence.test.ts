import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const source = (relative: string) => readFileSync(`${repoRoot}/${relative}`, "utf8");

test("team invitation acceptance is atomic and identity-bound", () => {
  const migration = source("supabase/migrations/064_team_membership_mutations.sql");
  assert.match(migration, /accept_tracekit_team_invitation/);
  assert.match(migration, /security definer/);
  assert.match(migration, /for update/);
  assert.match(migration, /lower\(btrim\(v_user\.primary_email\)\) <> lower\(btrim\(v_invitation\.intended_email\)\)/);
  assert.match(migration, /num_nonnulls\(v_invitation\.target_account_id, v_invitation\.target_organization_id\) <> 1/);
  assert.match(migration, /v_role\.account_type <> v_account_type/);
  assert.match(migration, /membership_exists/);
  assert.match(migration, /set status = 'accepted'/);
});

test("team membership mutation enforces transition and final-owner invariants in the database", () => {
  const migration = source("supabase/migrations/064_team_membership_mutations.sql");
  assert.match(migration, /mutate_tracekit_team_membership/);
  assert.match(migration, /v_membership\.status = 'removed'/);
  assert.match(migration, /v_owner_role_key := case v_scope_account_type/);
  assert.match(migration, /select count\(\*\) into v_owner_count/);
  assert.match(migration, /if v_owner_count <= 1 then\s+raise exception 'final_owner'/);
  assert.match(migration, /account_type = v_scope_account_type/);
});

test("team mutation RPCs are service-role only", () => {
  const migration = source("supabase/migrations/064_team_membership_mutations.sql");
  assert.match(migration, /revoke all on function public\.accept_tracekit_team_invitation\(uuid, uuid\) from public, anon, authenticated/);
  assert.match(migration, /revoke all on function public\.mutate_tracekit_team_membership\(uuid, text, text\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.accept_tracekit_team_invitation\(uuid, uuid\) to service_role/);
  assert.match(migration, /grant execute on function public\.mutate_tracekit_team_membership\(uuid, text, text\) to service_role/);
});

test("Supabase Team repository stays server-side and uses the atomic RPCs", () => {
  const repository = source("ui/lib/identity/supabase-team-repository.ts");
  assert.match(repository, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(repository, /rpc\/accept_tracekit_team_invitation/);
  assert.match(repository, /rpc\/mutate_tracekit_team_membership/);
  assert.match(repository, /tracekit_memberships/);
  assert.match(repository, /tracekit_invitations/);
  assert.match(repository, /tracekit_audit_events/);
  assert.doesNotMatch(repository, /active-organization-cookie|readActiveOrganization|commerce|commas/i);
});
