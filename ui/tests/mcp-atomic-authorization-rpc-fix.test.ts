import assert from"node:assert/strict";import test from"node:test";import{readFileSync}from"node:fs";
const sql=readFileSync(new URL("../../supabase/migrations/20260926232500_fix_mcp_action_authorization_rpc_ambiguity.sql",import.meta.url),"utf8");
test("M10 consume RPC qualifies state predicates against authorization table alias",()=>{assert.match(sql,/update public\.mcp_action_authorizations a set state='consumed'/);assert.match(sql,/a\.state='available'/);assert.match(sql,/select a\.\* into r/);});
