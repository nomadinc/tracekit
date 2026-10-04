import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const route=readFileSync(new URL("../app/api/edge/intelligence-v1/route.ts",import.meta.url),"utf8");
const migration=readFileSync(new URL("../../supabase/migrations/20261004183000_edge_intelligence_multitenant_delivery.sql",import.meta.url),"utf8");

test("Edge service authentication is independent from organization ownership",()=>{
  assert.match(migration,/edge_intelligence_service_credentials/);
  assert.match(migration,/edge_intelligence_tenant_bindings/);
  assert.doesNotMatch(migration,/edge_intelligence_service_credentials[\s\S]{0,300}organization_id/);
  assert.match(route,/edge_intelligence_service_credentials\?token_hash/);
  assert.match(route,/edge_intelligence_tenant_bindings\?tenant_ref/);
});

test("organization id is derived only from active tenant binding",()=>{
  assert.match(route,/status=eq\.active&select=tenant_ref,organization_id/);
  assert.match(route,/p_organization_id:binding\.organization_id/);
  assert.doesNotMatch(route,/p_organization_id:validation\.value/);
  assert.doesNotMatch(route,/p_organization_id:payload/);
  assert.match(route,/code:"tenant_unbound"/);
});

test("unknown tenant fails closed after valid service authentication",()=>{
  const serviceLookup=route.indexOf("edge_intelligence_service_credentials?");
  const tenantLookup=route.indexOf("edge_intelligence_tenant_bindings?");
  const ingest=route.indexOf("rpc/ingest_edge_intelligence_v1");
  assert.ok(serviceLookup>=0&&tenantLookup>serviceLookup&&ingest>tenantLookup);
});
