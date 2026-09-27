import assert from"node:assert/strict";import test from"node:test";import{readFileSync}from"node:fs";
const sql=readFileSync(new URL("../../supabase/migrations/20260927032500_mcp_internal_marker_execution_adapter.sql",import.meta.url),"utf8");
test("M10 first mutation adapter requires persisted consumed authorization identity",()=>{assert.match(sql,/a\.state<>'consumed'/);assert.match(sql,/a\.consumption_id<>p_consumption_id/);assert.match(sql,/a\.envelope_identity<>p_envelope_identity/);});
test("M10 internal mutation is idempotent and changed replay rejects",()=>{assert.match(sql,/replay_same_result/);assert.match(sql,/marker_value=p_marker_value/);assert.match(sql,/unique \(organization_id,idempotency_key\)/i);});
test("M10 first mutation is reversible and remains internal",()=>{assert.match(sql,/revert_mcp_internal_marker/);assert.doesNotMatch(sql,/http_|net\.|everflow|shopify|commas|provider/i);});
test("M10 mutation RPCs are service-role only",()=>{assert.match(sql,/revoke all on function public\.execute_mcp_internal_marker[\s\S]*authenticated/);assert.match(sql,/grant execute on function public\.revert_mcp_internal_marker[\s\S]*service_role/);});
