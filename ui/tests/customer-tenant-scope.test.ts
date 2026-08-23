import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const source = (relative: string) => readFileSync(`${repoRoot}/${relative}`, "utf8");

for (const route of ["ui/app/api/customers/route.ts", "ui/app/api/customers/[...customerPath]/route.ts"]) {
  test(`${route} derives customer workspace from the authenticated organization`, () => {
    const code = source(route);
    assert.match(code, /resolveApplicationSession/);
    assert.match(code, /requirePermission\(resolution\.session, "customers\.view"\)/);
    assert.match(code, /resolution\.session\.activeOrganization\?\.id/);
    assert.match(code, /searchParams\.delete\("workspace_id"\)/);
    assert.match(code, /searchParams\.delete\("workspaceId"\)/);
    assert.match(code, /searchParams\.set\("workspace_id", organizationId\)/);
  });
}
