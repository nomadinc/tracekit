import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const routeRoot = new URL("../app/(app)/", import.meta.url);
const shell = readFileSync(new URL("../components/identity/authenticated-app-shell.tsx", import.meta.url), "utf8");
const session = readFileSync(new URL("../lib/identity/application-session.ts", import.meta.url), "utf8");

const routes = [
  "dashboard/page.tsx",
  "connections/page.tsx",
  "connections/commerce/page.tsx",
  "journeys/page.tsx",
  "customers/page.tsx",
  "money/page.tsx",
  "dashboard/financial-reconciliation/page.tsx",
];

test("recovery baseline keeps the critical application routes", () => {
  for (const route of routes) assert.equal(existsSync(new URL(route, routeRoot)), true, route);
});

test("recovery baseline keeps authenticated shell and membership resolution", () => {
  assert.match(shell, /resolveApplicationSession/);
  assert.match(shell, /AuthenticatedAppShell/);
  assert.match(session, /membershipsForUser\(user\.id\)/);
  assert.match(session, /selectSessionMembership/);
  assert.match(session, /resolveUnaffiliatedSessionState/);
});
