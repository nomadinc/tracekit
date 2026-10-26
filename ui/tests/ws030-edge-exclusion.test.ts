import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const excluded = [
  ["app/api/edge/intelligence-v1/route.ts", ["POST"]],
  ["app/api/admin/edge-tenant-bindings/route.ts", ["GET", "POST"]],
  ["app/api/internal/edge-intelligence-v1-staging-proof/route.ts", ["POST"]],
] as const;

test("WS-030 excluded handlers are unconditional and have no protected I/O dependencies", () => {
  for (const [path, methods] of excluded) {
    const source = read(path);
    for (const method of methods) {
      assert.ok(source.includes(`export async function ${method}() { return excluded(); }`), `${path}: ${method}`);
    }
    assert.match(source, /status: 404/);
    for (const forbidden of ["fetch(", "process.env", "resolveApplicationSession", "SUPABASE_SERVICE_ROLE_KEY", "ingest_edge_intelligence_v1", ".send("]) {
      assert.ok(!source.includes(forbidden), `${path}: forbidden ${forbidden}`);
    }
  }
});

test("WS-030 middleware excludes Edge before environment access and preserves Core exemptions", () => {
  const source = read("middleware.ts");
  const exclusion = source.indexOf("WS-030: fixed denial");
  const environment = source.indexOf("process.env");
  assert.ok(exclusion >= 0 && exclusion < environment);
  for (const name of ["edge/intelligence-v1", "admin/edge-tenant-bindings", "internal/edge-intelligence-v1-staging-proof"]) assert.ok(source.includes(name));
  const exemptions = source.slice(source.indexOf("unauthenticatedPaths:"), source.indexOf("],", source.indexOf("unauthenticatedPaths:")));
  assert.ok(!exemptions.includes('"/api/edge/intelligence-v1"'));
  for (const core of ["/api/cron/:path*", "/api/webhooks/shopify", "/api/next29/webhook/:path*", "/api/mcp"]) assert.ok(exemptions.includes(core));
});

test("WS-030 migration includes effective privilege checks and preserves historical rows", () => {
  const source = read("../supabase/migrations/20261025000000_ws030_edge_intelligence_release10_exclusion.sql");
  assert.ok(source.includes("REVOKE ALL ON FUNCTION public.ingest_edge_intelligence_v1"));
  for (const name of ["current", "ingest_credentials", "journey_links", "observations", "service_credentials", "tenant_bindings"]) assert.ok(source.includes(`public.edge_intelligence_${name}`));
  assert.ok(source.includes("service_role"));
  assert.ok(source.includes("has_function_privilege"));
  assert.ok(source.includes("CREATE OR REPLACE FUNCTION public.ingest_edge_intelligence_v1"));
  assert.ok(source.includes("Edge Intelligence ingestion excluded from Core Release 1.0"));
  assert.ok(source.includes("has_table_privilege"));
  assert.ok(!/\bDROP\s+(?:TABLE|FUNCTION)\b/i.test(source));
});
