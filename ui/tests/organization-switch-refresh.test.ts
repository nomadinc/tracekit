import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const source = (relative: string) => readFileSync(`${repoRoot}/${relative}`, "utf8");

test("persistent organization switch reloads the server-derived session", () => {
  const provider = source("ui/components/identity/identity-provider.tsx");
  assert.match(provider, /fetch\("\/api\/session\/organization"/);
  assert.match(provider, /window\.location\.reload\(\)/);
  assert.match(provider, /setSession\(initialSession\)/);
  assert.doesNotMatch(provider, /router\.refresh\(\)/);
});

test("organization switch endpoint authorizes before sealing cookie", () => {
  const route = source("ui/app/api/session/organization/route.ts");
  assert.match(route, /authorizeOrganizationSwitch/);
  assert.match(route, /sealActiveOrganization/);
  assert.match(route, /ACTIVE_ORGANIZATION_COOKIE/);
});
