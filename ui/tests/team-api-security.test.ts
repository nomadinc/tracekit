import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const source = (relative: string) => readFileSync(`${repoRoot}/${relative}`, "utf8");

test("Team API scope is server-derived and never authorizes from the organization cookie directly", () => {
  const api = source("ui/lib/identity/team-api.ts");
  assert.match(api, /session\.activeAccount\.accountType === "client"/);
  assert.match(api, /session\.activeOrganization\.id/);
  assert.match(api, /session\.activeAccount\.id/);
  assert.doesNotMatch(api, /cookies\(|ACTIVE_ORGANIZATION_COOKIE|readActiveOrganization/);
});

test("member listing requires the persistent application session and users.view", () => {
  const route = source("ui/app/api/team/members/route.ts");
  assert.match(route, /resolveApplicationSession/);
  assert.match(route, /requireTeamPermission\(resolution\.session, "users\.view"\)/);
  assert.match(route, /repository\.listMembers\(scope\)/);
});

test("invitation creation accepts email and role but no browser tenancy identifiers", () => {
  const route = source("ui/app/api/team/invitations/route.ts");
  assert.match(route, /\{ email\?: unknown; role\?: unknown \}/);
  assert.doesNotMatch(route, /accountId\?: unknown|organizationId\?: unknown/);
  assert.match(route, /teamScopeFromSession\(resolution\.session\)/);
  assert.match(route, /requirePermission\(resolution\.session, "users\.invite"\)/);
  assert.match(route, /INVITATION_TTL_MS/);
  assert.match(route, /team\.invitation\.create_denied/);
});

test("membership mutation revalidates target scope before the atomic RPC", () => {
  const route = source("ui/app/api/team/members/[id]/route.ts");
  const scopeCheck = route.indexOf("membershipMatchesScope(member, scope)");
  const mutation = route.indexOf("repository.updateMembership");
  assert.ok(scopeCheck >= 0 && mutation > scopeCheck);
  assert.match(route, /requirePermission\(resolution\.session, permissionEvaluated\)/);
  assert.match(route, /assertOwnerMutationAllowed/);
  assert.doesNotMatch(route, /accountId\?: unknown|organizationId\?: unknown/);
});

test("invitation revoke revalidates the persisted invitation against server-derived scope", () => {
  const route = source("ui/app/api/team/invitations/[id]/revoke/route.ts");
  assert.match(route, /teamScopeFromSession\(resolution\.session\)/);
  assert.match(route, /requirePermission\(resolution\.session, "users\.invite"\)/);
  assert.match(route, /invitationMatchesScope\(invitation, scope\)/);
  assert.match(route, /team\.invitation\.revoke_denied/);
});

test("invitation acceptance is identity-bound and does not require an existing membership", () => {
  const route = source("ui/app/api/team/invitations/accept/route.ts");
  assert.match(route, /resolveAuthenticatedPersistentIdentity/);
  assert.doesNotMatch(route, /resolveApplicationSession/);
  assert.match(route, /assertInvitationIdentity\(invitation\.intendedEmail, identity\.user\.primaryEmail\)/);
  assert.match(route, /repository\.acceptInvitation/);
  assert.doesNotMatch(route, /accountId\?: unknown|organizationId\?: unknown|role\?: unknown/);
});
