import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const source = (relative: string) => readFileSync(`${repoRoot}/${relative}`, "utf8");

test("tenant audit history derives scope from the authenticated session", () => {
  const route = source("ui/app/api/audit-events/route.ts");
  const scope = source("ui/lib/identity/audit-history.ts");
  assert.match(route, /resolveApplicationSession/);
  assert.match(route, /auditHistoryScope\(resolution\.session\)/);
  assert.doesNotMatch(route, /searchParams|get\(["']organizationId/);
  assert.match(scope, /audit_logs\.view/);
  assert.match(scope, /session\.activeOrganization\.id/);
});

test("audit history UI is permission gated and uses the server API", () => {
  const workspace = source("ui/components/identity/audit-history.tsx");
  assert.match(workspace, /AccessBoundary permission="audit_logs\.view"/);
  assert.match(workspace, /fetch\("\/api\/audit-events"/);
  assert.match(workspace, /Activity & Login History/);
  assert.match(workspace, /authentication\.sign_in\.succeeded/);
  assert.match(workspace, /user\.access\.denied/);
});

test("tenant navigation exposes Activity only through audit permission", () => {
  const navigation = source("ui/lib/identity/navigation-policy.ts");
  assert.match(navigation, /label: "Activity", href: "\/activity", permission: "audit_logs\.view"/);
});

test("audit history reader never accepts browser-provided tenant scope", () => {
  const repository = source("ui/lib/identity/supabase-audit-repository.ts");
  assert.match(repository, /organization_id=eq\.\$\{encodeURIComponent\(organizationId\)\}/);
  assert.match(repository, /account_id=eq\.\$\{encodeURIComponent\(accountId\)\}/);
});

test("activity feed suppresses routine membership resolution noise", () => {
  const repository = source("ui/lib/identity/supabase-audit-repository.ts");
  assert.match(repository, /action=neq\.membership\.resolved/);
});

test("successful login is audited after invitation reconciliation with tenant scope", () => {
  const callback = source("ui/app/auth/callback/route.ts");
  const audit = source("ui/lib/identity/authentication-audit.ts");
  const reconcileIndex = callback.indexOf("await reconcileAcceptedWorkOSInvitations");
  const auditIndex = callback.indexOf("await recordScopedAuthenticationSuccess");
  assert.ok(reconcileIndex >= 0);
  assert.ok(auditIndex > reconcileIndex);
  assert.match(audit, /membershipsForUser/);
  assert.match(audit, /organizationsForMembership/);
  assert.match(audit, /authentication\.sign_in\.succeeded/);
  assert.match(audit, /accountId/);
  assert.match(audit, /organizationId/);
});
