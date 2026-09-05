import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const source = (relative: string) => readFileSync(`${repoRoot}/${relative}`, "utf8");
const route = (relative: string) => {
  const base = `${repoRoot}/ui/app/${relative}`;
  if (existsSync(base)) return base;
  if (existsSync(base.replace(/\.tsx$/, ".ts"))) return base.replace(/\.tsx$/, ".ts");
  if (existsSync(base.replace(/\.ts$/, ".tsx"))) return base.replace(/\.ts$/, ".tsx");
  return base;
};

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
    "reconciliation", "Team Management", "29Next connection UI", "29Next encrypted credential storage",
  ]) assert.match(manifest, new RegExp(capability.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), capability);
  assert.match(manifest, /Planned \/ rebuild-required:\*\* Team Management/);
  assert.match(manifest, /Implemented:\*\* 29Next/);
});

test("29Next connection UI remains available and read-only activation stays gated", () => {
  const catalog = source("ui/lib/commerce/integration-experience.ts");
  const overview = source("ui/components/connections/connections-overview.tsx");
  const verifier = source("ui/lib/commerce/next29-verifier.ts");
  const providerVerifier = source("ui/lib/commerce/provider-verifier.ts");
  const connectRoute = source("ui/app/api/next29/connect/route.ts");
  const detail = source("ui/components/connections/next29-connection-detail.tsx");

  assert.match(catalog, /provider: "next29", name: "29Next", availability: "available"/);
  assert.match(overview, /type ConnectProvider = "commas" \| "everflow" \| "shopify" \| "next29"/);
  assert.match(overview, /\/api\/next29\/connect/);
  assert.match(overview, /Scheduled sync or live webhook registration|scheduled sync or register a live webhook/i);
  assert.match(verifier, /orders\//);
  assert.match(verifier, /subscriptions\//);
  assert.match(verifier, /disputes\//);
  assert.match(verifier, /X-29Next-Api-Version/);
  assert.match(providerVerifier, /input\.provider === "next29"/);
  assert.match(connectRoute, /provider: "next29"/);
  assert.match(connectRoute, /environment: "production"/);
  assert.match(detail, /Scheduled sync", "Disabled"/);
  assert.match(detail, /live webhook registration and automatic production execution remain disabled/i);
});

test("UI convergence remains deferred and Legacy Dashboard is explicitly transitional", () => {
  const requirement = source("docs/tracekit-ui-convergence-requirement.md");
  const baseline = source("docs/recovery-baseline-2026-08-20.md");
  assert.match(requirement, /TRACEKIT UI CONVERGENCE: DEFERRED — REQUIRED BEFORE LAUNCH/);
  assert.match(requirement, /Legacy Dashboard[\s\S]*temporary scaffolding/);
  assert.match(requirement, /one[\s\S]*canonical TraceKit application[\s\S]*shell/);
  assert.match(requirement, /capability regression gate must pass before[\s\S]*merge/);
  assert.match(baseline, /tracekit-ui-convergence-requirement\.md/);
});

test("critical UI routes and auth/session entrypoints remain present and non-placeholder", () => {
  const routes = [
    "page.tsx", "(app)/connections/page.tsx", "(app)/connections/commerce/page.tsx",
    "(app)/journeys/page.tsx", "(app)/customers/page.tsx", "(app)/money/page.tsx",
    "(app)/dashboard/page.tsx", "(app)/dashboard/financial-reconciliation/page.tsx",
    "(app)/dashboard/financial-import-monitor/page.tsx", "(app)/dashboard/chargebacks/page.tsx", "auth/callback/route.tsx",
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
  assert.equal(existsSync(`${repoRoot}/ui/app/api/chargebacks/route.ts`), true);
  assert.match(source("ui/components/chargebacks/chargeback-review-workspace.tsx"), /Needs Review/);
  assert.match(source("ui/components/chargebacks/chargeback-review-workspace.tsx"), /FinancialIssueAnalysisClient/);
  assert.match(source("ui/app/(app)/dashboard/financial-issue-analysis-client.tsx"), /\/v1\/chargebacks\/analysis/);
});

test("migration sequence is monotonic, includes 063/064, and has no duplicate numbers", () => {
  const files = readdirSync(`${repoRoot}/supabase/migrations`).filter((name) => /^\d+_.+\.sql$/.test(name));
  const versions = files.map((name) => Number(name.match(/^\d+/)?.[0]));
  assert.equal(versions.includes(63), true, "migration 063 must remain represented");
  assert.equal(versions.includes(64), true, "migration 064 must remain represented");
  assert.equal(new Set(versions).size, versions.length, "duplicate migration numbers are forbidden");
  assert.deepEqual([...versions].sort((a, b) => a - b), versions, "migration numbering must not go backwards");
  assert.equal(files.filter((name) => name.startsWith("063_")).length, 1);
  assert.equal(files.filter((name) => name.startsWith("064_")).length, 1);
});
