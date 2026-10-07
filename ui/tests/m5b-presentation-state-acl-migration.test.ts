import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const originalPath = new URL("../../supabase/migrations/20261004202000_m5b_action_notification_state.sql", import.meta.url);
const hardeningPath = new URL("../../supabase/migrations/20261007033258_m5b_action_notification_state_acl_hardening.sql", import.meta.url);
const original = readFileSync(originalPath, "utf8");
const hardening = readFileSync(hardeningPath, "utf8");

test("the already-applied M4.4 migration remains byte-identical", () => {
  assert.equal(createHash("sha256").update(original).digest("hex"), "b3842d0463eeee30c411f2755494faed5567f10be2ca208764adb7f35fa77f78");
});

test("the forward migration removes default grants before granting the exact runtime contract", () => {
  assert.match(hardening, /revoke all privileges on table public\.mcp_action_notification_states\s+from service_role;/i);
  assert.match(hardening, /revoke all privileges on table public\.mcp_action_notification_states\s+from public, anon, authenticated, authenticator;/i);
  assert.match(hardening, /grant select, insert, update on table public\.mcp_action_notification_states\s+to service_role;/i);
  assert.doesNotMatch(hardening, /grant[^;]*(delete|truncate|references|trigger|maintain)/i);
});

test("the repair is ACL-only and does not change global defaults or table semantics", () => {
  assert.doesNotMatch(hardening, /alter default privileges|create policy|drop policy|enable row level security|disable row level security/i);
  assert.doesNotMatch(hardening, /\b(?:alter|create|drop|truncate|delete|insert|update)\s+(?:table|from|into|public\.)/i);
  assert.doesNotMatch(hardening, /mcp_action_(?:intents|confirmations|authorizations|execution_results)/i);
});
