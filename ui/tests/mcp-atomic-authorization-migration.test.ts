import assert from"node:assert/strict";import test from"node:test";import{readFileSync}from"node:fs";
const sql=readFileSync(new URL("../../supabase/migrations/20260926231339_mcp_action_authorization_atomic_consumption.sql",import.meta.url),"utf8");
test("M10 atomic consumption locks authorization row before state transition",()=>{assert.match(sql,/for update/i);assert.match(sql,/state='available'/);assert.match(sql,/replay_same_result/);});
test("M10 authorization persistence is service-role only",()=>{assert.match(sql,/enable row level security/i);assert.match(sql,/revoke all on table public\.mcp_action_authorizations from anon, authenticated/i);assert.match(sql,/grant execute on function[\s\S]*service_role/i);});
test("M10 persistence contains no provider execution",()=>{assert.doesNotMatch(sql,/http_|net\.|provider_write|execute_action/i);});
