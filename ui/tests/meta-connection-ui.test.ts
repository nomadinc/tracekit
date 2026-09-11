import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const panel = readFileSync(`${root}/components/integrations/meta-integration-panel.tsx`, "utf8");
const page = readFileSync(`${root}/app/(app)/settings/integrations/meta/page.tsx`, "utf8");
const hub = readFileSync(`${root}/app/(app)/settings/integrations/page.tsx`, "utf8");

test("integrations hub exposes a dedicated Meta Ads advertising entry", () => {
  assert.match(hub, /title="Advertising"/);
  assert.match(hub, /name:\s*"Meta Ads"/);
  assert.match(hub, /href:\s*"\/settings\/integrations\/meta"/);
  assert.match(page, /MetaIntegrationPanel/);
});

test("Meta UI starts OAuth through the bounded server route and explains read-only scope", () => {
  assert.match(panel, /href="\/v1\/integrations\/meta\/oauth\/start"/);
  assert.match(panel, /Connect Meta/);
  assert.match(panel, /Read-only access only/);
  assert.match(panel, /does not create or edit campaigns, ads, budgets, targeting, Pixels, or CAPI/);
});

test("Meta UI preserves multiple connections and account selections independently", () => {
  assert.match(panel, /connections\.map\(\(connection\)/);
  assert.match(panel, /selected:\s*Record<string, Set<string>>/);
  assert.match(panel, /connection\.accounts\.map/);
  assert.match(panel, /Select all available accounts/);
  assert.match(panel, /accountIds:\s*Array\.from\(selected\[connection\.connectionId\]/);
});

test("Meta account rows expose durable account identity and operational context", () => {
  assert.match(panel, /ID: \{account\.externalId\}/);
  assert.match(panel, /Currency: \{account\.currency/);
  assert.match(panel, /Timezone: \{account\.timezoneName/);
  assert.match(panel, /\{account\.status\}/);
});

test("saving account selection explicitly does not activate sync", () => {
  assert.match(panel, /Sync:<\/span> Off/);
  assert.match(panel, /Account selection does not start syncing yet/);
  assert.match(panel, /No schedules are activated here/);
  assert.match(panel, /schedulesActivated\?: boolean/);
  assert.doesNotMatch(panel, /run-now|scheduler|insights\/sync|hierarchy\/sync/);
});
