import assert from"node:assert/strict";import test from"node:test";import{readFileSync}from"node:fs";
const consume=readFileSync(new URL("../../supabase/migrations/20260926232500_fix_mcp_action_authorization_rpc_ambiguity.sql",import.meta.url),"utf8");
const probe=readFileSync(new URL("../../supabase/migrations/20260927023500_mcp_action_authorization_consumption_invariant.sql",import.meta.url),"utf8");
test("M10 concurrent consumers serialize on the same authorization row",()=>{assert.match(consume,/for update/i);assert.match(consume,/where a\.authorization_id=r\.authorization_id and a\.state='available'/);});
test("M10 loser observes persisted winner through consumed replay path",()=>{assert.match(consume,/if r\.state='consumed'/);assert.match(consume,/replay_same_result/);assert.match(consume,/r\.consumption_id/);assert.match(consume,/r\.consumed_at/);});
test("M10 invariant probe is service-only and checks consumed pair completeness",()=>{assert.match(probe,/consumption_id is not null and a\.consumed_at is not null/i);assert.match(probe,/revoke all[\s\S]*authenticated/i);assert.match(probe,/grant execute[\s\S]*service_role/i);});
