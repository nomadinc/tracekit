import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const source = (relative: string) => readFileSync(`${repoRoot}/${relative}`, "utf8");
const route = (relative: string) => `${repoRoot}/ui/app/${relative}`;

test("capability manifest records established and planned capabilities", () => {
  const manifest = source("docs/tracekit-capability-manifest.md");
  for (const capability of [
    "WorkOS authentication", "persistent TraceKit users", "account/organization tenancy",
    "membership/RBAC foundation", "first-admin bootstrap", "Dashboard", "Connections",
    "Commerce Connections", "Journeys", "Customers / People", "Money / Profit",
    "Financial Reconciliation", "Financial Import Monitor", "Commas connection UI",
    "Commas credential encryption", "bounded Commas validator", "Evidence ingestion",
    "canonical orders", "order lines", "refunds", "provider products", "commerce ledger events",
    "continuous-shadow runtime", "continuous-commerce", "TKID", "Evidence", "identity resolution",
    "reconciliation", "Team Management", "29Next",
  ]) assert.match(manifest, new RegExp(capability.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), capability);
  assert.match(manifest, /Planned \/ rebuild-required:\*\* Team Management/);
  assert.match(manifest, /Not implemented:\*\* 29Next/);
});

test("critical UI routes and auth/session entrypoints remain present and non-placeholder", () => {
  const routes = [
    "page.tsx", "(app)/connections/page.tsx", "(app)/connections/commerce/page.tsx",
    "(app)/journeys/page.tsx", "(app)/customers/page.tsx", "(app)/money/page.tsx",
    "(app)/dashboard/page.tsx", "(app)/dashboard/financial-reconciliation/page.tsx",
    "(app)/dashboard/financial-import-monitor/page.tsx", "auth/callback/route.ts",
  ];
  const nonPlaceholderRoutes = new Set(routes.filter((relative) => relative !== "(app)/money/page.tsx"));
  for (const relative of routes) {
    const path = route(relative);
    assert.equal(existsSync(path), true, relative);
    if (nonPlaceholderRoutes.has(relative)) assert.doesNotMatch(readFileSync(path, "utf8"), /ShellPlaceholder|Coming soon|not implemented/i, relative);
  }
  assert.match(source("ui/components/identity/authenticated-app-shell.tsx"), /resolveApplicationSession/);
  assert.match(source("ui/lib/identity/application-session.ts"), /membershipsForUser/);
});

test("commerce API and runtime entrypoints remain present", () => {
  assert.match(source("ui/app/api/commerce/[...commercePath]/route.ts"), /resolveApplicationSession/);
  assert.match(source("ui/components/connections/integration-experience.tsx"), /api\/commerce\/connections/);
  assert.match(source("ui/scripts/run-commas-bounded-validation.ts"), /HARD_TRANSACTION_MAX/);
  assert.match(source("api/src/index.ts"), /runCommerceCron/);
  assert.match(source("api/src/index.ts"), /continuous_commerce/);
  assert.equal(existsSync(`${repoRoot}/api/continuous-runtime/src/index.ts`), true);
  assert.equal(existsSync(`${repoRoot}/api/continuous-runtime/wrangler.toml`), true);
});

test("migration sequence is monotonic, includes 063, and has no duplicate numbers", () => {
  const files = readdirSync(`${repoRoot}/supabase/migrations`).filter((name) => /^\d+_.+\.sql$/.test(name));
  const versions = files.map((name) => Number(name.match(/^\d+/)?.[0]));
  assert.equal(versions.includes(63), true, "migration 063 must remain represented");
  assert.equal(new Set(versions).size, versions.length, "duplicate migration numbers are forbidden");
  assert.deepEqual([...versions].sort((a, b) => a - b), versions, "migration numbering must not go backwards");
  assert.equal(files.filter((name) => name.startsWith("063_")).length, 1);
});
