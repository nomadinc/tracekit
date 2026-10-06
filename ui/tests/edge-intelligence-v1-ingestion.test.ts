import assert from"node:assert/strict";import test from"node:test";import{readFileSync}from"node:fs";
const m=readFileSync(new URL("../../supabase/migrations/20261004204330_edge_intelligence_v1_ingestion.sql",import.meta.url),"utf8");
test("Edge Intelligence v1 receiving boundary is revisioned and tenant scoped",()=>{assert.match(m,/unique\(organization_id,tenant_ref,observation_id,revision\)/);assert.match(m,/pg_advisory_xact_lock/);assert.match(m,/excluded\.revision>public\.edge_intelligence_current\.revision/);});
test("duplicate revisions are idempotent while conflicting same revisions fail closed",()=>{assert.match(m,/'outcome','duplicate'/);assert.match(m,/conflicting edge intelligence revision/);assert.match(m,/payload_hash/);});
test("stale snapshots are retained but cannot regress current projection",()=>{assert.match(m,/v_outcome:='stale'/);assert.match(m,/insert into public\.edge_intelligence_observations/);});
test("Core rejects breaking versions and forbidden routing or private fields",()=>{assert.match(m,/schemaVersion' is distinct from '1\.0'/);for(const field of["routingDecision","rawIp","vaultRef","rawProviderResponse","email","paymentData"])assert.match(m,new RegExp(field));});
test("Core keeps journey association separate and unresolved until deterministic linkage exists",()=>{assert.match(m,/edge_intelligence_journey_links/);assert.match(m,/'unresolved'/);assert.match(m,/sessionRef/);assert.match(m,/eventRef/);});
test("ingestion RPC remains service-role only",()=>{assert.match(m,/revoke all on function public\.ingest_edge_intelligence_v1/);assert.match(m,/grant execute on function public\.ingest_edge_intelligence_v1\(uuid,jsonb\) to service_role/);});

test("Edge Intelligence tenancy uses the canonical TraceKit organization table",()=>{assert.equal((m.match(/references public\.tracekit_organizations\(id\)/g)||[]).length,3);assert.doesNotMatch(m,/references public\.organizations\(id\)/);});
