import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const source = (relative: string) => readFileSync(`${repoRoot}/${relative}`, "utf8");

test("Team page renders the real management workspace instead of a placeholder", () => {
  const page = source("ui/app/(app)/team/page.tsx");
  assert.match(page, /TeamWorkspace/);
  assert.doesNotMatch(page, /ShellPlaceholder/);
});

test("Team workspace uses permission-aware controls and server APIs", () => {
  const workspace = source("ui/components/identity/team-workspace.tsx");
  assert.match(workspace, /AccessBoundary permission="users\.view"/);
  assert.match(workspace, /authorize\(session\.identity, "users\.invite"/);
  assert.match(workspace, /authorize\(session\.identity, "users\.manage_permissions"/);
  assert.match(workspace, /authorize\(session\.identity, "users\.remove"/);
  assert.match(workspace, /fetch\("\/api\/team\/members"/);
  assert.match(workspace, /fetch\("\/api\/team\/invitations"/);
  assert.match(workspace, /\/api\/team\/members\/\$\{member\.membershipId\}/);
  assert.match(workspace, /\/api\/team\/invitations\/\$\{invitation\.id\}\/\$\{action\}/);
});

test("Team workspace never submits authoritative account or organization scope", () => {
  const workspace = source("ui/components/identity/team-workspace.tsx");
  assert.doesNotMatch(workspace, /body:\s*JSON\.stringify\([^\n]*(accountId|organizationId)/);
  assert.doesNotMatch(workspace, /active-organization-cookie|readActiveOrganization/);
});

test("role choices follow the existing account-type role mapping", () => {
  const workspace = source("ui/components/identity/team-workspace.tsx");
  assert.match(workspace, /TEAM_ROLES_BY_ACCOUNT_TYPE\[accountType\]/);
  assert.doesNotMatch(workspace, /platform-owner.*organization-owner.*agency-owner/);
});

test("member and invitation destructive actions remain explicit", () => {
  const workspace = source("ui/components/identity/team-workspace.tsx");
  assert.match(workspace, /window\.confirm/);
  assert.match(workspace, /status: "removed"/);
  assert.match(workspace, /invitationAction\(invitation, "revoke"\)/);
  assert.match(workspace, /invitationAction\(invitation, "resend"\)/);
});
