import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const shell = readFileSync(new URL("../components/identity/authenticated-app-shell.tsx", import.meta.url), "utf8");

test("Platform client list follows active platform entitlement, not selected client membership", () => {
  assert.match(shell, /membershipsForUser\(resolution\.session\.user\.id\)/);
  assert.match(shell, /membership\.status === "active"/);
  assert.match(shell, /!membership\.organizationId/);
  assert.match(shell, /membership\.role === "platform-owner"/);
  assert.match(shell, /membership\.role === "platform-admin"/);
  assert.match(shell, /hasActivePlatformAdmin && !resolution\.legacySession\.adminClientView/);
  assert.doesNotMatch(shell, /resolution\.session\.effectivePermissions\.includes\("admin\.impersonate"\)/);
});
