import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync,readdirSync } from "node:fs";

const root=new URL("../../",import.meta.url);
const route=readFileSync(new URL("ui/app/api/tkid/sources/[...sourcePath]/route.ts",root),"utf8");
const migration=readFileSync(new URL("supabase/migrations/20260926060810_tkid_bounded_proof_enforcement_v1.sql",root),"utf8");

test("source stop/start is organization scoped, explicitly confirmed, and audited",()=>{
  assert.match(route,/requireTkidOriginManagement/);
  assert.match(route,/organization_id=eq\./);
  assert.match(route,/set-tkid-source-ingestion-state/);
  assert.match(migration,/tkid\.source_ingestion_started/);
  assert.match(migration,/tkid\.source_ingestion_stopped/);
  assert.match(migration,/tracekit_audit_events/);
});

test("proof status is service-role operator state and its read path performs no mutation",()=>{
  const get=route.slice(route.indexOf("export async function GET"),route.indexOf("export async function POST"));
  assert.match(get,/get_tkid_bounded_proof_status_v1/);
  assert.doesNotMatch(get,/set_tkid_source_ingestion_state_v1|method:"PATCH"|method:"DELETE"/);
  assert.match(migration,/grant execute on function public\.get_tkid_bounded_proof_status_v1[\s\S]*to service_role/);
  assert.match(migration,/revoke all on function public\.get_tkid_bounded_proof_status_v1[\s\S]*from public,anon,authenticated,authenticator/);
});

test("migration is generic and the only new Stage-1 identity",()=>{
  for(const forbidden of ["buyecowatt","ecowatt","b784b15c","b0d5abc3","push-button-system"])assert.doesNotMatch(migration,new RegExp(forbidden,"i"));
  const files=readdirSync(new URL("supabase/migrations/",root)).filter(name=>name.includes("tkid_bounded_proof_enforcement"));
  assert.deepEqual(files,["20260926060810_tkid_bounded_proof_enforcement_v1.sql"]);
});

test("status reports claims, accepted persistence, bounded rejection counts and terminal state",()=>{
  for(const token of ["claimed_journeys","accepted_events","reserved_events","rejected_counts","terminal_reason","last_observation"])assert.match(migration,new RegExp(token));
});
