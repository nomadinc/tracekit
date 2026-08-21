import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const source = (relative: string) => readFileSync(`${repoRoot}/${relative}`, "utf8");

test("WorkOS invitation client uses server API key and the supported invitation lifecycle endpoints", () => {
  const client = source("ui/lib/identity/workos-invitations.ts");
  assert.match(client, /WORKOS_API_KEY/);
  assert.match(client, /\/user_management\/invitations/);
  assert.match(client, /\/resend/);
  assert.match(client, /\/revoke/);
  assert.match(client, /accepted_user_id/);
  assert.doesNotMatch(client, /role_slug/);
});

test("invitation creation persists WorkOS delivery and revokes local state when delivery fails", () => {
  const route = source("ui/app/api/team/invitations/route.ts");
  assert.match(route, /createWorkOSInvitation/);
  assert.match(route, /workosOrganizationIdForScope/);
  assert.match(route, /setInvitationDelivery/);
  assert.match(route, /repository\.revokeInvitation\(localInvitationId\)/);
  assert.match(route, /revokeWorkOSInvitation/);
  assert.match(route, /team\.invitation\.delivery_failed/);
});

test("revoke blocks TraceKit access before WorkOS delivery cleanup", () => {
  const route = source("ui/app/api/team/invitations/[id]/revoke/route.ts");
  assert.ok(route.indexOf("await repository.revokeInvitation(id)") < route.indexOf("await revokeWorkOSInvitation"));
  assert.match(route, /revoked_delivery_cleanup_failed/);
});

test("resend preserves terminal expiry by creating a replacement invitation", () => {
  const route = source("ui/app/api/team/invitations/[id]/resend/route.ts");
  assert.match(route, /resendWorkOSInvitation/);
  assert.match(route, /markInvitationExpired/);
  assert.match(route, /createInvitation/);
  assert.match(route, /replacement: true/);
  assert.doesNotMatch(route, /status:\s*["']pending["']/);
});

test("auth callback reconciles accepted WorkOS delivery IDs into TraceKit memberships", () => {
  const callback = source("ui/app/auth/callback/route.ts");
  const reconciliation = source("ui/lib/identity/workos-invitation-reconciliation.ts");
  assert.match(callback, /reconcileAcceptedWorkOSInvitations/);
  assert.match(reconciliation, /state === "accepted"/);
  assert.match(reconciliation, /acceptedUserId === input\.workosUserId/);
  assert.match(reconciliation, /invitationByWorkOSId/);
  assert.match(reconciliation, /repository\.acceptInvitation/);
});

test("TraceKit remains authorization authority after WorkOS delivery", () => {
  const reconciliation = source("ui/lib/identity/workos-invitation-reconciliation.ts");
  const migration = source("supabase/migrations/065_team_membership_mutations.sql");
  assert.match(reconciliation, /repository\.acceptInvitation/);
  assert.match(migration, /lower\(btrim\(v_user\.primary_email\)\) <> lower\(btrim\(v_invitation\.intended_email\)\)/);
  assert.match(migration, /v_role\.account_type <> v_account_type/);
});
