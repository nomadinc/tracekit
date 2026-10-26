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

test("WS-030 Edge routes deny without protected I/O or session resolution", () => {
  for (const [path, methods] of excluded) {
    const source = read(path);
    for (const method of methods) assert.match(source, new RegExp(`export async function ${method}\\(\\) \\{ return excluded\\(\\); \\}`));
    assert.match(source, /status: 404/);
    assert.doesNotMatch(source, /fetch\\(|process\\.env|resolveApplicationSession|SUPABASE_SERVICE_ROLE_KEY|ingest_edge_intelligence_v1|\\.send\\(/);
  }
});

test("WS-030 middleware denies all excluded paths before environment access", () => {
  const source = read("middleware.ts");
  const exclusion = source.indexOf("WS-030: fixed denial");
  const environment = source.indexOf("process.env");
  assert.ok(exclusion >= 0 && exclusion < environment);
  for (const name of ["edge/intelligence-v1", "admin/edge-tenant-bindings", "internal/edge-intelligence-v1-staging-proof"]) assert.ok(source.includes(name));
  assert.doesNotMatch(source.slice(source.indexOf("unauthenticatedPaths:"), source.indexOf("],", source.indexOf("unauthenticatedPaths:"))), /"\\/api\\/edge\\/intelligence-v1"/);
});

test("WS-030 migration excludes runtime RPC and six table writes without deleting evidence", () => {
  const source = read("../supabase/migrations/20261025000000_ws030_edge_intelligence_release10_exclusion.sql");
  assert.match(source, /REVOKE ALL ON FUNCTION public\\.ingest_edge_intelligence_v1/);
  for (const name of ["current","ingest_credentials","journey_links","observations","service_credentials","tenant_bindings"]) assert.ok(source.includes(`public.edge_intelligence_${name}`));
  assert.match(source, /FROM PUBLIC, anon, authenticated, authenticator, service_role/);
  assert.doesNotMatch(source, /\\bDROP\\b|\\bTRUNCATE\\s+TABLE\\b/i);
});
