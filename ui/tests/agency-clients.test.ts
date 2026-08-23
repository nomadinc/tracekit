import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const source = (relative: string) => readFileSync(`${repoRoot}/${relative}`, "utf8");

test("agency clients are derived from authenticated agency session scope", () => {
  const route = source("ui/app/api/agency/clients/route.ts");
  const model = source("ui/lib/identity/agency-clients.ts");
  assert.match(route, /resolveApplicationSession/);
  assert.match(route, /agencyClientsFromSession\(resolution\.session\)/);
  assert.doesNotMatch(route, /searchParams|agencyId|organizationId/);
  assert.match(model, /activeAccount\.accountType !== "agency"/);
  assert.match(model, /session\.availableOrganizations/);
});

test("agency clients workspace replaces placeholder and states administration boundary", () => {
  const page = source("ui/app/(app)/clients/page.tsx");
  const workspace = source("ui/components/identity/agency-clients-workspace.tsx");
  assert.match(page, /AgencyClientsWorkspace/);
  assert.doesNotMatch(page, /ShellPlaceholder/);
  assert.match(workspace, /does not create a Client Organization membership/);
  assert.match(workspace, /AccessBoundary permission="organizations\.view" variants=\{\["agency"\]\}/);
});
