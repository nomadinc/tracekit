import assert from"node:assert/strict";import test from"node:test";import{readFileSync}from"node:fs";
const sql=readFileSync(new URL("../../supabase/migrations/20260927175604_mcp_external_action_audit.sql",import.meta.url),"utf8");
const route=readFileSync(new URL("../app/api/actions/commas/webhook-test-delivery/route.ts",import.meta.url),"utf8");
test("M11 external execution audit is durable service-role-only evidence",()=>{assert.match(sql,/mcp_external_action_audit/);assert.match(sql,/enable row level security/);assert.match(sql,/revoke all on table[\s\S]*authenticated/);assert.match(sql,/grant execute[\s\S]*service_role/);});
test("M11 audit is idempotent by request identity",()=>{assert.match(sql,/request_id uuid not null unique/);assert.match(sql,/on conflict\(request_id\) do nothing/);});
test("M11 non-mutating audit refuses configuration mutation evidence",()=>{assert.match(sql,/if p_provider_configuration_mutation then raise exception/);});
test("M11 live route persists audit before returning success",()=>{const rpc=route.indexOf("record_mcp_external_action_audit"),ret=route.indexOf("return res(id,{ok:result.status");assert.ok(rpc>0&&ret>rpc);assert.match(route,/executionId/);});
