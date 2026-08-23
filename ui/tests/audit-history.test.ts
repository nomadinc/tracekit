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
