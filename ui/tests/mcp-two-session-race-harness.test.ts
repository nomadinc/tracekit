import assert from"node:assert/strict";import test from"node:test";import{readFileSync}from"node:fs";
const h=readFileSync(new URL("../../supabase/tests/manual/mcp_action_authorization_two_session_race.sql",import.meta.url),"utf8");
test("M10 race harness requires distinct sessions and overlapping lock window",()=>{assert.match(h,/SESSION A/);assert.match(h,/SESSION B/);assert.match(h,/pg_sleep\(5\)/);assert.match(h,/start while session A is sleeping/i);});
test("M10 race acceptance checks persisted invariant and cleans controlled row",()=>{assert.match(h,/mcp_action_authorization_consumption_invariant/);assert.match(h,/replay_same_result/i);assert.match(h,/delete from public\.mcp_action_authorizations/);});
test("M10 race harness contains no provider mutation",()=>{assert.doesNotMatch(h,/providerWrite|executeAction|http_|net\./i);});
