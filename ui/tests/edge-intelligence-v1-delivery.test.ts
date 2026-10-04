import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const route=readFileSync(new URL("../app/api/edge/intelligence-v1/route.ts",import.meta.url),"utf8");
const migration=readFileSync(new URL("../../supabase/migrations/20261004040000_edge_intelligence_v1_delivery_credentials.sql",import.meta.url),"utf8");

test("Edge delivery credentials store hashes only and are organization/tenant scoped",()=>{
  assert.match(migration,/organization_id uuid not null references public\.tracekit_organizations/);
  assert.match(migration,/tenant_ref text not null/);
  assert.match(migration,/token_hash text not null unique/);
  assert.doesNotMatch(migration,/raw_token|bearer_token|secret text/i);
  assert.match(migration,/enable row level security/);
  assert.match(migration,/grant select,insert,update,delete .* service_role/);
});

test("delivery derives tenancy from authenticated credential and validates contract",()=>{
  assert.match(route,/hashToken\(token\)/);
  assert.match(route,/status=eq\.active/);
  assert.match(route,/validateEdgeIntelligenceV1\(payload,\{tenantRef:credential\.tenant_ref\}\)/);
  assert.match(route,/p_organization_id:credential\.organization_id/);
  assert.doesNotMatch(route,/p_organization_id:payload/);
});

test("delivery does not expose persistence errors or raw credentials",()=>{
  assert.match(route,/code:"unauthorized"/);
  assert.match(route,/code:"delivery_unavailable"/);
  assert.match(route,/console\.error\("edge_intelligence_v1_delivery_failed"/);
  assert.doesNotMatch(route,/console\.log\(token|token_hash.*response/i);
});
