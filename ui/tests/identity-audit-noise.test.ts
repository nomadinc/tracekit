import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const source = (relative: string) => readFileSync(`${repoRoot}/${relative}`, "utf8");

test("routine session resolution does not emit noisy success audit rows", () => {
  const session = source("ui/lib/identity/application-session.ts");
  assert.doesNotMatch(session, /action:\s*"membership\.resolved"/);
});

test("inactive memberships produce an explicit access-denied audit event", () => {
  const session = source("ui/lib/identity/application-session.ts");
  assert.match(session, /inactiveMembershipsForUser\(user\.id\)/);
  assert.match(session, /action:\s*"user\.access\.denied"/);
  assert.match(session, /reason:\s*"no_active_membership"/);
  assert.match(session, /membership_status:\s*deniedMembership\.status/);
  assert.match(session, /result:\s*"denied"/);
});

test("inactive lookup remains separate from active authorization membership lookup", () => {
  const repository = source("ui/lib/identity/supabase-identity-repository.ts");
  assert.match(repository, /membershipsForUser[\s\S]*status=eq\.active/);
  assert.match(repository, /inactiveMembershipsForUser[\s\S]*status=neq\.active/);
});
